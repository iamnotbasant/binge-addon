// Binge Addon — size-aware stream ranking tests (v1.2.3, basant: top
// stream must be 1080p, good quality, BEST BY SIZE — his Jio data is
// 3 GB/day, and the old sort put a 32.18 GB Dangal Remux on top, one
// movie eating 10 days of data).
//
// The rank (see compareParsed in app/lib/parse.js): Hindi 1080p first
// (unchanged), then size class — efficient (~1.5–5 GB sweet spot for a
// feature film) < large (5–12 GB) < oversized (>12 GB) < suspiciously
// tiny (<0.7 GB feature-length) — then quality tier (good encodes
// BluRay/WEB-DL/WEBRip/HDRip/BDRip/Remux together, HDTV a step down,
// no source tag last), then smaller size first inside the tier, then
// seeders as the final tiebreak. RE-RANK ONLY: size never drops a
// stream — a Remux-only title still shows its Remux.
//
// Fixtures are the REAL live rows from tests/fixtures/ (Dangal 4-row
// corpus, Jailer 2 145-row Torrentio capture 18 Nov 2026, 3 Idiots
// corpus rows) plus synthetic rows for the guards.
// Run: node tests/test-size-ranking.js  (exit 0 = all pass)
'use strict';

const fs = require('fs');
const path = require('path');
const {
  processSourceStreams, formatStream,
  sizeClass, qualityTier,
} = require('../app/lib/parse');
const { mergeStreamResults } = require('../app/lib/sources');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8'));
const corpus = load('stream-format-corpus.json');

// Synthetic Torrentio-style row: filename carries resolution/source,
// title carries seeders + size + flags (+ optional duration token).
let n = 0;
const synth = (filename, seeders, size, extraTitle = '') => ({
  infoHash: `size${String(++n).padStart(4, '0')}abcdef`,
  behaviorHints: { filename },
  title: `${filename}\n👤 ${seeders} 💾 ${size}\n🇮🇳${extraTitle ? `\n${extraTitle}` : ''}`,
});
const sizes = (list) => list.map((p) => (p.size ? `${p.size.value} ${p.size.unit}` : 'no-size'));

// ---------------------------------------------------------------------------
// 1. Dangal (real corpus rows): Remux falls, efficient BluRay tops
// ---------------------------------------------------------------------------
console.log('=== 1. Dangal (real corpus, 4 rows) ===');
const dangal = corpus.filter((f) => f.id.startsWith('dangal-torrentio'));
const dan = processSourceStreams('torrentio', dangal.map((f) => f.raw));
eq(dan.kept.length, 4, 'all 4 clean rows kept (nothing dropped for size)');
eq(sizes(dan.kept).join(','), '2.7 GB,4.38 GB,7.64 GB,32.18 GB',
  'order: efficient BluRay first, then large, Remux last');
eq(formatStream(dan.kept[0]).description,
  'Quality: 1080p BluRay\nAudio: Hindi | DD\nSize: 2.7 GB',
  'Dangal top is the 2.7 GB BluRay, NOT the 32.18 GB Remux');
check(!/Remux/.test(formatStream(dan.kept[0]).description), 'no Remux on top');
eq(formatStream(dan.kept[3]).description.split('\n')[0], 'Quality: 1080p Remux',
  'Remux still present, ranked last (re-rank only, never dropped)');

// ---------------------------------------------------------------------------
// 2. Jailer 2 (real 145-row fixture): top stays the 1.57 GB HDRip
// ---------------------------------------------------------------------------
console.log('\n=== 2. Jailer 2 (real 145-row fixture) ===');
const jaiRaw = load('jailer2-torrentio-20261118.json').streams;
const jai = processSourceStreams('torrentio', jaiRaw);
const jaiMerge = mergeStreamResults([{ name: 'torrentio', streams: jai.kept, cam: jai.cam }], 40);
eq(jaiMerge.usedCam, false, 'no CAM fallback (clean streams exist)');
eq(jaiMerge.parsed.length, 40, 'cap 40 kept');
eq(formatStream(jaiMerge.parsed[0]).description,
  'Quality: 1080p HDRip\nAudio: Hindi + English | DD+ 5.1\nSize: 1.57 GB',
  'Jailer 2 top STAYS the 1.57 GB HDRip (smaller beats WEB-DL tier)');
