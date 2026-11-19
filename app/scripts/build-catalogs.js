// Binge Addon — catalog builder (design §6.2, v2.0).
// Daily cron job: TMDB discover + detail -> prebuilt row JSON in
// Vercel Blob (one file per catalog + id map). Keeps yesterday's files on
// failure (writes only complete rows, and only after all fetches succeed).
//
// Usage: TMDB_API_KEY=<key> node scripts/build-catalogs.js
//   -- or via the /api/cron/rebuild endpoint (same code path).
// With TMDB_API_KEY missing: logs "no key, skipping" and exits 0 — never
// crashes, never fakes rows.
//
// TMDB key handling: the key comes ONLY from the environment. It is never
// written to any file, log, or report by this script.
//
// v2.0 (18 Nov 2026): basant's 25-item mega-list -> 27 catalogs. The old
// v1.4 rows are GONE (New Indian Releases, OTT Releases, Popular Indian,
// Top Indian, Top This Month/Year, Hindi Movies/Series, Hindi Dubbed).
// Every row caps at 20 items (ROW_CAP); the old 90-item trending rows
// are gone with it. Honest substitutions, all accepted by basant:
// IMDb ratings / Trakt watchlists do NOT exist in TMDB — vote_average /
// vote_count / popularity are used instead. "Announced" is NOT a TMDB
// status value (movie: Rumored/Planned/In Production/Post Production/
// Released/Canceled; TV: Returning Series/Planned/In Production/Ended/
// Canceled/Pilot) — the announcement rows use Planned + In Production.
// TMDB cannot verify IMAX/4K for the Visual Spectacles row — it is a
// genre + rating proxy, and the name stays as basant wants it.

'use strict';

const { knob } = require('../lib/config');
const { fetchBuzzItems, groqAnalyze, matchTmdbTitle, normalizeTitle, buzzFloorPass } = require('../lib/buzz');

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w342';

// v2.0: every row caps at 20 items (was 90 for some v1 rows).
const ROW_CAP = 20;
const CONCURRENCY = 10;
// Indian original languages, reused by the Trending Indian filter.
const INDIAN_LANGS = ['hi', 'te', 'ta', 'ml', 'kn', 'bn', 'mr', 'gu', 'pa'];

// v1.3.1: Indian-origin check for the New Releases split — origin
// country IN, or an Indian original language (covers titles whose
// origin_country is missing/odd on TMDB).
function isIndianTitle(item) {
  return ((item.origin_country || []).includes('IN')) || INDIAN_LANGS.includes(item.original_language);
}

// --- TMDB genre ids (stable, per TMDB docs) ---
// Movies: Sci-Fi 878, Adventure 12, Fantasy 14, Action 28, Crime 80,
// Thriller 53, Mystery 9648.
// TV: Sci-Fi & Fantasy 10765, Animation 16, Crime 80, Mystery 9648.
// NOTE: TMDB has NO Thriller genre for TV — the series side of the
// psychological-thrillers row uses Mystery + Crime instead (see §19/20).
const GENRE_MOVIE = { scifi: 878, adventure: 12, fantasy: 14, action: 28, crime: 80, thriller: 53, mystery: 9648 };
const GENRE_TV = { scifiFantasy: 10765, animation: 16, crime: 80, mystery: 9648 };

// --- v2.0 row windows / floors ---
const FRESH_DIGITAL_DAYS = 45;      // #3 Fresh Digital Drops: digital release in last 45d
const OTT_READY_DAYS = 90;          // #4 Latest Indian Movies - OTT Ready: digital in last 90d
const LATEST_SERIES_DAYS = 90;      // #5 Latest Indian Web Series: first aired in last 90d
const NEXT_30_DAYS = 30;            // #6 Releasing Next 30 Days
const BIG_ANNOUNCE_DAYS = 500;      // #7 Big Announcements 2026-2027: release within 500d
const NEW_SERIES_ANNOUNCE_DAYS = 365; // #8 Newly Announced Web Series: within 365d
const RETURNING_DAYS = 45;          // #9 New Season Returning Soon: next episode within 45d
const THEATRES_DAYS = 45;           // #10 Now in Theatres (now_playing pages scanned)
const THEATRES_MIN_VOTES = 10;      // #10 vote_count floor (v2.0.1: was 1000 —
// current Indian releases have very few TMDB votes; Ramayana 57,
// Jailer 2 40. Probed 18 Nov 2026: now_playing IN 5 pages, >=1000: 0
// pass, >=100: 5, >=50: 7, >=10: 13. Floor 10 keeps the real
// in-theatre titles and drops the 0-vote noise.)
const UNDER_MIN_VOTE = 7.8;         // #13 Underrated Gems: vote_average floor
const UNDER_MIN_VOTES = 2000;       // #13 vote_count floor (low end)
const UNDER_MAX_VOTES = 25000;      // #13 vote_count ceiling (the "underrated" band)
const SCIFI_MIN_VOTE = 7.3;         // #19 Sci-Fi: vote_average floor
const THRILLER_MIN_VOTE = 7.5;      // #20 Thrillers: vote_average floor
const THRILLER_MIN_VOTES_MOVIE = 20000; // #20 movie vote_count floor (unchanged)
const THRILLER_MIN_VOTES_SERIES = 2000; // #20 series vote_count floor (v2.0.1:
// was 20000 — TV votes run far lower; series pool at va>=7.5 was 1
// title. Probed 18 Nov 2026: vc>=10000: 9, >=5000: 25, >=2000: 83;
// 58/83 survive the v1.4 TV filter — Breaking Bad, Dexter, Sherlock,
// True Detective, Peaky Blinders, Better Call Saul, The Wire, Fargo.)
const ACTION_MIN_VOTE = 7;          // #21 Action: vote_average floor
const ACTION_MIN_VOTES = 25000;     // #21 vote_count floor
const MINI_MIN_VOTE = 7.8;          // #22 Mini-Series: vote_average floor
const MINI_MIN_VOTES = 1000;        // #22 vote_count floor (v2.0.1: was 10000 —
// pass-1 pool (with_type=2, va>=7.8) was 1 title. Probed 18 Nov 2026:
// vc>=5000: 3, >=2000: 7, >=1000: 26; pass-2 pool (Ended, va>=7.8,
// vc>=1000): 299. Top at 1000: Chernobyl, Planet Earth, Band of
// Brothers, The Queen's Gambit, The Penguin, 1883.)
const VISUAL_MIN_VOTE = 7.5;        // #23 Visual Spectacles: vote_average floor
const VISUAL_SINCE_YEAR = 2016;     // #23 after 2015
const ANIME_MIN_VOTE = 8;           // #24 Anime: vote_average floor
const ANIME_MIN_VOTES = 1000;       // #24 Anime: vote_count floor (v2.0.1: was
// 10000 — pool was 0 titles; TMDB TV votes run far lower than movies.
// Probed 18 Nov 2026: vc>=5000: 10, >=2000: 27, >=1000: 70. Episode
// check on the first 60 at 1000: 45 under the 100-ep cap — Frieren
// 8.829/38eps, Fullmetal Alchemist: Brotherhood, Attack on Titan,
// Solo Leveling, Demon Slayer, Death Note, Cowboy Bebop; long serials
// (One Piece 1180, Hunter x Hunter 148, My Hero Academia 170) still
// die by the v1.4 cap, as designed.)
const ANIME_REFILL_PAGES = 20;      // #24 scan depth (v2.0.1: was 10 via the
// shared vote-filtered constant — vote_average.desc order puts the long
// serials first, so the row needs more pages to reach 20 keepers)
const CLASSICS_MIN_VOTES = 10000;   // #25 vote_count floor (v2.0.1: TMDB
// /movie/top_rated lets unreleased/few-vote titles top the list — the
// wrong top 6 had 338-2400 votes (Batman: Knightfall 512, Avatar Aang
// 1454, Swapped 2304, Demon Slayer 2400, Accidental Partners 411,
// Facing El Chapo 996). Probed 18 Nov 2026: vc>=10000 top 5 =
// Shawshank, Godfather, 12 Angry Men, Godfather II, Schindler's List;
// 30 pass in 3 pages. Released-only alone does NOT fix it (all 60
// have past dates).)
const DARK_CRIME_MIN_VOTE = 7.2;    // #12 Dark Crime series: vote_average floor
const NEW_REL_DAYS = 45;            // v1.3.0 New Releases: released in last 45d
const NEW_REL_MIN_VOTE = 6.5;       // v1.3.1 vote_average floor ("badiya")
const NEW_REL_MIN_VOTES = 100;      // v1.3.1 vote_count floor ("badiya", worldwide)
const NEW_REL_MIN_VOTES_INDIAN = 10; // v1.3.1 Indian-pass vote_count floor —
// Indian titles on TMDB have very few votes (Ramayana 57, Jailer 2 40
// on 18 Nov 2026), so the 100 floor emptied the Indian pool entirely
// (first v1.3.1 rebuild: indian 0/0). Theatres-row precedent (v2.0.1):
// floor 10 for Indian titles. vote_average stays 6.5 in both passes.
const NEW_REL_MIN_VOTES_SERIES = 25; // v1.3.1 worldwide-SERIES vote_count
// floor — new series accumulate TMDB votes slower than movies; the 100
// floor left only 8 series worldwide (second v1.3.1 rebuild). Movies
// stay at 100 (their row fills 20/20 there). vote_average stays 6.5.
const NEW_REL_INDIAN_TARGET = 10;   // v1.3.1 reserved Indian slots per row
const REL_NEXT_INDIAN_TARGET = 10;  // v1.3.3 reserved Indian slots in the
// Releasing Next 30 Days movie row (same 10/10 split as v1.3.1).
const REL_NEXT_PREMIERE_TARGET = 10; // v1.3.3 reserved new-premiere slots
// in the Releasing Next 30 Days series row; returning seasons fill the rest.
const BUZZ_MIN_VOTE = 6;      // v1.3.4 India Buzzing Now quality floor
// ("badiya"-lite — buzz is hype, so the floor is lighter than the
// new-releases 6.5): rated path needs vote_average >= 6.0 AND
// vote_count >= 10; the fresh/upcoming path (released in the last 30
// days or releasing in the next 90) needs no votes yet, or >= 6.0.
const BUZZ_MIN_VOTES = 10;    // v1.3.4 rated-path vote_count floor.

