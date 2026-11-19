// Binge Addon — New Releases row tests (v1.3.1, basant: "Trending in
// India ke niche karo — new release, India + worldwide, movies and web
// series dono" + "South Indian Blockbusters" removed).
//
// Covers, with a stubbed TMDB fetch (no key, no network):
// (0) manifest — new rows sit directly under the two Trending in India
//     rows; south-blockbusters-movie is gone (28 catalogs);
// (1) movie row — 45-day window, vote_average>=6.5 AND vote_count>=100
//     floors, Indian pool reserved at 10, worldwide pool fills the
//     rest, merged newest-first, no-imdb titles excluded;
// (2) series row — same shape plus the v1.4 TV-show filter (Talk Show /
//     100+ eps dropped);
// (3) thin Indian pool — worldwide fills the row;
// (4) stats.newReleases counts + newest/oldest dates.
// Run: node tests/test-new-releases.js (exit 0 = all pass)
'use strict';

const { buildRows, isIndianTitle } = require('../app/scripts/build-catalogs');
const { catalogs } = require('../app/lib/manifest');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const DAY = 24 * 60 * 60 * 1000;
const daysAgoStr = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 0. Manifest — position + removal
// ---------------------------------------------------------------------------
console.log('=== 0. Manifest ===');
{
  const list = catalogs();
  eq(list.length, 18, '18 catalogs (17 + Indian TV & Reality Shows)');
  eq(list[0].id, 'trending-indian-movie', 'row 1 = Trending in India movie');
  eq(list[1].id, 'trending-indian-series', 'row 2 = Trending in India series');
  eq(list[2].id, 'new-releases-movie', 'row 3 = New Releases movie (directly under Trending India)');
  eq(list[3].id, 'new-releases-series', 'row 4 = New Releases series (directly under Trending India)');
  eq(list[2].name, 'New Releases — India + Worldwide', 'movie row name');
  eq(list[3].name, 'New Releases — India + Worldwide', 'series row name');
  check(!list.some((c) => c.id === 'south-blockbusters-movie'), 'south-blockbusters-movie is gone from the manifest');
  check(list.every((c) => c.extra && c.extra[0].name === 'search'), 'new rows carry the search extra like the rest');
}

// ---------------------------------------------------------------------------
// Stub TMDB — datasets are swapped per section via DATASETS.
// ---------------------------------------------------------------------------
let DATASETS = null;

function mkMovie(id, name, daysAgo, va, vc, lang, countries, imdb) {
  return {
    id, title: name, release_date: daysAgoStr(daysAgo),
    vote_average: va, vote_count: vc, original_language: lang,
    origin_country: countries, popularity: 100 - daysAgo, imdb,
  };
}
function mkSeries(id, name, daysAgo, va, vc, lang, countries, imdb) {
  return {
    id, name, first_air_date: daysAgoStr(daysAgo),
    vote_average: va, vote_count: vc, original_language: lang,
    origin_country: countries, popularity: 100 - daysAgo, imdb,
  };
}

