// Binge Addon — per-source parsing, filtering, sorting, formatting.
// Design §7.3–§7.6. Written against captured real responses (see
// ../pretest/*.json): Torrentio flag-emoji language lines, HdHub
// "[host] [size] filename\nHindi" descriptions, behaviorHints.filename
// as the primary parse input for torrents.
//
// MediaFusion is NOT here: dropped from v1 (bare + configured endpoints
// both returned {"streams":[]} for all 3 probe titles — see DEPLOY.md).

'use strict';

// ---------------------------------------------------------------------------
// Language model
// ---------------------------------------------------------------------------

// Flag emoji -> language (regional-indicator pairs).
const FLAG_LANG = {
  '🇮🇳': 'hindi',
  '🇬🇧': 'english',
  '🇺🇸': 'english',
  '🇷🇺': 'russian',
  '🇰🇷': 'korean',
  '🇯🇵': 'japanese',
  '🇨🇳': 'chinese',
  '🇪🇸': 'spanish',
  '🇫🇷': 'french',
  '🇩🇪': 'german',
  '🇹🇭': 'thai',
  '🇻🇳': 'vietnamese',
};

// Word / code tokens -> language. Matched on a lowercased, dot/underscore
// normalised string with word boundaries on BOTH sides. The old patterns
// had no leading boundary, so short codes fired inside other words:
// "Movie" matched "vie" (Vietnamese!), "Animal" matched "mal"
// (Malayalam), "Hotel" matched "tel" (Telugu), "Tiger"/"Danger" matched
// "ger" (German), "within" matched "hin" (Hindi). A language word only
// counts as a standalone token — "[Tam + Hin + Mal + Kan]" still matches
// (the brackets/dots become spaces in the normalised text).
const WORD_LANG = [
  [/\bhindi\b|\bhin\b/, 'hindi'],
  [/\benglish\b|\beng\b/, 'english'],
  [/\btamil\b|\btam\b/, 'tamil'],
  [/\btelugu\b|\btel\b/, 'telugu'],
  [/\bmalayalam\b|\bmal\b/, 'malayalam'],
  [/\bkannada\b|\bkan\b/, 'kannada'],
  [/\bbengali\b|\bben\b/, 'bengali'],
  [/\bmarathi\b|\bmar\b/, 'marathi'],
  [/\bgujarati\b|\bguj\b/, 'gujarati'],
  [/\bpunjabi\b|\bpun\b/, 'punjabi'],
  [/\bkorean\b|\bkor\b/, 'korean'],
  [/\brussian\b|\brus\b/, 'russian'],
  [/\bjapanese\b|\bjpn\b/, 'japanese'],
  [/\bchinese\b|\bchi\b|\bmandarin\b/, 'chinese'],
  [/\bspanish\b|\bspa\b/, 'spanish'],
  [/\bfrench\b|\bfre\b|\bfra\b/, 'french'],
  [/\bgerman\b|\bger\b|\bdeu\b/, 'german'],
  [/\bthai\b/, 'thai'],
  [/\bvietnamese\b|\bvie\b/, 'vietnamese'],
];

// Languages whose presence alone gets a stream dropped (§7.4 step 3).
const DROP_LANGS = new Set([
  'tamil', 'telugu', 'malayalam', 'kannada', 'bengali', 'marathi',
  'gujarati', 'punjabi', 'korean', 'russian', 'japanese', 'chinese',
  'spanish', 'french', 'german', 'thai', 'vietnamese',
]);

// Display language labels. The old flag emojis (🇮🇳🇬🇧) render on clients
// without flag-emoji support as the bare regional-indicator letters
// "IN"+"GB" — the "INGB" in the reported "DD+ DD AAC INGB" line — so
// the description now spells the languages out ("Hindi + English").
// FLAG_LANG (input parsing of source titles) is untouched. Extended to
// every language WORD_LANG can detect: the locked format shows the full
// audio set ("Hindi + Tamil + Telugu"), never just Hindi/English.
const LANG_LABEL = {
  hindi: 'Hindi', english: 'English', tamil: 'Tamil', telugu: 'Telugu',
  malayalam: 'Malayalam', kannada: 'Kannada', bengali: 'Bengali',
  marathi: 'Marathi', gujarati: 'Gujarati', punjabi: 'Punjabi',
  korean: 'Korean', russian: 'Russian', japanese: 'Japanese',
  chinese: 'Chinese', spanish: 'Spanish', french: 'French',
  german: 'German', thai: 'Thai', vietnamese: 'Vietnamese',
};

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

// Resolution: highest token wins for the DROP decision (§7.3). A title
// mentioning both 2160p and 1080p is treated as 2160p and dropped.
function parseResolution(text) {
  if (/\b2160p\b|4k\b|uhd\b|\b2160\b/i.test(text)) return 2160;
  if (/\b1440p\b|\b2k\b/i.test(text)) return 1440;
  if (/\b1080i\b/i.test(text)) return 1080.1; // ranked below 1080p
  if (/\b1080p\b/i.test(text)) return 1080;
  if (/\b720p\b/i.test(text)) return 720;
  if (/\b480p\b|\bsd\b/i.test(text)) return 480;
  return null; // unknown — ranked last (§7.3 safety rule)
}

