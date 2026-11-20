// Binge Addon — v1.5.7 Indian TV & Reality Shows tests (basant, 19 Nov
// 2026: "tv show bhi yehi add karo" — Bigg Boss jaise shows addon me
// kahin nahi aate the; root cause the v1.4 TV filter, which he himself
// ordered 18 Nov 2026 to keep C.I.D./Kyunki/Kapil out of the series
// rows: Bigg Boss is Reality type, on Colors, 100+ episodes — it fails
// all three filter layers).
//
// Covers, with a stubbed TMDB fetch (no keys, no network):
// (0) manifest + config — 18 catalogs, new row 'indian-tv-reality-
//     series' at index 11 (right after Latest Indian Web Series,
//     before Releasing Next 30 Days), search extra carried, id
//     unchanged, old 17-row config still orders it correctly (stable
//     sort breaks the order-11 tie in manifest order);
// (1) tvShowExcludeReason (direct) — Bigg Boss / Kapil / daily-soap
//     details are all excluded, a plain web series passes: proof the
//     new row MUST bypass the filter, and the series rows keep it;
// (2) buildRows end-to-end — Reality + Soap|Talk passes, 10/10
//     reserve (Reality first, then Soap|Talk), ANCHOR: Bigg Boss
//     ranks below the Reality keep cut on popularity (pop 1 in the
//     fixtures) so the pass never keeps it — the /find anchor must
//     swap it in at the head, displacing the 10th Reality title;
//     deduped across passes AND across pages, no vote floor (Bigg Boss
//     va 3.7/vc 11 still lands), no-imdb excluded,
//     stats.indianTvReality carries the probe; the SAME titles are
//     still excluded from Latest Indian Web Series by the filter
//     (regression both ways). The anchor exists because the second
//     v1.5.7 production rebuild proved Bigg Boss misses even the
//     Reality top 10 on TMDB popularity (Crime Patrol, Indian Idol,
//     Khatron Ke Khiladi, ... all rank above it).
// (3) applyTvRealityAnchor (direct) — swap / already-in-row /
//     no-anchor / thin-half branches.
// Run: node tests/test-v157.js (exit 0 = all pass)
// Run: node tests/test-v157.js (exit 0 = all pass)
'use strict';

const { buildRows, tvShowExcludeReason, applyTvRealityAnchor } = require('../app/scripts/build-catalogs');
const { MANIFEST, catalogs } = require('../app/lib/manifest');
const { defaultConfig, normalizeConfig, effectiveCatalogs } = require('../app/lib/config');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
const names = (row) => (row || []).map((m) => m.name);

const DAY = 24 * 60 * 60 * 1000;
const daysAgoStr = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 0. Manifest + config — position
// ---------------------------------------------------------------------------
console.log('=== 0. Manifest + config ===');
{
  const list = catalogs();
  eq(MANIFEST.id, 'com.bharatstreams', 'manifest id unchanged (no reinstall)');
  eq(MANIFEST.version, '1.5.9', 'manifest version 1.5.9');
  eq(list.length, 18, '18 catalogs (17 + 1 new row)');
  eq(list[10].id, 'latest-indian-series-series', 'row 11 = Latest Indian Web Series');
  eq(list[11].id, 'indian-tv-reality-series', 'row 12 = Indian TV & Reality Shows (right after Latest Indian Web Series)');
  eq(list[11].name, 'Indian TV & Reality Shows', 'new row display name');
  eq(list[11].type, 'series', 'new row is series type');
  eq(list[12].id, 'releasing-next-30-days-movie', 'row 13 = Releasing Next 30 Days movie (upcoming block still after)');
  check(list[11].extra && list[11].extra[0].name === 'search', 'new row carries the search extra like the rest');
  const cfg = defaultConfig();
  eq(Object.keys(cfg.catalogs).length, 18, 'config carries 18 catalogs');
  eq(cfg.catalogs['indian-tv-reality-series'].enabled, true, 'new row enabled by default');
  eq(cfg.catalogs['indian-tv-reality-series'].order, 11, 'new row default order 11');
  check(!('indian-tv-reality' in cfg.knobs), 'no knob for the new row (no window/floor to tune)');
  // Old stored config (17 rows, orders 0-16) must still order the new
  // row correctly: it takes default order 11, tying with the stored
  // releasing-next-30-days-movie order 11 — stable sort breaks the tie
  // in manifest order, so the new row still lands at index 11.
  const OLD_IDS = list.filter((c) => c.id !== 'indian-tv-reality-series').map((c) => c.id);
  const stored = { catalogs: {} };
  OLD_IDS.forEach((id, i) => { stored.catalogs[id] = { enabled: true, name: id, order: i }; });
  const eff = effectiveCatalogs(normalizeConfig(stored));
  eq(eff.length, 18, 'effectiveCatalogs with an old 17-row stored config still 18');
  eq(eff[11].id, 'indian-tv-reality-series', 'new row at index 11 even under the old stored config');
  eq(eff[12].id, 'releasing-next-30-days-movie', 'releasing row right after it');
}

