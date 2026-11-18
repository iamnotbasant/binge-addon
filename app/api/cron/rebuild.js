// Vercel Cron endpoint: GET /api/cron/rebuild (daily, see vercel.json).
// Runs the catalog builder and writes rows to Vercel Blob. On any failure
// it writes nothing — yesterday's files keep serving (§6.3).
// With TMDB_API_KEY missing: 200 { skipped: true } — never crashes, never
// fakes rows. The key is read ONLY from the environment; it is never
// written to any file, log, or response by this endpoint.

'use strict';

const { main } = require('../../scripts/build-catalogs');

module.exports = async (req, res) => {
  // v1.0.9: strict Bearer guard — Vercel Cron sends
  // Authorization: Bearer <CRON_SECRET> automatically when the
  // CRON_SECRET env var is set (vercel.com/docs/cron-jobs/manage-cron-jobs).
  // Any call without the matching header is rejected with 401 and the
  // rebuild never runs. Matches the guard in app/index.js (which is
  // unreachable for this path: Vercel routes file functions first).
  const auth = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized cron trigger' });
  }
  try {
    const result = await main();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error(`[cron/rebuild] FAILED: ${e.message}`);
    res.status(200).json({ ok: false, error: String(e.message) });
  }
};
