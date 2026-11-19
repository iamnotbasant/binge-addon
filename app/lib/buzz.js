// Binge Addon — Buzz system (v1.3.4, basant 19 Nov 2026: "kar bhai
// buzz wala system on bhai").
//
// Once a day, inside the existing daily catalog rebuild, the addon reads
// what people are actually discussing about movies/series in India —
// Reddit (public subreddits, public JSON, no key), YouTube (search
// pages, ytInitialData parse, no key), entertainment news (Google News
// RSS, no key) — then Groq gpt-oss-20b ranks the discussed titles and
// the builder matches them to TMDB and writes ONE new row pair,
// "India Buzzing Now" (movie + series).
//
// X/Twitter is EXCLUDED by design (its API is paid, $100+/month) —
// never attempted. Reddit is 403-blocked from Vercel's datacenter IPs
// on unauthenticated .json — v1.4.3 adds client_credentials OAuth
// (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET env vars, oauth.reddit.com)
// with graceful fallback: no creds, or a failed token call, and the
// fetcher uses the public .json path exactly as before (or skips
// Reddit entirely on a 403). The build never crashes over Reddit; the
// per-source status records which path was used. The keys are never
// stored anywhere — the user creates a Reddit "script" app and adds
// them to the Vercel env vars himself; until then the fallback runs.
//
// Honest rule (basant was told this): buzz does not always mean good —
// a title can trend because of controversy. So a buzzed title only
// enters the row when TMDB backs it: vote_average >= 6.0 AND
// vote_count >= 10 (rated path), OR it is fresh/upcoming — released in
// the last 30 days or releasing in the next 90 days with no votes yet
// or a >= 6.0 average (fresh path). Titles below the floor are dropped
// and named in stats, never faked in.
//
// v1.5.6: buzz carry-over — the row now has a 3-day memory
// (buzz-state.json in Blob). Fresh Groq titles go first; the rest of
// the row fills from previous buzz titles that still pass the floor
// on fresh TMDB data. A title with no fresh buzz for 3 rebuilds
// drops out; the first run seeds from today's Trending in India rows.
// TMDB is the source of truth for matching (title -> TMDB id via
// /search; never invented; unmatched titles are skipped and named).
// The Groq key comes ONLY from process.env.GROQ_API_KEY (set in Vercel,
// verified working 19 Nov 2026) — it is never written to any file, log,
// or report by this module. Without the key, or when Groq fails, the
// buzz rows are empty and the rest of the rebuild proceeds normally.

'use strict';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-20b';
const BUZZ_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 12000;
const BUZZ_MAX_RANKED = 15; // LLM list cap per type

const REDDIT_SUBS = ['bollywood', 'IndianCinema', 'movies'];
const YOUTUBE_QUERIES = ['bollywood trailer 2026', 'hindi web series trailer'];
const NEWS_QUERIES = ['Bollywood movie', 'Indian web series'];

async function fetchText(url, fetchImpl, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': BUZZ_UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, text: await res.text() };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 80) };
  } finally {
    clearTimeout(t);
  }
}

// --- Reddit (OAuth when creds exist, public JSON otherwise) ---
// v1.4.3: client_credentials OAuth against oauth.reddit.com. The token
// is fetched once per rebuild (not per subreddit) and is never logged
// or stored — it lives only in this function's scope. Any failure
// (no creds, token 4xx, oauth 403) falls back to the public .json
// path, exactly as before; a dead source never fails the rebuild.
async function fetchRedditToken(fetchImpl) {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': BUZZ_UA,
        },
        body: 'grant_type=client_credentials',
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json && typeof json.access_token === 'string' ? json.access_token : null;
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    return null;
  }
}

