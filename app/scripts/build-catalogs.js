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
//
// v1.4.3 (19 Nov 2026): 9 user-requested changes — underrated bands
// (movie 50-800 / series 25-300, va 7.5/7.6, movies runtime>=80),
// Action floor 3000 + 4-slot Indian reserve, Anime genres 16+10759
// with Kids/Family/Romance out + episode cap scoped to IN/Soap,
// OTT Ready watch-provider filter (IN flatrate), Thriller keywords,
// Reddit OAuth (buzz.js), dynamic Big Announcements year, upcoming
// rows to the bottom, Newly Announced Web Series removed. Every
// band/floor below is the user's exact spec — do not "improve" the
// numbers without his word.
//
// v1.5.5 (19 Nov 2026): 12 user-requested removals — Dark Crime,
// Underrated Gems (both), Sci-Fi (both), Psychological Thrillers
// (both), Action Heist & Revenge, 1-Season Binge, Visual Spectacles,
// Action Anime, All-Time Classics are gone COMPLETELY (builder,
// manifest, config knobs, admin labels, legacy Blob files). 17
// catalogs remain. Dead constants + the keyword resolver went with
// them (Sci-Fi + Thrillers were its only users).
//
// v1.5.6 (19 Nov 2026): buzz carry-over — India Buzzing Now has a
// 3-day memory (buzz-state.json in Blob). Fresh Groq titles first,
// then previous buzz titles that still pass the floor on fresh TMDB
// data; first run seeds from today's Trending in India rows. 1 change.
//
// v1.5.7 (19 Nov 2026): Indian TV & Reality Shows — a dedicated row
// for broadcast TV (Reality + Soap + Talk, origin IN, popularity
// desc) that DELIBERATELY bypasses the v1.4 TV filter: Bigg Boss is
// Reality type, on Colors, 100+ episodes per season — it fails all
// three filter layers. No vote floor (TMDB rates a Bigg Boss season
// page 3.7/10, 11 votes — any floor would kill the very title the row
// exists for). 1 change.

'use strict';

const { knob } = require('../lib/config');
const { fetchBuzzItems, groqAnalyze, matchTmdbTitle, normalizeTitle, buzzFloorPass, mergeBuzzRows, updateBuzzState, validateBuzzState, isCarryFresh, BUZZ_STATE_PATHNAME } = require('../lib/buzz');

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
// v1.5.5: the genre rows are gone (Sci-Fi, Thrillers, Action, Anime,
// Dark Crime, Visual Spectacles), so only the Soap id survived — the
// v1.4 TV-show filter uses it to scope the 100-episode cap to
// Indian-origin / Soap-genre titles (see tvShowExcludeReason).
// v1.5.7: Reality + Talk join it for the Indian TV & Reality Shows
// row (the TV filter's own exclusions live there as content).
const GENRE_TV = { soap: 10766, reality: 10764, talk: 10767 };

// --- v2.0 row windows / floors ---
const FRESH_DIGITAL_DAYS = 45;      // #3 Fresh Digital Drops: digital release in last 45d
const OTT_READY_DAYS = 90;          // #4 Latest Indian Movies - OTT Ready: digital in last 90d
const LATEST_SERIES_DAYS = 90;      // #5 Latest Indian Web Series: first aired in last 90d
const NEXT_30_DAYS = 30;            // #6 Releasing Next 30 Days
const BIG_ANNOUNCE_DAYS = 500;      // #7 Big Announcements: release within 500d
const RETURNING_DAYS = 45;          // #9 New Season Returning Soon: next episode within 45d
const THEATRES_DAYS = 45;           // #10 Now in Theatres (now_playing pages scanned)
const THEATRES_MIN_VOTES = 10;      // #10 vote_count floor (v2.0.1: was 1000 —
// current Indian releases have very few TMDB votes; Ramayana 57,
// Jailer 2 40. Probed 18 Nov 2026: now_playing IN 5 pages, >=1000: 0
// pass, >=100: 5, >=50: 7, >=10: 13. Floor 10 keeps the real
// in-theatre titles and drops the 0-vote noise.)
// v1.5.5: the #12/#13/#19-#25 row constants are gone with their rows
// (Dark Crime, Underrated, Sci-Fi, Thrillers, Action, Mini-Series,
// Visual Spectacles, Anime, Classics).
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
const BUZZ_SEED_TOP = 10;       // v1.5.6 seed: top N trending titles per type
const TV_REALITY_PAGES = 2;       // v1.5.7 Indian TV & Reality Shows:
const TV_REALITY_RESOLVE_CAP = 15; // 2 discover pages per genre pass,
const TV_REALITY_PER_PASS_KEEP = 10; // top 15 per pass resolved, first
 // 10 kept per pass (10/10 reserve — raw popularity is soap-dominated).
 // NO vote floor (see the row comment — Bigg Boss rates 3.7/10).
