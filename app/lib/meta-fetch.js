// Binge Addon — meta resolution + fetch (v1.1.9, v1.2.2).
// The meta handler's TMDB calls, factored out so tests can stub them.
// Flow: id-map fast path (tmdbIdForImdb) -> TMDB /find fallback ->
// detail + credits + images -> buildMetaFromTmdb (+ series videos).
//
// v1.2.2: series videos are enriched with REAL episode names +
// still thumbnails from TMDB season details
// (/tv/{id}/season/{n}), fetched in parallel after the detail call.
// A season fetch that fails or times out falls back to the generic
// "Episode N" videos for that season — meta NEVER fails because of
// this. Season results are cached in-memory (6 h TTL); no Blob writes.
//
// Why the /find fallback exists: the id map only holds titles currently
// in our catalogs, but Nuvio can ask for meta for ANY title a user taps
// (e.g. Preacher tt5016504, sitting in a Trending row via another
// addon's catalog, or any title we never built a row for). Without the
// fallback the handler answered {meta: null} and — with no Cinemeta
// installed — Nuvio reported "Could not load details from any addon."
// (basant's report, 19 Nov 2026). /find resolves any IMDb id TMDB knows.
// v1.2.0 adds the Cinemeta fallback (basant: "ye apne addon me add nahi
// ho sakta kya") — if TMDB has no answer either, Cinemeta's free,
// keyless meta endpoint is the last resort before {meta: null}.
'use strict';

const { buildMetaFromTmdb } = require('./meta');

// TMDB /find/{imdb_id}?external_source=imdb_id — resolves an IMDb id to a
// TMDB id. Only the result list matching the requested type is used: a
// series id asked as a movie (or vice versa) resolves to null rather
// than a mismatched meta.
async function findTmdbId(imdbId, type, key, fetchFn) {
  const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${key}&external_source=imdb_id`;
  const res = await fetchFn(url);
  if (!res.ok) return null;
  const d = await res.json();
  const list = type === 'movie' ? d.movie_results : d.tv_results;
  if (!Array.isArray(list) || !list.length) return null;
  const hit = list[0];
  return typeof hit.id === 'number' ? hit.id : null;
}

// TMDB detail (+ credits + images) -> Stremio meta. Series get `videos`
// synthesized from d.seasons (tt:S:E ids), same as the v2.1.0 handler,
// then enriched (v1.2.2) with real episode names + still thumbnails +
// overview + air date from TMDB season details (see below).
async function fetchMetaForTmdbId(imdbId, type, tmdbId, key, fetchFn) {
  const base = type === 'movie' ? 'movie' : 'tv';
  const url = `https://api.themoviedb.org/3/${base}/${tmdbId}?api_key=${key}&append_to_response=credits,images`;
  const res = await fetchFn(url);
  if (!res.ok) return null;
  const d = await res.json();
  const meta = buildMetaFromTmdb(imdbId, type, d);
  if (type === 'series' && Array.isArray(d.seasons)) {
    const videos = [];
    for (const s of d.seasons) {
      if (!s.episode_count || s.episode_count < 1) continue;
      for (let e = 1; e <= s.episode_count; e++) {
        videos.push({
          id: `${imdbId}:${s.season_number}:${e}`,
          title: `Episode ${e}`,
          season: s.season_number,
          episode: e,
        });
      }
    }
    if (videos.length) {
      // v1.2.2: enrich in parallel; any season that fails keeps its
      // generic videos (enrichSeriesVideos never throws).
      await enrichSeriesVideos(videos, tmdbId, key, fetchFn);
      meta.videos = videos;
    }
  }
  return meta;
}

