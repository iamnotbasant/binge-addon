// Binge Addon — compact stream title + description format tests (v1.1.4).
// Compact format (basant-approved, "image jaisa banao" — AIOStreams
// minimalist shape, so Nuvio renders the same compact card):
//   Name: "Jailer 2 (2026)"              (title + year only, unchanged)
//   1080p | BluRay REMUX AVC ⏱ 41m:22s   (resolution | source + HDR + encode [+ duration])
//   DTS-HD MA 5.1 🇬🇧                     (primary codec + channels + flag emojis)
//   💾 8.5 GB                             (size once)
//   📦 Preacher                           (release group)
//   🔍 Comet ⚡ Ready (TB)                 (source addon [+ debrid-ready passthrough])
// Rules: each line omitted when its signal is genuinely missing — never
// invented. Duration/Ready come ONLY from tokens parsed out of the raw
// source title (Comet carries them; Torrentio does not). Flags win over
// filename language words (see parseAudioLanguages). Badges NOT in scope.
// Fixtures are REAL live raw streams (tests/fixtures/stream-format-corpus.json)
// captured 18 Nov 2026, plus ONE synthetic series row (no live series row
// existed: Torrentio returned 0 streams for Mirzapur/Panchayat S1E1).
// Run: node tests/test-stream-format.js  (exit 0 = all pass)
'use strict';

const fs = require('fs');
const path = require('path');
const parse = require('../app/lib/parse');
const {
  processSourceStreams, formatStream, extractDisplayName,
  parseAudioLanguages, parseChannels,
  parseReleaseGroup, parseDuration, parseReady,
} = parse;

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

// ---------------------------------------------------------------------------
// 1. extractDisplayName — title + year only (+ SxxExx for series)
// ---------------------------------------------------------------------------
console.log('=== 1. extractDisplayName ===');
const NAME_CASES = [
  ['Jailer 2 (2026) 1080p Telugu HQ HDRip - HEVC - (DD+5.1 - 192Kbps & AAC) - 1.6GB - ESub', 'Jailer 2 (2026)'],
  ['Jailer-2 2026 1080p AMZN WEB-DL Hindi-Multi DDP5.1 ESub x264', 'Jailer 2 (2026)'],
  ['Interstellar 2014 2014 1080p BluRay x264 YIFY', 'Interstellar (2014)'],
  ['Dangal (2016) (1080p BluRay x265 SAMPA)', 'Dangal (2016)'],
  ['3 Idiots 2009 1080p BluRay x264 Hindi AAC - Ozlem', '3 Idiots (2009)'],
  ['Dangal 2016 Hindi 1080p BluRay x264 AC3-LOKI-M2Tv', 'Dangal (2016)'],
  ['Mirzapur S01E01 1080p Hindi WEB-DL x264 DD+5.1 AAC 2.4GB ESub', 'Mirzapur S01E01'],
  ['Mirzapur 2018 S01E01 1080p WEB-DL', 'Mirzapur (2018) S01E01'],
  ['Spider-Man 2002 1080p BluRay x264', 'Spider-Man (2002)'],
  ['Ranabaali 2026 1080p Hindi WEB-DL x264', 'Ranabaali (2026)'],
  ['Dangal (2016) 1080p h264', 'Dangal (2016)'],
  ['Some Movie 1080p BluRay x264', 'Some Movie'],
  ['', ''],
];
for (const [input, want] of NAME_CASES) {
  eq(extractDisplayName(input), want, `name(${JSON.stringify(input.slice(0, 48))})`);
}

// ---------------------------------------------------------------------------
// 2. parseAudioLanguages — flags win; words only when no flags
// ---------------------------------------------------------------------------
console.log('\n=== 2. parseAudioLanguages (flags win) ===');
const flagText = 'Jailer 2 (2026) 1080p Telugu HQ HDRip\n👤 8236 💾 1.57 GB\n🇬🇧 / 🇮🇳';
const flagClean = 'Jailer 2 (2026) 1080p Telugu HQ HDRip HEVC DD+5.1 AAC 1.6GB ESub';
eq([...parseAudioLanguages(flagText, flagClean)].sort().join(','), 'english,hindi',
  'flags 🇬🇧/🇮🇳 win over filename word "Telugu" (no telugu in Audio)');