function parseSeeders(text) {
  const m = text.match(/👤\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseSize(text) {
  const m = text.match(/💾\s*([\d.]+)\s*(GB|MB)/i);
  if (!m) return null;
  return { value: parseFloat(m[1]), unit: m[2].toUpperCase() };
}

function sizeBytes(size) {
  if (!size) return 0;
  return size.unit === 'GB' ? size.value * 1e9 : size.value * 1e6;
}

const AUDIO_TAGS = ['Atmos', 'TrueHD', 'DTS-HD MA', 'DTS', 'DD+', 'DD', 'AAC', 'FLAC', 'Opus', 'AC3', 'EAC3'];
// HDRip/HDTV are real source labels ("1080p HDRip" is the locked Quality
// example) — they were missing, so those streams showed no source at all.
// HDTV also fills the ENCODE_RANK slot that already listed it.
// 'Remux' has NO TAG_RE entry on purpose: findTags falls back to a plain
// case-insensitive substring test for it, and "BDRemux" (no word boundary
// before "Remux") must still match — "remux" only ever means a remux.
const VISUAL_TAGS = ['HDR10+', 'HDR10', 'Dolby Vision', 'DV', 'HDR', 'BluRay', 'WEB-DL', 'WEBRip', 'HDRip', 'HDTV', 'Remux', 'BDRip'];
const ENCODE_TAGS = ['HEVC', 'x265', 'h265', 'AVC', 'x264', 'h264', '10bit'];

function findTags(text, tags) {
  const found = [];
  for (const tag of tags) {
    // Boundary-aware match (TAG_RE): a bare substring test falsely fires
    // inside other words — "DV" in "DVDScr", "HDR" in "HDRip", "DD" in
    // "DD+" / "DDP". Unknown tags fall back to a plain literal test.
    const re = TAG_RE[tag];
    const hit = re ? re.test(text)
      : new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text);
    if (hit) found.push(tag === 'Dolby Vision' ? 'DV' : tag);
  }
  let out = [...new Set(found)];
  // AC3 is Dolby Digital and EAC3 is Dolby Digital Plus — normalise to
  // the DD/DD+ names before subsumption (the "AC3" in "x264 AC3-LOKI"
  // previously vanished from the Audio line entirely).
  if (out.includes('EAC3')) out = out.map((t) => (t === 'EAC3' ? 'DD+' : t));
  if (out.includes('AC3')) out = out.map((t) => (t === 'AC3' ? 'DD' : t));
  // h264/h265 are the same codecs as x264/x265 — normalise so the
  // encode slot shows one name ("x264"), never both.
  if (out.includes('h265')) out = out.map((t) => (t === 'h265' ? 'x265' : t));
  if (out.includes('h264')) out = out.map((t) => (t === 'h264' ? 'x264' : t));
  out = [...new Set(out)];
  // Keep only the most specific variant when several overlap:
  // "DTS-HD MA" subsumes "DTS", "DD+" (incl. "DDP") subsumes "DD",
  // "HDR10+"/"HDR10" subsume plain "HDR".
  if (out.includes('DTS-HD MA')) out = out.filter((t) => t !== 'DTS');
  if (out.includes('DD+')) out = out.filter((t) => t !== 'DD');
  if (out.includes('HDR10+')) out = out.filter((t) => t !== 'HDR10' && t !== 'HDR');
  else if (out.includes('HDR10')) out = out.filter((t) => t !== 'HDR');
  return out;
}

// Per-tag matchers. Lookbehind `(?<![A-Za-z])` keeps tags glued to a
// preceding number ("DD+5.1x264" still yields x264); lookahead blocks a
// following letter so "HDRip" is not HDR and "DVDScr" is not DV, while a
// following digit is fine ("HDR10", "DDP5.1"). "DDP" is Dolby Digital
// Plus, so it maps to "DD+"; "DTS-HDMA" (no space) maps to "DTS-HD MA".
const TAG_RE = {
  Atmos: /(?<![A-Za-z])atmos(?![A-Za-z])/i,
  TrueHD: /(?<![A-Za-z])truehd(?![A-Za-z])/i,
  'DTS-HD MA': /(?<![A-Za-z])dts-hd\s*ma(?![A-Za-z])/i,
  DTS: /(?<![A-Za-z])dts(?![A-Za-z-])/i,
  'DD+': /(?<![A-Za-z])dd\+(?![A-Za-z])|(?<![A-Za-z])ddp(?![A-Za-z])/i,
  DD: /(?<![A-Za-z])dd(?![A-Za-z+])/i,
  AAC: /(?<![A-Za-z])aac(?![A-Za-z])/i,
  FLAC: /(?<![A-Za-z])flac(?![A-Za-z])/i,
  Opus: /(?<![A-Za-z])opus(?![A-Za-z])/i,
  'HDR10+': /(?<![A-Za-z])hdr10\+(?![A-Za-z])/i,
  HDR10: /(?<![A-Za-z])hdr10(?![A-Za-z0-9+])/i,
  'Dolby Vision': /(?<![A-Za-z])dolby\s+vision(?![A-Za-z])/i,
  DV: /(?<![A-Za-z])dv(?![A-Za-z])/i,
  HDR: /(?<![A-Za-z])hdr(?![A-Za-z0-9])/i,
  BluRay: /(?<![A-Za-z])bluray(?![A-Za-z])/i,
  'WEB-DL': /(?<![A-Za-z])web-dl(?![A-Za-z])/i,
  WEBRip: /(?<![A-Za-z])webrip(?![A-Za-z])/i,
  HEVC: /(?<![A-Za-z])hevc(?![A-Za-z])/i,
  x265: /(?<![A-Za-z])x265(?![A-Za-z])/i,
  AVC: /(?<![A-Za-z])avc(?![A-Za-z])/i,
  x264: /(?<![A-Za-z])x264(?![A-Za-z])/i,
  h264: /(?<![A-Za-z])h[.\- ]?264(?![A-Za-z])/i,
  h265: /(?<![A-Za-z])h[.\- ]?265(?![A-Za-z])/i,
  '10bit': /(?<![A-Za-z])10-?bit(?![A-Za-z])/i,
  HDRip: /(?<![A-Za-z])hdrip(?![A-Za-z])/i,
  HDTV: /(?<![A-Za-z])hdtv(?![A-Za-z])/i,
  BDRip: /(?<![A-Za-z])bdrip(?![A-Za-z])/i,
  // EAC3 checked before AC3 by the lookbehind: in "EAC3" the "AC3" is
  // preceded by "E" (a letter), so the AC3 pattern cannot fire inside it.
  AC3: /(?<![A-Za-z])ac3(?![A-Za-z])/i,
  EAC3: /(?<![A-Za-z])eac3(?![A-Za-z])/i,
};

// Screener / pre-release / cam sources. The old \b...\b list missed every
// spelling where the token is glued to another word: "DVDScr" (no boundary
// before "Scr"), "HDTS" (no boundary around "TS"), "PreDVD", and the
// bare words "SCR"/"screener" were not listed at all. These alternatives
// match as substrings because they only occur in screener contexts.
const CAM_RE = /\b(cam|hdcam|ts|tc|telesync|telecine|camrip)\b|dvdscr|dvd-scr|screener|predvd|pre-dvd|hdts|hdtc|\bscr\b/i;

function isCam(text) {
  return CAM_RE.test(text);
}

// CAM kind for the last-resort fallback (v1.1.2, basant: "cam dikha do"):
// best-first rank — TeleCine (0) > TeleSync/HDTS/HDTC (1) >
// DVDScr/Screener/PreDVD (2) > CAM/HDCAM/CAMRip (3). Checked in rank
// order so a row naming two kinds takes the better one.
const CAM_KIND_RE = [
  [/telecine/i, 'TeleCine', 0],
  [/telesync/i, 'TeleSync', 1],
  [/hdts/i, 'HDTS', 1],
  [/hdtc/i, 'HDTC', 1],
  [/dvdscr|dvd-scr/i, 'DVDScr', 2],
  [/screener/i, 'Screener', 2],
  [/\bscr\b/i, 'SCR', 2],
  [/predvd|pre-dvd/i, 'PreDVD', 2],
  [/hdcam/i, 'HDCAM', 3],
  [/camrip/i, 'CAMRip', 3],
  [/\bcam\b/i, 'CAM', 3],
];

function camKind(text) {
  for (const [re, kind, rank] of CAM_KIND_RE) {
    if (re.test(text)) return { kind, rank };
  }
  return { kind: 'CAM', rank: 3 };
}

// Language set from a block of text: flag emojis first, then word tokens.
// Also recognises "Dual Audio"/"Multi" and bare "Original" qualifiers.
function parseLanguages(text) {
  const langs = new Set();
  const lower = text.toLowerCase();
  for (const [flag, lang] of Object.entries(FLAG_LANG)) {
    if (text.includes(flag)) langs.add(lang);
  }
  const norm = lower.replace(/[._\-+]+/g, ' ');
  for (const [re, lang] of WORD_LANG) {
    if (re.test(norm)) langs.add(lang);
  }
  // "Original (Eng)" qualifies as English; bare "Original" is its own tag.
  if (/\boriginal\b/.test(norm)) langs.add('original');
  if (/\bdual\b/.test(norm) || /\bdual audio\b/.test(norm)) langs.add('dual');
  if (/\bmulti\b/.test(norm)) langs.add('multi');
  return langs;
}

// Display audio languages (locked format, v1.1.1): ONE language set per
// stream, shown once, in the Audio line. The Torrentio/Comet flag-emoji
// line is the per-file audio signal and WINS over language words in the
// release filename — a "Telugu HQ HDRip" whose flag line says 🇬🇧/🇮🇳
// shows "Hindi + English", never a second contradictory set. With no
// flags (HdHub), the explicit language words in the lang lines/filename
// are the only signal. Pseudo-tags (dual/multi/original) never display.
// NOTE: p.langs (filtering/sorting) still uses the merged set above;
// this is display-only, so ranking behaviour is unchanged.
function parseAudioLanguages(rawText, cleanText) {
  const flags = new Set();
  for (const [flag, lang] of Object.entries(FLAG_LANG)) {
    if ((rawText || '').includes(flag)) flags.add(lang);
  }
  if (flags.size) return flags;
  const langs = new Set();
  const norm = (cleanText || '').toLowerCase().replace(/[._\-+]+/g, ' ');
  for (const [re, lang] of WORD_LANG) {
    if (re.test(norm)) langs.add(lang);
  }
  return langs;
}

// Channel layout ("5.1", "7.1", "2.0") from the release text. The size
// guard (?!\s*(GB|MB)) keeps "2.5GB"/"1.6GB" sizes out; the (?!\d) guard
// keeps "1.57 GB" decimals out.
const CHANNELS_RE = /([1-7]\.[01])(?!\d)(?!\s*(?:GB|MB)\b)/;
function parseChannels(text) {
  const m = (text || '').match(CHANNELS_RE);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Release group, duration, debrid-ready markers (blueprint format, v1.1.5).
// All three come ONLY from tokens actually present in the raw source
// text; a missing token means its line is omitted, never invented.
// ---------------------------------------------------------------------------

// Tokens that are NOT a release group: codecs, resolutions, sources,
// audio tags, language words, sizes, bitrates, site names/TLDs, junk. A
// trailing token matching any of these is rejected, never shown.
const GROUP_DENY = new Set([
  'hevc', 'x265', 'x264', 'h264', 'h265', 'avc', '10bit', '10-bit',
  '480p', '720p', '1080p', '2160p', '480', '720', '1080', '2160', '4k', 'uhd', '2k',
  'bluray', 'web-dl', 'webdl', 'webrip', 'hdrip', 'hdtv', 'remux', 'bdrip', 'brrip',
  'dvdrip', 'dvdscr', 'dvd-scr', 'screener', 'scr', 'predvd', 'pre-dvd',
  'cam', 'hdcam', 'camrip', 'ts', 'tc', 'hdts', 'hdtc', 'telesync', 'telecine',
  'aac', 'ac3', 'eac3', 'dd', 'ddp', 'dd+', 'dts', 'atmos', 'truehd', 'flac', 'opus',
  'esub', 'esubs', 'sub', 'subs', 'hq', 'true', 'org', 'hc', 'line', 'multi', 'dual',
  'hindi', 'english', 'tamil', 'telugu', 'malayalam', 'kannada', 'bengali',
  'marathi', 'gujarati', 'punjabi', 'korean', 'russian', 'japanese', 'chinese',
  'spanish', 'french', 'german', 'thai', 'vietnamese',
  'ext', 'nogrp', 'nogroup', 'proper', 'repack', 'imax', 'remastered', 'ds4k',
  'com', 'net', 'org', 'io', 'in', 'co', 'cc', 'to', 'me', 'xyz', 'info',
  'site', 'online', 'live', 'top', 'click', 'vip', 'fun', 'app', 'world', 'one',
]);

// Site names (and their variants) can never be a release group:
// "…x264-HDHub4u.Ms" has no group; "…-4kHdHub" is the same site.
const GROUP_SITE_RE = /hdhub|tamilmv|movierulz|filmyzilla|filmywap|9xmovies|vegamovies|moviesflix|worldfree4u|skymovieshd|tamilrockers|moviesda|katmoviehd|7starhd|8xmovies|1tamilmv|5movierulz|bolly4u/i;

function cleanGroupToken(tok) {
  if (!tok) return null;
  const t = tok.trim();
  if (t.length < 2 || t.length > 20) return null;
  const low = t.toLowerCase();
  if (GROUP_DENY.has(low)) return null;
  if (/^\d+(\.\d+)?\s*(gb|mb)$/i.test(t)) return null; // size
  if (/^\d+\s*kbps$/i.test(t)) return null; // bitrate
  if (/^\d+$/.test(t)) return null; // bare number
  if (GROUP_SITE_RE.test(t)) return null; // site name / variant
  return t;
}

// Trailing release group of a release filename ("…-Preacher",
// "…x264 SAMPA", "…x264-[YTS.AM]" -> "YTS", "…(WiKi-LUMiX)" -> "WiKi").
// rawText is the raw filename (or the title's first line when there is no
// filename); cleanText is its cleaned form (dots are spaces, site
// prefixes stripped). The bracketed form is checked on the raw text
// because cleanTitle strips trailing "[…]" tags.
function parseReleaseGroup(rawText, cleanText) {
  const raw = (rawText || '').replace(/\.(mkv|mp4|avi|webm)$/i, '').trim();
  let m = raw.match(/\[([A-Za-z0-9]+)(?:[.\s][^\]]*)?\]\s*$/);
  if (m) { const g = cleanGroupToken(m[1]); if (g) return g; }
  const clean = (cleanText || '').trim();
  if (!clean) return null;
  // Trailing parenthesised group: "(WiKi-LUMiX)" -> "WiKi" (first token).
  m = clean.match(/\(\s*([A-Za-z0-9]+)(?:[-.\s][^)]*)?\)\s*$/);
  if (m) { const g = cleanGroupToken(m[1]); if (g) return g; }
  // Cut a truncated "(…" tail (HdHub descriptions cut mid-token, e.g.
  // "…x265 (DarQ HONE-L"): if the last '(' has no matching ')' after
  // it, drop from that '(' on — a fragment is never a group. Then drop
  // a trailing close bracket and take the last dash/space token.
  let cut = clean;
  const lastOpen = cut.lastIndexOf('(');
  const lastClose = cut.lastIndexOf(')');
  if (lastOpen > lastClose) cut = cut.slice(0, lastOpen).trim();
  cut = cut.replace(/[)\]]\s*$/, '').trim();
  // Greedy prefix forces the LAST dash/space separator, so
  // "AC3-LOKI-M2Tv" yields "M2Tv" (not "AC3-LOKI-M2Tv") and
  // "5.1-Preacher" yields "Preacher" (not "5.1-Preacher").
  m = cut.match(/.*[-–\s]([A-Za-z0-9][A-Za-z0-9._-]{1,19})\s*$/);
  if (!m) return null;
  return cleanGroupToken(m[1].split('.')[0]);
}