const TV_REALITY_ANCHOR_IMDB = 'tt1281973'; // v1.5.7 anchor: Bigg Boss
 // is the title this row was built for (basant: "jaise ki bhai big
 // boss"), but TMDB popularity ranks it below the Reality top 10, so
 // no popularity cut can ever include it. The anchor is resolved live
 // at build time via TMDB /find (exact IMDb id — verified live via the
 // addon's own search + meta, never invented) and verified Reality +
 // origin IN before inclusion; any failure skips it silently.

// v1.3.1: legacy per-row Blob files for REMOVED catalogs. The bundle no
// longer carries them, but readCatalogFile falls back to the frozen
// legacy file, so a removed row keeps serving stale data until its
// legacy file is deleted. The rebuild prunes these (one del, only when
// the file still exists — checked with a free HEAD first).
const REMOVED_LEGACY_ROWS = ['south-blockbusters-movie', 'newly-announced-series-series',
  // v1.5.5: the 12 removed rows (full catalog ids).
  'dark-crime-series', 'underrated-gems-movie', 'underrated-gems-series',
  'scifi-time-travel-movie', 'scifi-time-travel-series',
  'psychological-thrillers-movie', 'psychological-thrillers-series',
  'action-heist-revenge-movie', 'one-season-miniseries-series',
  'visual-spectacles-movie', 'action-anime-series', 'all-time-classics-movie'];

// Detail-heavy rows (#3, #4, #7, #9) cap the number of detail calls:
// 3 discover pages x 20 items = 60 candidates max per row. The cap is
// reported in stats, never silently exceeded.
const DETAIL_CANDIDATE_CAP = 60;

// v1.5.5: the Sci-Fi + Thriller keyword terms are gone with their rows;
// resolveKeywords had no other users.