// ---------------------------------------------------------------------------
// 1. tvShowExcludeReason — why the row must bypass the filter
// ---------------------------------------------------------------------------
console.log('=== 1. tvShowExcludeReason (direct) ===');
{
  const biggBoss = { name: 'Bigg Boss', type: 'Reality', number_of_episodes: 1500, origin_country: ['IN'], genres: [{ id: 10764 }], networks: [{ name: 'Colors' }] };
  eq(tvShowExcludeReason(biggBoss), 'type:Reality', 'Bigg Boss excluded by the type layer (Reality)');
  const kapil = { name: 'The Kapil Sharma Show', type: 'Talk Show', number_of_episodes: 300, origin_country: ['IN'], genres: [{ id: 10767 }], networks: [{ name: 'Sony TV' }] };
  eq(tvShowExcludeReason(kapil), 'type:Talk Show', 'Kapil excluded by the type layer (Talk Show)');
  const soap = { name: 'Daily Soap', type: 'Scripted', number_of_episodes: 1200, origin_country: ['IN'], genres: [{ id: 10766 }], networks: [{ name: 'Star Plus' }] };
  eq(tvShowExcludeReason(soap), 'episodes:1200', 'daily soap excluded by the episode cap (Indian origin)');
  const web = { name: 'Web Series Recent', type: 'Scripted', number_of_episodes: 20, origin_country: ['IN'], genres: [], networks: [] };
  eq(tvShowExcludeReason(web), null, 'plain web series passes the filter');
}

