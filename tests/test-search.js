// Binge Addon — catalog search tests (v1.1.7).
// Proves the fix for basant's report (19 Nov 2026): Nuvio Search
// "reacher" -> "No searchable catalogs".
//   §1  mapSearchResult: TMDB item -> Stremio meta preview (pure).
//   §2  searchCatalogs with a STUBBED TMDB (offline): live-TMDB shape,
//       no-Imdb results skipped (never invented), cap 20, TMDB order
//       kept, empty query / no key / TMDB error -> empty metas.
//   §3  Manifest: all 27 catalogs carry extra search (isRequired
//       false), version 1.1.7, manifest < 8 KB, effectiveCatalogs keeps
//       the extra through (the served /manifest.json path).
//   §4  LIVE (production, gated): runs only when /health reports
//       1.1.7 — otherwise prints SKIP (pre-deploy the old live build
//       has no search). When live: ?search=reacher returns Reacher
//       (series, tt9288030, poster), the path-extra form
//       /search=reacher.json does too, ?search=jailer returns Jailer 2,
//       ?search=ramayana returns Ramayana, ?search=zzznothinghere
//       returns EMPTY metas (never the full row), and the plain
//       no-search catalogs still return their 20-item rows unchanged.
// Run: node tests/test-search.js  (exit 0 = all pass)
// Env: SEARCH_BASE_URL (default: production Vercel URL).
'use strict';

const { searchCatalogs, mapSearchResult, SEARCH_CAP } = require('../app/lib/search');
const { MANIFEST, catalogs } = require('../app/lib/manifest');
const { effectiveCatalogs, defaultConfig } = require('../app/lib/config');

const BASE = process.env.SEARCH_BASE_URL || 'https://binge-addon-httpbasant2-9067s-projects.vercel.app';

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

// ---------------------------------------------------------------------------
// 1. mapSearchResult — pure mapping
// ---------------------------------------------------------------------------
console.log('=== 1. mapSearchResult ===');
{
  const m = mapSearchResult('series', {
    name: 'Reacher', first_air_date: '2022-02-04',
    poster_path: '/reacher.jpg', backdrop_path: '/reacher-bg.jpg',
    overview: 'A drifter with a past.',
  }, 'tt9288030');
  eq(m.id, 'tt9288030', 'id = resolved IMDb id');
  eq(m.type, 'series', 'type passes through');
  eq(m.name, 'Reacher', 'name from TMDB name (tv)');
  eq(m.poster, 'https://image.tmdb.org/t/p/w342/reacher.jpg', 'poster w342');
  eq(m.background, 'https://image.tmdb.org/t/p/w780/reacher-bg.jpg', 'background w780');
  eq(m.year, '2022', 'year from first_air_date');
  eq(m.releaseInfo, '2022', 'releaseInfo = year');
  eq(m.description, 'A drifter with a past.', 'description from overview');

  const mv = mapSearchResult('movie', {
    title: 'Jailer 2', release_date: '2026-10-15',
    poster_path: '/j2.jpg', overview: '',
  }, 'tt33318732');
  eq(mv.name, 'Jailer 2', 'movie name from TMDB title');
  eq(mv.year, '2026', 'movie year from release_date');
  eq(mv.background, undefined, 'no backdrop -> background omitted, never invented');
  eq(mv.description, undefined, 'empty overview -> description omitted');
  const noPoster = mapSearchResult('movie', { title: 'X', release_date: '' }, 'tt0000001');
  eq(noPoster.poster, undefined, 'no poster_path -> poster omitted');
  eq(noPoster.year, undefined, 'no date -> year omitted');
}

// ---------------------------------------------------------------------------
// 2. searchCatalogs — stubbed TMDB (offline)
// ---------------------------------------------------------------------------
console.log('=== 2. searchCatalogs (stubbed TMDB) ===');
const savedKey = process.env.TMDB_API_KEY;
process.env.TMDB_API_KEY = 'fake-key-for-tests-only';

