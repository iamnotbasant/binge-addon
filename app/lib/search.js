// Binge Addon — live catalog search (v1.1.7).
// Basant's report (19 Nov 2026, Nuvio Search screenshot): typing
// "reacher" showed "No searchable catalogs — Your enabled addons do
// not support catalog search." Cause, verified live: the manifest had
// 27 catalogs with NO `extra`, and `?search=reacher` returned the same
// unfiltered 20-row feed. Worse, Reacher is in NONE of our fixed rows,
// so filtering the rows would still return 0 — search MUST query TMDB
// live (search/movie + search/tv), then map results to IMDb ids via
// external_ids so the returned ids work with our meta/stream handlers.
// A result with no IMDb id is skipped — an id is never invented.
// Pure mapping is exported for offline tests; the TMDB key is read
// only from process.env.TMDB_API_KEY, never stored or printed.
'use strict';

const TMDB_IMG = 'https://image.tmdb.org/t/p';
const SEARCH_CAP = 20;

// TMDB search item -> Stremio meta preview. imdbId must already be
// resolved (external_ids); callers skip items without one.
function mapSearchResult(type, item, imdbId) {
  const year = ((item.release_date || item.first_air_date || '')).slice(0, 4);
  return {
    id: imdbId,
    type,
    name: item.title || item.name,
    poster: item.poster_path ? `${TMDB_IMG}/w342${item.poster_path}` : undefined,
    background: item.backdrop_path ? `${TMDB_IMG}/w780${item.backdrop_path}` : undefined,
    releaseInfo: year || undefined,
    year: year || undefined,
    description: item.overview || undefined,
  };
}

// Live TMDB search for one type. Returns { metas } — empty on any
// failure (no key, bad query, TMDB error), never the full catalog.
// fetchFn is injectable so tests can stub TMDB offline.
async function searchCatalogs(type, query, fetchFn = fetch) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) return { metas: [] };
  if (type !== 'movie' && type !== 'series') return { metas: [] };
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.log('[binge-addon] search: no TMDB_API_KEY, returning empty');
    return { metas: [] };
  }
  try {
    const base = type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/search/${base}?api_key=${key}`
      + `&query=${encodeURIComponent(q)}&include_adult=false&language=en-US&page=1`;
    const res = await fetchFn(url);
    if (!res.ok) {
      console.log(`[binge-addon] search ${type}/${q}: TMDB HTTP ${res.status}`);
      return { metas: [] };
    }
    const data = await res.json();
    const results = (Array.isArray(data.results) ? data.results : []).slice(0, SEARCH_CAP);
    // Resolve each TMDB id to its IMDb id (external_ids). One failure
    // skips that item only — the rest still return.
    const metas = (await Promise.all(results.map(async (item) => {
      try {
        const idRes = await fetchFn(
          `https://api.themoviedb.org/3/${base}/${item.id}/external_ids?api_key=${key}`);
        if (!idRes.ok) return null;
        const ids = await idRes.json();
        if (!ids || typeof ids.imdb_id !== 'string' || !ids.imdb_id) return null;
        if (!(item.title || item.name)) return null;
        return mapSearchResult(type, item, ids.imdb_id);
      } catch (e) {
        return null;
      }
    }))).filter(Boolean);
    return { metas };
  } catch (e) {
    console.log(`[binge-addon] search ${type}/${q} failed: ${e.message}`);
    return { metas: [] };
  }
}

module.exports = { searchCatalogs, mapSearchResult, SEARCH_CAP };
