// Bharat Streams — catalog row store (design §6.3).
// Rows live in Vercel Blob as one JSON file per catalog:
//   catalogs/<catalog-id>.json   -> { metas: [...] }
//   catalogs/_idmap.json         -> { "tmdb:123": "tt1234567", ... }
// The catalog handler only READS. The daily rebuild (scripts/build-catalogs.js)
// writes; on failure it writes nothing, so yesterday's files keep serving.
//
// Without BLOB_READ_WRITE_TOKEN (e.g. before the store is created) the
// handler returns null and the caller serves { metas: [] } — never a crash.

'use strict';

const PREFIX = 'catalogs/';

// Short in-memory cache so a hot instance doesn't re-fetch Blob per request.
const cache = new Map(); // key -> { at, value }
const CACHE_TTL_MS = 5 * 60 * 1000;

async function readCatalogFile(catalogId) {
  const key = `${PREFIX}${catalogId}.json`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.log('[bharat-streams] catalog store: no BLOB_READ_WRITE_TOKEN, serving empty row');
    return null;
  }
  try {
    const { list } = require('@vercel/blob');
    const { blobs } = await list({ prefix: key, token });
    const file = blobs.find((b) => b.pathname === key);
    if (!file) return null;
    const res = await fetch(file.url);
    if (!res.ok) return null;
    const json = await res.json();
    const value = { metas: Array.isArray(json.metas) ? json.metas : [], builtAt: json.builtAt || null };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.log(`[bharat-streams] catalog store read failed for ${catalogId}: ${e.message}`);
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
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return {};
  try {
    const { list } = require('@vercel/blob');
    const { blobs } = await list({ prefix: 'catalogs/_idmap.json', token });
    const file = blobs.find((b) => b.pathname === 'catalogs/_idmap.json');
    if (!file) return {};
    const res = await fetch(file.url);
    if (!res.ok) return {};
    const json = await res.json();
    idMapCache = { at: Date.now(), value: json };
    return json;
  } catch (e) {
    console.log(`[bharat-streams] idmap read failed: ${e.message}`);
    return {};
  }
}

module.exports = { readCatalog, readCatalogMeta, readIdMap, PREFIX };
