// Binge Addon — exact 7-line AIOStreams blueprint stream format tests (v1.1.5).
// Blueprint format (basant: screenshot ka poora blueprint, final target):
//   NAME: 🚀 FHD                              (resolution icon + label)
//   🎬 Reacher (2022) 🍂 S04 🎞️ E02          (title + season/episode; movies: no S/E)
//   📹 BluRay REMUX 🎞️ AVC ⏱️ 41m:22s        (source + HDR + encode [+ duration])
//   🎧 DTS-HD MA 🔊 5.1 🌐 🇬🇧                 (codec [+ channels] [+ flags, ' / ' joined])
//   📦 8.5 GB 📊 27.4 Mbps                    (size [+ bitrate, only with duration])
//   🏷️ Preacher 💎 DebridAccount|torbox      (group, NOGRP default [+ debrid provider])
//   ⚡ Ready (TB) 🔍 Comet                    (debrid-ready [+ always the source addon])
// Rules: each line omitted when its signal is genuinely missing — never
// invented. Duration/Ready/debrid come ONLY from tokens parsed out of the
// raw source title (Comet carries them; Torrentio does not). "⏳ Uncached"
// is never written. Flags win over filename language words
// (see parseAudioLanguages). Badges NOT in scope here (test-badges.js
// covers the pack; its res/language patterns were extended in v1.1.5 to
// match the new 🚀 FHD / 🇮🇳🇬🇧 tokens).
// Fixtures are REAL live raw streams (tests/fixtures/stream-format-corpus.json)
// captured 18 Nov 2026, plus ONE synthetic series row (no live series row
// existed: Torrentio returned 0 streams for Mirzapur/Panchayat S1E1).
// Run: node tests/test-stream-format.js  (exit 0 = all pass)
'use strict';