// v1.3.1: legacy per-row Blob files for REMOVED catalogs. The bundle no
// longer carries them, but readCatalogFile falls back to the frozen
// legacy file, so a removed row keeps serving stale data until its
// legacy file is deleted. The rebuild prunes these (one del, only when
// the file still exists — checked with a free HEAD first).
const REMOVED_LEGACY_ROWS = ['south-blockbusters-movie'];

// Detail-heavy rows (#3, #4, #7, #9) cap the number of detail calls:
// 3 discover pages x 20 items = 60 candidates max per row. The cap is
// reported in stats, never silently exceeded.
const DETAIL_CANDIDATE_CAP = 60;

// #19 Sci-Fi keywords, resolved AT BUILD TIME via /search/keyword (the
// builder has the env key at runtime). No keyword ids are hardcoded —
// if the search endpoint cannot resolve a term, that term is dropped
// and logged in stats.keywords.dropped (see resolveKeywords).
const SCIFI_KEYWORD_TERMS = ['time travel', 'simulation', 'space', 'dystopia'];

// Statuses that count as "announced" (#7, #8). TMDB has no "Announced"
// status — Planned is its equivalent (see header note).
const ANNOUNCED_STATUSES = ['Planned', 'In Production'];

// v1.4 TV-show filter (series rows ONLY — movie rows are untouched).
// Basant 18 Nov 2026: "series ke andar TV show aa rahe hain" — Popular
// Indian - Series showed C.I.D., Kyunki Saas Bhi Kabhi Bahu Thi, The Kapil
// Sharma Show: broadcast TV shows, not web series. Probed live on the
// TMDB website 18 Nov 2026:
//   TV shows (exclude): C.I.D. 1,651 eps, type Scripted, Sony
//     Entertainment Television; Kyunki Saas Bhi Kabhi Bahu Thi 2,287 eps,
//     Scripted, Star Plus; The Kapil Sharma Show 474 eps, type Talk Show,
//     Sony Entertainment Television; Taarak Mehta Ka Ooltah Chashmah
//     4,870 eps, Scripted, Sony SAB.
//   Web series (keep): Sacred Games 16 eps, Mirzapur 29, Scam 1992 10
//     (type Miniseries), Panchayat 40, Charmsukh 56 (ULLU, OTT).
// Three layers, because type alone does NOT kill the soaps — TMDB marks
// them "Scripted", its default type (only the Talk Show dies by type):
//   1. type in {Talk Show, Reality, News, Video} -> exclude. Keep
//      Scripted, Miniseries, Documentary.
//   2. number_of_episodes > TV_MAX_EPISODES (100) -> exclude. Biggest
//      real web series probed is 56 (Charmsukh); smallest TV show probed
//      is 474 (Kapil Sharma Show) — 100 sits between them with room on
//      both sides.
//   3. broadcast-network blocklist (exact TMDB network names, spaces
//      stripped + lowercased — TMDB writes "StarPlus" and "Star Plus"
//      interchangeably). Catches short/finite broadcast series that slip
//      past the cap: Yudh (Sony TV, 20 eps) and 24 (Colors, 24 eps) are
//      Scripted + under the cap, so only the network layer kills them.
//      NOTE on names (verified 18 Nov 2026): TMDB stores the Colors
//      network as "Colors", NOT "Colors TV" — Comedy Nights Bachao (64
//      eps, Colors) and 24: India (48 eps, Colors) both slipped past the
//      first list, so 'colors' is listed on its own. Same for the new
//      Tamil GEC Sony Vizha (launched 19 Oct 2026): Tamil Idol and
//      Celebrity MasterChef Tamil air on Sony Vizha (+ SonyLIV) and are
//      reality shows, but TMDB types them Scripted — only the network
//      name kills them. OTT networks are deliberately NOT in the list
//      (Netflix, Prime Video, Sony LIV, JioHotstar, ZEE5, ULLU, MX
//      Player...) — Scam 1992 (Sony LIV) and Charmsukh (ULLU) survive
//      the network layer.
//      No content/genre filtering beyond this TV-show rule (Charmsukh
//      stays — it is a web series, not a TV show).
const TV_MAX_EPISODES = 100;
const TV_EXCLUDED_TYPES = new Set(['Talk Show', 'Reality', 'News', 'Video']);
const BROADCAST_NETWORKS = new Set([
  // Hindi GECs (broadcast, not OTT)
  'starplus', 'sonyentertainmenttelevision', 'sonysab', 'sabtv', 'colors',
  'colorstv', 'zeetv', 'starbharat', '&tv', 'ddnational', 'lifeok',
  'starone', 'imaginetv', 'saharaone', 'sonypal', 'starutsav', 'zeeanmol',
  'dangaltv', 'dangal', 'zindagi',
  // Regional GECs (same daily-soap problem in other languages)
  'suntv', 'starvijay', 'vijaytv', 'zeetamil', 'colorstamil', 'starmaa',
  'zeetelugu', 'asianet', 'starjalsha', 'zeebangla', 'colorskannada',
  'starsuvarna', 'zeemarathi', 'colorsmarathi', 'starpravah', 'sonymarathi',
  'zeekannada', 'etv', 'etvtelugu', 'geminitv', 'sonyvizha',
  'jaytv', 'kalaignartv', 'rajtv', 'vendhartv', 'polimertv', 'vasanthtv',
]);
// Row refill depths for series rows (v1.4): the TV-show filter drops most
// of page 1 in popularity-sorted Indian rows (Popular Indian - Series was
// 17/20 TV shows), so series rows scan extra discover pages until the row
// is full. Movie rows still scan exactly 1-2 pages (unchanged behaviour).
const SERIES_REFILL_PAGES_STANDARD = 5;
const SERIES_REFILL_PAGES_VOTE_FILTERED = 10;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tmdb(path, key, params = {}) {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set('api_key', key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString());
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('retry-after') || '2', 10) * 1000;
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`TMDB ${path} -> HTTP ${res.status}`);
    return res.json();
  }
  throw new Error(`TMDB ${path} -> 429 after retries`);
}

async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

function toMeta(item, type, imdbId) {
  return {
    id: imdbId,
    type,
    name: item.title || item.name,
    poster: item.poster_path ? `${IMG_BASE}${item.poster_path}` : undefined,
    posterShape: 'poster',
    releaseInfo: (item.release_date || item.first_air_date || '').slice(0, 4),
    // v1.1.6: same year field as the meta handler, so catalog rows carry
    // it too (matches what Cinemeta sends in its catalog metas).
    year: (item.release_date || item.first_air_date || '').slice(0, 4) || undefined,
    description: item.overview || undefined,
  };
}

// Resolve tmdb id -> imdb id, using the persisted map first (§6.3/§6.4).
// Returns null when the title has no imdb_id (excluded from rows, backfilled).
async function resolveImdb(type, tmdbId, key, idMap) {
  const mapKey = `tmdb:${tmdbId}`;
  if (idMap[mapKey]) return idMap[mapKey];
  const path = type === 'movie' ? `/movie/${tmdbId}/external_ids` : `/tv/${tmdbId}/external_ids`;
  const ext = await tmdb(path, key);
  if (ext && ext.imdb_id) {
    idMap[mapKey] = ext.imdb_id;
    return ext.imdb_id;
  }
  return null;
}

// --- v1.4 TV-show filter helpers (series rows only) ---

function normalizeNetworkName(name) {
  return String(name || '').toLowerCase().replace(/[\s-]+/g, '');
}

// Returns a short reason string when the TMDB /tv detail is a broadcast
// TV show, else null. Series rows only; movies never call this.
function tvShowExcludeReason(detail) {
  if (!detail) return null;
  if (TV_EXCLUDED_TYPES.has(detail.type)) return `type:${detail.type}`;
  const eps = detail.number_of_episodes;
  if (typeof eps === 'number' && eps > TV_MAX_EPISODES) return `episodes:${eps}`;
  const networks = detail.networks || [];
  for (const n of networks) {
    if (BROADCAST_NETWORKS.has(normalizeNetworkName(n.name))) {
      return `network:${n.name}`;
    }
  }
  return null;
}

function noteTvShowExcluded(stats, detail, reason) {
  stats.excludedTvShow.total++;
  const kind = reason.split(':')[0];
  stats.excludedTvShow.byReason[kind] = (stats.excludedTvShow.byReason[kind] || 0) + 1;
  if (stats.excludedTvShow.names.length < 25) {
    stats.excludedTvShow.names.push(`${detail.name || detail.original_name || '?'} (${reason})`);
  }
}

// Series detail fetch (v1.4): one /tv/{id}?append_to_response=external_ids
// call returns imdb_id AND the TV-show filter fields (type,
// number_of_episodes, networks) together, replacing the separate
// /external_ids call for series. Results are cached per build run so a
// title appearing in several rows costs one call, and the same detail
// also serves the Trending Indian check (origin_country) and the
// status checks (#7/#8/#9: status, next_episode_to_air).
// Returns { imdbId (null when none), detail }.
async function resolveSeriesItem(item, key, idMap, cache) {
  const cached = cache.get(item.id);
  if (cached) return cached;
  const detail = await tmdb(`/tv/${item.id}`, key, { append_to_response: 'external_ids' });
  const imdbId = detail && detail.external_ids && detail.external_ids.imdb_id;
  if (imdbId) idMap[`tmdb:${item.id}`] = imdbId;
  const out = { imdbId: imdbId || null, detail };
  cache.set(item.id, out);
  return out;
}

