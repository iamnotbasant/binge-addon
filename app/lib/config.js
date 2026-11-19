// Binge Addon — admin config (v2.1.0).
// Config lives in Vercel Blob as config.json; the dashboard writes it,
// the builder and the server read it. No secrets ever live here.
// Shape:
//   { catalogs: { "<catalog-id>": { enabled, name, order } },
//     knobs:    { "<row-key>": { windowDays?, voteFloor?, voteCountFloor?, voteCountCeil? } },
//     streams:  { torrentio, comet, hdhub, maxQuality } }
// catalog ids are the full ids from lib/manifest.js (e.g. trending-indian-movie).
// knob row-keys are the builder row keys (e.g. 'fresh-digital-drops').

'use strict';

const { catalogs: defaultCatalogList } = require('./manifest');

function defaultConfig() {
  const catalogs = {};
  defaultCatalogList().forEach((c, i) => {
    catalogs[c.id] = { enabled: true, name: c.name, order: i };
  });
  return {
    version: 1,
    updatedAt: null,
    catalogs,
    // Only rows with a window/floor get a knob entry; everything else
    // keeps the builder's hardcoded default.
    knobs: {
      'fresh-digital-drops': { windowDays: 45, voteFloor: 6 },
      'latest-indian-ott': { windowDays: 90 },
      'latest-indian-series': { windowDays: 90 },
      'releasing-next-30-days': { windowDays: 30 },
      'big-announcements': { windowDays: 500 },
      'returning-soon': { windowDays: 45 },
      'now-in-theatres': { windowDays: 45, voteCountFloor: 10 },
      'new-releases': { windowDays: 45, voteFloor: 6.5, voteCountFloor: 100, voteCountFloorIndian: 10, voteCountFloorSeries: 25 },
      'india-buzzing-now': { voteFloor: 6, voteCountFloor: 10 },
      // v1.5.5: the underrated / scifi / thrillers / action /
      // miniseries / visual / anime / classics / dark-crime knobs are
      // gone with their rows (12 removed catalogs).
    },
    streams: { torrentio: true, comet: true, hdhub: true, maxQuality: '1080p' },
  };
}

// Merge a stored config over the defaults so old/missing keys never break
// the server or the builder (new catalogs added later default to enabled).
function normalizeConfig(stored) {
  const cfg = defaultConfig();
  if (!stored || typeof stored !== 'object') return cfg;
  if (stored.catalogs && typeof stored.catalogs === 'object') {
    for (const [id, c] of Object.entries(stored.catalogs)) {
      if (cfg.catalogs[id]) cfg.catalogs[id] = { ...cfg.catalogs[id], ...c };
    }
  }
  if (stored.knobs && typeof stored.knobs === 'object') {
    for (const [k, v] of Object.entries(stored.knobs)) {
      if (cfg.knobs[k]) cfg.knobs[k] = { ...cfg.knobs[k], ...v };
    }
  }
  if (stored.streams && typeof stored.streams === 'object') {
    cfg.streams = { ...cfg.streams, ...stored.streams };
  }
  return cfg;
}

const CONFIG_KEY = 'config.json';
let cache = null; // { at, value }
const CACHE_TTL_MS = 60 * 1000;

function invalidateConfigCache() { cache = null; }

async function readConfig() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  // v1.2.8: direct public-URL read (SIMPLE request) with list()
  // fallback inside readBlobJson.
  let cfg = defaultConfig();
  try {
    const { readBlobJson } = require('./blob');
    const json = await readBlobJson(CONFIG_KEY);
    if (json) cfg = normalizeConfig(json);
  } catch (e) {
    console.log(`[binge-addon] config read failed, using defaults: ${e.message}`);
  }
  cache = { at: Date.now(), value: cfg };
  return cfg;
}

async function writeConfig(cfg) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('no BLOB_READ_WRITE_TOKEN');
  const clean = normalizeConfig(cfg);
  clean.updatedAt = new Date().toISOString();
  const { put } = require('@vercel/blob');
  await put(CONFIG_KEY, JSON.stringify(clean), {
    access: 'public', token, addRandomSuffix: false, allowOverwrite: true,
  });
  cache = { at: Date.now(), value: clean };
  return clean;
}

// Effective manifest catalog list after config: enabled only, renamed,
// reordered by `order`. Returns [{ type, id, name, extra }].
// v1.1.7: `extra` (search) is carried through — dropping it here would
// strip search from the served /manifest.json even though the static
// MANIFEST declares it.
// v1.4.3: Big Announcements shows a DYNAMIC year (currentYear–nextYear)
// computed at serve time — a stored name with a stale year can never
// freeze the label again. The override applies only to the two
// big-announcements ids; every other row keeps its stored name.
function effectiveCatalogs(cfg) {
  const y = new Date().getFullYear();
  const bigName = `Big Announcements ${y}–${y + 1}`;
  const list = defaultCatalogList().map((c) => {
    const o = (cfg.catalogs && cfg.catalogs[c.id]) || {};
    const name = c.id.startsWith('big-announcements-') ? bigName : (o.name || c.name);
    return { type: c.type, id: c.id, name, extra: c.extra, enabled: o.enabled !== false, order: typeof o.order === 'number' ? o.order : 999 };
  });
  return list.filter((c) => c.enabled).sort((a, b) => a.order - b.order)
    .map(({ type, id, name, extra }) => ({ type, id, name, ...(extra ? { extra } : {}) }));
}

function knob(cfg, rowKey, field, def) {
  const k = cfg && cfg.knobs && cfg.knobs[rowKey];
  if (k && typeof k[field] === 'number') return k[field];
  return def;
}

module.exports = { defaultConfig, normalizeConfig, readConfig, writeConfig, invalidateConfigCache, effectiveCatalogs, knob };