function fullDatasets() {
  const movies = [];
  // 12 Indian movies, 2 without imdb -> 10 keepers.
  const indDays = [2, 3, 5, 7, 9, 12, 15, 18, 22, 26, 31, 38];
  indDays.forEach((d, i) => movies.push(mkMovie(
    101 + i, `IND-${String(d).padStart(2, '0')}d`, d, 6.5 + (i % 4) * 0.5, 100 + i * 100,
    i % 2 ? 'te' : 'hi', ['IN'], i < 10 ? `tt1000${101 + i}` : null)));
  // 15 worldwide movies, 3 of them Indian-origin (must be excluded from
  // the worldwide pass, not double-counted as worldwide).
  const globDays = [1, 4, 6, 8, 11, 14, 17, 20, 24, 28, 33, 37, 41, 43, 44];
  globDays.forEach((d, i) => movies.push(mkMovie(
    201 + i, `GLO-${String(d).padStart(2, '0')}d`, d, 6.6 + (i % 3) * 0.4, 150 + i * 200,
    ['en', 'fr', 'ja'][i % 3], i < 3 ? ['IN'] : [['US'], ['GB'], ['JP']][i % 3],
    `tt2000${201 + i}`)));
  // Out of window + below floor (must never appear).
  movies.push(mkMovie(301, 'OLD-50d', 50, 8.0, 500, 'en', ['US'], 'tt3000301'));
  movies.push(mkMovie(302, 'OLD-60d', 60, 8.0, 500, 'en', ['US'], 'tt3000302'));
  movies.push(mkMovie(303, 'LOWVA-6.4', 5, 6.4, 500, 'en', ['US'], 'tt3000303'));
  movies.push(mkMovie(304, 'LOWVC-50', 5, 7.5, 50, 'en', ['US'], 'tt3000304'));
  // Split-floor cases (v1.3.1): Indian vc 50 passes the Indian floor
  // (10) and must appear; worldwide vc 50 fails the worldwide floor
  // (100) and must not.
  movies.push(mkMovie(113, 'IND-10d', 10, 7.0, 50, 'hi', ['IN'], 'tt1000113'));
  movies.push(mkMovie(216, 'GLOVC-09d', 9, 7.0, 50, 'en', ['US'], 'tt2000216'));

  const series = [];
  // 12 Indian series, 2 without imdb -> 10 keepers.
  const sIndDays = [2, 4, 6, 9, 11, 14, 17, 21, 25, 29, 34, 40];
  sIndDays.forEach((d, i) => series.push(mkSeries(
    401 + i, `SIND-${String(d).padStart(2, '0')}d`, d, 6.5 + (i % 4) * 0.5, 120 + i * 100,
    i % 2 ? 'ta' : 'hi', ['IN'], i < 10 ? `tt4000${401 + i}` : null)));
  // 15 worldwide series, 3 Indian-origin (excluded from worldwide pass).
  const sGlobDays = [1, 3, 5, 8, 10, 13, 16, 19, 23, 27, 32, 36, 39, 42, 44];
  sGlobDays.forEach((d, i) => series.push(mkSeries(
    501 + i, `SGLO-${String(d).padStart(2, '0')}d`, d, 6.6 + (i % 3) * 0.4, 150 + i * 200,
    ['en', 'ko', 'es'][i % 3], i < 3 ? ['IN'] : [['US'], ['KR'], ['GB']][i % 3],
    `tt5000${501 + i}`)));
  // TV-show filter traps (must never appear): Talk Show, 150 eps.
  series.push(mkSeries(601, 'TALKSHOW', 4, 8.5, 900, 'hi', ['IN'], 'tt6000601'));
  series.push(mkSeries(602, 'LONGRUN-150eps', 4, 8.5, 900, 'hi', ['IN'], 'tt6000602'));
  series.push(mkSeries(603, 'SOLD-55d', 55, 8.0, 500, 'en', ['US'], 'tt6000603'));
  series.push(mkSeries(604, 'SLOWVA-6.4', 4, 6.4, 500, 'en', ['US'], 'tt6000604'));
  // Split-floor cases (v1.3.1): Indian vc 50 passes the Indian floor
  // (10) and must appear; worldwide vc 20 fails the worldwide SERIES
  // floor (25) and must not; worldwide vc 30 passes it and must appear.
  series.push(mkSeries(413, 'SIND-10d', 10, 7.0, 50, 'hi', ['IN'], 'tt4000413'));
  series.push(mkSeries(513, 'SGLOVC-12d', 12, 7.0, 20, 'en', ['US'], 'tt5000513'));
  series.push(mkSeries(514, 'SGLO-15d', 15, 7.0, 30, 'en', ['US'], 'tt5000514'));
  return { movies, series };
}

function thinDatasets() {
  const d = fullDatasets();
  // Keep only 3 qualifying Indian movies (rest lose their imdb id —
  // including the 3 Indian-origin titles in the worldwide pool and the
  // split-floor IND-10d, so the Indian pass genuinely finds only 3).
  d.movies.forEach((m) => { if ((m.id >= 104 && m.id <= 113) || (m.id >= 201 && m.id <= 203)) m.imdb = null; });
  return d;
}

