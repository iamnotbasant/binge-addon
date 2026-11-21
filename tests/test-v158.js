// Binge Addon — v1.5.8 same-day fresh rows tests (basant, 20 Nov 2026; version assertions bumped to 1.6.0 by v1.6.0):
// "agar koi season ya movie new release ho to fresh release mai add ho
// usi din" — a new season or movie must land in the fresh rows on its
// release day, newest first).
//
// Covers, with a stubbed TMDB fetch (no keys, no network):
// (0) manifest — version 1.6.0, 18 catalogs, new-releases at 2/3,
//     fresh-digital-drops-movie at 8, NO series version of it;
// (1) latestSeasonPremiere (direct) — Dhindora shape (S2 today) wins,
//     old seasons only -> null, newest season wins over an older one,
//     next_episode_to_air SxxE01 counts, season 0 ignored, future
//     season ignored;
// (2) isFreshDate (direct) — today + 7d boundary;
// (3) buildRows end-to-end (movie) — rated pass unchanged; day-1 movie
//     with 0 votes lands via the fresh path (poster required — the
//     no-poster day-1 title is excluded); 20-day-old unrated movie
//     stays out (too old for the fresh path, fails the rated floor);
//     freshest first; fresh-digital rated + fresh passes (day-1 digital
//     title lands #1, no-poster digital title excluded);
//     stats.newReleases.movie.fresh + stats.freshDigital.fresh;
// (4) buildRows end-to-end (series) — new premiere still lands;
//     Dhindora-shaped returning season (first aired 2021, S2 today)
//     lands via the returning pass, #1 by date; season 60 days old
//     stays out; returning Talk Show stays out (TV filter);
//     stats.newReleases.series.returning.
// Run: node tests/test-v158.js (exit 0 = all pass)
'use strict';

const { buildRows, latestSeasonPremiere, isFreshDate } = require('../app/scripts/build-catalogs');
const { MANIFEST, catalogs } = require('../app/lib/manifest');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
const names = (row) => (row || []).map((m) => m.name);

const DAY = 24 * 60 * 60 * 1000;
const daysAgoStr = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const todayStr = () => daysAgoStr(0);
const daysFrom = (n) => daysAgoStr(-n);

// ---------------------------------------------------------------------------
// 0. Manifest
// ---------------------------------------------------------------------------
console.log('=== 0. Manifest ===');
{
  const list = catalogs();
  eq(MANIFEST.id, 'com.bharatstreams', 'manifest id unchanged (no reinstall)');
  eq(MANIFEST.version, '1.6.3', 'manifest version 1.6.1');
  eq(list.length, 18, '18 catalogs (no row added or removed)');
  eq(list[2].id, 'new-releases-movie', 'row 3 = New Releases movie');
  eq(list[3].id, 'new-releases-series', 'row 4 = New Releases series');
  eq(list[8].id, 'fresh-digital-drops-movie', 'row 9 = Fresh Digital Drops movie');
  check(!list.some((c) => c.id === 'fresh-digital-drops-series'), 'no series version of Fresh Digital Drops (one catalog cannot mix movie + series)');
}

