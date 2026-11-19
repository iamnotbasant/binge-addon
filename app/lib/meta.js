// Binge Addon — meta builder (v1.1.6): TMDB detail payload -> Stremio meta.
// Pure function (no key, no network) so tests can run it offline.
//
// v1.1.6 fixes (basant's Ramayana detail-page report, 19 Nov 2026):
//  - `logo`: TMDB images.logos — English logo preferred, w500. The
//    official Stremio meta doc (stremio-addon-sdk 1.6.10,
//    docs/api/responses/meta.md) defines `logo` as an optional PNG URL
//    shown on the detail page. No logo on TMDB -> field omitted, never
//    invented.
//  - `year`: from release_date / first_air_date (e.g. '2026'); the field
//    Cinemeta sends alongside releaseInfo. releaseInfo stays as-is.
//  - cast: STAYS bare name strings. The same official doc defines
//    `cast` as an array of names (string) — there is NO picture/avatar
//    field in the Stremio meta protocol, and Cinemeta itself also sends
//    bare strings (verified live 19 Nov 2026, tt27988879 + tt33318732,
//    no `credits_cast` anywhere). So cast photos cannot come from any
//    addon; only Nuvio's own TMDB Enrichment setting can show them.
//    TMDB profile_path is therefore deliberately NOT used here.
// Everything else (name, poster, background, runtime, director, genres,
// description) is byte-identical to the v2.1.0 handler.
'use strict';

const TMDB_IMG = 'https://image.tmdb.org/t/p';

// English logo first, else the first logo TMDB has. No logos -> undefined.
function pickLogo(images) {
  const logos = ((images && images.logos) || []).filter((l) => l && l.file_path);
  if (!logos.length) return undefined;
  const pick = logos.find((l) => l.iso_639_1 === 'en') || logos[0];
  return `${TMDB_IMG}/w500${pick.file_path}`;
}

function buildMetaFromTmdb(imdbId, type, d) {
  const credits = d.credits || {};
  const director = (credits.crew || []).find((c) => c.job === 'Director');
  const year = (d.release_date || d.first_air_date || '').slice(0, 4);
  const meta = {
    id: imdbId,
    type,
    name: d.title || d.name,
    poster: d.poster_path ? `${TMDB_IMG}/w342${d.poster_path}` : undefined,
    background: d.backdrop_path ? `${TMDB_IMG}/w780${d.backdrop_path}` : undefined,
    logo: pickLogo(d.images),
    description: d.overview || undefined,
    releaseInfo: year,
    year: year || undefined,
    genres: (d.genres || []).map((g) => g.name),
    cast: (credits.cast || []).slice(0, 10).map((c) => c.name),
    director: director ? director.name : undefined,
  };
  if (typeof d.runtime === 'number' && d.runtime > 0) meta.runtime = `${d.runtime} min`;
  else if (Array.isArray(d.episode_run_time) && d.episode_run_time[0]) meta.runtime = `${d.episode_run_time[0]} min`;
  return meta;
}

module.exports = { buildMetaFromTmdb, pickLogo };