const noFlagText = 'Jailer-2 2026 HQ 1080p HDRip Hindi-TEL-KAN-LiNE-Tamil ORG HC-ESub x264';
eq([...parseAudioLanguages(noFlagText, noFlagText)].sort().join(','), 'hindi,kannada,tamil,telugu',
  'no flags -> word tokens (HdHub 4-language row)');
eq([...parseAudioLanguages('x\n🇮🇳', 'x')].join(','), 'hindi', 'single flag');
eq([...parseAudioLanguages('Dangal 2016 Hindi BluRay', 'Dangal 2016 Hindi BluRay')].join(','), 'hindi',
  'no flags, Hindi word');
eq([...parseAudioLanguages('Movie 2026 1080p BluRay', 'Movie 2026 1080p BluRay')].join(','), '',
  'no language signal at all -> empty, never invented');
eq([...parseAudioLanguages('Animal (2023) 1080p BluRay', 'Animal (2023) 1080p BluRay')].join(','), '',
  '"Animal" must not donate Malayalam ("mal" inside a word)');
eq([...parseAudioLanguages('Hotel Transylvania (2012) 1080p', 'Hotel Transylvania (2012) 1080p')].join(','), '',
  '"Hotel" must not donate Telugu ("tel" inside a word)');
eq([...parseAudioLanguages('Tiger 3 (2023) 1080p BluRay', 'Tiger 3 (2023) 1080p BluRay')].join(','), '',
  '"Tiger" must not donate German ("ger" inside a word)');
eq([...parseAudioLanguages('X [Tam + Hin + Mal + Kan] 1080p', 'X [Tam + Hin + Mal + Kan] 1080p')].sort().join(','), 'hindi,kannada,malayalam,tamil',
  'bracketed short codes still detected: [Tam + Hin + Mal + Kan]');

// ---------------------------------------------------------------------------
// 3. parseChannels — sizes must not read as channels
// ---------------------------------------------------------------------------
console.log('\n=== 3. parseChannels ===');
eq(parseChannels('DD+5.1 - 192Kbps & AAC'), '5.1', 'DD+5.1');
eq(parseChannels('(DD+2.0 - 224Kbps) - 2.5GB - ESub'), '2.0', 'DD+2.0 wins, 2.5GB is a size');
eq(parseChannels('DTS-HDMA 7.1 - Hon3yHD'), '7.1', '7.1');
eq(parseChannels('1080p BluRay x265 10bit EAC3 7.1 Atmos'), '7.1', '7.1 after EAC3');
eq(parseChannels('Jailer 2 (2026) 1080p Telugu HQ HDRip - 1.6GB - ESub'), null, '1.6GB is not channels');
eq(parseChannels('Dangal (2016).1080p.h264 32.18 GB'), null, '32.18 GB is not channels');
eq(parseChannels('Movie 2026 1080p BluRay'), null, 'no channels token -> null');