// Movie detail fetch (v2.0): one /movie/{id}?append_to_response=
// external_ids,release_dates call returns imdb_id AND the fields the
// detail-heavy rows need — status (#7 Big Announcements) and the
// per-country release_dates with type codes (#3/#4 digital check,
// type 4 = Digital). Cached per build run, same as series detail.
// Returns { imdbId (null when none), detail }.
async function resolveMovieItem(item, key, idMap, cache) {
  const cached = cache.get(item.id);
  if (cached) return cached;
  const detail = await tmdb(`/movie/${item.id}`, key, { append_to_response: 'external_ids,release_dates' });
  const imdbId = detail && detail.external_ids && detail.external_ids.imdb_id;
  if (imdbId) idMap[`tmdb:${item.id}`] = imdbId;
  const out = { imdbId: imdbId || null, detail };
  cache.set(item.id, out);
  return out;
}

// Resolve a series discover item to its catalog meta, or null when it is
// excluded (no IMDb id, or a broadcast TV show per the v1.4 filter).
// checkFn, when given, is an extra detail predicate (e.g. status checks
// for #7/#8/#9/#22) — a title failing it is excluded without a stat bump
// beyond the shared counters.
async function seriesMeta(item, key, idMap, cache, stats, checkFn) {
  const res = await resolveSeriesItem(item, key, idMap, cache);
  if (!res.imdbId) { stats.excludedNoImdb++; return null; }
  const reason = tvShowExcludeReason(res.detail);
  if (reason) { noteTvShowExcluded(stats, res.detail, reason); return null; }
  if (checkFn && !checkFn(res.detail)) return null;
  return toMeta(item, 'series', res.imdbId);
}

// Resolve one page of series candidates into metas (in original order),
// stopping once metas reaches target. Candidates are resolved
// concurrently (CONCURRENCY workers) — the detail call per item is the
// slow part. Excluded titles are marked seen so a later page never
// re-fetches them.
async function addSeriesPage(items, metas, seen, target, key, idMap, cache, stats, checkFn) {
  const fresh = (items || []).filter((it) => !seen.has(it.id));
  if (!fresh.length || metas.length >= target) return 0;
  const made = await mapLimit(fresh, CONCURRENCY, (item) => seriesMeta(item, key, idMap, cache, stats, checkFn));
  let added = 0;
  for (let i = 0; i < fresh.length; i++) {
    seen.add(fresh[i].id);
    if (metas.length >= target) break;
    if (made[i]) { metas.push(made[i]); added++; }
  }
  return added;
}

// Resolve one page of movie candidates that need a detail check (#3/#4/#7).
// detailCheck(detail) returns true to keep the title. Concurrent, like
// addSeriesPage. Returns the kept metas (in discover order).
async function addMovieDetailPage(items, seen, key, idMap, cache, stats, detailCheck) {
  const fresh = (items || []).filter((it) => !seen.has(it.id));
  if (!fresh.length) return [];
  const made = await mapLimit(fresh, CONCURRENCY, async (item) => {
    const res = await resolveMovieItem(item, key, idMap, cache);
    if (!res.imdbId) { stats.excludedNoImdb++; return null; }
    if (!detailCheck(res.detail)) return null;
    return { meta: toMeta(item, 'movie', res.imdbId), detail: res.detail };
  });
  const kept = [];
  for (let i = 0; i < fresh.length; i++) {
    seen.add(fresh[i].id);
    if (made[i]) kept.push(made[i]);
  }
  return kept;
}

// Generic discover row: scan up to maxPages until target metas are
// collected. Movie rows call this with maxPages 1-2; series rows pass a
// refill depth so the v1.4 filter can backfill dropped TV shows from
// later pages.
async function collectDiscoverRow(path, baseParams, target, maxPages, type, key, idMap, cache, stats, checkFn) {
  const metas = [];
  const seen = new Set();
  for (let p = 1; p <= maxPages && metas.length < target; p++) {
    const page = await tmdb(path, key, { ...baseParams, page: p });
    const results = page.results || [];
    if (type === 'movie') {
      for (const item of results) {
        if (metas.length >= target) break;
        const imdbId = await resolveImdb(type, item.id, key, idMap);
        if (!imdbId) { stats.excludedNoImdb++; continue; }
        metas.push(toMeta(item, type, imdbId));
      }
    } else {
      await addSeriesPage(results, metas, seen, target, key, idMap, cache, stats, checkFn);
    }
  }
  return metas;
}

// --- v2.0: digital-release helpers (#3, #4) ---
// TMDB release_dates: results[] grouped by country, each with
// release_dates[] { certification, release_date, type, note }.
// Type codes: 1 Premiere, 2 Theatrical (limited), 3 Theatrical,
// 4 Digital, 5 Physical, 6 TV. A title counts as digitally released
// when ANY country has a type-4 date inside [from, to].
function digitalReleaseDate(detail, from, to) {
  const results = (detail && detail.release_dates && detail.release_dates.results) || [];
  let latest = null;
  for (const country of results) {
    for (const rd of country.release_dates || []) {
      if (rd.type !== 4 || !rd.release_date) continue;
      const d = rd.release_date.slice(0, 10);
      if (d < from || d > to) continue;
      if (!latest || d > latest) latest = d;
    }
  }
  return latest;
}

// --- v2.0: keyword resolution (#19) ---
// Resolve each term via /search/keyword at build time. Takes the first
// result whose name matches the term exactly (case-insensitive) —
// search ranking can surface near-misses first. A term with no exact
// match is DROPPED and recorded in stats.keywords.dropped, never
// guessed. If every term drops, the row falls back to genre-only and
// stats.keywords.allDropped is set (reported, not faked).
async function resolveKeywords(key, stats) {
  const resolved = {};
  const dropped = [];
  for (const term of SCIFI_KEYWORD_TERMS) {
    const res = await tmdb('/search/keyword', key, { query: term, page: 1 });
    const hit = (res.results || []).find((r) => String(r.name || '').trim().toLowerCase() === term.toLowerCase());
    if (hit) resolved[term] = hit.id;
    else dropped.push(term);
  }
  stats.keywords = { resolved, dropped, allDropped: Object.keys(resolved).length === 0 };
  return Object.values(resolved);
}

