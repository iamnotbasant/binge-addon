// Binge Addon — manifest definition (design §6.1, §6.4).
// 27 catalogs (v2.0), movie+series pairs adjacent. Manifest must stringify < 8 KB.

// v2.0 (18 Nov 2026): basant's 25-item mega-list. The old v1.4 rows are
// GONE (New Indian Releases, OTT Releases, Popular Indian, Top Indian,
// Top This Month/Year, Hindi Movies/Series, Hindi Dubbed). Items #14-18
// of the 25-item list (OTT shelves) are NOT here — they are a separate
// Nuvio Catalog Addon step for basant, not part of this build.

function catalogs() {
  const list = [];
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
  // #1 Trending in India
  push('trending-indian-movie', 'Trending in India', 'movie');
  push('trending-indian-series', 'Trending in India', 'series');
  // #2 Trending Worldwide
  push('global-trending-movie', 'Trending Worldwide', 'movie');
  push('global-trending-series', 'Trending Worldwide', 'series');
  // #3 Fresh Digital / OTT Drops (movie only)
  push('fresh-digital-drops-movie', 'Fresh Digital Drops', 'movie');
  // #4 Latest Indian Movies — OTT Ready (movie only)
  push('latest-indian-ott-movie', 'Latest Indian Movies — OTT Ready', 'movie');
  // #5 Latest Indian Web Series (series only)
  push('latest-indian-series-series', 'Latest Indian Web Series', 'series');
  // #6 Releasing Next 30 Days
  push('releasing-next-30-days-movie', 'Releasing Next 30 Days', 'movie');
  push('releasing-next-30-days-series', 'Releasing Next 30 Days', 'series');
  // #7 Big Announcements 2026–2027
  push('big-announcements-movie', 'Big Announcements 2026–2027', 'movie');
  push('big-announcements-series', 'Big Announcements 2026–2027', 'series');
  // #8 Newly Announced Web Series (series only)
  push('newly-announced-series-series', 'Newly Announced Web Series', 'series');
  // #9 New Season Returning Soon (series only)
  push('returning-soon-series', 'New Season Returning Soon', 'series');
  // #10 Now in Theatres (movie only)
  push('now-in-theatres-movie', 'Now in Theatres', 'movie');
  // #11 South Indian Blockbusters (movie only)
  push('south-blockbusters-movie', 'South Indian Blockbusters', 'movie');
  // #12 Indian Dark Crime & Thrillers (series only)
  push('dark-crime-series', 'Indian Dark Crime & Thrillers', 'series');
  // #13 Underrated Indian Gems
  push('underrated-gems-movie', 'Underrated Indian Gems', 'movie');
  push('underrated-gems-series', 'Underrated Indian Gems', 'series');
  // #19 Mind-Bending Sci-Fi & Time Travel
  push('scifi-time-travel-movie', 'Mind-Bending Sci-Fi & Time Travel', 'movie');
  push('scifi-time-travel-series', 'Mind-Bending Sci-Fi & Time Travel', 'series');
  // #20 High-Tension Psychological Thrillers
  push('psychological-thrillers-movie', 'High-Tension Psychological Thrillers', 'movie');
  push('psychological-thrillers-series', 'High-Tension Psychological Thrillers', 'series');
  // #21 Adrenaline Action, Heist & Revenge (movie only)
  push('action-heist-revenge-movie', 'Adrenaline Action, Heist & Revenge', 'movie');
  // #22 1-Season Binge Mini-Series (series only)
  push('one-season-miniseries-series', '1-Season Binge Mini-Series', 'series');
  // #23 4K IMAX Visual Spectacles (movie only)
  push('visual-spectacles-movie', '4K IMAX Visual Spectacles', 'movie');
  // #24 Top Action & Dark Anime (series only)
  push('action-anime-series', 'Top Action & Dark Anime', 'series');
  // #25 All-Time Classics (movie only)
  push('all-time-classics-movie', 'All-Time Classics', 'movie');
  return list;
}

const MANIFEST = {
  id: 'com.bharatstreams',
  version: '1.2.1',
  name: 'Binge Addon',
  description:
    'Free Hindi-first Indian catalogs and streams. Trending India + Worldwide, Fresh Digital Drops, Latest Indian Movies & Web Series, Releasing Next 30 Days, Big Announcements 2026–2027, Now in Theatres, South Blockbusters, Dark Crime, Underrated Gems, Sci-Fi & Time Travel, Thrillers, Action, Mini-Series, Visual Spectacles, Anime and All-Time Classics, with Hindi 1080p streams first. This product uses the TMDB API but is not endorsed or certified by TMDB.',
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
