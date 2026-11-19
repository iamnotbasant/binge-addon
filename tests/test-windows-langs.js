// Binge Addon — Windows language-code variant tests (v1.1.8).
// Windows Chromium/WebView renders flag emojis as bare "IN"/"GB"
// letters, so Windows clients get 2-letter codes in the Audio line
// ("🌐 HI / EN") while every other client keeps the flags ("🌐 🇮🇳 / 🇬🇧").
// Rules under test:
//   - Windows UA -> codes, ZERO flag emojis anywhere in the output.
//   - Non-Windows UA / no UA / no opts -> exact v1.1.5 flag output.
//   - Every other line is byte-identical between the two variants.
//   - Badge patterns fire for both variants (codes AND flags), and a
//     title containing "Hi" does NOT fire the Hindi badge on the flag
//     variant (the code alternative is anchored to the 🌐 Audio line).
//   - UA detection: case-insensitive "Windows" substring; missing or
//     non-Windows UA -> not Windows.
// Fixtures are the REAL live raw streams in
// tests/fixtures/stream-format-corpus.json (same corpus as
// test-stream-format.js). Run: node tests/test-windows-langs.js
'use strict';

const fs = require('fs');
const path = require('path');
const parse = require('../app/lib/parse');
const { processSourceStreams, formatStream } = parse;
const { runWithRequest, isWindowsClient } = require('../app/lib/request-context');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const FLAG_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/u;

// ---------------------------------------------------------------------------
// 1. UA detection (request-context)
// ---------------------------------------------------------------------------
console.log('=== 1. isWindowsClient (User-Agent) ===');
function uaIsWindows(ua) {
  let got = null;
  runWithRequest({ headers: { 'user-agent': ua } }, () => { got = isWindowsClient(); });
  return got;
}
check(uaIsWindows('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36') === true, 'Windows 10 Chrome UA -> Windows');
check(uaIsWindows('Mozilla/5.0 (windows nt 10.0; win64; x64)') === true, 'lowercase "windows" -> Windows (case-insensitive)');
check(uaIsWindows('Mozilla/5.0 (Linux; Android 13; SM-A146P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36') === false, 'Android UA -> not Windows');
check(uaIsWindows('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15') === false, 'iPhone UA -> not Windows');
check(uaIsWindows('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36') === false, 'macOS UA -> not Windows');
check(uaIsWindows('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36') === false, 'Linux UA -> not Windows');
check(uaIsWindows('') === false, 'empty UA -> not Windows');
check(uaIsWindows(undefined) === false, 'missing UA -> not Windows');
check(isWindowsClient() === false, 'outside any request context -> not Windows (default = flags)');
// Concurrency: two interleaved contexts must not leak into each other.
{
  let win = null; let mob = null;
  runWithRequest({ headers: { 'user-agent': 'Windows NT 10.0' } }, () => {
    runWithRequest({ headers: { 'user-agent': 'Android' } }, () => { mob = isWindowsClient(); });
    win = isWindowsClient();
  });
  check(win === true && mob === false, 'nested contexts do not leak (Windows outer, Android inner)');
}

// ---------------------------------------------------------------------------
// 2. formatStream variants on the real corpus
// ---------------------------------------------------------------------------
console.log('\n=== 2. formatStream: flags vs codes on real fixtures ===');
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'stream-format-corpus.json'), 'utf8'));
const jailer = corpus.find((f) => f.id === 'jailer2-torrentio-1');
if (!jailer) { console.log('  ✗ FAIL fixture jailer2-torrentio-1 missing'); fail++; }
const { kept } = processSourceStreams('torrentio', [jailer.raw]);
const p = kept[0];
const flagOut = formatStream(p, {});
const codeOut = formatStream(p, { useTextLangs: true });
const defaultOut = formatStream(p); // no opts at all

