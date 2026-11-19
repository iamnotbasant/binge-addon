// Binge Addon — Releasing Next 30 Days row tests (v1.3.3, basant:
// "Dhindora launch hone wala hai kuch dino mai, uska mention ku nhi hai"
// + "Indian movies / movies jo big drops honge next 30 days me").
//
// Covers, with a stubbed TMDB fetch (no key, no network):
// (0) manifest — both rows still present (28 catalogs, nothing removed);
// (1) movie row — Indian pass reserves 10 slots (origin IN, in-window),
//     worldwide pass fills the rest and skips Indian-origin titles,
//     merged by release date desc, no-imdb / out-of-window excluded,
//     King (+35d, outside the window) is never forced in. The Indian
//     pass selects by IMMINENCE (release date asc — build 2 proved TMDB
//     popularity cuts real Indian drops: Pratap + Eetha have IMDb ids
//     yet missed the popularity top 10 live): the early + obscure Indian
//     title must be IN and the late + popular one OUT, proving date-asc
//     selection; the worldwide pass keeps popularity selection;
// (2) series row — premiere pass (first_air_date in window, target 10)
//     + returning pass (status Returning Series, next_episode_to_air in
//     window), merged by air date ASC (soonest first — tomorrow's
//     premiere/returning title leads), TV-show filter applies to both
//     passes, next_episode_to_air null / out-of-window excluded;
// (3) thin premiere pool — returning seasons fill the row.
// Run: node tests/test-releasing-next-30.js (exit 0 = all pass)
'use strict';

const { buildRows } = require('../app/scripts/build-catalogs');
const { catalogs } = require('../app/lib/manifest');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const DAY = 24 * 60 * 60 * 1000;
const daysStr = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 0. Manifest — rows still present
// ---------------------------------------------------------------------------
console.log('=== 0. Manifest ===');
{
  const list = catalogs();
  eq(list.length, 30, '30 catalogs (28 + 2 buzz)');
  check(list.some((c) => c.id === 'releasing-next-30-days-movie'), 'releasing-next-30-days-movie present');
  check(list.some((c) => c.id === 'releasing-next-30-days-series'), 'releasing-next-30-days-series present');
}

// ---------------------------------------------------------------------------
// Stub TMDB — datasets are swapped per section via DATASETS.
// ---------------------------------------------------------------------------
let DATASETS = null;

function mkMovie(id, name, daysAhead, lang, countries, imdb, pop) {
  return {
    id, title: name, release_date: daysStr(daysAhead),
    vote_average: 7.0, vote_count: 50, original_language: lang,
    origin_country: countries, popularity: pop === undefined ? 100 - daysAhead : pop, imdb,
  };
}
function mkSeries(id, name, daysAhead, lang, countries, imdb, ret, stale) {
  // ret: null = premiere (no next_episode_to_air); { daysAhead } =
  // returning season whose next episode airs that far ahead; 'none' =
  // returning season with next_episode_to_air null. stale = the Dhindora
  // case: S2 airs soon but TMDB still marks the show 'Ended' and
  // next_episode_to_air is null — only seasons[] proves it.
  return {
    id, name, first_air_date: daysStr(daysAhead),
    vote_average: 7.0, vote_count: 50, original_language: lang,
    origin_country: countries, popularity: 100 - daysAhead, imdb, ret,
    stale: !!stale, status: ret && !stale ? 'Returning Series' : 'Ended',
  };
}

