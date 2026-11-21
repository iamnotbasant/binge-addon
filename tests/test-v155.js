// Binge Addon — v1.5.5 row-removal tests (basant, 19 Nov 2026: 12 rows
// removed COMPLETELY — Dark Crime, Underrated Gems (both), Sci-Fi
// (both), Psychological Thrillers (both), Action Heist & Revenge,
// 1-Season Binge, Visual Spectacles, Action Anime, All-Time Classics).
//
// Covers, with a stubbed TMDB fetch (no key, no network):
// (0) manifest + config — 18 catalogs in the exact final order,
//     all 12 removed ids gone from manifest/config/knobs, upcoming
//     rows last (indices 12-17, relative order kept), Big
//     Announcements name is the dynamic currentYear–nextYear;
// (1) episode-cap scoping (tvShowExcludeReason, direct) — the v1.4
//     TV filter survives the removal: JP 148 and US 200 pass, IN 150
//     and Soap-genre 150 drop, type + network layers untouched;
// (2) OTT Ready — discover sends watch_region=IN + flatrate +
//     with_watch_providers (validated subset); a provider id TMDB no
//     longer returns is dropped, never 422s; validation failure falls
//     back to no provider filter and the row still builds;
// (3) Reddit OAuth — creds set: token POST + oauth GET used, public
//     .json never called; no creds: public path; token 401: falls
//     back to public .json; the build never crashes over Reddit.
// Run: node tests/test-v155.js (exit 0 = all pass)
'use strict';

const { buildRows, resolveOttProviders, tvShowExcludeReason } = require('../app/scripts/build-catalogs');
const { catalogs, MANIFEST } = require('../app/lib/manifest');
const { defaultConfig, effectiveCatalogs } = require('../app/lib/config');
const buzz = require('../app/lib/buzz');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const DAY = 24 * 60 * 60 * 1000;
const daysAgoStr = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const names = (row) => (row || []).map((m) => m.name);

const REMOVED_IDS = [
  'dark-crime-series', 'underrated-gems-movie', 'underrated-gems-series',
  'scifi-time-travel-movie', 'scifi-time-travel-series',
  'psychological-thrillers-movie', 'psychological-thrillers-series',
  'action-heist-revenge-movie', 'one-season-miniseries-series',
  'visual-spectacles-movie', 'action-anime-series', 'all-time-classics-movie',
];
const REMOVED_KNOBS = [
  'dark-crime', 'underrated-gems', 'scifi-time-travel',
  'psychological-thrillers', 'action-heist-revenge', 'one-season-miniseries',
  'visual-spectacles', 'action-anime', 'all-time-classics',
];
const EXPECTED_ORDER = [
  'trending-indian-movie', 'trending-indian-series',
  'new-releases-movie', 'new-releases-series',
  'india-buzzing-now-movie', 'india-buzzing-now-series',
  'global-trending-movie', 'global-trending-series',
  'fresh-digital-drops-movie', 'latest-indian-ott-movie',
  'latest-indian-series-series', 'indian-tv-reality-series',
  'releasing-next-30-days-movie', 'releasing-next-30-days-series',
  'big-announcements-movie', 'big-announcements-series',
  'returning-soon-series', 'now-in-theatres-movie',
];

