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
// normalised string with word boundaries.
const WORD_LANG = [
  [/hindi|hin\b/, 'hindi'],
  [/english|eng\b/, 'english'],
  [/tamil|tam\b/, 'tamil'],
  [/telugu|tel\b/, 'telugu'],
  [/malayalam|mal\b/, 'malayalam'],
  [/kannada|kan\b/, 'kannada'],
  [/bengali|ben\b/, 'bengali'],
  [/marathi|mar\b/, 'marathi'],
  [/gujarati|guj\b/, 'gujarati'],
  [/punjabi|pun\b/, 'punjabi'],
  [/korean|kor\b/, 'korean'],
  [/russian|rus\b/, 'russian'],
  [/japanese|jpn\b/, 'japanese'],
  [/chinese|chi\b|mandarin/, 'chinese'],
  [/spanish|spa\b/, 'spanish'],
  [/french|fre\b|fra\b/, 'french'],
  [/german|ger\b|deu\b/, 'german'],
  [/thai\b/, 'thai'],
  [/vietnamese|vie\b/, 'vietnamese'],
];

// Languages whose presence alone gets a stream dropped (§7.4 step 3).
const DROP_LANGS = new Set([
  'tamil', 'telugu', 'malayalam', 'kannada', 'bengali', 'marathi',
  'gujarati', 'punjabi', 'korean', 'russian', 'japanese', 'chinese',
  'spanish', 'french', 'german', 'thai', 'vietnamese',
]);

const LANG_FLAG = { hindi: '🇮🇳', english: '🇬🇧' };

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

const AUDIO_TAGS = ['Atmos', 'TrueHD', 'DTS-HD MA', 'DTS', 'DD+', 'DD', 'AAC', 'FLAC', 'Opus'];
const VISUAL_TAGS = ['HDR10+', 'HDR10', 'Dolby Vision', 'DV', 'HDR', 'BluRay', 'WEB-DL', 'WEBRip'];
const ENCODE_TAGS = ['HEVC', 'x265', 'AVC', 'x264', '10bit'];

function findTags(text, tags) {
  const found = [];
  for (const tag of tags) {
    // Escape regex chars; "DD+" needs literal matching.
    const re = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(text)) found.push(tag === 'Dolby Vision' ? 'DV' : tag);
  }
  // Dedupe DV vs Dolby Vision double-hit, keep first occurrence order.
  return [...new Set(found)];
}

