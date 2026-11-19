// Binge Addon — meta enrichment tests (v1.1.6).
// Proves, for Ramayana (tt27988879) and Jailer 2 (tt33318732):
//   - logo: picked from TMDB images.logos, English preferred, w500 URL
//   - year: set from release_date ('2026'), releaseInfo unchanged
//   - cast: stays bare name strings (protocol verdict — see lib/meta.js)
//   - everything else (name, poster, background, runtime, director,
//     genres, description) byte-identical to the live v1.1.5 meta.
// Fixture payloads use REAL values from the live v1.1.5 meta + Cinemeta
// (titles, dates, runtimes, poster/backdrop paths, cast, director).
// The logo file_paths below are shape fixtures: the TMDB key lives only
// in Vercel, so this VM cannot read TMDB's real logo list. The LIVE part
// of this test (§4) proves a real logo image exists and loads for both
// titles (Cinemeta's metahub logo URL, HTTP 200); the end-to-end proof
// that TMDB returns a logo for these titles comes from the deployed
// /meta endpoint after deploy (key present in Vercel only).
// Run: node tests/test-meta.js  (exit 0 = all pass)
'use strict';

const { buildMetaFromTmdb } = require('../app/lib/meta');
const { findTmdbId, fetchMetaForTmdbId, fetchMetaFromCinemeta, resolveMeta, clearSeasonCache } = require('../app/lib/meta-fetch');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

// Real TMDB-detail-shaped fixtures (values from live meta, 19 Nov 2026).
const RAMAYANA = {
  title: 'Ramayana: Rise of a Legend',
  release_date: '2026-11-08',
  runtime: 195,
  poster_path: '/vBQ7wks68OhJKlb3RnXSl2yXBXK.jpg',
  backdrop_path: '/yHVZncPRZr63mezRX20IyKLrSkv.jpg',
  overview: 'An ancient epic follows a young prince and princess whose marriage and subsequent exile mark the beginning of a legendary journey. Their story of love, duty and destiny sets the stage for greater challenges ahead.',
  genres: [{ name: 'Fantasy' }, { name: 'Action' }, { name: 'Adventure' }],
  credits: {
    cast: ['Ranbir Kapoor', 'Yash', 'Sai Pallavi', 'Ravi Dubey', 'Arun Govil', 'Shobana', 'Lara Dutta', 'Rakul Preet Singh', 'Vivek Oberoi', 'Adinath Kothare'].map((name) => ({ name, profile_path: '/x.jpg' })),
    crew: [{ job: 'Director', name: 'Nitesh Tiwari' }],
  },
  images: { logos: [
    { file_path: '/ramayana-hi.png', iso_639_1: 'hi' },
    { file_path: '/ramayana-en.png', iso_639_1: 'en' },
  ] },
};

const JAILER2 = {
  title: 'Jailer 2',
  release_date: '2026-10-15',
  runtime: 165,
  poster_path: '/upwdEyhhYZ7pT2hD535fr2MGfpx.jpg',
  backdrop_path: '/uxGoKyTnXylK5M4z1hyyaWbmBV7.jpg',
  overview: 'When a dangerous syndicate threatens his family, retired jailer Tiger Muthuvel Pandian goes undercover as a driver to battle enemies from the shadows.',
  genres: [{ name: 'Action' }, { name: 'Comedy' }, { name: 'Drama' }],
  credits: {
    cast: ['Rajinikanth', 'S. J. Suryah', 'Suraj Venjaramoodu', 'Ramya Krishnan', 'Vidya Balan', 'Namo Narayana', 'Yogi Babu', 'Mirnaa', 'Rithvik', 'Hakkim Shajahan'].map((name) => ({ name, profile_path: '/y.jpg' })),
    crew: [{ job: 'Director', name: 'Nelson' }],
  },
  images: { logos: [{ file_path: '/jailer2-en.png', iso_639_1: 'en' }] },
};