// Per-file duration, only when the raw source text actually carries one
// ("41m:22s", "41m 22s", "1h 23m"). Comet titles carry it; Torrentio
// titles do not (verified live 19 Nov: 0 duration tokens in 190
// Torrentio rows for Reacher S4E2). Never derived from size/bitrate.
function parseDuration(text) {
  const m = (text || '').match(/\b(\d{1,3})m(?::|\s+)(\d{1,2})s\b|\b(\d{1,2})h\s+(\d{1,2})m\b/);
  if (!m) return null;
  if (m[1] !== undefined) return `${m[1]}m:${String(m[2]).padStart(2, '0')}s`;
  return `${m[3]}h ${m[4]}m`;
}

// Debrid-ready marker, only when the raw source text carries it
// ("Ready (TB)" / "Ready (RD)" — Comet/MediaFusion titles; Torrentio
// never carries it). Known service names normalise to their 2-letter
// code; an unknown code longer than 4 chars is dropped, never shown.
const READY_CODE = {
  torbox: 'TB', 'real-debrid': 'RD', realdebrid: 'RD', alldebrid: 'AD',
  'all-debrid': 'AD', premiumize: 'PM', 'debrid-link': 'DL', debridlink: 'DL',
  easydebrid: 'ED', pikpak: 'PK', offcloud: 'OC',
};
function parseReady(text) {
  const m = (text || '').match(/\bReady\s*\(\s*([A-Za-z][A-Za-z-]{0,11})\s*\)/i);
  if (!m) return null;
  const raw = m[1].toLowerCase();
  if (READY_CODE[raw]) return READY_CODE[raw];
  const code = m[1].toUpperCase();
  return code.length <= 4 ? code : null;
}

