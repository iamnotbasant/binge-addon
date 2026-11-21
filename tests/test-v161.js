// Binge Addon — v1.6.1 GitHub bundle store tests (basant, 20 Nov 2026:
// Vercel BLOCKED the Blob store (HTTP 403 "Your store is blocked" on
// every read) — Hobby Advanced Operations 2,102/2,000, access resumes
// 12/20/26. Every catalog returned { metas: [] } and Nuvio Home went
// empty, even though the code, the manifests (1.6.0) and the streams
// were all fine. Fix: the catalog bundle + buzz state move to GitHub
// — reads from raw.githubusercontent.com (free, no quota, public
// repo), writes through the GitHub Contents API with GITHUB_TOKEN.
// Blob stays as the read/write fallback. The 19 Nov rejection of
// GitHub (commit-token problem) no longer applies: basant approved
// the token step on 20 Nov 2026 ("GitHub wala free fix karo").
//
// Covers:
// (0) manifest — version 1.6.1, 18 catalogs, id unchanged;
// (1) github-store constants + raw URL shape;
// (2) readGitHubJson — 200 ok, 404 null, throw null, bad JSON null,
//     never throws;
// (3) commitGitHubJson — no token does nothing (no fetch); create
//     (GET 404) sends no sha; update (GET 200) sends the sha; content
//     is base64 JSON; Authorization header set; PUT failure -> ok:false;
// (4) bundle.js readBundle — GitHub FIRST (Blob URL never fetched
//     when GitHub answers), Blob fallback when GitHub 404s.
// Run: node tests/test-v161.js (exit 0 = all pass)
'use strict';

const { MANIFEST, catalogs } = require('../app/lib/manifest');
const gh = require('../app/lib/github-store');
const { readBundle, invalidateBundleCache } = require('../app/lib/bundle');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

// ---------------------------------------------------------------------------
// 0. Manifest
// ---------------------------------------------------------------------------
console.log('=== 0. Manifest ===');
{
  const list = catalogs();
  eq(MANIFEST.id, 'com.bharatstreams', 'manifest id unchanged (no reinstall)');
  eq(MANIFEST.version, '1.6.3', 'manifest version 1.6.1');
  eq(list.length, 18, '18 catalogs (no row added or removed)');
}

// ---------------------------------------------------------------------------
// 1. github-store constants + raw URL
// ---------------------------------------------------------------------------
console.log('=== 1. github-store constants ===');
{
  eq(gh.GH_OWNER, 'iamnotbasant', 'owner iamnotbasant');
  eq(gh.GH_REPO, 'binge-addon', 'repo binge-addon');
  eq(gh.GH_BRANCH, 'main', 'branch main');
  eq(gh.GH_BUNDLE_PATH, 'app/data/_bundle.json', 'bundle path under app/data');
  eq(gh.GH_BUZZ_PATH, 'app/data/buzz-state.json', 'buzz-state path under app/data');
  eq(gh.rawUrl(gh.GH_BUNDLE_PATH),
    'https://raw.githubusercontent.com/iamnotbasant/binge-addon/main/app/data/_bundle.json',
    'raw bundle URL is the public CDN URL (no token, no quota)');
  eq(gh.apiUrl(gh.GH_BUNDLE_PATH),
    'https://api.github.com/repos/iamnotbasant/binge-addon/contents/app/data/_bundle.json',
    'contents API URL for the bundle');
}