// ---------------------------------------------------------------------------
// Stub TMDB — two genre passes + the latest-series discover.
// ---------------------------------------------------------------------------
function mkSeries(id, name, daysAgo, va, vc, pop, imdb) {
  return {
    id, name, first_air_date: daysAgoStr(daysAgo),
    vote_average: va, vote_count: vc, original_language: 'hi',
    origin_country: ['IN'], popularity: pop, imdb,
  };
}
const DETAILS = {
  701: { name: 'Bigg Boss', type: 'Reality', eps: 1500, networks: ['Colors'], genres: [10764], imdb: 'tt1281973', first: '2006-11-03', va: 3.7, vc: 11, pop: 1 },
  702: { name: 'Indian Idol', type: 'Reality', eps: 400, networks: ['Sony TV'], genres: [10764], imdb: 'tt0486068', first: '2004-10-28', va: 6.2, vc: 45, pop: 88 },
  703: { name: 'Kaun Banega Crorepati', type: 'Reality', eps: 900, networks: ['Sony TV'], genres: [10764], imdb: 'tt0250875', first: '2000-07-03', va: 7.1, vc: 120, pop: 85 },
  704: { name: 'Bigg Boss Recent', type: 'Reality', eps: 40, networks: ['Colors'], genres: [10764], imdb: 'tt7000704', first: daysAgoStr(5), va: 4.1, vc: 8, pop: 80 },
  705: { name: 'NoImdb Reality', type: 'Reality', eps: 100, networks: ['Colors'], genres: [10764], imdb: null, first: '2020-01-01', va: 5.0, vc: 20, pop: 78 },
  706: { name: 'The Kapil Sharma Show', type: 'Talk Show', eps: 300, networks: ['Sony TV'], genres: [10767], imdb: 'tt5747326', first: '2016-04-23', va: 6.8, vc: 60, pop: 82 },
  707: { name: 'Daily Soap', type: 'Scripted', eps: 1200, networks: ['Star Plus'], genres: [10766], imdb: 'tt7000707', first: '2020-01-01', va: 5.5, vc: 30, pop: 75 },
  708: { name: 'MTV Roadies', type: 'Reality', eps: 350, networks: ['MTV'], genres: [10764], imdb: 'tt5017396', first: '2003-08-15', va: 5.8, vc: 55, pop: 70 },
  709: { name: 'Web Series Recent', type: 'Scripted', eps: 20, networks: [], genres: [], imdb: 'tt7000709', first: daysAgoStr(3), va: 8.0, vc: 200, pop: 90 },
  710: { name: 'Soap Recent', type: 'Scripted', eps: 500, networks: ['Star Plus'], genres: [10766], imdb: 'tt7000710', first: daysAgoStr(7), va: 6.0, vc: 25, pop: 65 },
};
// Filler Reality titles (pop 96..86) + a no-imdb title at the very top
// (pop 97): they crowd Bigg Boss (pop 1) out of the Reality pass's
// top-15 resolve cut, so only the anchor can put it in the row.
for (let i = 1; i <= 11; i++) {
  const id = 710 + i;
  DETAILS[id] = { name: `Reality ${String(i).padStart(2, '0')}`, type: 'Reality', eps: 50 + i, networks: ['Colors'], genres: [10764], imdb: `tt7000${id}`, first: '2021-01-01', va: 5.5, vc: 10 + i, pop: 97 - i };
}
DETAILS[722] = { name: 'NoImdb Star', type: 'Reality', eps: 100, networks: ['Colors'], genres: [10764], imdb: null, first: '2020-01-01', va: 5.0, vc: 20, pop: 97 };
// Reality pass: page 1 = top 10 by popularity, page 2 = the rest
// (Bigg Boss last at pop 1 — never resolved, never kept by the pass).
const REALITY = { 1: [722, 711, 712, 713, 714, 715, 716, 717, 718, 719], 2: [720, 721, 702, 703, 704, 708, 701] };
// Soap|Talk pass: page 1 = 706, 707, 710 + 703 again (cross-pass dupe).
const SOAP_TALK = { 1: [706, 707, 710, 703], 2: [] };
// Latest Indian Web Series discover (first_air_date desc, 90d window).
const LATEST = [709, 704, 710];

function discoverItem(id) {
  const d = DETAILS[id];
  return {
    id, name: d.name, first_air_date: d.first,
    vote_average: d.va, vote_count: d.vc, original_language: 'hi',
    origin_country: ['IN'], popularity: d.pop,
  };
}