async function fetchRedditSub(sub, fetchImpl, token) {
  const parse = (text) => {
    try { return { ok: true, items: parseRedditHot(JSON.parse(text), sub) }; }
    catch (e) { return { ok: false, error: 'bad json' }; }
  };
  if (token) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`https://oauth.reddit.com/r/${sub}/hot?limit=25`, {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': BUZZ_UA },
        signal: ctrl.signal,
      });
      if (res.ok) {
        const r = parse(await res.text());
        if (r.ok) return { ...r, auth: 'oauth' };
      }
      // OAuth call failed or unparseable — fall through to the public
      // path below.
    } catch (e) {
      // Network/abort — fall through to the public path below.
    } finally {
      clearTimeout(t);
    }
  }
  const r = await fetchText(`https://www.reddit.com/r/${sub}/hot.json?limit=25`, fetchImpl);
  if (!r.ok) return { ok: false, error: r.error, auth: 'public' };
  const parsed = parse(r.text);
  return parsed.ok ? { ...parsed, auth: 'public' } : { ok: false, error: parsed.error, auth: 'public' };
}

// Keeps posts with real discussion (score >= 25 or >= 15 comments) —
// the LLM ranks them; the filter only cuts the long tail of noise.
function parseRedditHot(json, sub) {
  const out = [];
  const children = (json && json.data && json.data.children) || [];
  for (const c of children) {
    const d = c && c.data;
    if (!d || typeof d.title !== 'string') continue;
    const score = d.score || 0;
    const comments = d.num_comments || 0;
    if (score < 25 && comments < 15) continue;
    out.push({ title: d.title.trim(), source: `reddit r/${sub}`, score, comments });
  }
  return out;
}

async function fetchReddit(fetchImpl) {
  const status = {};
  const items = [];
  const token = await fetchRedditToken(fetchImpl);
  await Promise.all(REDDIT_SUBS.map(async (sub) => {
    const r = await fetchRedditSub(sub, fetchImpl, token);
    if (!r.ok) { status[sub] = { ok: false, error: r.error, auth: r.auth }; return; }
    status[sub] = { ok: true, count: r.items.length, auth: r.auth };
    items.push(...r.items);
  }));
  return { items, status };
}

// --- YouTube (search pages, ytInitialData parse, no key) ---
// The search page is HTML with a `var ytInitialData = {...};` blob.
// Brace-match it out (regex cannot span nested objects), then walk the
// tree for videoRenderer nodes. A consent/interstitial page has no
// ytInitialData and fails cleanly (source recorded, row unaffected).
function extractYtInitialData(html) {
  const marker = 'var ytInitialData = ';
  const i = html.indexOf(marker);
  if (i < 0) return null;
  let j = i + marker.length;
  let depth = 0, inStr = false, esc = false;
  for (; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  try { return JSON.parse(html.slice(i + marker.length, j)); } catch (e) { return null; }
}

function collectVideoRenderers(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.videoRenderer) {
    const vr = node.videoRenderer;
    const title = vr.title && vr.title.runs
      ? vr.title.runs.map((r) => r.text).join('')
      : (vr.title && vr.title.simpleText) || '';
    const viewsRaw = vr.viewCountText
      ? (vr.viewCountText.simpleText || (vr.viewCountText.runs || []).map((r) => r.text).join(''))
      : '';
    const views = parseInt(String(viewsRaw).replace(/[^0-9]/g, ''), 10) || 0;
    if (title) out.push({ title: title.trim(), views });
    return;
  }
  for (const v of Object.values(node)) collectVideoRenderers(v, out);
}

function parseYouTubeSearch(html) {
  const data = extractYtInitialData(html);
  if (!data) return null;
  const vids = [];
  collectVideoRenderers(data, vids);
  return vids;
}

async function fetchYouTube(fetchImpl) {
  const status = {};
  const items = [];
  await Promise.all(YOUTUBE_QUERIES.map(async (q) => {
    const r = await fetchText(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, fetchImpl);
    if (!r.ok) { status[q] = { ok: false, error: r.error }; return; }
    const vids = parseYouTubeSearch(r.text);
    if (!vids) { status[q] = { ok: false, error: 'no ytInitialData' }; return; }
    status[q] = { ok: true, count: vids.length };
    for (const v of vids.slice(0, 15)) {
      items.push({ title: v.title, source: `youtube "${q}"`, score: v.views, comments: 0 });
    }
  }));
  return { items, status };
}