// ---------------------------------------------------------------------------
// 1. latestSeasonPremiere (direct)
// ---------------------------------------------------------------------------
console.log('=== 1. latestSeasonPremiere (direct) ===');
{
  const from = daysAgoStr(45);
  const to = todayStr();
  const dhindora = {
    next_episode_to_air: { air_date: to, episode_number: 1, season_number: 2 },
    seasons: [
      { season_number: 0, air_date: to },
      { season_number: 1, air_date: '2021-10-14' },
      { season_number: 2, air_date: to },
    ],
  };
  eq(latestSeasonPremiere(dhindora, from, to), to, 'Dhindora shape: S2 today wins (season 0 ignored)');
  const old = {
    next_episode_to_air: null,
    seasons: [
      { season_number: 1, air_date: '2021-10-14' },
      { season_number: 2, air_date: daysAgoStr(400) },
    ],
  };
  eq(latestSeasonPremiere(old, from, to), null, 'old seasons only -> null');
  const multi = {
    next_episode_to_air: null,
    seasons: [
      { season_number: 1, air_date: '2021-10-14' },
      { season_number: 2, air_date: daysAgoStr(30) },
      { season_number: 3, air_date: daysAgoStr(10) },
    ],
  };
  eq(latestSeasonPremiere(multi, from, to), daysAgoStr(10), 'newest season wins (S3 10d ago, not S2 30d ago)');
  const nextOnly = {
    next_episode_to_air: { air_date: daysAgoStr(2), episode_number: 1, season_number: 4 },
    seasons: [{ season_number: 1, air_date: '2021-10-14' }],
  };
  eq(latestSeasonPremiere(nextOnly, from, to), daysAgoStr(2), 'next_episode_to_air SxxE01 counts when seasons[] is stale');
  const nextNotPremiere = {
    next_episode_to_air: { air_date: to, episode_number: 5, season_number: 2 },
    seasons: [{ season_number: 1, air_date: '2021-10-14' }],
  };
  eq(latestSeasonPremiere(nextNotPremiere, from, to), null, 'next episode E05 is not a season premiere');
  const future = {
    next_episode_to_air: null,
    seasons: [
      { season_number: 1, air_date: '2021-10-14' },
      { season_number: 2, air_date: daysFrom(5) },
    ],
  };
  eq(latestSeasonPremiere(future, from, to), null, 'future season ignored (not released yet)');
  eq(latestSeasonPremiere(null, from, to), null, 'null detail -> null');
}

// ---------------------------------------------------------------------------
// 2. isFreshDate (direct)
// ---------------------------------------------------------------------------
console.log('=== 2. isFreshDate (direct) ===');
{
  const today = todayStr();
  check(isFreshDate(today, today, 7), 'today is fresh');
  check(isFreshDate(daysAgoStr(7), today, 7), '7 days ago is fresh (boundary in)');
  check(!isFreshDate(daysAgoStr(8), today, 7), '8 days ago is not fresh (boundary out)');
  check(!isFreshDate(daysFrom(1), today, 7), 'tomorrow is never fresh');
  check(!isFreshDate('', today, 7), 'empty date is not fresh');
  check(!isFreshDate(daysAgoStr(3), '', 7), 'empty today is not fresh');
}

// ---------------------------------------------------------------------------
// Stub TMDB — movie + series datasets for the end-to-end sections.
// ---------------------------------------------------------------------------
const MOVIES = {
  901: { id: 901, title: 'RATED-IND-10d', release_date: daysAgoStr(10), vote_average: 7.0, vote_count: 150, original_language: 'hi', origin_country: ['IN'], popularity: 90, poster_path: '/p901.jpg', imdb: 'tt9000901', digital: null },
  902: { id: 902, title: 'DAY1-IND', release_date: daysAgoStr(0), vote_average: 0, vote_count: 0, original_language: 'hi', origin_country: ['IN'], popularity: 95, poster_path: '/p902.jpg', imdb: 'tt9000902', digital: null },
  903: { id: 903, title: 'DAY1-NOPOSTER', release_date: daysAgoStr(0), vote_average: 0, vote_count: 0, original_language: 'hi', origin_country: ['IN'], popularity: 94, poster_path: null, imdb: 'tt9000903', digital: null },
  904: { id: 904, title: 'OLD-LOW-20d', release_date: daysAgoStr(20), vote_average: 0, vote_count: 0, original_language: 'en', origin_country: ['US'], popularity: 80, poster_path: '/p904.jpg', imdb: 'tt9000904', digital: null },
  905: { id: 905, title: 'DIG-RATED-20d', release_date: daysAgoStr(25), vote_average: 6.5, vote_count: 100, original_language: 'hi', origin_country: ['IN'], popularity: 85, poster_path: '/p905.jpg', imdb: 'tt9000905', digital: daysAgoStr(20) },
  906: { id: 906, title: 'DIG-DAY1', release_date: daysAgoStr(0), vote_average: 0, vote_count: 0, original_language: 'hi', origin_country: ['IN'], popularity: 93, poster_path: '/p906.jpg', imdb: 'tt9000906', digital: daysAgoStr(0) },
  907: { id: 907, title: 'DIG-NOPOSTER', release_date: daysAgoStr(0), vote_average: 0, vote_count: 0, original_language: 'hi', origin_country: ['IN'], popularity: 92, poster_path: null, imdb: 'tt9000907', digital: daysAgoStr(0) },
  908: { id: 908, title: 'GLO-RATED-05d', release_date: daysAgoStr(5), vote_average: 7.2, vote_count: 200, original_language: 'en', origin_country: ['US'], popularity: 88, poster_path: '/p908.jpg', imdb: 'tt9000908', digital: null },
};