// Debrid-provider label, only when the raw source text carries it
// ("DebridAccount|torbox" — Comet titles; Torrentio/HdHub never carry
// it). The full token is shown as-is; anything else ("dmm_hashlist")
// is Comet/MediaFusion-internal junk and stays out.
function parseDebridProvider(text) {
  const m = (text || '').match(/DebridAccount\|[A-Za-z0-9_.-]+/i);
  return m ? m[0] : null;
}

// Duration in seconds, from the "41m:22s" / "1h 23m" text parseDuration
// returns (null when there is no duration). Used for the bitrate line —
// bitrate is size/duration, never guessed from a missing duration.
function durationSeconds(dur) {
  if (!dur) return null;
  let m = dur.match(/^(\d+)m:(\d+)s$/);
  if (m) return (+m[1]) * 60 + (+m[2]);
  m = dur.match(/^(\d+)h (\d+)m$/);
  if (m) return (+m[1]) * 3600 + (+m[2]) * 60;
  return null;
}

// (v1.2.1: the v1.1.5/v1.1.8 display tables LANG_FLAG, LANG_CODE and
// PROVIDER_LABEL were removed with the blueprint format — the reverted
// v1.1.3 format shows language WORDS, no flags, no codes, no provider
// line. FLAG_LANG above is input parsing of source titles and stays.)

// Hindi first, English second, the rest alphabetical — deterministic, so
// the same stream always renders the same Audio line.
function orderLangs(langs) {
  const real = [...langs].filter((l) => LANG_LABEL[l]);
  const rank = (l) => (l === 'hindi' ? 0 : l === 'english' ? 1 : 2);
  return real.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Per-source parsing
// ---------------------------------------------------------------------------

// Torrentio / Comet: title is multi-line; the LAST line holds flag emojis
// (e.g. "🇬🇧 / 🇷🇺" or "🇮🇳"). behaviorHints.filename is the primary parse
// input for resolution/codec/tags (§7.3).
function parseTorrentioLike(stream) {
  const filename = (stream.behaviorHints && stream.behaviorHints.filename) || '';
  const title = stream.title || stream.name || '';
  const parseText = [filename, title].filter(Boolean).join('\n');
  // Release title for display: filename (clean) beats the raw title —
  // UNLESS the filename is only a site domain ("www.HDSector.com.mkv":
  // a real raw case), which carries no release info; then the title's
  // first line ("Dangal 2016 Hindi 720p HDRip…") is the real name.
  const fromFile = cleanTitle(filename);
  const fromTitle = cleanTitle(firstLine(title));
  const displayTitle = isBareDomainTitle(fromFile) ? (fromTitle || fromFile) : (fromFile || fromTitle);
  // Word-fallback language detection runs on the site-stripped text, so
  // a "www.1TamilMV.io" prefix can never donate a Tamil audio tag.
  const cleanText = [fromFile, fromTitle].filter(Boolean).join('\n');
  return {
    langs: parseLanguages(parseText),
    audioLangs: parseAudioLanguages(parseText, cleanText),
    channels: parseChannels(parseText),
    resolution: parseResolution(parseText),
    seeders: parseSeeders(title),
    size: parseSize(title),
    audio: findTags(parseText, AUDIO_TAGS),
    visual: findTags(parseText, VISUAL_TAGS),
    encode: findTags(parseText, ENCODE_TAGS),
    group: parseReleaseGroup(filename || firstLine(title),
      isBareDomainTitle(fromFile) ? (fromTitle || fromFile) : (fromFile || fromTitle)),
    duration: parseDuration(parseText),
    ready: parseReady(parseText),
    debrid: parseDebridProvider(parseText),
    displayTitle,
    rawText: parseText,
  };
}

// HdHub: description is "[Host] [💾 size] filename.ext\nHindi\npixeldrain | HdHub"
// (or a second line like "Hindi DDP 2.0 + English DDP 5.1"). name holds the
// resolution label ("HdHub 1080p", "4KHDHub 4K").
function parseHdHub(stream) {
  const desc = stream.description || '';
  const name = stream.name || '';
  const lines = desc.split('\n').map((l) => l.trim()).filter(Boolean);
  let fileLine = lines[0] || '';
  // Leading bracketed groups are host/size labels, not the filename:
  // "[PixelDrain] [💾 2GB] Dangal.2016...mkv". The old filename regex
  // started matching after the 💾 (not in its char class), leaving a
  // junk "2GB] Dangal..." display title. Strip host/size groups first.
  // "[10Gbps Download Only]" is the same kind of host label — without it,
  // TRUNCATED descriptions (no .mkv at the end, so the filename regex
  // below cannot match) kept the whole label in the display title:
  // "[10Gbps Download Only] [💾 34.07 GB] Interstellar (2014)".
  for (;;) {
    const m = fileLine.match(/^\s*\[([^\]]*)\]\s*/);
    if (!m) break;
    const inner = m[1];
    if (/💾/.test(inner) || /^\s*[\d.]+\s*(GB|MB)\s*$/i.test(inner)
      || /pixeldrain|gdrive|mega|filepress|drive|download|upload|gbps|mbps|streaming/i.test(inner)) {
      fileLine = fileLine.slice(m[0].length);
    } else break;
  }
  // Filename is the last bracketed token run in the first line.
  const fileMatch = fileLine.match(/([A-Za-z0-9._\-()[\] ]+\.(mkv|mp4|avi|webm))\s*$/i)
    || fileLine.match(/(\S+\.(mkv|mp4|avi|webm))/i);
  const filename = fileMatch ? fileMatch[1] : fileLine;
  const langLines = lines.slice(1).join(' ');
  const parseText = [filename, langLines, name].filter(Boolean).join('\n');
  const cleanText = [cleanTitle(filename), langLines, name].filter(Boolean).join('\n');
  return {
    langs: parseLanguages(parseText),
    audioLangs: parseAudioLanguages(parseText, cleanText),
    channels: parseChannels(parseText),
    resolution: parseResolution(parseText),
    seeders: null, // HTTP direct links carry no seeders
    size: parseSize(desc) || (stream.behaviorHints && stream.behaviorHints.videoSize
      ? { value: stream.behaviorHints.videoSize / 1e9, unit: 'GB' } : null),
    audio: findTags(parseText, AUDIO_TAGS),
    visual: findTags(parseText, VISUAL_TAGS),
    encode: findTags(parseText, ENCODE_TAGS),
    group: parseReleaseGroup(filename, cleanTitle(filename)),
    duration: parseDuration(parseText),
    ready: parseReady(parseText),
    debrid: parseDebridProvider(parseText),
    displayTitle: cleanTitle(filename),
    rawText: parseText,
  };
}