const fs = require('fs');
const path = require('path');
const parse = require('../app/lib/parse');
const {
  processSourceStreams, formatStream, extractDisplayName, extractBaseTitle,
  parseAudioLanguages, parseChannels,
  parseReleaseGroup, parseDuration, parseReady,
  parseDebridProvider, durationSeconds,
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
  'jailer2-torrentio-1': ['🚀 FHD', '🎬 Jailer 2 (2026)\n📹 HDRip 🎞️ HEVC\n🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧\n📦 1.57 GB\n🏷️ NOGRP\n🔍 Torrentio'],
  'jailer2-torrentio-2': ['🚀 FHD', '🎬 Jailer 2 (2026)\n📹 WEB-DL 🎞️ AVC\n🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧\n📦 2.99 GB\n🏷️ NOGRP\n🔍 Torrentio'],
  'jailer2-torrentio-3': ['🚀 FHD', '🎬 Jailer 2 (2026)\n📹 HDRip 🎞️ x264\n🎧 AAC 🌐 🇮🇳\n📦 2.91 GB\n🏷️ NOGRP\n🔍 Torrentio'],
  'jailer2-torrentio-4': ['🚀 FHD', '🎬 Jailer 2 (2026)\n📹 WEB-DL 🎞️ AVC\n🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧\n📦 2.99 GB\n🏷️ NOGRP\n🔍 Torrentio'],
  'jailer2-hdhub-1': ['🚀 FHD', '🎬 Jailer 2 (2026)\n📹 WEB-DL 🎞️ x264\n🎧 DD+ 🔊 5.1 🌐 🇮🇳\n📦 12.75 GB\n🏷️ NOGRP\n🔍 HdHub'],
  'jailer2-hdhub-2': ['🚀 FHD', '🎬 Jailer 2 (2026)\n📹 HDRip HDR 🎞️ x264\n🌐 🇮🇳\n📦 11.95 GB\n🏷️ NOGRP\n🔍 HdHub'],
  'dangal-torrentio-1': ['🚀 FHD', '🎬 Dangal (2016)\n📹 Remux 🎞️ x264\n🌐 🇮🇳 / 🇬🇧 / 🇷🇺\n📦 32.18 GB\n🏷️ NOGRP\n🔍 Torrentio'],
  'dangal-torrentio-2': ['🚀 FHD', '🎬 Dangal (2016)\n📹 BluRay 🎞️ x264\n🎧 DD 🌐 🇮🇳\n📦 2.7 GB\n🏷️ M2Tv\n🔍 Torrentio'],
  'dangal-torrentio-3': ['🚀 FHD', '🎬 Dangal (2016)\n📹 BluRay 🎞️ x265\n🎧 Atmos 🔊 7.1 🌐 🇮🇳\n📦 7.64 GB\n🏷️ SAMPA\n🔍 Torrentio'],
  'dangal-torrentio-4': ['🚀 FHD', '🎬 Dangal (2016)\n📹 BluRay 🎞️ x264\n🎧 DD 🔊 5.1 🌐 🇮🇳\n📦 4.38 GB\n🏷️ Hon3y\n🔍 Torrentio'],
  'dangal-hdhub-1': ['🚀 FHD', '🎬 Dangal (2016)\n📹 BluRay 🎞️ HEVC\n🌐 🇮🇳\n📦 2 GB\n🏷️ NOGRP\n🔍 HdHub'],
  '3idiots-torrentio-1': ['🚀 FHD', '🎬 3 Idiots (2009)\n📹 BluRay 🎞️ x264\n🎧 AAC 🌐 🇮🇳\n📦 2.51 GB\n🏷️ Ozlem\n🔍 Torrentio'],
  '3idiots-torrentio-2': ['🚀 FHD', '🎬 3 Idiots (2009)\n📹 🎞️ x264\n🎧 AAC 🌐 🇮🇳 / 🇬🇧\n📦 2.49 GB\n🏷️ NOGRP\n🔍 Torrentio'],
  '3idiots-torrentio-3': ['🚀 FHD', '🎬 3 Idiots (2009)\n📹 BluRay 🎞️ HEVC\n🎧 AAC 🔊 7.1 🌐 🇮🇳 / 🇨🇳\n📦 4.17 GB\n🏷️ Natty\n🔍 Torrentio'],
  '3idiots-torrentio-4': ['🚀 FHD', '🎬 3 Idiots (2009)\n📹 BluRay 🎞️ x264\n🎧 DTS-HD MA 🔊 7.1 🌐 🇮🇳\n📦 15.02 GB\n🏷️ Hon3yHD\n🔍 Torrentio'],
  '3idiots-hdhub-1': ['🚀 FHD', '🎬 3 Idiots (2009)\n📹 BluRay 🎞️ x264\n🎧 DD 🔊 5.1 🌐 🇮🇳\n📦 3.3 GB\n🏷️ NOGRP\n🔍 HdHub'],
  'interstellar-torrentio-1': ['🚀 FHD', '🎬 Interstellar (2014)\n📹 BluRay 🎞️ x264\n🌐 🇮🇳 / 🇬🇧\n📦 2.26 GB\n🏷️ YIFY\n🔍 Torrentio'],
  'interstellar-torrentio-2': ['🚀 FHD', '🎬 Interstellar (2014)\n📹 BluRay 🎞️ x264\n🎧 DD+ 🔊 2.0 🌐 🇮🇳 / 🇬🇧\n📦 2.56 GB\n🏷️ NOGRP\n🔍 Torrentio'],
  'interstellar-hdhub-trunc-1': ['🚀 FHD', '🎬 Interstellar (2014)\n📹 BluRay Remux 🎞️ AVC\n🎧 DTS-HD MA 🔊 5.1 🌐 🇮🇳 / 🇬🇧\n📦 34.07 GB\n🏷️ NOGRP\n🔍 HdHub'],
  'interstellar-hdhub-trunc-2': ['🚀 FHD', '🎬 Interstellar (2014)\n📹 BluRay 🎞️ HEVC\n🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧\n📦 13.99 GB\n🏷️ WiKi\n🔍 HdHub'],
  'interstellar-hdhub-trunc-3': ['🚀 FHD', '🎬 Interstellar (2014)\n📹 BluRay 🎞️ HEVC\n🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧\n📦 9.47 GB\n🏷️ NOGRP\n🔍 HdHub'],
  'mirzapur-series-synthetic': ['🚀 FHD', '🎬 Mirzapur 🍂 S01 🎞️ E01\n📹 WEB-DL 🎞️ x264\n🎧 DD+ 🔊 5.1 🌐 🇮🇳\n📦 2.41 GB\n🏷️ NOGRP\n🔍 Torrentio'],
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
// All 22 corpus fixtures are 1080p, so every NAME is the FHD header.
check(outputs.every((o) => o.name === '🚀 FHD'), 'every fixture name is the 🚀 FHD header (all 1080p)');
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
check(!outputs.some((o) => /Uncached|⏳/.test(o.description)), "never '⏳ Uncached' (a plain torrent is not uncached)");
check(outputs.every((o) => (o.description.match(/📦/g) || []).length === 1),
  'exactly one 📦 size line per stream');
check(outputs.every((o) => (o.description.match(/🏷️/g) || []).length === 1),
  'exactly one 🏷️ group line per stream (NOGRP default when no group)');
check(outputs.every((o) => (o.description.match(/🔍/g) || []).length === 1),
  'exactly one 🔍 provider line per stream');
check(outputs.every((o) => (o.description.match(/\d+(\.\d+)?\s*(GB|MB)/g) || []).length === 1),
  'size appears once (never in the title / spec / audio lines)');
check(outputs.every((o) => {
  const lines = o.description.split('\n');
  // Flags live ONLY on the audio line (🎧 codec line or a bare 🌐 line).
  return lines.every((l) => !FLAG_RE.test(l) || /^(🎧|🌐)/.test(l));
}), 'flags appear only on the audio line');
check(outputs.every((o) => /^🎬 /.test(o.description.split('\n')[0])),
  'first line is always the 🎬 title line');
check(outputs.every((o) => o.description.split('\n').length === 6),
  'exactly 6 description lines on every corpus fixture (line 2/3 drop only when their signal is missing — see §7)');
check(outputs.every((o) => o.description.split('\n').every((l) =>
  /^(🎬 |📹 |🎧 |🌐 |📦 |🏷️ |⚡ Ready \(..\) 🔍 |🔍 )/.test(l))),
  'every description line matches the blueprint shape');
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

console.log('\n=== 6b. Synthetic Comet rows (screenshot shape) ===');
const cometRows = [
  {
    infoHash: 'cc0000000000000000000000000000000000000001',
    behaviorHints: { filename: 'Reacher.S04E02.Cage.Fight.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-Preacher.mkv' },
    title: 'Reacher S04E02 Cage Fight 1080p BluRay REMUX AVC DTS-HD MA 5.1-Preacher\n👤 12 💾 8.5 GB ⏱ 41m:22s\n🇬🇧\n⚡ Ready (TB)\nDebridAccount|torbox',
  },
  {
    infoHash: 'cc0000000000000000000000000000000000000002',
    behaviorHints: { filename: 'Reacher.S04E02.Cage.Fight.1080p.WEB-DL.DDP5.1.H.264-FRQC.mkv' },
    title: 'Reacher S04E02 Cage Fight 1080p WEB-DL DDP5.1 H.264-FRQC\n👤 8 💾 4.01 GB ⏱ 43m:11s\n🇬🇧\n⚡ Ready (RD)\nDebridAccount|torbox',
  },
  {
    // Torrentio-shaped row: no duration, no Ready, no group, no debrid —
    // those parts must simply be absent, never invented.
    infoHash: 'cc0000000000000000000000000000000000000003',
    behaviorHints: { filename: 'Reacher.S04E02.1080p.WEB-DL.x264.AAC.mkv' },
    title: 'Reacher S04E02 1080p WEB-DL x264 AAC\n👤 30 💾 2.2 GB\n🇬🇧',
  },
];
const comet = processSourceStreams('comet', cometRows);
eq(comet.kept.length, 3, 'all 3 synthetic Comet rows kept');
const cometOut = comet.kept.map(formatStream);
const byGroup = (g) => cometOut.find((o) => o.description.includes(`🏷️ ${g}`));
eq(byGroup('Preacher').name, '🚀 FHD', 'Comet Preacher row: FHD header');
eq(byGroup('Preacher').description,
  '🎬 Reacher 🍂 S04 🎞️ E02\n📹 BluRay Remux 🎞️ AVC ⏱️ 41m:22s\n🎧 DTS-HD MA 🔊 5.1 🌐 🇬🇧\n📦 8.5 GB 📊 27.4 Mbps\n🏷️ Preacher 💎 DebridAccount|torbox\n⚡ Ready (TB) 🔍 Comet',
  'Comet Preacher row: exact blueprint output (the brief example; bitrate 8.5 GB / 41m22s = 27.4 Mbps)');
eq(byGroup('FRQC').description,
  '🎬 Reacher 🍂 S04 🎞️ E02\n📹 WEB-DL 🎞️ x264 ⏱️ 43m:11s\n🎧 DD+ 🔊 5.1 🌐 🇬🇧\n📦 4.01 GB 📊 12.4 Mbps\n🏷️ FRQC 💎 DebridAccount|torbox\n⚡ Ready (RD) 🔍 Comet',
  'Comet FRQC row: exact blueprint output (H.264 -> x264; bitrate 4.01 GB / 43m11s = 12.4 Mbps)');
const plain = cometOut.find((o) => o.description.includes('🏷️ NOGRP') && !/⏱|Ready/.test(o.description));
eq(plain.description, '🎬 Reacher 🍂 S04 🎞️ E02\n📹 WEB-DL 🎞️ x264\n🎧 AAC 🌐 🇬🇧\n📦 2.2 GB\n🏷️ NOGRP\n🔍 Comet',
  'row without duration/Ready/group/debrid omits those parts (NOGRP + plain 🔍 only)');

// ---------------------------------------------------------------------------
// 7. Blueprint helpers (v1.1.5): base title, debrid, duration, bitrate,
//    name headers, season/episode threading
// ---------------------------------------------------------------------------
console.log('\n=== 7. Blueprint helpers ===');
eq(extractBaseTitle('Jailer 2 (2026) 1080p Telugu HQ HDRip - HEVC'), 'Jailer 2 (2026)', 'base title keeps the year, drops the rest');
eq(extractBaseTitle('Mirzapur 2018 S01E01 1080p WEB-DL'), 'Mirzapur (2018)', 'base title drops the SxxExx tag');
eq(extractBaseTitle('Reacher (2022) S04E02 Cage Fight 1080p BluRay'), 'Reacher (2022)', 'base title: Reacher (2022)');
eq(extractBaseTitle('Some Movie 1080p BluRay x264'), 'Some Movie', 'base title without year');
eq(extractBaseTitle(''), '', 'base title: empty in, empty out');

eq(parseDebridProvider('NOGRP DebridAccount|torbox'), 'DebridAccount|torbox', 'DebridAccount token kept as-is');
eq(parseDebridProvider('⚡ Ready (TB) 🔍 Comet'), null, 'no DebridAccount token -> null');
eq(parseDebridProvider('FRQC dmm_hashlist'), null, '"dmm_hashlist" is junk, never shown');
eq(parseDebridProvider('Movie 2026 1080p BluRay'), null, 'plain title -> null');

eq(durationSeconds('41m:22s'), 2482, '41m:22s -> 2482s');
eq(durationSeconds('1h 23m'), 4980, '1h 23m -> 4980s');
eq(durationSeconds('2h 22m'), 8520, '2h 22m -> 8520s');
eq(durationSeconds(null), null, 'no duration -> null');

// Name headers + season/episode threading on minimal parsed objects.
function miniParsed(over = {}) {
  return {
    raw: {}, resolution: 1080, displayTitle: 'Movie (2026)',
    langs: new Set(['english']), audioLangs: new Set(['english']),
    audio: [], visual: [], encode: [], size: null,
    source: 'torrentio', group: null, duration: null, ready: null, debrid: null,
    ...over,
  };
}
eq(formatStream(miniParsed({ resolution: 2160 })).name, '🔥 4K', '2160p header is 🔥 4K (mapping exists even though the cap drops 2160p)');
eq(formatStream(miniParsed({ resolution: 1080 })).name, '🚀 FHD', '1080p header is 🚀 FHD');
eq(formatStream(miniParsed({ resolution: 720 })).name, '⚡ HD', '720p header is ⚡ HD');
eq(formatStream(miniParsed({ resolution: 480 })).name, '💿 SD', '480p header is 💿 SD');
eq(formatStream(miniParsed({ resolution: null })).name, 'Movie (2026)', 'unknown resolution falls back to the display title');
const seRow = miniParsed({ displayTitle: 'Reacher (2022) S01E01 Cage Fight 1080p WEB-DL', resolution: 1080 });
eq(formatStream(seRow, { season: 4, episode: 2 }).description.split('\n')[0],
  '🎬 Reacher (2022) 🍂 S04 🎞️ E02', 'opts season/episode (request id) win over the filename tag');
eq(formatStream(seRow).description.split('\n')[0],
  '🎬 Reacher (2022) 🍂 S01 🎞️ E01', 'without opts, the filename SxxExx tag is the fallback');
eq(formatStream(miniParsed({ displayTitle: 'Jailer 2 (2026) 1080p HDRip' })).description.split('\n')[0],
  '🎬 Jailer 2 (2026)', 'movies get no 🍂/🎞️ part');
const noAudio = miniParsed({
  audioLangs: new Set(), langs: new Set(), audio: [],
  visual: ['WEB-DL'], encode: ['x264'], size: { value: 2.2, unit: 'GB' },
});
eq(formatStream(noAudio).description.split('\n').length, 5,
  'no audio signal at all -> the audio line drops (5 lines, never an empty 🎧 line)');

console.log(`\nRESULT: ${fail === 0 ? 'ALL CHECKS PASS' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);