const SERIES = {
  951: { id: 951, name: 'NEW-SHOW', first_air_date: daysAgoStr(3), vote_average: 7.5, vote_count: 30, original_language: 'hi', origin_country: ['IN'], popularity: 90, poster_path: '/s951.jpg', imdb: 'tt9000951', status: 'Ended', type: 'Scripted', eps: 8, seasons: [{ season_number: 1, air_date: daysAgoStr(3) }], next: null },
  952: { id: 952, name: 'DHINDORA', first_air_date: '2021-10-14', vote_average: 7.8, vote_count: 120, original_language: 'hi', origin_country: ['IN'], popularity: 85, poster_path: '/s952.jpg', imdb: 'tt14650074', status: 'Ended', type: 'Scripted', eps: 16, seasons: [{ season_number: 0, air_date: null }, { season_number: 1, air_date: '2021-10-14' }, { season_number: 2, air_date: daysAgoStr(0) }], next: { air_date: daysAgoStr(0), episode_number: 1, season_number: 2 } },
  953: { id: 953, name: 'OLD-SEASON', first_air_date: '2020-01-01', vote_average: 7.0, vote_count: 100, original_language: 'en', origin_country: ['US'], popularity: 80, poster_path: '/s953.jpg', imdb: 'tt9000953', status: 'Ended', type: 'Scripted', eps: 20, seasons: [{ season_number: 1, air_date: '2020-01-01' }, { season_number: 2, air_date: daysAgoStr(60) }], next: null },
  954: { id: 954, name: 'RET-TALKSHOW', first_air_date: '2022-01-01', vote_average: 8.0, vote_count: 200, original_language: 'hi', origin_country: ['IN'], popularity: 82, poster_path: '/s954.jpg', imdb: 'tt9000954', status: 'Returning Series', type: 'Talk Show', eps: 300, seasons: [{ season_number: 1, air_date: '2022-01-01' }, { season_number: 2, air_date: daysAgoStr(0) }], next: { air_date: daysAgoStr(0), episode_number: 1, season_number: 2 } },
  955: { id: 955, name: 'GLO-PREM-05d', first_air_date: daysAgoStr(5), vote_average: 7.0, vote_count: 100, original_language: 'en', origin_country: ['US'], popularity: 88, poster_path: '/s955.jpg', imdb: 'tt9000955', status: 'Ended', type: 'Scripted', eps: 10, seasons: [{ season_number: 1, air_date: daysAgoStr(5) }], next: null },
};

function filterMovies(q) {
  let out = Object.values(MOVIES).slice();
  const origin = q.get('with_origin_country');
  if (origin) out = out.filter((it) => (it.origin_country || []).includes(origin));
  if (q.get('watch_region')) return { results: [] }; // OTT Ready has no provider data here
  const va = parseFloat(q.get('vote_average.gte') || '0');
  if (va) out = out.filter((it) => (it.vote_average || 0) >= va);
  const vc = parseInt(q.get('vote_count.gte') || '0', 10);
  if (vc) out = out.filter((it) => (it.vote_count || 0) >= vc);
  const field = q.get('primary_release_date.gte') ? 'primary_release_date' : 'release_date';
  const gte = q.get(`${field}.gte`);
  const lte = q.get(`${field}.lte`);
  if (gte) out = out.filter((it) => (it.release_date || '') >= gte);
  if (lte) out = out.filter((it) => (it.release_date || '') <= lte);
  const sort = q.get('sort_by') || '';
  if (sort.includes('release_date')) out.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));
  else if (sort.startsWith('popularity')) out.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const page = parseInt(q.get('page') || '1', 10);
  return { results: out.slice((page - 1) * 20, page * 20) };
}

