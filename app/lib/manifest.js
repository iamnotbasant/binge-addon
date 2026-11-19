// Binge Addon — manifest definition (design §6.1, §6.4).
// 29 catalogs (v1.4.3 — was 30; Newly Announced Web Series removed as
// a Big Announcements duplicate). Movie+series pairs adjacent, then
// watchable rows first and the upcoming/radar rows last (v1.4.3
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
  // #12 Indian Dark Crime & Thrillers (series only)
  push('dark-crime-series', 'Indian Dark Crime & Thrillers', 'series');
  // #13 Underrated Indian Gems
  push('underrated-gems-movie', 'Underrated Indian Gems', 'movie');
  push('underrated-gems-series', 'Underrated Indian Gems', 'series');
  // #19 Mind-Bending Sci-Fi (v1.4.3: was "Mind-Bending Sci-Fi & Time Travel")
  push('scifi-time-travel-movie', 'Mind-Bending Sci-Fi', 'movie');
  push('scifi-time-travel-series', 'Mind-Bending Sci-Fi', 'series');
  // #20 Psychological Thrillers (v1.4.3: was "High-Tension Psychological Thrillers")
  push('psychological-thrillers-movie', 'Psychological Thrillers', 'movie');
  push('psychological-thrillers-series', 'Psychological Thrillers', 'series');
  // #21 Action, Heist & Revenge (v1.4.3: was "Adrenaline Action, Heist & Revenge")
  push('action-heist-revenge-movie', 'Action, Heist & Revenge', 'movie');
  // #22 1-Season Binge (v1.4.3: was "1-Season Binge Mini-Series")
  push('one-season-miniseries-series', '1-Season Binge', 'series');
  // #23 4K IMAX Visual Spectacles (movie only)
  push('visual-spectacles-movie', '4K IMAX Visual Spectacles', 'movie');
  // #24 Top Action & Dark Anime (series only)
  push('action-anime-series', 'Top Action & Dark Anime', 'series');
  // #25 All-Time Classics (movie only)
  push('all-time-classics-movie', 'All-Time Classics', 'movie');
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
  version: '1.4.3',
  name: 'Binge Addon',
  description:
    'Free Hindi-first Indian catalogs and streams. Trending India + Worldwide, New Releases — India + Worldwide, India Buzzing Now, Fresh Digital Drops, Latest Indian Movies & Web Series, Releasing Next 30 Days, Big Announcements, Now in Theatres, Dark Crime, Underrated Gems, Sci-Fi, Thrillers, Action, Mini-Series, Visual Spectacles, Anime and All-Time Classics, with Hindi 1080p streams first. This product uses the TMDB API but is not endorsed or certified by TMDB.',
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
