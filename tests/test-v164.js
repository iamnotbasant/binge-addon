// Binge Addon — v1.6.4 seeder floor (basant, 21 Nov 2026).
//
// Ready Player One (laptop): Nuvio stuck at "Fetching torrent
// metadata… · 0 seeds · 0 peers · 0 B/s" — the torrent never opens.
// Live check: the addon's RPO torrent rows had 4, 14 and 2 seeders
// (2.63 GB WEB-DL, 3.07 GB WEB-DL, 6.75 GB BluRay). A 2–4 seeder
// torrent is effectively dead — Nuvio finds no peers for it — but
// the old rule only dropped EXACTLY-0 seeders, so the 2- and
// 4-seeder rows were served and wasted his click.
//
// Fix: a minimum-seeder floor (MIN_SEEDERS = 5) in
// processSourceStreams, clean pool and CAM pool alike: drop
// sub-5-seeders when a ≥5-seeder alternative exists in the same
// source batch. Fail-open: if nothing in the batch reaches 5, keep
// everything (a rare title's only torrent may have 2 seeders —
// showing it beats showing nothing). Unknown seeders (null — no
// 👤 marker, e.g. direct HTTP links) are never dropped.
//
// Covers:
// (0) manifest — version 1.6.4, 18 catalogs, id unchanged;
// (1) floor units — <5 dropped with a ≥5 present; fail-open when
//     none reaches 5; null seeders kept; 0-seeders dropped (old
//     behaviour preserved); boundary 5 kept / 4 dropped;
// (2) CAM pool floor — same rule inside the CAM pool;
// (3) RPO end-to-end (desktop, exact live fixtures 21 Nov): the
//     4- and 2-seeder torrents go, the 14-seeder torrent stays,
//     the HdHub pixeldrain direct link stays first;
// (4) no-op guard — a batch where every torrent has ≥5 seeders
//     keeps everything (dropped.lowSeeder unset).
// Run: node tests/test-v164.js (exit 0 = all pass)
'use strict';

const { MANIFEST, catalogs } = require('../app/lib/manifest');
const { DEFAULT_PROFILES } = require('../app/lib/profiles');
const { processSourceStreams, compareWithProfile, compareCamWithProfile } = require('../app/lib/parse');
const { mergeStreamResults } = require('../app/lib/sources');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const desk = { maxRes: DEFAULT_PROFILES.desktop.maxRes, profileCfg: DEFAULT_PROFILES.desktop };
const deskCmps = {
  compare: (a, b) => compareWithProfile(a, b, DEFAULT_PROFILES.desktop),
  compareCam: (a, b) => compareCamWithProfile(a, b, DEFAULT_PROFILES.desktop),
};

// Synthetic Torrentio-like row: distinct size per row so nothing
// dedupes; Hindi+English flags so the language verdict keeps it.
const mk = (seeders, sizeGb, tag) => ({
  name: 'Torrentio\n1080p',
  title: `Movie 2026 1080p BluRay x265 ${tag}\n👤 ${seeders} 💾 ${sizeGb} GB ⚙️ ThePirateBay\n🇬🇧 / 🇮🇳`,
  infoHash: `aa${String(seeders).padStart(2, '0')}${tag.replace(/\W/g, '').slice(0, 6)}0000000000000000000000000000`.slice(0, 40),
  fileIdx: 0,
  behaviorHints: { bingeGroup: 'torrentio|1080p|BluRay', filename: `Movie.2026.1080p.BluRay.${tag}.mkv` },
});
const mkNoSeeders = (sizeGb, tag) => ({
  name: 'Torrentio\n1080p',
  title: `Movie 2026 1080p BluRay x265 ${tag}\n💾 ${sizeGb} GB ⚙️ ThePirateBay\n🇬🇧 / 🇮🇳`,
  infoHash: `bb${tag.replace(/\W/g, '').slice(0, 6)}000000000000000000000000000000`.slice(0, 40),
  fileIdx: 0,
  behaviorHints: { bingeGroup: 'torrentio|1080p|BluRay', filename: `Movie.2026.1080p.BluRay.${tag}.mkv` },
});
const mkCam = (seeders, sizeGb, tag) => ({
  name: 'Torrentio\nCAM',
  title: `Movie 2026 CAM 1080p ${tag}\n👤 ${seeders} 💾 ${sizeGb} GB ⚙️ EXT\n🇬🇧 / 🇮🇳`,
  infoHash: `cc${String(seeders).padStart(2, '0')}${tag.replace(/\W/g, '').slice(0, 6)}0000000000000000000000000000`.slice(0, 40),
  fileIdx: 0,
  behaviorHints: { bingeGroup: 'torrentio|CAM', filename: `Movie.2026.CAM.${tag}.mkv` },
});

