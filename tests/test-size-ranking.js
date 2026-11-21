// Binge Addon — size-aware stream ranking tests (v1.2.3, basant: top
// stream must be 1080p, good quality, BEST BY SIZE — his Jio data is
// 3 GB/day, and the old sort put a 32.18 GB Dangal Remux on top, one
// movie eating 10 days of data).
//
// The rank (see compareParsed in app/lib/parse.js): Hindi 1080p first
// (unchanged), then size class — efficient (~1.5–5 GB sweet spot for a
// feature film) < large (5–12 GB) < oversized (>12 GB) < suspiciously
// tiny (<0.7 GB feature-length) — then quality tier FIRST inside the
// class (v1.2.4: Remux > BluRay > WEB-DL > BDRip > WEBRip > HDRip >
// HDTV > no tag), then smaller size first inside the tier, then
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
// v1.6.4: the 4.38 GB Hon3y and 7.64 GB SAMPA rows carry 4 seeders
// each — the seeder floor drops them (a 4-seeder torrent shows
// "0 seeds" in Nuvio, proven on RPO). Size still drops nothing:
// the 2.7 GB efficient BluRay tops and the 32.18 GB Remux stays last.
eq(dan.kept.length, 2, '2 clean rows kept (4-seeder rows dropped by the v1.6.4 floor, not by size)');
eq(sizes(dan.kept).join(','), '2.7 GB,32.18 GB',
  'order: efficient BluRay first, Remux last');
eq(formatStream(dan.kept[0]).description,
  'Quality: 1080p BluRay\nAudio: Hindi | DD\nSize: 2.7 GB',
  'Dangal top is the 2.7 GB BluRay, NOT the 32.18 GB Remux');
check(!/Remux/.test(formatStream(dan.kept[0]).description), 'no Remux on top');
eq(formatStream(dan.kept[1]).description.split('\n')[0], 'Quality: 1080p Remux',
  'Remux still present, ranked last (re-rank only, never dropped)');

// ---------------------------------------------------------------------------
// 2. Jailer 2 (real 145-row fixture): top is now a WEB-DL, not the HDRip
// ---------------------------------------------------------------------------
console.log('\n=== 2. Jailer 2 (real 145-row fixture) ===');
const jaiRaw = load('jailer2-torrentio-20261118.json').streams;
const jai = processSourceStreams('torrentio', jaiRaw);
const jaiMerge = mergeStreamResults([{ name: 'torrentio', streams: jai.kept, cam: jai.cam }], 40);
eq(jaiMerge.usedCam, false, 'no CAM fallback (clean streams exist)');
eq(jaiMerge.parsed.length, 40, 'cap 40 kept');
eq(formatStream(jaiMerge.parsed[0]).description,
  'Quality: 1080p WEB-DL\nAudio: Hindi + English\nSize: 2.36 GB',
  'Jailer 2 top is NOW the 2.36 GB WEB-DL (v1.2.4 tier-first: WEB-DL outranks HDRip, even though the 1.57 GB HDRip is smaller)');
check(!/HDRip/.test(formatStream(jaiMerge.parsed[0]).description), 'no HDRip on top');
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
eq(sizes(idi.kept).join(','), '2.51 GB,4.17 GB,2.49 GB,15.02 GB',
  'order: BluRay pair first (tier 1), then the 2.49 GB BDRip (tier 3), 15 GB last');
eq(formatStream(idi.kept[0]).description,
  'Quality: 1080p BluRay\nAudio: Hindi | AAC\nSize: 2.51 GB',
  '3 Idiots top is NOW the 2.51 GB BluRay (v1.2.4 tier-first: BluRay outranks BDRip)');

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
  synth('Movie.2026.1080p.WEB-DL.x264.mkv', 125, '0.5 GB'),
  synth('Movie.2026.1080p.BluRay.x264.mkv', 5, '2.5 GB'),
]);
eq(formatStream(tiny.kept[0]).description,
  'Quality: 1080p BluRay\nAudio: Hindi\nSize: 2.5 GB',
  '2.5 GB BluRay beats a 500 MB WEB-DL despite 25x fewer seeders (5 vs 125; v1.6.4: the BluRay needs ≥5 seeders to survive the floor)');
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
eq(formatStream(ep.kept[0]).description.split('\n')[2], 'Size: 4 GB',
  'BluRay 4 GB tops the 600 MB WEB-DL episode (v1.2.4 tier-first: BluRay outranks WEB-DL in the same class)');
