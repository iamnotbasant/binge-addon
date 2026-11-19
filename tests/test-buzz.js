// Binge Addon — India Buzzing Now row tests (v1.3.4, basant:
// "kar bhai buzz wala system on bhai").
//
// Covers, with a stubbed fetch (no keys, no network):
// (0) manifest — 18 catalogs (v1.5.7: Indian TV & Reality Shows added), buzz rows right after new-releases
//     (indices 4-5), config knob defaults voteFloor 6 / votes 10;
// (1) Reddit parser — score/comment noise cut, bad shapes skipped;
// (2) YouTube parser — ytInitialData brace-match + videoRenderer
//     walk, consent page (no blob) fails cleanly;
// (3) News RSS parser — " - Source" suffix stripped, CDATA handled;
// (4) fetchBuzzItems — all sources merged with per-source status;
//     a 403 Reddit still yields YouTube + News items;
// (5) Groq response parse — valid JSON -> ranked lists (capped 15),
//     malformed / empty -> error, never a crash;
// (6) normalizeTitle — trailer/teaser/season words stripped, "Part
//     One" kept;
// (7) matchTmdbTitle — "King" matches "King" but NOT "The King";
//     "Ramayana" matches "Ramayana: Rise of a Legend" (prefix);
// (8) buzzFloorPass — rated keep/drop, fresh-release keep, upcoming
//     keep, old+unvoted drop;
// (9) buildRows end-to-end (stubbed TMDB search + details) — movie
//     row fills in BUZZ order (not re-sorted); series row applies the
//     v1.4 TV filter; unmatched + below-floor named in stats; no-imdb
//     excluded;
// (10) collectBuzz end-to-end (stubbed sources + Groq) — Reddit 403
//     recorded honestly, Groq ranks, lists land in ctx.buzz.
// Run: node tests/test-buzz.js (exit 0 = all pass)
'use strict';

const { buildRows, collectBuzz } = require('../app/scripts/build-catalogs');
const { catalogs } = require('../app/lib/manifest');
const { defaultConfig } = require('../app/lib/config');
const buzz = require('../app/lib/buzz');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const DAY = 24 * 60 * 60 * 1000;
const daysStr = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