async function buildRows(type, key, idMap, stats, ctx) {
  const today = new Date();
  const todayStr = isoDate(today);
  // v2.1.0: dashboard knobs (config.json in Blob) override the defaults
  // below; without a config the builder behaves exactly as before.
  const cfg = ctx.config || null;
  const K = (row, field, def) => (cfg ? knob(cfg, row, field, def) : def);
  const freshDays = K('fresh-digital-drops', 'windowDays', FRESH_DIGITAL_DAYS);
  const ottDays = K('latest-indian-ott', 'windowDays', OTT_READY_DAYS);
  const latestSeriesDays = K('latest-indian-series', 'windowDays', LATEST_SERIES_DAYS);
  const nextDays = K('releasing-next-30-days', 'windowDays', NEXT_30_DAYS);
  const bigDays = K('big-announcements', 'windowDays', BIG_ANNOUNCE_DAYS);
  const newSeriesDays = K('newly-announced-series', 'windowDays', NEW_SERIES_ANNOUNCE_DAYS);
  const retDays = K('returning-soon', 'windowDays', RETURNING_DAYS);
  const theatreVotes = K('now-in-theatres', 'voteCountFloor', THEATRES_MIN_VOTES);
  const underVote = K('underrated-gems', 'voteFloor', UNDER_MIN_VOTE);
  const underMinVotes = K('underrated-gems', 'voteCountFloor', UNDER_MIN_VOTES);
  const underMaxVotes = K('underrated-gems', 'voteCountCeil', UNDER_MAX_VOTES);
  const scifiVote = K('scifi-time-travel', 'voteFloor', SCIFI_MIN_VOTE);
  const thrillVote = K('psychological-thrillers', 'voteFloor', THRILLER_MIN_VOTE);
  const thrillVotesMovie = K('psychological-thrillers', 'voteCountFloor', THRILLER_MIN_VOTES_MOVIE);
  const thrillVotesSeries = K('psychological-thrillers', 'voteCountFloor', THRILLER_MIN_VOTES_SERIES);
  // (thriller series shares the row's voteCountFloor knob; default above is the series floor)
  const actionVote = K('action-heist-revenge', 'voteFloor', ACTION_MIN_VOTE);
  const actionVotes = K('action-heist-revenge', 'voteCountFloor', ACTION_MIN_VOTES);
  const miniVote = K('one-season-miniseries', 'voteFloor', MINI_MIN_VOTE);
  const miniVotes = K('one-season-miniseries', 'voteCountFloor', MINI_MIN_VOTES);
  const visualVote = K('visual-spectacles', 'voteFloor', VISUAL_MIN_VOTE);
  const animeVote = K('action-anime', 'voteFloor', ANIME_MIN_VOTE);
  const animeVotes = K('action-anime', 'voteCountFloor', ANIME_MIN_VOTES);
  const classicVotes = K('all-time-classics', 'voteCountFloor', CLASSICS_MIN_VOTES);
  const darkVote = K('dark-crime', 'voteFloor', DARK_CRIME_MIN_VOTE);
  const newRelDays = K('new-releases', 'windowDays', NEW_REL_DAYS);
  const newRelVote = K('new-releases', 'voteFloor', NEW_REL_MIN_VOTE);
  const newRelVotes = K('new-releases', 'voteCountFloor', NEW_REL_MIN_VOTES);
  const newRelVotesIndian = K('new-releases', 'voteCountFloorIndian', NEW_REL_MIN_VOTES_INDIAN);
  const newRelVotesSeries = K('new-releases', 'voteCountFloorSeries', NEW_REL_MIN_VOTES_SERIES);
  const rows = {};
  const seriesCache = ctx.seriesCache;
  const movieCache = ctx.movieCache;
  const isMovie = type === 'movie';
  const path = isMovie ? '/discover/movie' : '/discover/tv';

  // --- #1 Trending Indian: TMDB /trending/{type}/week, Indian titles
  // only (v1.1 logic, reused). The trending payload has no
  // origin_country, so keep titles whose original_language is Indian;
  // for the rest, one detail call checks origin_country == 'IN'. Scan
  // up to 5 pages until the row is full. Dedupe by tmdb id across pages
  // (trending pagination can repeat a title). v2.0: NO top-up from
  // another row (Popular Indian is dropped) — a thin row stays thin
  // and honest. v1.4 series: the cached detail serves the Indian check
  // AND the TV-show filter AND the imdb id (one call).
  const trendMetas = [];
  const seenTrend = new Set();
  for (let tPage = 1; tPage <= 5 && trendMetas.length < ROW_CAP; tPage++) {
    const trendPath = isMovie ? '/trending/movie/week' : '/trending/tv/week';
    const trend = await tmdb(trendPath, key, { page: tPage });
    for (const item of trend.results || []) {
      if (trendMetas.length >= ROW_CAP) break;
      if (seenTrend.has(item.id)) continue;
      seenTrend.add(item.id);
      if (isMovie) {
        let indian = INDIAN_LANGS.includes(item.original_language);
        let res = null;
        if (!indian) {
          // One detail call gives origin_country AND the imdb id.
          res = await resolveMovieItem(item, key, idMap, movieCache);
          indian = (res.detail.origin_country || []).includes('IN');
        }
        if (!indian) continue;
        const imdbId = res ? res.imdbId : await resolveImdb(type, item.id, key, idMap);
        if (!imdbId) { stats.excludedNoImdb++; continue; }
        trendMetas.push(toMeta(item, type, imdbId));
      } else {
        const res = await resolveSeriesItem(item, key, idMap, seriesCache);
        let indian = INDIAN_LANGS.includes(item.original_language);
        if (!indian) indian = (res.detail.origin_country || []).includes('IN');
        if (!indian) continue;
        if (!res.imdbId) { stats.excludedNoImdb++; continue; }
        const reason = tvShowExcludeReason(res.detail);
        if (reason) { noteTvShowExcluded(stats, res.detail, reason); continue; }
        trendMetas.push(toMeta(item, type, res.imdbId));
      }
    }
  }
  // v2.1.0 top-up: trending is genuinely thin some weeks (18 Nov 2026:
  // 2 movies, 0 series in the global trending week). If the row is
  // short, fill it to ROW_CAP from the most-popular recent Indian titles
  // (discover, origin IN, released in the last 120 days,
  // popularity.desc). Trending titles stay first; top-up titles follow.
  // Same imdb-id + TV-show filter rules as other rows.
  const trendBefore = trendMetas.length;
  if (trendMetas.length < ROW_CAP) {
    const topFrom = isoDate(daysFromNow(-120));
    if (isMovie) {
      for (let p = 1; p <= 5 && trendMetas.length < ROW_CAP; p++) {
        const page = await tmdb('/discover/movie', key, {
          sort_by: 'popularity.desc',
          with_origin_country: 'IN',
          'primary_release_date.lte': todayStr,
          'primary_release_date.gte': topFrom,
          page: p,
        });
        for (const item of page.results || []) {
          if (trendMetas.length >= ROW_CAP) break;
          if (seenTrend.has(item.id)) continue;
          seenTrend.add(item.id);
          const imdbId = await resolveImdb(type, item.id, key, idMap);
          if (!imdbId) { stats.excludedNoImdb++; continue; }
          trendMetas.push(toMeta(item, type, imdbId));
        }
      }
    } else {
      for (let p = 1; p <= 5 && trendMetas.length < ROW_CAP; p++) {
        const page = await tmdb('/discover/tv', key, {
          sort_by: 'popularity.desc',
          with_origin_country: 'IN',
          'first_air_date.lte': todayStr,
          'first_air_date.gte': topFrom,
          page: p,
        });
        await addSeriesPage(page.results || [], trendMetas, seenTrend, ROW_CAP, key, idMap, seriesCache, stats);
      }
    }
  }
  stats.trendingTopUp = stats.trendingTopUp || {};
  stats.trendingTopUp[type] = trendMetas.length - trendBefore;
  rows['trending-indian'] = trendMetas;

  // --- v1.3.1: New Releases — India + Worldwide (both types) ---
  // Released in the last 45 days, vote_average>=6.5 ("badiya"), sorted
  // newest-first. India + worldwide mixed: up to 10 Indian-origin
  // titles and up to 10 worldwide titles, merged by release date desc,
  // so Indian titles are never crowded out by the global pool. If
  // either pool is thin, the other fills the row to 20 (counts in
  // stats). vote_count floor is SPLIT: worldwide movies 100, worldwide
  // series 25, Indian 10 — Indian titles on TMDB have very few votes
  // (Ramayana 57, Jailer 2 40), so the 100 floor emptied the Indian
  // pool (first v1.3.1 rebuild: indian 0/0); new series accumulate
  // votes slower than movies, so the 100 floor left only 8 series
  // worldwide (second rebuild).
  const newRelFrom = isoDate(daysFromNow(-newRelDays));
  const newRelDateField = isMovie ? 'primary_release_date' : 'first_air_date';
  const newRelKept = [];
  const newRelSeen = new Set();
  async function newRelPass(wantIndian, target) {
    const got = [];
    for (let p = 1; p <= 3 && got.length < target; p++) {
      const page = await tmdb(path, key, {
        sort_by: `${newRelDateField}.desc`,
        ...(wantIndian ? { with_origin_country: 'IN' } : {}),
        'vote_average.gte': newRelVote,
        'vote_count.gte': wantIndian ? newRelVotesIndian : (isMovie ? newRelVotes : newRelVotesSeries),
        [`${newRelDateField}.lte`]: todayStr,
        [`${newRelDateField}.gte`]: newRelFrom,
        page: p,
      });
      const fresh = (page.results || []).filter((it) => !newRelSeen.has(it.id));
      if (!fresh.length) continue;
      const made = await mapLimit(fresh, CONCURRENCY, async (item) => {
        if (!wantIndian && isIndianTitle(item)) return null;
        if (isMovie) {
          const imdbId = await resolveImdb(type, item.id, key, idMap);
          if (!imdbId) { stats.excludedNoImdb++; return null; }
          return { meta: toMeta(item, type, imdbId), date: (item.release_date || '').slice(0, 10), indian: wantIndian };
        }
        const meta = await seriesMeta(item, key, idMap, seriesCache, stats);
        if (!meta) return null;
        return { meta, date: (item.first_air_date || '').slice(0, 10), indian: wantIndian };
      });
      for (let i = 0; i < fresh.length; i++) {
        newRelSeen.add(fresh[i].id);
        if (got.length >= target) break;
        if (made[i]) got.push(made[i]);
      }
    }
    return got;
  }
  const newRelIndian = await newRelPass(true, NEW_REL_INDIAN_TARGET);
  const newRelGlobal = await newRelPass(false, ROW_CAP - newRelIndian.length);
  const newRelMerged = [...newRelIndian, ...newRelGlobal]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const newRelSliced = newRelMerged.slice(0, ROW_CAP);
  stats.newReleases = stats.newReleases || {};
  stats.newReleases[type] = {
    total: newRelSliced.length,
    indian: newRelSliced.filter((x) => x.indian).length,
    worldwide: newRelSliced.filter((x) => !x.indian).length,
    newest: newRelSliced.length ? newRelSliced[0].date : null,
    oldest: newRelSliced.length ? newRelSliced[newRelSliced.length - 1].date : null,
    windowDays: newRelDays,
  };
  rows['new-releases'] = newRelSliced.map((x) => x.meta);

  // --- v1.3.4: India Buzzing Now (both types) ---
  // The ranked title lists were fetched + Groq-analysed ONCE for the
  // whole rebuild (collectBuzz in main(), stored in ctx.buzz) — each
  // type consumes its own list here. Matching is TMDB search on the
  // normalized title (top-3, prefix-aware — "King" must not match
  // "The King"); the quality floor is in lib/buzz.js (rated path OR
  // fresh/upcoming path). Order is the BUZZ order (the LLM's ranking),
  // NOT re-sorted by popularity — the buzz ranking IS the row. Series
  // go through the same seriesMeta path (IMDb + v1.4 TV filter) as
  // every other series row; movies resolve IMDb the same way. A title
  // that cannot be matched, fails the floor, or has no IMDb id is
  // skipped and named in stats — never invented, never padded.
  const buzzVote = K('india-buzzing-now', 'voteFloor', BUZZ_MIN_VOTE);
  const buzzVotes = K('india-buzzing-now', 'voteCountFloor', BUZZ_MIN_VOTES);
  const buzzList = (ctx.buzz && ctx.buzz[isMovie ? 'movies' : 'series']) || [];
  const buzzMetas = [];
  const buzzSeen = new Set();
  const buzzRowStats = { ranked: buzzList.length, matched: 0, unmatched: [], belowFloor: [], noImdb: 0 };
  for (const cand of buzzList) {
    if (buzzMetas.length >= ROW_CAP) break;
    // Search TMDB with the NORMALIZED title (trailer/teaser words and
    // "Season N" stripped) — the raw Groq title ("Panchayat Season 5")
    // often matches nothing, while the normalized title ("panchayat")
    // matches the show. matchTmdbTitle normalizes again on both sides,
    // so "King" still never matches "The King".
    const searchTitle = normalizeTitle(cand.title, type) || cand.title;
    const searchPath = isMovie ? '/search/movie' : '/search/tv';
    const searchRes = await tmdb(searchPath, key, { query: searchTitle, page: 1 });
    const hit = matchTmdbTitle(searchTitle, type, searchRes.results || []);
    if (!hit) {
      if (buzzRowStats.unmatched.length < 10) buzzRowStats.unmatched.push(cand.title);
      continue;
    }
    if (buzzSeen.has(hit.id)) continue;
    buzzSeen.add(hit.id);
    const floor = buzzFloorPass(hit, { vote: buzzVote, votes: buzzVotes }, today);
    if (!floor.keep) {
      if (buzzRowStats.belowFloor.length < 10) {
        buzzRowStats.belowFloor.push(`${hit.title || hit.name} (va ${hit.vote_average}/vc ${hit.vote_count})`);
      }
      continue;
    }
    buzzRowStats.matched++;
    let meta = null;
    if (isMovie) {
      const imdbId = await resolveImdb(type, hit.id, key, idMap);
      if (!imdbId) { stats.excludedNoImdb++; buzzRowStats.noImdb++; continue; }
      meta = toMeta(hit, type, imdbId);
    } else {
      meta = await seriesMeta(hit, key, idMap, seriesCache, stats);
      if (!meta) continue;
    }
    if (meta) buzzMetas.push(meta);
  }
  rows['india-buzzing-now'] = buzzMetas;
  stats.buzz = stats.buzz || {};
  stats.buzz[type] = { total: buzzMetas.length, ...buzzRowStats };

  // --- #2 Trending Worldwide: TMDB /trending/{type}/week, NO Indian
  // filter (v1.2 logic, reused) — the week's worldwide hits. Scan up
  // to 3 pages to fill 20 (some titles lack IMDb ids). Dedupe by tmdb
  // id across pages. Series: the v1.4 TV-show filter applies (the
  // episode cap kills long-running broadcast hits; the network
  // blocklist is Indian-only by design, so a short Western broadcast
  // show trending globally can still appear — reported honestly).
  const globalMetas = [];
  const seenGlobal = new Set();
  for (let gPage = 1; gPage <= 3 && globalMetas.length < ROW_CAP; gPage++) {
    const gPath = isMovie ? '/trending/movie/week' : '/trending/tv/week';
    const gTrend = await tmdb(gPath, key, { page: gPage });
    if (isMovie) {
      for (const item of gTrend.results || []) {
        if (globalMetas.length >= ROW_CAP) break;
        if (seenGlobal.has(item.id)) continue;
        seenGlobal.add(item.id);
        const imdbId = await resolveImdb(type, item.id, key, idMap);
        if (!imdbId) { stats.excludedNoImdb++; continue; }
        globalMetas.push(toMeta(item, type, imdbId));
      }
    } else {
      await addSeriesPage(gTrend.results || [], globalMetas, seenGlobal, ROW_CAP, key, idMap, seriesCache, stats);
    }
  }
  rows['global-trending'] = globalMetas;

  if (isMovie) {
    // --- #3 Fresh Digital / OTT Drops (movie): new INDIAN movies
    // (v2.0.2: with_origin_country IN — was global) with a
    // DIGITAL release in the last 45 days, vote_average>=6, sorted by
    // digital date desc. Discover by release_date window (any release
    // type), then the detail check: any country's type-4 date inside
    // the window. Final order is the actual digital date desc (from
    // the detail), not the discover sort. Scan up to 3 discover pages
    // (DETAIL_CANDIDATE_CAP = 60 detail calls max).
    const freshFrom = isoDate(daysFromNow(-freshDays));
    const freshKept = [];
    const seenFresh = new Set();
    for (let p = 1; p <= 3 && freshKept.length < ROW_CAP; p++) {
      const page = await tmdb('/discover/movie', key, {
        sort_by: 'release_date.desc',
        with_origin_country: 'IN',
        'vote_average.gte': 6,
        'release_date.lte': todayStr,
        'release_date.gte': freshFrom,
        page: p,
      });
      const kept = await addMovieDetailPage(page.results || [], seenFresh, key, idMap, movieCache, stats,
        (detail) => digitalReleaseDate(detail, freshFrom, todayStr) !== null);
      for (const k of kept) {
        k.digitalDate = digitalReleaseDate(k.detail, freshFrom, todayStr);
        freshKept.push(k);
      }
      // Candidate cap: 3 discover pages x 20 items = 60 detail calls max.
    }
    freshKept.sort((a, b) => (b.digitalDate || '').localeCompare(a.digitalDate || ''));
    rows['fresh-digital-drops'] = freshKept.slice(0, ROW_CAP).map((k) => k.meta);

    // --- #4 Latest Indian Movies - OTT Ready (movie): Indian movies,
    // digital release yes, last 90 days, sort release date desc. Same
    // digital detail check as #3 (type 4, any country, in window).
    // Discover: origin IN + primary_release_date window, sort
    // primary_release_date.desc. Scan up to 3 pages (60 detail max).
    const ottFrom = isoDate(daysFromNow(-ottDays));
    const ottKept = [];
    const seenOtt = new Set();
    for (let p = 1; p <= 3 && ottKept.length < ROW_CAP; p++) {
      const page = await tmdb('/discover/movie', key, {
        sort_by: 'primary_release_date.desc',
        with_origin_country: 'IN',
        'primary_release_date.lte': todayStr,
        'primary_release_date.gte': ottFrom,
        page: p,
      });
      const kept = await addMovieDetailPage(page.results || [], seenOtt, key, idMap, movieCache, stats,
        (detail) => digitalReleaseDate(detail, ottFrom, todayStr) !== null);
      ottKept.push(...kept.map((k) => k.meta));
      // Candidate cap: 3 discover pages x 20 items = 60 detail calls max.
    }
    rows['latest-indian-ott'] = ottKept.slice(0, ROW_CAP);

    // --- #10 Now in Theatres (movie): TMDB /movie/now_playing,
    // region IN, vote_count>=10 (v2.0.1: was 1000), sort popularity
    // (the endpoint's own order). Scan up to 5 pages (was 3). The
    // >=10 floor keeps Ramayana (57) and Jailer 2 (40) while dropping
    // the 0-vote noise; 13 titles pass in 5 pages, so the row lands
    // at ~13, honest, not padded.
    const theatreMetas = [];
    const seenTheatre = new Set();
    for (let p = 1; p <= 5 && theatreMetas.length < ROW_CAP; p++) {
      const page = await tmdb('/movie/now_playing', key, { region: 'IN', page: p });
      for (const item of page.results || []) {
        if (theatreMetas.length >= ROW_CAP) break;
        if (seenTheatre.has(item.id)) continue;
        seenTheatre.add(item.id);
        if ((item.vote_count || 0) < theatreVotes) continue;
        const imdbId = await resolveImdb(type, item.id, key, idMap);
        if (!imdbId) { stats.excludedNoImdb++; continue; }
        theatreMetas.push(toMeta(item, type, imdbId));
      }
    }
    rows['now-in-theatres'] = theatreMetas;

    // --- #21 Adrenaline Action, Heist & Revenge (movie): genres
    // Action/Crime, vote_average>=7, vote_count>=25000, sort
    // popularity.desc.
    rows['action-heist-revenge'] = await collectDiscoverRow('/discover/movie', {
      sort_by: 'popularity.desc',
      with_genres: `${GENRE_MOVIE.action}|${GENRE_MOVIE.crime}`,
      'vote_average.gte': actionVote,
      'vote_count.gte': actionVotes,
    }, ROW_CAP, 2, type, key, idMap, movieCache, stats);

    // --- #23 4K IMAX Visual Spectacles (movie): genres
    // Sci-Fi/Adventure/Fantasy, vote_average>=7.5, after 2015, sort
    // popularity.desc. HONEST LIMIT: TMDB carries no IMAX/4K flag —
    // there is no way to verify a title is actually IMAX or 4K from
    // TMDB data. This row is a genre + rating proxy for visually
    // spectacular titles; the NAME stays as basant wants it.
    rows['visual-spectacles'] = await collectDiscoverRow('/discover/movie', {
      sort_by: 'popularity.desc',
      with_genres: `${GENRE_MOVIE.scifi}|${GENRE_MOVIE.adventure}|${GENRE_MOVIE.fantasy}`,
      'vote_average.gte': visualVote,
      'primary_release_date.gte': `${VISUAL_SINCE_YEAR}-01-01`,
    }, ROW_CAP, 2, type, key, idMap, movieCache, stats);

    // --- #25 All-Time Classics (movie): substitute for the exact IMDb
    // Top 250 (not available via TMDB) — TMDB /movie/top_rated, plus
    // a vote_count>=10000 floor (v2.0.1: top_rated alone lets
    // unreleased/few-vote titles top the list — see classicVotes).
    // Scan up to 3 pages.
    const classicMetas = [];
    const seenClassic = new Set();
    for (let p = 1; p <= 3 && classicMetas.length < ROW_CAP; p++) {
      const page = await tmdb('/movie/top_rated', key, { page: p });
      for (const item of page.results || []) {
        if (classicMetas.length >= ROW_CAP) break;
        if (seenClassic.has(item.id)) continue;
        seenClassic.add(item.id);
        if ((item.vote_count || 0) < classicVotes) continue;
        const imdbId = await resolveImdb(type, item.id, key, idMap);
        if (!imdbId) { stats.excludedNoImdb++; continue; }
        classicMetas.push(toMeta(item, type, imdbId));
      }
    }
    rows['all-time-classics'] = classicMetas;
  } else {
    // --- #5 Latest Indian Web Series (series): Indian TV, last 90
    // days, sort first_air_date desc, WITH the v1.4 TV-show filter.
    const seriesFrom = isoDate(daysFromNow(-latestSeriesDays));
    rows['latest-indian-series'] = await collectDiscoverRow('/discover/tv', {
      sort_by: 'first_air_date.desc',
      with_origin_country: 'IN',
      'first_air_date.lte': todayStr,
      'first_air_date.gte': seriesFrom,
    }, ROW_CAP, SERIES_REFILL_PAGES_STANDARD, type, key, idMap, seriesCache, stats);

    // --- #8 Newly Announced Web Series (series): TV, status Planned /
    // In Production, first_air_date within next 365 days, sort
    // popularity.desc. Discover filters by status directly
    // (with_status: 1=Planned, 2=In Production); the detail check
    // verifies status again + the v1.4 TV filter. Scan up to 3 pages.
    rows['newly-announced-series'] = await collectDiscoverRow('/discover/tv', {
      sort_by: 'popularity.desc',
      with_status: '1|2',
      'first_air_date.gte': todayStr,
      'first_air_date.lte': isoDate(daysFromNow(newSeriesDays)),
    }, ROW_CAP, 3, type, key, idMap, seriesCache, stats,
    (detail) => ANNOUNCED_STATUSES.includes(detail.status));

    // --- #9 New Season Returning Soon (series): TV, status Returning
    // Series, next_episode_to_air within 45 days, sort by next air
    // date asc. Discover narrows the pool directly: with_status=0
    // (Returning) + air_date window (an episode airing in the next 45
    // days). The detail check verifies status AND that
    // next_episode_to_air exists with an air_date inside the window,
    // then the row is sorted by that air date asc. HONEST CAVEAT: a
    // Returning Series between seasons has next_episode_to_air=null
    // when TMDB knows no date yet — those shows cannot appear here
    // (no date to sort by), so the row only holds shows with a known
    // next date. Scan up to 3 pages (60 detail calls max).
    const retFrom = todayStr;
    const retTo = isoDate(daysFromNow(retDays));
    const retPairs = [];
    const seenRet = new Set();
    for (let p = 1; p <= 3 && retPairs.length < ROW_CAP; p++) {
      const page = await tmdb('/discover/tv', key, {
        sort_by: 'popularity.desc',
        with_status: '0',
        'air_date.gte': retFrom,
        'air_date.lte': retTo,
        page: p,
      });
      const fresh = (page.results || []).filter((it) => !seenRet.has(it.id));
      const made = await mapLimit(fresh, CONCURRENCY, async (item) => {
        const res = await resolveSeriesItem(item, key, idMap, seriesCache);
        if (!res.imdbId) { stats.excludedNoImdb++; return null; }
        const reason = tvShowExcludeReason(res.detail);
        if (reason) { noteTvShowExcluded(stats, res.detail, reason); return null; }
        if (res.detail.status !== 'Returning Series') return null;
        const next = res.detail.next_episode_to_air;
        const airDate = next && next.air_date ? next.air_date.slice(0, 10) : null;
        if (!airDate || airDate < retFrom || airDate > retTo) return null;
        return { meta: toMeta(item, 'series', res.imdbId), airDate };
      });
      for (let i = 0; i < fresh.length; i++) {
        seenRet.add(fresh[i].id);
        if (made[i]) retPairs.push(made[i]);
      }
    }
    retPairs.sort((a, b) => a.airDate.localeCompare(b.airDate));
    rows['returning-soon'] = retPairs.slice(0, ROW_CAP).map((x) => x.meta);

    // --- #12 Indian Dark Crime & Thrillers (series): Indian TV,
    // genres Crime/Mystery, vote_average>=7.2, sort vote_average desc,
    // WITH the v1.4 TV-show filter. (TV has no Thriller genre — see
    // the genre note at the top of this file.)
    rows['dark-crime'] = await collectDiscoverRow('/discover/tv', {
      sort_by: 'vote_average.desc',
      with_origin_country: 'IN',
      with_genres: `${GENRE_TV.crime}|${GENRE_TV.mystery}`,
      'vote_average.gte': darkVote,
    }, ROW_CAP, SERIES_REFILL_PAGES_VOTE_FILTERED, type, key, idMap, seriesCache, stats);

    // --- #22 1-Season Binge Mini-Series (series): TMDB type
    // Miniseries preferred (discover with_type=2), else status Ended
    // + number_of_seasons<=1, vote_average>=7.8, vote_count>=1000
    // (v2.0.1: was 10000 — pass-1 pool was 1 title),
    // sort vote_average desc, WITH the v1.4 TV-show filter. Two
    // passes: pass 1 is with_type=2 (up to 5 pages); pass 2, only if
    // the row is still short, drops with_type and detail-checks the
    // Ended + <=1-season fallback (up to 5 pages).
    const miniMetas = [];
    const seenMini = new Set();
    const miniBase = {
      sort_by: 'vote_average.desc',
      'vote_average.gte': miniVote,
      'vote_count.gte': miniVotes,
    };
    for (let p = 1; p <= 5 && miniMetas.length < ROW_CAP; p++) {
      const page = await tmdb('/discover/tv', key, { ...miniBase, with_type: '2', page: p });
      await addSeriesPage(page.results || [], miniMetas, seenMini, ROW_CAP, key, idMap, seriesCache, stats,
        (detail) => detail.type === 'Miniseries');
    }
    if (miniMetas.length < ROW_CAP) {
      for (let p = 1; p <= 5 && miniMetas.length < ROW_CAP; p++) {
        const page = await tmdb('/discover/tv', key, { ...miniBase, page: p });
        await addSeriesPage(page.results || [], miniMetas, seenMini, ROW_CAP, key, idMap, seriesCache, stats,
          (detail) => detail.type === 'Miniseries'
            || (detail.status === 'Ended' && (detail.number_of_seasons || 0) <= 1));
      }
    }
    rows['one-season-miniseries'] = miniMetas;

    // --- #24 Top Action & Dark Anime (series): genre Animation,
    // origin JP, vote_average>=8, vote_count>=1000 (v2.0.1: was
    // 10000 — pool was 0), sort vote_average.desc (v2.0.1: was
    // popularity.desc — popularity order is full of long serials the
    // cap kills before the row ever reaches a keeper; rating order
    // puts the qualifying anime first). Scan up to 20 pages (v2.0.1:
    // was 10). WITH the v1.4 TV-show filter. HONEST NOTE: the
    // 100-episode cap excludes long-running anime (One Piece etc.) —
    // that is the v1.4 filter working as designed, not a bug.
    rows['action-anime'] = await collectDiscoverRow('/discover/tv', {
      sort_by: 'vote_average.desc',
      with_genres: `${GENRE_TV.animation}`,
      with_origin_country: 'JP',
      'vote_average.gte': animeVote,
      'vote_count.gte': animeVotes,
    }, ROW_CAP, ANIME_REFILL_PAGES, type, key, idMap, seriesCache, stats);
  }

  // --- #6 Releasing Next 30 Days (both) — v1.3.3: two fixes, one per type.
  // The old shape was a single discover pass (release/first_air_date in
  // [today, +30d], popularity.desc). It had two holes, both reported by
  // basant 19 Nov 2026: (1) series — returning seasons can NEVER match
  // first_air_date (Dhindora S2 premieres 20 Nov 2026, first aired 14 Oct
  // 2021, so it was absent from the live row); (2) movies — the global
  // popularity sort crowded Indian big drops out (live 19 Nov 2026: 2/20
  // Indian — O.M + Yeh Prem Mol Liya; Pratap, Suryaa, Eetha, Maatrubhumi,
  // Bokshi missing). TMDB checks before building: Pratap exists with
  // 2026-11-20, Eetha + Bokshi exist as 2026 titles dated 2026-12-04
  // (sort-crowded, fixable); Kaali Kheti, Gunmaaster G9 and the 2026
  // Chamunda have NO TMDB entry at all (data gap — no fix can surface
  // them, and no date is invented); Suryaa exists (movie/1522938) but
  // shows no release date on TMDB and Maatrubhumi's TMDB date reads
  // 2026-11-04 against the web-reported 4 Dec — both are settled by the
  // live rebuild, not by guessing. King (24 Dec) is OUTSIDE the window
  // and is never forced in.
  const nextFrom = todayStr;
  const nextTo = isoDate(daysFromNow(nextDays));
  if (isMovie) {
    // v1.3.3 movie: same 10/10 split as v1.3.1 new-releases — Indian pass
    // (with_origin_country IN, target 10) then worldwide pass (skips
    // Indian-origin titles), merged by release date desc. No vote floors:
    // upcoming titles have few/no TMDB votes, a floor would empty the
    // pool. The two passes select DIFFERENTLY, learned live across two
    // builds: the first build sorted both passes by primary_release_date
    // .desc and the nearest big drops vanished (O.M + Yeh Prem Mol Liya,
    // 20/27 Nov — they were in the old popularity-sorted row). The
    // second build sorted both by popularity.desc and O.M / Yeh Prem /
    // Bokshi / Kaali Kheti came back — but Pratap + Eetha were STILL out
    // even though live search proves both have IMDb ids on TMDB: TMDB
    // popularity is an unreliable proxy for Indian hype (obscure titles
    // outrank real upcoming films), so the Indian pass now selects by
    // IMMINENCE — primary_release_date.asc, the 10 nearest Indian
    // releases (the 20 Nov cluster first). The worldwide pass keeps
    // popularity.desc (global TMDB popularity IS a good proxy for big
    // worldwide titles — Avengers: Doomsday, Dune 3 stay). The merge
    // re-sorts by date desc (per the brief).
    const nextIndian = [];
    const nextGlobal = [];
    const nextSeen = new Set();
    for (let p = 1; p <= 3 && nextIndian.length < REL_NEXT_INDIAN_TARGET; p++) {
      const page = await tmdb('/discover/movie', key, {
        sort_by: 'primary_release_date.asc',
        with_origin_country: 'IN',
        'primary_release_date.gte': nextFrom,
        'primary_release_date.lte': nextTo,
        page: p,
      });
      for (const item of page.results || []) {
        if (nextIndian.length >= REL_NEXT_INDIAN_TARGET) break;
        if (nextSeen.has(item.id)) continue;
        nextSeen.add(item.id);
        const imdbId = await resolveImdb(type, item.id, key, idMap);
        if (!imdbId) { stats.excludedNoImdb++; continue; }
        nextIndian.push({ meta: toMeta(item, type, imdbId), date: (item.release_date || '').slice(0, 10), indian: true });
      }
    }
    for (let p = 1; p <= 3 && nextGlobal.length < ROW_CAP - nextIndian.length; p++) {
      const page = await tmdb('/discover/movie', key, {
        sort_by: 'popularity.desc',
        'primary_release_date.gte': nextFrom,
        'primary_release_date.lte': nextTo,
        page: p,
      });
      for (const item of page.results || []) {
        if (nextGlobal.length >= ROW_CAP - nextIndian.length) break;
        if (nextSeen.has(item.id)) continue;
        nextSeen.add(item.id);
        if (isIndianTitle(item)) continue;
        const imdbId = await resolveImdb(type, item.id, key, idMap);
        if (!imdbId) { stats.excludedNoImdb++; continue; }
        nextGlobal.push({ meta: toMeta(item, type, imdbId), date: (item.release_date || '').slice(0, 10), indian: false });
      }
    }
    const nextMerged = [...nextIndian, ...nextGlobal]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const nextSliced = nextMerged.slice(0, ROW_CAP);
    stats.releasingNext30 = stats.releasingNext30 || {};
    stats.releasingNext30.movie = {
      total: nextSliced.length,
      indian: nextSliced.filter((x) => x.indian).length,
      worldwide: nextSliced.filter((x) => !x.indian).length,
      windowDays: nextDays,
    };
    rows['releasing-next-30-days'] = nextSliced.map((x) => x.meta);
  } else {
    // v1.3.3 series: two passes, 10/10. (A) New premieres — the old
    // first_air_date discover, unchanged except the target is now 10.
    // (B) Returning seasons — two sub-passes sharing one detail check:
    // a season premiering in the window, accepted as EITHER a next
    // episode that is a season premiere (SxxE01 in the window) OR any
    // season (number >= 1) whose air_date is in the window — both are
    // TMDB data, never invented; season 0 (Specials) is excluded. The
    // seasons[] half exists because TMDB's show-level fields are stale
    // for Indian web series: Dhindora's S2 episodes carry air_date
    // 2026-11-20 (proven via the live meta endpoint) yet the #9 row —
    // built on status/next_episode_to_air — lacks Dhindora entirely.
    // B1 (global returning): discover with_status=0 + air_date window
    // (the #9 approach; build 1 proved it finds 10). B2 (Indian
    // stale-status): discover with_origin_country=IN + air_date window,
    // NO status filter. Build 2 dropped with_status GLOBALLY and got 0
    // returning — the unfiltered pool drowns the signal — so the
    // unfiltered scan is scoped to Indian titles only, where Dhindora
    // lives. Merged by air date ASC (soonest first): this is a release
    // calendar, and date-asc is what puts tomorrow's premiere (Dhindora
    // S2, 20 Nov) on top — the old popularity order is what buried
    // Indian titles. A show in both passes is deduped (returning passes
    // skip premiere ids).
    const premPairs = [];
    const premSeen = new Set();
    for (let p = 1; p <= SERIES_REFILL_PAGES_STANDARD && premPairs.length < REL_NEXT_PREMIERE_TARGET; p++) {
      const page = await tmdb('/discover/tv', key, {
        sort_by: 'popularity.desc',
        'first_air_date.gte': nextFrom,
        'first_air_date.lte': nextTo,
        page: p,
      });
      const fresh = (page.results || []).filter((it) => !premSeen.has(it.id));
      if (!fresh.length) continue;
      const made = await mapLimit(fresh, CONCURRENCY, (item) => seriesMeta(item, key, idMap, seriesCache, stats));
      for (let i = 0; i < fresh.length; i++) {
        premSeen.add(fresh[i].id);
        if (premPairs.length >= REL_NEXT_PREMIERE_TARGET) break;
        if (made[i]) premPairs.push({ meta: made[i], date: (fresh[i].first_air_date || '').slice(0, 10), kind: 'premiere' });
      }
    }
    const retPairs = [];
    const retSeen = new Set();
    async function checkReturning(item) {
      const res = await resolveSeriesItem(item, key, idMap, seriesCache);
      if (!res.imdbId) { stats.excludedNoImdb++; return null; }
      const reason = tvShowExcludeReason(res.detail);
      if (reason) { noteTvShowExcluded(stats, res.detail, reason); return null; }
      let airDate = null;
      const next = res.detail.next_episode_to_air;
      if (next && next.air_date && next.episode_number === 1) {
        const d = next.air_date.slice(0, 10);
        if (d >= nextFrom && d <= nextTo) airDate = d;
      }
      if (!airDate) {
        const seasons = res.detail.seasons || [];
        for (const s of seasons) {
          if ((s.season_number || 0) < 1) continue;
          const d = (s.air_date || '').slice(0, 10);
          if (d && d >= nextFrom && d <= nextTo) { airDate = d; break; }
        }
      }
      if (!airDate) return null;
      return { meta: toMeta(item, 'series', res.imdbId), airDate };
    }
    async function returningPass(base, maxPages) {
      for (let p = 1; p <= maxPages && retPairs.length < ROW_CAP - premPairs.length; p++) {
        const page = await tmdb('/discover/tv', key, { ...base, page: p });
        const fresh = (page.results || []).filter((it) => !retSeen.has(it.id) && !premSeen.has(it.id));
        if (!fresh.length) continue;
        const made = await mapLimit(fresh, CONCURRENCY, checkReturning);
        for (let i = 0; i < fresh.length; i++) {
          retSeen.add(fresh[i].id);
          if (retPairs.length >= ROW_CAP - premPairs.length) break;
          if (made[i]) retPairs.push({ meta: made[i].meta, date: made[i].airDate, kind: 'returning' });
        }
      }
    }
    await returningPass({
      sort_by: 'popularity.desc',
      with_status: '0',
      'air_date.gte': nextFrom,
      'air_date.lte': nextTo,
    }, 3);
    await returningPass({
      sort_by: 'popularity.desc',
      with_origin_country: 'IN',
      'air_date.gte': nextFrom,
      'air_date.lte': nextTo,
    }, 5);
    const nextMerged = [...premPairs, ...retPairs]
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const nextSliced = nextMerged.slice(0, ROW_CAP);
    stats.releasingNext30 = stats.releasingNext30 || {};
    stats.releasingNext30.series = {
      total: nextSliced.length,
      premieres: nextSliced.filter((x) => x.kind === 'premiere').length,
      returning: nextSliced.filter((x) => x.kind === 'returning').length,
      windowDays: nextDays,
    };
    rows['releasing-next-30-days'] = nextSliced.map((x) => x.meta);
  }

  // --- #7 Big Announcements 2026-2027 (both): status Planned / In
  // Production, release within the next 500 days, sort popularity.
  // TMDB discover has NO status filter for movies — the movie side
  // filters by status via detail calls (one /movie/{id} call per
  // candidate, reused for the imdb id). The series side CAN filter in
  // discover (with_status=1|2) and the detail check verifies it again.
  // Detail candidates capped at DETAIL_CANDIDATE_CAP (60) per type.
  const bigFrom = todayStr;
  const bigTo = isoDate(daysFromNow(bigDays));
  if (isMovie) {
    const bigKept = [];
    const seenBig = new Set();
    for (let p = 1; p <= 3 && bigKept.length < ROW_CAP; p++) {
      const page = await tmdb('/discover/movie', key, {
        sort_by: 'popularity.desc',
        'primary_release_date.gte': bigFrom,
        'primary_release_date.lte': bigTo,
        page: p,
      });
      const kept = await addMovieDetailPage(page.results || [], seenBig, key, idMap, movieCache, stats,
        (detail) => ANNOUNCED_STATUSES.includes(detail.status));
      bigKept.push(...kept.map((k) => k.meta));
    }
    rows['big-announcements'] = bigKept.slice(0, ROW_CAP);
  } else {
    rows['big-announcements'] = await collectDiscoverRow('/discover/tv', {
      sort_by: 'popularity.desc',
      with_status: '1|2',
      'first_air_date.gte': bigFrom,
      'first_air_date.lte': bigTo,
    }, ROW_CAP, 3, type, key, idMap, seriesCache, stats,
    (detail) => ANNOUNCED_STATUSES.includes(detail.status));
  }

  // --- #13 Underrated Indian Gems (both): Indian origin,
  // vote_average>=7.8, vote_count 2000-25000 (the "underrated" band:
  // loved, but not widely voted), sort vote_average desc.
  const underBase = {
    sort_by: 'vote_average.desc',
    with_origin_country: 'IN',
    'vote_average.gte': underVote,
    'vote_count.gte': underMinVotes,
    'vote_count.lte': underMaxVotes,
  };
  rows['underrated-gems'] = await collectDiscoverRow(path, underBase,
    ROW_CAP, isMovie ? 2 : SERIES_REFILL_PAGES_VOTE_FILTERED, type, key, idMap,
    isMovie ? movieCache : seriesCache, stats);

  // --- #19 Mind-Bending Sci-Fi & Time Travel (both): genre Sci-Fi,
  // keywords time travel / simulation / space / dystopia (resolved at
  // build time via /search/keyword — see ctx.keywordIds), vote>=7.3,
  // sort popularity.desc (v2.0.1: was vote_average.desc — rating
  // order surfaced unknown high-rated titles like CYBEROW and Hell
  // PHYRE. Popularity order leads with recognizable titles:
  // Project Hail Mary, Interstellar, The Matrix, Dune, Rick and
  // Morty, Doctor Who — probed 18 Nov 2026). Global, not India-only.
  // If NO keyword resolved, the row is genre-only (logged in
  // stats.keywords).
  const scifiBase = {
    sort_by: 'popularity.desc',
    with_genres: isMovie ? `${GENRE_MOVIE.scifi}` : `${GENRE_TV.scifiFantasy}`,
    'vote_average.gte': scifiVote,
  };
  if (ctx.keywordIds.length) scifiBase.with_keywords = ctx.keywordIds.join('|');
  rows['scifi-time-travel'] = await collectDiscoverRow(path, scifiBase,
    ROW_CAP, isMovie ? 2 : SERIES_REFILL_PAGES_VOTE_FILTERED, type, key, idMap,
    isMovie ? movieCache : seriesCache, stats);

  // --- #20 High-Tension Psychological Thrillers (both): genres
  // Thriller/Mystery, vote_average>=7.5, sort popularity.desc. The
  // vote_count floor is split (v2.0.1): movie keeps 20000 (row was
  // 11/20, healthy), series uses 2000 (was 20000 — series pool was 1
  // title; see thrillVotesSeries). Series side: TMDB has no
  // Thriller TV genre, so Mystery + Crime (see genre note at the top
  // of this file).
  const thrillBase = {
    sort_by: 'popularity.desc',
    with_genres: isMovie
      ? `${GENRE_MOVIE.thriller}|${GENRE_MOVIE.mystery}`
      : `${GENRE_TV.mystery}|${GENRE_TV.crime}`,
    'vote_average.gte': thrillVote,
    'vote_count.gte': isMovie ? thrillVotesMovie : thrillVotesSeries,
  };
  rows['psychological-thrillers'] = await collectDiscoverRow(path, thrillBase,
    ROW_CAP, isMovie ? 2 : SERIES_REFILL_PAGES_VOTE_FILTERED, type, key, idMap,
    isMovie ? movieCache : seriesCache, stats);

  return rows;
}