function filterDiscover(items, q, itemField, paramField) {
  let out = items.slice();
  const origin = q.get('with_origin_country');
  if (origin) out = out.filter((it) => (it.origin_country || []).includes(origin));
  const va = parseFloat(q.get('vote_average.gte') || '0');
  if (va) out = out.filter((it) => (it.vote_average || 0) >= va);
  const vc = parseInt(q.get('vote_count.gte') || '0', 10);
  if (vc) out = out.filter((it) => (it.vote_count || 0) >= vc);
  const gte = q.get(`${paramField}.gte`);
  const lte = q.get(`${paramField}.lte`);
  if (gte) out = out.filter((it) => (it[itemField] || '') >= gte);
  if (lte) out = out.filter((it) => (it[itemField] || '') <= lte);
  const sort = q.get('sort_by') || '';
  if (sort.includes(itemField)) {
    out.sort((a, b) => (b[itemField] || '').localeCompare(a[itemField] || ''));
  } else if (sort.startsWith('popularity')) {
    out.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  } else if (sort.startsWith('vote_average')) {
    out.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
  }
  const page = parseInt(q.get('page') || '1', 10);
  return { results: out.slice((page - 1) * 20, page * 20) };
}

function seriesDetail(item) {
  const detail = {
    id: item.id, name: item.name, type: 'Scripted',
    number_of_episodes: 12, networks: [], status: 'Ended',
    origin_country: item.origin_country || [],
    genres: [],
    external_ids: { imdb_id: item.imdb || null },
  };
  if (item.id === 601) detail.type = 'Talk Show';
  if (item.id === 602) detail.number_of_episodes = 150;
  return detail;
}

async function stubFetch(url) {
  const u = new URL(url);
  const path = u.pathname;
  const q = u.searchParams;
  const json = (obj) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => obj });
  if (path === '/3/discover/movie') return json(filterDiscover(DATASETS.movies, q, 'release_date', 'primary_release_date'));
  if (path === '/3/discover/tv') return json(filterDiscover(DATASETS.series, q, 'first_air_date', 'first_air_date'));
  const mExt = path.match(/^\/3\/movie\/(\d+)\/external_ids$/);
  if (mExt) {
    const item = DATASETS.movies.find((m) => m.id === +mExt[1]);
    return json({ imdb_id: item ? (item.imdb || null) : null });
  }
  const mDet = path.match(/^\/3\/movie\/(\d+)$/);
  if (mDet) {
    const item = DATASETS.movies.find((m) => m.id === +mDet[1]);
    return json({ id: +mDet[1], status: 'Released', origin_country: item ? item.origin_country : [],
      external_ids: { imdb_id: item ? (item.imdb || null) : null }, release_dates: { results: [] } });
  }
  const mTv = path.match(/^\/3\/tv\/(\d+)$/);
  if (mTv) {
    const item = DATASETS.series.find((s) => s.id === +mTv[1]);
    return json(item ? seriesDetail(item) : { id: +mTv[1], type: 'Scripted', number_of_episodes: 10, networks: [], external_ids: { imdb_id: null } });
  }
  return json({ results: [] });
}

async function buildWithStub(type) {
  const realFetch = global.fetch;
  global.fetch = stubFetch;
  try {
    const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, keywords: null, trendingTopUp: {} };
    const rows = await buildRows(type, 'TESTKEY', {}, stats, {
      seriesCache: new Map(), movieCache: new Map(), keywordIds: [], config: null,
    });
    return { rows, stats };
  } finally {
    global.fetch = realFetch;
  }
}

const names = (metas) => metas.map((m) => m.name);
const daysInNames = (metas) => names(metas).map((n) => parseInt(n.split('-')[1], 10));

