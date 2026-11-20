// Binge Addon — addon server (design §4–§9).
// Node.js + stremio-addon-sdk, built fresh. Vercel entry point is
// api/index.js (re-exports the Express app below); local dev runs this
// file directly (npm start, PORT env, default 7000).
//
// v2.1.0: in-addon meta handler (fixes the Jailer 2 tap "No addon
// provides meta"), dynamic manifest from Blob config (admin dashboard
// enable/rename/reorder), stream toggles + max-quality knob from config.
// Display name is "Binge Addon" (final name, 18 Nov 2026 — earlier in
// v2.1.0 it was briefly "Basant Streams"; his name must not appear in
// it). Manifest id stays com.bharatstreams so the existing Nuvio
// install just updates on refresh — no reinstall needed.

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const { MANIFEST } = require('./lib/manifest');
const { fetchAllStreams, mergeStreamResults } = require('./lib/sources');
const { formatStream, compareWithProfile, compareCamWithProfile } = require('./lib/parse');
const { readCatalog, readCatalogMeta, readIdMap } = require('./lib/store');
const { resolveMeta } = require('./lib/meta-fetch');
const { searchCatalogs } = require('./lib/search');
const { readConfig, writeConfig, effectiveCatalogs, normalizeConfig } = require('./lib/config');
const { runWithRequest, getProfile } = require('./lib/device');
const { readProfiles, writeProfiles, resolveProfile, createCustomProfile } = require('./lib/profiles');

const STREAM_CAP = 40;
const ADDON_NAME = 'binge-addon';
const VERSION = '1.6.1';

const builder = new addonBuilder(MANIFEST);

// --- Catalog handler (§6.3): reads prebuilt rows from Vercel Blob.
// A catalog disabled in the dashboard serves { metas: [] }.
// v1.1.7: a search request (extra.search, the Stremio path-extra form
// `/catalog/<type>/<id>/search=<query>.json`) queries TMDB LIVE via
// lib/search.js — NOT the fixed rows, which may not contain the title
// at all (e.g. Reacher). Empty/unknown queries return empty metas,
// never the full row. The no-search path below is byte-identical to
// v1.1.6 behaviour.
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  const cfg = await readConfig();
  if (cfg.catalogs && cfg.catalogs[id] && cfg.catalogs[id].enabled === false) {
    return { metas: [], cacheMaxAge: 3600, staleError: 3600 };
  }
  const q = extra && typeof extra.search === 'string' ? extra.search.trim() : '';
  if (q) {
    const { metas } = await searchCatalogs(type, q);
    return { metas, cacheMaxAge: 3600, staleError: 3600 };
  }
  const metas = await readCatalog(id);
  if (!metas) {
    return { metas: [], cacheMaxAge: 3600, staleError: 3600 };
  }
  // v1.5.9 (20 Nov 2026): 5-min catalog TTL — the 24h cacheMaxAge kept
  // Nuvio showing yesterday's rows (reinstall was the only escape).
  return { metas, cacheMaxAge: 300, staleError: 300 };
});

