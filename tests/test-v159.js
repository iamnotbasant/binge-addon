// Binge Addon — v1.5.9 catalog TTL tests (basant, 20 Nov 2026; version assertions bumped to 1.6.0 by v1.6.0: Nuvio kept
// showing yesterday's rows — The Body first in New Releases, Ramayana #1
// in Buzz — while cache-busted fetches showed the new data. Root cause:
// the catalog success response carried cacheMaxAge 86400 (24h), which
// Stremio honors for row content, and refresh/reinstall could not beat
// it. Fix: catalog success TTL 300s (5 min, matching the in-app bundle
// read cache). The manifest was verified live to already return
// `Cache-Control: public, max-age=0, must-revalidate` — no 24h manifest
// cache exists to kill, so no manifest header change was made; the badge
// PNG route (static assets) keeps max-age=86400 by design, and the meta
// response keeps 86400 (detail pages, not the complaint).
//
// Covers (source-level regression lock on app/index.js — the handler is
// not unit-testable without booting the server):
// (0) manifest — version 1.6.0, 18 catalogs, id unchanged;
// (1) catalog success path returns cacheMaxAge 300 / staleError 300;
// (2) error/empty/search paths still return 3600 / 3600;
// (3) meta response still returns 86400 / 86400;
// (4) the ONLY 86400 values left in app/index.js are the meta line and
//     the badge-PNG Cache-Control line — no other long cache on
//     catalog/manifest responses.
// Run: node tests/test-v159.js (exit 0 = all pass)
'use strict';

const fs = require('fs');
const path = require('path');
const { MANIFEST, catalogs } = require('../app/lib/manifest');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.js'), 'utf8');
const lines = src.split('\n');

// ---------------------------------------------------------------------------
// 0. Manifest
// ---------------------------------------------------------------------------
console.log('=== 0. Manifest ===');
{
  const list = catalogs();
  eq(MANIFEST.id, 'com.bharatstreams', 'manifest id unchanged (no reinstall)');
  eq(MANIFEST.version, '1.6.0', 'manifest version 1.6.0');
  eq(list.length, 18, '18 catalogs (no row added or removed)');
}

// ---------------------------------------------------------------------------
// 1. Catalog success path: 300 / 300
// ---------------------------------------------------------------------------
console.log('=== 1. Catalog success TTL (300) ===');
{
  const success = lines.filter((l) => /return \{ metas, cacheMaxAge: 300, staleError: 300 \};/.test(l));
  eq(success.length, 1, 'exactly one catalog success return with 300/300');
  check(!/return \{ metas, cacheMaxAge: 86400, staleError: 86400 \};/.test(src),
    'no catalog return still carries 86400');
}

// ---------------------------------------------------------------------------
// 2. Error / empty / search paths: still 3600
// ---------------------------------------------------------------------------
console.log('=== 2. Error/empty/search TTLs (3600, untouched) ===');
{
  const short = lines.filter((l) => /cacheMaxAge: 3600, staleError: 3600/.test(l));
  eq(short.length, 3, 'disabled-catalog, search and missing-catalog paths still 3600/3600');
}

// ---------------------------------------------------------------------------
// 3. Meta response: still 86400
// ---------------------------------------------------------------------------
console.log('=== 3. Meta TTL (86400, untouched) ===');
{
  const meta = lines.filter((l) => /return \{ meta, cacheMaxAge: 86400, staleError: 86400 \};/.test(l));
  eq(meta.length, 1, 'exactly one meta return with 86400/86400');
}

// ---------------------------------------------------------------------------
// 4. No other long cache left in index.js
// ---------------------------------------------------------------------------
console.log('=== 4. No other 86400 left ===');
{
  const hits = lines
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ l }) => l.includes('86400'));
  eq(hits.length, 2, 'exactly two 86400 occurrences left in app/index.js');
  check(hits.every(({ l }) => /return \{ meta, cacheMaxAge: 86400/.test(l) || /Cache-Control', 'public, max-age=86400'/.test(l)),
    'both are the meta return and the badge-PNG Cache-Control (static assets)');
  check(!/max-age=86400/.test(src.replace(/Cache-Control', 'public, max-age=86400'/, '')),
    'no other max-age=86400 anywhere in app/index.js');
}

console.log(fail === 0 ? '\nALL v1.6.0 TESTS PASSED' : `\n${fail} v1.6.0 TEST(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