function isCam(text) {
  return /\b(cam|hdcam|ts|tc|telesync|telecine|camrip)\b/i.test(text);
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
  return {
    langs: parseLanguages(parseText),
    resolution: parseResolution(parseText),
    seeders: parseSeeders(title),
    size: parseSize(title),
    audio: findTags(parseText, AUDIO_TAGS),
    visual: findTags(parseText, VISUAL_TAGS),
    encode: findTags(parseText, ENCODE_TAGS),
    // Release title for display: filename (clean) beats the raw title.
    displayTitle: cleanTitle(filename) || cleanTitle(firstLine(title)),
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
  const fileLine = lines[0] || '';
  // Filename is the last bracketed token run in the first line.
  const fileMatch = fileLine.match(/([A-Za-z0-9._\-()[\] ]+\.(mkv|mp4|avi|webm))\s*$/i)
    || fileLine.match(/(\S+\.(mkv|mp4|avi|webm))/i);
  const filename = fileMatch ? fileMatch[1] : fileLine;
  const langLines = lines.slice(1).join(' ');
  const parseText = [filename, langLines, name].filter(Boolean).join('\n');
  return {
    langs: parseLanguages(parseText),
    resolution: parseResolution(parseText),
    seeders: null, // HTTP direct links carry no seeders
    size: parseSize(desc) || (stream.behaviorHints && stream.behaviorHints.videoSize
      ? { value: stream.behaviorHints.videoSize / 1e9, unit: 'GB' } : null),
    audio: findTags(parseText, AUDIO_TAGS),
    visual: findTags(parseText, VISUAL_TAGS),
    encode: findTags(parseText, ENCODE_TAGS),
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

// "Dangal.2016.1080p.BluRay.x264-[YTS.AM].mp4" -> "Dangal 2016 1080p BluRay x264"
function cleanTitle(text) {
  if (!text) return '';
  let t = text.replace(/\.(mkv|mp4|avi|webm)$/i, '');
  t = t.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  // Strip trailing bracketed release-group tags like "[YTS AM]".
  t = t.replace(/\s*\[[^\]]*\]\s*$/g, '').trim();
  return t;
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

const ENCODE_RANK = { BluRay: 0, 'WEB-DL': 1, WEBRip: 2, HDTV: 3 };
function encodeRank(visual) {
  for (const tag of visual) {
    if (ENCODE_RANK[tag] !== undefined) return ENCODE_RANK[tag];
  }
  return 4;
}

// Full pipeline for one source's raw streams: parse -> filter -> sort.
// Returns { kept: [parsed], dropped: { reason: count } }.
function processSourceStreams(sourceName, rawStreams, opts = {}) {
  const parse = PARSERS[sourceName] || parseTorrentioLike;
  const dropped = { noPlayable: 0, over1080: 0, cam: 0, langDrop: 0 };
  const parsed = [];
  // v2.1.0 dashboard knob: maxRes 720 also drops 1080p; default 1080
  // keeps the v1 hard cap (2160/1440 dropped, never 4K).
  const maxRes = opts.maxRes === 720 ? 720 : 1080;

  for (const s of rawStreams) {
    if (!s || (!s.infoHash && !s.url)) { dropped.noPlayable++; continue; }
    const p = parse(s);
    p.source = sourceName;
    p.raw = s;
    if (p.resolution === 2160 || p.resolution === 1440 || (maxRes === 720 && (p.resolution === 1080 || p.resolution === 1080.1))) { dropped.over1080++; continue; }
    if (isCam(p.rawText)) { dropped.cam++; continue; }
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

  kept.sort(compareParsed);
  return { kept, dropped };
}

function compareParsed(a, b) {
  const la = a.unknownLang ? 4 : languageRank(a.langs);
  const lb = b.unknownLang ? 4 : languageRank(b.langs);
  if (la !== lb) return la - lb;
  const ra = resolutionRank(a.resolution);
  const rb = resolutionRank(b.resolution);
  if (ra !== rb) return ra - rb;
  const sa = a.seeders === null ? -1 : a.seeders;
  const sb = b.seeders === null ? -1 : b.seeders;
  if (sa !== sb) return sb - sa;
  const ea = encodeRank(a.visual);
  const eb = encodeRank(b.visual);
  if (ea !== eb) return ea - eb;
  return sizeBytes(b.size) - sizeBytes(a.size);
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

function formatStream(p) {
  const s = p.raw;
  const res = resLabel(p.resolution);
  const visualBits = [...p.visual, ...p.encode].filter(Boolean);
  let line1 = visualBits.length ? `${res} | ${visualBits.join(' ')}` : res;
  if (p.size) line1 += ` 💾 ${p.size.value}${p.size.unit}`;

  const flags = [...p.langs].filter((l) => LANG_FLAG[l]).map((l) => LANG_FLAG[l]).join('');
  const line2bits = [];
  if (p.audio.length) line2bits.push(p.audio.join(' '));
  if (flags) line2bits.push(flags);
  const line2 = line2bits.length ? `🔊 ${line2bits.join(' ')}` : '';

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
    name: p.displayTitle || 'Binge Addon',
    description: line2 ? `${line1}\n${line2}` : line1,
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
  parseLanguages, parseResolution, parseSeeders, languageVerdict,
  languageRank, compareParsed, processSourceStreams, dedupe, formatStream, cleanTitle,
};