// --- Stream handler (§7): tt… ids only, parallel fan-out, 7 s deadline.
// Source on/off come from the dashboard config; the resolution ceiling
// and the sort order come from the request's device profile (v1.2.7).
builder.defineStreamHandler(async ({ type, id }) => {
  if (!/^tt\d+(:\d+:\d+)?$/.test(id)) {
    console.log(`[binge-addon] stream ${type}/${id}: non-tt id, returning empty`);
    return { streams: [] };
  }
  const cfg = await readConfig();
  const profiles = await readProfiles();
  let profileId = getProfile();
  let prof = resolveProfile(profiles, profileId);
  if (!prof) {
    // Unknown custom slug (profile deleted after install): fall back
    // to desktop rather than failing the request.
    console.log(`[binge-addon] stream ${type}/${id}: unknown profile ${profileId}, falling back to desktop`);
    profileId = 'desktop';
    prof = resolveProfile(profiles, 'desktop');
  }
  const disabled = new Set();
  if (cfg.streams) {
    if (cfg.streams.torrentio === false) disabled.add('torrentio');
    if (cfg.streams.comet === false) disabled.add('comet');
    if (cfg.streams.hdhub === false) disabled.add('hdhub');
  }
  // v1.2.7: per-profile ceiling from profiles.json. The legacy
  // dashboard maxQuality knob (720p) caps the DESKTOP profile only —
  // phone/TV are governed by their own profile maxRes.
  let maxRes = prof.maxRes;
  if (profileId === 'desktop' && cfg.streams && cfg.streams.maxQuality === '720p') maxRes = 720;
  const results = await fetchAllStreams(type, id, { disabled, maxRes, profileCfg: prof });
  // v1.1.2: CAM streams appear ONLY when zero clean streams survive
  // across ALL sources (mergeStreamResults enforces the rule).
  const { parsed, usedCam } = mergeStreamResults(results, STREAM_CAP, {
    compare: (a, b) => compareWithProfile(a, b, prof),
    compareCam: (a, b) => compareCamWithProfile(a, b, prof),
  });
  // v1.2.1: the display format is the locked v1.1.3 Telegram shape
  // again (name line + Quality/Audio/Size) — formatStream takes no
  // options and reads no User-Agent, so the same text goes to every
  // client (Windows, Android, none). The v1.1.8 UA middleware is gone;
  // the v1.2.7 middleware only detects the device profile.
  const streams = parsed.map(formatStream);
  console.log(`[binge-addon] stream ${type}/${id} profile=${profileId}: returning ${streams.length} ${usedCam ? 'CAM fallback' : 'clean'} streams`);
  return { streams };
});

// --- Meta handler (v2.1.0, fallbacks v1.1.9 + v1.2.0): resolves tt id
// -> TMDB id via the persisted Blob id map (catalogs/_idmap.json)
// FIRST; when the map has no entry (title not in our catalogs — e.g.
// Preacher tt5016504), falls back to TMDB /find
// (external_source=imdb_id), respecting the requested type, then TMDB
// detail + credits + images; if TMDB has no answer either, falls back
// to Cinemeta's free keyless meta endpoint (v1.2.0, basant's ask).
// Only when all three miss — or without the TMDB key — returns an
// empty meta; Nuvio then falls back to any other installed meta addon.
let reverseIdMapCache = null; // { at, map: { tt...: tmdbId } }
async function tmdbIdForImdb(imdbId) {
  if (!reverseIdMapCache || Date.now() - reverseIdMapCache.at > 5 * 60 * 1000) {
    const idMap = await readIdMap();
    const rev = {};
    for (const [k, v] of Object.entries(idMap)) {
      if (typeof k === 'string' && k.startsWith('tmdb:') && typeof v === 'string') rev[v] = k.slice(5);
    }
    reverseIdMapCache = { at: Date.now(), map: rev };
  }
  return reverseIdMapCache.map[imdbId] || null;
}

builder.defineMetaHandler(async ({ type, id }) => {
  if (!/^tt\d+$/.test(id)) return { meta: null };
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.log('[binge-addon] meta: no TMDB_API_KEY');
    return { meta: null };
  }
  const { meta, tmdbId, via, error } = await resolveMeta(id, type, {
    key,
    fetchFn: fetch,
    tmdbIdForImdb,
  });
  if (!meta) {
    console.log(`[binge-addon] meta ${type}/${id}: unresolved (no id-map entry, TMDB /find + Cinemeta both missed)${error ? ` — ${error}` : ''}`);
    return { meta: null };
  }
  // v1.1.9: cache a find-resolved mapping in-memory so the next tap on
  // the same title skips the /find call. Deliberately NOT written back
  // to Blob _idmap.json — the daily rebuild regenerates that map from
  // catalog titles only, so a write-back would be overwritten anyway,
  // and a bad write could corrupt the map for every title.
  // (A Cinemeta-resolved title has no TMDB id to cache — nothing to do.)
  if (via === 'find' && reverseIdMapCache) {
    reverseIdMapCache.map[id] = String(tmdbId);
    console.log(`[binge-addon] meta ${type}/${id}: resolved via TMDB /find -> tmdb:${tmdbId}`);
  } else if (via === 'cinemeta') {
    console.log(`[binge-addon] meta ${type}/${id}: resolved via Cinemeta fallback`);
  }
  return { meta, cacheMaxAge: 86400, staleError: 86400 };
});

const app = express();
app.use(express.json({ limit: '200kb' }));

