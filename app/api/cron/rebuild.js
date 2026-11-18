// Vercel Cron endpoint: GET /api/cron/rebuild (daily, see vercel.json).
// Runs the catalog builder and writes rows to Vercel Blob. On any failure
// it writes nothing — yesterday's files keep serving (§6.3).
// With TMDB_API_KEY missing: 200 { skipped: true } — never crashes, never
// fakes rows. The key is read ONLY from the environment; it is never
// written to any file, log, or response by this endpoint.

'use strict';

const { main } = require('../../scripts/build-catalogs');

module.exports = async (req, res) => {
  // Vercel Cron sends an Authorization: Bearer <CRON_SECRET> header when a
  // CRON_SECRET env var is set; accept the call either way in v1 (the
  // endpoint only rebuilds public catalog rows, it exposes no secrets).
  try {
    const result = await main();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error(`[cron/rebuild] FAILED: ${e.message}`);
    res.status(200).json({ ok: false, error: String(e.message) });
  }
};