const epRow = ep.kept.find((p) => p.size && p.size.value === 0.6);
eq(sizeClass(epRow), 0, 'episode row is class 0 (efficient) with duration');
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
  synth('Movie.2026.1080p.BluRay.x264.mkv', 5, '3 GB'),
]);
eq(formatStream(hindiFirst.kept[0]).description.split('\n')[2], 'Size: 3 GB',
  'Hindi 3 GB BluRay still beats English 1.5 GB WEB-DL (language first; v1.6.4: Hindi row has 5 seeders, not 1, so it survives the floor)');
const tie = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.BluRay.x264.mkv', 5, '2 GB'),
  synth('Movie.2026.1080p.BluRay.x265.mkv', 40, '2 GB'),
]);
check(tie.kept[0].seeders === 40, 'same tier + same size: more seeders first');
eq(sizeClass({ size: null }), 1, 'unknown size ranks as large (class 1)');
eq(qualityTier(['Remux']), 0, 'Remux is the top tier');
eq(qualityTier(['BluRay']), 1, 'BluRay is tier 1');
eq(qualityTier(['WEB-DL']), 2, 'WEB-DL is tier 2');
eq(qualityTier(['BDRip']), 3, 'BDRip is tier 3');
eq(qualityTier(['WEBRip']), 4, 'WEBRip is tier 4 (below WEB-DL)');
eq(qualityTier(['HDRip']), 5, 'HDRip is tier 5');
eq(qualityTier(['HDTV']), 6, 'HDTV is tier 6');
eq(qualityTier([]), 7, 'no source tag ranks last');

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

// ---------------------------------------------------------------------------
// 9. Pushpa 2 tier-first (v1.2.4): WEB-DL outranks WEBRip even when smaller
// ---------------------------------------------------------------------------
console.log('\n=== 9. Pushpa 2 tier-first (v1.2.4) ===');
const pushpa = processSourceStreams('torrentio', [
  synth('Pushpa.2.2024.1080p.WEBRip.x265.AAC.mkv', 5, '2 GB'),
  synth('Pushpa.2.2024.1080p.WEB-DL.x264.mkv', 10, '2.4 GB'),
  synth('Pushpa.2.2024.1080p.WEBRip.x264.DD.2.0.mkv', 8, '2.57 GB'),
]);
eq(formatStream(pushpa.kept[0]).description,
  'Quality: 1080p WEB-DL\nAudio: Hindi\nSize: 2.4 GB',
  'WEB-DL 2.4 GB tops the smaller WEBRip 2 GB (tier first, size second)');
eq(formatStream(pushpa.kept[1]).description.split('\n')[2], 'Size: 2 GB',
  'the 2 GB WEBRip is now #2, not dropped');
const bluVsWeb = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.WEB-DL.x264.mkv', 10, '2.4 GB'),
  synth('Movie.2026.1080p.BluRay.x264.mkv', 5, '2.01 GB'),
]);
eq(formatStream(bluVsWeb.kept[0]).description.split('\n')[2], 'Size: 2.01 GB',
  'BluRay 2.01 GB still tops WEB-DL 2.4 GB (BluRay tier is above WEB-DL)');
const largeWeb = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.WEB-DL.x264.mkv', 10, '5.3 GB'),
  synth('Movie.2026.1080p.BluRay.x264.mkv', 5, '2.01 GB'),
]);
eq(formatStream(largeWeb.kept[0]).description.split('\n')[2], 'Size: 2.01 GB',
  'large-class WEB-DL 5.3 GB does NOT jump the efficient BluRay 2.01 GB (size class still dominates)');
const webVsHd = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.HDRip.x264.AAC.mkv', 20, '1.57 GB'),
  synth('Movie.2026.1080p.WEB-DL.x264.mkv', 5, '2.99 GB'),
]);
eq(formatStream(webVsHd.kept[0]).description.split('\n')[2], 'Size: 2.99 GB',
  'WEB-DL 2.99 GB tops the smaller HDRip 1.57 GB (Jailer 2 behaviour)');
const webRipOnly = processSourceStreams('torrentio', [
  synth('Movie.2026.1080p.WEBRip.x264.mkv', 4, '2 GB'),
]);
eq(webRipOnly.kept.length, 1, 'WEBRip-only title keeps its stream (no dropping)');
eq(formatStream(webRipOnly.kept[0]).description.split('\n')[0], 'Quality: 1080p WEBRip',
  'the only stream is the WEBRip');

console.log(`\nRESULT: ${fail === 0 ? 'ALL CHECKS PASS' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
