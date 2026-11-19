// Binge Addon — Vercel Blob direct-URL reads (v1.2.8).
//
// Why: the free Hobby Blob allowance is 2,000 ADVANCED requests/month
// (list/put/copy/delete) and Vercel emailed 19 Nov 2026 that we had
// used 75% (1,500/2,000) with 500 left, one day after the store was
// created. Every catalog read did a list() — 27 list calls per full
// catalog load on a cold serverless instance, plus one per id-map,
// config, profiles and _summary read. At 100% on Hobby there is no
// bill and no way to buy more: Blob access blocks until the ~30-day
// window resets (~18 Dec) unless upgraded to Pro.
//
// The fix: read each file by its DIRECT PUBLIC URL instead of list().
// The rebuild writes with addRandomSuffix: false, so every file's
// public URL is deterministic:
//   https://<store-host>.public.blob.vercel-storage.com/<pathname>
// A plain GET of a public Blob URL is a SIMPLE request, not an
// advanced one, so reads stop burning the 2,000/month allowance.
// v1.2.9: the remaining burn is now ~1 put/day (the daily rebuild
// writes ONE bundle file, catalogs/_bundle.json — see lib/bundle.js),
// 0 on days the bundle content is unchanged (hash-skip). The old
// ~29 puts/day (27 rows + idmap + summary) are gone.
//
// The store host is VERIFIED, not assumed: on 19 Nov 2026
//   https://drqjSj6Uy2iBuItV.public.blob.vercel-storage.com/catalogs/trending-indian-movie.json
// returned HTTP 200 with the real row (20 metas, builtAt
// 2026-11-19T05:23:49Z). The host is the store id
// (store_drqjSj6Uy2iBuItV, DEPLOY.md) minus the `store_` prefix.
// NOTE: the full `store_...` id as the subdomain 400s
// ("Store ID not found") — the prefix must be stripped.
//
// Safety: if the direct URL is ever wrong (store recreated, host
// changed), the code MUST fall back to list() — otherwise reads break.
// readBlobJson() does exactly that: direct first, list() on any
// direct miss. The fallback is the verbatim pre-1.2.8 code path, so a
// wrong direct assumption costs one extra fetch per read and zero
// breakage. Host-level direct failures (400/403/5xx/network) are
// remembered for the life of the instance so we don't pay a failed
// fetch on every read; a 404 is NOT remembered (it usually means the
// file genuinely doesn't exist yet, e.g. before the first rebuild).

'use strict';

// Public host of the Blob store — verified live 19 Nov 2026 (see header).
const VERIFIED_PUBLIC_HOST = 'drqjSj6Uy2iBuItV.public.blob.vercel-storage.com';

// Best-effort: derive the host from the runtime read-write token, whose
// raw form embeds the store id (vercel_blob_rw_store_<host>_<secret>).
// This CANNOT be verified from outside the runtime — the Vercel API
// only returns the ENCRYPTED env value — so a parse miss simply falls
// through to the verified host below. If the store is ever recreated,
// the token changes with it and this parse self-heals; the hardcoded
// host would go stale, but the list() fallback still saves reads.
function hostFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  const m = /^vercel_blob_rw_store_([A-Za-z0-9]+)_/.exec(token);
  return m ? `${m[1]}.public.blob.vercel-storage.com` : null;
}

function publicBaseUrl() {
  const env = (process.env.BLOB_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  const fromToken = hostFromToken(process.env.BLOB_READ_WRITE_TOKEN);
  if (fromToken) return `https://${fromToken}`;
  return `https://${VERIFIED_PUBLIC_HOST}`;
}

// True once a direct fetch fails at the HOST level (not a 404): the
// store host is wrong for this instance, so skip straight to list().
let directBroken = false;

async function fetchDirect(pathname) {
  // Returns { ok: true, json } on a successful direct read,
  // { ok: false } on any miss (caller falls back to list()).
  if (directBroken) return { ok: false };
  try {
    const res = await fetch(`${publicBaseUrl()}/${pathname}`);
    if (!res.ok) {
      if (res.status !== 404) directBroken = true;
      return { ok: false };
    }
    return { ok: true, json: await res.json() };
  } catch (e) {
    directBroken = true;
    return { ok: false };
  }
}

// list() fallback — the pre-1.2.8 path, kept verbatim so a wrong
// direct-URL assumption can never break reads. Costs one ADVANCED
// request per call; only reached when the direct read misses.
async function fetchViaList(pathname) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const { list } = require('@vercel/blob');
  const { blobs } = await list({ prefix: pathname, token });
  const file = (blobs || []).find((b) => b.pathname === pathname);
  if (!file) return null;
  const res = await fetch(file.url);
  if (!res.ok) return null;
  return res.json();
}

// Read one Blob JSON file by direct public URL, falling back to list().
// Returns the parsed JSON, or null when the file does not exist / the
// store is unreachable. Never throws.
async function readBlobJson(pathname) {
  try {
    const direct = await fetchDirect(pathname);
    if (direct.ok) return direct.json;
  } catch (e) {
    // fetchDirect already degrades to { ok: false }; this is belt-and-braces.
  }
  try {
    return await fetchViaList(pathname);
  } catch (e) {
    console.log(`[binge-addon] blob read failed for ${pathname}: ${e.message}`);
    return null;
  }
}

module.exports = { readBlobJson, publicBaseUrl, hostFromToken };
