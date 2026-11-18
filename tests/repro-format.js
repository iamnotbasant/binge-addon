// Binge Addon — formatting repro/verify script (local only, never shipped).
// Uses REAL parse.js + REAL fetched source JSON in /tmp:
//   torrentio-ranabaali-raw.json, torrentio-dangal-raw.json,
//   hdhub-ranabaali-raw.json, hdhub-dangal-raw.json
//   streams-ranabaali.json, streams-dangal.json (production output, reference)
// Run: node tests/repro-format.js
'use strict';

const fs = require('fs');
const path = require('path');
const parse = require('../app/lib/parse');
const { processSourceStreams, dedupe, formatStream, cleanTitle } = parse;

const load = (f) => JSON.parse(fs.readFileSync(path.join('/tmp', f), 'utf8'));

// ---------------------------------------------------------------------------
// 1. isCam spelling tests (isCam itself is not exported; reproduce via the
//    pipeline: a stream whose rawText contains the spelling must be dropped
//    with dropped.cam incremented). We test the regex behaviour by feeding
//    minimal Torrentio-like streams through processSourceStreams.
// ---------------------------------------------------------------------------
function camDropped(spelling) {
  const s = {
    infoHash: 'aa'.repeat(20),
    title: `Ranabaali (2026) 1080p Hindi ${spelling} - x264 - AAC\n👤 10 💾 1.5 GB\n🇮🇳`,
    behaviorHints: { filename: `Ranabaali.2026.1080p.Hindi.${spelling}.x264.AAC.mkv` },
  };
  const { kept, dropped } = processSourceStreams('torrentio', [s]);
  return kept.length === 0 && dropped.cam === 1;
}

const SPELLINGS = [
  'DVDScr', 'DVDSCR', 'dvdscr', 'SCR', 'scr', 'Screener', 'screener',
  'DVDScreener', 'HDTS', 'HD-TS', 'HD-Ts', 'PreDVD', 'PREDVD', 'predvd',
  'CAM', 'HDCAM', 'TS', 'TC', 'TeleSync', 'Telesync', 'TeleCine', 'CAMRip',
  'HDTC', 'HQ-PreDVD', 'DVD-SCR',
];
console.log('=== 1. CAM/screener spelling filter ===');
for (const sp of SPELLINGS) {
  console.log(`  ${sp.padEnd(12)} ${camDropped(sp) ? 'DROPPED ✓' : 'PASSES THROUGH ✗'}`);
}

// ---------------------------------------------------------------------------
// 2. cleanTitle step-by-step on REAL raw Torrentio filenames.
// ---------------------------------------------------------------------------
console.log('\n=== 2. cleanTitle on real raw filenames ===');
const rawRana = load('torrentio-ranabaali-raw.json');
const rawDangal = load('torrentio-dangal-raw.json');
const demoFiles = [
  rawRana.streams[3].behaviorHints.filename, // DD+5.1 / 1.5GB / www prefix
  rawRana.streams.find((s) => /DVDScr/i.test(s.behaviorHints.filename)).behaviorHints.filename,
  rawDangal.streams.find((s) => /DDP5\.1/i.test(s.behaviorHints.filename || '')).behaviorHints.filename,
  'Dangal.2016.1080p.BluRay.x264-[YTS.AM].mp4',
];
for (const f of demoFiles) {
  console.log(`  RAW  : ${f}`);
  console.log(`  CLEAN: ${cleanTitle(f)}`);
}

// ---------------------------------------------------------------------------
// 3. Full pipeline on REAL raw source data, formatted output checks.
// ---------------------------------------------------------------------------
function runPipeline(label, sourceName, rawFile) {
  const raw = load(rawFile).streams;
  const { kept, dropped } = processSourceStreams(sourceName, raw);
  const deduped = dedupe(kept);
  const out = deduped.map(formatStream);
  return { label, raw: raw.length, kept: deduped.length, dropped, out };
}

const runs = [
  runPipeline('torrentio/ranabaali', 'torrentio', 'torrentio-ranabaali-raw.json'),
  runPipeline('torrentio/dangal', 'torrentio', 'torrentio-dangal-raw.json'),
  runPipeline('hdhub/ranabaali', 'hdhub', 'hdhub-ranabaali-raw.json'),
  runPipeline('hdhub/dangal', 'hdhub', 'hdhub-dangal-raw.json'),
];

