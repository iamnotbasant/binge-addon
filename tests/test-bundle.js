// Binge Addon — single-bundle store tests (v1.2.9).
// The 75% Blob Advanced Requests alert forced the write side down
// from ~29 puts/day (27 rows + idmap + summary) to ONE bundle put/day
// (lib/bundle.js). This test proves:
//   §1 hash/skip is exact (same content -> same hash even with a
//       different builtAt; one changed meta -> different hash; skip
//       only when the stored hash matches)
//   §2 bundle-first reads: a row in the bundle serves from it, a row
//       missing from the bundle falls back to the legacy per-row file,
//       and the idmap comes from the bundle (not the legacy file)
//   §3 bundle missing entirely -> legacy per-row files still serve
//       (this is the deploy-to-first-rebuild window: the addon must
//       keep working before the first bundle exists)
//   §4 bundle present, row in neither bundle nor legacy -> null, no throw
//   §5 a dead bundle host degrades to null, never throws or hangs
//   §6 no list() call in lib/bundle.js (the one list() fallback in
//       lib/blob.js is untouched — see test-blob-direct.js §5)
// Exits non-zero on any failed assertion. Run: node tests/test-bundle.js
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const APP = path.join(__dirname, '..', 'app');
const { buildBundle, contentHash, shouldSkipPut, readBundle, invalidateBundleCache } = require(path.join(APP, 'lib', 'bundle'));
const store = require(path.join(APP, 'lib', 'store'));

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}

const savedEnv = { ...process.env };

async function withEnvAsync(patch, fn) {
  for (const k of ['BLOB_PUBLIC_BASE_URL', 'BLOB_READ_WRITE_TOKEN']) delete process.env[k];
  Object.assign(process.env, patch);
  try { return await fn(); } finally {
    for (const k of ['BLOB_PUBLIC_BASE_URL', 'BLOB_READ_WRITE_TOKEN']) delete process.env[k];
    Object.assign(process.env, savedEnv);
  }
}

function resetCaches() {
  invalidateBundleCache();
  store.invalidateStoreCache();
}

// Fixture bundle: 1 row present, 1 row deliberately absent (to test
// the legacy fallback), an idmap that DIFFERS from the legacy file
// (to prove the bundle idmap wins), and a summary.
function fixtureBundle() {
  const rows = {
    'trending-indian-movie': {
      metas: [
        { id: 'tt1111111', type: 'movie', name: 'Fixture One', year: '2026' },
        { id: 'tt2222222', type: 'movie', name: 'Fixture Two', year: '2025' },
      ],
      builtAt: '2026-11-19T05:30:00.000Z',
    },
  };
  const idmap = { 'tmdb:111': 'tt1111111', 'tmdb:222': 'tt2222222' };
  const summary = {
    builtAt: '2026-11-19T05:30:00.000Z',
    catalogs: {
      'trending-indian-movie': { count: 2, top: ['Fixture One', 'Fixture Two'], builtAt: '2026-11-19T05:30:00.000Z' },
    },
  };
  return buildBundle({ rows, idmap, summary, builtAt: '2026-11-19T05:30:00.000Z' });
}

const LEGACY_ROW = {
  metas: [{ id: 'tt3333333', type: 'movie', name: 'Legacy Row Title', year: '2024' }],
  builtAt: '2026-11-19T05:23:49.000Z',
};
const LEGACY_IDMAP = { 'tmdb:999': 'tt9999999' };

