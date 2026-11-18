// Binge Addon — locked stream title + info-line format tests (v1.1.1).
// Locked format (basant-approved, Telegram-channel style):
//   Name:    "Jailer 2 (2026)"              (title + year only)
//   Quality: 1080p HDRip                    (resolution + source + HDR)
//   Audio:   Hindi + English | DD+ 5.1      (languages | primary codec + channels)
//   Size:    1.57 GB                        (size once)
// Rules: each signal once, in its own labeled line; a line is omitted
// when its signal is genuinely missing — never invented. Flags win over
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
  'jailer2-torrentio-1': ['Jailer 2 (2026)', 'Quality: 1080p HDRip\nAudio: Hindi + English | DD+ 5.1\nSize: 1.57 GB'],
  'jailer2-torrentio-2': ['Jailer 2 (2026)', 'Quality: 1080p WEB-DL\nAudio: Hindi + English | DD+ 5.1\nSize: 2.99 GB'],
  'jailer2-torrentio-3': ['Jailer 2 (2026)', 'Quality: 1080p HDRip\nAudio: Hindi | AAC\nSize: 2.91 GB'],
  'jailer2-torrentio-4': ['Jailer 2 (2026)', 'Quality: 1080p WEB-DL\nAudio: Hindi + English | DD+ 5.1\nSize: 2.99 GB'],
  'jailer2-hdhub-1': ['Jailer 2 (2026)', 'Quality: 1080p WEB-DL\nAudio: Hindi | DD+ 5.1\nSize: 12.75 GB'],
  'jailer2-hdhub-2': ['Jailer 2 (2026)', 'Quality: 1080p HDRip HDR\nAudio: Hindi + Kannada + Tamil + Telugu\nSize: 11.95 GB'],
  'dangal-torrentio-1': ['Dangal (2016)', 'Quality: 1080p Remux\nAudio: Hindi + English + Russian\nSize: 32.18 GB'],
  'dangal-torrentio-2': ['Dangal (2016)', 'Quality: 1080p BluRay\nAudio: Hindi | DD\nSize: 2.7 GB'],
  'dangal-torrentio-3': ['Dangal (2016)', 'Quality: 1080p BluRay\nAudio: Hindi | Atmos 7.1\nSize: 7.64 GB'],
  'dangal-torrentio-4': ['Dangal (2016)', 'Quality: 1080p BluRay\nAudio: Hindi | DD 5.1\nSize: 4.38 GB'],
  'dangal-hdhub-1': ['Dangal (2016)', 'Quality: 1080p BluRay\nAudio: Hindi\nSize: 2 GB'],
  '3idiots-torrentio-1': ['3 Idiots (2009)', 'Quality: 1080p BluRay\nAudio: Hindi | AAC\nSize: 2.51 GB'],
  '3idiots-torrentio-2': ['3 Idiots (2009)', 'Quality: 1080p\nAudio: Hindi + English | AAC\nSize: 2.49 GB'],
  '3idiots-torrentio-3': ['3 Idiots (2009)', 'Quality: 1080p BluRay\nAudio: Hindi + Chinese | AAC 7.1\nSize: 4.17 GB'],
  '3idiots-torrentio-4': ['3 Idiots (2009)', 'Quality: 1080p BluRay\nAudio: Hindi | DTS-HD MA 7.1\nSize: 15.02 GB'],
  '3idiots-hdhub-1': ['3 Idiots (2009)', 'Quality: 1080p BluRay\nAudio: Hindi | DD 5.1\nSize: 3.3 GB'],
  'interstellar-torrentio-1': ['Interstellar (2014)', 'Quality: 1080p BluRay\nAudio: Hindi + English\nSize: 2.26 GB'],
  'interstellar-torrentio-2': ['Interstellar (2014)', 'Quality: 1080p BluRay\nAudio: Hindi + English | DD+ 2.0\nSize: 2.56 GB'],
  // Truncated HdHub descriptions (no .mkv): the name must NOT keep the
  // "[10Gbps Download Only] [💾 34.07 GB]" host labels (regression).
  'interstellar-hdhub-trunc-1': ['Interstellar (2014)', 'Quality: 1080p BluRay\nAudio: Hindi + English | DTS-HD MA 5.1\nSize: 34.07 GB'],
  'interstellar-hdhub-trunc-2': ['Interstellar (2014)', 'Quality: 1080p BluRay\nAudio: Hindi + English | DD+ 5.1\nSize: 13.99 GB'],
  'interstellar-hdhub-trunc-3': ['Interstellar (2014)', 'Quality: 1080p BluRay\nAudio: Hindi + English | DD+ 5.1\nSize: 9.47 GB'],
  'mirzapur-series-synthetic': ['Mirzapur S01E01', 'Quality: 1080p WEB-DL\nAudio: Hindi | DD+ 5.1\nSize: 2.41 GB'],
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
const outputs = [];
for (const f of fixtures) {
  const { kept } = processSourceStreams(f.source, [f.raw]);
  if (kept.length) outputs.push({ id: f.id, ...formatStream(kept[0]) });
}
check(!outputs.some((o) => TECH_IN_NAME.test(o.name)), 'no tech/size/codec/junk token in any name');
check(!outputs.some((o) => /🇮🇳|🇬🇧|INGB/.test(o.description)), 'no flag emoji / INGB in any description');
check(!outputs.some((o) => /💾|🔊/.test(o.description)), 'no emoji in descriptions (labeled lines carry the structure)');
check(!outputs.some((o) => /DD\+ DD/.test(o.description)), "no 'DD+ DD' duplicate audio");
check(!outputs.some((o) => /192Kbps|640Kbps|224Kbps|ESub|ESubs/i.test(`${o.name}\n${o.description}`)),
  'no bitrate / ESub junk anywhere');
check(outputs.every((o) => (o.description.match(/Quality:/g) || []).length <= 1
  && (o.description.match(/Audio:/g) || []).length <= 1
  && (o.description.match(/Size:/g) || []).length <= 1), 'each labeled line appears at most once per stream');
check(outputs.every((o) => !/\bGB\b.*\bGB\b/.test(o.description.replace('Size: ', ''))),
  'size appears once (never in Quality/Audio lines)');
check(!outputs.some((o) => /Telugu/.test(o.name)), 'no language word in any name (the contradiction is gone)');
check(outputs.every((o) => o.description.split('\n').every((l) => /^(Quality|Audio|Size): /.test(l))),
  'every description line is a labeled line');

console.log(`\nRESULT: ${fail === 0 ? 'ALL CHECKS PASS' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
