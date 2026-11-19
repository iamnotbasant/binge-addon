// Binge Addon — Blob direct-URL read tests (v1.2.8).
// The 75% Blob Advanced Requests alert (19 Nov 2026, 1,500/2,000 used)
// forced reads off list() onto direct public URLs. This test proves:
//   §1 host derivation is exact (token parse, env override, verified default)
//   §2 a real catalog file reads by direct URL (a SIMPLE request — no
//       ADVANCED request is burned by this test at all)
//   §3 a genuinely missing file returns null (direct 404 -> list fallback
//       with no token -> null), never throws
//   §4 with a broken direct host + a fake token, the list() fallback runs
//       and degrades to null instead of crashing (the safety net the
//       brief requires: a wrong direct assumption must never break reads)
//   §5 no list() call remains in the hot paths — only the one fallback
//       inside lib/blob.js
// Exits non-zero on any failed assertion. Run: node tests/test-blob-direct.js
'use strict';

const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app');
const { readBlobJson, publicBaseUrl, hostFromToken } = require(path.join(APP, 'lib', 'blob'));

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

// Fresh require per env change: blob.js reads env at call time, so one
// module instance is fine — just save/restore the env around each case.
const savedEnv = { ...process.env };

function withEnv(patch, fn) {
  for (const k of ['BLOB_PUBLIC_BASE_URL', 'BLOB_READ_WRITE_TOKEN']) delete process.env[k];
  Object.assign(process.env, patch);
  try { return fn(); } finally {
    for (const k of ['BLOB_PUBLIC_BASE_URL', 'BLOB_READ_WRITE_TOKEN']) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
}

// Async variant: the env must stay patched until the promise settles —
// a plain withEnv would restore it while the read is still in flight.
async function withEnvAsync(patch, fn) {
  for (const k of ['BLOB_PUBLIC_BASE_URL', 'BLOB_READ_WRITE_TOKEN']) delete process.env[k];
  Object.assign(process.env, patch);
  try { return await fn(); } finally {
    for (const k of ['BLOB_PUBLIC_BASE_URL', 'BLOB_READ_WRITE_TOKEN']) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
}

(async () => {
  console.log('--- §1 host derivation (pure, no network) ---');
  check(
    hostFromToken('vercel_blob_rw_store_drqjSj6Uy2iBuItV_abc123secret') ===
      'drqjSj6Uy2iBuItV.public.blob.vercel-storage.com',
    'token parse: vercel_blob_rw_store_<host>_<secret> -> <host>.public.blob.vercel-storage.com'
  );
  check(hostFromToken('eyJ2IjoidjIiLCJjIjoi') === null,
    'token parse: encrypted API value (eyJ...) -> null, falls through to verified host');
  check(hostFromToken(null) === null && hostFromToken('') === null && hostFromToken(undefined) === null,
    'token parse: missing token -> null');
  check(hostFromToken('vercel_blob_rw_store_XYZ') === null,
    'token parse: truncated token without secret part -> null');
  check(hostFromToken('not-a-blob-token') === null, 'token parse: garbage -> null');

  check(
    withEnv({}, () => publicBaseUrl()) === 'https://drqjSj6Uy2iBuItV.public.blob.vercel-storage.com',
    'publicBaseUrl default = verified live host (no env, no token)'
  );
  check(
    withEnv({ BLOB_PUBLIC_BASE_URL: 'https://example.invalid/' }, () => publicBaseUrl()) === 'https://example.invalid',
    'publicBaseUrl: env override wins, trailing slash stripped'
  );
  check(
    withEnv({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_store_AAAA1111_secret' }, () => publicBaseUrl()) ===
      'https://AAAA1111.public.blob.vercel-storage.com',
    'publicBaseUrl: valid-shaped token derives its own host'
  );
  check(
    withEnv({ BLOB_READ_WRITE_TOKEN: 'eyJ2IjoidjIiLCJjIjoi' }, () => publicBaseUrl()) ===
      'https://drqjSj6Uy2iBuItV.public.blob.vercel-storage.com',
    'publicBaseUrl: encrypted/unparseable token -> verified host (not a crash)');

  console.log('--- §2 live direct read: one real catalog file (SIMPLE GET, 0 advanced ops) ---');
  const row = await readBlobJson('catalogs/trending-indian-movie.json');
  check(row !== null && typeof row === 'object', 'direct read returns the row JSON');
  check(Array.isArray(row && row.metas) && row.metas.length > 0, 'row has a non-empty metas array');
  check(typeof (row && row.metas[0] && row.metas[0].id) === 'string' && row.metas[0].id.startsWith('tt'),
    'first meta is a real title (tt id)');
  check(typeof (row && row.builtAt) === 'string', 'row carries builtAt');
  console.log(`  live row: ${row.metas.length} metas, builtAt ${row.builtAt}`);

  // Same file through the store layer (the path the catalog handler uses).
  const { readCatalog } = require(path.join(APP, 'lib', 'store'));
  const metas = await readCatalog('trending-indian-movie');
  check(Array.isArray(metas) && metas.length === row.metas.length,
    'store.readCatalog returns the same metas via the direct path');

  console.log('--- §3 missing file -> null, never throws ---');
  const missing = await readBlobJson('catalogs/_does-not-exist-zzz.json');
  check(missing === null, 'missing file returns null (direct 404, list fallback has no token here)');

  console.log('--- §4 broken direct host + fake token -> fallback degrades to null ---');
  const fallback = await withEnvAsync(
    {
      BLOB_PUBLIC_BASE_URL: 'https://invalid.invalid',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_store_bogus_x',
    },
    () => readBlobJson('catalogs/_idmap.json')
  );
  check(fallback === null,
    'wrong host + unusable token: list() fallback runs, auth fails, result is null (no crash, no hang)');

  console.log('--- §5 no list() left in the hot paths ---');
  const hotFiles = [
    'lib/store.js',
    'lib/config.js',
    'lib/profiles.js',
    'lib/blob.js',
    'lib/bundle.js',
    'index.js',
    'scripts/build-catalogs.js',
  ];
  let totalListCalls = 0;
  for (const rel of hotFiles) {
    const src = fs.readFileSync(path.join(APP, rel), 'utf8');
    const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const calls = (noComments.match(/\blist\s*\(/g) || []).length;
    console.log(`  ${rel}: ${calls} list() call(s) in code`);
    totalListCalls += calls;
    if (rel === 'lib/blob.js') check(calls === 1, 'blob.js holds the ONE list() call (the fallback)');
    else check(calls === 0, `${rel} has zero list() calls`);
  }
  check(totalListCalls === 1, 'exactly one list() call in the whole hot path (the blob.js fallback)');

  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