check(jaiMerge.parsed.slice(0, 5).every((p) => sizeClass(p) === 0),
  'top 5 are all in the efficient band (<= 5 GB)');
check(!jaiMerge.parsed.slice(0, 10).some((p) => (p.size ? p.size.value : 99) > 5 && p.size.unit === 'GB'),
  'no stream over 5 GB in the top 10');

// ---------------------------------------------------------------------------
// 3. 3 Idiots (real corpus rows): top stays the 2.51 GB BluRay
// ---------------------------------------------------------------------------
console.log('\n=== 3. 3 Idiots (real corpus, 4 rows) ===');
const idiots = corpus.filter((f) => f.id.startsWith('3idiots-torrentio'));
const idi = processSourceStreams('torrentio', idiots.map((f) => f.raw));
eq(sizes(idi.kept).join(','), '2.49 GB,2.51 GB,4.17 GB,15.02 GB',
  'order: 2.49 GB BDRip first (good tier, smaller wins), then BluRay pair, 15 GB last');
eq(formatStream(idi.kept[0]).description,
  'Quality: 1080p\nAudio: Hindi + English | AAC\nSize: 2.49 GB',
  '3 Idiots top is the 2.49 GB BDRip — same size band, sensible (was 2.51 GB BluRay)');

// ---------------------------------------------------------------------------
// 4. Remux-only title: the Remux still shows (never dropped for size)
// ---------------------------------------------------------------------------
console.log('\n=== 4. Remux-only title ===');
const remuxOnly = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.Remux.AVC.DTS-HD.MA.5.1-Group.mkv', 12, '32.18 GB'),
]);
eq(remuxOnly.kept.length, 1, 'Remux-only title keeps its one stream');
eq(formatStream(remuxOnly.kept[0]).description.split('\n')[0], 'Quality: 1080p Remux',
  'the only stream is the Remux');

// ---------------------------------------------------------------------------
// 5. Tiny guard: a 500 MB 1080p file never outranks a normal encode
// ---------------------------------------------------------------------------
console.log('\n=== 5. Tiny-file guard ===');
const tiny = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.WEB-DL.x264.mkv', 50, '0.5 GB'),
  synth('Movie.2026.1080p.BluRay.x264.mkv', 2, '2.5 GB'),
]);
eq(formatStream(tiny.kept[0]).description,
  'Quality: 1080p BluRay\nAudio: Hindi\nSize: 2.5 GB',
  '2.5 GB BluRay beats a 500 MB WEB-DL despite 25x fewer seeders');
eq(sizeClass(tiny.kept[1]), 3, 'the 500 MB row is class 3 (suspiciously tiny)');
const tinyOnly = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.WEB-DL.x264.mkv', 3, '0.5 GB'),
]);
eq(tinyOnly.kept.length, 1, 'tiny-only title still returns its stream (no dropping)');

// ---------------------------------------------------------------------------
// 6. Runtime normalisation: a 600 MB episode is efficient, not tiny
// ---------------------------------------------------------------------------
console.log('\n=== 6. Runtime normalisation (duration known) ===');
const ep = processSourceStreams('torrentio', [
  synth('Show.S01E01.1080p.WEB-DL.x264.mkv', 10, '0.6 GB', '41m:22s'),
  synth('Show.S01E01.1080p.BluRay.x264.mkv', 10, '4 GB'),
]);
eq(formatStream(ep.kept[0]).description.split('\n')[2], 'Size: 0.6 GB',
  '600 MB / 41-min episode tops (normalised to ~2.2 GB feature-equivalent)');