// Tiny fixture Blob host: serves whatever routes the case needs.
function startFixture(routes) {
  const server = http.createServer((req, res) => {
    const body = routes[req.url];
    if (body === undefined) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

(async () => {
  console.log('--- §1 hash / skip-put (pure, no network) ---');
  const rowsA = { 'trending-indian-movie': { metas: [{ id: 'tt1', type: 'movie', name: 'A' }], builtAt: 'T1' } };
  const idmapA = { 'tmdb:1': 'tt1' };
  const b1 = buildBundle({ rows: rowsA, idmap: idmapA, summary: { builtAt: 'T1', catalogs: {} }, builtAt: '2026-11-19T05:00:00.000Z' });
  const b2 = buildBundle({ rows: rowsA, idmap: idmapA, summary: { builtAt: 'T2', catalogs: {} }, builtAt: '2026-11-19T06:00:00.000Z' });
  check(b1.version === 1 && typeof b1.hash === 'string' && b1.hash.length === 64, 'bundle shape: version 1 + 64-char sha256 hash');
  check(b1.hash === b2.hash, 'same content, different builtAt -> same hash (skip can fire)');
  check(b1.hash === contentHash(rowsA, idmapA), 'hash covers rows + idmap only');
  check(shouldSkipPut(b1, b2.hash) === true, 'shouldSkipPut: stored hash matches -> skip the put');
  const rowsB = { 'trending-indian-movie': { metas: [{ id: 'tt1', type: 'movie', name: 'A CHANGED' }], builtAt: 'T1' } };
  const b3 = buildBundle({ rows: rowsB, idmap: idmapA, summary: { builtAt: 'T1', catalogs: {} }, builtAt: '2026-11-19T05:00:00.000Z' });
  check(b3.hash !== b1.hash, 'one changed meta -> different hash');
  check(shouldSkipPut(b1, b3.hash) === false, 'shouldSkipPut: hash differs -> write the bundle');
  check(shouldSkipPut(null, b1.hash) === false, 'shouldSkipPut: no previous bundle -> write');
  check(shouldSkipPut({}, b1.hash) === false, 'shouldSkipPut: previous bundle without hash -> write');

  console.log('--- §2 bundle-first reads via fixture host (no token, 0 advanced ops) ---');
  const bundle = fixtureBundle();
  const { server, port } = await startFixture({
    '/catalogs/_bundle.json': bundle,
    '/catalogs/global-trending-movie.json': LEGACY_ROW,
    '/catalogs/_idmap.json': LEGACY_IDMAP,
  });
  try {
    await withEnvAsync({ BLOB_PUBLIC_BASE_URL: `http://127.0.0.1:${port}` }, async () => {
      resetCaches();
      const got = await readBundle();
      check(got !== null && got.hash === bundle.hash, 'readBundle returns the fixture bundle');
      check(got && got.summary && got.summary.catalogs['trending-indian-movie'].count === 2,
        'bundle summary readable (admin status source)');
      const metas = await store.readCatalog('trending-indian-movie');
      check(Array.isArray(metas) && metas.length === 2 && metas[0].name === 'Fixture One',
        'row in bundle serves from the bundle');
      const legacyMetas = await store.readCatalog('global-trending-movie');
      check(Array.isArray(legacyMetas) && legacyMetas.length === 1 && legacyMetas[0].name === 'Legacy Row Title',
        'row missing from bundle falls back to the legacy per-row file');
      const idmap = await store.readIdMap();
      check(idmap['tmdb:111'] === 'tt1111111' && !idmap['tmdb:999'],
        'idmap comes from the bundle, not the legacy file');
    });
  } finally {
    server.close();
  }

  console.log('--- §3 bundle missing -> legacy files still serve ---');
  const { server: server3, port: port3 } = await startFixture({
    '/catalogs/now-in-theatres-movie.json': LEGACY_ROW,
    '/catalogs/_idmap.json': LEGACY_IDMAP,
  });
  try {
    await withEnvAsync({ BLOB_PUBLIC_BASE_URL: `http://127.0.0.1:${port3}` }, async () => {
      resetCaches();
      check((await readBundle()) === null, 'missing bundle returns null');
      const metas = await store.readCatalog('now-in-theatres-movie');
      check(Array.isArray(metas) && metas.length === 1 && metas[0].name === 'Legacy Row Title',
        'legacy per-row file serves while the bundle does not exist yet');
      const idmap = await store.readIdMap();
      check(idmap['tmdb:999'] === 'tt9999999', 'legacy idmap serves while the bundle does not exist yet');
    });
  } finally {
    server3.close();
  }

  console.log('--- §4 row in neither bundle nor legacy -> null, no throw ---');
  const { server: server4, port: port4 } = await startFixture({
    '/catalogs/_bundle.json': bundle,
  });
  try {
    await withEnvAsync({ BLOB_PUBLIC_BASE_URL: `http://127.0.0.1:${port4}` }, async () => {
      resetCaches();
      const metas = await store.readCatalog('no-such-row-movie');
      check(metas === null, 'unknown row returns null, never throws');
    });
  } finally {
    server4.close();
  }

  console.log('--- §5 dead bundle host degrades to null, never throws ---');
  await withEnvAsync({ BLOB_PUBLIC_BASE_URL: 'http://127.0.0.1:1' }, async () => {
    resetCaches();
    const got = await readBundle();
    check(got === null, 'connection-refused host -> bundle null');
    const metas = await store.readCatalog('trending-indian-movie');
    check(metas === null, 'connection-refused host -> catalog null, no hang');
  });

  console.log('--- §6 no list() in lib/bundle.js ---');
  const src = fs.readFileSync(path.join(APP, 'lib', 'bundle.js'), 'utf8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const calls = (noComments.match(/\blist\s*\(/g) || []).length;
  check(calls === 0, 'lib/bundle.js has zero list() calls');

  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