async function stubFetch(url) {
  const u = new URL(url);
  const path = u.pathname;
  const q = u.searchParams;
  const json = (obj) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => obj });
  if (path === '/3/find/tt1281973') {
    return json({ tv_results: [discoverItem(701)] });
  }
  if (path === '/3/discover/tv') {
    const page = parseInt(q.get('page') || '1', 10);
    const genres = q.get('with_genres') || '';
    if (genres === '10764') {
      return json({ total_results: 42, results: (REALITY[page] || []).map(discoverItem) });
    }
    if (genres === '10766|10767') {
      return json({ total_results: 37, results: (SOAP_TALK[page] || []).map(discoverItem) });
    }
    if ((q.get('sort_by') || '') === 'first_air_date.desc') {
      // New Releases series uses the same sort but WITH a vote floor;
      // Latest Indian Web Series has no vote floor.
      if (q.get('vote_average.gte')) return json({ total_results: 0, results: [] });
      return json({ total_results: 3, results: LATEST.map(discoverItem) });
    }
    return json({ total_results: 0, results: [] });
  }
  const mTv = path.match(/^\/3\/tv\/(\d+)$/);
  if (mTv) {
    const d = DETAILS[+mTv[1]];
    if (!d) return json({ id: +mTv[1], type: 'Scripted', number_of_episodes: 10, networks: [], external_ids: { imdb_id: null } });
    return json({
      id: +mTv[1], name: d.name, type: d.type, number_of_episodes: d.eps,
      origin_country: ['IN'], genres: d.genres.map((g) => ({ id: g })),
      networks: d.networks.map((n) => ({ name: n })), status: 'Returning Series',
      first_air_date: d.first, vote_average: d.va, vote_count: d.vc,
      external_ids: { imdb_id: d.imdb },
    });
  }
  const mExt = path.match(/^\/3\/tv\/(\d+)\/external_ids$/);
  if (mExt) {
    const d = DETAILS[+mExt[1]];
    return json({ imdb_id: d ? (d.imdb || null) : null });
  }
  return json({ results: [] });
}

async function buildWithStub(type) {
  const realFetch = global.fetch;
  global.fetch = stubFetch;
  try {
    const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, trendingTopUp: {} };
    const ctx = {
      seriesCache: new Map(), movieCache: new Map(), config: null,
      buzzState: { version: 1, updatedAt: '', movies: [], series: [] },
      buzzFresh: { movies: [], series: [] },
      buzzSeed: { movies: [], series: [] },
      buzz: { movies: [], series: [], sources: {}, groq: { ok: true }, fetchedTitles: [] },
    };
    const rows = await buildRows(type, 'TESTKEY', {}, stats, ctx);
    return { rows, stats };
  } finally {
    global.fetch = realFetch;
  }
}

