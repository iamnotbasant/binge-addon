// Binge Addon — per-request context (v1.1.8).
// The stremio-addon-sdk router calls handlers with (resource, type, id,
// extra, config) only — the raw HTTP request (and its User-Agent) never
// reaches a handler. So an Express middleware stores the request's
// User-Agent in an AsyncLocalStorage store, and the stream handler reads
// it back. AsyncLocalStorage is per async context: concurrent requests
// on one Vercel instance cannot leak into each other, and a caller
// outside any request (tests, direct handler calls) simply gets the
// default (no UA -> not Windows -> flags, the v1.1.5 behaviour).
'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const store = new AsyncLocalStorage();

// Run `fn` inside a request context carrying this request's UA.
// Used as Express middleware: runWithRequest(req, next).
function runWithRequest(req, fn) {
  const ua = (req && req.headers && typeof req.headers['user-agent'] === 'string')
    ? req.headers['user-agent']
    : '';
  return store.run({ userAgent: ua }, fn);
}

// True when the current request came from a Windows client
// (case-insensitive "Windows" substring in the User-Agent — covers
// "Windows NT 10.0"; a Windows Phone UA also contains "Windows", so
// it matches too — acceptable, it is also a no-flag-emoji client.
// Android/iOS/macOS/Linux UAs contain no "Windows" substring and
// keep flags).
function isWindowsClient() {
  const ctx = store.getStore();
  if (!ctx || !ctx.userAgent) return false;
  return /windows/i.test(ctx.userAgent);
}

module.exports = { runWithRequest, isWindowsClient };
