// Binge Addon — v1.4.3 row tests (basant, 19 Nov 2026: confirmed
// fixes with exact specs — underrated bands, action floor + Indian
// reserve, anime genres + episode-cap scoping, OTT provider filter,
// thriller keywords, Reddit OAuth, dynamic year, reorder, newly-
// announced removal).
//
// Covers, with a stubbed TMDB fetch (no key, no network):
// (0) manifest + config — 29 catalogs, upcoming rows last (indices
//     23-28, relative order kept), 4 renamed rows, Big Announcements
//     name is the dynamic currentYear–nextYear, newly-announced gone
//     from manifest/config/knobs; underrated + action knob defaults;
// (1) underrated movie — discover sends va>=7.5, vc 50-800,
//     with_runtime.gte=80; series — va>=7.6, vc 25-300, no runtime;
// (2) action — global floor vc>=3000 / va>=7.2, Indian reserve 4
//     slots at vc>=150, Indian titles never double-counted;
// (3) anime — discover sends with_genres=16,10759 +
//     without_genres=10751,10762,10749; 148-ep and 1200-ep JP anime
//     kept (cap scoped out), Talk Show type still dropped;
// (4) episode-cap scoping (tvShowExcludeReason, direct) — JP 148 and
//     US 200 pass, IN 150 and Soap-genre 150 drop, type + network
//     layers untouched; Indian 150-ep series dropped in a real row;
// (5) OTT Ready — discover sends watch_region=IN + flatrate +
//     with_watch_providers (validated subset); a provider id TMDB no
//     longer returns is dropped, never 422s; validation failure falls
//     back to no provider filter and the row still builds;
// (6) thriller keywords — resolved at build time via /search/keyword,
//     exact match only ('mind game' drops when only 'mind games'
//     exists), with_keywords sent pipe-separated;
// (7) Reddit OAuth — creds set: token POST + oauth GET used, public
//     .json never called; no creds: public path; token 401: falls
//     back to public .json; the build never crashes over Reddit.
// Run: node tests/test-v143.js (exit 0 = all pass)
'use strict';

const { buildRows, resolveKeywords, resolveOttProviders, tvShowExcludeReason } = require('../app/scripts/build-catalogs');
const { catalogs, MANIFEST } = require('../app/lib/manifest');
const { defaultConfig, effectiveCatalogs } = require('../app/lib/config');
const buzz = require('../app/lib/buzz');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const DAY = 24 * 60 * 60 * 1000;
const daysAgoStr = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const daysAheadStr = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const names = (row) => (row || []).map((m) => m.name);