// --- Device profiles (v1.2.7): one smart addon. A /phone/..., /tv/...
// or /p/<slug>/... prefix forces that profile for the whole request;
// otherwise the client's User-Agent decides (unknown/missing UA ->
// desktop). The prefix is stripped before routing so the SDK router
// sees the plain paths; the forced profile rides in AsyncLocalStorage
// (the v1.1.8 pattern — the SDK router never passes the raw request
// to a handler). Stremio resolves addon URLs relative to the manifest
// URL, so an install from /phone/manifest.json sends every later
// request (streams, catalogs, meta) under /phone/ automatically.
app.use((req, res, next) => {
  let forced = null;
  const url = req.url || '';
  const m = url.match(/^\/(phone|tv)(?=\/|$)/);
  const pm = url.match(/^\/p\/([a-z0-9][a-z0-9-]{0,40})(?=\/|$)/);
  if (m) {
    forced = m[1];
    req.url = url.replace(/^\/(phone|tv)(?=\/|$)/, '') || '/';
  } else if (pm) {
    forced = `custom:${pm[1]}`;
    req.url = url.replace(/^\/p\/[a-z0-9][a-z0-9-]{0,40}(?=\/|$)/, '') || '/';
  }
  runWithRequest(req, forced, () => next());
});

// --- Dynamic manifest (v2.1.0): the SDK router would serve the static
// manifest; this route runs first and applies the dashboard config
// (disabled catalogs hidden, renames, reorder). Stays < 8 KB.
// v1.2.7: a forced profile renames the manifest so installs are
// distinguishable in Nuvio ("Binge Addon — Phone" / "— TV" / custom
// name). The manifest id stays com.bharatstreams on every profile —
// the URL is what makes an install distinct. The main /manifest.json
// keeps the plain name regardless of the detected device.
app.get('/manifest.json', async (req, res) => {
  try {
    const cfg = await readConfig();
    const profileId = getProfile();
    const manifest = { ...MANIFEST, catalogs: effectiveCatalogs(cfg) };
    if (profileId === 'phone') manifest.name = 'Binge Addon — Phone';
    else if (profileId === 'tv') manifest.name = 'Binge Addon — TV';
    else if (typeof profileId === 'string' && profileId.startsWith('custom:')) {
      const profiles = await readProfiles();
      const prof = resolveProfile(profiles, profileId);
      if (!prof) return res.status(404).json({ ok: false, error: 'unknown profile' });
      manifest.name = prof.name || 'Binge Addon';
    }
    res.json(manifest);
  } catch (e) {
    res.json(MANIFEST);
  }
});

// --- Badge pack (v1.0.4): Nuvio/Fusion badges served as static JSON.
// v1.0.7: Onyx restyle — same 23 badges, fill #15171C, hairline
// white-14% border, tagStyle "filled"; 720p/480p PNGs use frosted fills
// (see scripts/render-badges-v107.py). Language patterns gained
// native-script alternations; every other pattern is v1.0.6-identical.
// /badges/:id.png route below (PNGs rendered in-app, served by us).
// Nuvio snapshots the file on import, so later edits need a re-import.
app.get('/badges.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'lib', 'badges.json'));
});

// --- Badge images (v1.0.5+): GET /badges/:id.png serves the rendered PNG
// for one badge. SECURITY: only ids listed in lib/badges.json are ever
// served (allowlist built at startup); anything else is a 404. The id
// is validated against the allowlist BEFORE any path is built, and the
// served path is fixed (lib/badge-images/<id>.png) — raw user input is
// never joined into a filesystem path, so no traversal is possible.
let BADGE_IDS = new Set();
try {
  const pack = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'badges.json'), 'utf8'));
  for (const f of pack.filters || []) if (f && typeof f.id === 'string') BADGE_IDS.add(f.id);
} catch (e) {
  console.log(`[binge-addon] badge allowlist failed to load: ${e.message}`);
}
app.get('/badges/:id.png', (req, res) => {
  const id = req.params.id;
  if (!BADGE_IDS.has(id)) return res.status(404).json({ ok: false, error: 'badge not found' });
  res.type('image/png');
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(__dirname, 'lib', 'badge-images', `${id}.png`));
});