// --- News (Google News RSS, India edition, no key) ---
// Titles arrive as "Headline - Source"; the trailing source is
// stripped. Items are already India-relevant (gl=IN, hl=en-IN).
function parseNewsRss(xml) {
  const out = [];
  const re = /<item>[\s\S]*?<title>(.*?)<\/title>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    let t = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    t = t.replace(/\s+-\s+[^-]+$/, '').trim(); // trailing " - Source"
    if (t) out.push(t);
  }
  return out;
}

async function fetchNews(fetchImpl) {
  const status = {};
  const items = [];
  await Promise.all(NEWS_QUERIES.map(async (q) => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const r = await fetchText(url, fetchImpl);
    if (!r.ok) { status[q] = { ok: false, error: r.error }; return; }
    const titles = parseNewsRss(r.text);
    status[q] = { ok: true, count: titles.length };
    for (const t of titles.slice(0, 15)) {
      items.push({ title: t, source: `news "${q}"`, score: 0, comments: 0 });
    }
  }));
  return { items, status };
}

// Fetch all three sources in parallel. One dead source never fails the
// others; the per-source status is recorded for the rebuild stats.
async function fetchBuzzItems(fetchImpl) {
  const f = fetchImpl || global.fetch;
  const [reddit, youtube, news] = await Promise.all([
    fetchReddit(f), fetchYouTube(f), fetchNews(f),
  ]);
  const items = [...reddit.items, ...youtube.items, ...news.items];
  return {
    items: items.slice(0, 70),
    sources: { reddit: reddit.status, youtube: youtube.status, news: news.status },
  };
}

// --- Groq analysis (gpt-oss-20b) ---
// Input: raw buzz items. Output: ranked {movies, series} title lists
// with a one-phrase reason each. The model must only name titles that
// appear in the items — never invent one. A bad response (non-JSON,
// wrong shape) returns {error} and the rows stay empty.
const GROQ_SYSTEM = 'You are an entertainment analyst for Indian audiences. '
  + 'Given raw buzz items (Reddit posts, YouTube video titles, news headlines), extract the movie and TV/web-series titles people in India are actually discussing right now. '
  + 'Return JSON only: {"movies": [{"title": "...", "reason": "..."}], "series": [{"title": "...", "reason": "..."}]}. '
  + 'Rules: only titles clearly named in the items; at most 15 per list, ranked by how much discussion they have; reason is one short phrase (e.g. "trailer just dropped", "box-office record", "season 2 premiere"); '
  + 'skip generic words, actor names without a title, and non-entertainment items; never invent a title that is not in the items.';