// ---------------------------------------------------------------------------
// 0. Manifest + config
// ---------------------------------------------------------------------------
console.log('=== 0. Manifest + config ===');
{
  const list = catalogs();
  eq(MANIFEST.version, '1.4.3', 'manifest version 1.4.3');
  eq(list.length, 29, '29 catalogs (30 - 1 removed row)');
  check(!list.some((c) => c.id === 'newly-announced-series-series'), 'newly-announced-series-series gone from manifest');
  check(!list.some((c) => c.id === 'south-blockbusters-movie'), 'south-blockbusters-movie still gone');
  const y = new Date().getFullYear();
  eq(list.find((c) => c.id === 'big-announcements-movie').name, `Big Announcements ${y}–${y + 1}`, 'big-announcements movie name is dynamic currentYear–nextYear');
  eq(list.find((c) => c.id === 'big-announcements-series').name, `Big Announcements ${y}–${y + 1}`, 'big-announcements series name is dynamic currentYear–nextYear');
  eq(list.find((c) => c.id === 'scifi-time-travel-movie').name, 'Mind-Bending Sci-Fi', 'scifi renamed');
  eq(list.find((c) => c.id === 'psychological-thrillers-movie').name, 'Psychological Thrillers', 'thrillers renamed');
  eq(list.find((c) => c.id === 'action-heist-revenge-movie').name, 'Action, Heist & Revenge', 'action renamed');
  eq(list.find((c) => c.id === 'one-season-miniseries-series').name, '1-Season Binge', 'miniseries renamed');
  check(list.every((c) => c.extra && c.extra[0].name === 'search'), 'all rows still carry the search extra');
  const last6 = list.slice(-6).map((c) => c.id);
  eq(JSON.stringify(last6), JSON.stringify(['releasing-next-30-days-movie', 'releasing-next-30-days-series', 'big-announcements-movie', 'big-announcements-series', 'returning-soon-series', 'now-in-theatres-movie']), 'upcoming rows last, relative order kept');
  eq(list[22].id, 'all-time-classics-movie', 'last watchable row is All-Time Classics');
  const cfg = defaultConfig();
  eq(Object.keys(cfg.catalogs).length, 29, 'config carries 29 catalogs');
  check(!('newly-announced-series' in cfg.knobs), 'newly-announced knob gone from defaults');
  eq(JSON.stringify(cfg.knobs['underrated-gems']), '{"voteFloorMovie":7.5,"voteFloorSeries":7.6,"voteCountFloorMovie":50,"voteCountFloorSeries":25,"voteCountCeilMovie":800,"voteCountCeilSeries":300}', 'underrated knob defaults (per-type bands)');
  eq(JSON.stringify(cfg.knobs['action-heist-revenge']), '{"voteFloor":7.2,"voteCountFloor":3000,"voteCountFloorIndian":150}', 'action knob defaults (7.2 / 3000 / Indian 150)');
  const eff = effectiveCatalogs(cfg);
  eq(eff.length, 29, 'effectiveCatalogs still 29');
  eq(eff.find((c) => c.id === 'big-announcements-movie').name, `Big Announcements ${y}–${y + 1}`, 'effectiveCatalogs big name is dynamic even with a stored stale name');
}

// ---------------------------------------------------------------------------
// Stub TMDB — datasets are swapped per section via MODE.
// ---------------------------------------------------------------------------
let MODE = 'base';
let REQUESTS = [];
let PROVIDER_LIST = [8, 119, 122, 2336, 232]; // 237 missing on purpose (scenario A)
let PROVIDER_LIST_FAIL = false;
let KEYWORD_MAP = {};

function mkMovie(id, name, daysAgo, va, vc, lang, countries, imdb) {
  return { id, title: name, release_date: daysAgoStr(daysAgo), vote_average: va, vote_count: vc, original_language: lang, origin_country: countries, popularity: 1000 - id, imdb };
}
function mkSeries(id, name, daysAgo, va, vc, lang, countries, imdb) {
  return { id, name, first_air_date: daysAgoStr(daysAgo), vote_average: va, vote_count: vc, original_language: lang, origin_country: countries, popularity: 1000 - id, imdb };
}

// Movie details: imdb id + release_dates (type 4 = digital) for the
// OTT row's detail check.
const MOVIE_DETAILS = {
  701: { imdb: 'tt7000701', digital: [daysAgoStr(5)] },
  702: { imdb: 'tt7000702', digital: [daysAgoStr(20)] },
  703: { imdb: 'tt7000703', digital: [daysAgoStr(40)] },
  704: { imdb: 'tt7000704', digital: [daysAgoStr(200)] }, // digital date OUTSIDE the 90d window -> dropped
  705: { imdb: null, digital: [daysAgoStr(3)] }, // no imdb -> dropped
};
// Series details: imdb id + TV-filter fields for the cap tests.
const SERIES_DETAILS = {
  // Anime set (JP): 148 eps + 1200 eps must PASS the scoped cap.
  801: { imdb: 'tt8000801', type: 'Scripted', eps: 148, countries: ['JP'], genres: [{ id: 16 }, { id: 10759 }], networks: [] },
  802: { imdb: 'tt8000802', type: 'Scripted', eps: 1200, countries: ['JP'], genres: [{ id: 16 }, { id: 10759 }], networks: [] },
  803: { imdb: 'tt8000803', type: 'Talk Show', eps: 28, countries: ['JP'], genres: [{ id: 16 }], networks: [] }, // type still drops it
  804: { imdb: 'tt8000804', type: 'Scripted', eps: 45, countries: ['JP'], genres: [{ id: 16 }, { id: 10759 }], networks: [] },
  // Underrated-series set (IN): 150 eps must DROP (cap still fires for IN).
  811: { imdb: 'tt8000811', type: 'Scripted', eps: 12, countries: ['IN'], genres: [], networks: [] },
  812: { imdb: 'tt8000812', type: 'Scripted', eps: 150, countries: ['IN'], genres: [], networks: [] },
  813: { imdb: 'tt8000813', type: 'Scripted', eps: 200, countries: ['US'], genres: [], networks: [] }, // US 200 eps PASSES the scoped cap
  814: { imdb: 'tt8000814', type: 'Scripted', eps: 9, countries: ['IN'], genres: [], networks: [] },
};

