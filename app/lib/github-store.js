// Binge Addon — catalog bundle store on GitHub (v1.6.1).
//
// Why: on 20 Nov 2026 Vercel BLOCKED the Blob store `bharat-streams`
// (HTTP 403 "Your store is blocked" on every read) — the Hobby plan's
// Blob Advanced Operations allowance ran out (2,102 / 2,000), so every
// catalog read returned null and Nuvio Home went empty. Access resumes
// only on 12/20/26 unless the team upgrades to Pro. The 19 Nov
// evaluation (lib/bundle.js) had already rejected GitHub for the
// commit-token problem — but with Blob blocked, a token the user
// creates once is cheaper than a month of empty rows or $20/month.
//
// How it works:
//   READ (app):  raw.githubusercontent.com — a plain GET, free, no
//     quota, CDN-cached ~5 min (matches the in-app 5-min bundle
//     cache). The repo is public, so no token is needed to read.
//   WRITE (rebuild cron): GitHub Contents API — GET the file (for its
//     `sha` + current content, used for the hash-skip) then PUT the new
//     content (base64). Needs `GITHUB_TOKEN` in Vercel env vars: a
//     fine-grained PAT with Contents read+write on
//     iamnotbasant/binge-addon (or a classic PAT with `repo` scope).
//     Without the token the rebuild falls back to the Blob put —
//     which fails while the store is blocked, and the rebuild logs it
//     instead of crashing.
//   BLOB stays as the read fallback (bundle.js) and the write
//   fallback (build-catalogs.js): if GitHub ever goes down, the old
//   path still serves once the store unblocks on 12/20/26.
// Never throws: every function returns null / { ok: false } on
// failure, so a store outage can never break the addon or the rebuild.

'use strict';

const GH_OWNER = 'iamnotbasant';
const GH_REPO = 'binge-addon';
const GH_BRANCH = 'main';
// Data files live under app/ so they sit next to the code that reads
// them; they are NOT served by the Vercel deployment (the app reads
// them from raw.githubusercontent.com, never from its own bundle).
const GH_BUNDLE_PATH = 'app/data/_bundle.json';
const GH_BUZZ_PATH = 'app/data/buzz-state.json';

function rawUrl(path) {
  return `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${path}`;
}

function apiUrl(path) {
  return `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;
}

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

// Read a JSON file from the repo via the raw CDN. No token needed
// (public repo). Returns the parsed JSON, or null on any failure.
async function readGitHubJson(path, fetchImpl) {
  const f = fetchImpl || global.fetch;
  const { signal, done } = withTimeout(6000);
  try {
    const res = await f(rawUrl(path), { signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    done();
  }
}

// Fetch a file through the Contents API: { sha, content } on 200,
// { sha: null, content: null } on 404 (file does not exist yet),
// null on any other failure. `content` is the parsed JSON.
async function getGitHubFile(path, token, fetchImpl) {
  if (!token) return null;
  const f = fetchImpl || global.fetch;
  const { signal, done } = withTimeout(10000);
  try {
    const res = await f(apiUrl(path), {
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (res.status === 404) return { sha: null, content: null };
    if (!res.ok) return null;
    const json = await res.json();
    let content = null;
    try {
      content = JSON.parse(Buffer.from(json.content || '', 'base64').toString('utf8'));
    } catch (e) {
      content = null;
    }
    return { sha: json.sha || null, content };
  } catch (e) {
    return null;
  } finally {
    done();
  }
}

// Create or update a JSON file through the Contents API. Returns
// { ok: true, created: bool } or { ok: false, reason }.
// Never throws; without a token it does nothing (reason 'no-token').
async function commitGitHubJson(path, obj, message, token, fetchImpl) {
  if (!token) return { ok: false, reason: 'no-token' };
  const f = fetchImpl || global.fetch;
  const prev = await getGitHubFile(path, token, f);
  if (prev === null) return { ok: false, reason: 'read-failed' };
  const body = {
    message,
    content: Buffer.from(JSON.stringify(obj), 'utf8').toString('base64'),
    branch: GH_BRANCH,
  };
  if (prev.sha) body.sha = prev.sha;
  const { signal, done } = withTimeout(15000);
  try {
    const res = await f(apiUrl(path), {
      method: 'PUT',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.status !== 200 && res.status !== 201) {
      return { ok: false, reason: `http-${res.status}` };
    }
    return { ok: true, created: !prev.sha };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e).slice(0, 120) };
  } finally {
    done();
  }
}

module.exports = {
  GH_OWNER, GH_REPO, GH_BRANCH, GH_BUNDLE_PATH, GH_BUZZ_PATH,
  rawUrl, apiUrl, readGitHubJson, getGitHubFile, commitGitHubJson,
};