// --- (0) manifest ---
console.log('(0) manifest');
eq(MANIFEST.version, '1.6.4', 'manifest version 1.6.4');
eq(MANIFEST.id, 'com.bharatstreams', 'manifest id unchanged');
eq(catalogs().length, 18, '18 catalogs');

// --- (1) floor units (clean pool) ---
console.log('(1) seeder floor units');
{
  const r = processSourceStreams('torrentio', [mk(2, '2.00', 'A'), mk(4, '2.50', 'B'), mk(14, '3.00', 'C')], desk);
  eq(r.kept.length, 1, 'batch [2,4,14] keeps only the 14-seeder row');
  eq(r.kept[0] && r.kept[0].seeders, 14, 'kept row is the 14-seeder one');
  eq(r.dropped.lowSeeder, 2, 'dropped.lowSeeder counts the 2 sub-5 rows');
}
{
  const r = processSourceStreams('torrentio', [mk(2, '2.00', 'A'), mk(3, '2.50', 'B')], desk);
  eq(r.kept.length, 2, 'fail-open: all-<5 batch [2,3] keeps everything');
  check(!r.dropped.lowSeeder, 'fail-open: no lowSeeder drops recorded');
}
{
  const r = processSourceStreams('torrentio', [mkNoSeeders('2.00', 'A'), mk(14, '3.00', 'C')], desk);
  eq(r.kept.length, 2, 'null seeders (no 👤 marker) are never dropped');
}
{
  const r = processSourceStreams('torrentio', [mk(0, '2.00', 'A'), mk(14, '3.00', 'C')], desk);
  eq(r.kept.length, 1, '0-seeder dropped when a seeded alternative exists (old behaviour)');
  eq(r.dropped.lowSeeder, 1, '0-seeder counted in lowSeeder');
}
{
  const r = processSourceStreams('torrentio', [mk(4, '2.00', 'A'), mk(5, '2.50', 'B')], desk);
  eq(r.kept.length, 1, 'boundary: 5 kept, 4 dropped');
  eq(r.kept[0] && r.kept[0].seeders, 5, 'boundary: kept row has exactly 5 seeders');
}

// --- (2) CAM pool floor ---
console.log('(2) CAM pool floor');
{
  const r = processSourceStreams('torrentio', [mkCam(2, '2.00', 'A'), mkCam(14, '3.00', 'C')], desk);
  eq(r.cam.length, 1, 'CAM batch [2,14] keeps only the 14-seeder CAM');
  eq(r.dropped.camLowSeeder, 1, 'dropped.camLowSeeder counts the sub-5 CAM');
  eq(r.kept.length, 0, 'CAM rows never land in the clean pool');
}
{
  const r = processSourceStreams('torrentio', [mkCam(2, '2.00', 'A'), mkCam(3, '2.50', 'B')], desk);
  eq(r.cam.length, 2, 'CAM fail-open: all-<5 CAM batch keeps everything');
}