// ---------------------------------------------------------------------------
// 4. Full pipeline on REAL corpus fixtures — exact locked output
// ---------------------------------------------------------------------------
console.log('\n=== 4. Fixture pipeline (exact locked output) ===');
const fixtures = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'stream-format-corpus.json'), 'utf8'));
// [id, expected name, expected description]
const EXPECTED = {
  'jailer2-torrentio-1': ['Jailer 2 (2026)', '1080p | HDRip HEVC\nDD+ 5.1 🇮🇳 🇬🇧\n💾 1.57 GB\n🔍 Torrentio'],
  'jailer2-torrentio-2': ['Jailer 2 (2026)', '1080p | WEB-DL AVC\nDD+ 5.1 🇮🇳 🇬🇧\n💾 2.99 GB\n🔍 Torrentio'],
  'jailer2-torrentio-3': ['Jailer 2 (2026)', '1080p | HDRip x264\nAAC 🇮🇳\n💾 2.91 GB\n🔍 Torrentio'],
  'jailer2-torrentio-4': ['Jailer 2 (2026)', '1080p | WEB-DL AVC\nDD+ 5.1 🇮🇳 🇬🇧\n💾 2.99 GB\n🔍 Torrentio'],
  'jailer2-hdhub-1': ['Jailer 2 (2026)', '1080p | WEB-DL x264\nDD+ 5.1 🇮🇳\n💾 12.75 GB\n🔍 HdHub'],
  'jailer2-hdhub-2': ['Jailer 2 (2026)', '1080p | HDRip HDR x264\n🇮🇳\n💾 11.95 GB\n🔍 HdHub'],
  'dangal-torrentio-1': ['Dangal (2016)', '1080p | Remux x264\n🇮🇳 🇬🇧 🇷🇺\n💾 32.18 GB\n🔍 Torrentio'],
  'dangal-torrentio-2': ['Dangal (2016)', '1080p | BluRay x264\nDD 🇮🇳\n💾 2.7 GB\n📦 M2Tv\n🔍 Torrentio'],
  'dangal-torrentio-3': ['Dangal (2016)', '1080p | BluRay x265\nAtmos 7.1 🇮🇳\n💾 7.64 GB\n📦 SAMPA\n🔍 Torrentio'],
  'dangal-torrentio-4': ['Dangal (2016)', '1080p | BluRay x264\nDD 5.1 🇮🇳\n💾 4.38 GB\n📦 Hon3y\n🔍 Torrentio'],
  'dangal-hdhub-1': ['Dangal (2016)', '1080p | BluRay HEVC\n🇮🇳\n💾 2 GB\n🔍 HdHub'],
  '3idiots-torrentio-1': ['3 Idiots (2009)', '1080p | BluRay x264\nAAC 🇮🇳\n💾 2.51 GB\n📦 Ozlem\n🔍 Torrentio'],
  '3idiots-torrentio-2': ['3 Idiots (2009)', '1080p | x264\nAAC 🇮🇳 🇬🇧\n💾 2.49 GB\n🔍 Torrentio'],
  '3idiots-torrentio-3': ['3 Idiots (2009)', '1080p | BluRay HEVC\nAAC 7.1 🇮🇳 🇨🇳\n💾 4.17 GB\n📦 Natty\n🔍 Torrentio'],
  '3idiots-torrentio-4': ['3 Idiots (2009)', '1080p | BluRay x264\nDTS-HD MA 7.1 🇮🇳\n💾 15.02 GB\n📦 Hon3yHD\n🔍 Torrentio'],
  '3idiots-hdhub-1': ['3 Idiots (2009)', '1080p | BluRay x264\nDD 5.1 🇮🇳\n💾 3.3 GB\n🔍 HdHub'],
  'interstellar-torrentio-1': ['Interstellar (2014)', '1080p | BluRay x264\n🇮🇳 🇬🇧\n💾 2.26 GB\n📦 YIFY\n🔍 Torrentio'],
  'interstellar-torrentio-2': ['Interstellar (2014)', '1080p | BluRay x264\nDD+ 2.0 🇮🇳 🇬🇧\n💾 2.56 GB\n🔍 Torrentio'],
  // Truncated HdHub descriptions (no .mkv): the name must NOT keep the
  // "[10Gbps Download Only] [💾 34.07 GB]" host labels (regression).
  'interstellar-hdhub-trunc-1': ['Interstellar (2014)', '1080p | BluRay Remux AVC\nDTS-HD MA 5.1 🇮🇳 🇬🇧\n💾 34.07 GB\n🔍 HdHub'],
  'interstellar-hdhub-trunc-2': ['Interstellar (2014)', '1080p | BluRay HEVC\nDD+ 5.1 🇮🇳 🇬🇧\n💾 13.99 GB\n📦 WiKi\n🔍 HdHub'],
  'interstellar-hdhub-trunc-3': ['Interstellar (2014)', '1080p | BluRay HEVC\nDD+ 5.1 🇮🇳 🇬🇧\n💾 9.47 GB\n🔍 HdHub'],
  'mirzapur-series-synthetic': ['Mirzapur S01E01', '1080p | WEB-DL x264\nDD+ 5.1 🇮🇳\n💾 2.41 GB\n🔍 Torrentio'],
};
for (const f of fixtures) {
  const { kept } = processSourceStreams(f.source, [f.raw]);
  check(kept.length === 1, `${f.id}: pipeline keeps the stream (got ${kept.length})`);
  if (!kept.length) continue;
  const out = formatStream(kept[0]);
  const [wantName, wantDesc] = EXPECTED[f.id] || [];
  eq(out.name, wantName, `${f.id} name`);
  eq(out.description, wantDesc, `${f.id} description`);
  // behaviorHints / identity passthrough must survive the format change.
  if (f.raw.infoHash) check(out.infoHash === f.raw.infoHash, `${f.id}: infoHash passes through`);
  if (f.raw.url) check(out.url === f.raw.url, `${f.id}: url passes through`);
  check(typeof out.behaviorHints.bingeGroup === 'string'
    && out.behaviorHints.bingeGroup.startsWith('binge-addon:'), `${f.id}: bingeGroup kept`);
}

