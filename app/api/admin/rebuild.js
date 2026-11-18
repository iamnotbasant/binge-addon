// Dedicated serverless function for manual admin rebuild: POST /api/admin/rebuild
// Authenticated via X-Admin-Password header matching process.env.ADMIN_PASSWORD.
// Max execution duration configured to 300s in vercel.json.

'use strict';

const { main } = require('../../scripts/build-catalogs');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return res.status(503).json({ ok: false, error: 'admin password not configured' });
  }

  if (req.headers['x-admin-password'] !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const result = await main();
    if (result && result.skipped) {
      return res.status(200).json({
        ok: false,
        skipped: true,
        error: result.reason === 'no-blob-token'
          ? 'BLOB_READ_WRITE_TOKEN missing on Vercel'
          : 'TMDB_API_KEY missing on Vercel',
      });
    }
    return res.status(200).json({ ok: true, skipped: false, ...result });
  } catch (e) {
    console.error(`[admin/rebuild] FAILED: ${e.message}`);
    return res.status(500).json({ ok: false, error: String(e.message) });
  }
};
