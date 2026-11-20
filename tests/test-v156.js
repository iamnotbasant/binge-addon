// Binge Addon — v1.5.6 buzz carry-over tests (basant, 19 Nov 2026:
// "Buzz logic badlo — bade titles na giren". Ramayana 7.5/57 was in
// the buzz row at 17:12 IST, gone at 18:52 IST — not the floor, not
// the match, just a fresh Groq ranking with no memory).
//
// Covers, with stubbed TMDB fetch (no keys, no network):
// (0) manifest — version 1.5.7, 18 catalogs (Indian TV & Reality Shows added);
// (1) validateBuzzState — valid passthrough, null for missing/garbage,
//     bad entries filtered, bad dates filtered;
// (2) daysBetween / isCarryFresh — 3-day boundary (3 kept, 4 stale);
// (3) matchesBuzzTitle — exact, prefix, core-word, negative;
// (4) mergeBuzzRows — fresh first, carried after, dedupe, cap;
// (5) updateBuzzState — fresh upsert resets lastBuzz + rank, fetched
//     refresh (exact + core word), 3-day expiry, seed insert stamped
//     today (never overwrites), null prev -> fresh-only, 40 cap;
// (6) buildRows end-to-end — carry after fresh (Ramayana), expiry
//     (4 days -> not carried), floor re-check on fresh data (rating
//     fell -> not carried, named), seed from trending when no state
//     (Ramayana back in the row), no state + empty trending -> fresh
//     only, no crash; series carry applies the v1.4 TV filter.
// Run: node tests/test-v156.js (exit 0 = all pass)
'use strict';

const { buildRows } = require('../app/scripts/build-catalogs');
const { MANIFEST, catalogs } = require('../app/lib/manifest');
const buzz = require('../app/lib/buzz');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const DAY = 24 * 60 * 60 * 1000;
const daysAgoStr = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const todayStr = new Date().toISOString().slice(0, 10);
const names = (row) => (row || []).map((m) => m.name);

const entry = (tmdbId, imdbId, title, lastBuzz, rank) => ({
  tmdbId, imdbId, title, firstSeen: daysAgoStr(10), lastBuzz, rank,
});

