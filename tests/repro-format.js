// Binge Addon — formatting repro/verify script (local only, never shipped).
// v1.1.5 refresh: the old version asserted v1.1.1 rules (no flag emoji in
// descriptions, res label in every description) and needed /tmp inputs
// that are gone. Now fully self-contained: CAM spelling matrix (§1,
// unchanged), cleanTitle demos on inline filenames (§2), and the full
// pipeline over the REAL corpus fixtures (§3) asserting the v1.1.5
// blueprint invariants (name = resolution header, 6 compact lines).
// Run: node tests/repro-format.js
'use strict';

const fs = require('fs');
const path = require('path');
const parse = require('../app/lib/parse');
const { processSourceStreams, dedupe, formatStream, cleanTitle } = parse;

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };

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
// 2. cleanTitle step-by-step on inline release filenames.
// ---------------------------------------------------------------------------
console.log('\n=== 2. cleanTitle on inline filenames ===');
const demoFiles = [
  'www.5MovieRulz.company - Jailer 2 (2026) 1080p Telugu HQ HDRip - HEVC - (DD+5.1 - 192Kbps & AAC) - 1.6GB - ESub.mkv',
  'Ranabaali.2026.1080p.Hindi.DVDScr.x264.AAC.mkv',
  'Dangal.2016.1080p.BluRay.x264.DDP5.1.Hindi.mkv',
  'Dangal.2016.1080p.BluRay.x264-[YTS.AM].mp4',
];
for (const f of demoFiles) {
  console.log(`  RAW  : ${f}`);
  console.log(`  CLEAN: ${cleanTitle(f)}`);
}
check(cleanTitle('Dangal.2016.1080p.BluRay.x264-[YTS.AM].mp4') === 'Dangal 2016 1080p BluRay x264',
  'cleanTitle: [YTS.AM] group tag stripped');
check(!/^www\b/i.test(cleanTitle(demoFiles[0])), "cleanTitle: 'www…' site prefix stripped");
check(/DD\+5\.1/.test(cleanTitle(demoFiles[0])), "cleanTitle: decimal 'DD+5.1' intact");

// ---------------------------------------------------------------------------
// 3. Full pipeline on REAL corpus fixtures, v1.1.5 blueprint checks.
// ---------------------------------------------------------------------------
console.log('\n=== 3. Pipeline results (corpus fixtures) ===');
const corpus = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'stream-format-corpus.json'), 'utf8'));
const bySource = {};
for (const f of corpus) (bySource[f.source] = bySource[f.source] || []).push(f.raw);
const runs = [];
for (const [source, raws] of Object.entries(bySource)) {
  const { kept, dropped } = processSourceStreams(source, raws);
  const deduped = dedupe(kept);
  runs.push({ label: source, raw: raws.length, kept: deduped.length, dropped, out: deduped.map(formatStream) });
}
for (const r of runs) {
  console.log(`\n-- ${r.label}: raw=${r.raw} kept=${r.kept} dropped=${JSON.stringify(r.dropped)}`);
  const names = r.out.map((s) => s.name);
  const descs = r.out.map((s) => s.description);
  check(names.every((n) => ['🔥 4K', '🚀 FHD', '⚡ HD', '💿 SD'].includes(n) || !/dvdscr|predvd|\bscr\b|screener/i.test(n)),
    'names are resolution headers (or a clean fallback title), never CAM/screener');
  check(!names.some((n) => /^www\b/i.test(n)), 'no \'www…\' site prefix in names');
  check(!names.some((n) => /bolly4u|movierulz|tamilmv|hdhub4u/i.test(n)), 'no site-name spam in names');
  check(!descs.some((d) => /INGB/.test(d)), "no literal 'INGB' in descriptions");
  check(!names.some((n) => /DD\+5 1| 1 5GB| 3 2GB| 8 4GB|\b5 1\b/.test(n)), `no dot-to-space damage in names ('DD+5 1', '1 5GB', '5 1')`);
  check(!descs.some((d) => /DD\+ DD/.test(d)), 'no \'DD+ DD\' duplicate audio');
  check(!descs.some((d) => /\bDV\b/.test(d)), 'no false \'DV\' badge (Dolby Vision is spelled out)');
  check(!descs.some((d) => /192Kbps|640Kbps|224Kbps|ESub|ESubs/i.test(d)), 'no bitrate / ESub junk in descriptions');
  check(!descs.some((d) => /Uncached|⏳/.test(d)), "never '⏳ Uncached'");
  check(!descs.some((d) => /Quality:|Audio:|Size:|Note:/.test(d)), 'no labeled lines (v1.1.1 Telegram format is gone)');
  check(descs.every((d) => d.split('\n').length === 6), 'exactly 6 description lines per stream');
  check(descs.every((d) => (d.match(/🔍/g) || []).length === 1), 'exactly one 🔍 provider line per stream');
  check(descs.every((d) => (d.match(/🏷️/g) || []).length === 1), 'exactly one 🏷️ group line per stream');
  check(names.some((n) => n === '🚀 FHD'), 'resolution header present in names (🚀 FHD)');
}

// DDP must surface as DD+ (not bare DD): find a DDP5.1 stream in the
// Dangal pipeline output and check its description.
const dangalOut = runs.find((r) => r.label === 'torrentio').out;
const ddpStream = dangalOut.find((s) => /DDP5\.1/.test(s.description) || /DD\+/.test(s.description));
check(!!ddpStream && /DD\+/.test(ddpStream.description),
  `DDP5.1 stream shows DD+ in description (${ddpStream ? JSON.stringify(ddpStream.description) : 'stream missing'})`);
const allOut = runs.flatMap((r) => r.out);
const allText = allOut.map((s) => `${s.name}\n${s.description}`).join('\n');
for (const tok of ['🚀 FHD', 'HDR', 'HEVC', 'x265', 'WEB-DL', 'DD+', 'AAC', 'BluRay', '🇮🇳']) {
  check(allText.includes(tok), `blueprint token still present somewhere: ${tok}`);
}

console.log('\n=== Sample formatted output (first 3 torrentio) ===');
runs.find((r) => r.label === 'torrentio').out.slice(0, 3).forEach((s, i) => {
  console.log(`[${i}] name=${JSON.stringify(s.name)}`);
  console.log(`    desc=${JSON.stringify(s.description)}`);
});

console.log(`\nRESULT: ${fail === 0 ? 'ALL CHECKS PASS' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