function parseGroqResponse(text) {
  let parsed;
  // The model sometimes wraps the JSON in a ```json fence even in JSON
  // mode — strip fences (and any prose around the braces) before
  // parsing; the JSON inside is untouched, and if it is not valid the
  // call still fails.
  const cleaned = String(text || '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const brace = cleaned.match(/\{[\s\S]*\}/);
  try { parsed = JSON.parse(brace ? brace[0] : cleaned); } catch (e) { return { error: 'non-json response' }; }
  const clean = (arr) => (Array.isArray(arr) ? arr : [])
    .filter((x) => x && typeof x.title === 'string' && x.title.trim())
    .slice(0, BUZZ_MAX_RANKED)
    .map((x) => ({ title: x.title.trim(), reason: typeof x.reason === 'string' ? x.reason.trim().slice(0, 80) : '' }));
  const movies = clean(parsed.movies);
  const series = clean(parsed.series);
  if (!movies.length && !series.length) return { error: 'empty lists' };
  return { movies, series };
}

async function groqAnalyze(items, groqKey, fetchImpl) {
  const f = fetchImpl || global.fetch;
  const lines = items.map((it, i) => {
    const eng = it.score ? ` (${it.score}${it.comments ? `, ${it.comments} comments` : ''})` : '';
    return `${i + 1}. [${it.source}${eng}] ${it.title}`;
  }).join('\n');
  // Groq json_schema mode (strict: true — supported for gpt-oss-20b
  // per Groq's Structured Outputs docs) constrains decoding so the
  // reply MUST match the schema. The plain json_object mode failed
  // live (19 Nov 2026: HTTP 400 json_validate_failed, empty
  // failed_generation — the reasoning model emitted no final JSON).
  // reasoning_effort 'low' keeps the reasoning trace short for this
  // simple extraction/ranking task, so the answer fits in max_tokens.
  const BUZZ_SCHEMA = {
    name: 'buzz_ranking',
    schema: {
      type: 'object',
      properties: {
        movies: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, reason: { type: 'string' } }, required: ['title', 'reason'], additionalProperties: false } },
        series: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, reason: { type: 'string' } }, required: ['title', 'reason'], additionalProperties: false } },
      },
      required: ['movies', 'series'],
      additionalProperties: false,
    },
    strict: true,
  };
  const body = {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: GROQ_SYSTEM },
      { role: 'user', content: `Buzz items from today:\n${lines}\n\nRank the titles India is discussing, movies and series separately.` },
    ],
    temperature: 0.2,
    max_tokens: 2500,
    reasoning_effort: 'low',
    response_format: { type: 'json_schema', json_schema: BUZZ_SCHEMA },
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await f(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // Record the first 300 chars of Groq's error body in stats so a
      // 400 (e.g. model/format rejection) is diagnosable from the
      // rebuild response instead of guessing — the key is never logged.
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch (e) { /* ignore */ }
      return { error: `Groq HTTP ${res.status}${detail ? ': ' + detail : ''}` };
    }
    const json = await res.json();
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (typeof content !== 'string') return { error: 'no content' };
    return parseGroqResponse(content);
  } catch (e) {
    return { error: String((e && e.message) || e).slice(0, 80) };
  } finally {
    clearTimeout(t);
  }
}