(async () => {
  // -------------------------------------------------------------------------
  // 2. readGitHubJson — never throws
  // -------------------------------------------------------------------------
  console.log('=== 2. readGitHubJson ===');
  {
    const okFetch = async () => ({ ok: true, status: 200, json: async () => ({ rows: { a: 1 } }) });
    eq(JSON.stringify(await gh.readGitHubJson(gh.GH_BUNDLE_PATH, okFetch)), '{"rows":{"a":1}}',
      '200 with valid JSON returns the object');

    const nfFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    eq(await gh.readGitHubJson(gh.GH_BUNDLE_PATH, nfFetch), null, '404 returns null');

    const throwFetch = async () => { throw new Error('network down'); };
    eq(await gh.readGitHubJson(gh.GH_BUNDLE_PATH, throwFetch), null, 'fetch throw returns null (never throws)');

    const badFetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
    eq(await gh.readGitHubJson(gh.GH_BUNDLE_PATH, badFetch), null, 'unparseable body returns null');
  }

  // -------------------------------------------------------------------------
  // 3. commitGitHubJson — create vs update, auth, failure
  // -------------------------------------------------------------------------
  console.log('=== 3. commitGitHubJson ===');
  {
    const calls = [];
    const mkFetch = (getRes, putStatus) => async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body || null });
      if ((opts.method || 'GET') === 'GET') return getRes;
      return { ok: putStatus >= 200 && putStatus < 300, status: putStatus, json: async () => ({}) };
    };
    const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64');

    // (a) no token — fetch never called
    calls.length = 0;
    const noTok = await gh.commitGitHubJson(gh.GH_BUNDLE_PATH, { rows: {} }, 'msg', null, mkFetch(null, 200));
    eq(noTok.ok, false, 'no token -> ok:false');
    eq(noTok.reason, 'no-token', 'no token -> reason no-token');
    eq(calls.length, 0, 'no token -> fetch never called');

    // (b) create (GET 404) — PUT has no sha, content is base64 JSON
    calls.length = 0;
    const get404 = { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
    const created = await gh.commitGitHubJson(gh.GH_BUNDLE_PATH, { rows: { x: 1 } }, 'chore: test', 'tok123', mkFetch(get404, 201));
    eq(created.ok, true, 'create -> ok:true');
    eq(created.created, true, 'create -> created:true');
    eq(calls.length, 2, 'create -> GET + PUT');
    eq(calls[0].method, 'GET', 'create -> first call is GET (sha lookup)');
    eq(calls[1].method, 'PUT', 'create -> second call is PUT');
    const putBody = JSON.parse(calls[1].body);
    eq(putBody.sha, undefined, 'create -> PUT body has NO sha');
    eq(JSON.parse(Buffer.from(putBody.content, 'base64').toString('utf8')).rows.x, 1,
      'create -> PUT content is base64 of the object');
    eq(calls[1].headers.Authorization, 'Bearer tok123', 'PUT carries the Bearer token');
    eq(putBody.branch, 'main', 'PUT targets main');

    // (c) update (GET 200 with sha) — PUT carries the sha
    calls.length = 0;
    const get200 = {
      ok: true, status: 200,
      json: async () => ({ sha: 'abc123', content: b64({ rows: {} }) }),
    };
    const updated = await gh.commitGitHubJson(gh.GH_BUNDLE_PATH, { rows: { y: 2 } }, 'chore: test', 'tok123', mkFetch(get200, 200));
    eq(updated.ok, true, 'update -> ok:true');
    eq(updated.created, false, 'update -> created:false');
    eq(JSON.parse(calls[1].body).sha, 'abc123', 'update -> PUT body carries the existing sha');

    // (d) PUT failure -> ok:false
    const failed = await gh.commitGitHubJson(gh.GH_BUNDLE_PATH, { rows: {} }, 'chore: test', 'tok123', mkFetch(get404, 500));
    eq(failed.ok, false, 'PUT 500 -> ok:false');
    eq(failed.reason, 'http-500', 'PUT 500 -> reason http-500');
  }

  // -------------------------------------------------------------------------
  // 4. bundle.js readBundle — GitHub first, Blob fallback
  // -------------------------------------------------------------------------
  console.log('=== 4. readBundle: GitHub first, Blob fallback ===');
  {
    const ghBundle = { version: 1, builtAt: '2026-11-20T00:00:00.000Z', hash: 'gh', rows: { 'trending-indian-movie': { metas: [{ id: 'tt1', name: 'GitHub Row' }], builtAt: '2026-11-20T00:00:00.000Z' } }, idmap: {} };
    const blobBundle = { version: 1, builtAt: '2026-11-19T00:00:00.000Z', hash: 'blob', rows: { 'trending-indian-movie': { metas: [{ id: 'tt2', name: 'Blob Row' }], builtAt: '2026-11-19T00:00:00.000Z' } }, idmap: {} };
    const realFetch = global.fetch;

    // Case A: GitHub answers — Blob must NEVER be fetched.
    let ghMode = 'ok';
    const callsA = [];
    global.fetch = async (url) => {
      callsA.push(url);
      if (url.startsWith('https://raw.githubusercontent.com/')) {
        return ghMode === 'ok'
          ? { ok: true, status: 200, json: async () => ghBundle }
          : { ok: false, status: 404, json: async () => ({}) };
      }
      throw new Error(`unexpected fetch (must not happen in case A): ${url}`);
    };
    invalidateBundleCache();
    const a = await readBundle();
    eq(a && a.hash, 'gh', 'GitHub bundle wins when it answers');
    eq(a.rows['trending-indian-movie'].metas[0].name, 'GitHub Row', 'row comes from GitHub');
    check(callsA.length === 1 && callsA[0].startsWith('https://raw.githubusercontent.com/'),
      'Blob URL never fetched when GitHub answers (0 Advanced requests)');

    // Case B: GitHub 404s — falls back to the Blob direct URL.
    ghMode = '404';
    const callsB = [];
    global.fetch = async (url) => {
      callsB.push(url);
      if (url.startsWith('https://raw.githubusercontent.com/')) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (url.includes('public.blob.vercel-storage.com')) {
        return { ok: true, status: 200, json: async () => blobBundle };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    invalidateBundleCache();
    const b = await readBundle();
    eq(b && b.hash, 'blob', 'Blob bundle is the fallback when GitHub 404s');
    eq(b.rows['trending-indian-movie'].metas[0].name, 'Blob Row', 'row comes from Blob in fallback');
    check(callsB.some((u) => u.includes('public.blob.vercel-storage.com')),
      'Blob direct URL is fetched in the fallback path');

    global.fetch = realFetch;
  }

  console.log(fail === 0 ? '\nALL v1.6.1 TESTS PASSED' : `\n${fail} v1.6.1 TEST(S) FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})();