// --- v1.2.2: episode enrichment ------------------------------------------
// TMDB season detail: /tv/{tmdbId}/season/{n} -> { episodes: [
//   { episode_number, name, still_path, overview, air_date } ] }.
// One request per season, all in parallel, 2.5 s per-request timeout
// (bounded total budget: the slowest season, not the sum). Results are
// cached in-memory for 6 h — episode data is effectively static.
// Fields added are all in the Stremio Video object type
// (stremio-addon-sdk 1.6.10, docs/api/responses/meta.md):
//   title (required), thumbnail (optional), overview (optional),
//   released (ISO 8601 air date). Nothing invented: no name ->
//   generic title kept; no still_path -> thumbnail omitted (never a
//   placeholder); no overview/air_date -> field omitted. Video ids are
//   never touched (streams depend on tt:S:E).
const SEASON_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const seasonCache = new Map(); // `${tmdbId}:${season}` -> { at, episodes: Map<number, ep> }
function clearSeasonCache() { seasonCache.clear(); }

async function fetchSeasonEpisodes(tmdbId, seasonNumber, key, fetchFn) {
  const cacheKey = `${tmdbId}:${seasonNumber}`;
  const cached = seasonCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEASON_CACHE_TTL_MS) return cached.episodes;
  try {
    const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNumber}?api_key=${key}`;
    const opts = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? { signal: AbortSignal.timeout(2500) }
      : undefined;
    const res = await fetchFn(url, opts);
    if (!res.ok) return null;
    const d = await res.json();
    const map = new Map();
    for (const ep of d.episodes || []) {
      if (ep && typeof ep.episode_number === 'number') map.set(ep.episode_number, ep);
    }
    seasonCache.set(cacheKey, { at: Date.now(), episodes: map });
    return map;
  } catch (e) {
    return null;
  }
}

async function enrichSeriesVideos(videos, tmdbId, key, fetchFn) {
  try {
    const seasons = [...new Set(videos.map((v) => v.season))];
    const results = await Promise.allSettled(
      seasons.map((s) => fetchSeasonEpisodes(tmdbId, s, key, fetchFn))
    );
    const bySeason = new Map();
    seasons.forEach((s, i) => {
      if (results[i].status === 'fulfilled' && results[i].value) bySeason.set(s, results[i].value);
    });
    for (const v of videos) {
      const ep = bySeason.get(v.season) && bySeason.get(v.season).get(v.episode);
      if (!ep) continue;
      if (typeof ep.name === 'string' && ep.name.trim()) v.title = ep.name;
      if (typeof ep.still_path === 'string' && ep.still_path) {
        v.thumbnail = `https://image.tmdb.org/t/p/w300${ep.still_path}`;
      }
      if (typeof ep.overview === 'string' && ep.overview.trim()) v.overview = ep.overview;
      if (typeof ep.air_date === 'string' && ep.air_date) v.released = `${ep.air_date}T00:00:00.000Z`;
    }
  } catch (e) {
    // Enrichment must never break meta: generic videos stand.
  }
}

// Full resolution for one tt id. Fallback order:
//   (1) id-map fast path -> (2) TMDB /find -> (3) Cinemeta.
// Returns { meta, tmdbId, via } where via is 'map' | 'find' |
// 'cinemeta' | null (null = unresolved). Never throws: any failure
// resolves to { meta: null, ... } so the handler can answer
// {meta: null} and Nuvio falls back to another meta addon.
async function resolveMeta(imdbId, type, { key, fetchFn, tmdbIdForImdb }) {
  try {
    let tmdbId = null;
    let via = null;
    if (typeof tmdbIdForImdb === 'function') {
      tmdbId = await tmdbIdForImdb(imdbId);
      if (tmdbId) via = 'map';
    }
    if (!tmdbId) {
      tmdbId = await findTmdbId(imdbId, type, key, fetchFn);
      if (tmdbId) via = 'find';
    }
    if (!tmdbId) {
      const cinemeta = await fetchMetaFromCinemeta(imdbId, type, fetchFn);
      if (cinemeta) return { meta: cinemeta, tmdbId: null, via: 'cinemeta' };
      return { meta: null, tmdbId: null, via: null };
    }
    const meta = await fetchMetaForTmdbId(imdbId, type, tmdbId, key, fetchFn);
    if (meta) return { meta, tmdbId, via };
    // /find resolved but the detail fetch failed (rare — same TMDB db):
    // Cinemeta is still the last resort before null.
    const cinemeta = await fetchMetaFromCinemeta(imdbId, type, fetchFn);
    if (cinemeta) return { meta: cinemeta, tmdbId: null, via: 'cinemeta' };
    return { meta: null, tmdbId, via };
  } catch (e) {
    return { meta: null, tmdbId: null, via: null, error: e.message };
  }
}