function filterSeries(q) {
  if (q.get('with_genres')) return { results: [] }; // TV & Reality passes: not under test
  if (q.get('with_status') === '1|2') return { results: [] }; // Big Announcements: not under test
  let out = Object.values(SERIES).slice();
  const origin = q.get('with_origin_country');
  if (origin) out = out.filter((it) => (it.origin_country || []).includes(origin));
  const ws = q.get('with_status');
  if (ws) {
    const want = ws.split('|').map((s) => ({ '0': 'Returning Series', '1': 'Planned', '2': 'In Production' }[s]));
    out = out.filter((it) => want.includes(it.status));
  }
  // air_date window (returning passes): TMDB narrows by episode air
  // dates — the stub cannot replicate that, so the detail check is the
  // real gate; the discover returns the pool unfiltered by date.
  if (!q.get('air_date.gte')) {
    const va = parseFloat(q.get('vote_average.gte') || '0');
    if (va) out = out.filter((it) => (it.vote_average || 0) >= va);
    const vc = parseInt(q.get('vote_count.gte') || '0', 10);
    if (vc) out = out.filter((it) => (it.vote_count || 0) >= vc);
    const gte = q.get('first_air_date.gte');
    const lte = q.get('first_air_date.lte');
    if (gte) out = out.filter((it) => (it.first_air_date || '') >= gte);
    if (lte) out = out.filter((it) => (it.first_air_date || '') <= lte);
  }
  const sort = q.get('sort_by') || '';
  if (sort.includes('first_air_date')) out.sort((a, b) => (b.first_air_date || '').localeCompare(a.first_air_date || ''));
  else if (sort.startsWith('popularity')) out.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const page = parseInt(q.get('page') || '1', 10);
  return { results: out.slice((page - 1) * 20, page * 20) };
}

function movieDetail(item) {
  const digital = item.digital ? [{ iso_3166_1: 'IN', release_dates: [{ type: 4, release_date: `${item.digital}T00:00:00.000Z` }] }] : [];
  return {
    id: item.id, status: 'Released', origin_country: item.origin_country || [],
    external_ids: { imdb_id: item.imdb || null },
    release_dates: { results: digital },
  };
}

function seriesDetail(item) {
  return {
    id: item.id, name: item.name, type: item.type,
    number_of_episodes: item.eps, number_of_seasons: item.seasons.length,
    networks: [], status: item.status, origin_country: item.origin_country || [],
    genres: [], first_air_date: item.first_air_date,
    vote_average: item.vote_average, vote_count: item.vote_count,
    seasons: item.seasons, next_episode_to_air: item.next || null,
    external_ids: { imdb_id: item.imdb || null },
  };
}

async function stubFetch(url) {
  const u = new URL(url);
  const path = u.pathname;
  const q = u.searchParams;
  const json = (obj) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => obj });
  if (path === '/3/discover/movie') return json(filterMovies(q));
  if (path === '/3/discover/tv') return json(filterSeries(q));
  const mExt = path.match(/^\/3\/movie\/(\d+)\/external_ids$/);
  if (mExt) {
    const item = MOVIES[+mExt[1]];
    return json({ imdb_id: item ? (item.imdb || null) : null });
  }
  const mDet = path.match(/^\/3\/movie\/(\d+)$/);
  if (mDet) {
    const item = MOVIES[+mDet[1]];
    return json(item ? movieDetail(item) : { id: +mDet[1], status: 'Released', origin_country: [], external_ids: { imdb_id: null }, release_dates: { results: [] } });
  }
  const mTv = path.match(/^\/3\/tv\/(\d+)$/);
  if (mTv) {
    const item = SERIES[+mTv[1]];
    return json(item ? seriesDetail(item) : { id: +mTv[1], type: 'Scripted', number_of_episodes: 10, networks: [], external_ids: { imdb_id: null } });
  }
  return json({ results: [] });
}

async function buildWithStub(type) {
  const realFetch = global.fetch;
  global.fetch = stubFetch;
  try {
    const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, trendingTopUp: {} };
    const ctx = {
      seriesCache: new Map(), movieCache: new Map(), config: null,
      buzzState: { version: 1, updatedAt: '', movies: [], series: [] },
      buzzFresh: { movies: [], series: [] },
      buzzSeed: { movies: [], series: [] },
      buzz: { movies: [], series: [], sources: {}, groq: { ok: true }, fetchedTitles: [] },
    };
    const rows = await buildRows(type, 'TESTKEY', {}, stats, ctx);
    return { rows, stats };
  } finally {
    global.fetch = realFetch;
  }
}