eq(sizeClass(ep.kept[0]), 0, 'episode row is class 0 (efficient) with duration');
const epNoDur = processSourceStreams('torrentio', [
  synth('Show.S01E01.1080p.WEB-DL.x264.mkv', 10, '0.6 GB'),
  synth('Show.S01E01.1080p.BluRay.x264.mkv', 10, '4 GB'),
]);
eq(formatStream(epNoDur.kept[0]).description.split('\n')[2], 'Size: 4 GB',
  'same 600 MB row WITHOUT a duration falls to tiny (absolute size used)');
const featureTiny = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.WEB-DL.x264.mkv', 10, '0.6 GB', '2h 30m'),
  synth('Movie.2026.1080p.BluRay.x264.mkv', 10, '2.5 GB'),
]);
eq(formatStream(featureTiny.kept[0]).description.split('\n')[2], 'Size: 2.5 GB',
  '600 MB with a 2h 30m duration is still tiny (feature-length guard)');

// ---------------------------------------------------------------------------
// 7. Guards that must NOT move: Hindi-first, seeders tiebreak, determinism
// ---------------------------------------------------------------------------
console.log('\n=== 7. Hindi-first / seeders tiebreak / determinism ===');
const hindiFirst = processSourceStreams('torrentio', [
  { infoHash: 'eng000000001', behaviorHints: { filename: 'Movie.2026.1080p.WEB-DL.x264.mkv' },
    title: 'Movie.2026.1080p.WEB-DL.x264\n👤 50 💾 1.5 GB\n🇬🇧' },
  synth('Movie.2026.1080p.BluRay.x264.mkv', 1, '3 GB'),
]);
eq(formatStream(hindiFirst.kept[0]).description.split('\n')[2], 'Size: 3 GB',
  'Hindi 3 GB BluRay still beats English 1.5 GB WEB-DL (language first)');
const tie = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.BluRay.x264.mkv', 3, '2 GB'),
  synth('Movie.2026.1080p.BluRay.x265.mkv', 40, '2 GB'),
]);
check(tie.kept[0].seeders === 40, 'same tier + same size: more seeders first');
eq(sizeClass({ size: null }), 1, 'unknown size ranks as large (class 1)');
eq(qualityTier(['WEB-DL']), 0, 'WEB-DL is a good-encode tier');
eq(qualityTier(['BDRip']), 0, 'BDRip is a good-encode tier');
eq(qualityTier(['Remux']), 0, 'Remux is a good-encode tier');
eq(qualityTier(['HDTV']), 1, 'HDTV is a step down');
eq(qualityTier([]), 2, 'no source tag ranks last');

// Determinism: reversed input order must give the identical ranking.
const rev = processSourceStreams('torrentio', [...jaiRaw].reverse());
const fwdIds = jai.kept.map((p) => p.raw.infoHash);
const revIds = rev.kept.map((p) => p.raw.infoHash);
eq(JSON.stringify(revIds), JSON.stringify(fwdIds),
  'reversed input order gives the identical kept order (deterministic)');

// ---------------------------------------------------------------------------
// 8. CAM pool still sorts by camRank first, size rank inside it
// ---------------------------------------------------------------------------
console.log('\n=== 8. CAM pool: camRank first, size rank inside ===');
const ramRaw = load('ramayana-torrentio-20261118.json').streams;
const ram = processSourceStreams('torrentio', ramRaw);
eq(ram.kept.length, 0, 'Ramayana: zero clean streams');
eq(ram.cam[0].camKind, 'TeleCine', 'best CAM first: TeleCine');
eq(formatStream(ram.cam[0]).description,
  'Quality: 1080p CAM TeleCine\nSize: 6.38 GB',
  'first CAM stream unchanged (Quality-line mark, no Note line)');
check(ram.cam.every((p, i) => i === 0 || ram.cam[i - 1].camRank <= p.camRank),
  'cam list still sorted best-first by camRank');

console.log(`\nRESULT: ${fail === 0 ? 'ALL CHECKS PASS' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