// Cinemeta fallback (v1.2.0): free, no key, no auth.
// https://v3-cinemeta.strem.io/meta/{type}/{imdb_id}.json
// Maps Cinemeta's meta into OUR shape — same field set the TMDB path
// produces, so Nuvio sees no difference. Only whitelisted fields are
// copied (Cinemeta also sends credits_cast/credits_crew/trailers/etc. —
// those stay out, same as the TMDB path). Nothing is invented: a
// missing field is omitted, and no meta at all -> null.
//   year: first year of `released` (ISO), else first 4 chars of
//     Cinemeta's `year`/`releaseInfo` (a series range like '2016–2019'
//     becomes '2016').
//   releaseInfo: Cinemeta's own string kept as-is ('2016–2019').
//   director: Cinemeta sends an ARRAY (movie) or null (series) —
//     first element, else omitted.
//   videos (series): Cinemeta's episode list mapped to Stremio video
//     shape (id/title/season/episode/released/thumbnail/overview);
//     season-0 specials ride along, exactly as Cinemeta lists them.
async function fetchMetaFromCinemeta(imdbId, type, fetchFn) {
  const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
  const res = await fetchFn(url);
  if (!res.ok) return null;
  const data = await res.json();
  const c = data && data.meta;
  if (!c || typeof c !== 'object' || !c.name) return null;
  const year =
    (typeof c.released === 'string' && c.released.slice(0, 4)) ||
    (typeof c.year === 'string' && c.year.slice(0, 4)) ||
    (typeof c.releaseInfo === 'string' && c.releaseInfo.slice(0, 4)) ||
    undefined;
  const director = Array.isArray(c.director)
    ? c.director[0]
    : typeof c.director === 'string'
      ? c.director
      : undefined;
  const meta = {
    id: imdbId,
    type,
    name: c.name,
    poster: typeof c.poster === 'string' ? c.poster : undefined,
    background: typeof c.background === 'string' ? c.background : undefined,
    logo: typeof c.logo === 'string' ? c.logo : undefined,
    description: typeof c.description === 'string' ? c.description : undefined,
    releaseInfo: typeof c.releaseInfo === 'string' ? c.releaseInfo : year,
    year,
    genres: Array.isArray(c.genres) ? c.genres : Array.isArray(c.genre) ? c.genre : [],
    cast: Array.isArray(c.cast) ? c.cast.slice(0, 10).filter((n) => typeof n === 'string') : [],
    director,
  };
  if (typeof c.runtime === 'string' && c.runtime) meta.runtime = c.runtime;
  else if (typeof c.runtime === 'number' && c.runtime > 0) meta.runtime = `${c.runtime} min`;
  if (typeof c.imdbRating === 'string' && c.imdbRating) meta.imdbRating = c.imdbRating;
  if (type === 'series' && Array.isArray(c.videos)) {
    const videos = [];
    for (const v of c.videos) {
      if (!v || typeof v.id !== 'string') continue;
      videos.push({
        id: v.id,
        title: typeof v.name === 'string' ? v.name : `Episode ${v.episode ?? ''}`.trim(),
        season: typeof v.season === 'number' ? v.season : undefined,
        episode: typeof v.episode === 'number' ? v.episode : undefined,
        released: typeof v.released === 'string' ? v.released : typeof v.firstAired === 'string' ? v.firstAired : undefined,
        thumbnail: typeof v.thumbnail === 'string' ? v.thumbnail : undefined,
        overview: typeof v.overview === 'string' ? v.overview : undefined,
      });
    }
    if (videos.length) meta.videos = videos;
  }
  return meta;
}

module.exports = { findTmdbId, fetchMetaForTmdbId, fetchMetaFromCinemeta, resolveMeta, fetchSeasonEpisodes, enrichSeriesVideos, clearSeasonCache };