(async () => {
  // ---------------------------------------------------------------------------
  // 3. buildRows (movie) — fresh path + fresh-digital fresh path
  // ---------------------------------------------------------------------------
  console.log('=== 3. buildRows (movie) — fresh paths ===');
  {
    const { rows, stats } = await buildWithStub('movie');
    const row = rows['new-releases'] || [];
    // DIG-DAY1 is a movie released today too — it belongs here as well
    // (fresh path), right after DAY1-IND (stable sort: Indian entries
    // first, both dated today).
    eq(JSON.stringify(names(row)), JSON.stringify(['DAY1-IND', 'DIG-DAY1', 'GLO-RATED-05d', 'RATED-IND-10d', 'DIG-RATED-20d']),
      'movie row: day-1 fresh titles first (today), then rated titles by date desc');
    check(names(row).includes('DAY1-IND'), 'day-1 movie with 0 votes lands via the fresh path');
    check(names(row).includes('DIG-DAY1'), 'day-1 digital movie lands here too (it is a movie released today)');
    check(!names(row).includes('DAY1-NOPOSTER'), 'day-1 movie WITHOUT a poster is excluded (fresh path needs a poster)');
    check(!names(row).includes('OLD-LOW-20d'), '20-day-old unrated movie stays out (too old for fresh, fails rated floor)');
    check(names(row).includes('RATED-IND-10d'), 'rated Indian title still lands (rated path unchanged)');
    check(names(row).includes('GLO-RATED-05d'), 'rated worldwide title still lands');
    const s = stats.newReleases.movie;
    eq(s.total, 5, 'stats total 5');
    eq(s.indian, 4, 'stats indian 4 (DAY1-IND + DIG-DAY1 + RATED-IND-10d + DIG-RATED-20d)');
    eq(s.worldwide, 1, 'stats worldwide 1');
    eq(s.fresh, 2, 'stats fresh 2 (DAY1-IND + DIG-DAY1)');
    eq(s.newest, daysAgoStr(0), 'newest = today (the fresh titles)');

    const fresh = rows['fresh-digital-drops'] || [];
    eq(JSON.stringify(names(fresh)), JSON.stringify(['DIG-DAY1', 'DIG-RATED-20d']),
      'fresh-digital: day-1 digital title first (digital today), then the rated 20-day title');
    check(names(fresh).includes('DIG-DAY1'), 'day-1 digital title with 0 votes lands via the fresh path');
    check(!names(fresh).includes('DIG-NOPOSTER'), 'day-1 digital title WITHOUT a poster is excluded');
    check(!names(fresh).includes('DAY1-IND'), 'theatrical day-1 title without a digital date stays out of fresh-digital');
    const fs = stats.freshDigital;
    eq(fs.total, 2, 'fresh-digital stats total 2');
    eq(fs.fresh, 1, 'fresh-digital stats fresh 1 (only DIG-DAY1)');
  }

  // ---------------------------------------------------------------------------
  // 4. buildRows (series) — returning seasons
  // ---------------------------------------------------------------------------
  console.log('=== 4. buildRows (series) — returning seasons ===');
  {
    const { rows, stats } = await buildWithStub('series');
    const row = rows['new-releases'] || [];
    eq(JSON.stringify(names(row)), JSON.stringify(['DHINDORA', 'NEW-SHOW', 'GLO-PREM-05d']),
      'series row: returning Dhindora (S2 today) first, then premieres by date desc');
    check(names(row).includes('DHINDORA'), 'returning season lands (first aired 2021, S2 premiered today)');
    check(!names(row).includes('OLD-SEASON'), 'season 60 days old stays out (outside the 45-day window)');
    check(!names(row).includes('RET-TALKSHOW'), 'returning Talk Show stays out (TV filter still applies)');
    check(names(row).includes('NEW-SHOW'), 'new premiere still lands');
    const s = stats.newReleases.series;
    eq(s.total, 3, 'stats total 3');
    eq(s.indian, 2, 'stats indian 2 (DHINDORA + NEW-SHOW)');
    eq(s.worldwide, 1, 'stats worldwide 1');
    eq(s.returning, 1, 'stats returning 1 (only DHINDORA)');
    eq(s.fresh, 0, 'stats fresh 0 (series has no fresh pass)');
    eq(s.newest, daysAgoStr(0), 'newest = today (the returning season)');
  }

  console.log(fail === 0 ? '\nALL v1.6.0 TESTS PASSED' : `\n${fail} v1.6.0 TEST(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
