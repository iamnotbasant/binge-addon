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
const { fetchAllStreams } = require('./lib/sources');
const { dedupe, formatStream, compareParsed } = require('./lib/parse');
const { readCatalog, readCatalogMeta, readIdMap } = require('./lib/store');
const { readConfig, writeConfig, effectiveCatalogs, normalizeConfig } = require('./lib/config');

const STREAM_CAP = 40;
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const ADDON_NAME = 'binge-addon';
const VERSION = '1.0.7';

const builder = new addonBuilder(MANIFEST);

// --- Catalog handler (§6.3): reads prebuilt rows from Vercel Blob.
// A catalog disabled in the dashboard serves { metas: [] }.
builder.defineCatalogHandler(async ({ type, id }) => {
  const cfg = await readConfig();
  if (cfg.catalogs && cfg.catalogs[id] && cfg.catalogs[id].enabled === false) {
    return { metas: [], cacheMaxAge: 3600, staleError: 3600 };
  }
  const metas = await readCatalog(id);
  if (!metas) {
    return { metas: [], cacheMaxAge: 3600, staleError: 3600 };
  }
  return { metas, cacheMaxAge: 86400, staleError: 86400 };
});

// --- Stream handler (§7): tt… ids only, parallel fan-out, 7 s deadline.
// Source on/off + max quality come from the dashboard config.
builder.defineStreamHandler(async ({ type, id }) => {
  if (!/^tt\d+(:\d+:\d+)?$/.test(id)) {
    console.log(`[binge-addon] stream ${type}/${id}: non-tt id, returning empty`);
    return { streams: [] };
  }
  const cfg = await readConfig();
  const disabled = new Set();
  if (cfg.streams) {
    if (cfg.streams.torrentio === false) disabled.add('torrentio');
    if (cfg.streams.comet === false) disabled.add('comet');
    if (cfg.streams.hdhub === false) disabled.add('hdhub');
  }
  const maxRes = cfg.streams && cfg.streams.maxQuality === '720p' ? 720 : 1080;
  const results = await fetchAllStreams(type, id, { disabled, maxRes });
  const merged = [];
  for (const r of results) merged.push(...r.streams);
  merged.sort(compareParsed);
  const deduped = dedupe(merged).slice(0, STREAM_CAP);
  const streams = deduped.map(formatStream);
  console.log(`[binge-addon] stream ${type}/${id}: returning ${streams.length} streams`);
  return { streams };
});

// --- Meta handler (v2.1.0): resolves tt id -> TMDB id via the persisted
// Blob id map (catalogs/_idmap.json), then TMDB detail + credits.
// Without the map entry or the TMDB key, returns an empty meta — Nuvio
// then falls back to any other installed meta addon (e.g. Cinemeta).
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
  const tmdbId = await tmdbIdForImdb(id);
  if (!tmdbId) {
    console.log(`[binge-addon] meta ${type}/${id}: no tmdb id in id map`);
    return { meta: null };
  }
  try {
    const base = type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${base}/${tmdbId}?api_key=${key}&append_to_response=credits`;
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`[binge-addon] meta ${type}/${id}: TMDB HTTP ${res.status}`);
      return { meta: null };
    }
    const d = await res.json();
    const credits = d.credits || {};
    const director = (credits.crew || []).find((c) => c.job === 'Director');
    const meta = {
      id,
      type,
      name: d.title || d.name,
      poster: d.poster_path ? `${TMDB_IMG}/w342${d.poster_path}` : undefined,
      background: d.backdrop_path ? `${TMDB_IMG}/w780${d.backdrop_path}` : undefined,
      description: d.overview || undefined,
      releaseInfo: (d.release_date || d.first_air_date || '').slice(0, 4),
      genres: (d.genres || []).map((g) => g.name),
      cast: (credits.cast || []).slice(0, 10).map((c) => c.name),
      director: director ? director.name : undefined,
    };
    if (typeof d.runtime === 'number' && d.runtime > 0) meta.runtime = `${d.runtime} min`;
    else if (Array.isArray(d.episode_run_time) && d.episode_run_time[0]) meta.runtime = `${d.episode_run_time[0]} min`;
    if (type === 'series' && Array.isArray(d.seasons)) {
      const videos = [];
      for (const s of d.seasons) {
        if (!s.episode_count || s.episode_count < 1) continue;
        for (let e = 1; e <= s.episode_count; e++) {
          videos.push({
            id: `${id}:${s.season_number}:${e}`,
            title: `Episode ${e}`,
            season: s.season_number,
            episode: e,
          });
        }
      }
      if (videos.length) meta.videos = videos;
    }
    return { meta, cacheMaxAge: 86400, staleError: 86400 };
  } catch (e) {
    console.log(`[binge-addon] meta ${type}/${id} failed: ${e.message}`);
    return { meta: null };
  }
});

const app = express();
app.use(express.json({ limit: '200kb' }));

// --- Dynamic manifest (v2.1.0): the SDK router would serve the static
// manifest; this route runs first and applies the dashboard config
// (disabled catalogs hidden, renames, reorder). Stays < 8 KB.
app.get('/manifest.json', async (req, res) => {
  try {
    const cfg = await readConfig();
    const manifest = { ...MANIFEST, catalogs: effectiveCatalogs(cfg) };
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

app.get('/admin/api/status', requireAdmin, async (req, res) => {
  try {
    const cfg = await readConfig();
    const catalogs = [];
    let lastBuiltAt = null;
    for (const c of effectiveCatalogs(cfg)) {
      const file = await readCatalogMeta(c.id);
      const metas = file ? file.metas : [];
      if (file && file.builtAt && (!lastBuiltAt || file.builtAt > lastBuiltAt)) lastBuiltAt = file.builtAt;
      catalogs.push({
        id: c.id, type: c.type, name: c.name,
        count: metas.length,
        top: metas.slice(0, 3).map((m) => m.name),
        builtAt: file ? file.builtAt : null,
      });
    }
    // Disabled catalogs: show with count 0 so the dashboard lists all 27.
    const allIds = Object.keys(cfg.catalogs || {});
    for (const id of allIds) {
      if (catalogs.some((c) => c.id === id)) continue;
      const c = cfg.catalogs[id];
      catalogs.push({ id, type: id.endsWith('-series') ? 'series' : 'movie', name: c.name, count: 0, top: [], builtAt: null, disabled: true });
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

app.use(getRouter(builder.getInterface()));

// Health endpoint (not part of the Stremio protocol).
app.get('/health', (req, res) => res.json({ ok: true, addon: ADDON_NAME, version: VERSION }));

module.exports = app;

if (require.main === module) {
  const port = process.env.PORT || 7000;
  app.listen(port, () => console.log(`[binge-addon] listening on :${port}`));
}