// v1.2.9: ONE put per rebuild — the whole catalog set (rows + idmap
// + summary) goes into catalogs/_bundle.json (see lib/bundle.js).
// The put is SKIPPED when the content hash matches yesterday's bundle,
// so quiet days cost 0 Advanced requests. The legacy per-row files
// are NOT written any more; they stay in Blob as a frozen read
// fallback. A failed put writes nothing, so yesterday's bundle keeps
// serving — the same invariant as the old per-row writes.
async function writeBundle(rows, idMap, summary, builtAt, token) {
  const { buildBundle, shouldSkipPut, readBundle, BUNDLE_KEY } = require('../lib/bundle');
  const { put } = require('@vercel/blob');
  const shapedRows = Object.fromEntries(
    Object.entries(rows).map(([id, metas]) => [id, { metas, builtAt }])
  );
  const bundle = buildBundle({ rows: shapedRows, idmap: idMap, summary, builtAt });
  let prev = null;
  try {
    prev = await readBundle();
  } catch (e) {
    console.log(`[build-catalogs] could not read previous bundle, writing anyway: ${e.message}`);
  }
  if (shouldSkipPut(prev, bundle.hash)) {
    console.log(`[build-catalogs] bundle unchanged (hash ${bundle.hash.slice(0, 8)}), skipping put — 0 Advanced requests today`);
    return { skipped: true, hash: bundle.hash };
  }
  await put(BUNDLE_KEY, JSON.stringify(bundle), {
    access: 'public', token, addRandomSuffix: false, allowOverwrite: true,
  });
  return { skipped: false, hash: bundle.hash };
}