eq(flagOut.name, '🚀 FHD', 'flag variant NAME is the resolution badge');
eq(flagOut.description.split('\n')[2], '🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧', 'flag variant Audio line (exact v1.1.5)');
eq(codeOut.description.split('\n')[2], '🎧 DD+ 🔊 5.1 🌐 HI / EN', 'code variant Audio line');
check(!FLAG_RE.test(codeOut.name + '\n' + codeOut.description), 'code variant has ZERO flag emojis anywhere');
check(FLAG_RE.test(flagOut.description), 'flag variant still carries flags');
eq(codeOut.name, flagOut.name, 'NAME identical across variants');
{
  const fLines = flagOut.description.split('\n');
  const cLines = codeOut.description.split('\n');
  eq(cLines.length, fLines.length, 'same line count in both variants');
  for (let i = 0; i < fLines.length; i++) {
    if (i !== 2) eq(cLines[i], fLines[i], `line ${i + 1} byte-identical across variants`);
  }
}
eq(defaultOut.description, flagOut.description, 'no-opts call defaults to flags (v1.1.5 behaviour)');
eq(defaultOut.name, flagOut.name, 'no-opts NAME defaults to flags');
check(codeOut.behaviorHints && flagOut.behaviorHints
  && JSON.stringify(codeOut.behaviorHints) === JSON.stringify(flagOut.behaviorHints),
  'behaviorHints identical across variants');
eq(codeOut.infoHash, flagOut.infoHash, 'infoHash identical across variants');

// Multi-language row: the Dangal fixture carries Hindi + English +
// Russian (flag variant "🇮🇳 / 🇬🇧 / 🇷🇺"). The code variant must show
// one code per language ("HI / EN / RU") — codes never collapse the
// way identical flags do.
{
  const dangal = corpus.find((f) => f.id === 'dangal-torrentio-1');
  if (!dangal) { console.log('  ✗ FAIL fixture dangal-torrentio-1 missing'); fail++; }
  else {
    const { kept: k2 } = processSourceStreams('torrentio', [dangal.raw]);
    check(k2.length === 1, 'dangal fixture keeps the stream');
    if (k2.length) {
      const f2 = formatStream(k2[0], {});
      const c2 = formatStream(k2[0], { useTextLangs: true });
      // No audio codec on this row, so the languages ride a bare 🌐 line.
      const audioF = f2.description.split('\n').find((l) => l.startsWith('🌐')) || '';
      const audioC = c2.description.split('\n').find((l) => l.startsWith('🌐')) || '';
      console.log(`  multi-lang flag Audio: ${audioF}`);
      console.log(`  multi-lang code Audio: ${audioC}`);
      eq(audioF, '🌐 🇮🇳 / 🇬🇧 / 🇷🇺', 'multi-lang flag Audio (exact)');
      eq(audioC, '🌐 HI / EN / RU', 'multi-lang code Audio (one code per language)');
      check(!FLAG_RE.test(c2.description), 'multi-lang code variant has zero flags');
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Badge patterns fire for both variants (and only where they should)
// ---------------------------------------------------------------------------
console.log('\n=== 3. Badge patterns: codes vs flags ===');
const pack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'lib', 'badges.json'), 'utf8'));
const byId = {};
for (const f of pack.filters) {
  let src = f.pattern; let flags = '';
  if (src.startsWith('(?i)')) { src = src.slice(4); flags = 'i'; }
  byId[f.id] = new RegExp(src, flags);
}
const matches = (id, text) => byId[id].test(text);
const flagText = `${flagOut.name}\n${flagOut.description}`;
const codeText = `${codeOut.name}\n${codeOut.description}`;
check(matches('lang-hindi', flagText), 'Hindi badge fires on flag variant');
check(matches('lang-english', flagText), 'English badge fires on flag variant');
check(matches('lang-hindi', codeText), 'Hindi badge fires on code variant (🌐 HI)');
check(matches('lang-english', codeText), 'English badge fires on code variant (🌐 EN)');
check(!matches('lang-hindi', 'Hi Nanna\n🎬 Hi Nanna (2023)\n🎧 DD+ 🌐 🇬🇧'),
  'Hindi does NOT fire on a "Hi" title with English-only flags');
check(!matches('lang-english', '🎬 Some Film\n🎧 DD+ 🌐 🇮🇳'),
  'English does NOT fire on Hindi-only flags');
check(matches('lang-hindi', '🌐 HI'), 'Hindi fires on a bare 🌐 HI Audio line');
check(matches('lang-english', '🌐 EN'), 'English fires on a bare 🌐 EN Audio line');
check(matches('lang-hindi', '🌐 EN / HI'), 'Hindi fires when HI is not first after 🌐');
check(pack.filters.length === 23, `still 23 badges (got ${pack.filters.length})`);

console.log(fail === 0 ? '\nALL CHECKS PASS' : `\n${fail} CHECK(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