(async () => {
  // ---------------------------------------------------------------------------
  // 0. Manifest + config
  // ---------------------------------------------------------------------------
  console.log('=== 0. Manifest + config ===');
  {
    const list = catalogs();
    eq(list.length, 18, '18 catalogs (17 + Indian TV & Reality Shows)');
    eq(list[4].id, 'india-buzzing-now-movie', 'buzz movie row at index 4 (right after new-releases)');
    eq(list[5].id, 'india-buzzing-now-series', 'buzz series row at index 5');
    eq(list[4].name, 'India Buzzing Now', 'buzz row name');
    check(list[4].extra && list[4].extra[0].name === 'search', 'buzz rows searchable');
    const cfg = defaultConfig();
    eq(JSON.stringify(cfg.knobs['india-buzzing-now']), '{"voteFloor":6,"voteCountFloor":10}', 'buzz knob defaults');
    eq(Object.keys(cfg.catalogs).length, 18, 'config carries 18 catalogs');
  }

  // ---------------------------------------------------------------------------
  // 1. Reddit parser
  // ---------------------------------------------------------------------------
  console.log('=== 1. Reddit parser ===');
  {
    const json = { data: { children: [
      { data: { title: 'Ramayana crosses 1000cr', score: 1200, num_comments: 340 } },
      { data: { title: 'Dhindora S2 trailer talk', score: 10, num_comments: 40 } },
      { data: { title: 'random low post', score: 3, num_comments: 2 } },
      { data: { title: 42, score: 999, num_comments: 999 } },
      { data: null },
    ] } };
    const items = buzz.parseRedditHot(json, 'bollywood');
    eq(items.length, 2, '2 keepers (high score + high comments)');
    eq(items[0].title, 'Ramayana crosses 1000cr', 'first keeper');
    eq(items[1].source, 'reddit r/bollywood', 'source tagged');
    eq(buzz.parseRedditHot(null, 'x').length, 0, 'null json -> empty');
    eq(buzz.parseRedditHot({}, 'x').length, 0, 'empty json -> empty');
  }

  // ---------------------------------------------------------------------------
  // 2. YouTube parser
  // ---------------------------------------------------------------------------
  console.log('=== 2. YouTube parser ===');
  {
    const blob = JSON.stringify({
      contents: { twoColumnSearchResultsRenderer: { primaryContents: { sectionListRenderer: { contents: [
        { itemSectionRenderer: { contents: [
          { videoRenderer: { title: { runs: [{ text: 'Eetha | Official Trailer' }] }, viewCountText: { simpleText: '45,362,682 views' } } },
          { videoRenderer: { title: { simpleText: 'King Teaser' }, viewCountText: { runs: [{ text: '12,000,000 views' }] } } },
          { channelRenderer: { title: { simpleText: 'Not a video' } } },
        ] } },
      ] } } } },
    });
    const html = `<html><head><script>var ytInitialData = ${blob};</script></head></html>`;
    const vids = buzz.parseYouTubeSearch(html);
    eq(vids.length, 2, '2 videoRenderers found (channel ignored)');
    eq(vids[0].title, 'Eetha | Official Trailer', 'first title');
    eq(vids[0].views, 45362682, 'views parsed to number');
    eq(buzz.parseYouTubeSearch('<html>consent page, no blob</html>'), null, 'no ytInitialData -> null (clean fail)');
    eq(buzz.extractYtInitialData('<html></html>'), null, 'extract on empty -> null');
  }

  // ---------------------------------------------------------------------------
  // 3. News RSS parser
  // ---------------------------------------------------------------------------
  console.log('=== 3. News RSS parser ===');
  {
    const xml = `<rss><channel>
      <item><title><![CDATA[Ramayana box office Day 14 - Pinkvilla]]></title></item>
      <item><title>Shah Rukh Khan ahead of Zendaya - Firstpost</title></item>
      <item><title>Plain headline without source</title></item>
    </channel></rss>`;
    const titles = buzz.parseNewsRss(xml);
    eq(titles.length, 3, '3 items');
    eq(titles[0], 'Ramayana box office Day 14', 'CDATA + source suffix stripped');
    eq(titles[1], 'Shah Rukh Khan ahead of Zendaya', 'source suffix stripped');
    eq(titles[2], 'Plain headline without source', 'no-suffix title untouched');
    eq(buzz.parseNewsRss('<rss></rss>').length, 0, 'empty rss -> empty');
  }

  // ---------------------------------------------------------------------------
  // 4-5. fetchBuzzItems + Groq parse (stubbed fetch)
  // ---------------------------------------------------------------------------
  console.log('=== 4. fetchBuzzItems (stubbed) ===');
  let lastGroqBody = null; // captured in §10 to assert the request shape
  const ytHtml = (titles) => `<html><script>var ytInitialData = ${JSON.stringify({ contents: { items: titles.map((t) => ({ videoRenderer: { title: { simpleText: t }, viewCountText: { simpleText: '1,000 views' } } })) } })};</script></html>`;
  const newsXml = (titles) => `<rss><channel>${titles.map((t) => `<item><title>${t} - Source</title></item>`).join('')}</channel></rss>`;
  function stubFetchSources(url, opts) {
    const u = String(url);
    const resp = (text, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) });
    if (u.includes('reddit.com')) {
      if (u.includes('/r/movies/')) return Promise.resolve({ ok: false, status: 403, headers: { get: () => null }, text: async () => 'blocked', json: async () => ({}) });
      return Promise.resolve(resp(JSON.stringify({ data: { children: [
        { data: { title: 'Ramayana 1000cr discussion', score: 900, num_comments: 200 } },
        { data: { title: 'Jailer 2 climax is insane', score: 500, num_comments: 90 } },
      ] } })));
    }
    if (u.includes('youtube.com')) return Promise.resolve(resp(ytHtml(['Eetha | Official Trailer', 'Dhindora Season 2 Trailer'])));
    if (u.includes('news.google.com')) return Promise.resolve(resp(newsXml(['Ramayana box office crosses 1000 crore', 'Dhindora season 2 premieres tomorrow'])));
    if (u.includes('api.groq.com')) {
      try { lastGroqBody = JSON.parse(opts && opts.body ? opts.body : '{}'); } catch (e) { lastGroqBody = null; }
      return Promise.resolve(resp(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        movies: [{ title: 'Ramayana', reason: 'box-office record' }, { title: 'Eetha', reason: 'trailer just dropped' }],
        series: [{ title: 'Dhindora', reason: 'season 2 premiere' }],
      }) } }] })));
    }
    return Promise.resolve(resp(JSON.stringify({ results: [] })));
  }
  {
    const realFetch = global.fetch;
    global.fetch = stubFetchSources;
    try {
      const { items, sources } = await buzz.fetchBuzzItems();
      check(items.length > 0, 'items merged from live sources');
      check(items.some((i) => i.source.startsWith('reddit')), 'reddit items present');
      check(items.some((i) => i.source.startsWith('youtube')), 'youtube items present');
      check(items.some((i) => i.source.startsWith('news')), 'news items present');
      eq(sources.reddit.movies.ok, false, 'Reddit r/movies 403 recorded honestly');
      eq(sources.reddit.bollywood.ok, true, 'Reddit r/bollywood ok');
      check(sources.youtube['bollywood trailer 2026'].ok, 'YouTube query ok');
      check(sources.news['Bollywood movie'].ok, 'News query ok');
    } finally {
      global.fetch = realFetch;
    }
  }

  console.log('=== 5. Groq response parse ===');
  {
    const good = buzz.parseGroqResponse(JSON.stringify({
      movies: [{ title: 'Ramayana', reason: 'x' }, { title: '  ', reason: 'blank' }],
      series: [{ title: 'Dhindora' }],
    }));
    eq(good.movies.length, 1, 'blank title dropped');
    eq(good.series[0].title, 'Dhindora', 'series kept, reason optional');
    check(buzz.parseGroqResponse('not json').error, 'malformed JSON -> error');
    check(buzz.parseGroqResponse('{"movies":[],"series":[]}').error, 'empty lists -> error');
    const many = { movies: Array.from({ length: 20 }, (_, i) => ({ title: `M${i}` })), series: [] };
    eq(buzz.parseGroqResponse(JSON.stringify(many)).movies.length, 15, 'list capped at 15');
    const fenced = buzz.parseGroqResponse('```json\n{"movies":[{"title":"Ramayana","reason":"x"}],"series":[]}\n```');
    eq(fenced.movies.length, 1, 'fenced JSON parses (fence stripped)');
    eq(buzz.parseGroqResponse('Some prose {"movies":[{"title":"Eetha","reason":"y"}],"series":[]} trailing').movies[0].title, 'Eetha', 'prose around braces ignored');
  }

  // ---------------------------------------------------------------------------
  // 6. normalizeTitle
  // ---------------------------------------------------------------------------
  console.log('=== 6. normalizeTitle ===');
  {
    eq(buzz.normalizeTitle('Dhindora Season 2 Trailer', 'series'), 'dhindora', 'series: season + trailer stripped');
    eq(buzz.normalizeTitle('Ramayana: Part One (2026) Official Trailer', 'movie'), 'ramayana: part one', 'movie: year + trailer stripped, Part One kept');
    eq(buzz.normalizeTitle('King | Official Teaser', 'movie'), 'king', 'teaser stripped');
    eq(buzz.normalizeTitle('Eetha - Pinkvilla', 'movie'), 'eetha', 'trailing source stripped');
    eq(buzz.normalizeTitle('Blade Runner 2099', 'movie'), 'blade runner 2099', 'year-like title number kept');
    eq(buzz.normalizeTitle('', 'movie'), '', 'empty -> empty');
  }

  // ---------------------------------------------------------------------------
  // 7. matchTmdbTitle
  // ---------------------------------------------------------------------------
  console.log('=== 7. matchTmdbTitle ===');
  {
    const results = [
      { id: 1, title: 'The King', vote_average: 7, vote_count: 9000 },
      { id: 2, title: 'King', vote_average: 6.5, vote_count: 40 },
    ];
    const hit = buzz.matchTmdbTitle('King', 'movie', results);
    eq(hit && hit.id, 2, '"King" matches "King", NOT "The King"');
    const hit2 = buzz.matchTmdbTitle('Ramayana', 'movie', [
      { id: 9, title: 'Ramayana: Rise of a Legend', vote_average: 7.5, vote_count: 57 },
    ]);
    eq(hit2 && hit2.id, 9, '"Ramayana" matches "Ramayana: Rise of a Legend" (prefix)');
    eq(buzz.matchTmdbTitle('No Such Film Xyz', 'movie', results), null, 'no match -> null');
    eq(buzz.matchTmdbTitle('King', 'movie', []), null, 'empty results -> null');
  }

  // ---------------------------------------------------------------------------
  // 8. buzzFloorPass
  // ---------------------------------------------------------------------------
  console.log('=== 8. buzzFloorPass ===');
  {
    const today = new Date();
    const floor = { vote: 6, votes: 10 };
    const rated = { vote_average: 7.5, vote_count: 57, release_date: daysStr(-14) };
    eq(buzz.buzzFloorPass(rated, floor, today).keep, true, 'rated keep (7.5/57)');
    eq(buzz.buzzFloorPass(rated, floor, today).via, 'rated', 'via rated');
    const lowRated = { vote_average: 5.5, vote_count: 500, release_date: daysStr(-100) };
    eq(buzz.buzzFloorPass(lowRated, floor, today).keep, false, 'low-rated old title dropped');
    const fresh = { vote_average: 8.0, vote_count: 3, release_date: daysStr(-1) };
    eq(buzz.buzzFloorPass(fresh, floor, today).keep, true, 'fresh release, few votes but >= 6.0, kept');
    eq(buzz.buzzFloorPass(fresh, floor, today).via, 'fresh', 'via fresh');
    const upcoming = { vote_average: 0, vote_count: 0, release_date: daysStr(30) };
    eq(buzz.buzzFloorPass(upcoming, floor, today).keep, true, 'upcoming in 30d, no votes yet, kept');
    const oldUnvoted = { vote_average: 0, vote_count: 0, release_date: daysStr(-900) };
    eq(buzz.buzzFloorPass(oldUnvoted, floor, today).keep, false, 'old + unvoted dropped');
    const oldFew = { vote_average: 7.0, vote_count: 5, release_date: daysStr(-900) };
    eq(buzz.buzzFloorPass(oldFew, floor, today).keep, false, 'old + few votes dropped (neither path)');
    const farFuture = { vote_average: 0, vote_count: 0, release_date: daysStr(200) };
    eq(buzz.buzzFloorPass(farFuture, floor, today).keep, false, 'releasing in 200d (beyond 90d window) dropped');
  }

  // ---------------------------------------------------------------------------
  // 9. buildRows end-to-end (stubbed TMDB)
  // ---------------------------------------------------------------------------
  console.log('=== 9. buildRows end-to-end ===');
  const TMDB = {
    movies: {
      Ramayana: { id: 11, title: 'Ramayana: Rise of a Legend', vote_average: 7.5, vote_count: 57, release_date: daysStr(-14), imdb: 'tt27988879' },
      Eetha: { id: 12, title: 'Eetha', vote_average: 0, vote_count: 0, release_date: daysStr(15), imdb: 'tt38840418' },
      'Low Rated Buzz': { id: 13, title: 'Low Rated Buzz', vote_average: 4.2, vote_count: 800, release_date: daysStr(-200), imdb: 'tt1000013' },
      'No Imdb Film': { id: 14, title: 'No Imdb Film', vote_average: 8.0, vote_count: 500, release_date: daysStr(-30), imdb: null },
      King: { id: 15, title: 'King', vote_average: 0, vote_count: 0, release_date: daysStr(35), imdb: 'tt1000015' },
    },
    series: {
      Dhindora: { id: 21, name: 'Dhindora', vote_average: 7.8, vote_count: 120, first_air_date: daysStr(-1100), imdb: 'tt14650074' },
      'Soap Show': { id: 22, name: 'Soap Show', vote_average: 8.0, vote_count: 900, first_air_date: daysStr(-500), imdb: 'tt1000022', tvTrap: true },
      'Ghost Series': { id: 23, name: 'Ghost Series', vote_average: 7.0, vote_count: 30, first_air_date: daysStr(-10), imdb: 'tt1000023' },
      'Panchayat': { id: 24, name: 'Panchayat', vote_average: 8.0, vote_count: 500, first_air_date: daysStr(-2000), imdb: 'tt1000024' },
    },
  };
  function stubFetchTmdb(url) {
    const u = new URL(url);
    const path = u.pathname;
    const q = u.searchParams;
    const json = (obj) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => obj, text: async () => JSON.stringify(obj) });
    if (path === '/3/search/movie') {
      const query = (q.get('query') || '').toLowerCase();
      const hits = Object.values(TMDB.movies).filter((m) => m.title.toLowerCase().includes(query) || query.includes(m.title.toLowerCase().split(':')[0]));
      // "King" must NOT match "The King"-style traps: only return the exact-ish hit.
      const exact = hits.filter((m) => m.title.toLowerCase() === query || m.title.toLowerCase().startsWith(query));
      return json({ results: (exact.length ? exact : hits).map(({ imdb, ...rest }) => rest) });
    }
    if (path === '/3/search/tv') {
      const query = (q.get('query') || '').toLowerCase();
      const hits = Object.values(TMDB.series).filter((s) => s.name.toLowerCase().includes(query) || query.includes(s.name.toLowerCase()));
      return json({ results: hits.map(({ imdb, tvTrap, ...rest }) => rest) });
    }
    const mExt = path.match(/^\/3\/movie\/(\d+)\/external_ids$/);
    if (mExt) {
      const item = Object.values(TMDB.movies).find((m) => m.id === +mExt[1]);
      return json({ imdb_id: item ? item.imdb : null });
    }
    const mTv = path.match(/^\/3\/tv\/(\d+)$/);
    if (mTv) {
      const item = Object.values(TMDB.series).find((s) => s.id === +mTv[1]);
      if (!item) return json({ id: +mTv[1], type: 'Scripted', number_of_episodes: 10, networks: [], status: 'Ended', next_episode_to_air: null, external_ids: { imdb_id: null } });
      return json({
        id: item.id, type: item.tvTrap ? 'Talk Show' : 'Scripted', number_of_episodes: item.tvTrap ? 500 : 24,
        networks: [], status: 'Ended', next_episode_to_air: null,
        external_ids: { imdb_id: item.imdb },
      });
    }
    return json({ results: [] });
  }
  async function buildWithBuzz(type, buzzLists) {
    const realFetch = global.fetch;
    global.fetch = stubFetchTmdb;
    try {
      const stats = { excludedNoImdb: 0, excludedTvShow: { total: 0, byReason: {}, names: [] }, keywords: null, trendingTopUp: {} };
      const rows = await buildRows(type, 'TESTKEY', {}, stats, {
        seriesCache: new Map(), movieCache: new Map(), keywordIds: [], config: null,
        buzz: { movies: buzzLists.movies || [], series: buzzLists.series || [], sources: {}, groq: { ok: true } },
      });
      return { rows, stats };
    } finally {
      global.fetch = realFetch;
    }
  }
  {
    const { rows, stats } = await buildWithBuzz('movie', {
      movies: [
        { title: 'Ramayana', reason: 'box-office record' },
        { title: 'Eetha Official Trailer', reason: 'trailer just dropped' },
        { title: 'Low Rated Buzz', reason: 'controversy' },
        { title: 'No Imdb Film', reason: 'viral clip' },
        { title: 'Made Up Film Xyz', reason: 'meme' },
        { title: 'King', reason: 'teaser hype' },
      ],
    });
    const row = rows['india-buzzing-now'] || [];
    const names = row.map((m) => m.name);
    eq(names.length, 3, 'movie buzz row = Ramayana + Eetha + King (order kept)');
    eq(names[0], 'Ramayana: Rise of a Legend', 'first = Ramayana (buzz order, not re-sorted)');
    eq(names[1], 'Eetha', 'second = Eetha (fresh/upcoming path)');
    eq(names[2], 'King', 'third = King (upcoming, 35d)');
    const s = stats.buzz.movie;
    eq(s.total, 3, 'stats total 3');
    eq(s.matched, 4, 'stats matched 4 (incl. the no-imdb one, dropped later)');
    check(s.unmatched.includes('Made Up Film Xyz'), 'unmatched title named in stats');
    check(s.belowFloor.some((x) => x.startsWith('Low Rated Buzz')), 'below-floor title named in stats');
    eq(s.noImdb, 1, 'no-imdb counted');
  }
  {
    const { rows, stats } = await buildWithBuzz('series', {
      series: [
        { title: 'Dhindora Season 2', reason: 'season 2 premiere' },
        { title: 'Soap Show', reason: 'viral' },
        { title: 'Ghost Series', reason: 'trending' },
        // v1.3.4 fix: TMDB is searched with the NORMALIZED title, so a
        // Groq title carrying "Season 5" still matches the show.
        { title: 'Panchayat Season 5', reason: 'season 5 buzz' },
      ],
    });
    const row = rows['india-buzzing-now'] || [];
    const names = row.map((m) => m.name);
    eq(names.length, 3, 'series buzz row = Dhindora + Ghost Series + Panchayat (TV trap excluded)');
    eq(names[0], 'Dhindora', 'Dhindora first (season suffix matched the show)');
    eq(names[2], 'Panchayat', '"Panchayat Season 5" matched via normalized search');
    check(!names.includes('Soap Show'), 'Talk Show trap excluded by v1.4 filter');
    eq(stats.buzz.series.total, 3, 'series stats total 3');
  }

  // ---------------------------------------------------------------------------
  // 10. collectBuzz end-to-end (stubbed sources + Groq)
  // ---------------------------------------------------------------------------
  console.log('=== 10. collectBuzz end-to-end ===');
  {
    const realFetch = global.fetch;
    global.fetch = stubFetchSources;
    const realKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'gsk_test_key_for_tests_only';
    try {
      const out = await collectBuzz();
      eq(out.groq.ok, true, 'Groq ok');
      eq(out.movies.length, 2, '2 ranked movies');
      eq(out.movies[0].title, 'Ramayana', 'top movie = Ramayana');
      eq(out.series.length, 1, '1 ranked series');
      eq(out.series[0].title, 'Dhindora', 'series = Dhindora');
      eq(out.sources.reddit.movies.ok, false, 'Reddit 403 recorded in collectBuzz stats');
      check(out.sources.youtube['bollywood trailer 2026'].ok, 'YouTube ok in stats');
      // v1.3.4 Groq fix (19 Nov): json_schema strict mode + low reasoning
      // — plain json_object failed live with json_validate_failed.
      eq(lastGroqBody && lastGroqBody.model, 'openai/gpt-oss-20b', 'Groq model = openai/gpt-oss-20b');
      eq(lastGroqBody && lastGroqBody.response_format && lastGroqBody.response_format.type, 'json_schema', 'Groq response_format = json_schema');
      eq(lastGroqBody && lastGroqBody.response_format && lastGroqBody.response_format.json_schema && lastGroqBody.response_format.json_schema.strict, true, 'Groq json_schema strict = true');
      eq(lastGroqBody && lastGroqBody.reasoning_effort, 'low', 'Groq reasoning_effort = low');
      check(lastGroqBody && lastGroqBody.response_format.json_schema.schema.required.includes('movies'), 'Groq schema requires movies + series');
    } finally {
      global.fetch = realFetch;
      if (realKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = realKey;
    }
  }
  {
    // No Groq key -> empty rows, no crash.
    const realFetch = global.fetch;
    global.fetch = stubFetchSources;
    const realKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const out = await collectBuzz();
      eq(out.groq.ok, false, 'no key -> groq not ok');
      eq(out.movies.length, 0, 'no key -> empty movies');
      eq(out.series.length, 0, 'no key -> empty series');
    } finally {
      global.fetch = realFetch;
      if (realKey !== undefined) process.env.GROQ_API_KEY = realKey;
    }
  }

  console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