// v1.2.9: the idmap lives inside the bundle; the legacy _idmap.json
// is the fallback (frozen since the v1.2.9 rebuild). Direct public-URL
// reads (SIMPLE requests) — the builder's reads per run no longer burn
// an ADVANCED request.
async function readIdMap() {
  try {
    const { readBundle } = require('../lib/bundle');
    const bundle = await readBundle();
    if (bundle && bundle.idmap && typeof bundle.idmap === 'object') return bundle.idmap;
  } catch (e) {
    console.log(`[build-catalogs] could not read id map from bundle: ${e.message}`);
  }
  try {
    const { readBlobJson } = require('../lib/blob');
    const json = await readBlobJson('catalogs/_idmap.json');
    return json || {};
  } catch (e) {
    console.log(`[build-catalogs] could not read existing id map, starting fresh: ${e.message}`);
    return {};
  }
}

// v1.3.4: fetch today's buzz ONCE per rebuild (all three sources in
// parallel + one Groq ranking call) and store the ranked title lists
// in ctx.buzz for buildRows to consume per type. NEVER throws: a dead
// source, a missing GROQ_API_KEY, or a failed Groq call leaves the
// buzz rows empty and the rest of the rebuild proceeds normally —
// stats record exactly what happened so the row is debuggable, not
// silently empty.
async function collectBuzz() {
  const out = { movies: [], series: [], sources: null, groq: { ok: false, error: 'not run' } };
  try {
    const fetched = await fetchBuzzItems();
    out.sources = fetched.sources;
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) { out.groq = { ok: false, error: 'no GROQ_API_KEY' }; return out; }
    if (!fetched.items.length) { out.groq = { ok: false, error: 'no buzz items' }; return out; }
    const res = await groqAnalyze(fetched.items, groqKey);
    if (res.error) { out.groq = { ok: false, error: res.error }; return out; }
    out.movies = res.movies || [];
    out.series = res.series || [];
    out.groq = { ok: true, candidates: out.movies.length + out.series.length };
  } catch (e) {
    out.groq = { ok: false, error: String((e && e.message) || e).slice(0, 120) };
  }
  return out;
}