// #4 OTT Ready watch providers (v1.4.3): TMDB provider ids for the
// major Indian OTTs — Netflix 8, Prime Video 119, Disney+ Hotstar 122,
// JioHotstar 2336, SonyLIV 237, Zee5 232. Netflix/Prime/JioHotstar/Zee5
// verified against an independent TMDB-based source (19 Nov 2026);
// SonyLIV/Disney+ Hotstar are the long-standing TMDB ids. Every build
// re-validates them against TMDB's live provider list (see
// resolveOttProviders) and drops any id TMDB no longer returns, so a
// stale id can never 422 the discover call and kill the rebuild.
const OTT_PROVIDERS = [8, 119, 122, 2336, 237, 232];

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
//   2. number_of_episodes > TV_MAX_EPISODES (100) -> exclude —
//      v1.4.3 SCOPED: only when the title is Indian-origin
//      (origin_country includes IN) or Soap-genre (10766). The cap was
//      built for Indian daily soaps, but applied to every series row it
//      also killed long anime (One Piece 1180 eps, Hunter x Hunter 148,
//      My Hero Academia 170) and long Western series. Indian soaps
//      stay excluded — the cap still fires for them, and the network
//      blocklist below catches the short ones too. Biggest real web
//      series probed is 56 (Charmsukh); smallest TV show probed is 474
//      (Kapil Sharma Show) — 100 sits between them with room on both
//      sides.
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
// v1.4.3: the episode cap is scoped to Indian-origin or Soap-genre
// titles (see layer 2 above) — long anime and long Western series are
// no longer killed by a filter built for Indian daily soaps.
function tvShowExcludeReason(detail) {
  if (!detail) return null;
  if (TV_EXCLUDED_TYPES.has(detail.type)) return `type:${detail.type}`;
  const eps = detail.number_of_episodes;
  if (typeof eps === 'number' && eps > TV_MAX_EPISODES) {
    const countries = detail.origin_country || [];
    const isSoap = (detail.genres || []).some((g) => g && g.id === GENRE_TV.soap);
    // The cap fires for Indian-origin, Soap-genre, or UNKNOWN-origin
    // titles (conservative default: a missing origin_country must
    // never leak a daily soap in). It is skipped only when the title
    // is KNOWN non-Indian and not Soap — long anime (One Piece,
    // Hunter x Hunter) and long Western series. Real TMDB /tv details
    // always carry origin_country, so the unknown branch only fires
    // on incomplete data.
    const knownNonIndian = countries.length > 0 && !countries.includes('IN');
    if (!knownNonIndian || isSoap) return `episodes:${eps}`;
  }
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
// match is DROPPED and recorded in stats[statsKey].dropped, never
// guessed. If every term drops, the row falls back to genre-only and
// stats[statsKey].allDropped is set (reported, not faked).
// v1.4.3: validate the #4 OTT provider ids against TMDB's live
// /watch/providers/movie list for region IN (one call per build).
// Returns the subset of OTT_PROVIDERS that TMDB still returns, or
// null when the list cannot be fetched / nothing validates — the
// caller then skips the provider filter entirely (date window +
// digital detail check, as before) instead of risking a 422 that
// would kill the whole rebuild. Never throws.
async function resolveOttProviders(key, stats) {
  try {
    const res = await tmdb('/watch/providers/movie', key, { watch_region: 'IN' });
    const live = new Set((res.results || []).map((p) => p.provider_id));
    const valid = OTT_PROVIDERS.filter((id) => live.has(id));
    const dropped = OTT_PROVIDERS.filter((id) => !live.has(id));
    stats.ottProviders = { configured: [...OTT_PROVIDERS], valid, dropped };
    return valid.length ? valid : null;
  } catch (e) {
    stats.ottProviders = { configured: [...OTT_PROVIDERS], valid: [], dropped: [...OTT_PROVIDERS], error: String((e && e.message) || e).slice(0, 80) };
    return null;
  }
}

// --- v1.5.7 Indian TV & Reality Shows anchor (pure, exported for tests) ---
// Insert the verified anchor title (Bigg Boss) at the head of the
// Reality half of the row. Returns new arrays (no mutation) +
// `anchored`: the anchor name, "<name> (already in row)" when it was
// already kept by the Reality pass, or null when there is no anchor.
// When the Reality half is full (10), the anchor displaces its 10th
// title so the half stays at 10 and the row stays capped at 20.
function applyTvRealityAnchor(metas, keptVotes, anchor, realityKept) {
  if (!anchor) return { metas, keptVotes, anchored: null };
  if (metas.some((m) => m && m.id === anchor.meta.id)) {
    return { metas, keptVotes, anchored: `${anchor.meta.name} (already in row)` };
  }
  const out = [anchor.meta, ...metas];
  const votes = [{ name: anchor.meta.name, va: anchor.va ?? null, vc: anchor.vc ?? null }, ...keptVotes];
  if (realityKept >= TV_REALITY_PER_PASS_KEEP) {
    out.splice(TV_REALITY_PER_PASS_KEEP, 1);
    votes.splice(TV_REALITY_PER_PASS_KEEP, 1);
  }
  return { metas: out, keptVotes: votes, anchored: anchor.meta.name };
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
  const retDays = K('returning-soon', 'windowDays', RETURNING_DAYS);
  const theatreVotes = K('now-in-theatres', 'voteCountFloor', THEATRES_MIN_VOTES);
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
  const buzzFloor = { vote: buzzVote, votes: buzzVotes };
  const buzzList = (ctx.buzz && ctx.buzz[isMovie ? 'movies' : 'series']) || [];
  const freshMetas = [];
  const freshEntries = [];
  const buzzSeen = new Set();
  const buzzRowStats = { ranked: buzzList.length, matched: 0, unmatched: [], belowFloor: [], noImdb: 0, carried: 0, carriedTitles: [], seeded: 0 };
  for (let fi = 0; fi < buzzList.length; fi++) {
    const cand = buzzList[fi];
    if (freshMetas.length >= ROW_CAP) break;
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
    const floor = buzzFloorPass(hit, buzzFloor, today);
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
    if (meta) {
      freshMetas.push(meta);
      // v1.5.6: fresh titles that made the row, for the state write in
      // main() — rank is the Groq rank (fi), the carry order after it.
      freshEntries.push({ tmdbId: hit.id, imdbId: meta.id, title: hit.title || hit.name || meta.name, rank: fi });
    }
  }
  // v1.5.6: carry-over — the row has a memory now. The remaining slots
  // fill from the persisted buzz state (previous buzz rank order),
  // re-checked against FRESH TMDB data (floor + TV filter + IMDb) so a
  // title that went stale can never ride in on yesterday's numbers.
  // A carried title keeps its old lastBuzz — only fresh buzz refreshes
  // the clock (see updateBuzzState), so 3 quiet rebuilds still drop it.
  // No state file (first run, or corrupt file) -> bootstrap from
  // today's Trending in India row (seedBuzzStateFromTrending).
  const carriedMetas = [];
  let stateEntries = [];
  if (ctx.buzzState) {
    stateEntries = (ctx.buzzState[isMovie ? 'movies' : 'series'] || [])
      .filter((e) => e && typeof e.tmdbId === 'number');
  } else {
    stateEntries = await seedBuzzStateFromTrending(rows['trending-indian'] || [], type, key, today, buzzFloor);
    buzzRowStats.seeded = stateEntries.length;
    ctx.buzzSeed = ctx.buzzSeed || { movies: [], series: [] };
    ctx.buzzSeed[isMovie ? 'movies' : 'series'] = stateEntries;
  }
  ctx.buzzFresh = ctx.buzzFresh || { movies: [], series: [] };
  ctx.buzzFresh[isMovie ? 'movies' : 'series'] = freshEntries;
  stateEntries.sort((a, b) => (a.rank - b.rank));
  for (const entry of stateEntries) {
    if (freshMetas.length + carriedMetas.length >= ROW_CAP) break;
    if (buzzSeen.has(entry.tmdbId)) continue; // already in the fresh row
    // Defensive: the writer prunes, so a loaded entry is fresh; a
    // missing lastBuzz (e.g. a hand-written entry) is treated as fresh
    // rather than silently dropped.
    if (entry.lastBuzz && !isCarryFresh(entry.lastBuzz, todayStr)) continue;
    const res = isMovie
      ? await resolveMovieItem({ id: entry.tmdbId }, key, idMap, movieCache)
      : await resolveSeriesItem({ id: entry.tmdbId }, key, idMap, seriesCache);
    if (!res || !res.imdbId) { buzzRowStats.noImdb++; continue; }
    if (!isMovie) {
      const reason = tvShowExcludeReason(res.detail);
      if (reason) { noteTvShowExcluded(stats, res.detail, reason); continue; }
    }
    const floor = buzzFloorPass(res.detail, buzzFloor, today);
    if (!floor.keep) {
      if (buzzRowStats.belowFloor.length < 10) {
        buzzRowStats.belowFloor.push(`${res.detail.title || res.detail.name} (va ${res.detail.vote_average}/vc ${res.detail.vote_count})`);
      }
      continue;
    }
    const meta = toMeta(res.detail, type, res.imdbId);
    if (meta) {
      carriedMetas.push(meta);
      buzzSeen.add(entry.tmdbId);
      buzzRowStats.carried++;
      if (buzzRowStats.carriedTitles.length < 10) buzzRowStats.carriedTitles.push(meta.name);
    }
  }
  // Fresh first (Groq rank order), carried after, deduped + capped.
  const buzzMetas = mergeBuzzRows(freshMetas, carriedMetas, ROW_CAP);
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
    // v1.4.3: the discover ALSO requires an actual OTT presence —
    // watch_region=IN + with_watch_monetization_types=flatrate +
    // with_watch_providers (major Indian OTTs, validated live per
    // build — see resolveOttProviders). Before this the row only
    // checked the release DATE, so a film still only in theatres
    // could appear here with no streams. The 90-day window stays, so
    // the row stays "latest". When validation fails, the provider
    // filter is skipped (date + digital check only) — never fatal.
    const ottFrom = isoDate(daysFromNow(-ottDays));
    const ottProviders = await resolveOttProviders(key, stats);
    const ottDiscoverParams = {
      sort_by: 'primary_release_date.desc',
      with_origin_country: 'IN',
      'primary_release_date.lte': todayStr,
      'primary_release_date.gte': ottFrom,
    };
    if (ottProviders) {
      ottDiscoverParams.watch_region = 'IN';
      ottDiscoverParams.with_watch_monetization_types = 'flatrate';
      ottDiscoverParams.with_watch_providers = ottProviders.join('|');
    }
    const ottKept = [];
    const seenOtt = new Set();
    for (let p = 1; p <= 3 && ottKept.length < ROW_CAP; p++) {
      const page = await tmdb('/discover/movie', key, {
        ...ottDiscoverParams,
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

    // --- #5b Indian TV & Reality Shows (series, v1.5.7, basant 19 Nov
    // 2026: "tv show bhi yehi add karo" — Bigg Boss jaise shows kahin
    // nahi aate the): the home for broadcast TV — Reality + Soap +
    // Talk, origin IN, popularity desc. This row DELIBERATELY bypasses
    // the v1.4 TV filter (no type check, no episode cap, no network
    // blocklist): Bigg Boss is Reality type, on Colors, with 100+
    // episodes per season — it fails all three layers, and the series
    // rows must keep the filter (basant ordered it 18 Nov 2026 to keep
    // C.I.D./Kyunki/Kapil out of them). Two discover passes — Reality
    // (10764); Soap|Talk (10766|10767, pipe = OR in TMDB with_genres).
    // NO vote floor: probe 19 Nov 2026 — TMDB rates a Bigg Boss season
    // page 3.7/10 (11 votes), and the other reality shows score low
    // too, so ANY vote_average floor would kill the very title the row
    // exists for; popularity is the signal. 10/10 RESERVE (the
    // new-releases precedent): the first v1.5.7 rebuild proved raw
    // popularity is soap-dominated — the merged top 20 held 17 soaps/
    // talk shows and NO Bigg Boss — so each pass keeps its own top 10
    // (Reality first, then Soap|Talk), deduped across passes. ANCHOR:
    // Bigg Boss still misses even the Reality top 10 on TMDB
    // popularity (Crime Patrol, Indian Idol, Khatron Ke Khiladi, ...
    // all rank above it), so the verified anchor
    // (TV_REALITY_ANCHOR_IMDB) is resolved live and takes the first
    // slot of the Reality half (see applyTvRealityAnchor). Stats carry
    // the probe (discover totals + kept titles' vote_average/
    // vote_count) so the rebuild response documents it.
    // Anchor first: resolve Bigg Boss live via /find (exact IMDb id),
    // verify Reality + origin IN; any failure skips it silently.
    let tvAnchor = null;
    try {
      const found = await tmdb(`/find/${TV_REALITY_ANCHOR_IMDB}`, key, { external_source: 'imdb_id' });
      const hit = (found && found.tv_results && found.tv_results[0]) || null;
      if (hit) {
        const res = await resolveSeriesItem(hit, key, idMap, seriesCache);
        const d = res.detail || {};
        const isReality = (d.genres || []).some((g) => g && g.id === GENRE_TV.reality);
        const isIN = (d.origin_country || []).includes('IN');
        if (res.imdbId && isReality && isIN) {
          tvAnchor = { meta: toMeta(hit, 'series', res.imdbId), va: hit.vote_average, vc: hit.vote_count };
        }
      }
    } catch (e) {
      console.log(`[build-catalogs] tv-reality anchor skipped: ${e.message}`);
    }
    const tvRealStats = { passRealityTotal: 0, passSoapTalkTotal: 0, scanned: 0, kept: 0, realityKept: 0, soapTalkKept: 0, noImdb: 0, keptVotes: [], anchored: null };
    const tvRealSeen = new Set();
    const tvRealMetas = [];
    for (const [genres, totalKey, keepKey] of [
      [String(GENRE_TV.reality), 'passRealityTotal', 'realityKept'],
      [`${GENRE_TV.soap}|${GENRE_TV.talk}`, 'passSoapTalkTotal', 'soapTalkKept'],
    ]) {
      const passItems = new Map();
      for (let p = 1; p <= TV_REALITY_PAGES; p++) {
        const page = await tmdb('/discover/tv', key, {
          sort_by: 'popularity.desc',
          with_origin_country: 'IN',
          with_genres: genres,
          page: p,
        });
        if (p === 1) tvRealStats[totalKey] = page.total_results || 0;
        for (const item of page.results || []) {
          if (!passItems.has(item.id)) passItems.set(item.id, item);
        }
      }
      const passSorted = [...passItems.values()]
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      tvRealStats.scanned += passSorted.length;
      const passTop = passSorted.slice(0, TV_REALITY_RESOLVE_CAP);
      const passMade = await mapLimit(passTop, CONCURRENCY, async (item) => {
        const res = await resolveSeriesItem(item, key, idMap, seriesCache);
        if (!res.imdbId) { stats.excludedNoImdb++; tvRealStats.noImdb++; return null; }
        return { meta: toMeta(item, 'series', res.imdbId), va: item.vote_average, vc: item.vote_count };
      });
      let passKept = 0;
      for (const made of passMade) {
        if (passKept >= TV_REALITY_PER_PASS_KEEP) break;
        if (!made) continue;
        if (tvRealSeen.has(made.meta.id)) continue; // already kept via the other pass
        tvRealSeen.add(made.meta.id);
        tvRealMetas.push(made.meta);
        passKept++;
        if (tvRealStats.keptVotes.length < ROW_CAP) {
          tvRealStats.keptVotes.push({ name: made.meta.name, va: made.va ?? null, vc: made.vc ?? null });
        }
      }
      tvRealStats[keepKey] = passKept;
    }
    const anchored = applyTvRealityAnchor(tvRealMetas, tvRealStats.keptVotes, tvAnchor, tvRealStats.realityKept);
    tvRealStats.keptVotes = anchored.keptVotes;
    tvRealStats.anchored = anchored.anchored;
    tvRealStats.kept = anchored.metas.length;
    stats.indianTvReality = tvRealStats;
    rows['indian-tv-reality'] = anchored.metas.slice(0, ROW_CAP);

    // --- #8 Newly Announced Web Series: REMOVED in v1.4.3 — it was a
    // near-duplicate of Big Announcements Series (same with_status=1|2
    // filter, only the window differed: 365d vs 500d). The row is gone
    // from the builder, the manifest, the config knob and the admin
    // labels; its frozen legacy Blob file is pruned via
    // REMOVED_LEGACY_ROWS ('newly-announced-series-series').

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

  // --- #7 Big Announcements (both): status Planned / In
  // Production, release within the next 500 days, sort popularity.
  // v1.4.3: the display name year is dynamic (currentYear–nextYear,
  // computed in lib/manifest.js + lib/config.js) — no hardcoded year
  // in code, config or admin labels any more.
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

// v1.5.6: one-time bootstrap for the buzz state — with no state
// file, seed the memory from TODAY's Trending in India row (top 10,
// floor-passing only). The trending row is already TV-filter-clean
// for series, so no re-filter is needed; the floor is checked via
// TMDB /find by IMDb id (exact — no fuzzy search). The returned
// entries carry no dates; updateBuzzState stamps firstSeen/lastBuzz
// = today when it inserts them. Runs once — after the seed, the
// state evolves only from real buzz.
async function seedBuzzStateFromTrending(trendMetas, type, key, today, floor) {
  const out = [];
  const todayStr = isoDate(today);
  const list = (trendMetas || []).slice(0, BUZZ_SEED_TOP);
  for (let i = 0; i < list.length; i++) {
    const meta = list[i];
    if (!meta || !meta.id) continue;
    try {
      const res = await tmdb(`/find/${meta.id}`, key, { external_source: 'imdb_id' });
      const found = type === 'movie'
        ? (res.movie_results || [])[0]
        : (res.tv_results || [])[0];
      if (!found) continue;
      if (!buzzFloorPass(found, floor, today).keep) continue;
      // Stamped today: the seed IS today's signal, so the carry loop
      // (which skips entries older than 3 days) treats it as fresh.
      out.push({ tmdbId: found.id, imdbId: meta.id, title: found.title || found.name || meta.name, firstSeen: todayStr, lastBuzz: todayStr, rank: i, seeded: true });
    } catch (e) {
      console.log(`[build-catalogs] buzz seed /find failed for ${meta.id}: ${e.message}`);
    }
  }
  return out;
}

// v1.5.6: buzz carry-over state (buzz-state.json in Blob root).
// Read by direct public URL (SIMPLE request) — deliberately NOT
// readBlobJson: a corrupt state file must return null WITHOUT tripping
// blob.js's directBroken flag (which would poison the bundle read
// that follows). Any failure — missing file, bad JSON, wrong shape —
// returns null and the buzz section seeds from trending instead.
// Never throws.
async function readBuzzState(fetchImpl) {
  const f = fetchImpl || global.fetch;
  try {
    const { publicBaseUrl } = require('../lib/blob');
    const res = await f(`${publicBaseUrl()}/${BUZZ_STATE_PATHNAME}`);
    if (!res.ok) return null;
    const json = await res.json();
    return validateBuzzState(json);
  } catch (e) {
    return null;
  }
}

// Write the updated state (one put per rebuild — the state changes
// daily by design, so there is no hash-skip; ~30 Advanced requests a
// month, on top of the bundle's ~1/day). Never throws: a failed state
// write must never fail the rebuild — tomorrow's run re-derives from
// the last good state (or re-seeds).
async function writeBuzzState(state, token) {
  try {
    const { put } = require('@vercel/blob');
    await put(BUZZ_STATE_PATHNAME, JSON.stringify(state), {
      access: 'public', token, addRandomSuffix: false, allowOverwrite: true,
    });
    return true;
  } catch (e) {
    console.log(`[build-catalogs] buzz state write failed (non-fatal): ${e.message}`);
    return false;
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
  const out = { movies: [], series: [], sources: null, groq: { ok: false, error: 'not run' }, fetchedTitles: [] };
  try {
    const fetched = await fetchBuzzItems();
    out.sources = fetched.sources;
    // v1.5.6: raw fetched titles feed the state refresh (a title that
    // is still being discussed but missed Groq's 15-cap ranked list
    // still counts as fresh buzz — see updateBuzzState).
    out.fetchedTitles = (fetched.items || [])
      .map((it) => it && it.title)
      .filter((t) => typeof t === 'string' && t.trim())
      .slice(0, 100);
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
  const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, trendingTopUp: {} };
  const { readConfig } = require('../lib/config');
  const cfg = await readConfig();
  const idMap = await readIdMap();
  // v2.0: per-run detail caches (series + movie) shared across rows.
  const ctx = {
    seriesCache: new Map(),
    movieCache: new Map(),
    config: cfg,
  };
  // v1.3.4: buzz is fetched + ranked once for the whole rebuild (never
  // throws — see collectBuzz), then each type consumes its own list.
  try {
    ctx.buzz = await collectBuzz();
    stats.buzz = { sources: ctx.buzz.sources, groq: ctx.buzz.groq };
  } catch (e) {
    ctx.buzz = { movies: [], series: [], sources: null, groq: { ok: false, error: String(e.message || e).slice(0, 120) }, fetchedTitles: [] };
    stats.buzz = { sources: null, groq: ctx.buzz.groq };
  }
  // v1.5.6: load the buzz carry-over state (never throws — a missing
  // or corrupt file returns null and the buzz section seeds from
  // trending instead). buzzFresh/buzzSeed are filled by buildRows per
  // type; fetchedTitles feeds the state's fresh-buzz refresh.
  ctx.buzzState = await readBuzzState();
  ctx.buzzFresh = { movies: [], series: [] };
  ctx.buzzSeed = { movies: [], series: [] };
  ctx.buzzFetchedTitles = (ctx.buzz && ctx.buzz.fetchedTitles) || [];
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
  // v1.5.6: persist the updated buzz state (fresh titles + seed +
  // fetched-title refresh, 3-day expiry). Runs after the bundle write
  // so the state only advances for rows that actually published.
  // Never throws and never blocks the rebuild.
  let buzzStateReport = null;
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const updated = updateBuzzState(ctx.buzzState, ctx.buzzFresh, ctx.buzzSeed, ctx.buzzFetchedTitles, todayStr);
    buzzStateReport = updated.report;
    await writeBuzzState(updated.state, token);
  } catch (e) {
    console.log(`[build-catalogs] buzz state update failed (non-fatal): ${e.message}`);
  }
  stats.buzz = stats.buzz || {};
  stats.buzz.state = { loaded: !!ctx.buzzState, ...(buzzStateReport || {}) };
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
  console.log(`[build-catalogs] done. rows=${JSON.stringify(counts)} excludedNoImdb=${stats.excludedNoImdb} excludedTvShow=${JSON.stringify(stats.excludedTvShow)} idMapSize=${Object.keys(idMap).length} bundleSkipped=${bundleResult.skipped} bundleHash=${bundleResult.hash.slice(0, 8)} prunedLegacy=${JSON.stringify(prunedLegacy)}`);
  return { skipped: false, counts, excludedNoImdb: stats.excludedNoImdb, excludedTvShow: stats.excludedTvShow, ottProviders: stats.ottProviders, trendingTopUp: stats.trendingTopUp, newReleases: stats.newReleases, releasingNext30: stats.releasingNext30, buzz: stats.buzz, indianTvReality: stats.indianTvReality, bundleSkipped: bundleResult.skipped, bundleHash: bundleResult.hash, prunedLegacy };
}

if (require.main === module) {
  main().then((r) => process.exit(r && r.skipped ? 0 : 0)).catch((e) => {
    console.error(`[build-catalogs] FAILED: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { main, buildRows, isIndianTitle, collectBuzz, resolveOttProviders, tvShowExcludeReason, applyTvRealityAnchor };