function fullDatasets() {
  const movies = [];
  // 12 Indian movies in the window. Popularity is INDEPENDENT of date:
  // the early + obscure title (IND+01d, pop 5 — the Pratap case) must
  // be picked by date-asc selection, and the late + popular one
  // (IND+29d, pop 500) must be cut; popularity selection would do the
  // opposite. The +28d title has no imdb id.
  const indSpec = [
    [1, 5, true], [2, 50, true], [4, 50, true], [7, 50, true],
    [10, 50, true], [13, 50, true], [16, 50, true], [19, 50, true],
    [22, 50, true], [25, 50, true], [28, 50, false], [29, 500, true],
  ];
  indSpec.forEach(([d, pop, hasImdb], i) => movies.push(mkMovie(
    101 + i, `IND+${String(d).padStart(2, '0')}d`, d,
    i % 2 ? 'te' : 'hi', ['IN'], hasImdb ? `tt1000${101 + i}` : null, pop)));
  // 15 worldwide movies in the window, 3 of them Indian-origin (named
  // GLOIN+ — they belong to the Indian pass, must be excluded from the
  // worldwide pass and not double-counted as worldwide).
  const globDays = [1, 3, 5, 8, 11, 14, 17, 20, 23, 26, 29, 30, 2, 6, 9];
  globDays.forEach((d, i) => movies.push(mkMovie(
    201 + i, `${i < 3 ? 'GLOIN' : 'GLO'}+${String(d).padStart(2, '0')}d`, d,
    ['en', 'fr', 'ja'][i % 3], i < 3 ? ['IN'] : [['US'], ['GB'], ['JP']][i % 3],
    `tt2000${201 + i}`)));
  // Out of window + King (24 Dec = +35d, outside the 30-day window):
  // must never appear, never forced in.
  movies.push(mkMovie(301, 'PAST-05d', -5, 'en', ['US'], 'tt3000301'));
  movies.push(mkMovie(302, 'KING+35d', 35, 'hi', ['IN'], 'tt3000302'));
  movies.push(mkMovie(303, 'FAR+40d', 40, 'en', ['US'], 'tt3000303'));

  const series = [];
  // 12 premieres in the window, 2 without imdb -> 10 keepers.
  const premDays = [1, 2, 4, 7, 10, 13, 16, 19, 22, 25, 28, 29];
  premDays.forEach((d, i) => series.push(mkSeries(
    401 + i, `PREM+${String(d).padStart(2, '0')}d`, d,
    i % 2 ? 'ta' : 'hi', ['IN'], i < 10 ? `tt4000${401 + i}` : null, null)));
  // 8 returning seasons with a next episode in the window, 1 without
  // imdb -> 7 keepers. The +1d one is the Dhindora case (tomorrow).
  const retDays = [1, 2, 3, 5, 8, 12, 18, 25];
  retDays.forEach((d, i) => series.push(mkSeries(
    501 + i, `RET+${String(d).padStart(2, '0')}d`, -900 - i,
    'en', ['US'], i < 7 ? `tt5000${501 + i}` : null, { daysAhead: d })));
  // Stale-status Indian returning season (the Dhindora case): S2 airs
  // tomorrow, but TMDB still marks the show 'Ended' and
  // next_episode_to_air is null — only the seasons[] air_date proves
  // it. B1 (with_status=0) cannot see it; B2 (Indian, no status
  // filter) must catch it.
  series.push(mkSeries(701, 'STALE+01d', -900, 'hi', ['IN'], 'tt7000701', { daysAhead: 1 }, true));
  // Returning traps (must never appear): Talk Show, next episode out of
  // window, next_episode_to_air null.
  series.push(mkSeries(601, 'RET-TALKSHOW', -800, 'hi', ['IN'], 'tt6000601', { daysAhead: 2 }));
  series.push(mkSeries(602, 'RET-FAR+40d', -801, 'en', ['US'], 'tt6000602', { daysAhead: 40 }));
  series.push(mkSeries(603, 'RET-NONEXT', -802, 'en', ['US'], 'tt6000603', 'none'));
  // Out-of-window premieres (must never appear).
  series.push(mkSeries(604, 'PREM-PAST-03d', -3, 'en', ['US'], 'tt6000604', null));
  series.push(mkSeries(605, 'PREM+35d', 35, 'en', ['US'], 'tt6000605', null));
  return { movies, series };
}

function thinPremiereDatasets() {
  const d = fullDatasets();
  // Keep only 3 qualifying premieres (the rest lose their imdb id), so
  // the returning pass must fill the row: 3 premieres + 7 returning.
  d.series.forEach((s) => { if (s.id >= 404 && s.id <= 412) s.imdb = null; });
  return d;
}

function filterDiscover(items, q, itemField, paramField) {
  let out = items.slice();
  const origin = q.get('with_origin_country');
  if (origin) out = out.filter((it) => (it.origin_country || []).includes(origin));
  const ws = q.get('with_status');
  if (ws) {
    const want = ws.split('|').map((s) => ({ '0': 'Returning Series', '1': 'Planned', '2': 'In Production' }[s]));
    out = out.filter((it) => want.includes(it.status));
  }
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
    const asc = sort.endsWith('.asc');
    out.sort((a, b) => asc
      ? (a[itemField] || '').localeCompare(b[itemField] || '')
      : (b[itemField] || '').localeCompare(a[itemField] || ''));
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
    number_of_episodes: 12, number_of_seasons: 3, networks: [],
    status: item.ret && !item.stale ? 'Returning Series' : 'Ended',
    next_episode_to_air: null,
    seasons: [
      { season_number: 0, air_date: null },
      { season_number: 1, air_date: item.first_air_date },
    ],
    external_ids: { imdb_id: item.imdb || null },
  };
  if (item.ret && item.ret !== 'none') {
    // Season 2 premieres as S2E1 on the next-episode date (the Dhindora
    // shape: S2 episodes carry the air date even when the show-level
    // status/next_episode_to_air is stale on TMDB). A stale show has
    // next_episode_to_air null — only seasons[] proves it.
    if (!item.stale) {
      detail.next_episode_to_air = { air_date: daysStr(item.ret.daysAhead), episode_number: 1, season_number: 2 };
    }
    detail.seasons.push({ season_number: 2, air_date: daysStr(item.ret.daysAhead) });
  }
  if (item.id === 601) detail.type = 'Talk Show';
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
    return json(item ? seriesDetail(item) : { id: +mTv[1], type: 'Scripted', number_of_episodes: 10, number_of_seasons: 3, networks: [], status: 'Ended', next_episode_to_air: null, external_ids: { imdb_id: null } });
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
const daysInNames = (metas) => names(metas).map((n) => parseInt(n.split('+')[1], 10));