// Stub fetch: records URLs; /search/* returns canned results;
// /external_ids returns imdb ids except tt-less / failing items.
function stubFetchFactory(searchResults, imdbMap, failIds = []) {
  const seen = [];
  const fn = async (url) => {
    seen.push(url);
    if (url.includes('/search/')) {
      return { ok: true, json: async () => ({ results: searchResults }) };
    }
    const m = url.match(/\/(movie|tv)\/(\d+)\/external_ids/);
    if (m) {
      const tmdbId = m[2];
      if (failIds.includes(tmdbId)) return { ok: false, status: 500, json: async () => ({}) };
      const imdb = imdbMap[tmdbId];
      return { ok: true, json: async () => (imdb ? { imdb_id: imdb } : {}) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  fn.seen = seen;
  return fn;
}

(async () => {
  // 2a. Movie search: order kept, no-imdb item skipped, failure skipped.
  {
    const results = [
      { id: 101, title: 'Jailer 2', release_date: '2026-10-15', poster_path: '/j2.jpg', overview: 'Tiger is back.' },
      { id: 102, title: 'Jailer', release_date: '2023-08-10', poster_path: '/j1.jpg', overview: 'First one.' },
      { id: 103, title: 'No Imdb Film', release_date: '2020-01-01', poster_path: '/x.jpg', overview: 'No external id.' },
      { id: 104, title: 'Broken Ids Film', release_date: '2019-01-01', poster_path: '/y.jpg', overview: 'external_ids 500s.' },
    ];
    const stub = stubFetchFactory(results, { 101: 'tt33318732', 102: 'tt11634112' }, ['104']);
    const { metas } = await searchCatalogs('movie', 'jailer', stub);
    eq(metas.length, 2, '2 metas: no-imdb + external_ids-failure items skipped, never invented');
    eq(metas[0].id, 'tt33318732', 'first = Jailer 2 (TMDB order kept)');
    eq(metas[0].name, 'Jailer 2', 'first name Jailer 2');
    eq(metas[1].id, 'tt11634112', 'second = Jailer (2023)');
    check(metas.every((m) => m.poster && m.poster.startsWith('https://image.tmdb.org/t/p/w342/')),
      'every meta has a w342 poster');
    check(stub.seen.some((u) => u.includes('/search/movie?') && u.includes('query=jailer')),
      'movie search hits TMDB /search/movie with the query');
    check(stub.seen.some((u) => u.includes('/movie/101/external_ids')),
      'IMDb id resolved via /movie/{id}/external_ids');
  }

  // 2b. Series search hits /search/tv, Reacher maps to tt9288030.
  {
    const results = [{ id: 201, name: 'Reacher', first_air_date: '2022-02-04', poster_path: '/r.jpg', overview: 'Drifter.' }];
    const stub = stubFetchFactory(results, { 201: 'tt9288030' });
    const { metas } = await searchCatalogs('series', 'reacher', stub);
    eq(metas.length, 1, 'series search returns 1 meta');
    eq(metas[0].id, 'tt9288030', 'Reacher IMDb id tt9288030');
    eq(metas[0].type, 'series', 'type series');
    eq(metas[0].year, '2022', 'Reacher year 2022');
    check(stub.seen.some((u) => u.includes('/search/tv?')), 'series search hits TMDB /search/tv');
  }

  // 2c. Cap: 25 TMDB results -> 20 metas max.
  {
    const results = Array.from({ length: 25 }, (_, i) => ({
      id: 300 + i, title: `Film ${i}`, release_date: '2024-01-01', poster_path: '/p.jpg', overview: 'x',
    }));
    const imdbMap = {};
    results.forEach((r) => { imdbMap[r.id] = `tt${1000000 + r.id}`; });
    const stub = stubFetchFactory(results, imdbMap);
    const { metas } = await searchCatalogs('movie', 'film', stub);
    eq(metas.length, SEARCH_CAP, `cap: 25 results -> ${SEARCH_CAP} metas`);
    eq(SEARCH_CAP, 20, 'SEARCH_CAP is 20');
  }

  // 2d. Empty / whitespace query -> empty, TMDB never called.
  {
    const stub = stubFetchFactory([], {});
    eq((await searchCatalogs('movie', '', stub)).metas.length, 0, 'empty query -> empty metas');
    eq((await searchCatalogs('movie', '   ', stub)).metas.length, 0, 'whitespace query -> empty metas');
    eq(stub.seen.length, 0, 'empty query never calls TMDB');
  }

  // 2e. No TMDB key -> empty, TMDB never called.
  {
    delete process.env.TMDB_API_KEY;
    const stub = stubFetchFactory([{ id: 1, title: 'X' }], { 1: 'tt0000001' });
    eq((await searchCatalogs('movie', 'x', stub)).metas.length, 0, 'no TMDB key -> empty metas');
    eq(stub.seen.length, 0, 'no key never calls TMDB');
    process.env.TMDB_API_KEY = 'fake-key-for-tests-only';
  }

  // 2f. TMDB search error / unknown type -> empty, never the catalog.
  {
    const errStub = async () => ({ ok: false, status: 500, json: async () => ({}) });
    eq((await searchCatalogs('movie', 'x', errStub)).metas.length, 0, 'TMDB 500 -> empty metas');
    const stub = stubFetchFactory([], {});
    eq((await searchCatalogs('channel', 'x', stub)).metas.length, 0, 'unknown type -> empty metas');
    eq(stub.seen.length, 0, 'unknown type never calls TMDB');
  }

  // ---------------------------------------------------------------------------
  // 3. Manifest + effectiveCatalogs
  // ---------------------------------------------------------------------------
  console.log('=== 3. Manifest (search extra) ===');
  {
    eq(MANIFEST.version, '1.3.1', 'manifest version 1.3.1');
    eq(catalogs().length, 28, '28 catalogs');
    check(catalogs().every((c) => Array.isArray(c.extra) && c.extra.length === 1
      && c.extra[0].name === 'search' && c.extra[0].isRequired === false),
    'ALL 28 catalogs carry extra [{ name: "search", isRequired: false }]');
    const bytes = Buffer.byteLength(JSON.stringify(MANIFEST));
    check(bytes < 8192, `manifest stringifies to ${bytes} bytes (< 8 KB)`);
    const eff = effectiveCatalogs(defaultConfig());
    eq(eff.length, 28, 'effectiveCatalogs (served manifest path) still 28');
    check(eff.every((c) => c.extra && c.extra[0].name === 'search' && c.extra[0].isRequired === false),
      'effectiveCatalogs carries the search extra through (not stripped)');
  }

  if (savedKey === undefined) delete process.env.TMDB_API_KEY;
  else process.env.TMDB_API_KEY = savedKey;

  // ---------------------------------------------------------------------------
  // 4. LIVE (production, gated on /health version)
  // ---------------------------------------------------------------------------
  console.log('=== 4. Live production search (gated) ===');
  try {
    const hRes = await fetch(`${BASE}/health`);
    const health = await hRes.json();
    if (health.version !== '1.3.1') {
      console.log(`  ⊘ SKIP live search checks — production is still ${health.version} (deploy 1.3.1 first)`);
    } else {
      const getMetas = async (path) => {
        const r = await fetch(`${BASE}${path}`);
        check(r.ok, `GET ${path} -> HTTP ${r.status}`);
        const d = await r.json();
        return Array.isArray(d.metas) ? d.metas : null;
      };
      // 4a. ?search=reacher (query form, basant's exact report)
      const reacher = await getMetas('/catalog/series/trending-indian-series.json?search=reacher');
      check(Array.isArray(reacher), '?search=reacher returns a metas list');
      check(reacher.some((m) => m.id === 'tt9288030' && /reacher/i.test(m.name)),
        `?search=reacher returns Reacher (tt9288030): ${JSON.stringify(reacher.slice(0, 2).map((m) => m.name))}`);
      check(reacher.every((m) => m.type === 'series'), '?search=reacher results are all series');
      check(reacher.length > 0 && reacher.length <= 20, `?search=reacher returns 1-20 metas (got ${reacher.length})`);
      const r0 = reacher.find((m) => m.id === 'tt9288030');
      check(!!(r0 && r0.poster), 'Reacher meta has a poster');
      // 4b. Path-extra form (the real Stremio/Nuvio form)
      const reacherPath = await getMetas('/catalog/series/trending-indian-series/search=reacher.json');
      check(reacherPath.some((m) => m.id === 'tt9288030'),
        'path-extra form /search=reacher.json also returns Reacher');
      // 4c. jailer + ramayana
      const jailer = await getMetas('/catalog/movie/trending-indian-movie.json?search=jailer');
      check(jailer.some((m) => m.id === 'tt33318732' && /jailer 2/i.test(m.name)),
        `?search=jailer returns Jailer 2 (tt33318732): ${JSON.stringify(jailer.slice(0, 2).map((m) => m.name))}`);
      const ram = await getMetas('/catalog/movie/trending-indian-movie.json?search=ramayana');
      check(ram.some((m) => m.id === 'tt27988879' && /ramayana/i.test(m.name)),
        `?search=ramayana returns Ramayana (tt27988879): ${JSON.stringify(ram.slice(0, 2).map((m) => m.name))}`);
      // 4d. Unknown query -> EMPTY metas, never the full row.
      const none = await getMetas('/catalog/movie/trending-indian-movie.json?search=zzznothinghere');
      eq(Array.isArray(none) ? none.length : -1, 0, '?search=zzznothinghere returns EMPTY metas (not the 20-item row)');
      // 4e. No-search path unchanged: 20/20 rows, same first items as pre-1.1.7 baseline.
      const plainM = await getMetas('/catalog/movie/trending-indian-movie.json');
      eq(plainM.length, 20, 'plain trending-indian-movie still 20 items');
      eq(plainM[0] && plainM[0].name, 'Ramayana: Rise of a Legend', 'plain movie row first item unchanged (Ramayana)');
      const plainS = await getMetas('/catalog/series/trending-indian-series.json');
      eq(plainS.length, 20, 'plain trending-indian-series still 20 items');
      eq(plainS[0] && plainS[0].name, 'Ali Baba Aur 40 Bhoot', 'plain series row first item unchanged (Ali Baba Aur 40 Bhoot)');
    }
  } catch (e) {
    check(false, `live section failed: ${e.message}`);
  }

  console.log(fail === 0 ? '\nALL SEARCH TESTS PASSED' : `\n${fail} SEARCH TEST(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})();