const PARSERS = {
  torrentio: parseTorrentioLike,
  comet: parseTorrentioLike, // same line-anchored shape (§7.3)
  hdhub: parseHdHub,
};

function firstLine(text) {
  return (text || '').split('\n')[0].trim();
}

// True when a cleaned title is just a site domain ("www HDSector com")
// with no release info at all — no year, resolution, or codec token.
// A real title always carries at least one of those.
function isBareDomainTitle(t) {
  if (!t) return true;
  if (/\b(19|20)\d\d\b|\b(480|720|1080|2160)p?\b|\b(x264|x265|hevc|avc|web-dl|bluray|hdrip|aac|dd\+?|dts)\b/i.test(t)) return false;
  return /^\s*www\s+\S+(\s+\S+)?\s*$/i.test(t)
    || new RegExp(`^\\s*\\S+\\s+(?:${SITE_TLDS.join('|')})\\s*$`, 'i').test(t);
}

// Site/spam tokens stripped from display titles. TLDs and known piracy-
// site names only — never a bare digit test, so "[1080p]", "[720p]" and
// language brackets like "[Tam + Hin + Mal + Kan]" survive.
const SITE_TLDS = ['com', 'net', 'org', 'io', 'in', 'co', 'cc', 'to', 'me',
  'xyz', 'info', 'site', 'online', 'live', 'top', 'click', 'vip', 'fun',
  'app', 'world', 'one'];
const SITE_WORDS = ['movierulz', 'tamilmv', 'tamilvaathi', 'bolly4u',
  'hdhub4u', 'filmyzilla', 'filmywap', '9xmovies', 'vegamovies',
  'moviesflix', 'worldfree4u', 'skymovieshd', 'tamilrockers', 'moviesda',
  'katmoviehd', '7starhd', '8xmovies', '1tamilmv', '5movierulz'];
const SITE_ALT = [...SITE_WORDS, ...SITE_TLDS].join('|');

// Strip release-site spam from an already space-normalised title:
// leading "www <site> <word> - " prefixes, bare "<site> - " prefixes,
// bracketed "[<site> ...]" tags anywhere, trailing "-<site> ..." groups
// and trailing "- www <site> ..." promos. Badge tokens (1080p, HDR,
// HEVC/x265, WEB-DL, DD+5.1, sizes) are never in these patterns.
function stripSitePrefix(t) {
  let out = t;
  // Leading junk size fragment (HdHub fallback): "12.91 GB] Ranabaali…".
  out = out.replace(/^\s*\d+(\.\d+)?\s*(GB|MB)\]?\s*/i, '');
  for (let i = 0; i < 3; i++) {
    const before = out;
    // "www 5MovieRulz company - ", "www 1TamilMV io - ", "www 1TamilMV solar - "
    out = out.replace(/^\s*www\s+(?:\S+\s+){1,2}[-–:|]\s*/i, '');
    // Bare site prefix: "5MovieRulz - ", "5MovieRulz company - ",
    // "1TamilMV io - " (digit-carrying token or known site word, then an
    // optional second word, then a dash). A leading "<word> <word> - "
    // before the movie name is a site prefix in release titles — the
    // movie name itself is always followed by its year, not a dash.
    out = out.replace(new RegExp(
      `^\\s*(?:[A-Za-z0-9]*\\d[A-Za-z0-9]*|${SITE_WORDS.join('|')})(?:\\s+\\S+)?\\s*[-–:|]\\s*`, 'i'), '');
    // Leading bracketed site tag: "[Bolly4u org] Ranabaali…".
    out = out.replace(new RegExp(`^\\s*\\[[^\\]]*\\b(?:${SITE_ALT})\\b[^\\]]*\\]\\s*[-–:]?\\s*`, 'i'), '');
    if (out === before) break;
  }
  // Bracketed site tag anywhere mid-title: "Ranabaali 2026 [Bolly4u org] WEB-DL…".
  out = out.replace(new RegExp(`\\[[^\\]]*\\b(?:${SITE_ALT})\\b[^\\]]*\\]`, 'gi'), '');
  // Trailing release-group site suffix: "…x265-HDHub4u Ms", "…x264 HDHub4u".
  out = out.replace(new RegExp(`\\s*[-–]\\s*(?:${SITE_WORDS.join('|')})\\b.*$`, 'i'), '');
  out = out.replace(new RegExp(`\\s+(?:${SITE_WORDS.join('|')})\\b.*$`, 'i'), '');
  // Trailing site promo: "…ESubs - www TamilVaathi online".
  out = out.replace(/\s*[-–]\s*www\s.*$/i, '');
  return out.replace(/\s+/g, ' ').trim();
}

// "Dangal.2016.1080p.BluRay.x264-[YTS.AM].mp4" -> "Dangal 2016 1080p BluRay x264"
function cleanTitle(text) {
  if (!text) return '';
  let t = text.replace(/\.(mkv|mp4|avi|webm)$/i, '');
  // Dots are word separators ("Dangal.2016.1080p") EXCEPT a decimal dot
  // between two digits with a short fraction ("DD+5.1", "1.5GB",
  // "3.19GB"). The old /[._]+/g -> ' ' turned every decimal into
  // "DD+5 1" / "1 5GB". A 3+-digit run after the dot is a year/res
  // separator ("2016.1080p" -> "2016 1080p"), not a decimal.
  t = t.replace(/\./g, (m, off, str) => {
    const prev = str[off - 1];
    const next = str[off + 1];
    if (/\d/.test(prev || '') && /\d/.test(next || '')) {
      let run = 0;
      for (let j = off + 1; j < str.length && /\d/.test(str[j]); j++) run++;
      if (run <= 2) return '.';
    }
    return ' ';
  });
  t = t.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  t = stripSitePrefix(t);
  // Strip trailing bracketed release-group tags like "[YTS AM]" and
  // trailing "{imdb-tt...}" metadata, plus a leftover trailing dash.
  t = t.replace(/\s*\[[^\]]*\]\s*$/g, '').trim();
  t = t.replace(/\s*\{[^}]*\}\s*$/g, '').trim();
  t = t.replace(/[-–—]+\s*$/, '').trim();
  return t;
}