(async () => {
  // ---------------------------------------------------------------------------
  // 2. buildRows end-to-end (series)
  // ---------------------------------------------------------------------------
  console.log('=== 2. buildRows (series) — new row + filter regression ===');
  {
    const { rows, stats } = await buildWithStub('series');
    const row = rows['indian-tv-reality'] || [];
    eq(row.length, 14, 'new row: 14 keepers (anchor + 9 Reality + 4 Soap|Talk)');
    eq(JSON.stringify(names(row)), JSON.stringify(['Bigg Boss', 'Reality 01', 'Reality 02', 'Reality 03', 'Reality 04', 'Reality 05', 'Reality 06', 'Reality 07', 'Reality 08', 'Reality 09', 'Kaun Banega Crorepati', 'The Kapil Sharma Show', 'Daily Soap', 'Soap Recent']),
      'new row: anchor Bigg Boss first, Reality 01-09, then Soap|Talk (KBC via the Soap|Talk pass)');
    check(names(row)[0] === 'Bigg Boss', 'Bigg Boss heads the row — the anchor put it there (pop 1, never kept by the pass)');
    check(!names(row).includes('Reality 10'), 'Reality 10 displaced by the anchor (half stays at 10)');
    check(names(row).includes('The Kapil Sharma Show'), 'Kapil lands in the row (Talk pass)');
    check(names(row).includes('Daily Soap'), 'daily soap lands in the row (Soap pass, 1200 eps, Star Plus — filter bypassed)');
    check(names(row).filter((n) => n === 'Kaun Banega Crorepati').length === 1, 'KBC once (via the Soap|Talk pass — the Reality pass never reached it)');
    check(!names(row).includes('NoImdb Star'), 'no-imdb title excluded');
    const s = stats.indianTvReality;
    eq(s.passRealityTotal, 42, 'stats: Reality discover total 42');
    eq(s.passSoapTalkTotal, 37, 'stats: Soap|Talk discover total 37');
    eq(s.scanned, 21, 'stats: 21 candidates scanned across both passes');
    eq(s.kept, 14, 'stats: 14 kept');
    eq(s.realityKept, 10, 'stats: 10 kept from the Reality pass');
    eq(s.soapTalkKept, 4, 'stats: 4 kept from the Soap|Talk pass');
    eq(s.noImdb, 1, 'stats: 1 no-imdb');
    eq(s.anchored, 'Bigg Boss', 'stats: anchor recorded');
    eq(JSON.stringify(s.keptVotes[0]), JSON.stringify({ name: 'Bigg Boss', va: 3.7, vc: 11 }), 'stats: kept-vote probe records Bigg Boss 3.7/11 first');
    // Regression, the other way: the same titles must STILL be kept out
    // of Latest Indian Web Series by the v1.4 filter.
    const latest = rows['latest-indian-series'] || [];
    eq(JSON.stringify(names(latest)), JSON.stringify(['Web Series Recent']), 'Latest Indian Web Series keeps only the web series');
    check(!names(latest).includes('Bigg Boss Recent'), 'latest row still drops Reality type');
    check(!names(latest).includes('Soap Recent'), 'latest row still drops the 500-ep soap');
  }

  // ---------------------------------------------------------------------------
  // 3. applyTvRealityAnchor (direct) — all four branches
  // ---------------------------------------------------------------------------
  console.log('=== 3. applyTvRealityAnchor (direct) ===');
  {
    const mk = (id, name) => ({ id, name });
    const mkVotes = (arr) => arr.map((m) => ({ name: m.name, va: 5, vc: 10 }));
    const anchor = { meta: mk('tt1281973', 'Bigg Boss'), va: 3.7, vc: 11 };
    // (a) Full Reality half (10): anchor unshifts, 10th title drops.
    {
      const reality = Array.from({ length: 10 }, (_, i) => mk(`ttR${i}`, `R${i}`));
      const soap = [mk('ttS1', 'S1')];
      const r = applyTvRealityAnchor([...reality, ...soap], mkVotes([...reality, ...soap]), anchor, 10);
      eq(r.metas.length, 11, 'swap: length unchanged (11 in, 11 out)');
      eq(r.metas[0].name, 'Bigg Boss', 'swap: anchor first');
      eq(r.metas[9].name, 'R8', 'swap: R8 last of the Reality half (R9 displaced)');
      check(!r.metas.some((m) => m.name === 'R9'), 'swap: R9 gone');
      eq(r.metas[10].name, 'S1', 'swap: Soap|Talk half untouched (S1 last)');
      eq(r.anchored, 'Bigg Boss', 'swap: anchored = Bigg Boss');
      eq(r.keptVotes[0].name, 'Bigg Boss', 'swap: keptVotes head is the anchor');
    }
    // (b) Anchor already in the row: no change.
    {
      const metas = [mk('tt1281973', 'Bigg Boss'), mk('ttR1', 'R1')];
      const r = applyTvRealityAnchor(metas, mkVotes(metas), anchor, 2);
      eq(r.metas.length, 2, 'already-in-row: length unchanged');
      eq(r.metas[0].name, 'Bigg Boss', 'already-in-row: order unchanged');
      eq(r.anchored, 'Bigg Boss (already in row)', 'already-in-row: anchored notes it');
    }
    // (c) No anchor: no change.
    {
      const metas = [mk('ttR1', 'R1')];
      const r = applyTvRealityAnchor(metas, mkVotes(metas), null, 1);
      eq(r.metas.length, 1, 'no-anchor: length unchanged');
      eq(r.anchored, null, 'no-anchor: anchored null');
    }
    // (d) Thin Reality half (5 < 10): anchor unshifts, nothing drops.
    {
      const reality = Array.from({ length: 5 }, (_, i) => mk(`ttR${i}`, `R${i}`));
      const r = applyTvRealityAnchor(reality, mkVotes(reality), anchor, 5);
      eq(r.metas.length, 6, 'thin-half: length grows by 1 (no displacement)');
      eq(r.metas[0].name, 'Bigg Boss', 'thin-half: anchor first');
      eq(r.metas[5].name, 'R4', 'thin-half: last Reality title kept');
    }
  }

  console.log(fail === 0 ? '\nALL v1.5.7 TESTS PASSED' : `\n${fail} v1.5.7 TEST(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
