// Binge Addon — single-bundle catalog store (v1.2.9).
//
// Why: Vercel's own Blob pricing docs (verified live 19 Nov 2026,
// vercel.com/docs/vercel-blob/usage-and-pricing, last updated
// 2026-09-23) say a plain GET of a public Blob URL is a SIMPLE
// operation — and only on cache MISS (cache HITs are free). ADVANCED
// operations are upload, copy, list, TTL and store creation. So v1.2.8
// (direct-URL reads) already made reads cost ZERO Advanced requests.
// The only Advanced burn left was the WRITES: the daily rebuild put
// 27 rows + idmap + summary = ~29 puts/day (~870/month), which is what
// would have pushed the already-burned 1,500 over 2,000 around 5 Dec.
//
// The fix: the rebuild now writes ONE file per day —
//   catalogs/_bundle.json = { version, builtAt, hash, rows, idmap, summary }
// Steady-state Advanced burn is 1 put/day (~30/month = 1.5% of the
// 2,000 allowance), which can never exhaust it on its own — that is
// the permanent part. On top of that, the put is SKIPPED when the
// bundle content is byte-identical to yesterday's (hash compare), so
// quiet days cost 0 puts.
//
// Why not the alternatives (evaluated 19 Nov 2026):
//   (a) static files + git auto-deploy: REJECTED — the Vercel project
//       has link:null (verified via API), i.e. no git integration;
//       it would need the user's dashboard action + a GitHub token in
//       Vercel env vars for the cron to commit + a deploy every day.
//   (b) GitHub + jsDelivr: REJECTED — same commit-token problem, plus
//       jsDelivr edge-cache staleness on branch files and a second
//       external dependency in the read path.
//   (c) diff-only per-row writes: REJECTED as the whole fix —
//       ~10-15 puts/day is better but not near-zero.
// The bundle keeps everything in the one store that already works,
// adds no credential, no service, no deploy, and no CDN semantics.
//
// Safety: readers try the bundle FIRST, then fall back to the legacy
// per-row files (catalogs/<id>.json, _idmap.json, _summary.json),
// which stay in Blob as a frozen safety net — they are simply no
// longer written. A missing/wrong bundle can never break reads; it
// just serves yesterday's rows, exactly as a failed rebuild does
// today. The old files cost ~500KB of the 1GB storage allowance.

'use strict';

const crypto = require('crypto');

const BUNDLE_KEY = 'catalogs/_bundle.json';

// Short in-memory cache so a hot instance doesn't re-fetch the bundle
// per request. A null (missing bundle) is cached too — the legacy
// fallback serves reads meanwhile, and the next rebuild writes the
// bundle within minutes of a deploy.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null; // { at, value }

// Content hash: covers ONLY rows + idmap. builtAt / summary change
// every run by construction (timestamps), so they must NOT be in the
// hash or the skip-put check could never fire.
function contentHash(rows, idmap) {
  return crypto.createHash('sha256').update(JSON.stringify({ rows, idmap })).digest('hex');
}

// Assemble the bundle object. `builtAt` is ONE timestamp for the whole
// build (shared by rows and summary) so identical content hashes
// identically across runs.
function buildBundle({ rows, idmap, summary, builtAt }) {
  const hash = contentHash(rows, idmap);
  return { version: 1, builtAt, hash, rows, idmap, summary };
}

// True when the previous bundle (if any) already holds exactly this
// content — the rebuild may skip its put entirely.
function shouldSkipPut(prevBundle, hash) {
  return !!(prevBundle && typeof prevBundle.hash === 'string' && prevBundle.hash === hash);
}

// Read the bundle by direct public URL (SIMPLE request) with the
// list() fallback inside readBlobJson. Returns the parsed bundle
// object, or null when it does not exist / is unreadable. Never throws.
async function readBundle() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  let value = null;
  try {
    const { readBlobJson } = require('./blob');
    const json = await readBlobJson(BUNDLE_KEY);
    if (json && typeof json === 'object' && json.rows && typeof json.rows === 'object') {
      value = json;
    }
  } catch (e) {
    console.log(`[binge-addon] bundle read failed: ${e.message}`);
  }
  cache = { at: Date.now(), value };
  return value;
}

function invalidateBundleCache() { cache = null; }

module.exports = { BUNDLE_KEY, buildBundle, contentHash, shouldSkipPut, readBundle, invalidateBundleCache };
