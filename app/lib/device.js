// Binge Addon — per-request device detection (v1.2.7).
// One smart addon: the client's User-Agent decides the stream profile
// (desktop / phone / TV). Reuses the v1.1.8 AsyncLocalStorage pattern:
// the stremio-addon-sdk router never passes the raw HTTP request to a
// handler, so an Express middleware stores the UA (+ an optional
// URL-forced profile, e.g. /phone/... or /p/<slug>/...) in an
// AsyncLocalStorage store, and handlers read it back.
// AsyncLocalStorage is per async context: concurrent requests on one
// Vercel instance cannot leak into each other, and a caller outside
// any request (tests, direct handler calls) simply gets the default.
// Unknown/missing UA -> desktop (the v1.2.4 behaviour, byte-identical).
'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const store = new AsyncLocalStorage();

const PROFILE_IDS = ['desktop', 'phone', 'tv'];

// TV first: Android TV UAs contain "Android", so the TV check must run
// before the phone check. Fire TV boxes send no "Fire TV" token — only
// their model code (AFTKA / AFTMM / AFTSS / AFTBAM ...), matched by the
// \bAFT... token below.
const TV_RE = /android tv|google ?tv|googletv|smart[ -]?tv|fire ?tv|\baft[a-z]{2,}\b|tizen|webos|web0s|netcast|roku|appletv|viera|aquos|bravia|shield|hbbtv|vizio|vidaa|opera tv/i;
const PHONE_RE = /iphone|ipod|ipad|android|windows phone|blackberry|mobile/i;

// Pure function (no ALS) — unit-tested in tests/test-device-profiles.js.
function detectDevice(ua) {
  if (!ua || typeof ua !== 'string') return 'desktop';
  if (TV_RE.test(ua)) return 'tv';
  if (PHONE_RE.test(ua)) return 'phone';
  return 'desktop';
}

// Run `fn` inside a request context carrying this request's UA and an
// optional URL-forced profile. Used as Express middleware.
function runWithRequest(req, forcedProfile, fn) {
  const ua = (req && req.headers && typeof req.headers['user-agent'] === 'string')
    ? req.headers['user-agent']
    : '';
  const forced = (typeof forcedProfile === 'string' && forcedProfile) ? forcedProfile : null;
  return store.run({ userAgent: ua, forcedProfile: forced }, fn);
}

// Effective profile id for the current request: a URL-forced profile
// (/phone/..., /tv/..., /p/<slug>/...) wins; otherwise UA detection;
// unknown/missing UA -> desktop.
function getProfile() {
  const ctx = store.getStore();
  if (ctx && ctx.forcedProfile) return ctx.forcedProfile;
  return detectDevice(ctx && ctx.userAgent);
}

module.exports = { PROFILE_IDS, detectDevice, runWithRequest, getProfile };