console.log('\n=== 3. Pipeline results (real raw data) ===');
let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };

for (const r of runs) {
  console.log(`\n-- ${r.label}: raw=${r.raw} kept=${r.kept} dropped=${JSON.stringify(r.dropped)}`);
  const names = r.out.map((s) => s.name);
  const descs = r.out.map((s) => s.description);
  check(!names.some((n) => /dvdscr|predvd|\bscr\b|screener/i.test(n)), `no DVDScr/PreDVD/SCR/screener in names (${names.filter((n) => /dvdscr|predvd|\bscr\b|screener/i.test(n)).length} found)`);
  check(!names.some((n) => /^www\b/i.test(n)), `no 'www…' site prefix in names (${names.filter((n) => /^www\b/i.test(n)).length} found)`);
  check(!names.some((n) => /bolly4u|movierulz|tamilmv|hdhub4u/i.test(n)), 'no site-name spam in names');
  check(!descs.some((d) => /🇮🇳|🇬🇧/.test(d)), `no flag emoji in descriptions (renders as INGB) (${descs.filter((d) => /🇮🇳|🇬🇧/.test(d)).length} found)`);
  check(!descs.some((d) => /INGB/.test(d)), "no literal 'INGB' in descriptions");
  check(!names.some((n) => /DD\+5 1| 1 5GB| 3 2GB| 8 4GB|\b5 1\b/.test(n)), `no dot-to-space damage in names ('DD+5 1', '1 5GB', '5 1')`);
  check(!descs.some((d) => /DD\+ DD/.test(d)), `no 'DD+ DD' duplicate audio (${descs.filter((d) => /DD\+ DD/.test(d)).length} found)`);
  check(!descs.some((d) => /\bDV\b/.test(d)), `no false 'DV' badge (${descs.filter((d) => /\bDV\b/.test(d)).length} found; real DV absent in this data)`);
  check(!r.out.some((s) => /hdrip/i.test(s.name) && /\bHDR\b/.test(s.description)), "no false 'HDR' badge on HDRip-only titles");
  check(r.out.every((s) => /1080p|720p|480p|Unknown/.test(s.description)), 'res label present in every description');
}

// DDP must surface as DD+ (not bare DD): find a DDP5.1 stream in the
// Dangal pipeline output and check its description.
const ddpStream = runs[1].out.find((s) => /DDP5\.1/.test(s.name));
check(!!ddpStream && /DD\+/.test(ddpStream.description),
  `DDP5.1 stream shows DD+ in description (${ddpStream ? JSON.stringify(ddpStream.description) : 'stream missing'})`);
// Decimal dots must survive in names: DD+5.1 / 1.5GB / DDP5.1 present.
const ranaNames = runs[0].out.map((s) => s.name).join('\n');
check(/DD\+5\.1/.test(ranaNames), "decimal 'DD+5.1' intact in a Ranabaali name");
check(/\d\.\dGB/.test(ranaNames), "decimal size like '1.5GB' intact in a Ranabaali name");
const allOut = runs.flatMap((r) => r.out);
const allText = allOut.map((s) => `${s.name}\n${s.description}`).join('\n');
for (const tok of ['1080p', 'HDR', 'HEVC', 'x265', 'WEB-DL', 'DD+', 'AAC', 'BluRay']) {
  check(allText.includes(tok), `badge token still present somewhere: ${tok}`);
}

console.log('\n=== Sample formatted output (first 6 torrentio/ranabaali) ===');
runs[0].out.slice(0, 6).forEach((s, i) => {
  console.log(`[${i}] name=${JSON.stringify(s.name)}`);
  console.log(`    desc=${JSON.stringify(s.description)}`);
});
console.log('\n=== Sample formatted output (first 4 torrentio/dangal) ===');
runs[1].out.slice(0, 4).forEach((s, i) => {
  console.log(`[${i}] name=${JSON.stringify(s.name)}`);
  console.log(`    desc=${JSON.stringify(s.description)}`);
});

console.log(`\nRESULT: ${fail === 0 ? 'ALL CHECKS PASS' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