// --- Admin dashboard (v2.1.0): same project, no new hosting.
// Password gate via ADMIN_PASSWORD env var; the password is sent as the
// X-Admin-Password header and never logged, stored, or displayed.
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ ok: false, error: 'admin password not configured' });
  if (req.headers['x-admin-password'] !== expected) {
    return res.status(401).json({ ok: false, error: 'wrong password' });
  }
  next();
}

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'lib', 'admin.html'));
});

app.get('/admin/api/config', requireAdmin, async (req, res) => {
  const cfg = await readConfig();
  res.json({ ok: true, config: cfg });
});

app.post('/admin/api/config', requireAdmin, async (req, res) => {
  try {
    const saved = await writeConfig(req.body || {});
    res.json({ ok: true, config: saved });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// --- Device profiles API (v1.2.7): the dashboard sequence editor and
// link generator. profiles.json is a SEPARATE Blob file — config.json
// is never touched here, so its shape cannot break. The server picks
// up a saved profiles.json within its 60 s cache.
app.get('/admin/api/profiles', requireAdmin, async (req, res) => {
  const profiles = await readProfiles();
  res.json({ ok: true, profiles });
});

app.post('/admin/api/profiles', requireAdmin, async (req, res) => {
  try {
    const saved = await writeProfiles(req.body || {});
    res.json({ ok: true, profiles: saved });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// Link generator: create a custom profile (a copy of a built-in
// profile's sequence, editable in the dashboard afterwards) and return
// its install link. The URL is built from the request host (the
// dashboard runs on the same origin).
app.post('/admin/api/profiles/link', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const profiles = await readProfiles();
    const { slug, entry } = createCustomProfile(profiles, { name: body.name, base: body.base });
    profiles.custom = profiles.custom || {};
    profiles.custom[slug] = entry;
    const saved = await writeProfiles(profiles);
    const host = req.get('host') || 'binge-addon-httpbasant2-9067s-projects.vercel.app';
    res.json({
      ok: true, slug, name: entry.name, base: entry.base,
      path: `/p/${slug}/manifest.json`,
      url: `https://${host}/p/${slug}/manifest.json`,
      profiles: saved,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// v1.0.9: in-memory cache for the _summary.json manifest (60s TTL).
let summaryCache = { at: 0, data: null };

app.get('/admin/api/status', requireAdmin, async (req, res) => {
  try {
    const cfg = await readConfig();
    const catalogs = [];
    let lastBuiltAt = null;

    // Primary: the bundle's embedded summary (v1.2.9 — the rebuild
    // writes _summary.json no more; it lives inside _bundle.json).
    // Then the legacy _summary.json (frozen since the v1.2.9 rebuild),
    // then the per-row fallback below. All reads are SIMPLE requests.
    let summary = null;
    if (summaryCache.data && Date.now() - summaryCache.at < 60 * 1000) {
      summary = summaryCache.data;
    } else {
      try {
        const { readBundle } = require('./lib/bundle');
        const bundle = await readBundle();
        if (bundle && bundle.summary && bundle.summary.catalogs) {
          summary = bundle.summary;
          summaryCache = { at: Date.now(), data: summary };
        }
      } catch (err) {
        console.log(`[binge-addon] bundle summary read error: ${err.message}`);
      }
      if (!summary) {
        try {
          const { readBlobJson } = require('./lib/blob');
          const json = await readBlobJson('catalogs/_summary.json');
          if (json) {
            summary = json;
            summaryCache = { at: Date.now(), data: summary };
          }
        } catch (err) {
          console.log(`[binge-addon] summary manifest read error: ${err.message}`);
        }
      }
    }

    if (summary && summary.catalogs) {
      lastBuiltAt = summary.builtAt || null;
      const allIds = Object.keys(cfg.catalogs || {});
      for (const id of allIds) {
        const c = cfg.catalogs[id] || {};
        const type = id.endsWith('-series') ? 'series' : 'movie';
        const name = c.name || id;
        const s = summary.catalogs[id];
        if (s && c.enabled !== false) {
          catalogs.push({
            id,
            type,
            name,
            count: typeof s.count === 'number' ? s.count : 0,
            top: Array.isArray(s.top) ? s.top : [],
            builtAt: s.builtAt || summary.builtAt || null,
          });
        } else {
          catalogs.push({
            id,
            type,
            name,
            count: 0,
            top: [],
            builtAt: null,
            disabled: true,
          });
        }
      }
    } else {
      // Fallback: read each catalog row directly by public URL via the
      // store's 5-min cache (readCatalogMeta), no prefix list().
      // v1.2.8: the old list('catalogs/') + fetch-all fallback is gone —
      // the row ids come from config, and each read is a SIMPLE request
      // with list() fallback inside readBlobJson.
      const blobMap = new Map();
      await Promise.allSettled(
        Object.keys(cfg.catalogs || {}).map(async (id) => {
          try {
            const file = await readCatalogMeta(id);
            if (file) blobMap.set(id, { metas: file.metas, builtAt: file.builtAt || null });
          } catch (e) {}
        })
      );

      const allIds = Object.keys(cfg.catalogs || {});
      for (const id of allIds) {
        const c = cfg.catalogs[id] || {};
        const type = id.endsWith('-series') ? 'series' : 'movie';
        const name = c.name || id;
        const file = blobMap.get(id);
        if (file && c.enabled !== false) {
          const metas = file.metas;
          if (file.builtAt && (!lastBuiltAt || file.builtAt > lastBuiltAt)) {
            lastBuiltAt = file.builtAt;
          }
          catalogs.push({
            id,
            type,
            name,
            count: metas.length,
            top: metas.slice(0, 3).map((m) => m.name),
            builtAt: file.builtAt,
          });
        } else {
          catalogs.push({
            id,
            type,
            name,
            count: 0,
            top: [],
            builtAt: null,
            disabled: true,
          });
        }
      }
    }

    catalogs.sort((a, b) => (cfg.catalogs[a.id]?.order ?? 999) - (cfg.catalogs[b.id]?.order ?? 999));

    res.json({
      ok: true,
      version: VERSION,
      addon: ADDON_NAME,
      project: 'binge-addon',
      projectUrl: 'https://vercel.com/httpbasant2-9067s-projects/binge-addon',
      liveUrl: 'https://binge-addon-httpbasant2-9067s-projects.vercel.app',
      tmdbKeySet: !!process.env.TMDB_API_KEY,
      blobSet: !!process.env.BLOB_READ_WRITE_TOKEN,
      lastBuiltAt,
      nextCron: 'Daily 05:00 UTC = 10:30 IST',
      catalogs,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// --- Cron rebuild endpoint: GET/POST /api/cron/rebuild (daily Vercel Cron).
// Enforces Bearer CRON_SECRET authentication strictly; no unverified headers.
app.all('/api/cron/rebuild', async (req, res) => {
  const auth = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized cron trigger' });
  }
  try {
    const { main } = require('./scripts/build-catalogs');
    const result = await main();
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error(`[cron/rebuild] FAILED: ${e.message}`);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// --- Admin rebuild endpoint: POST /api/admin/rebuild (manual dashboard rebuild).
// Uses dedicated rebuild handler with X-Admin-Password gate and 300s budget.
app.all('/api/admin/rebuild', require('./api/admin/rebuild'));

// --- Catalog search, `?search=` query form (v1.1.7).
// The SDK router only parses search from the path-extra segment
// (`/catalog/<type>/<id>/search=<query>.json`); a plain query string
// (`/catalog/<type>/<id>.json?search=<query>`) would otherwise reach
// the handler as a feed request and return the unfiltered row —
// exactly the bug basant reported. This route runs BEFORE the SDK
// router, handles only requests carrying a non-empty `search` param
// (disabled catalogs still serve empty), and passes everything else
// through with next() so the feed path is untouched.
app.get('/catalog/:type/:id.json', async (req, res, next) => {
  const q = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (!q) return next();
  try {
    const cfg = await readConfig();
    if (cfg.catalogs && cfg.catalogs[req.params.id] && cfg.catalogs[req.params.id].enabled === false) {
      return res.json({ metas: [] });
    }
    const { metas } = await searchCatalogs(req.params.type, q);
    res.json({ metas });
  } catch (e) {
    console.log(`[binge-addon] catalog ?search= failed: ${e.message}`);
    res.json({ metas: [] });
  }
});

app.use(getRouter(builder.getInterface()));

// Health endpoint (not part of the Stremio protocol).
app.get('/health', (req, res) => res.json({ ok: true, addon: ADDON_NAME, version: VERSION }));

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 7000;
  app.listen(port, () => console.log(`[binge-addon] listening on :${port}`));
}
