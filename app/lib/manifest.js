// Binge Addon — manifest definition (design §6.1, §6.4).
// 18 catalogs (v1.5.7 — was 17; Indian TV & Reality Shows added for
// broadcast TV like Bigg Boss, which the v1.4 TV filter keeps out of
// every series row). Movie+series pairs adjacent, then watchable rows
// reorder — Nuvio opens on watchable rows, not on titles with no
// streams yet). Manifest must stringify < 8 KB.
//
// v1.4.3 names: long display names shortened to 2–4 words
// (Nuvio-UI friendly); catalog IDs are byte-identical — a rename
// never breaks an install. Big Announcements carries a DYNAMIC year
// (currentYear–nextYear, computed at module load) so the label can
// never go stale again.

function catalogs() {
  const list = [];
  // v1.4.3: dynamic year for Big Announcements — computed at module
  // load (each serverless invocation), never hardcoded.
  const bigYear = new Date().getFullYear();
  const bigName = `Big Announcements ${bigYear}–${bigYear + 1}`;
  // v1.1.7: every catalog is searchable (`extra: search`, not required
  // so rows still serve as Board/Discover feeds). Search queries TMDB
  // live (lib/search.js) — it does NOT filter the fixed rows, because
  // a title like Reacher is in none of them. Verified shape against
  // stremio-addon-sdk 1.6.10 docs/api/responses/manifest.md:
  // "If your catalog supports full text searching, set
  // `extra: [{ name: "search", isRequired: false }]`".
  const push = (id, name, type) => list.push({
    type, id, name, extra: [{ name: 'search', isRequired: false }],
  });
  // --- Watchable rows first ---
  // #1 Trending in India
  push('trending-indian-movie', 'Trending in India', 'movie');
  push('trending-indian-series', 'Trending in India', 'series');
  // #1b New Releases — India + Worldwide (v1.3.1, basant 19 Nov 2026)
  push('new-releases-movie', 'New Releases — India + Worldwide', 'movie');
  push('new-releases-series', 'New Releases — India + Worldwide', 'series');
  // #1c India Buzzing Now (v1.3.4, basant 19 Nov 2026) — what India is
  // actually discussing today (Reddit + YouTube + news, Groq-ranked).
  push('india-buzzing-now-movie', 'India Buzzing Now', 'movie');
  push('india-buzzing-now-series', 'India Buzzing Now', 'series');
  // #2 Trending Worldwide
  push('global-trending-movie', 'Trending Worldwide', 'movie');
  push('global-trending-series', 'Trending Worldwide', 'series');
  // #3 Fresh Digital / OTT Drops (movie only)
  push('fresh-digital-drops-movie', 'Fresh Digital Drops', 'movie');
  // #4 Latest Indian Movies — OTT Ready (movie only)
  push('latest-indian-ott-movie', 'Latest Indian Movies — OTT Ready', 'movie');
  // #5 Latest Indian Web Series (series only)
  push('latest-indian-series-series', 'Latest Indian Web Series', 'series');
  // #5b Indian TV & Reality Shows (series only, v1.5.7, basant 19 Nov
  // 2026) — the home for broadcast TV: Bigg Boss, Indian Idol, KBC,
  // Kapil Sharma Show, daily soaps. Bypasses the v1.4 TV filter by
  // design (see the builder row comment); sits inside the watchable
  // block, right after Latest Indian Web Series.
  push('indian-tv-reality-series', 'Indian TV & Reality Shows', 'series');
  // v1.5.5: the genre/mood rows are gone COMPLETELY (Dark Crime,
  // Underrated Gems, Sci-Fi, Psychological Thrillers, Action, 1-Season
  // Binge, Visual Spectacles, Anime, All-Time Classics — 12 rows).
  // --- Upcoming / radar rows last (v1.4.3 reorder; relative order kept) ---
  // #6 Releasing Next 30 Days
  push('releasing-next-30-days-movie', 'Releasing Next 30 Days', 'movie');
  push('releasing-next-30-days-series', 'Releasing Next 30 Days', 'series');
  // #7 Big Announcements (dynamic year — see bigName above)
  push('big-announcements-movie', bigName, 'movie');
  push('big-announcements-series', bigName, 'series');
  // #8 Newly Announced Web Series — REMOVED in v1.4.3 (duplicate of
  // Big Announcements Series, same with_status filter, 365d vs 500d
  // window only). Gone from the builder, this list, the config knob
  // and the admin labels; legacy Blob file pruned by the rebuild.
  // #9 New Season Returning Soon (series only)
  push('returning-soon-series', 'New Season Returning Soon', 'series');
  // #10 Now in Theatres (movie only)
  push('now-in-theatres-movie', 'Now in Theatres', 'movie');
  return list;
}

const MANIFEST = {
  id: 'com.bharatstreams',
  version: '1.6.3',
  name: 'Binge Addon',
  description:
    'Free Hindi-first Indian catalogs and streams. Trending India + Worldwide, New Releases — India + Worldwide, India Buzzing Now, Fresh Digital Drops, Latest Indian Movies & Web Series, Indian TV & Reality Shows, Releasing Next 30 Days, Big Announcements, Returning Soon and Now in Theatres, with Hindi 1080p streams first. This product uses the TMDB API but is not endorsed or certified by TMDB.',
  resources: [
    'catalog',
    { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt'] },
    { name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] },
  ],
  types: ['movie', 'series'],
  catalogs: catalogs(),
  behaviorHints: { p2p: true },
};

module.exports = { MANIFEST, catalogs };