function discoverMovie(p) {
  const page = p.get('page') || '1';
  const g = p.get('with_genres') || '';
  const origin = p.get('with_origin_country') || '';
  const va = p.get('vote_average.gte') || '';
  const vcGte = p.get('vote_count.gte') || '';
  const vcLte = p.get('vote_count.lte') || '';
  // Underrated movie: IN + va 7.5 + vc 50-800 + runtime 80 (page 1 only).
  if (page === '1' && origin === 'IN' && va === '7.5' && vcGte === '50' && vcLte === '800') {
    return [mkMovie(601, 'UND-M-1', 400, 8.1, 120, 'hi', ['IN'], 'tt6000601'),
      mkMovie(602, 'UND-M-2', 500, 7.9, 700, 'ta', ['IN'], 'tt6000602'),
      mkMovie(603, 'UND-M-3', 300, 7.6, 55, 'ml', ['IN'], 'tt6000603')];
  }
  // Action Indian pass: Action|Crime + IN + vc>=150.
  if (page === '1' && g === '28|80' && origin === 'IN' && vcGte === '150') {
    return [mkMovie(611, 'ACT-IND-1', 100, 7.8, 200, 'hi', ['IN'], 'tt6000611'),
      mkMovie(612, 'ACT-IND-2', 200, 7.5, 180, 'ta', ['IN'], 'tt6000612'),
      mkMovie(613, 'ACT-IND-3', 300, 7.4, 160, 'te', ['IN'], 'tt6000613'),
      mkMovie(614, 'ACT-IND-4', 400, 7.3, 155, 'hi', ['IN'], 'tt6000614'),
      mkMovie(615, 'ACT-IND-5', 500, 7.2, 152, 'hi', ['IN'], 'tt6000615')];
  }
  // Action global pass: Action|Crime + vc>=3000, no origin. Page 1
  // carries the two traps (Indian-origin + no-imdb) so the skip logic
  // is genuinely exercised; page 2 fills the rest.
  if (g === '28|80' && !origin && vcGte === '3000') {
    if (page === '1') {
      const out = [];
      for (let i = 0; i < 8; i++) {
        out.push(mkMovie(620 + i, `ACT-GLO-${i + 1}`, 100 + i * 10, 7.2 + (i % 5) * 0.2, 5000 + i * 1000, 'en', ['US'], `tt6000${620 + i}`));
      }
      out.push(mkMovie(638, 'ACT-GLO-IND', 50, 8.0, 9000, 'hi', ['IN'], 'tt6000638')); // Indian-origin: skipped in the global pass
      out.push(mkMovie(639, 'ACT-GLO-NOIMDB', 60, 8.0, 9000, 'en', ['US'], null)); // no imdb: skipped
      return out;
    }
    if (page === '2') {
      const out = [];
      for (let i = 8; i < 16; i++) {
        out.push(mkMovie(620 + i, `ACT-GLO-${i + 1}`, 100 + i * 10, 7.2 + (i % 5) * 0.2, 5000 + i * 1000, 'en', ['US'], `tt6000${620 + i}`));
      }
      return out;
    }
    return [];
  }
  // OTT Ready: IN + watch_region + flatrate + providers (page 1 only).
  // Fallback branch (no provider params): same canned set — the row
  // still builds from the date window + digital detail check when
  // provider validation fails. (sort desc pins it to the OTT row:
  // the releasing-next-30 Indian pass sorts date asc.)
  if (page === '1' && origin === 'IN' && p.get('sort_by') === 'primary_release_date.desc' && p.get('primary_release_date.gte') && !p.get('vote_average.gte')) {
    return [mkMovie(701, 'OTT-1', 5, 7.0, 100, 'hi', ['IN'], 'tt7000701'),
      mkMovie(702, 'OTT-2', 20, 7.2, 150, 'hi', ['IN'], 'tt7000702'),
      mkMovie(703, 'OTT-3', 40, 6.8, 90, 'te', ['IN'], 'tt7000703'),
      mkMovie(704, 'OTT-OLD-DIGITAL', 10, 7.5, 200, 'hi', ['IN'], 'tt7000704'),
      mkMovie(705, 'OTT-NOIMDB', 3, 7.5, 200, 'hi', ['IN'], null)];
  }
  return [];
}

