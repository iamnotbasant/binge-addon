// Binge Addon — catalog row store (design §6.3).
// Rows live in Vercel Blob as one JSON file per catalog:
//   catalogs/<catalog-id>.json   -> { metas: [...] }
//   catalogs/_idmap.json         -> { "tmdb:123": "tt1234567", ... }
// The catalog handler only READS. The daily rebuild (scripts/build-catalogs.js)
// writes; on failure it writes nothing, so yesterday's files keep serving.
//
// v1.2.8: reads go through lib/blob.js — direct public URL (a SIMPLE
// Blob request) with the old list() path as fallback. Reads no longer
// need BLOB_READ_WRITE_TOKEN and no longer burn an ADVANCED request
// per catalog; without the store (direct 404 + no token for list())
// the handler returns null and the caller serves { metas: [] }.
//
// v1.2.9: reads go through the SINGLE BUNDLE first
// (catalogs/_bundle.json — all rows + idmap + summary in one file, see
// lib/bundle.js). The legacy per-row files are the fallback only: they
// are no longer written by the rebuild, but they stay in Blob as a
// frozen safety net, so a missing/wrong bundle can never break reads.

'use strict';

const PREFIX = 'catalogs/';

// Short in-memory cache so a hot instance doesn't re-fetch Blob per request.
const cache = new Map(); // key -> { at, value }
const CACHE_TTL_MS = 5 * 60 * 1000;

async function readCatalogFile(catalogId) {
  const key = `${PREFIX}${catalogId}.json`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  // v1.2.9: bundle first (one SIMPLE request for all rows), legacy
  // per-row file as fallback — the legacy files are frozen since the
  // v1.2.9 rebuild, but they still serve yesterday's rows if the
  // bundle is ever missing.
  try {
    const { readBundle } = require('./bundle');
    const bundle = await readBundle();
    const row = bundle && bundle.rows && bundle.rows[catalogId];
    if (row && Array.isArray(row.metas)) {
      const value = { metas: row.metas, builtAt: row.builtAt || bundle.builtAt || null };
      cache.set(key, { at: Date.now(), value });
      return value;
    }
  } catch (e) {
    console.log(`[binge-addon] bundle row read failed for ${catalogId}: ${e.message}`);
  }
  // Legacy fallback: the frozen per-row file (v1.2.8 direct path).
  try {
    const { readBlobJson } = require('./blob');
    const json = await readBlobJson(key);
    if (!json) return null;
    const value = { metas: Array.isArray(json.metas) ? json.metas : [], builtAt: json.builtAt || null };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.log(`[binge-addon] catalog store read failed for ${catalogId}: ${e.message}`);
    return null;
  }
}

async function readCatalog(catalogId) {
  const file = await readCatalogFile(catalogId);
  return file ? file.metas : null;
}

async function readCatalogMeta(catalogId) {
  return readCatalogFile(catalogId);
}

// Persisted tmdb:xxx -> tt... map, with a short in-memory cache.
// Used by the meta handler to resolve a tt id back to its TMDB id.
let idMapCache = null; // { at, value }
async function readIdMap() {
  if (idMapCache && Date.now() - idMapCache.at < CACHE_TTL_MS) return idMapCache.value;
  // v1.2.9: idmap lives inside the bundle; legacy _idmap.json is the
  // fallback (frozen since the v1.2.9 rebuild).
  try {
    const { readBundle } = require('./bundle');
    const bundle = await readBundle();
    if (bundle && bundle.idmap && typeof bundle.idmap === 'object') {
      idMapCache = { at: Date.now(), value: bundle.idmap };
      return bundle.idmap;
    }
  } catch (e) {
    console.log(`[binge-addon] bundle idmap read failed: ${e.message}`);
  }
  try {
    const { readBlobJson } = require('./blob');
    const json = await readBlobJson('catalogs/_idmap.json');
    if (!json) return {};
    idMapCache = { at: Date.now(), value: json };
    return json;
  } catch (e) {
    console.log(`[binge-addon] idmap read failed: ${e.message}`);
    return {};
  }
}

module.exports = { readCatalog, readCatalogMeta, readIdMap, PREFIX, invalidateStoreCache };

// Test/support hook: clear the row + idmap caches (e.g. after a
// rebuild, or between fixture servers in tests).
function invalidateStoreCache() {
  cache.clear();
  idMapCache = null;
}