// ---------------------------------------------------------------------------
// v1.1.9 / v1.2.0 fixtures: TMDB /find + Cinemeta fallback shapes.
// Real values verified live 19 Nov 2026 (TMDB pages + Cinemeta):
//   Preacher (tt5016504) — TMDB tv 64230, first aired 2016-05-22,
//     43 episodes S1 10 / S2 13 / S3 10 / S4 10; cast Dominic Cooper,
//     Joe Gilgun, Ruth Negga; Cinemeta year range '2016–2019'.
//   Paddington 2 (tt4468740) — released 2017-11-10 (UK), runtime
//     104 min, director Paul King, genres Adventure/Comedy/Family.
//   poster/backdrop/logo file_paths + episode_run_time below are SHAPE
//   fixtures (same convention as the logo paths in §1–2); the asserted
//   facts are name/year/poster/videos/director. The Paddington 2 TMDB
//   id in the stub is a scripted value — the test asserts the meta, not
//   the id; the live production check proves the real /find resolution.
// ---------------------------------------------------------------------------
const PREACHER_FIND = {
  movie_results: [],
  person_results: [],
  tv_results: [{ id: 64230, name: 'Preacher', first_air_date: '2016-05-22' }],
  tv_episode_results: [],
  tv_season_results: [],
};

const PREACHER_DETAIL = {
  name: 'Preacher',
  first_air_date: '2016-05-22',
  episode_run_time: [45],
  poster_path: '/preacher-poster.jpg',
  backdrop_path: '/preacher-backdrop.jpg',
  overview: 'A preacher sets out on a mission to make the almighty himself confess his sin of abandoning the world.',
  genres: [{ name: 'Adventure' }, { name: 'Comedy' }, { name: 'Fantasy' }],
  credits: {
    cast: ['Dominic Cooper', 'Joe Gilgun', 'Ruth Negga'].map((name) => ({ name })),
    crew: [],
  },
  images: { logos: [{ file_path: '/preacher-logo.png', iso_639_1: 'en' }] },
  // TMDB lists a season 0 (Specials, 18 eps) on top of the 43 episodes
  // (S1 10 / S2 13 / S3 10 / S4 10) — verified live 19 Nov 2026: the
  // production meta carries 61 videos, first tt5016504:0:1.
  seasons: [
    { season_number: 0, episode_count: 18 },
    { season_number: 1, episode_count: 10 },
    { season_number: 2, episode_count: 13 },
    { season_number: 3, episode_count: 10 },
    { season_number: 4, episode_count: 10 },
  ],
};

const PADDINGTON_FIND = {
  movie_results: [{ id: 490132, title: 'Paddington 2', release_date: '2017-11-10' }],
  person_results: [],
  tv_results: [],
  tv_episode_results: [],
  tv_season_results: [],
};

const PADDINGTON_DETAIL = {
  title: 'Paddington 2',
  release_date: '2017-11-10',
  runtime: 104,
  poster_path: '/paddington2-poster.jpg',
  backdrop_path: '/paddington2-backdrop.jpg',
  overview: 'Paddington, now happily settled with the Brown family, picks up a series of odd jobs to buy the perfect present for his Aunt Lucy\'s 100th birthday.',
  genres: [{ name: 'Adventure' }, { name: 'Comedy' }, { name: 'Family' }],
  credits: {
    cast: ['Ben Whishaw', 'Hugh Grant', 'Hugh Bonneville'].map((name) => ({ name })),
    crew: [{ job: 'Director', name: 'Paul King' }],
  },
  images: { logos: [{ file_path: '/paddington2-logo.png', iso_639_1: 'en' }] },
};

const FIND_EMPTY = {
  movie_results: [],
  person_results: [],
  tv_results: [],
  tv_episode_results: [],
  tv_season_results: [],
};

// Real Cinemeta payloads (subset), fetched live 19 Nov 2026.
const CINEMETA_PREACHER = {
  meta: {
    id: 'tt5016504',
    type: 'series',
    name: 'Preacher',
    poster: 'https://images.metahub.space/poster/small/tt5016504/img',
    background: 'https://images.metahub.space/background/medium/tt5016504/img',
    logo: 'https://images.metahub.space/logo/medium/tt5016504/img',
    description: 'After a supernatural event at his church, a preacher enlists the help of a vampire and his ex to find God.',
    releaseInfo: '2016–2019',
    released: '2016-05-22T00:00:00.000Z',
    year: '2016–2019',
    genres: ['Adventure', 'Comedy', 'Fantasy'],
    genre: ['Adventure', 'Comedy', 'Fantasy'],
    cast: ['Dominic Cooper', 'Joe Gilgun', 'Ruth Negga'],
    director: null,
    runtime: '45 min',
    imdbRating: '7.9',
    moviedb_id: 64230,
    videos: [
      { id: 'tt5016504:0:1', name: 'A Look at the Series', season: 0, episode: 1, released: '2016-05-23T06:00:00.000Z', firstAired: '2016-05-23T06:00:00.000Z', thumbnail: 'https://episodes.metahub.space/tt5016504/0/1/w780.jpg', overview: 'Behind the scenes.' },
      { id: 'tt5016504:1:1', name: 'Pilot', season: 1, episode: 1, released: '2016-05-22T06:00:00.000Z', firstAired: '2016-05-22T06:00:00.000Z', thumbnail: 'https://episodes.metahub.space/tt5016504/1/1/w780.jpg', overview: 'Jesse struggles.' },
      { id: 'tt5016504:4:10', name: 'Masada', season: 4, episode: 10, released: '2019-08-04T06:00:00.000Z', firstAired: '2019-08-04T06:00:00.000Z', thumbnail: 'https://episodes.metahub.space/tt5016504/4/10/w780.jpg', overview: 'The fate of the world is decided.' },
    ],
  },
};

