// Binge Addon — stream fan-out (design §7.1).
// v1 sources: Torrentio + Comet + HdHub. MediaFusion DROPPED (see DEPLOY.md).
// Per-source timeout 3.5 s, hard overall deadline ~7 s returning partials.
// A failing source never fails the whole response; outcomes are logged
// server-side (source, status, count, latency).

'use strict';

const { processSourceStreams, compareParsed, compareCam, dedupe } = require('./parse');

const PER_SOURCE_TIMEOUT_MS = 3500;
const OVERALL_DEADLINE_MS = 7000;
const MAX_INPUT_PER_SOURCE = 150;
const CIRCUIT_BREAKER_MINUTES = 5;
const CIRCUIT_BREAKER_FAILURES = 3;

const HDHUB_CONFIG =
  'eyJ0b3Jib3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAiLCJzb3J0IjoiZGVzYyJ9';

const SOURCES = [
  { name: 'torrentio', base: 'https://torrentio.strem.fun' },
  { name: 'comet', base: 'https://comet.elfhosted.com' },
  { name: 'hdhub', base: `https://hdhub.thevolecitor.qzz.io/${HDHUB_CONFIG}` },
];

// In-memory circuit breaker (per instance; Vercel instances are short-lived,
// so this only protects a hot instance from burning 3.5 s per request).
const breaker = new Map(); // name -> { failures, blockedUntil }

function disabledSources() {
  const raw = process.env.DISABLE_SOURCES || '';
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function isBlocked(name) {
  const b = breaker.get(name);
  if (!b) return false;
  if (b.blockedUntil && Date.now() < b.blockedUntil) return true;
  if (b.blockedUntil && Date.now() >= b.blockedUntil) {
    breaker.set(name, { failures: 0, blockedUntil: 0 });
  }
  return false;
}

function recordOutcome(name, ok) {
  const b = breaker.get(name) || { failures: 0, blockedUntil: 0 };
  if (ok) {
    breaker.set(name, { failures: 0, blockedUntil: 0 });
  } else {
    b.failures += 1;
    if (b.failures >= CIRCUIT_BREAKER_FAILURES) {
      b.blockedUntil = Date.now() + CIRCUIT_BREAKER_MINUTES * 60 * 1000;
      console.log(`[binge-addon] circuit-breaker: ${name} blocked for ${CIRCUIT_BREAKER_MINUTES} min after ${b.failures} consecutive failures`);
    }
    breaker.set(name, b);
  }
}

async function fetchSource(source, type, id, opts = {}) {
  const started = Date.now();
  const url = `${source.base}/stream/${type}/${id}.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_SOURCE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'BingeAddon/1.0.1 (Stremio addon)' },
    });
    const latency = Date.now() - started;
    if (res.status !== 200) {
      console.log(`[binge-addon] source=${source.name} status=${res.status} count=0 latencyMs=${latency}`);
      recordOutcome(source.name, false);
      return { name: source.name, ok: false, streams: [], cam: [], status: res.status, latencyMs: latency };
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.log(`[binge-addon] source=${source.name} status=200 count=0 latencyMs=${latency} error=bad-json`);
      recordOutcome(source.name, false);
      return { name: source.name, ok: false, streams: [], cam: [], status: 200, latencyMs: latency };
    }
    if (!json || !Array.isArray(json.streams)) {
      console.log(`[binge-addon] source=${source.name} status=200 count=0 latencyMs=${latency} error=bad-shape`);
      recordOutcome(source.name, false);
      return { name: source.name, ok: false, streams: [], cam: [], status: 200, latencyMs: latency };
    }
    const input = json.streams.slice(0, MAX_INPUT_PER_SOURCE);
    const { kept, cam, dropped } = processSourceStreams(source.name, input, opts);
    console.log(`[binge-addon] source=${source.name} status=200 raw=${json.streams.length} kept=${kept.length} cam=${cam.length} dropped=${JSON.stringify(dropped)} latencyMs=${latency}`);
    recordOutcome(source.name, true);
    return { name: source.name, ok: true, streams: kept, cam, status: 200, latencyMs: latency };
  } catch (e) {
    const latency = Date.now() - started;
    const reason = e.name === 'AbortError' ? 'timeout' : String(e.message || e);
    console.log(`[binge-addon] source=${source.name} status=error count=0 latencyMs=${latency} error=${reason}`);
    recordOutcome(source.name, false);
    return { name: source.name, ok: false, streams: [], cam: [], status: 'error', latencyMs: latency };
  } finally {
    clearTimeout(timer);
  }
}

// Fan-out with a hard overall deadline: at ~7 s, return partials collected
// so far regardless of pending sources (§7.1).
async function fetchAllStreams(type, id, opts = {}) {
  // v2.1.0: opts.disabled (Set of source names from the dashboard config)
  // adds to DISABLE_SOURCES; opts.maxRes (720|1080) caps resolution.
  const disabled = new Set(disabledSources());
  for (const n of (opts.disabled || [])) disabled.add(n);
  const active = SOURCES.filter((s) => !disabled.has(s.name) && !isBlocked(s.name));
  for (const s of SOURCES) {
    if (disabled.has(s.name)) console.log(`[binge-addon] source=${s.name} skipped (DISABLE_SOURCES)`);
    else if (isBlocked(s.name)) console.log(`[binge-addon] source=${s.name} skipped (circuit-breaker)`);
  }
  const collected = [];
  const pending = active.map((s) =>
    fetchSource(s, type, id, opts).then((r) => { collected.push(r); })
  );
  const deadline = new Promise((resolve) => setTimeout(resolve, OVERALL_DEADLINE_MS));
  await Promise.race([Promise.allSettled(pending), deadline]);
  const total = collected.reduce((n, r) => n + r.streams.length, 0);
  if (collected.length === 0) {
    console.log(`[binge-addon] stream ${type}/${id}: ALL sources failed or timed out`);
  } else {
    console.log(`[binge-addon] stream ${type}/${id}: ${collected.length}/${SOURCES.length} sources answered, ${total} streams before merge`);
  }
  return collected;
}

module.exports = { fetchAllStreams, mergeStreamResults, SOURCES, PER_SOURCE_TIMEOUT_MS, OVERALL_DEADLINE_MS };

// Merge per-source results into the final stream list (v1.1.2 CAM rule):
// clean streams from ALL sources first; the CAM pool is used ONLY when
// the merged clean list is empty AFTER dedupe. Returns
// { parsed: [parsed], usedCam: bool } — callers format + log the path.
function mergeStreamResults(results, cap) {
  const clean = [];
  const cam = [];
  for (const r of results || []) {
    if (r.streams) clean.push(...r.streams);
    if (r.cam) cam.push(...r.cam);
  }
  clean.sort(compareParsed);
  const dedupedClean = dedupe(clean).slice(0, cap);
  if (dedupedClean.length) return { parsed: dedupedClean, usedCam: false };
  cam.sort(compareCam);
  const dedupedCam = dedupe(cam).slice(0, cap);
  return { parsed: dedupedCam, usedCam: true };
}