// --- (3) RPO end-to-end (desktop, exact live fixtures 21 Nov) ---
console.log('(3) RPO end-to-end (exact live fixtures)');
const RPO_TORRENTS = [
  {
    name: 'Torrentio\n1080p',
    title: 'Ready Player One 2018 1080p NF WEB-DL AAC5 1 AV1-Saon\n👤 4 💾 2.63 GB ⚙️ ThePirateBay\n🇬🇧 / 🇮🇳',
    infoHash: 'a69d03f12a33e03687a1165c7d5081a7e2420c47',
    fileIdx: 0,
    behaviorHints: { bingeGroup: 'torrentio|1080p|WEB-DL|av1', filename: 'Ready Player One 2018 1080p NF WEB-DL AAC5 1 AV1-Saon.mkv' },
  },
  {
    name: 'Torrentio\n1080p',
    title: 'Ready Player One 2018 1080p NF WEB-DL DDP5 1 AV1-Saon\n👤 14 💾 3.07 GB ⚙️ ThePirateBay\n🇬🇧 / 🇯🇵 / 🇮🇹 / 🇵🇹 / 🇪🇸 / 🇰🇷 / 🇨🇳 / 🇫🇷 / 🇩🇪 / 🇮🇳 / 🇿🇦 / 🇬🇧 / 🇵🇹 / 🇮🇳 / 🇳🇱 / 🇹🇭 / 🇷🇺 / 🇹🇼 / 🇮🇩 / 🇺🇸',
    infoHash: '840159200d9ec1a63cb6cbf8118a6b671772ff36',
    fileIdx: 0,
    behaviorHints: { bingeGroup: 'torrentio|1080p|WEB-DL|av1', filename: 'Ready Player One 2018 1080p NF WEB-DL DDP5 1 AV1-Saon.mkv' },
  },
  {
    name: 'Torrentio\n1080p',
    title: 'Ready Player One (2018) 1080p 10bit Bluray x265 HEVC [Org DDP 2.…\n👤 2 💾 6.75 GB ⚙️ TorrentGalaxy\nMulti Subs / 🇬🇧 / 🇮🇳',
    infoHash: 'c6e49c71b5e4925107a3a173dce5d12dde10d667',
    fileIdx: 0,
    behaviorHints: { bingeGroup: 'torrentio|1080p|BluRay|hevc|10bit', filename: 'Ready Player One (2018) 1080p 10bit Bluray x265 HEVC [Org DDP 2.0 Hindi + DDP EX 7.1 English] MSubs ~ TombDoc.mkv' },
  },
];
const RPO_HDHUB = [
  {
    name: 'HdHub 1080p',
    description: '[PixelDrain] [💾 2.2GB] Ready.Player.One.2018.1080p.10Bit.BluRay.Hindi.2.0-English.5.1.HEVC.x265-HDHub4u.Tv.mkv\nHindi\npixeldrain | HdHub',
    url: 'https://pixeldrain.dev/api/file/dPUEkHiP?download',
    behaviorHints: { notWebReady: true, videoSize: 2362232013 },
  },
];
{
  const t = processSourceStreams('torrentio', RPO_TORRENTS, desk);
  eq(t.kept.length, 1, 'RPO torrents: only the 14-seeder row survives');
  eq(t.kept[0] && t.kept[0].seeders, 14, 'RPO survivor is the 3.07 GB / 14-seeder WEB-DL');
  eq(t.dropped.lowSeeder, 2, 'RPO torrents: the 4- and 2-seeder rows drop');
  const h = processSourceStreams('hdhub', RPO_HDHUB, desk);
  eq(h.kept.length, 1, 'RPO HdHub direct link untouched by the floor (null seeders)');
  const merged = mergeStreamResults(
    [{ streams: h.kept, cam: h.cam }, { streams: t.kept, cam: t.cam }],
    40, deskCmps,
  );
  eq(merged.parsed.length, 2, 'RPO merged: 2 rows (HdHub direct + one live torrent)');
  check((merged.parsed[0].raw.url || '').includes('pixeldrain'), 'RPO merged #1 is the HdHub pixeldrain direct link');
  eq(merged.parsed[1].seeders, 14, 'RPO merged #2 is the 14-seeder torrent');
}

// --- (4) no-op guard ---
console.log('(4) no-op guard');
{
  const r = processSourceStreams('torrentio', [mk(70, '2.00', 'A'), mk(20, '2.50', 'B'), mk(14, '3.00', 'C')], desk);
  eq(r.kept.length, 3, 'all-≥5 batch keeps everything');
  check(!r.dropped.lowSeeder, 'all-≥5 batch records no lowSeeder drops');
}

console.log(fail === 0 ? 'RESULT: ALL CHECKS PASS' : `RESULT: ${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
