// Binge Addon — locked stream title + info-line format tests (v1.1.1).
// Locked format (basant-approved, Telegram-channel style), RESTORED in
// v1.2.1 (basant 19 Nov 2026: "formate phele jaise hi kar do bhai") after
// the v1.1.5 blueprint layout + v1.1.8 Windows code variant:
//   Name:    "Jailer 2 (2026)"              (title + year only)
//   Quality: 1080p HDRip                    (resolution + source + HDR)
//   Audio:   Hindi + English | DD+ 5.1      (languages | primary codec + channels)
//   Size:    1.57 GB                        (size once)
// Rules: each signal once, in its own labeled line; a line is omitted
// when its signal is genuinely missing — never invented. NO emoji, NO
// flag emoji, NO 2-letter language codes, NO Group/Codec/Provider lines.
// Flags win over filename language words (see parseAudioLanguages).
// Badges NOT in scope (see test-badges.js).
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
  // v1.6.3: the corpus HdHub rows were captured 18 Nov 2026 and their
  // R2 links were signed 20261118T0350Z (8 h validity) — pin "now" to
  // 04:00 UTC that day so the expired-link filter does not eat them
  // while this test verifies the display format. Expiry itself is
  // covered (with its own pinned times) in tests/test-v163.js.
  const { kept } = processSourceStreams(f.source, [f.raw], { nowMs: Date.UTC(2026, 10, 18, 4, 0, 0) });
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
  const { kept } = processSourceStreams(f.source, [f.raw], { nowMs: Date.UTC(2026, 10, 18, 4, 0, 0) });
  if (kept.length) outputs.push({ id: f.id, ...formatStream(kept[0]) });
}
check(!outputs.some((o) => TECH_IN_NAME.test(o.name)), 'no tech/size/codec/junk token in any name');
check(!outputs.some((o) => /🇮🇳|🇬🇧|INGB/.test(o.description)), 'no flag emoji / INGB in any description');
check(!outputs.some((o) => /💾|🔊/.test(o.description)), 'no emoji in descriptions (labeled lines carry the structure)');
check(!outputs.some((o) => /\p{Extended_Pictographic}/u.test(`${o.name}\n${o.description}`)),
  'no emoji ANYWHERE in name or description (v1.2.1: the blueprint/flag lines are gone)');
check(!outputs.some((o) => /\b(?:HI|EN|TA|TE|ML|KN|BN|MR|GU|PA)\b/.test(o.description)),
  'no 2-letter language codes anywhere (v1.1.8 Windows variant is gone — words, not codes)');
check(!outputs.some((o) => /🇮🇳|🇬🇧|🌐/.test(`${o.name}\n${o.description}`)),
  'no flag emoji and no 🌐 anywhere');
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


console.log('\n=== 6b. Synthetic Comet rows (reverted Telegram format, v1.2.1) ===');
// Comet-only tokens (duration, Ready, group, debrid provider) are parsed
// but NOT displayed any more — the reverted format shows only the locked
// name + Quality/Audio/Size lines. The third row's mangled flag still
// parses as English from the real bytes (see probe); a missing signal
// would simply omit the line, never be invented.
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
const bySize = (s) => cometOut.find((o) => o.description.includes(`Size: ${s}`));
eq(bySize('8.5 GB').name, 'Reacher S04E02', 'Comet Preacher row: name is title + SxxExx, no year (none in the title)');
eq(bySize('8.5 GB').description,
  'Quality: 1080p BluRay\nAudio: English | DTS-HD MA 5.1\nSize: 8.5 GB',
  'Comet Preacher row: exact reverted output (Remux/AVC/duration/Ready/group/debrid all out of display)');
eq(bySize('4.01 GB').description,
  'Quality: 1080p WEB-DL\nAudio: English | DD+ 5.1\nSize: 4.01 GB',
  'Comet FRQC row: exact reverted output (H.264 -> x264 parse kept, not shown)');
eq(bySize('2.2 GB').description,
  'Quality: 1080p WEB-DL\nAudio: English | AAC\nSize: 2.2 GB',
  'plain Comet row: exact reverted output');
// Stale callers passing v1.1.5/v1.1.8 opts must get byte-identical output:
// formatStream takes no options any more.
eq(JSON.stringify(formatStream(comet.kept[0], { useTextLangs: true, season: 9, episode: 9 })),
  JSON.stringify(formatStream(comet.kept[0])),
  'stale opts (useTextLangs / season / episode) are ignored — one format for every client');

console.log('\n=== 7. Parser helpers (kept, still exported) ===');
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

// Name is ALWAYS the display title in the reverted format — the
// resolution never becomes the name (no 🚀 FHD / 🔥 4K header any more),
// and the SxxExx tag comes from the title itself.
function miniParsed(over = {}) {
  return {
    raw: {}, resolution: 1080, displayTitle: 'Movie (2026)',
    langs: new Set(['english']), audioLangs: new Set(['english']),
    audio: [], visual: [], encode: [], size: null,
    source: 'torrentio', group: null, duration: null, ready: null, debrid: null,
    ...over,
  };
}
eq(formatStream(miniParsed({ resolution: 2160 })).name, 'Movie (2026)', '2160p does NOT become a 🔥 4K name header');
eq(formatStream(miniParsed({ resolution: 1080 })).name, 'Movie (2026)', '1080p does NOT become a 🚀 FHD name header');
eq(formatStream(miniParsed({ resolution: 720 })).name, 'Movie (2026)', '720p does NOT become a ⚡ HD name header');
eq(formatStream(miniParsed({ resolution: null })).name, 'Movie (2026)', 'unknown resolution: name is the display title');
eq(formatStream(miniParsed({ displayTitle: 'Reacher (2022) S01E01 Cage Fight 1080p WEB-DL' })).name,
  'Reacher (2022) S01E01', 'series name carries the SxxExx tag from the title');
eq(formatStream(miniParsed({ displayTitle: 'Jailer 2 (2026) 1080p HDRip' })).name,
  'Jailer 2 (2026)', 'movies get no SxxExx part');
const noAudio = miniParsed({
  audioLangs: new Set(), langs: new Set(), audio: [],
  visual: ['WEB-DL'], encode: ['x264'], size: { value: 2.2, unit: 'GB' },
});
eq(formatStream(noAudio).description, 'Quality: 1080p WEB-DL\nSize: 2.2 GB',
  'no audio signal at all -> the Audio line drops entirely (2 lines, never an empty line)');

console.log(`\nRESULT: ${fail === 0 ? 'ALL CHECKS PASS' : fail + ' CHECK(S) FAILED'}`);
process.exit(fail === 0 ? 0 : 1);