(async () => {
  // ---------------------------------------------------------------------------
  // 1. Movie row — full pools
  // ---------------------------------------------------------------------------
  console.log('=== 1. Movie row (full pools) ===');
  DATASETS = fullDatasets();
  {
    const { rows, stats } = await buildWithStub('movie');
    const row = rows['new-releases'] || [];
    eq(row.length, 20, 'movie row fills to 20');
    const s = stats.newReleases.movie;
    eq(s.total, 20, 'stats total 20');
    eq(s.indian, 10, 'stats indian 10 (reserved pool)');
    eq(s.worldwide, 10, 'stats worldwide 10');
    eq(s.windowDays, 45, 'stats windowDays 45');
    eq(s.newest, daysAgoStr(1), 'newest = 1 day ago (GLO-01d, Indian-origin found by the Indian pass)');
    eq(s.oldest, daysAgoStr(41), 'oldest = 41 days ago (page-1 keeps 7, page-2 fill stops at target 10)');
    const ds = daysInNames(row);
    check(ds.every((d, i) => i === 0 || ds[i - 1] <= d), `merged newest-first (days asc in names): ${ds.join(',')}`);
    check(names(row).filter((n) => n.startsWith('IND-')).length === 7, '7 IND- titles (the other 3 Indian slots are GLO-01d/04d/06d — Indian-origin, found by the Indian pass)');
    check(names(row).includes('GLO-01d'), 'Indian-origin title in the global pool is picked up by the Indian pass, not lost');
    check(names(row).includes('IND-10d'), 'split floor: Indian vc 50 passes the Indian floor (10)');
    check(!names(row).includes('GLOVC-09d'), 'split floor: worldwide vc 50 fails the worldwide floor (100)');
    check(!names(row).some((n) => n.startsWith('OLD-') || n.startsWith('LOWVA') || n.startsWith('LOWVC')),
      'out-of-window + below-floor titles never appear');
    check(!names(row).some((n) => n === 'IND-31d' || n === 'IND-38d'),
      'no-imdb Indian titles (IND-31d, IND-38d) excluded');
    check(isIndianTitle({ origin_country: ['IN'], original_language: 'en' }), 'isIndianTitle: origin IN');
    check(isIndianTitle({ origin_country: [], original_language: 'te' }), 'isIndianTitle: Indian language');
    check(!isIndianTitle({ origin_country: ['US'], original_language: 'en' }), 'isIndianTitle: US title is not Indian');
  }

  // ---------------------------------------------------------------------------
  // 2. Series row — full pools + TV filter
  // ---------------------------------------------------------------------------
  console.log('=== 2. Series row (full pools + TV filter) ===');
  DATASETS = fullDatasets();
  {
    const { rows, stats } = await buildWithStub('series');
    const row = rows['new-releases'] || [];
    eq(row.length, 20, 'series row fills to 20');
    const s = stats.newReleases.series;
    eq(s.total, 20, 'stats total 20');
    eq(s.indian, 10, 'stats indian 10');
    eq(s.worldwide, 10, 'stats worldwide 10');
    check(!names(row).includes('TALKSHOW'), 'Talk Show dropped by the TV filter');
    check(!names(row).includes('LONGRUN-150eps'), '150-episode show dropped by the TV filter');
    check(names(row).includes('SIND-10d'), 'split floor: Indian series vc 50 passes the Indian floor (10)');
    check(!names(row).includes('SGLOVC-12d'), 'split floor: worldwide series vc 20 fails the series floor (25)');
    check(names(row).includes('SGLO-15d'), 'split floor: worldwide series vc 30 passes the series floor (25)');
    check(!names(row).some((n) => n.startsWith('SOLD-') || n.startsWith('SLOWVA')),
      'out-of-window + below-floor series never appear');
    const ds = daysInNames(row);
    check(ds.every((d, i) => i === 0 || ds[i - 1] <= d), `merged newest-first: ${ds.join(',')}`);
  }

  // ---------------------------------------------------------------------------
  // 3. Thin Indian pool — worldwide fills the row
  // ---------------------------------------------------------------------------
  console.log('=== 3. Thin Indian pool ===');
  DATASETS = thinDatasets();
  {
    const { rows, stats } = await buildWithStub('movie');
    const row = rows['new-releases'] || [];
    eq(row.length, 15, 'row fills to 15 (3 Indian + 12 worldwide available)');
    const s = stats.newReleases.movie;
    eq(s.indian, 3, 'stats indian 3 (thin pool, honest)');
    eq(s.worldwide, 12, 'stats worldwide 12 (fills the row)');
  }

  console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILURES`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