function discoverTv(p) {
  const page = p.get('page') || '1';
  if (page !== '1') return []; // canned sets live on page 1 only
  const g = p.get('with_genres') || '';
  const origin = p.get('with_origin_country') || '';
  const va = p.get('vote_average.gte') || '';
  const vcGte = p.get('vote_count.gte') || '';
  const vcLte = p.get('vote_count.lte') || '';
  // Anime: Animation+Action&Adventure, JP.
  if (g === '16,10759' && origin === 'JP') {
    return [mkSeries(801, 'ANIME-148eps', 100, 8.5, 5000, 'ja', ['JP'], 'tt8000801'),
      mkSeries(802, 'ANIME-1200eps', 200, 8.4, 4000, 'ja', ['JP'], 'tt8000802'),
      mkSeries(803, 'ANIME-TALKSHOW', 50, 8.3, 3000, 'ja', ['JP'], 'tt8000803'),
      mkSeries(804, 'ANIME-45eps', 90, 8.2, 2500, 'ja', ['JP'], 'tt8000804')];
  }
  // Underrated series: IN + va 7.6 + vc 25-300.
  if (origin === 'IN' && va === '7.6' && vcGte === '25' && vcLte === '300') {
    return [mkSeries(811, 'UND-S-1', 400, 8.0, 100, 'hi', ['IN'], 'tt8000811'),
      mkSeries(812, 'UND-S-150eps', 500, 7.9, 200, 'hi', ['IN'], 'tt8000812'),
      mkSeries(813, 'UND-S-US200eps', 300, 7.8, 150, 'en', ['US'], 'tt8000813'),
      mkSeries(814, 'UND-S-2', 350, 7.7, 60, 'ta', ['IN'], 'tt8000814')];
  }
  return [];
}