// ---------------------------------------------------------------------------
// 0. Manifest + config — the removal
// ---------------------------------------------------------------------------
console.log('=== 0. Manifest + config (12 rows removed) ===');
{
  const list = catalogs();
  eq(MANIFEST.version, '1.6.4', 'manifest version 1.6.1');
  eq(list.length, 18, '18 catalogs (17 + Indian TV & Reality Shows)');
  eq(JSON.stringify(list.map((c) => c.id)), JSON.stringify(EXPECTED_ORDER), 'exact final order (watchable first, upcoming last)');
  check(REMOVED_IDS.every((id) => !list.some((c) => c.id === id)), 'all 12 removed ids gone from manifest');
  check(list.every((c) => c.extra && c.extra[0].name === 'search'), 'all remaining rows still carry the search extra');
  const y = new Date().getFullYear();
  eq(list.find((c) => c.id === 'big-announcements-movie').name, `Big Announcements ${y}–${y + 1}`, 'big-announcements movie name is dynamic currentYear–nextYear');
  eq(list.find((c) => c.id === 'big-announcements-series').name, `Big Announcements ${y}–${y + 1}`, 'big-announcements series name is dynamic currentYear–nextYear');
  const last6 = list.slice(-6).map((c) => c.id);
  eq(JSON.stringify(last6), JSON.stringify(['releasing-next-30-days-movie', 'releasing-next-30-days-series', 'big-announcements-movie', 'big-announcements-series', 'returning-soon-series', 'now-in-theatres-movie']), 'upcoming rows last, relative order kept');
  eq(list[11].id, 'indian-tv-reality-series', 'last watchable row is Indian TV & Reality Shows');
  const cfg = defaultConfig();
  eq(Object.keys(cfg.catalogs).length, 18, 'config carries 18 catalogs');
  check(REMOVED_IDS.every((id) => !(id in cfg.catalogs)), 'removed ids gone from config catalogs');
  check(REMOVED_KNOBS.every((k) => !(k in cfg.knobs)), 'removed knobs gone from config defaults');
  const eff = effectiveCatalogs(cfg);
  eq(eff.length, 18, 'effectiveCatalogs still 18');
  eq(JSON.stringify(eff.map((c) => c.id)), JSON.stringify(EXPECTED_ORDER), 'effectiveCatalogs order matches');
  eq(eff.find((c) => c.id === 'big-announcements-movie').name, `Big Announcements ${y}–${y + 1}`, 'effectiveCatalogs big name is dynamic even with a stored stale name');
}

// ---------------------------------------------------------------------------
// Stub TMDB — only what sections 2 needs (OTT discover + movie details).
// ---------------------------------------------------------------------------
let REQUESTS = [];
let PROVIDER_LIST = [8, 119, 122, 2336, 232]; // 237 missing on purpose (scenario A)
let PROVIDER_LIST_FAIL = false;

function mkMovie(id, name, daysAgo, va, vc, lang, countries, imdb) {
  return { id, title: name, release_date: daysAgoStr(daysAgo), vote_average: va, vote_count: vc, original_language: lang, origin_country: countries, popularity: 1000 - id, imdb };
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

function discoverMovie(p) {
  const page = p.get('page') || '1';
  const origin = p.get('with_origin_country') || '';
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

async function stubFetch(url, opts) {
  const u = new URL(String(url));
  REQUESTS.push({ path: u.pathname, params: Object.fromEntries(u.searchParams.entries()), method: (opts && opts.method) || 'GET' });
  const ok = (json) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(json), json: async () => json });
  const fail = (status) => ({ ok: false, status, headers: { get: () => null }, text: async () => '', json: async () => ({}) });
  if (u.pathname === '/3/watch/providers/movie') {
    if (PROVIDER_LIST_FAIL) return fail(500);
    return ok({ results: PROVIDER_LIST.map((id) => ({ provider_id: id, provider_name: `P${id}` })) });
  }
  if (u.pathname === '/3/discover/movie') return ok({ results: discoverMovie(u.searchParams), total_pages: 1 });
  if (u.pathname === '/3/discover/tv') return ok({ results: [], total_pages: 1 });
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
    const d = mExt[1] === 'movie' ? MOVIE_DETAILS[id] : null;
    return ok({ imdb_id: d ? d.imdb : `tt9000${id}` });
  }
  return ok({ results: [] });
}

function ctx() {
  return { seriesCache: new Map(), movieCache: new Map(), config: defaultConfig(), buzz: { movies: [], series: [] } };
}

async function runBuildRows(type, c) {
  const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] } };
  const rows = await buildRows(type, 'test-key', {}, stats, c || ctx());
  return { rows, stats };
}

(async () => {
  const origFetch = global.fetch;
  global.fetch = stubFetch;

  // ---------------------------------------------------------------------------
  // 1. Cap scoping, direct unit checks (TV filter survives the removal)
  // ---------------------------------------------------------------------------
  console.log('=== 1. Cap scoping (direct) ===');
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
  // 2. OTT Ready provider filter
  // ---------------------------------------------------------------------------
  console.log('=== 2. OTT Ready providers ===');
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
  // 3. Reddit OAuth
  // ---------------------------------------------------------------------------
  console.log('=== 3. Reddit OAuth ===');
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
  console.log(fail === 0 ? '\nALL v1.5.5 TESTS PASSED' : `\n${fail} v1.5.5 TEST(S) FAILED`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