(async () => {
  // ---------------------------------------------------------------------------
  // 0. Manifest version
  // ---------------------------------------------------------------------------
  console.log('=== 0. Manifest ===');
  {
    eq(MANIFEST.version, '1.6.1', 'manifest version 1.6.1');
    eq(catalogs().length, 18, '18 catalogs (17 + Indian TV & Reality Shows)');
  }

  // ---------------------------------------------------------------------------
  // 1. validateBuzzState
  // ---------------------------------------------------------------------------
  console.log('=== 1. validateBuzzState ===');
  {
    eq(buzz.validateBuzzState(null), null, 'null -> null');
    eq(buzz.validateBuzzState('garbage'), null, 'string -> null');
    eq(buzz.validateBuzzState([]), null, 'array -> null');
    eq(JSON.stringify(buzz.validateBuzzState({})), JSON.stringify({ version: 1, updatedAt: '', movies: [], series: [] }), 'empty object -> empty state');
    const good = buzz.validateBuzzState({
      version: 1, updatedAt: todayStr,
      movies: [entry(11, 'tt27988879', 'Ramayana: Rise of a Legend', daysAgoStr(1), 0)],
      series: [],
    });
    eq(good.movies.length, 1, 'valid entry kept');
    eq(good.movies[0].title, 'Ramayana: Rise of a Legend', 'entry fields kept');
    const mixed = buzz.validateBuzzState({
      movies: [
        entry(11, 'tt27988879', 'Ramayana', daysAgoStr(1), 0),
        { tmdbId: 12, imdbId: 'xx12', title: 'Bad Imdb', firstSeen: todayStr, lastBuzz: todayStr, rank: 1 },
        { tmdbId: 'x', imdbId: 'tt13', title: 'Bad Id', firstSeen: todayStr, lastBuzz: todayStr, rank: 2 },
        { tmdbId: 14, imdbId: 'tt14', title: 'Bad Date', firstSeen: 'yesterday', lastBuzz: todayStr, rank: 3 },
        { tmdbId: 15, imdbId: 'tt15', title: 'No Rank', firstSeen: todayStr, lastBuzz: todayStr },
      ],
      series: 'not-an-array',
    });
    eq(mixed.movies.length, 1, 'only the valid entry survives');
    eq(mixed.series.length, 0, 'non-array series -> empty');
  }

  // ---------------------------------------------------------------------------
  // 2. daysBetween / isCarryFresh
  // ---------------------------------------------------------------------------
  console.log('=== 2. Carry freshness ===');
  {
    eq(buzz.daysBetween(daysAgoStr(0), todayStr), 0, 'today -> 0 days');
    eq(buzz.daysBetween(daysAgoStr(3), todayStr), 3, '3 days ago -> 3');
    eq(buzz.daysBetween(daysAgoStr(4), todayStr), 4, '4 days ago -> 4');
    eq(buzz.isCarryFresh(daysAgoStr(3), todayStr), true, '3 days ago is fresh (boundary kept)');
    eq(buzz.isCarryFresh(daysAgoStr(4), todayStr), false, '4 days ago is stale');
    eq(buzz.isCarryFresh(todayStr, todayStr), true, 'today is fresh');
    eq(buzz.isCarryFresh('not-a-date', todayStr), false, 'unparseable -> stale');
  }

  // ---------------------------------------------------------------------------
  // 3. matchesBuzzTitle
  // ---------------------------------------------------------------------------
  console.log('=== 3. matchesBuzzTitle ===');
  {
    check(buzz.matchesBuzzTitle('Ramayana box office Day 14', 'Ramayana: Rise of a Legend', 'movie'), 'core word refreshes (headline)');
    check(buzz.matchesBuzzTitle('Dhindora Season 2 Trailer', 'Dhindora', 'series'), 'series: season + trailer stripped, exact');
    check(buzz.matchesBuzzTitle('Jailer 2 climax is insane', 'Jailer 2', 'movie'), 'exact title in headline');
    check(buzz.matchesBuzzTitle('Eetha | Official Trailer', 'Eetha', 'movie'), 'trailer suffix stripped');
    check(!buzz.matchesBuzzTitle('King teaser hype', 'Ramayana: Rise of a Legend', 'movie'), 'unrelated headline does not match');
    check(!buzz.matchesBuzzTitle('The Vvaan review', 'Ramayana: Rise of a Legend', 'movie'), 'other title does not match');
    check(!buzz.matchesBuzzTitle('', 'Ramayana', 'movie'), 'empty fetched -> no match');
  }

  // ---------------------------------------------------------------------------
  // 4. mergeBuzzRows
  // ---------------------------------------------------------------------------
  console.log('=== 4. mergeBuzzRows ===');
  {
    const fresh = [{ id: 'tt1', name: 'Fresh One' }, { id: 'tt2', name: 'Fresh Two' }];
    const carried = [{ id: 'tt2', name: 'Fresh Two (dup)' }, { id: 'tt3', name: 'Carried One' }];
    const merged = buzz.mergeBuzzRows(fresh, carried, 20);
    eq(merged.map((m) => m.name).join(','), 'Fresh One,Fresh Two,Carried One', 'fresh first, carried after, dup dropped');
    eq(buzz.mergeBuzzRows(fresh, carried, 2).length, 2, 'cap respected');
    eq(buzz.mergeBuzzRows([], carried, 20).length, 2, 'fresh empty -> both carried (no dup without fresh)');
    eq(buzz.mergeBuzzRows(null, null, 20).length, 0, 'nulls -> empty');
  }

  // ---------------------------------------------------------------------------
  // 5. updateBuzzState
  // ---------------------------------------------------------------------------
  console.log('=== 5. updateBuzzState ===');
  {
    const prev = {
      version: 1, updatedAt: daysAgoStr(1),
      movies: [
        entry(11, 'tt27988879', 'Ramayana: Rise of a Legend', daysAgoStr(1), 0),
        entry(12, 'tt12', 'Stale Film', daysAgoStr(4), 1),
        entry(13, 'tt13', 'Three Day Film', daysAgoStr(3), 2),
      ],
      series: [entry(21, 'tt21', 'Dhindora', daysAgoStr(2), 0)],
    };
    const fresh = {
      movies: [{ tmdbId: 14, imdbId: 'tt14', title: 'Eetha', rank: 0 }],
      series: [],
    };
    const { state, report } = buzz.updateBuzzState(prev, fresh, { movies: [], series: [] },
      ['Ramayana box office Day 14', 'something else entirely'], todayStr);
    const mTitles = state.movies.map((e) => e.title);
    check(mTitles.includes('Ramayana: Rise of a Legend'), 'Ramayana kept (fetched refresh)');
    check(mTitles.includes('Eetha'), 'fresh Eetha inserted');
    check(!mTitles.includes('Stale Film'), '4-day stale entry pruned');
    check(mTitles.includes('Three Day Film'), '3-day boundary entry kept');
    eq(report.expired.movies, 1, '1 expired movie reported');
    eq(state.movies.find((e) => e.tmdbId === 11).lastBuzz, todayStr, 'Ramayana lastBuzz refreshed to today');
    eq(state.movies.find((e) => e.tmdbId === 14).firstSeen, todayStr, 'fresh entry firstSeen = today');
    eq(state.movies.find((e) => e.tmdbId === 14).rank, 0, 'fresh entry rank = Groq rank');
    eq(state.series.length, 1, 'series untouched by movie fresh');
    eq(state.series[0].title, 'Dhindora', 'Dhindora still in state (2 days, fresh)');
    // Fresh upsert updates rank of an existing entry.
    const again = buzz.updateBuzzState(state,
      { movies: [{ tmdbId: 11, imdbId: 'tt27988879', title: 'Ramayana: Rise of a Legend', rank: 5 }], series: [] },
      { movies: [], series: [] }, [], todayStr);
    eq(again.state.movies.find((e) => e.tmdbId === 11).rank, 5, 're-ranked entry takes the new rank');
    eq(again.state.movies.find((e) => e.tmdbId === 11).firstSeen, daysAgoStr(10), 'firstSeen preserved across upserts');
    // Seed insert stamped today, never overwrites.
    const seeded = buzz.updateBuzzState(null, { movies: [], series: [] },
      { movies: [{ tmdbId: 11, imdbId: 'tt27988879', title: 'Ramayana: Rise of a Legend', rank: 0, seeded: true }], series: [] },
      [], todayStr);
    eq(seeded.state.movies.length, 1, 'seed inserted on null prev');
    eq(seeded.state.movies[0].lastBuzz, todayStr, 'seed lastBuzz = today');
    eq(seeded.state.movies[0].seeded, true, 'seed flag kept');
    eq(seeded.report.seeded.movies, 1, '1 seeded reported');
    // Null prev + no fresh + no seed -> empty state, no crash.
    const empty = buzz.updateBuzzState(null, { movies: [], series: [] }, { movies: [], series: [] }, [], todayStr);
    eq(empty.state.movies.length, 0, 'null prev, nothing new -> empty state');
    // 40-per-type cap.
    const many = buzz.updateBuzzState(null,
      { movies: Array.from({ length: 50 }, (_, i) => ({ tmdbId: 100 + i, imdbId: `tt${100 + i}`, title: `Film ${i}`, rank: i })), series: [] },
      { movies: [], series: [] }, [], todayStr);
    eq(many.state.movies.length, 40, 'state capped at 40 per type');
  }

  // ---------------------------------------------------------------------------
  // 6. buildRows end-to-end (stubbed TMDB)
  // ---------------------------------------------------------------------------
  console.log('=== 6. buildRows carry / seed ===');
  const TMDB = {
    movies: {
      Ramayana: { id: 11, title: 'Ramayana: Rise of a Legend', vote_average: 7.5, vote_count: 57, release_date: daysAgoStr(14), original_language: 'hi', imdb: 'tt27988879' },
      Eetha: { id: 12, title: 'Eetha', vote_average: 0, vote_count: 0, release_date: daysAgoStr(-15), original_language: 'hi', imdb: 'tt38840418' },
      'Fallen Star': { id: 13, title: 'Fallen Star', vote_average: 5.0, vote_count: 800, release_date: daysAgoStr(-200), original_language: 'hi', imdb: 'tt1000013' },
    },
    series: {
      Dhindora: { id: 21, name: 'Dhindora', vote_average: 7.8, vote_count: 120, first_air_date: daysAgoStr(-1100), original_language: 'hi', imdb: 'tt14650074' },
      Panchayat: { id: 24, name: 'Panchayat', vote_average: 8.0, vote_count: 500, first_air_date: daysAgoStr(-2000), original_language: 'hi', imdb: 'tt1000024' },
      'Soap Show': { id: 22, name: 'Soap Show', vote_average: 8.0, vote_count: 900, first_air_date: daysAgoStr(-500), original_language: 'hi', imdb: 'tt1000022', tvTrap: true },
    },
  };
  function stubFetch(url) {
    const u = new URL(url);
    const path = u.pathname;
    const q = u.searchParams;
    const json = (obj) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => obj, text: async () => JSON.stringify(obj) });
    if (path === '/3/trending/movie/week') return json({ results: [TMDB.movies.Ramayana, TMDB.movies.Eetha].map(({ imdb, ...r }) => r) });
    if (path === '/3/trending/tv/week') return json({ results: [TMDB.series.Dhindora].map(({ imdb, tvTrap, ...r }) => r) });
    if (path === '/3/search/movie') {
      const query = (q.get('query') || '').toLowerCase();
      const hits = Object.values(TMDB.movies).filter((m) => m.title.toLowerCase().includes(query) || query.includes(m.title.toLowerCase().split(':')[0]));
      return json({ results: hits.map(({ imdb, ...r }) => r) });
    }
    if (path === '/3/search/tv') {
      const query = (q.get('query') || '').toLowerCase();
      const hits = Object.values(TMDB.series).filter((s) => s.name.toLowerCase().includes(query));
      return json({ results: hits.map(({ imdb, tvTrap, ...r }) => r) });
    }
    const mFind = path.match(/^\/3\/find\/(tt\d+)$/);
    if (mFind) {
      const item = [...Object.values(TMDB.movies), ...Object.values(TMDB.series)].find((x) => x.imdb === mFind[1]);
      if (!item) return json({ movie_results: [], tv_results: [] });
      const { imdb, tvTrap, ...rest } = item;
      return json(item.title ? { movie_results: [rest], tv_results: [] } : { movie_results: [], tv_results: [rest] });
    }
    const mExt = path.match(/^\/3\/movie\/(\d+)\/external_ids$/);
    if (mExt) {
      const item = Object.values(TMDB.movies).find((m) => m.id === +mExt[1]);
      return json({ imdb_id: item ? item.imdb : null });
    }
    const mMov = path.match(/^\/3\/movie\/(\d+)$/);
    if (mMov) {
      const item = Object.values(TMDB.movies).find((m) => m.id === +mMov[1]);
      if (!item) return json({});
      const { imdb, ...rest } = item;
      return json({ ...rest, external_ids: { imdb_id: item.imdb } });
    }
    const mTv = path.match(/^\/3\/tv\/(\d+)$/);
    if (mTv) {
      const item = Object.values(TMDB.series).find((s) => s.id === +mTv[1]);
      if (!item) return json({ id: +mTv[1], type: 'Scripted', number_of_episodes: 10, networks: [], status: 'Ended', next_episode_to_air: null, external_ids: { imdb_id: null } });
      const { imdb, tvTrap, ...rest } = item;
      return json({
        ...rest, type: tvTrap ? 'Talk Show' : 'Scripted', number_of_episodes: tvTrap ? 500 : 24,
        networks: [], status: 'Ended', next_episode_to_air: null,
        external_ids: { imdb_id: item.imdb },
      });
    }
    return json({ results: [] });
  }
  async function buildWithBuzz(type, buzzCtx) {
    const realFetch = global.fetch;
    global.fetch = stubFetch;
    try {
      const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, trendingTopUp: {} };
      const ctx = {
        seriesCache: new Map(), movieCache: new Map(), config: null,
        buzzState: buzzCtx.state ?? null,
        buzzFresh: { movies: [], series: [] },
        buzzSeed: { movies: [], series: [] },
        buzz: { movies: buzzCtx.movies || [], series: buzzCtx.series || [], sources: {}, groq: { ok: true }, fetchedTitles: buzzCtx.fetchedTitles || [] },
      };
      const rows = await buildRows(type, 'TESTKEY', {}, stats, ctx);
      return { rows, stats, ctx };
    } finally {
      global.fetch = realFetch;
    }
  }
  {
    // A. Carry: Ramayana in state (lastBuzz yesterday), NOT Groq-ranked
    // today — it must still land in the row, after the fresh title.
    // A 5-day-stale entry must NOT be carried.
    const { rows, stats } = await buildWithBuzz('movie', {
      state: {
        version: 1, updatedAt: daysAgoStr(1),
        movies: [
          entry(11, 'tt27988879', 'Ramayana: Rise of a Legend', daysAgoStr(1), 0),
          entry(13, 'tt1000013', 'Fallen Star', daysAgoStr(5), 1),
        ],
        series: [],
      },
      movies: [{ title: 'Eetha Official Trailer', reason: 'trailer just dropped' }],
    });
    const row = rows['india-buzzing-now'] || [];
    eq(names(row).join(','), 'Eetha,Ramayana: Rise of a Legend', 'carried Ramayana lands after the fresh title');
    eq(stats.buzz.movie.carried, 1, '1 carried');
    check(stats.buzz.movie.carriedTitles.includes('Ramayana: Rise of a Legend'), 'carried title named in stats');
    check(!names(row).includes('Fallen Star'), '5-day stale entry not carried');
    eq(stats.buzz.movie.seeded, 0, 'no seed when state exists');
  }
  {
    // B. Expiry: entry lastBuzz 4 days ago, no fresh buzz -> row is
    // fresh-only.
    const { rows, stats } = await buildWithBuzz('movie', {
      state: {
        version: 1, updatedAt: daysAgoStr(4),
        movies: [entry(11, 'tt27988879', 'Ramayana: Rise of a Legend', daysAgoStr(4), 0)],
        series: [],
      },
      movies: [{ title: 'Eetha Official Trailer', reason: 'trailer just dropped' }],
    });
    eq(names(rows['india-buzzing-now']).join(','), 'Eetha', '4-day entry expires, fresh-only row');
    eq(stats.buzz.movie.carried, 0, '0 carried');
  }
  {
    // C. Floor re-check: carried entry whose TMDB rating has fallen
    // below the floor must NOT ride in on yesterday's numbers.
    const { rows, stats } = await buildWithBuzz('movie', {
      state: {
        version: 1, updatedAt: daysAgoStr(1),
        movies: [entry(13, 'tt1000013', 'Fallen Star', daysAgoStr(1), 0)],
        series: [],
      },
      movies: [{ title: 'Eetha Official Trailer', reason: 'trailer just dropped' }],
    });
    // Fallen Star's live detail is 5.0/800, old release -> below floor.
    // (Its stale twin in case A was excluded by expiry instead.)
    eq(names(rows['india-buzzing-now']).join(','), 'Eetha', 'below-floor carried title dropped');
    check(stats.buzz.movie.belowFloor.some((x) => x.startsWith('Fallen Star')), 'below-floor carried title named in stats');
  }
  {
    // D. Seed: no state file -> bootstrap from today's trending row.
    // Ramayana is #1 trending and passes the floor, so it must be
    // back in the buzz row even though Groq did not rank it today.
    const { rows, stats, ctx } = await buildWithBuzz('movie', {
      state: null,
      movies: [{ title: 'Eetha Official Trailer', reason: 'trailer just dropped' }],
    });
    const row = rows['india-buzzing-now'] || [];
    check(names(row).includes('Ramayana: Rise of a Legend'), 'seeded Ramayana back in the row');
    eq(names(row)[0], 'Eetha', 'fresh title still first, seed after');
    check(stats.buzz.movie.seeded >= 1, 'seed count reported');
    check((ctx.buzzSeed.movies || []).some((e) => e.tmdbId === 11), 'seed stashed for the state write');
    check((ctx.buzzFresh.movies || []).some((e) => e.tmdbId === 12), 'fresh Eetha stashed for the state write');
  }
  {
    // E. No state + empty trending -> fresh-only, no crash.
    const realFetch = global.fetch;
    global.fetch = (url) => {
      const u = new URL(url);
      if (u.pathname === '/3/trending/movie/week') {
        return Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [] }), text: async () => '{}' });
      }
      return stubFetch(url);
    };
    try {
      const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, trendingTopUp: {} };
      const ctx = {
        seriesCache: new Map(), movieCache: new Map(), config: null,
        buzzState: null, buzzFresh: { movies: [], series: [] }, buzzSeed: { movies: [], series: [] },
        buzz: { movies: [{ title: 'Eetha Official Trailer', reason: 'x' }], series: [], sources: {}, groq: { ok: true }, fetchedTitles: [] },
      };
      const rows = await buildRows('movie', 'TESTKEY', {}, stats, ctx);
      eq(names(rows['india-buzzing-now']).join(','), 'Eetha', 'empty trending -> fresh-only, no crash');
      eq(stats.buzz.movie.seeded, 0, '0 seeded on empty trending');
    } finally {
      global.fetch = realFetch;
    }
  }
  {
    // F. Series carry applies the v1.4 TV filter: a carried Talk Show
    // is excluded, a real series is carried.
    const { rows, stats } = await buildWithBuzz('series', {
      state: {
        version: 1, updatedAt: daysAgoStr(1),
        movies: [],
        series: [
          entry(24, 'tt1000024', 'Panchayat', daysAgoStr(1), 0),
          entry(22, 'tt1000022', 'Soap Show', daysAgoStr(1), 1),
        ],
      },
      series: [{ title: 'Dhindora Season 2', reason: 'season 2 premiere' }],
    });
    const row = rows['india-buzzing-now'] || [];
    eq(names(row).join(','), 'Dhindora,Panchayat', 'series carry: Panchayat in, Talk Show out');
    eq(stats.buzz.series.carried, 1, '1 series carried');
  }

  console.log(fail === 0 ? '\nALL v1.5.6 TESTS PASSED' : `\n${fail} v1.5.6 TEST(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
