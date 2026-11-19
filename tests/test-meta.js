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
  console.log(fail === 0 ? '\nALL META TESTS PASSED' : `\n${fail} META TEST(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})();