// ---------------------------------------------------------------------------
// 5. Invariants over every fixture output (the format's promises)
// ---------------------------------------------------------------------------
console.log('\n=== 5. Format invariants (all fixtures) ===');
const TECH_IN_NAME = /\b(480|720|1080|2160)p?\b|bluray|web-dl|webrip|hdrip|hdtv|hevc|x264|x265|avc|\bDD\+?\b|dts|aac|atmos|\d+(\.\d+)?\s*(GB|MB)\b|esub|hq\b/i;
const LANG_WORD = /\b(Hindi|English|Tamil|Telugu|Malayalam|Kannada|Bengali|Marathi|Gujarati|Punjabi|Korean|Russian|Japanese|Chinese|Spanish|French|German|Thai|Vietnamese)\b/;
const FLAG_RE = /🇮🇳|🇬🇧|🇷🇺|🇰🇷|🇯🇵|🇨🇳|🇪🇸|🇫🇷|🇩🇪|🇹🇭|🇻🇳/;
const outputs = [];
for (const f of fixtures) {
  const { kept } = processSourceStreams(f.source, [f.raw]);
  if (kept.length) outputs.push({ id: f.id, ...formatStream(kept[0]) });
}
check(!outputs.some((o) => TECH_IN_NAME.test(o.name)), 'no tech/size/codec/junk token in any name');
check(!outputs.some((o) => /Quality:|Audio:|Size:|Note:/.test(o.description)),
  'no labeled lines anywhere (v1.1.1 Telegram format is gone)');
check(!outputs.some((o) => /INGB/.test(o.description)), "no literal 'INGB' in descriptions");
check(!outputs.some((o) => /DD\+ DD/.test(o.description)), "no 'DD+ DD' duplicate audio");
check(!outputs.some((o) => /192Kbps|640Kbps|224Kbps|ESub|ESubs/i.test(`${o.name}\n${o.description}`)),
  'no bitrate / ESub junk anywhere');
check(!outputs.some((o) => LANG_WORD.test(o.description)),
  'no language WORD in any description (flags carry the languages now)');
check(!outputs.some((o) => /Telugu/.test(o.name)), 'no language word in any name (the contradiction is gone)');
check(outputs.every((o) => (o.description.match(/💾/g) || []).length === 1),
  'exactly one 💾 size line per stream');
check(outputs.every((o) => (o.description.match(/🔍/g) || []).length === 1),
  'exactly one 🔍 provider line per stream');
check(outputs.every((o) => (o.description.match(/📦/g) || []).length <= 1),
  'at most one 📦 group line per stream');
check(outputs.every((o) => (o.description.match(/\d+(\.\d+)?\s*(GB|MB)/g) || []).length === 1),
  'size appears once (never in the res/audio lines)');