// --- Title normalization (for TMDB matching) ---
// Strips trailer/teaser/review words, parenthesised years, trailing
// " - ..." suffixes, and (series only) "Season N" — the TMDB entry
// holds the show title, not the season. "Part One"/"Part 2" is KEPT:
// it is part of movie titles (Ramayana: Part One).
function normalizeTitle(raw, type) {
  let s = String(raw || '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/\s+-\s+.*$/, ' ');
  s = s.replace(/\b(official\s+)?(trailer|teaser|official video|full video|video song|jukebox|review|reaction|first look|poster|song|lyrical|audio jukebox)\b/g, ' ');
  if (type === 'series') s = s.replace(/\bseason\s*\d+\b/g, ' ').replace(/\bs\d+\b/g, ' ');
  s = s.replace(/[^a-z0-9:]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// Match a buzzed title against TMDB search results (top 3). Accept an
// exact normalized match, a prefix match ("ramayana" -> "ramayana: rise
// of a legend"), or a more-specific query ("king" must NOT match "the
// king" — containment the wrong way is rejected).
function matchTmdbTitle(title, type, results) {
  const want = normalizeTitle(title, type);
  if (!want) return null;
  for (const r of (results || []).slice(0, 3)) {
    const got = normalizeTitle(r.title || r.name || '', type);
    if (!got) continue;
    if (got === want) return r;
    if (got.startsWith(want + ' ') || got.startsWith(want + ':')) return r;
    if (want.startsWith(got) && got.length >= 5) return r;
  }
  return null;
}

// Quality floor (see header): rated path OR fresh/upcoming path.
// `item` is a TMDB search result (vote_average, vote_count,
// release_date / first_air_date). `today` is a Date.
function buzzFloorPass(item, floor, today) {
  const va = item.vote_average || 0;
  const vc = item.vote_count || 0;
  if (vc >= floor.votes && va >= floor.vote) return { keep: true, via: 'rated' };
  const dateStr = (item.release_date || item.first_air_date || '').slice(0, 10);
  if (dateStr) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    const lo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const hi = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    if (d >= lo && d <= hi && (vc === 0 || va >= floor.vote)) return { keep: true, via: 'fresh' };
  }
  return { keep: false };
}

// --- Buzz carry-over state (v1.5.6) ---
// The row had no memory: Groq re-ranks from scratch every rebuild,
// so a huge title could vanish run to run (19 Nov 2026: Ramayana
// 7.5/57 was in the row at 17:12 IST, gone at 18:52 IST — not the
// floor, not the match, just a fresh ranking). The state file gives
// the row a 3-day memory: a title that was buzzing stays in the row
// while it still passes the floor on FRESH TMDB data, unless it has
// had no fresh buzz for 3 straight rebuilds.
//
// State shape (Vercel Blob, buzz-state.json, one put per rebuild):
//   { version: 1, updatedAt: "YYYY-MM-DD",
//     movies: [{ tmdbId, imdbId, title, firstSeen, lastBuzz, rank, seeded? }],
//     series: [...] }
// lastBuzz = date of the last rebuild where Groq ranked the title OR
// it appeared in that rebuild's fetched buzz items. Carrying a title
// into a row does NOT refresh lastBuzz — only fresh buzz does — so a
// title with 3 quiet rebuilds still drops out. The file is tiny
// (<= 40 entries per type) and a missing/corrupt file is a bootstrap,
// never a build failure.
const BUZZ_STATE_PATHNAME = 'buzz-state.json';
const BUZZ_CARRY_DAYS = 3;
const BUZZ_STATE_MAX_PER_TYPE = 40;

function daysBetween(aStr, bStr) {
  const a = Date.parse(`${aStr}T00:00:00Z`);
  const b = Date.parse(`${bStr}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity; // unparseable -> stale
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function isCarryFresh(lastBuzz, todayStr) {
  return daysBetween(lastBuzz, todayStr) <= BUZZ_CARRY_DAYS;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateBuzzState(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const cleanList = (arr) => (Array.isArray(arr) ? arr : [])
    .filter((e) => e && typeof e.tmdbId === 'number'
      && typeof e.imdbId === 'string' && /^tt\d+$/.test(e.imdbId)
      && typeof e.title === 'string' && e.title.trim()
      && typeof e.firstSeen === 'string' && DATE_RE.test(e.firstSeen)
      && typeof e.lastBuzz === 'string' && DATE_RE.test(e.lastBuzz)
      && typeof e.rank === 'number')
    .map((e) => ({
      tmdbId: e.tmdbId, imdbId: e.imdbId, title: e.title,
      firstSeen: e.firstSeen, lastBuzz: e.lastBuzz, rank: e.rank,
      ...(e.seeded ? { seeded: true } : {}),
    }));
  return {
    version: 1,
    updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : '',
    movies: cleanList(json.movies),
    series: cleanList(json.series),
  };
}

// Does a raw fetched headline count as fresh buzz for a state title?
// Exact/prefix match on the normalized titles, plus a core-word
// fallback (the state's first word, len >= 4, as a whole word in the
// headline — "ramayana box office day 14" refreshes Ramayana). This
// is a REFRESH-ONLY signal: it can extend a carried title's life, it
// can never add a row entry (that still needs Groq rank + TMDB match
// + floor), so a loose match here is low-risk.
function matchesBuzzTitle(fetchedRaw, stateTitle, type) {
  const f = normalizeTitle(fetchedRaw, type);
  const s = normalizeTitle(stateTitle, type);
  if (!f || !s) return false;
  if (f === s) return true;
  if (f.startsWith(s + ' ') || f.startsWith(s + ':')
    || s.startsWith(f + ' ') || s.startsWith(f + ':')) return true;
  const first = s.split(/[:\s]+/)[0];
  if (first && first.length >= 4 && f.split(/[:\s]+/).includes(first)) return true;
  return false;
}

// Fresh titles first (Groq rank order), then carried titles, deduped
// by catalog id (imdbId) and capped. Pure — the row merge in one place.
function mergeBuzzRows(freshMetas, carriedMetas, cap) {
  const out = [];
  const seen = new Set();
  for (const m of [...(freshMetas || []), ...(carriedMetas || [])]) {
    if (!m || !m.id) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
    if (out.length >= cap) break;
  }
  return out;
}

// Compute the next buzz state. prev may be null (no file / corrupt —
// bootstrap). fresh/seeded are { movies: [...], series: [...] } entry
// lists ({ tmdbId, imdbId, title, rank }); fetchedTitles is the flat
// list of raw buzz-item titles from this rebuild. Pure and never
// throws on bad input — bad entries are dropped, never crash the build.
// Returns { state, report }.
function updateBuzzState(prev, fresh, seeded, fetchedTitles, todayStr) {
  const next = { version: 1, updatedAt: todayStr, movies: [], series: [] };
  const report = {
    expired: { movies: 0, series: 0 },
    stored: { movies: 0, series: 0 },
    seeded: { movies: 0, series: 0 },
    refreshed: { movies: 0, series: 0 },
  };
  const fetched = Array.isArray(fetchedTitles) ? fetchedTitles : [];
  for (const type of ['movies', 'series']) {
    const mediaType = type === 'movies' ? 'movie' : 'series';
    const byId = new Map();
    for (const e of (prev && Array.isArray(prev[type]) ? prev[type] : [])) {
      if (e && typeof e.tmdbId === 'number') byId.set(e.tmdbId, { ...e });
    }
    // Fresh-buzz refresh: any state title appearing in today's fetched
    // items resets its clock (even when Groq did not rank it — the
    // ranked list caps at 15, so a still-discussed title can miss it).
    for (const e of byId.values()) {
      if (fetched.some((t) => matchesBuzzTitle(t, e.title, mediaType))) {
        if (e.lastBuzz !== todayStr) report.refreshed[type]++;
        e.lastBuzz = todayStr;
      }
    }
    // Fresh row titles upsert (lastBuzz = today, rank = Groq rank).
    for (const f of (fresh && Array.isArray(fresh[type]) ? fresh[type] : [])) {
      if (!f || typeof f.tmdbId !== 'number' || !f.imdbId) continue;
      const old = byId.get(f.tmdbId);
      byId.set(f.tmdbId, {
        tmdbId: f.tmdbId, imdbId: f.imdbId, title: f.title,
        firstSeen: old ? old.firstSeen : todayStr, lastBuzz: todayStr, rank: f.rank,
      });
    }
    // Seed insert (first run only — never overwrites an existing entry).
    for (const s of (seeded && Array.isArray(seeded[type]) ? seeded[type] : [])) {
      if (!s || typeof s.tmdbId !== 'number' || !s.imdbId) continue;
      if (!byId.has(s.tmdbId)) {
        byId.set(s.tmdbId, {
          tmdbId: s.tmdbId, imdbId: s.imdbId, title: s.title,
          firstSeen: todayStr, lastBuzz: todayStr, rank: s.rank, seeded: true,
        });
        report.seeded[type]++;
      }
    }
    // Prune: no fresh buzz for more than 3 days -> out of the memory.
    const kept = [];
    for (const e of byId.values()) {
      if (daysBetween(e.lastBuzz, todayStr) <= BUZZ_CARRY_DAYS) kept.push(e);
      else report.expired[type]++;
    }
    kept.sort((a, b) => (a.rank - b.rank) || String(a.title).localeCompare(String(b.title)));
    next[type] = kept.slice(0, BUZZ_STATE_MAX_PER_TYPE);
    report.stored[type] = next[type].length;
  }
  return { state: next, report };
}

module.exports = {
  GROQ_MODEL, BUZZ_MAX_RANKED, REDDIT_SUBS, YOUTUBE_QUERIES, NEWS_QUERIES,
  fetchBuzzItems, fetchReddit, fetchRedditToken, fetchYouTube, fetchNews,
  parseRedditHot, parseYouTubeSearch, extractYtInitialData, parseNewsRss,
  groqAnalyze, parseGroqResponse, normalizeTitle, matchTmdbTitle, buzzFloorPass,
  BUZZ_STATE_PATHNAME, BUZZ_CARRY_DAYS, BUZZ_STATE_MAX_PER_TYPE,
  daysBetween, isCarryFresh, validateBuzzState, matchesBuzzTitle,
  mergeBuzzRows, updateBuzzState,
};
