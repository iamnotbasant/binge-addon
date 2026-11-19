// Binge Addon — CAM last-resort fallback tests (v1.1.2, basant: "cam dikha do").
// RULE (locked): CAM/TeleCine/TeleSync/HDTS/HDTC/DVDScr/SCR streams stay
// HIDDEN whenever clean streams exist (v1.0.3 stands). They appear ONLY
// as a last resort when a title has ZERO clean streams after filtering,
// and every shown CAM stream is CLEARLY marked in its line 2
// ("📹 1080p CAM TeleCine", CAM + kind). v1.1.3 (basant: "note likhne ke
// jarurat nahi hai bhai"): the extra "Note: CAM print — theatre
// recording" line is GONE — the line-2 CAM marking is the whole warning
// now. v1.1.4: the labeled "Quality:" line is gone too — CAM lived in
// the compact line 1. v1.1.5: blueprint layout — CAM lives in line 2
// ("📹 1080p CAM TeleCine"), the NAME is the 🚀 FHD header.
//
// Fixtures are REAL live Torrentio rows captured 18 Nov 2026 ~18:30 IST:
//   tests/fixtures/ramayana-torrentio-20261118.json  (43 rows, ALL CAM)
//   tests/fixtures/jailer2-torrentio-20261118.json   (145 rows, 105 clean)
// Run: node tests/test-cam-fallback.js  (exit 0 = all pass)
'use strict';

const fs = require('fs');
const path = require('path');
const { processSourceStreams, formatStream, camKind } = require('../app/lib/parse');
const { mergeStreamResults } = require('../app/lib/sources');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')).streams;

// ---------------------------------------------------------------------------
// 1. camKind — rank order (TeleCine 0 > TeleSync/HDTS/HDTC 1 > DVDScr 2 > CAM 3)
// ---------------------------------------------------------------------------
console.log('=== 1. camKind ranks ===');
eq(camKind('Movie 2026 TELECINE 1080p').rank, 0, 'TeleCine rank 0');
eq(camKind('Movie 2026 TELESYNC 1080p').rank, 1, 'TeleSync rank 1');
eq(camKind('Movie 2026 HDTS Hindi 1080p').rank, 1, 'HDTS rank 1');
eq(camKind('Movie 2026 HDTC Hindi 1080p').rank, 1, 'HDTC rank 1');
eq(camKind('Movie 2026 Telugu DVDScr x264').rank, 2, 'DVDScr rank 2');
eq(camKind('Movie 2026 PreDVD Hindi').rank, 2, 'PreDVD rank 2');
eq(camKind('Movie 2026 CAM 720p').rank, 3, 'CAM rank 3');
eq(camKind('Movie 2026 HDCAM 720p').rank, 3, 'HDCAM rank 3');
eq(camKind('Movie 2026 CAMRip 720p').rank, 3, 'CAMRip rank 3');
eq(camKind('Movie 2026 TELECINE HDTC 1080p').kind, 'TeleCine', 'two kinds -> better one wins');

// ---------------------------------------------------------------------------
// 2. Cam-only title: REAL Ramayana rows (43 raw, zero clean)
// ---------------------------------------------------------------------------
console.log('\n=== 2. Ramayana (cam-only, real rows) ===');
const ramRaw = load('ramayana-torrentio-20261118.json');
eq(ramRaw.length, 43, 'fixture has the 43 live rows');
const ram = processSourceStreams('torrentio', ramRaw);
eq(ram.kept.length, 0, 'zero clean streams kept');
eq(ram.cam.length, 36, '36 CAM retained (7 Tamil-only CAM rows stay dropped: langDrop)');
eq(ram.dropped.cam, 43, 'all 43 rows hit the CAM check');
eq(ram.dropped.langDrop, 7, '7 CAM rows dropped by language verdict');
check(ram.cam.every((p) => p.isCam === true), 'every retained CAM row tagged isCam');
check(ram.cam.every((p) => [0, 1, 2, 3].includes(p.camRank)), 'every CAM row has a camRank 0-3');
check(ram.cam.every((p, i) => i === 0 || ram.cam[i - 1].camRank <= p.camRank),
  'cam list sorted best-first (camRank non-decreasing)');
eq(ram.cam[0].camKind, 'TeleCine', 'best CAM first: TeleCine');

const ramMerge = mergeStreamResults([{ name: 'torrentio', streams: ram.kept, cam: ram.cam }], 40);
eq(ramMerge.usedCam, true, 'merge falls back to CAM when clean is empty');
eq(ramMerge.parsed.length, 36, 'merge returns all 36 CAM streams (under cap 40)');
const ramOut = ramMerge.parsed.map(formatStream);
check(ramOut.every((o) => (o.description.split('\n')[1] || '').includes('CAM')), 'every CAM stream has CAM in its line 2 (📹 … CAM …)');
check(ramOut.every((o) => !/Note:/.test(o.description)), 'no Note line in any CAM stream description (v1.1.3: Note line removed)');
check(ramOut.every((o) => !/CAM/.test(o.name)), 'CAM never leaks into the name');
eq(ramOut[0].name, '🚀 FHD', 'first CAM stream name (resolution header)');
eq(ramOut[0].description,
  '🎬 Ramayana (2026)\n📹 1080p CAM TeleCine\n📦 6.38 GB\n🏷️ 1O8Op\n🔍 Torrentio',
  'first CAM stream description (exact)');