check(outputs.every((o) => {
  const lines = o.description.split('\n');
  // Line 1 never carries flags; the 💾/📦/🔍 lines never do either —
  // flags live ONLY on the audio line.
  if (FLAG_RE.test(lines[0])) return false;
  return lines.slice(2).every((l) => !FLAG_RE.test(l));
}), 'flags appear only on the audio line (never line 1 / size / group / provider)');
check(outputs.every((o) => {
  const lines = o.description.split('\n');
  // First line is the res/source/encode line (or a CAM line): it must
  // carry a resolution, a source, an encode or CAM — never a bare size
  // or provider.
  if (/^(💾|📦|🔍)/.test(lines[0])) return false;
  return /1080p|720p|480p|1080i|BluRay|WEB-DL|WEBRip|HDRip|HDTV|Remux|x264|x265|AVC|HEVC|10-Bit|CAM/.test(lines[0]);
}), 'first line is always the res/source/encode (or CAM) line');
check(outputs.every((o) => o.description.split('\n').every((l) =>
  /^(💾 |📦 |🔍 )/.test(l)
  || /1080p|720p|480p|1080i|BluRay|WEB-DL|WEBRip|HDRip|HDTV|Remux|x264|x265|AVC|HEVC|10-Bit|CAM/.test(l)
  || /^(Atmos|TrueHD|DTS-HD MA|DTS|DD\+|DD|AAC|FLAC|Opus|AC3|EAC3|\d\.\d|🇮🇳|🇬🇧|🇷🇺|🇰🇷|🇯🇵|🇨🇳|🇪🇸|🇫🇷|🇩🇪|🇹🇭|🇻🇳)/.test(l))),
  'every description line matches a compact shape (res / audio / size / group / provider)');

// ---------------------------------------------------------------------------
// 6. Compact-format extractors (v1.1.4) + synthetic Comet rows
// ---------------------------------------------------------------------------
console.log('\n=== 6. parseReleaseGroup / parseDuration / parseReady ===');
eq(parseReleaseGroup('Reacher.S04E02.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-Preacher.mkv',
  'Reacher S04E02 1080p BluRay REMUX AVC DTS-HD MA 5.1-Preacher'), 'Preacher', 'trailing -GROUP');
eq(parseReleaseGroup('Dangal.2016.1080p.BluRay.x264-[YTS.AM].mp4',
  'Dangal 2016 1080p BluRay x264'), 'YTS', 'bracketed [YTS.AM] -> YTS');
eq(parseReleaseGroup('Dangal (2016) (1080p BluRay x265 SAMPA).mkv',
  'Dangal (2016) (1080p BluRay x265 SAMPA)'), 'SAMPA', 'space-separated group in parens');
eq(parseReleaseGroup('Dangal.2016.Hindi.1080p.BluRay.x264.AC3-LOKI-M2Tv',
  'Dangal 2016 Hindi 1080p BluRay x264 AC3-LOKI-M2Tv'), 'M2Tv', 'last dash segment wins (AC3-LOKI-M2Tv -> M2Tv)');
eq(parseReleaseGroup('Movie.2026.1080p.WEB-DL.x264-HDHub4u.Ms.mkv',
  'Movie 2026 1080p WEB-DL x264'), null, 'site suffix is not a group');
eq(parseReleaseGroup('Movie.2026.1080p.BluRay.x264.mkv',
  'Movie 2026 1080p BluRay x264'), null, 'codec tail is not a group');
eq(parseReleaseGroup('Movie.2026.1080p.HDRip.x264-ESub.mkv',
  'Movie 2026 1080p HDRip x264 ESub'), null, 'junk tail is not a group');
eq(parseReleaseGroup('Interstellar (2014) IMAX 1080p BluRay REMUX AVC [Hindi DDP 5.1] x264 (ATELiE',
  'Interstellar (2014) IMAX 1080p BluRay REMUX AVC x264 (ATELiE'), null, 'truncated paren tail is not a group');
eq(parseReleaseGroup('Movie.2026.1080p.BluRay.HEVC.x265.10bit.mkv',
  'Movie 2026 1080p BluRay HEVC x265 10bit'), null, '10bit tail is not a group');
eq(parseReleaseGroup('Movie.2026.1080p.BluRay.x264 (WiKi-LUMiX)',
  'Movie 2026 1080p BluRay x264 (WiKi-LUMiX)'), 'WiKi', 'parenthesised (WiKi-LUMiX) -> WiKi');