(async () => {
  // ---------------------------------------------------------------------------
  // 1. Movie row — full pools
  // ---------------------------------------------------------------------------
  console.log('=== 1. Movie row (full pools) ===');
  DATASETS = fullDatasets();
  {
    const { rows, stats } = await buildWithStub('movie');
    const row = rows['releasing-next-30-days'] || [];
    eq(row.length, 20, 'movie row fills to 20');
    const s = stats.releasingNext30.movie;
    eq(s.total, 20, 'stats total 20');
    eq(s.indian, 10, 'stats indian 10 (reserved pool)');
    eq(s.worldwide, 10, 'stats worldwide 10');
    eq(s.windowDays, 30, 'stats windowDays 30');
    const ds = daysInNames(row);
    check(ds.every((d, i) => i === 0 || ds[i - 1] >= d), 'merged by release date desc (latest first)');
    eq(ds[0], 26, 'first = +26d (latest date among popularity-selected titles)');
    check(names(row).includes('IND+01d'), 'early + obscure Indian title is IN (date-asc selection, the Pratap case)');
    check(!names(row).includes('IND+29d'), 'late + popular Indian title is OUT (date-asc selection)');
    check(names(row).every((n) => n.startsWith('IND+') || n.startsWith('GLO+') || n.startsWith('GLOIN+')), 'only in-window Indian + worldwide titles');
    check(!names(row).includes('KING+35d'), 'King (+35d) is NOT forced in');
    check(!names(row).includes('PAST-05d'), 'past title excluded');
    check(!names(row).includes('FAR+40d'), 'out-of-window title excluded');
    check(names(row).filter((n) => n.startsWith('IND+') || n.startsWith('GLOIN+')).length === 10, 'exactly 10 Indian-origin titles (no double-count)');
    check(names(row).filter((n) => n.startsWith('GLO+')).length === 10, 'exactly 10 worldwide titles');
  }

  // ---------------------------------------------------------------------------
  // 2. Series row — full pools
  // ---------------------------------------------------------------------------
  console.log('=== 2. Series row (full pools) ===');
  DATASETS = fullDatasets();
  {
    const { rows, stats } = await buildWithStub('series');
    const row = rows['releasing-next-30-days'] || [];
    eq(row.length, 18, 'series row = 10 premieres + 8 returning (7 + 1 stale)');
    const s = stats.releasingNext30.series;
    eq(s.total, 18, 'stats total 18');
    eq(s.premieres, 10, 'stats premieres 10');
    eq(s.returning, 8, 'stats returning 8');
    eq(s.windowDays, 30, 'stats windowDays 30');
    const ds = daysInNames(row);
    check(ds.every((d, i) => i === 0 || ds[i - 1] <= d), 'merged by air date asc (soonest first)');
    eq(row[0].name, 'PREM+01d', 'first = soonest premiere (+1d)');
    check(names(row).includes('RET+01d'), 'Dhindora case: returning title airing tomorrow is in the row');
    check(names(row).includes('STALE+01d'), 'stale-status Indian returning title is in the row (B2 caught it)');
    check(!names(row).includes('RET-TALKSHOW'), 'returning Talk Show excluded by the TV filter');
    check(!names(row).includes('RET-FAR+40d'), 'returning title with next episode out of window excluded');
    check(!names(row).includes('RET-NONEXT'), 'returning title with next_episode_to_air null excluded');
    check(!names(row).includes('PREM-PAST-03d'), 'past premiere excluded');
    check(!names(row).includes('PREM+35d'), 'out-of-window premiere excluded');
  }

  // ---------------------------------------------------------------------------
  // 3. Series row — thin premiere pool, returning fills
  // ---------------------------------------------------------------------------
  console.log('=== 3. Series row (thin premieres) ===');
  DATASETS = thinPremiereDatasets();
  {
    const { rows, stats } = await buildWithStub('series');
    const row = rows['releasing-next-30-days'] || [];
    eq(row.length, 11, 'thin row = 3 premieres + 8 returning (7 + 1 stale)');
    const s = stats.releasingNext30.series;
    eq(s.premieres, 3, 'stats premieres 3');
    eq(s.returning, 8, 'stats returning 8');
  }

  console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