// ---------------------------------------------------------------------------
// 3. Mixed title: REAL Jailer 2 rows — CAM must stay hidden
// ---------------------------------------------------------------------------
console.log('\n=== 3. Jailer 2 (mixed, real rows) ===');
const jaiRaw = load('jailer2-torrentio-20261118.json');
eq(jaiRaw.length, 145, 'fixture has the 145 live rows');
const jai = processSourceStreams('torrentio', jaiRaw);
check(jai.kept.length > 0, `clean streams kept (${jai.kept.length})`);
check(jai.cam.length > 0, `CAM pool exists but must stay hidden (${jai.cam.length})`);
const jaiMerge = mergeStreamResults([{ name: 'torrentio', streams: jai.kept, cam: jai.cam }], 40);
eq(jaiMerge.usedCam, false, 'merge does NOT fall back when clean streams exist');
eq(jaiMerge.parsed.length, 40, 'merge returns the 40 best clean streams (cap)');
const jaiOut = jaiMerge.parsed.map(formatStream);
check(!jaiOut.some((o) => /CAM/.test(`${o.name}\n${o.description}`)),
  'ZERO CAM anywhere in the mixed-title output (name or description)');
check(!jaiOut.some((o) => /Note: CAM print/.test(o.description)), 'no CAM Note line in clean output');
eq(jaiOut[0].name, '🚀 FHD', 'first clean stream name (resolution header)');
eq(jaiOut[0].description,
  '🎬 Jailer 2 (2026)\n📹 HDRip 🎞️ HEVC\n🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧\n📦 1.57 GB\n🏷️ NOGRP\n🔍 Torrentio',
  'first clean stream description (blueprint format v1.1.5)');

// ---------------------------------------------------------------------------
// 4. Clean-only title: Dangal corpus rows — unchanged behaviour
// ---------------------------------------------------------------------------
console.log('\n=== 4. Dangal (clean-only) ===');
const corpus = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'stream-format-corpus.json'), 'utf8'));
const dangal = corpus.filter((f) => f.id.startsWith('dangal-torrentio'));
const dan = processSourceStreams('torrentio', dangal.map((f) => f.raw));
eq(dan.kept.length, 4, 'all 4 clean rows kept');
eq(dan.cam.length, 0, 'no CAM pool at all');
const danMerge = mergeStreamResults([{ name: 'torrentio', streams: dan.kept, cam: dan.cam }], 40);
eq(danMerge.usedCam, false, 'no fallback for a clean-only title');
eq(danMerge.parsed.length, 4, 'all 4 clean streams returned');
check(!danMerge.parsed.map(formatStream).some((o) => /CAM/.test(o.description)),
  'clean-only output has no CAM marking');

// ---------------------------------------------------------------------------
// 5. CAM pool still enforces the other filters (synthetic rows)
// ---------------------------------------------------------------------------
console.log('\n=== 5. CAM pool enforces resolution / language / seeders ===');
const synth = (filename, seeders) => ({
  infoHash: `aa${Math.random().toString(36).slice(2, 10)}`,
  behaviorHints: { filename },
  title: `${filename}\n👤 ${seeders} 💾 1.0 GB\n🇮🇳`,
});
const r2160 = processSourceStreams('torrentio', [synth('Movie.2026.2160p.HDTC.Hindi.mkv', 10)]);
eq(r2160.kept.length + r2160.cam.length, 0, '2160p CAM stays dropped (resolution cap)');
const rTamil = processSourceStreams('torrentio', [{
  infoHash: 'bb00000001',
  behaviorHints: { filename: 'Movie.2026.HDTC.Tamil.1080p.mkv' },
  title: 'Movie.2026.HDTC.Tamil.1080p\n👤 10 💾 1.0 GB',
}]);
eq(rTamil.kept.length + rTamil.cam.length, 0, 'Tamil-only CAM stays dropped (language verdict)');
const rSeed = processSourceStreams('torrentio', [
  synth('Movie.2026.HDTC.Hindi.1080p.mkv', 5),
  synth('Movie.2026.CAM.Hindi.720p.mkv', 0),
]);
eq(rSeed.cam.length, 1, '0-seeder CAM dropped when a seeded CAM exists');
eq(rSeed.cam[0].camKind, 'HDTC', 'the seeded CAM survives');
const rSeedOnly = processSourceStreams('torrentio', [synth('Movie.2026.CAM.Hindi.720p.mkv', 0)]);
eq(rSeedOnly.cam.length, 1, '0-seeder CAM kept when it is the ONLY CAM (no seeded alternative)');
const rOrder = processSourceStreams('torrentio', [
  synth('Movie.2026.CAM.Hindi.720p.mkv', 9),
  synth('Movie.2026.DVDScr.Hindi.720p.mkv', 9),
  synth('Movie.2026.TELESYNC.Hindi.720p.mkv', 9),
  synth('Movie.2026.TELECINE.Hindi.720p.mkv', 9),
]);
eq(rOrder.cam.map((p) => p.camKind).join(','), 'TeleCine,TeleSync,DVDScr,CAM',
  'synthetic CAM rows sort best-first by camRank');

// ---------------------------------------------------------------------------
// 6. formatStream never marks a clean stream as CAM
// ---------------------------------------------------------------------------
console.log('\n=== 6. Clean streams never marked ===');
const cleanOut = formatStream(dan.kept[0]);
check(!/CAM|Note:/.test(cleanOut.description), 'clean stream description has no CAM/Note');

console.log(`\nRESULT: ${fail === 0 ? 'ALL CHECKS PASS' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