async function stubFetch(url, opts) {
  const u = new URL(String(url));
  REQUESTS.push({ path: u.pathname, params: Object.fromEntries(u.searchParams.entries()), method: (opts && opts.method) || 'GET' });
  const ok = (json) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(json), json: async () => json });
  const fail = (status) => ({ ok: false, status, headers: { get: () => null }, text: async () => '', json: async () => ({}) });
  if (u.pathname === '/3/watch/providers/movie') {
    if (PROVIDER_LIST_FAIL) return fail(500);
    return ok({ results: PROVIDER_LIST.map((id) => ({ provider_id: id, provider_name: `P${id}` })) });
  }
  if (u.pathname === '/3/search/keyword') {
    const q = (u.searchParams.get('query') || '').toLowerCase();
    const hit = KEYWORD_MAP[q];
    return ok({ results: hit ? [{ id: hit, name: q }] : [{ id: 9999, name: `${q}s` }] });
  }
  if (u.pathname === '/3/discover/movie') return ok({ results: discoverMovie(u.searchParams), total_pages: 1 });
  if (u.pathname === '/3/discover/tv') return ok({ results: discoverTv(u.searchParams), total_pages: 1 });
  if (u.pathname.startsWith('/3/trending/')) return ok({ results: [], total_pages: 0 });
  if (u.pathname.startsWith('/3/search/')) return ok({ results: [], total_pages: 0 });
  if (u.pathname === '/3/movie/now_playing' || u.pathname === '/3/movie/top_rated') return ok({ results: [], total_pages: 0 });
  const mMovie = u.pathname.match(/^\/3\/movie\/(\d+)$/);
  if (mMovie) {
    const d = MOVIE_DETAILS[Number(mMovie[1])];
    if (!d) return ok({ id: Number(mMovie[1]), external_ids: { imdb_id: `tt9000${mMovie[1]}` }, release_dates: { results: [] }, status: 'Released', origin_country: ['US'] });
    return ok({ id: Number(mMovie[1]), external_ids: { imdb_id: d.imdb }, release_dates: { results: [{ iso_3166_1: 'IN', release_dates: d.digital.map((dt) => ({ type: 4, release_date: `${dt}T00:00:00.000Z` })) }] }, status: 'Released', origin_country: ['IN'] });
  }
  const mExt = u.pathname.match(/^\/3\/(movie|tv)\/(\d+)\/external_ids$/);
  if (mExt) {
    const id = Number(mExt[2]);
    if (id === 639) return ok({ imdb_id: null }); // ACT-GLO-NOIMDB has no imdb id
    const d = mExt[1] === 'movie' ? MOVIE_DETAILS[id] : SERIES_DETAILS[id];
    return ok({ imdb_id: d ? d.imdb : `tt9000${id}` });
  }
  const mTv = u.pathname.match(/^\/3\/tv\/(\d+)$/);
  if (mTv) {
    const d = SERIES_DETAILS[Number(mTv[1])];
    if (!d) return ok({ id: Number(mTv[1]), name: `S${mTv[1]}`, type: 'Scripted', number_of_episodes: 10, origin_country: ['US'], genres: [], networks: [], status: 'Ended', seasons: [], external_ids: { imdb_id: `tt9000${mTv[1]}` } });
    return ok({ id: Number(mTv[1]), name: `S${mTv[1]}`, type: d.type, number_of_episodes: d.eps, origin_country: d.countries, genres: d.genres, networks: d.networks, status: 'Ended', seasons: [], external_ids: { imdb_id: d.imdb } });
  }
  return ok({ results: [] });
}

function ctx() {
  return { seriesCache: new Map(), movieCache: new Map(), keywordIds: [], thrillerKeywordIds: [], config: defaultConfig(), buzz: { movies: [], series: [] } };
}

async function runBuildRows(type, c) {
  const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, keywords: null };
  const rows = await buildRows(type, 'test-key', {}, stats, c || ctx());
  return { rows, stats };
}