async function main() {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.log('[build-catalogs] no key, skipping');
    return { skipped: true };
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.log('[build-catalogs] no BLOB_READ_WRITE_TOKEN, cannot write rows — aborting (yesterday\'s rows keep serving)');
    return { skipped: true, reason: 'no-blob-token' };
  }
  const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, keywords: null, trendingTopUp: {} };
  const { readConfig } = require('../lib/config');
  const cfg = await readConfig();
  const idMap = await readIdMap();
  // v2.0: per-run detail caches (series + movie) shared across rows, and
  // the #19 Sci-Fi keyword ids resolved once, before any row builds.
  const ctx = {
    seriesCache: new Map(),
    movieCache: new Map(),
    keywordIds: await resolveKeywords(key, stats),
    config: cfg,
  };
  // v1.3.4: buzz is fetched + ranked once for the whole rebuild (never
  // throws — see collectBuzz), then each type consumes its own list.
  try {
    ctx.buzz = await collectBuzz();
    stats.buzz = { sources: ctx.buzz.sources, groq: ctx.buzz.groq };
  } catch (e) {
    ctx.buzz = { movies: [], series: [], sources: null, groq: { ok: false, error: String(e.message || e).slice(0, 120) } };
    stats.buzz = { sources: null, groq: ctx.buzz.groq };
  }
  const rows = {};
  for (const type of ['movie', 'series']) {
    const built = await buildRows(type, key, idMap, stats, ctx);
    for (const [rowId, metas] of Object.entries(built)) {
      const fullId = `${rowId}-${type}`;
      if (cfg.catalogs && cfg.catalogs[fullId] && cfg.catalogs[fullId].enabled === false) continue;
      rows[fullId] = metas;
    }
  }
  // v1.2.9: ONE builtAt for the whole run (shared by rows + summary)
  // so identical content hashes identically and the skip-put check can
  // fire. The bundle write is a single put (or zero, when unchanged).
  const builtAt = new Date().toISOString();
  const summary = {
    builtAt,
    catalogs: Object.fromEntries(
      Object.entries(rows).map(([id, metas]) => [
        id,
        {
          count: metas.length,
          top: metas.slice(0, 3).map((m) => m.name),
          builtAt,
        },
      ])
    ),
  };
  const bundleResult = await writeBundle(rows, idMap, summary, builtAt, token);
  // v1.3.1: prune legacy per-row files for removed catalogs (see
  // REMOVED_LEGACY_ROWS). Runs even when the bundle put is skipped —
  // the legacy file is stale either way. HEAD first (SIMPLE request);
  // del only when the file exists, so quiet days cost 0 Advanced
  // requests. Errors are swallowed: a stale legacy file is a cosmetic
  // leftover, never a rebuild failure.
  const prunedLegacy = [];
  try {
    const { del } = require('@vercel/blob');
    const { publicBaseUrl } = require('../lib/blob');
    for (const rowId of REMOVED_LEGACY_ROWS) {
      const pathname = `catalogs/${rowId}.json`;
      let exists = false;
      try {
        const head = await fetch(`${publicBaseUrl()}/${pathname}`, { method: 'HEAD' });
        exists = head.status !== 404;
      } catch (e) { exists = false; }
      if (!exists) continue;
      try {
        await del(`${publicBaseUrl()}/${pathname}`, { token });
        prunedLegacy.push(rowId);
        console.log(`[build-catalogs] pruned legacy row file ${pathname}`);
      } catch (e) {
        console.log(`[build-catalogs] legacy prune failed for ${pathname}: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`[build-catalogs] legacy prune unavailable: ${e.message}`);
  }
  const counts = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]));
  console.log(`[build-catalogs] done. rows=${JSON.stringify(counts)} excludedNoImdb=${stats.excludedNoImdb} excludedTvShow=${JSON.stringify(stats.excludedTvShow)} keywords=${JSON.stringify(stats.keywords)} idMapSize=${Object.keys(idMap).length} bundleSkipped=${bundleResult.skipped} bundleHash=${bundleResult.hash.slice(0, 8)} prunedLegacy=${JSON.stringify(prunedLegacy)}`);
  return { skipped: false, counts, excludedNoImdb: stats.excludedNoImdb, excludedTvShow: stats.excludedTvShow, keywords: stats.keywords, trendingTopUp: stats.trendingTopUp, newReleases: stats.newReleases, releasingNext30: stats.releasingNext30, buzz: stats.buzz, bundleSkipped: bundleResult.skipped, bundleHash: bundleResult.hash, prunedLegacy };
}

if (require.main === module) {
  main().then((r) => process.exit(r && r.skipped ? 0 : 0)).catch((e) => {
    console.error(`[build-catalogs] FAILED: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { main, buildRows, isIndianTitle, collectBuzz };
