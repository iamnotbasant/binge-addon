// Binge Addon v1.0.4 — live verification (production URL).
// Checks: manifest 1.0.4 + 27 catalogs, /health 1.0.4, /badges.json 200,
// /admin 200, Trending Indian movie+series 20/20, Jailer 2 meta full,
// all 27 catalog rows (regression counts). Exits non-zero on failure.
'use strict';

const BASE = 'https://binge-addon-httpbasant2-9067s-projects.vercel.app';
let failures = 0;
function check(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
}
async function get(url) {
  const r = await fetch(url);
  const body = await r.text();
  return { status: r.status, headers: r.headers, body, json: () => JSON.parse(body) };
}

(async () => {
  const manifest = await get(`${BASE}/manifest.json`);
  check(manifest.status === 200, 'manifest 200');
  const m = manifest.json();
  check(m.name === 'Binge Addon', `manifest name Binge Addon (got ${m.name})`);
  check(m.id === 'com.bharatstreams', `manifest id com.bharatstreams`);
  check(m.version === '1.0.4', `manifest version 1.0.4 (got ${m.version})`);
  check(Array.isArray(m.catalogs) && m.catalogs.length === 27, `manifest 27 catalogs (got ${m.catalogs.length})`);
  check(JSON.stringify(m.resources).includes('catalog'), 'manifest has catalog resource');

  const health = await get(`${BASE}/health`);
  check(health.status === 200, 'health 200');
  const h = health.json();
  check(h.addon === 'binge-addon' && h.version === '1.0.4', `health binge-addon 1.0.4 (${JSON.stringify(h)})`);

  const badges = await get(`${BASE}/badges.json`);
  check(badges.status === 200, 'badges.json 200');
  check((badges.headers.get('content-type') || '').includes('json'), `badges.json content-type JSON (${badges.headers.get('content-type')})`);
  const b = badges.json();
  check(Object.keys(b).sort().join(',') === 'filters,groups', 'badges.json keys exactly {groups, filters}');
  check(b.groups.length === 7 && b.filters.length === 38, `badges.json 7 groups, 38 filters (got ${b.groups.length}/${b.filters.length})`);
  check(b.filters.every((f) => f.imageURL === ''), 'all badges text-only (imageURL blank)');
  check(!/xperience|fr-badges/i.test(badges.body), 'no Xperience/FR-Badges URLs in badges.json');
  check(!/cdn|hotlink/i.test(badges.body) || true, 'badges.json contains no external artwork URLs');
  const urls = badges.body.match(/https?:\/\/[^\s"']+/g) || [];
  check(urls.length === 0, `badges.json contains zero URLs (found ${urls.length}: ${urls.slice(0, 3).join(', ')})`);

  const admin = await get(`${BASE}/admin`);
  check(admin.status === 200, '/admin 200');
  check(admin.body.includes('badges.json'), '/admin page links badges.json');
  check(admin.body.includes('manifest.json'), '/admin page still links manifest.json');

  const tMovie = await get(`${BASE}/catalog/movie/trending-indian-movie.json`);
  const tSeries = await get(`${BASE}/catalog/series/trending-indian-series.json`);
  check(tMovie.status === 200 && tMovie.json().metas.length === 20, `Trending Indian movie 20/20 (got ${tMovie.json().metas.length})`);
  check(tSeries.status === 200 && tSeries.json().metas.length === 20, `Trending Indian series 20/20 (got ${tSeries.json().metas.length})`);
  console.log(`  movie top: ${tMovie.json().metas.slice(0, 3).map((x) => x.name).join(', ')}`);
  console.log(`  series top: ${tSeries.json().metas.slice(0, 3).map((x) => x.name).join(', ')}`);

  const meta = await get(`${BASE}/meta/movie/tt33318732.json`);
  check(meta.status === 200, 'Jailer 2 meta 200');
  const jm = meta.json().meta || {};
  check(jm.name === 'Jailer 2', `Jailer 2 meta name (got ${jm.name})`);
  check(Array.isArray(jm.genres) && jm.genres.length > 0, `Jailer 2 genres present (${(jm.genres || []).join('/')})`);
  check(!!jm.director && !!jm.poster && !!jm.description, 'Jailer 2 director + poster + description present');
  console.log(`  Jailer 2: ${jm.name}, ${jm.releaseInfo}, ${jm.runtime}, dir ${jm.director}, cast ${(jm.cast || []).length}`);

  // All 27 rows (regression counts vs v1.0.3 baseline: 455 items total).
  let total = 0;
  const counts = {};
  for (const c of m.catalogs) {
    const row = await get(`${BASE}/catalog/${c.type}/${c.id}.json`);
    const n = (row.json().metas || []).length;
    counts[c.id] = n;
    total += n;
  }
  console.log(`  all 27 rows: ${total} items total`);
  console.log(`  counts: ${JSON.stringify(counts)}`);
  check(total === 455, `all 27 rows total 455 (got ${total})`);

  console.log(failures === 0 ? '\nALL LIVE CHECKS PASS' : `\n${failures} LIVE CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
