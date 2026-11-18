// Binge Addon v1.0.4 — badge-pack rule test.
// Loads app/lib/badges.json (or the LIVE pack when BADGES_URL is set),
// applies every pattern to REAL live stream titles+descriptions
// (title + description combined, as Nuvio does), first match per group
// wins. Exits non-zero on any failed assertion.
// Kept under tests/ so it never ships in app/.
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://binge-addon-httpbasant2-9067s-projects.vercel.app';
// Set BADGES_URL to test the LIVE served pack:
//   BADGES_URL=https://binge-addon-httpbasant2-9067s-projects.vercel.app/badges.json node tests/test-badges.js
const BADGES_URL = process.env.BADGES_URL || null;

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GET ${url} -> HTTP ${r.status}`);
  return r.json();
}

(async () => {
  const pack = BADGES_URL
    ? await getJSON(BADGES_URL)
    : JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'lib', 'badges.json'), 'utf8'));
  console.log(`pack source: ${BADGES_URL || 'local app/lib/badges.json'}`);

  // --- 1. Schema validation -----------------------------------------------
  check(Object.keys(pack).sort().join(',') === 'filters,groups', 'top-level keys are exactly {groups, filters}');
  check(Array.isArray(pack.groups) && pack.groups.length === 7, `7 groups (got ${pack.groups.length})`);
  check(!pack.groups.some((g) => g.id === 'streaming'), 'no Streaming group');
  const groupIds = new Set(pack.groups.map((g) => g.id));
  for (const g of pack.groups) {
    check(typeof g.id === 'string' && g.id && typeof g.name === 'string' && g.name
      && /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(g.color)
      && /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(g.borderColor)
      && typeof g.isExpanded === 'boolean', `group ${g.id} fields ok`);
  }
  const ids = new Set();
  let no4k = true;
  for (const f of pack.filters) {
    check(f.type === 'filter' && typeof f.id === 'string' && f.id && !ids.has(f.id), `filter id unique: ${f.id}`);
    ids.add(f.id);
    check(groupIds.has(f.groupId), `filter ${f.id} groupId ${f.groupId} exists`);
    check(typeof f.name === 'string' && f.name && typeof f.pattern === 'string' && f.pattern
      && f.imageURL === '' && f.isEnabled === true
      && f.tagStyle === 'filled and bordered', `filter ${f.id} fields ok (text-only, enabled)`);
    if (/4k|2160/i.test(f.name) || /4k|2160/i.test(f.pattern)) no4k = false;
  }
  check(no4k, 'no 4K / 2160p badge anywhere in the pack');
  check(pack.filters.length === 38, `38 badges total (got ${pack.filters.length})`);

  // --- 2. Compile patterns (strip the (?i) prefix -> 'i' flag; JS RegExp
  // has no inline (?i) flag, Nuvio's badge engine handles the prefix) ---
  const compiled = pack.filters.map((f) => {
    let src = f.pattern;
    let flags = '';
    if (src.startsWith('(?i)')) { src = src.slice(4); flags = 'i'; }
    let re;
    try { re = new RegExp(src, flags); } catch (e) { check(false, `pattern compiles: ${f.id} (${e.message})`); }
    return { ...f, re };
  });
  check(compiled.every((f) => f.re), 'all patterns compile');
  const byId = Object.fromEntries(compiled.map((f) => [f.id, f]));
  function matches(id, text) { return byId[id].re.test(text); }
  // First match per group wins (badges evaluated in array order).
  function badgesFor(text) {
    const out = {};
    for (const f of compiled) {
      if (!f.isEnabled) continue;
      if (out[f.groupId]) continue;
      if (f.re.test(text)) out[f.groupId] = f.name;
    }
    return out;
  }

  // --- 3. Synthetic trap checks (boundary-aware matching) -----------------
  check(!matches('hdr', 'HDRip'), "HDR does NOT fire on 'HDRip' alone");
  check(matches('hdr', 'HDR'), "HDR fires on standalone 'HDR'");
  check(matches('hdr10plus', 'HDR10+') && !matches('hdr10', 'HDR10+') && !matches('hdr', 'HDR10+'), "HDR10+ suppresses HDR10/HDR");
  check(matches('hdr10', 'HDR10') && !matches('hdr', 'HDR10'), 'HDR10 fires, HDR suppressed');
  check(!matches('dolby-vision', 'DVDScr'), "DV does NOT fire on 'DVDScr'");
  check(!matches('dolby-vision', 'DVDRip'), "DV does NOT fire on 'DVDRip'");
  check(matches('dolby-vision', 'DV'), "DV fires on standalone 'DV'");
  check(matches('dolby-vision', 'Dolby Vision'), "Dolby Vision fires on 'Dolby Vision'");
  check(matches('dd-plus', 'DD+5.1') && !matches('dd', 'DD+5.1'), "DD+ fires, DD suppressed on 'DD+5.1'");
  check(matches('dd-plus', 'DDP 5.1') && !matches('dd', 'DDP 5.1'), "DDP maps to DD+, DD suppressed");
  check(matches('dd', 'DD 5.1') && !matches('dd-plus', 'DD 5.1'), "DD fires on standalone 'DD 5.1'");
  check(matches('dts-hd-ma', 'DTS-HD MA') && !matches('dts', 'DTS-HD MA'), 'DTS-HD MA fires, DTS suppressed');
  check(matches('dts-hd-ma', 'DTS-HDMA'), 'DTS-HDMA (no space) maps to DTS-HD MA');
  check(matches('dts', 'DTS') && !matches('dts-hd-ma', 'DTS'), 'DTS fires on standalone DTS');
  check(matches('bluray', 'BluRay') && matches('remux', 'REMUX'), 'REMUX + BluRay both match raw');
  check(badgesFor('REMUX BluRay').quality === 'REMUX', 'Quality group winner: REMUX before BluRay');
  check(matches('lang-hindi', '[Tam + Hin + Mal + Kan]'), "Hindi fires on title token 'Hin'");
  check(matches('lang-tamil', '[Tam + Hin + Mal + Kan]'), "Tamil fires on title token 'Tam'");
  check(matches('lang-malayalam', '[Tam + Hin + Mal + Kan]'), "Malayalam fires on title token 'Mal'");
  check(matches('lang-kannada', '[Tam + Hin + Mal + Kan]'), "Kannada fires on title token 'Kan'");
  check(matches('lang-telugu', 'Telugu'), "Telugu fires on 'Telugu'");
  check(matches('lang-english', 'Hindi + English'), "English fires on description words 'Hindi + English'");
  check(matches('lang-hindi', 'Hindi + English'), "Hindi fires on description words 'Hindi + English'");
  check(matches('bit10', '10-Bit') && matches('bit10', '10bit'), '10-Bit fires on 10-Bit / 10bit');
  check(matches('ch-5-1', 'DD+5.1'), '5.1 fires inside DD+5.1');
  check(!matches('ch-5-1', '5.10'), '5.1 does NOT fire on 5.10');

  // --- 4. Real live titles --------------------------------------------------
  // The Odyssey tt id from the live Global Trending movie catalog.
  const trending = await getJSON(`${BASE}/catalog/movie/global-trending-movie.json`);
  const odyssey = (trending.metas || []).find((m) => /odyssey/i.test(m.name || ''));
  check(!!odyssey, `The Odyssey found in live Global Trending catalog (${odyssey ? odyssey.id : 'none'})`);
  const targets = [
    ['Ranabaali', 'tt32324552'],
    ['Dangal', 'tt5074352'],
  ];
  if (odyssey) targets.push(['The Odyssey', odyssey.id]);

  const titles = [];
  for (const [label, tt] of targets) {
    const data = await getJSON(`${BASE}/stream/movie/${tt}.json`);
    const streams = data.streams || [];
    console.log(`\n--- ${label} (${tt}): ${streams.length} streams`);
    check(streams.length > 0, `${label} returns streams`);
    for (const s of streams) {
      titles.push({ label, text: `${s.name || ''}\n${s.description || ''}` });
    }
  }
  check(titles.length >= 10, `at least 10 real titles tested (got ${titles.length})`);

  // Per-title badge lists + trap assertions on real text.
  const seen = new Set();
  for (const t of titles) {
    const b = badgesFor(t.text);
    for (const v of Object.values(b)) seen.add(v);
    const oneLine = t.text.replace(/\n/g, ' | ');
    console.log(`[${t.label}] ${JSON.stringify(b)} :: ${oneLine.slice(0, 150)}`);
    if (/hdrip/i.test(t.text) && !/\bhdr(?![a-z0-9])/i.test(t.text) && !/hdr10/i.test(t.text)) {
      check(b.visual !== 'HDR', `no HDR from HDRip alone :: ${oneLine.slice(0, 80)}`);
    }
    if (/dvdscr|dvdrip/i.test(t.text) && !/\bdv\b/i.test(t.text) && !/dolby\s+vision/i.test(t.text)) {
      check(b.visual !== 'Dolby Vision', `no DV from DVDScr/DVDRip alone :: ${oneLine.slice(0, 80)}`);
    }
    if (/dd\+|ddp/i.test(t.text)) {
      // DD+ present: the audio winner must never be plain DD (a higher
      // audio badge — Atmos/TrueHD/DTS-HD MA — legitimately wins instead).
      if (b.audio) check(b.audio !== 'DD', `audio winner is not DD on a DD+ title :: ${oneLine.slice(0, 80)}`);
    }
    if (/dts-hd\s*ma/i.test(t.text) && b.audio) {
      check(b.audio !== 'DTS', `DTS-HD MA title never shows plain DTS :: ${oneLine.slice(0, 80)}`);
    }
  }
  for (const need of ['1080p', 'HEVC', 'BluRay', 'WEB-DL', 'DD+', 'Hindi', 'English']) {
    check(seen.has(need), `at least one real title gets ${need}`);
  }
  console.log(`\nBadges seen across real titles: ${[...seen].sort().join(', ')}`);
  console.log(failures === 0 ? '\nALL CHECKS PASS' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