eq(parseDuration('Reacher S04E02\n👤 12 💾 8.5 GB ⏱ 41m:22s\n🇬🇧'), '41m:22s', '41m:22s');
eq(parseDuration('41m 22s'), '41m:22s', '"41m 22s" normalises to 41m:22s');
eq(parseDuration('Movie 2026 2h 22m BluRay'), '2h 22m', '"2h 22m" shape');
eq(parseDuration('Movie 2026 1080p BluRay x264 2.49 GB'), null, 'no duration token -> null, never invented');
eq(parseDuration('Movie 2026 1080p BluRay DD+5.1'), null, 'DD+5.1 is not a duration');

eq(parseReady('⚡ Ready (TB)'), 'TB', 'Ready (TB)');
eq(parseReady('Ready (RD)'), 'RD', 'Ready (RD)');
eq(parseReady('Ready (TorBox)'), 'TB', 'Ready (TorBox) normalises to TB');
eq(parseReady('Ready (Real-Debrid)'), 'RD', 'Ready (Real-Debrid) normalises to RD');
eq(parseReady('NOGRP DebridAccount|torbox'), null, 'Comet-internal junk is not Ready');
eq(parseReady('Movie 2026 1080p BluRay'), null, 'no Ready token -> null');

// Synthetic Comet rows shaped from basant's Reacher S4E2 screenshot
// (no live Comet payload exists to test against — Comet is 403 from
// this VM, so these prove the extractor + formatter, not the wire).
console.log('\n=== 6b. Synthetic Comet rows (screenshot shape) ===');
const cometRows = [
  {
    infoHash: 'cc0000000000000000000000000000000000000001',
    behaviorHints: { filename: 'Reacher.S04E02.Cage.Fight.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-Preacher.mkv' },
    title: 'Reacher S04E02 Cage Fight 1080p BluRay REMUX AVC DTS-HD MA 5.1-Preacher\n👤 12 💾 8.5 GB ⏱ 41m:22s\n🇬🇧\n⚡ Ready (TB)',
  },
  {
    infoHash: 'cc0000000000000000000000000000000000000002',
    behaviorHints: { filename: 'Reacher.S04E02.Cage.Fight.1080p.WEB-DL.DDP5.1.H.264-FRQC.mkv' },
    title: 'Reacher S04E02 Cage Fight 1080p WEB-DL DDP5.1 H.264-FRQC\n👤 8 💾 4.01 GB ⏱ 43m:11s\n🇬🇧\n⚡ Ready (RD)',
  },
  {
    // Torrentio-shaped row: no duration, no Ready, no group — those
    // lines must simply be absent, never invented.
    infoHash: 'cc0000000000000000000000000000000000000003',
    behaviorHints: { filename: 'Reacher.S04E02.1080p.WEB-DL.x264.AAC.mkv' },
    title: 'Reacher S04E02 1080p WEB-DL x264 AAC\n👤 30 💾 2.2 GB\n🇬🇧',
  },
];
const comet = processSourceStreams('comet', cometRows);
eq(comet.kept.length, 3, 'all 3 synthetic Comet rows kept');
const cometOut = comet.kept.map(formatStream);
const byGroup = (g) => cometOut.find((o) => o.description.includes(`📦 ${g}`));
eq(byGroup('Preacher').description,
  '1080p | BluRay Remux AVC ⏱ 41m:22s\nDTS-HD MA 5.1 🇬🇧\n💾 8.5 GB\n📦 Preacher\n🔍 Comet ⚡ Ready (TB)',
  'Comet Preacher row: exact compact output (the brief example)');
eq(byGroup('FRQC').description,
  '1080p | WEB-DL x264 ⏱ 43m:11s\nDD+ 5.1 🇬🇧\n💾 4.01 GB\n📦 FRQC\n🔍 Comet ⚡ Ready (RD)',
  'Comet FRQC row: exact compact output (H.264 -> x264)');
const plain = cometOut.find((o) => !/📦|⏱|Ready/.test(o.description));
eq(plain.description, '1080p | WEB-DL x264\nAAC 🇬🇧\n💾 2.2 GB\n🔍 Comet',
  'row without duration/Ready/group omits those lines');

console.log(`\nRESULT: ${fail === 0 ? 'ALL CHECKS PASS' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