(async () => {
  const origFetch = global.fetch;
  global.fetch = stubFetch;

  // ---------------------------------------------------------------------------
  // 1+2. Underrated + Action (movie build)
  // ---------------------------------------------------------------------------
  console.log('=== 1+2. Underrated + Action (movie) ===');
  {
    REQUESTS = [];
    const { rows, stats } = await runBuildRows('movie');
    const under = rows['underrated-gems'];
    eq(JSON.stringify(names(under)), JSON.stringify(['UND-M-1', 'UND-M-2', 'UND-M-3']), 'underrated movie row fills from the 50-800 band');
    const underReq = REQUESTS.find((r) => r.path === '/3/discover/movie' && r.params['vote_count.gte'] === '50');
    check(!!underReq, 'underrated movie discover sent vc 50-800');
    eq(underReq && underReq.params['vote_average.gte'], '7.5', 'underrated movie discover sent va>=7.5');
    eq(underReq && underReq.params['vote_count.lte'], '800', 'underrated movie discover sent vc<=800');
    eq(underReq && underReq.params['with_runtime.gte'], '80', 'underrated movie discover sent with_runtime.gte=80 (shorts out)');
    const act = rows['action-heist-revenge'];
    eq(act.length, 20, 'action row fills to 20 (4 Indian + 16 global)');
    eq(JSON.stringify(names(act).slice(0, 4)), JSON.stringify(['ACT-IND-1', 'ACT-IND-2', 'ACT-IND-3', 'ACT-IND-4']), 'action row starts with the 4-slot Indian reserve');
    check(!names(act).includes('ACT-IND-5'), 'Indian reserve is capped at 4 (5th Indian title not taken)');
    check(!names(act).includes('ACT-GLO-IND'), 'Indian-origin title never double-counts in the global pass');
    check(!names(act).includes('ACT-GLO-NOIMDB'), 'no-imdb global title excluded');
    const indReq = REQUESTS.find((r) => r.path === '/3/discover/movie' && r.params.with_origin_country === 'IN' && r.params['vote_count.gte'] === '150');
    check(!!indReq, 'action Indian pass sent vc>=150');
    eq(indReq && indReq.params['vote_average.gte'], '7.2', 'action Indian pass sent va>=7.2');
    const gloReq = REQUESTS.find((r) => r.path === '/3/discover/movie' && r.params['vote_count.gte'] === '3000' && !r.params.with_origin_country);
    check(!!gloReq, 'action global pass sent vc>=3000 (25000 floor gone)');
    eq(gloReq && gloReq.params['vote_average.gte'], '7.2', 'action global pass sent va>=7.2');
    eq(JSON.stringify(stats.actionHeist), JSON.stringify({ total: 20, indian: 4, worldwide: 16 }), 'stats.actionHeist counts the split');
  }

  // ---------------------------------------------------------------------------
  // 3+4. Anime + episode-cap scoping (series build)
  // ---------------------------------------------------------------------------
  console.log('=== 3+4. Anime + cap scoping (series) ===');
  {
    REQUESTS = [];
    const { rows } = await runBuildRows('series');
    const anime = rows['action-anime'];
    eq(JSON.stringify(names(anime)), JSON.stringify(['ANIME-148eps', 'ANIME-1200eps', 'ANIME-45eps']), 'anime row keeps 148-ep + 1200-ep JP anime, drops the Talk Show');
    const animeReq = REQUESTS.find((r) => r.path === '/3/discover/tv' && r.params.with_origin_country === 'JP');
    check(!!animeReq, 'anime discover sent');
    eq(animeReq && animeReq.params.with_genres, '16,10759', 'anime discover sent with_genres=16,10759 (Animation AND Action&Adventure)');
    eq(animeReq && animeReq.params.without_genres, '10751,10762,10749', 'anime discover sent without_genres=Kids,Family,Romance');
    const under = rows['underrated-gems'];
    eq(JSON.stringify(names(under)), JSON.stringify(['UND-S-1', 'UND-S-US200eps', 'UND-S-2']), 'underrated series: IN 150-ep dropped by the cap, US 200-ep kept');
    const underReq = REQUESTS.find((r) => r.path === '/3/discover/tv' && r.params['vote_count.gte'] === '25' && r.params['vote_average.gte'] === '7.6');
    check(!!underReq, 'underrated series discover sent vc 25-300');
    eq(underReq && underReq.params['vote_average.gte'], '7.6', 'underrated series discover sent va>=7.6');
    eq(underReq && underReq.params['vote_count.lte'], '300', 'underrated series discover sent vc<=300');
    check(!('with_runtime.gte' in (underReq ? underReq.params : {})), 'underrated series discover sent NO runtime filter (movies only)');
  }

  // ---------------------------------------------------------------------------
  // 4b. Cap scoping, direct unit checks
  // ---------------------------------------------------------------------------
  console.log('=== 4b. Cap scoping (direct) ===');
  {
    const base = (over) => ({ type: 'Scripted', number_of_episodes: 10, origin_country: ['US'], genres: [], networks: [], ...over });
    eq(tvShowExcludeReason(base({ number_of_episodes: 148, origin_country: ['JP'], genres: [{ id: 16 }, { id: 10759 }] })), null, 'JP anime 148 eps passes the scoped cap');
    eq(tvShowExcludeReason(base({ number_of_episodes: 1180, origin_country: ['JP'] })), null, 'JP anime 1180 eps (One Piece) passes the scoped cap');
    eq(tvShowExcludeReason(base({ number_of_episodes: 200, origin_country: ['US'] })), null, 'US series 200 eps passes the scoped cap');
    eq(tvShowExcludeReason(base({ number_of_episodes: 150, origin_country: ['IN'] })), 'episodes:150', 'IN series 150 eps still dropped by the cap');
    eq(tvShowExcludeReason(base({ number_of_episodes: 150, origin_country: undefined })), 'episodes:150', 'unknown origin 150 eps still dropped (conservative default — a missing origin_country never leaks a soap)');
    eq(tvShowExcludeReason(base({ number_of_episodes: 150, origin_country: [] })), 'episodes:150', 'empty origin_country 150 eps still dropped');
    eq(tvShowExcludeReason(base({ number_of_episodes: 150, origin_country: ['US'], genres: [{ id: 10766 }] })), 'episodes:150', 'Soap-genre 150 eps still dropped by the cap');
    eq(tvShowExcludeReason(base({ type: 'Talk Show' })), 'type:Talk Show', 'type layer untouched');
    eq(tvShowExcludeReason(base({ number_of_episodes: 20, origin_country: ['IN'], networks: [{ name: 'Star Plus' }] })), 'network:Star Plus', 'network blocklist untouched (short Indian soap still caught)');
    eq(tvShowExcludeReason(base({ number_of_episodes: 56, origin_country: ['IN'] })), null, 'IN web series 56 eps passes');
  }

  // ---------------------------------------------------------------------------
  // 5. OTT Ready provider filter
  // ---------------------------------------------------------------------------
  console.log('=== 5. OTT Ready providers ===');
  {
    // Scenario A: TMDB returns 5 of the 6 configured ids (237 missing).
    REQUESTS = []; PROVIDER_LIST = [8, 119, 122, 2336, 232]; PROVIDER_LIST_FAIL = false;
    const { rows, stats } = await runBuildRows('movie');
    const ott = rows['latest-indian-ott'];
    eq(JSON.stringify(names(ott)), JSON.stringify(['OTT-1', 'OTT-2', 'OTT-3']), 'OTT row keeps digital-in-window titles, drops stale-digital + no-imdb');
    const ottReq = REQUESTS.find((r) => r.path === '/3/discover/movie' && r.params.watch_region === 'IN');
    check(!!ottReq, 'OTT discover sent watch_region=IN');
    eq(ottReq && ottReq.params.with_watch_monetization_types, 'flatrate', 'OTT discover sent flatrate monetization');
    eq(ottReq && ottReq.params.with_watch_providers, '8|119|122|2336|232', 'OTT discover sent the validated provider subset (237 dropped, never 422s)');
    eq(JSON.stringify(stats.ottProviders.dropped), JSON.stringify([237]), 'stats.ottProviders names the dropped id');
    // Scenario B: provider-list fetch fails -> no provider filter, row still builds.
    REQUESTS = []; PROVIDER_LIST_FAIL = true;
    const b = await runBuildRows('movie');
    const ottReqB = REQUESTS.find((r) => r.path === '/3/discover/movie' && r.params['primary_release_date.gte']);
    check(!!ottReqB, 'OTT discover still sent on validation failure');
    check(!ottReqB.params.with_watch_providers, 'no with_watch_providers param when validation fails (safe fallback)');
    eq(JSON.stringify(names(b.rows['latest-indian-ott'])), JSON.stringify(['OTT-1', 'OTT-2', 'OTT-3']), 'OTT row still builds without the provider filter');
    check(!!(b.stats.ottProviders && b.stats.ottProviders.error), 'stats.ottProviders records the validation error');
    PROVIDER_LIST_FAIL = false;
  }

  // ---------------------------------------------------------------------------
  // 6. Thriller keywords
  // ---------------------------------------------------------------------------
  console.log('=== 6. Thriller keywords ===');
  {
    KEYWORD_MAP = { 'psychological thriller': 1001, 'plot twist': 1002, 'serial killer': 1004, conspiracy: 1005 };
    // 'mind game' is NOT in the map -> stub returns a near-miss ('mind games'), exact match fails -> dropped.
    const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, keywords: null };
    const ids = await resolveKeywords('test-key', stats, ['psychological thriller', 'plot twist', 'mind game', 'serial killer', 'conspiracy'], 'thrillerKeywords');
    eq(JSON.stringify(ids), JSON.stringify([1001, 1002, 1004, 1005]), 'thriller keywords resolve to ids (mind game dropped, never invented)');
    eq(JSON.stringify(stats.thrillerKeywords.dropped), JSON.stringify(['mind game']), 'dropped term logged in stats');
    REQUESTS = [];
    const c = ctx();
    c.thrillerKeywordIds = ids;
    const { rows } = await runBuildRows('movie', c);
    const thrReq = REQUESTS.find((r) => r.path === '/3/discover/movie' && r.params.with_genres === '53|9648');
    check(!!thrReq, 'thriller movie discover sent');
    eq(thrReq && thrReq.params.with_keywords, '1001|1002|1004|1005', 'thriller discover sent with_keywords pipe-separated');
  }

  // ---------------------------------------------------------------------------
  // 7. Reddit OAuth
  // ---------------------------------------------------------------------------
  console.log('=== 7. Reddit OAuth ===');
  {
    const hotJson = (titles) => JSON.stringify({ data: { children: titles.map((t) => ({ data: { title: t, score: 100, num_comments: 50 } })) } });
    // (a) Creds set -> token POST + oauth GET used, public .json never called.
    const callsA = [];
    const fetchA = async (url, opts) => {
      const u = String(url);
      callsA.push(u);
      const resp = (text, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) });
      if (u.includes('/api/v1/access_token')) {
        check((opts.headers.Authorization || '').startsWith('Basic '), 'token call uses Basic auth');
        return resp(JSON.stringify({ access_token: 'tok123', token_type: 'bearer' }));
      }
      if (u.startsWith('https://oauth.reddit.com/')) {
        check((opts.headers.Authorization || '') === 'Bearer tok123', 'oauth call uses the Bearer token');
        return resp(hotJson(['Oauth Title One', 'Oauth Title Two']));
      }
      return resp('', 403);
    };
    process.env.REDDIT_CLIENT_ID = 'test-id';
    process.env.REDDIT_CLIENT_SECRET = 'test-secret';
    const ra = await buzz.fetchReddit(fetchA);
    check(callsA.some((u) => u.includes('/api/v1/access_token')), 'token endpoint called once per rebuild');
    check(callsA.every((u) => !u.includes('/hot.json')), 'public .json never called when OAuth works (token endpoint is also www.reddit.com)');
    check(ra.items.length === 6, 'oauth items returned (3 subs x 2 titles)');
    check(Object.values(ra.status).every((s) => s.auth === 'oauth'), 'status records auth=oauth');
    // (b) No creds -> public .json path (old behaviour).
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
    const callsB = [];
    const fetchB = async (url) => {
      callsB.push(String(url));
      const resp = (text, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) });
      return resp(hotJson(['Public Title']));
    };
    const rb = await buzz.fetchReddit(fetchB);
    check(callsB.every((u) => u.includes('www.reddit.com')), 'no creds: public .json path used');
    check(Object.values(rb.status).every((s) => s.auth === 'public'), 'status records auth=public');
    // (c) Token 401 -> falls back to public .json, items still returned.
    process.env.REDDIT_CLIENT_ID = 'test-id';
    process.env.REDDIT_CLIENT_SECRET = 'bad-secret';
    const fetchC = async (url) => {
      const u = String(url);
      const resp = (text, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) });
      if (u.includes('/api/v1/access_token')) return resp('', 401);
      return resp(hotJson(['Fallback Title']));
    };
    const rc = await buzz.fetchReddit(fetchC);
    check(rc.items.length === 3, 'token failure falls back to public .json (3 subs x 1 title)');
    check(Object.values(rc.status).every((s) => s.auth === 'public'), 'fallback status records auth=public');
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
    // (d) fetchRedditToken returns null without creds, never throws.
    eq(await buzz.fetchRedditToken(async () => { throw new Error('no network'); }), null, 'fetchRedditToken: no creds -> null, no fetch attempted');
  }

  global.fetch = origFetch;
  console.log(fail === 0 ? '\nALL v1.4.3 TESTS PASSED' : `\n${fail} v1.4.3 TEST(S) FAILED`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