// Locked display name (v1.1.1, basant-approved): title + year ONLY —
// "Jailer 2 (2026)" — plus the SxxExx tag for series ("Mirzapur S01E01").
// Everything after the year (resolution, source, codec, size, release
// group, junk) is cut: those signals live in the labeled lines. A repeated year ("Interstellar 2014 2014") collapses — the title
// is cut at the FIRST year. No year and no series tag: cut at the first
// tech token instead. Returns '' when nothing usable remains; the caller
// falls back to the full cleaned title.
function extractDisplayName(cleaned) {
  const base = extractBaseTitle(cleaned);
  if (!base) return '';
  const series = (cleaned || '').match(/\bS(\d{1,2})E(\d{1,2})\b/i);
  if (series) return `${base} S${String(series[1]).padStart(2, '0')}E${String(series[2]).padStart(2, '0')}`;
  return base;
}

// Title + year only, WITHOUT the SxxExx tag ("Reacher (2022)").
// extractDisplayName adds the tag back for series; the helper stays
// exported for tests.
function extractBaseTitle(cleaned) {
  const t = (cleaned || '').trim();
  if (!t) return '';
  const year = t.match(/\b(19|20)\d\d\b/);
  const series = t.match(/\bS(\d{1,2})E(\d{1,2})\b/i);
  let cut = t.length;
  if (year) cut = Math.min(cut, year.index);
  if (series) cut = Math.min(cut, series.index);
  if (!year && !series) {
    const tech = t.match(/\b(480|720|1080|2160)p?\b|\b(bluray|web-dl|webrip|hdrip|hdtv|hevc|x264|x265|avc|aac|dd\+?|dts|atmos|truehd|ac3|eac3)\b/i);
    if (tech) cut = Math.min(cut, tech.index);
  }
  let title = t.slice(0, cut);
  // "Jailer-2" -> "Jailer 2" (hyphen between word and digit is a
  // separator in release names); "Spider-Man" keeps its hyphen.
  title = title.replace(/([A-Za-z])-(\d)/g, '$1 $2').replace(/(\d)-([A-Za-z])/g, '$1 $2');
  title = title.replace(/[\s\-–—:([{]+$/g, '').replace(/\s+/g, ' ').trim();
  if (!title) return '';
  return year ? `${title} (${year[0]})` : title;
}

// ---------------------------------------------------------------------------
// Filtering (§7.4)
// ---------------------------------------------------------------------------

// Returns 'keep' | 'drop' | 'unknown'.
function languageVerdict(langs) {
  if (langs.has('hindi')) return 'keep';
  if (langs.has('english')) {
    // Design's strict reading drops English + drop-language mixes; in
    // practice the file still has English audio, so keep it at English
    // rank. Only a set with NO Hindi/English at all is dropped.
    return 'keep';
  }
  const real = [...langs].filter((l) => !['dual', 'multi', 'original'].includes(l));
  if (real.length === 0) {
    if (langs.has('dual') || langs.has('multi') || langs.has('original')) return 'keep';
    return 'unknown'; // L empty -> D1 include-last
  }
  if (real.every((l) => DROP_LANGS.has(l))) return 'drop';
  return 'unknown';
}

// Language rank (§7.5 step 1).
function languageRank(langs) {
  if (langs.has('hindi')) return 0;
  if (langs.has('english') && ![...langs].some((l) => DROP_LANGS.has(l))) return 1;
  if (langs.has('english')) return 1; // English present in a mix
  if (langs.has('original') && ![...langs].some((l) => DROP_LANGS.has(l))) return 2;
  if (langs.has('dual') || langs.has('multi')) return 3;
  if (langs.has('original')) return 2;
  return 4; // Unknown
}

const RES_RANK = { 1080: 0, 1080.1: 1, 720: 2, 480: 3 };
function resolutionRank(res) {
  if (res === null || res === undefined) return 4; // unknown last
  return RES_RANK[res] !== undefined ? RES_RANK[res] : 4;
}

// (v1.2.3: the old ENCODE_RANK pure-quality order — BluRay > WEB-DL >
// WEBRip > HDTV, biggest size first — is gone from compareParsed. The
// size-aware rank above replaces it: an oversized Remux must fall below
// an efficient encode. v1.2.4: inside a size class the tier orders
// first (Remux > BluRay > WEB-DL > BDRip > WEBRip > HDRip > HDTV),
// and smaller size wins only inside the same tier.)

// Full pipeline for one source's raw streams: parse -> filter -> sort.
// Returns { kept: [parsed], cam: [parsed], dropped: { reason: count } }.
// CAM streams (v1.1.2 last-resort fallback): a row that fails ONLY the
// CAM check is retained in `cam` — it must still pass the resolution cap
// (checked above) and the language verdict, and the 0-seeder rule applies
// to the cam list too. A 2160p CAM or a Tamil-only CAM stays dropped.
// `cam` is sorted best-first: camRank, then compareParsed.
function processSourceStreams(sourceName, rawStreams, opts = {}) {
  const parse = PARSERS[sourceName] || parseTorrentioLike;
  const dropped = { noPlayable: 0, over1080: 0, cam: 0, langDrop: 0 };
  const parsed = [];
  let cam = [];
  // v1.2.7: maxRes is the profile ceiling (desktop/phone 1080, TV
  // 2160). A resolution above the ceiling is dropped — for 1080 that
  // is exactly the old rule (2160 + 1440 dropped; 1080 dropped only
  // when maxRes is 720). 1080i counts as 1080 for the cap (it was kept
  // at maxRes 1080 before, and must stay kept). opts.profileCfg is the
  // resolved profile cfg (defaults to desktop = v1.2.4 behaviour).
  const maxRes = typeof opts.maxRes === 'number' ? opts.maxRes : 1080;
  const profileCfg = (opts.profileCfg && typeof opts.profileCfg === 'object')
    ? opts.profileCfg : DEFAULT_PROFILES.desktop;

  for (const s of rawStreams) {
    if (!s || (!s.infoHash && !s.url)) { dropped.noPlayable++; continue; }
    const p = parse(s);
    p.source = sourceName;
    p.raw = s;
    const resForCap = p.resolution === 1080.1 ? 1080 : p.resolution;
    if (resForCap !== null && resForCap !== undefined && resForCap > maxRes) { dropped.over1080++; continue; }
    // v1.2.7: a resolution the profile disables (not in its
    // resolutionOrder) is dropped — e.g. TV with 4K off, or a profile
    // with 720p switched off. Unknown resolution (null) is never
    // dropped here; it ranks last in the comparator.
    if (p.resolution !== null && p.resolution !== undefined
      && !profileCfg.resolutionOrder.includes(p.resolution)) { dropped.disabledRes = (dropped.disabledRes || 0) + 1; continue; }
    if (isCam(p.rawText)) {
      dropped.cam++;
      const verdict = languageVerdict(p.langs);
      if (verdict === 'drop') { dropped.langDrop++; continue; }
      const { kind, rank } = camKind(p.rawText);
      p.isCam = true;
      p.camKind = kind;
      p.camRank = rank;
      p.unknownLang = verdict === 'unknown';
      cam.push(p);
      continue;
    }
    const verdict = languageVerdict(p.langs);
    if (verdict === 'drop') { dropped.langDrop++; continue; }
    p.unknownLang = verdict === 'unknown';
    parsed.push(p);
  }

  // 0-seeder rule (§7.4 step 4): drop 0-seeders when a seeded alternative
  // exists in the same source batch.
  const hasSeeded = parsed.some((p) => p.seeders !== null && p.seeders >= 1);
  let kept = parsed;
  if (hasSeeded) {
    const before = kept.length;
    kept = kept.filter((p) => p.seeders !== 0);
    dropped.zeroSeeder = before - kept.length;
  }

  // Same 0-seeder rule inside the cam pool: a 0-seeder CAM goes only when
  // a seeded CAM exists in the same source batch.
  const hasSeededCam = cam.some((p) => p.seeders !== null && p.seeders >= 1);
  if (hasSeededCam) {
    const before = cam.length;
    cam = cam.filter((p) => p.seeders !== 0);
    dropped.camZeroSeeder = before - cam.length;
  }

  kept.sort((x, y) => compareWithProfile(x, y, profileCfg));
  cam.sort((x, y) => compareCamWithProfile(x, y, profileCfg));
  return { kept, cam, dropped };
}

// Best-first CAM order: camRank, then the normal clean ranking.
function compareCam(a, b) {
  if (a.camRank !== b.camRank) return a.camRank - b.camRank;
  return compareParsed(a, b);
}

// ---------------------------------------------------------------------------
// Size-aware ranking (v1.2.3, basant: top stream must be 1080p, good
// quality, BEST BY SIZE — his Jio data is 3 GB/day, and a 32 GB Remux on
// top would eat 10 days for one movie). RE-RANK ONLY: size never drops a
// stream — a title with only a Remux still shows its Remux.
// v1.2.4: inside a size class, quality tier orders FIRST (see
// qualityTier below) — WEB-DL outranks WEBRip even when smaller.
// ---------------------------------------------------------------------------

// Sweet-spot band for a ~2.5 h feature film: WEB-DL / BDRip / encoded
// BluRay / HDRip in this band are the top rank. Above 12 GB is
// oversized (Remux territory); below 0.7 GB for a feature is
// suspiciously tiny (likely a fake / mislabelled / butchered encode) and
// must never outrank a normal encode — size wins only inside the sane
// band. Unknown size (no 💾 token) ranks as large: it cannot prove it
// is efficient, but it is not punished as oversized or tiny.
const EFFICIENT_MAX_GB = 5;
const LARGE_MAX_GB = 12;
const TINY_MIN_GB = 0.7;
const FEATURE_MINUTES = 150; // runtime normalisation baseline

// Size class: 0 efficient < 1 large < 2 oversized < 3 suspiciously tiny.
// When a per-file duration is known (Comet rows carry one), the size is
// normalised to a 150-minute feature first, so a 45-min episode at
// 600 MB is efficient, not tiny. Without a duration the absolute size
// is used.
function sizeClass(p) {
  const bytes = sizeBytes(p.size);
  if (!p.size || bytes <= 0) return 1;
  let gb = bytes / 1e9;
  const dur = durationSeconds(p.duration);
  if (dur && dur > 0) gb = (gb * FEATURE_MINUTES * 60) / dur;
  if (gb < TINY_MIN_GB) return 3;
  if (gb <= EFFICIENT_MAX_GB) return 0;
  if (gb <= LARGE_MAX_GB) return 1;
  return 2;
}

// Quality tier INSIDE a size class (v1.2.4, basant: WEB-DL must rank
// above WEBRip — his Pushpa 2 list topped with a 2 GB WEBRip while a
// 2.4 GB WEB-DL sat below it, because v1.2.3 sorted by size first
// inside the band). Tier first, then smaller size inside the tier:
// Remux > BluRay > WEB-DL > BDRip > WEBRip > HDRip > HDTV > no tag.
// Size class still dominates (a large-class WEB-DL never jumps an
// efficient BluRay), and Remux stays safe: a 32 GB Remux is class 2
// (oversized) so it still falls below efficient encodes — tier only
// orders rows that are already in the same size class.
const SOURCE_TIER = {
  Remux: 0, BluRay: 1, 'WEB-DL': 2, BDRip: 3, WEBRip: 4, HDRip: 5, HDTV: 6,
};
function qualityTier(visual) {
  let best = 7; // no source tag: quality is unverifiable, ranks last
  for (const t of visual) {
    const r = SOURCE_TIER[t];
    if (r !== undefined && r < best) best = r;
  }
  return best;
}

// v1.2.7: data-driven comparator. A profile cfg (see
// lib/profiles.js) drives the whole rank:
//   keyOrder: which keys, in which order (desktop/phone:
//   language > resolution > sizeClass > tier > size > seeders; TV:
//   language > tier > resolution > size > seeders — no size class).
//   resolutionOrder: resolutions best-first; a resolution NOT in the
//   list ranks last (the filter drops it first when the profile
//   disables it). sizeClassOrder: null = size classes off (TV).
//   tierOrder: quality tiers best-first; 'none' = no source tag.
//   sizeDirection: 'asc' (smaller first — data saving) or 'desc'
//   (bigger first — TV, bigger = better quality).
function tierRank(visual, tierOrder) {
  let best = tierOrder.length; // unknown tag ranks after every listed tier
  for (const t of visual) {
    const i = tierOrder.indexOf(t);
    if (i !== -1 && i < best) best = i;
  }
  if (best === tierOrder.length) {
    const none = tierOrder.indexOf('none');
    return none === -1 ? tierOrder.length : none;
  }
  return best;
}

function resolutionRankFor(res, resolutionOrder) {
  if (res === null || res === undefined) return resolutionOrder.length;
  const i = resolutionOrder.indexOf(res);
  return i === -1 ? resolutionOrder.length : i;
}

function sizeClassRank(p, sizeClassOrder) {
  if (!sizeClassOrder) return 0; // size classes off — all equal
  const i = sizeClassOrder.indexOf(sizeClass(p));
  return i === -1 ? sizeClassOrder.length : i;
}

function compareWithProfile(a, b, cfg) {
  for (const key of cfg.keyOrder) {
    if (key === 'language') {
      const la = a.unknownLang ? 4 : languageRank(a.langs);
      const lb = b.unknownLang ? 4 : languageRank(b.langs);
      if (la !== lb) return la - lb;
    } else if (key === 'resolution') {
      const ra = resolutionRankFor(a.resolution, cfg.resolutionOrder);
      const rb = resolutionRankFor(b.resolution, cfg.resolutionOrder);
      if (ra !== rb) return ra - rb;
    } else if (key === 'sizeClass') {
      const ca = sizeClassRank(a, cfg.sizeClassOrder);
      const cb = sizeClassRank(b, cfg.sizeClassOrder);
      if (ca !== cb) return ca - cb;
    } else if (key === 'tier') {
      const ta = tierRank(a.visual, cfg.tierOrder);
      const tb = tierRank(b.visual, cfg.tierOrder);
      if (ta !== tb) return ta - tb;
    } else if (key === 'size') {
      const sa = sizeBytes(a.size);
      const sb = sizeBytes(b.size);
      if (sa !== sb) return cfg.sizeDirection === 'desc' ? sb - sa : sa - sb;
    } else if (key === 'seeders') {
      const sea = a.seeders === null ? -1 : a.seeders;
      const seb = b.seeders === null ? -1 : b.seeders;
      if (sea !== seb) return seb - sea; // seeders: final tiebreak only
    }
  }
  // Deterministic final tiebreak: the same set of streams must always
  // order the same way, regardless of source arrival order.
  const na = a.displayTitle || '';
  const nb = b.displayTitle || '';
  if (na !== nb) return na < nb ? -1 : 1;
  const ka = (a.raw && (a.raw.infoHash || a.raw.url)) || '';
  const kb = (b.raw && (b.raw.infoHash || b.raw.url)) || '';
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

function compareCamWithProfile(a, b, cfg) {
  if (a.camRank !== b.camRank) return a.camRank - b.camRank;
  return compareWithProfile(a, b, cfg);
}

// The desktop default cfg reproduces v1.2.4 EXACTLY (same key order,
// same resolution/tier/size-class orders, same size-asc + seeders
// tiebreak) — compareParsed delegates to it, so desktop output is
// byte-identical to v1.2.4 for the same inputs.
const { DEFAULT_PROFILES } = require('./profiles');

function compareParsed(a, b) {
  return compareWithProfile(a, b, DEFAULT_PROFILES.desktop);
}

// Dedupe after sorting, keeping the best-ranked copy (§7.3).
function dedupe(parsedList) {
  const seen = new Set();
  const out = [];
  for (const p of parsedList) {
    const s = p.raw;
    const key = s.infoHash ? `${s.infoHash}:${s.fileIdx ?? 0}` : (s.url || '');
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatting (§7.6)
// ---------------------------------------------------------------------------

function resLabel(res) {
  if (res === 1080.1) return '1080i';
  if (res) return `${res}p`;
  return 'Unknown';
}

// Locked display format (v1.1.1, basant-approved Telegram-channel style) —
// restored in v1.2.1 (basant: "formate phele jaise hi kar do bhai"): the
// v1.1.5 blueprint layout and the v1.1.8 Windows code variant are gone.
//   Name:    "Jailer 2 (2026)"                 (title + year only)
//   Quality: 1080p HDRip                       (resolution + source + HDR)
//   Audio:   Hindi + English | DD+ 5.1         (languages | codec + channels)
//   Size:    1.57 GB                           (size once)
// Each signal appears exactly once, in its own labeled line; a line is
// omitted entirely when its signal is genuinely missing — never invented.
// Dropped from display by design (see the before/after table in
// tests/test-stream-format.js): video encode (HEVC/x264 — the badge pack
// already dropped the encoder group in v1.0.6 for the same reason),
// secondary audio tracks (only the primary codec shows — the locked
// example shows "DD+ 5.1" for a stream that also carries AAC),
// release groups, bitrates (192Kbps), ESub/ORG/HQ/TRUE/LiNE/HC junk,
// the filename's rounded size (the 💾 size is authoritative).
function formatStream(p) {
  const s = p.raw;
  const res = resLabel(p.resolution);
  const name = extractDisplayName(p.displayTitle) || p.displayTitle || 'Binge Addon';

  // Quality: resolution + source + HDR variant, each once.
  // v1.1.2 CAM fallback: a CAM stream is marked IN the Quality line
  // ("720p CAM TeleSync") — that marking is the whole warning (v1.1.3
  // removed the extra Note line). Clean streams are never marked.
  const qualityBits = [];
  if (p.resolution) qualityBits.push(resLabel(p.resolution));
  if (p.isCam) {
    qualityBits.push('CAM');
    if (p.camKind && !['CAM', 'HDCAM', 'CAMRip'].includes(p.camKind)) qualityBits.push(p.camKind);
  }
  const source = ['BluRay', 'WEB-DL', 'WEBRip', 'HDRip', 'HDTV', 'Remux'].find((t) => p.visual.includes(t));
  if (source) qualityBits.push(source);
  for (const t of p.visual) {
    if (t === 'HDR10+' || t === 'HDR10' || t === 'HDR') qualityBits.push(t);
    else if (t === 'DV') qualityBits.push('Dolby Vision');
  }

  // Audio: languages first, then the PRIMARY codec + channels. findTags
  // returns codecs in priority order (Atmos > TrueHD > DTS-HD MA > DTS >
  // DD+ > DD > AAC...), so audio[0] is the best track; secondary tracks
  // ("DD+ 5.1 & AAC") are dropped — the locked example shows exactly one
  // codec ("DD+ 5.1") for a stream that also carries AAC. Languages come
  // from p.audioLangs — the single flag-priority set — so the title can
  // never contradict the line.
  const audioLangs = p.audioLangs
    || new Set([...p.langs].filter((l) => LANG_LABEL[l]));
  const langPart = orderLangs(audioLangs).map((l) => LANG_LABEL[l]).join(' + ');
  let codecPart = '';
  if (p.audio.length) {
    codecPart = p.audio[0];
    if (p.channels) codecPart += ` ${p.channels}`;
  }
  const audioPart = [langPart, codecPart].filter(Boolean).join(' | ');

  const lines = [];
  if (qualityBits.length) lines.push(`Quality: ${qualityBits.join(' ')}`);
  if (audioPart) lines.push(`Audio: ${audioPart}`);
  if (p.size) lines.push(`Size: ${p.size.value} ${p.size.unit}`);

  const hints = {};
  if (s.behaviorHints) {
    for (const k of ['filename', 'videoHash', 'videoSize']) {
      if (s.behaviorHints[k] !== undefined) hints[k] = s.behaviorHints[k];
    }
    if (s.behaviorHints.notWebReady !== undefined) hints.notWebReady = s.behaviorHints.notWebReady;
  }
  // bingeGroup so Nuvio's auto-play-next picks the same profile (§7.6).
  const primaryLang = p.langs.has('hindi') ? 'hindi' : p.langs.has('english') ? 'english' : 'other';
  hints.bingeGroup = `binge-addon:${res}:${primaryLang}`;

  // notWebReady: only for URL streams, when non-HTTPS or non-MP4 (§7.6).
  if (s.url && hints.notWebReady === undefined) {
    const isHttps = s.url.startsWith('https://');
    const isMp4 = /\.mp4(\?|$)/i.test(s.url);
    if (!isHttps || !isMp4) hints.notWebReady = true;
  }

  const out = {
    name,
    description: lines.join('\n'),
    behaviorHints: hints,
  };
  if (s.infoHash) {
    out.infoHash = s.infoHash;
    if (s.fileIdx !== undefined && s.fileIdx !== null) out.fileIdx = s.fileIdx;
  }
  if (s.url) out.url = s.url;
  if (s.sources) out.sources = s.sources;
  return out;
}

module.exports = {
  parseLanguages, parseAudioLanguages, parseChannels, parseResolution,
  parseSeeders, parseReleaseGroup, parseDuration, parseReady,
  parseDebridProvider, durationSeconds,
  languageVerdict, languageRank, compareParsed, compareCam, sizeClass,
  qualityTier, compareWithProfile, compareCamWithProfile,
  tierRank, resolutionRankFor, sizeClassRank,
  camKind, processSourceStreams, dedupe, formatStream, cleanTitle, extractDisplayName,
  extractBaseTitle,
};

