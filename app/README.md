# Bharat Streams — app

Fresh Node.js + `stremio-addon-sdk` Stremio addon. No code copied from any
existing addon.

## Layout

- `index.js` — addon builder (manifest, catalog + stream handlers) + Express
  app. Run locally: `npm install && npm start` (PORT, default 7000).
- `api/index.js` — Vercel serverless entry (re-exports the Express app).
- `api/cron/rebuild.js` — daily cron endpoint, runs the catalog builder.
- `lib/manifest.js` — manifest: 24 catalogs, `idPrefixes: ["tt"]` on stream.
- `lib/sources.js` — fan-out to Torrentio / Comet / HdHub (3.5 s per source,
  ~7 s overall deadline, circuit-breaker, `DISABLE_SOURCES` env flag).
- `lib/parse.js` — per-source parsing, §7.4 filters, §7.5 sort, §7.6 format.
- `lib/store.js` — catalog rows read from Vercel Blob (one JSON per catalog).
- `scripts/build-catalogs.js` — TMDB → Blob daily rebuild (`TMDB_API_KEY`
  from env; missing key → logs "no key, skipping", exit 0, no fake rows).
- `vercel.json` — daily cron 05:00 UTC, 10 s function limits.

## Env vars (Vercel project settings)

- `TMDB_API_KEY` — basant creates it; set by the parent agent in Vercel.
  Left unset until then (catalogs return empty, streams unaffected).
- `BLOB_READ_WRITE_TOKEN` — from the Vercel Blob store (created at deploy).
- `DISABLE_SOURCES` — optional, comma list (e.g. `comet`) for failure testing.

## Deploy

See `../DEPLOY.md` — currently blocked on Vercel team-scope authorization.