const CINEMETA_PADDINGTION = {
  meta: {
    id: 'tt4468740',
    type: 'movie',
    name: 'Paddington 2',
    poster: 'https://images.metahub.space/poster/small/tt4468740/img',
    background: 'https://images.metahub.space/background/medium/tt4468740/img',
    logo: 'https://images.metahub.space/logo/medium/tt4468740/img',
    description: 'Paddington, now happily settled with the Brown family, picks up a series of odd jobs.',
    releaseInfo: '2018',
    released: '2018-01-12T00:00:00.000Z',
    year: '2018',
    genres: ['Adventure', 'Comedy', 'Family'],
    genre: ['Adventure', 'Comedy', 'Family'],
    cast: ['Ben Whishaw', 'Hugh Grant', 'Hugh Bonneville'],
    director: ['Paul King'],
    runtime: '104 min',
    imdbRating: '7.8',
  },
};

// Stub fetch: routes are [urlSubstring, jsonBody | {status, json}].
// Records every URL fetched so tests can prove which path was taken.
function stubFetchFactory(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [sub, resp] of routes) {
      if (url.includes(sub)) {
        if (resp && typeof resp === 'object' && 'status' in resp) {
          return { ok: resp.status >= 200 && resp.status < 300, status: resp.status, json: async () => resp.json };
        }
        return { ok: true, status: 200, json: async () => resp };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}
const KEY = 'TESTKEY';

// ---------------------------------------------------------------------------
// 1. Ramayana — logo (English preferred), year, cast, unchanged fields
// ---------------------------------------------------------------------------
console.log('=== 1. Ramayana tt27988879 ===');
{
  const m = buildMetaFromTmdb('tt27988879', 'movie', RAMAYANA);
  eq(m.logo, 'https://image.tmdb.org/t/p/w500/ramayana-en.png', 'logo = English TMDB logo, w500 (not the Hindi one)');
  eq(m.year, '2026', 'year set from release_date');
  eq(m.releaseInfo, '2026', 'releaseInfo unchanged');
  eq(m.name, 'Ramayana: Rise of a Legend', 'name unchanged');
  eq(m.poster, 'https://image.tmdb.org/t/p/w342/vBQ7wks68OhJKlb3RnXSl2yXBXK.jpg', 'poster unchanged');
  eq(m.background, 'https://image.tmdb.org/t/p/w780/yHVZncPRZr63mezRX20IyKLrSkv.jpg', 'background unchanged');
  eq(m.runtime, '195 min', 'runtime unchanged (195 min = 3h 15m)');
  eq(m.director, 'Nitesh Tiwari', 'director unchanged');
  eq(JSON.stringify(m.genres), JSON.stringify(['Fantasy', 'Action', 'Adventure']), 'genres unchanged');
  check(m.description.startsWith('An ancient epic follows'), 'description unchanged');
  check(Array.isArray(m.cast) && m.cast.length === 10 && m.cast.every((c) => typeof c === 'string'),
    'cast stays 10 bare name strings (protocol: no picture field)');
  eq(m.cast[0], 'Ranbir Kapoor', 'cast[0] unchanged');
  check(!JSON.stringify(m).includes('profile_path'), 'no profile_path leaks into meta (cast is names only)');
}

// ---------------------------------------------------------------------------
// 2. Jailer 2 — same checks
// ---------------------------------------------------------------------------
console.log('=== 2. Jailer 2 tt33318732 ===');
{
  const m = buildMetaFromTmdb('tt33318732', 'movie', JAILER2);
  eq(m.logo, 'https://image.tmdb.org/t/p/w500/jailer2-en.png', 'logo = English TMDB logo, w500');
  eq(m.year, '2026', 'year set from release_date');
  eq(m.releaseInfo, '2026', 'releaseInfo unchanged');
  eq(m.name, 'Jailer 2', 'name unchanged');
  eq(m.runtime, '165 min', 'runtime unchanged');
  eq(m.director, 'Nelson', 'director unchanged');
  check(Array.isArray(m.cast) && m.cast.length === 10 && m.cast.every((c) => typeof c === 'string'),
    'cast stays 10 bare name strings');
}

// ---------------------------------------------------------------------------
// 3. Logo edge cases + series year/runtime
// ---------------------------------------------------------------------------
console.log('=== 3. Logo edges + series ===');
{
  const noLogo = buildMetaFromTmdb('tt0000001', 'movie', { ...RAMAYANA, images: { logos: [] } });
  eq(noLogo.logo, undefined, 'no TMDB logos -> logo omitted, never invented');
  const noImages = buildMetaFromTmdb('tt0000001', 'movie', { ...RAMAYANA, images: undefined });
  eq(noImages.logo, undefined, 'no images block at all -> logo omitted');
  const hiOnly = buildMetaFromTmdb('tt0000001', 'movie', { ...RAMAYANA, images: { logos: [{ file_path: '/only-hi.png', iso_639_1: 'hi' }] } });
  eq(hiOnly.logo, 'https://image.tmdb.org/t/p/w500/only-hi.png', 'no English logo -> first available logo used');
  const series = buildMetaFromTmdb('tt0000002', 'series', {
    name: 'Panchayat', first_air_date: '2020-04-03', episode_run_time: [35],
    genres: [], credits: { cast: [], crew: [] },
  });
  eq(series.year, '2020', 'series year from first_air_date');
  eq(series.runtime, '35 min', 'series runtime from episode_run_time');
  const noDate = buildMetaFromTmdb('tt0000003', 'movie', { title: 'X', genres: [], credits: {} });
  eq(noDate.year, undefined, 'no date -> year omitted');
}

// ---------------------------------------------------------------------------
// 4. LIVE: Cinemeta cross-check (protocol verdict + real logo images)
// ---------------------------------------------------------------------------
console.log('=== 4. Live Cinemeta cross-check ===');
(async () => {
  for (const [tt, name] of [['tt27988879', 'Ramayana'], ['tt33318732', 'Jailer 2']]) {
    try {
      const res = await fetch(`https://v3-cinemeta.strem.io/meta/movie/${tt}.json`);
      const data = await res.json();
      const meta = data.meta || {};
      eq(meta.year, '2026', `Cinemeta ${name} year is '2026' (the field we now send too)`);
      check(typeof meta.logo === 'string' && meta.logo.startsWith('https://images.metahub.space/logo/'),
        `Cinemeta ${name} has a logo URL (${meta.logo})`);
      check(Array.isArray(meta.cast) && meta.cast.every((c) => typeof c === 'string'),
        `Cinemeta ${name} cast is bare strings too (protocol has no cast pictures)`);
      check(!('credits_cast' in meta), `Cinemeta ${name} sends no credits_cast field`);
      if (typeof meta.logo === 'string') {
        const head = await fetch(meta.logo, { method: 'HEAD' });
        check(head.ok, `logo image loads live for ${name} (HTTP ${head.status})`);
      }
    } catch (e) {
      check(false, `live Cinemeta check failed for ${name}: ${e.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // 5. v1.1.9 + v1.2.0 fallback chain (stubbed TMDB + Cinemeta, offline)
  // -------------------------------------------------------------------------
  console.log('=== 5. Fallback chain (stubbed) ===');
  const noMap = async () => null;
  const mapRamayana = async () => '12345';

  // 5a. Preacher (series, NOT in catalogs) via TMDB /find.
  {
    const f = stubFetchFactory([
      ['/find/tt5016504', PREACHER_FIND],
      ['/tv/64230', PREACHER_DETAIL],
      ['v3-cinemeta.strem.io/meta/series/tt5016504', CINEMETA_PREACHER],
    ]);
    const r = await resolveMeta('tt5016504', 'series', { key: KEY, fetchFn: f, tmdbIdForImdb: noMap });
    eq(r.via, 'find', 'Preacher resolves via TMDB /find (not the map)');
    eq(r.tmdbId, 64230, 'Preacher /find returns the real TMDB tv id 64230');
    eq(r.meta && r.meta.name, 'Preacher', 'Preacher meta name');
    eq(r.meta && r.meta.year, '2016', 'Preacher meta year 2016');
    check(typeof (r.meta && r.meta.poster) === 'string' && r.meta.poster.startsWith('https://image.tmdb.org/t/p/w342/'),
      'Preacher meta poster present (TMDB w342)');
    check(!!(r.meta && r.meta.logo), 'Preacher meta logo present');
    eq(r.meta && r.meta.videos && r.meta.videos.length, 61, 'Preacher meta videos = 61 (season 0 specials 18 + episodes 43)');
    eq(r.meta && r.meta.videos && r.meta.videos[0].id, 'tt5016504:0:1', 'Preacher first video id tt5016504:0:1 (season 0)');
    eq(r.meta && r.meta.videos && r.meta.videos[18].id, 'tt5016504:1:1', 'Preacher video[18] = S1E1 tt5016504:1:1');
    eq(r.meta && r.meta.videos && r.meta.videos[60].id, 'tt5016504:4:10', 'Preacher last video id tt5016504:4:10');
    check(!f.calls.some((u) => u.includes('cinemeta')), 'Preacher: Cinemeta NOT called when /find hits (order: map -> find -> cinemeta)');
  }

  // 5b. Non-catalog movie via TMDB /find (Paddington 2).
  {
    const f = stubFetchFactory([
      ['/find/tt4468740', PADDINGTON_FIND],
      ['/movie/490132', PADDINGTON_DETAIL],
    ]);
    const r = await resolveMeta('tt4468740', 'movie', { key: KEY, fetchFn: f, tmdbIdForImdb: noMap });
    eq(r.via, 'find', 'Paddington 2 resolves via TMDB /find');
    eq(r.meta && r.meta.name, 'Paddington 2', 'Paddington 2 meta name');
    eq(r.meta && r.meta.year, '2017', 'Paddington 2 meta year 2017 (UK release)');
    eq(r.meta && r.meta.runtime, '104 min', 'Paddington 2 runtime 104 min');
    eq(r.meta && r.meta.director, 'Paul King', 'Paddington 2 director Paul King');
    check(typeof (r.meta && r.meta.poster) === 'string', 'Paddington 2 poster present');
    check(!('videos' in (r.meta || {})), 'movie meta has no videos key');
  }

  // 5c. Id-map fast path still works + catalog titles byte-identical.
  {
    const f = stubFetchFactory([['/movie/12345', RAMAYANA]]);
    const r = await resolveMeta('tt27988879', 'movie', { key: KEY, fetchFn: f, tmdbIdForImdb: mapRamayana });
    eq(r.via, 'map', 'Ramayana resolves via the id map (fast path, no /find)');
    check(!f.calls.some((u) => u.includes('/find/')), 'Ramayana: /find NOT called on a map hit');
    const direct = buildMetaFromTmdb('tt27988879', 'movie', RAMAYANA);
    eq(JSON.stringify(r.meta), JSON.stringify(direct), 'Ramayana meta via the new code path is byte-identical to the v1.1.6 direct build');
  }

  // 5d. Wrong type -> null, never a mismatched meta.
  {
    const f = stubFetchFactory([['/find/tt5016504', PREACHER_FIND]]);
    eq(await findTmdbId('tt5016504', 'movie', KEY, f), null,
      'findTmdbId: Preacher asked as a movie -> null (tv_results only, no movie_results)');
    const r = await resolveMeta('tt5016504', 'movie', { key: KEY, fetchFn: f, tmdbIdForImdb: noMap });
    eq(r.meta, null, 'resolveMeta: wrong-type Preacher as movie -> null (Cinemeta movie also empty in stub)');
    eq(r.via, null, 'wrong-type -> via null');
  }

  // 5e. Fake/unknown id -> null without crashing (both TMDB + Cinemeta miss).
  {
    const f = stubFetchFactory([
      ['/find/tt9999999', FIND_EMPTY],
      ['v3-cinemeta.strem.io/meta/series/tt9999999', {}],
    ]);
    const r = await resolveMeta('tt9999999', 'series', { key: KEY, fetchFn: f, tmdbIdForImdb: noMap });
    eq(r.meta, null, 'unknown series id -> null, no crash');
    eq(r.via, null, 'unknown id -> via null');
    const throwing = async () => { throw new Error('boom'); };
    const r2 = await resolveMeta('tt9999999', 'series', { key: KEY, fetchFn: throwing, tmdbIdForImdb: noMap });
    eq(r2.meta, null, 'fetch throwing -> null, never throws out of resolveMeta');
    check(typeof r2.error === 'string', 'fetch failure surfaces as error string, not a crash');
  }

  // 5f. Cinemeta mapping (direct): series + movie shapes.
  {
    const f = stubFetchFactory([['v3-cinemeta.strem.io/meta/series/tt5016504', CINEMETA_PREACHER]]);
    const m = await fetchMetaFromCinemeta('tt5016504', 'series', f);
    eq(m.name, 'Preacher', 'Cinemeta Preacher name');
    eq(m.year, '2016', 'Cinemeta Preacher year = first year of released (not the 2016–2019 range)');
    eq(m.releaseInfo, '2016–2019', 'Cinemeta Preacher releaseInfo kept as-is (range)');
    eq(m.poster, 'https://images.metahub.space/poster/small/tt5016504/img', 'Cinemeta Preacher poster');
    eq(m.logo, 'https://images.metahub.space/logo/medium/tt5016504/img', 'Cinemeta Preacher logo');
    eq(JSON.stringify(m.genres), JSON.stringify(['Adventure', 'Comedy', 'Fantasy']), 'Cinemeta Preacher genres');
    eq(JSON.stringify(m.cast), JSON.stringify(['Dominic Cooper', 'Joe Gilgun', 'Ruth Negga']), 'Cinemeta Preacher cast bare strings');
    eq(m.director, undefined, 'Cinemeta Preacher director null -> omitted');
    eq(m.runtime, '45 min', 'Cinemeta Preacher runtime');
    eq(m.imdbRating, '7.9', 'Cinemeta Preacher imdbRating');
    eq(m.videos.length, 3, 'Cinemeta Preacher videos mapped (fixture has 3)');
    eq(m.videos[0].id, 'tt5016504:0:1', 'Cinemeta video keeps its own id (incl. season-0 special)');
    eq(m.videos[0].title, 'A Look at the Series', 'Cinemeta video title from name');
    eq(m.videos[2].title, 'Masada', 'Cinemeta video S4E10 title');
    check(!JSON.stringify(m).includes('credits_cast'), 'no credits_cast leaks into mapped meta');
    check(!JSON.stringify(m).includes('moviedb_id'), 'no moviedb_id leaks into mapped meta');

    const f2 = stubFetchFactory([['v3-cinemeta.strem.io/meta/movie/tt4468740', CINEMETA_PADDINGTION]]);
    const m2 = await fetchMetaFromCinemeta('tt4468740', 'movie', f2);
    eq(m2.name, 'Paddington 2', 'Cinemeta Paddington 2 name');
    eq(m2.year, '2018', 'Cinemeta Paddington 2 year 2018 (its released date)');
    eq(m2.director, 'Paul King', 'Cinemeta director ARRAY -> first element');
    eq(m2.runtime, '104 min', 'Cinemeta Paddington 2 runtime');
    eq(m2.imdbRating, '7.8', 'Cinemeta Paddington 2 imdbRating');
    check(!('videos' in m2), 'Cinemeta movie meta has no videos key');

    const f3 = stubFetchFactory([['v3-cinemeta.strem.io/meta/series/tt9999999', {}]]);
    eq(await fetchMetaFromCinemeta('tt9999999', 'series', f3), null, 'Cinemeta {} (no meta key) -> null');
    const f4 = stubFetchFactory([]);
    eq(await fetchMetaFromCinemeta('tt9999999', 'series', f4), null, 'Cinemeta HTTP 404 -> null');
  }

  // 5g. Third fallback end-to-end: map miss + /find miss + Cinemeta hit.
  {
    const f = stubFetchFactory([
      ['/find/tt5016504', FIND_EMPTY],
      ['v3-cinemeta.strem.io/meta/series/tt5016504', CINEMETA_PREACHER],
    ]);
    const r = await resolveMeta('tt5016504', 'series', { key: KEY, fetchFn: f, tmdbIdForImdb: noMap });
    eq(r.via, 'cinemeta', 'Preacher resolves via Cinemeta when map + /find both miss');
    eq(r.meta && r.meta.name, 'Preacher', 'Cinemeta-fallback meta name');
    eq(r.meta && r.meta.year, '2016', 'Cinemeta-fallback meta year');
    check(f.calls.some((u) => u.includes('/find/tt5016504')), 'Cinemeta path tried /find first (order kept)');
  }

  // -------------------------------------------------------------------------
  // 6. v1.2.2: series episode enrichment from TMDB season details.
  // Real episode names verified against TMDB (19 Nov 2026): Preacher
  // S4E1 'Masada' (aired 2019-08-04), S4E2 'Last Supper', S4E3
  // 'Deviant', S4E10 'End of the World' (2019-09-29); S1E1 'Pilot'.
  // still_path values are SHAPE fixtures (same convention as the logo
  // paths in §1–2); the asserted facts are name/thumbnail-URL shape/
  // overview/released/ids. Live production check proves a real still
  // loads (HTTP 200) for S4E1. NOTE: stub route order matters — the
  // season routes MUST come before '/tv/64230', because the stub
  // matches by substring and the season URL contains '/tv/64230'.
  // -------------------------------------------------------------------------
  console.log('=== 6. Episode enrichment (v1.2.2, stubbed seasons) ===');
  const PREACHER_S4 = {
    season_number: 4,
    episodes: [
      { episode_number: 1, name: 'Masada', still_path: '/preacher-s4e1.jpg', overview: 'Jesse is rocked by visions of an apocalyptic future as he and Tulip prepare for an all-out assault on Masada, where Cassidy - trapped to a torturous fate - struggles to hang on.', air_date: '2019-08-04' },
      { episode_number: 2, name: 'Last Supper', still_path: '/preacher-s4e2.jpg', overview: 'God maneuvers the chess pieces of His apocalypse closer to the endgame.', air_date: '2019-08-04' },
      { episode_number: 3, name: 'Deviant', still_path: null, overview: 'Tulip gets in too deep in Masada.', air_date: '2019-08-11' },
      { episode_number: 10, name: 'End of the World', still_path: '/preacher-s4e10.jpg', overview: 'The curtain falls on the Apocalypse Revue.', air_date: '2019-09-29' },
    ],
  };
  const PREACHER_S0 = {
    season_number: 0,
    episodes: [
      { episode_number: 1, name: 'A Look at the Series', still_path: '/preacher-s0e1.jpg', overview: 'Behind the scenes.', air_date: '2016-05-23' },
    ],
  };
  const PREACHER_S1 = {
    season_number: 1,
    episodes: [
      { episode_number: 1, name: 'Pilot', still_path: '/preacher-s1e1.jpg', overview: 'Jesse struggles with his calling.', air_date: '2016-05-22' },
      { episode_number: 2, name: '', still_path: '/preacher-s1e2.jpg', overview: '', air_date: '' },
    ],
  };

  // 6a. Enriched Preacher: real names + thumbnails + overview + released.
  {
    clearSeasonCache();
    const f = stubFetchFactory([
      ['/tv/64230/season/4', PREACHER_S4],
      ['/tv/64230/season/0', PREACHER_S0],
      ['/tv/64230/season/1', PREACHER_S1],
      ['/find/tt5016504', PREACHER_FIND],
      ['/tv/64230', PREACHER_DETAIL],
    ]);
    const r = await resolveMeta('tt5016504', 'series', { key: KEY, fetchFn: f, tmdbIdForImdb: noMap });
    eq(r.meta && r.meta.videos && r.meta.videos.length, 61, 'enriched Preacher still 61 videos');
    const s4e1 = r.meta.videos.find((v) => v.id === 'tt5016504:4:1');
    eq(s4e1 && s4e1.title, 'Masada', 'S4E1 title = real TMDB name "Masada" (not "Episode 1")');
    eq(s4e1 && s4e1.thumbnail, 'https://image.tmdb.org/t/p/w300/preacher-s4e1.jpg', 'S4E1 thumbnail = TMDB w300 still');
    check(typeof (s4e1 && s4e1.overview) === 'string' && s4e1.overview.startsWith('Jesse is rocked'), 'S4E1 overview from TMDB');
    eq(s4e1 && s4e1.released, '2019-08-04T00:00:00.000Z', 'S4E1 released = air date as ISO');
    eq(s4e1 && s4e1.season, 4, 'S4E1 season unchanged');
    eq(s4e1 && s4e1.episode, 1, 'S4E1 episode unchanged');
    const s4e2 = r.meta.videos.find((v) => v.id === 'tt5016504:4:2');
    eq(s4e2 && s4e2.title, 'Last Supper', 'S4E2 title = "Last Supper"');
    const s4e3 = r.meta.videos.find((v) => v.id === 'tt5016504:4:3');
    eq(s4e3 && s4e3.title, 'Deviant', 'S4E3 title = "Deviant"');
    eq(s4e3 && s4e3.thumbnail, undefined, 'S4E3 no still_path -> thumbnail omitted, never a placeholder');
    eq(s4e3 && s4e3.released, '2019-08-11T00:00:00.000Z', 'S4E3 released present');
    const s4e10 = r.meta.videos.find((v) => v.id === 'tt5016504:4:10');
    eq(s4e10 && s4e10.title, 'End of the World', 'S4E10 title = "End of the World"');
    const s0e1 = r.meta.videos.find((v) => v.id === 'tt5016504:0:1');
    eq(s0e1 && s0e1.title, 'A Look at the Series', 'season-0 special enriched too (S0E1 real name)');
    check(typeof (s0e1 && s0e1.thumbnail) === 'string', 'season-0 special gets a thumbnail');
    const s1e1 = r.meta.videos.find((v) => v.id === 'tt5016504:1:1');
    eq(s1e1 && s1e1.title, 'Pilot', 'S1E1 title = "Pilot"');
    const s1e2 = r.meta.videos.find((v) => v.id === 'tt5016504:1:2');
    eq(s1e2 && s1e2.title, 'Episode 2', 'episode with empty TMDB name keeps generic "Episode 2" (nothing invented)');
    eq(s1e2 && s1e2.overview, undefined, 'episode with empty overview -> overview omitted');
    eq(s1e2 && s1e2.released, undefined, 'episode with empty air_date -> released omitted');
    const s2e1 = r.meta.videos.find((v) => v.id === 'tt5016504:2:1');
    eq(s2e1 && s2e1.title, 'Episode 1', 'season with NO season fetch in stub (S2) keeps generic titles');
    eq(s2e1 && s2e1.thumbnail, undefined, 'unfetched season -> no thumbnail');
    check(f.calls.some((u) => u.includes('/tv/64230/season/4')), 'season detail endpoint called for S4');
    check(r.meta.videos.every((v) => /^tt5016504:\d+:\d+$/.test(v.id)), 'all video ids still exactly tt:S:E');
  }

  // 6b. Fallback: every season fetch fails -> generic videos, meta intact.
  {
    clearSeasonCache();
    const f = stubFetchFactory([
      ['/find/tt5016504', PREACHER_FIND],
      ['/tv/64230', PREACHER_DETAIL],
    ]);
    const r = await resolveMeta('tt5016504', 'series', { key: KEY, fetchFn: f, tmdbIdForImdb: noMap });
    eq(r.meta && r.meta.name, 'Preacher', 'season-fetch failure: meta still returns');
    eq(r.meta && r.meta.videos && r.meta.videos.length, 61, 'season-fetch failure: still 61 videos');
    const s4e1 = r.meta.videos.find((v) => v.id === 'tt5016504:4:1');
    eq(s4e1 && s4e1.title, 'Episode 1', 'season-fetch failure: S4E1 falls back to generic "Episode 1"');
    eq(s4e1 && s4e1.thumbnail, undefined, 'season-fetch failure: no thumbnail');
    check(r.meta.videos.every((v) => v.title === `Episode ${v.episode}`), 'season-fetch failure: ALL videos generic, none invented');
  }

  // 6c. Fallback: fetch itself throws on season URLs -> meta intact.
  {
    clearSeasonCache();
    const f = async (url) => {
      if (url.includes('/season/')) throw new Error('season down');
      if (url.includes('/find/tt5016504')) return { ok: true, status: 200, json: async () => PREACHER_FIND };
      if (url.includes('/tv/64230')) return { ok: true, status: 200, json: async () => PREACHER_DETAIL };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const r = await resolveMeta('tt5016504', 'series', { key: KEY, fetchFn: f, tmdbIdForImdb: noMap });
    eq(r.meta && r.meta.videos && r.meta.videos.length, 61, 'throwing season fetch: meta + 61 videos still returned');
    eq(r.meta.videos.find((v) => v.id === 'tt5016504:4:1').title, 'Episode 1', 'throwing season fetch: generic title fallback');
  }

  // 6d. Movie meta untouched (no season calls, no videos key).
  {
    clearSeasonCache();
    const f = stubFetchFactory([['/movie/490132', PADDINGTON_DETAIL]]);
    const r = await resolveMeta('tt4468740', 'movie', { key: KEY, fetchFn: f, tmdbIdForImdb: noMap });
    check(!('videos' in (r.meta || {})), 'movie meta still has no videos key');
    check(!f.calls.some((u) => u.includes('/season/')), 'movie path makes zero season calls');
  }

  console.log(fail === 0 ? '\nALL META TESTS PASSED' : `\n${fail} META TEST(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})();
