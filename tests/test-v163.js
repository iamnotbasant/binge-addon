// Binge Addon — v1.6.3 stream-list fixes (basant, 21 Nov 2026).
// Two user-reported problems, one batch (v1.6.1 + 2 changes = 1.6.3):
//
// (A) Bigg Boss S20E76 (phone): 8 rows, 6 dead. HdHub's R2 presigned
//     links expire 8 h after signing (X-Amz-Date + X-Amz-Expires) —
//     the E76 links were signed 17:47 UTC 20 Nov and expired 01:47
//     UTC 21 Nov, so R2 answered 403 ExpiredRequest; hubcloud links
//     400. Only the 2 pixeldrain links played, buried at #4 and #8.
//     Fix: drop provably-expired signed links in processSourceStreams,
//     and merge duplicate rows (same file, several hosts) keeping the
//     pixeldrain copy — E76 goes 8 rows (6 dead) -> 2 rows (both alive).
// (B) Dhindora S02E05 (autoplay): Nuvio played the 1.14 GB multi-lang
//     torrent (Hindi + English + French + German) over the 588 MB
//     Hindi-only HdHub WEB-DL — the 588 MB file was size-class 3
//     ("tiny") so the torrent outranked it. Basant: "pehle priority
//     HdHub ko, then torrent ko". Fix: a `source` rank key (HdHub 0 >
//     Torrentio 1 > Comet 2) AFTER language + resolution, so Hindi-first
//     and 1080p-first still hold and HdHub wins only within the same
//     language + resolution.
//
// Covers:
// (0) manifest — version 1.6.3, 18 catalogs, id unchanged;
// (1) isExpiredSignedUrl units — expired / fresh / no params /
//     malformed / within-margin;
// (2) processSourceStreams drops expired R2 links (dropped.expired);
// (3) source priority — HdHub 588 MB beats torrent 1.14 GB at the
//     same language + resolution; resolution outranks source; language
//     outranks source;
// (4) mergeDuplicates — 4 identical rows -> 1 (pixeldrain kept);
//     different sizes stay separate; no-size rows never merge;
// (5) E76 end-to-end (phone): 8 raw HdHub rows -> 2 rows, 720p
//     pixeldrain first, 1080p pixeldrain second, both alive.
// Run: node tests/test-v163.js (exit 0 = all pass)
'use strict';

const { MANIFEST, catalogs } = require('../app/lib/manifest');
const { DEFAULT_PROFILES } = require('../app/lib/profiles');
const {
  processSourceStreams, compareWithProfile, compareCamWithProfile,
  isExpiredSignedUrl,
} = require('../app/lib/parse');
const { mergeStreamResults, mergeDuplicates } = require('../app/lib/sources');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

const desk = { maxRes: DEFAULT_PROFILES.desktop.maxRes, profileCfg: DEFAULT_PROFILES.desktop };
const phone = { maxRes: DEFAULT_PROFILES.phone.maxRes, profileCfg: DEFAULT_PROFILES.phone };
const deskCmps = {
  compare: (a, b) => compareWithProfile(a, b, DEFAULT_PROFILES.desktop),
  compareCam: (a, b) => compareCamWithProfile(a, b, DEFAULT_PROFILES.desktop),
};
const phoneCmps = {
  compare: (a, b) => compareWithProfile(a, b, DEFAULT_PROFILES.phone),
  compareCam: (a, b) => compareCamWithProfile(a, b, DEFAULT_PROFILES.phone),
};

// "Now" for the expiry tests: 21 Nov 2026 06:15 UTC — after the E76
// R2 links expired (01:47 UTC) and inside the E05 links' window
// (signed 02:18 UTC, expire 10:18 UTC).
const NOW_MS = Date.UTC(2026, 10, 21, 6, 15, 0);
const EXPIRED_R2 = (host, path) => `https://${host}/${path}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261120T174734Z&X-Amz-Expires=28800&X-Amz-Signature=deadbeef`;
const FRESH_R2 = (host, path) => `https://${host}/${path}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261121T021824Z&X-Amz-Expires=28800&X-Amz-Signature=deadbeef`;

// --- (0) manifest ---
console.log('(0) manifest');
eq(MANIFEST.version, '1.6.4', 'manifest version 1.6.4');
eq(MANIFEST.id, 'com.bharatstreams', 'manifest id unchanged');
eq(catalogs().length, 18, '18 catalogs');

// --- (1) isExpiredSignedUrl units ---
console.log('(1) isExpiredSignedUrl units');
check(isExpiredSignedUrl(EXPIRED_R2('x.r2.cloudflarestorage.com', 'hax/abc'), NOW_MS) === true, 'R2 link signed 17:47 UTC 20 Nov, 8h expiry -> expired at 06:15 UTC 21 Nov');
check(isExpiredSignedUrl(FRESH_R2('x.r2.cloudflarestorage.com', 'hax/abc'), NOW_MS) === false, 'R2 link signed 02:18 UTC 21 Nov, 8h expiry -> alive at 06:15 UTC');
check(isExpiredSignedUrl('https://pixeldrain.dev/api/file/JckQmXKy?download', NOW_MS) === false, 'pixeldrain link (no X-Amz params) -> kept');
check(isExpiredSignedUrl('https://gpdl.hubcloud.mov/?id=abc123', NOW_MS) === false, 'hubcloud link (no X-Amz params) -> kept (expiry filter cannot prove it dead)');
check(isExpiredSignedUrl('https://x.r2.cloudflarestorage.com/a?X-Amz-Date=not-a-date&X-Amz-Expires=28800', NOW_MS) === false, 'malformed X-Amz-Date -> fail-open, kept');
check(isExpiredSignedUrl('https://x.r2.cloudflarestorage.com/a?X-Amz-Date=20261121T021824Z', NOW_MS) === false, 'X-Amz-Date without X-Amz-Expires -> kept');
// Expiry 10:18 UTC; now 10:14 UTC is inside the 5-min margin -> dropped.
check(isExpiredSignedUrl(FRESH_R2('x.r2.cloudflarestorage.com', 'hax/abc'), Date.UTC(2026, 10, 21, 10, 14, 0)) === true, 'link expiring within the 5-min margin -> dropped');
check(isExpiredSignedUrl(FRESH_R2('x.r2.cloudflarestorage.com', 'hax/abc'), Date.UTC(2026, 10, 21, 9, 0, 0)) === false, 'link expiring in 78 min -> kept');

// --- (2) processSourceStreams drops expired ---
console.log('(2) processSourceStreams drops expired R2 links');
const hdhubMixed = [
  { name: 'HdHub 1080p', description: '[💾 611.36 MB] Bigg.Boss.S20E76.720p.WEB-DL.Hindi.2.0.x264-HDHub4u.Ms.mkv\nHindi', url: EXPIRED_R2('161cc26b6ea08e39f2714552ce321481.r2.cloudflarestorage.com', 'hax/aaa') },
  { name: 'HdHub 1080p', description: '[💾 611.36 MB] Bigg.Boss.S20E76.720p.WEB-DL.Hindi.2.0.x264-HDHub4u.Ms.mkv\nHindi', url: FRESH_R2('161cc26b6ea08e39f2714552ce321481.r2.cloudflarestorage.com', 'hax/bbb') },
  { name: 'HdHub 1080p', description: '[💾 611.36 MB] Bigg.Boss.S20E76.720p.WEB-DL.Hindi.2.0.x264-HDHub4u.Ms.mkv\nHindi', url: 'https://pixeldrain.dev/api/file/JckQmXKy?download' },
];
const mixed = processSourceStreams('hdhub', hdhubMixed, { ...desk, nowMs: NOW_MS });
eq(mixed.kept.length, 2, 'expired R2 dropped, fresh R2 + pixeldrain kept');
eq(mixed.dropped.expired, 1, 'dropped.expired counts the dead link');

// --- (3) source priority (Dhindora S02E05 repro) ---
console.log('(3) source priority — HdHub first, then torrent');
const torrentE05 = [{
  name: 'Dhindora S02E05 1080p WEB h264-BETTY',
  title: 'Dhindora S02E05 1080p WEB h264-BETTY\n👤 24 💾 1.14 GB ⚙️ UIndex\n🇬🇧 / 🇫🇷 / 🇩🇪 / 🇳🇱 / 🇮🇳',
  infoHash: 'b063db77b063db77b063db77b063db77b063db77', fileIdx: 0,
  behaviorHints: { filename: 'Dhindora.S02E05.1080p.WEB.h264-BETTY.mkv' },
}];
const hdhubE05 = [{
  name: 'HdHub 2160p',
  description: '[💾 588.42 MB] Dhindora.S02E05.1080p.WEB-DL.Hindi.AAC2.0.H.264-HDHub4u.Ag.mkv\nHindi',
  url: 'https://pixeldrain.dev/api/file/CqDjY9g2?download',
}];
const t05 = processSourceStreams('torrentio', torrentE05, desk);
const h05 = processSourceStreams('hdhub', hdhubE05, desk);
eq(t05.kept.length, 1, 'torrent E05 kept (1.14 GB multi-lang)');
eq(h05.kept.length, 1, 'HdHub E05 kept (588 MB Hindi)');
eq(h05.kept[0].resolution, 1080, 'HdHub E05 parses 1080p from the filename, not the 2160p name label');
const mergedE05 = mergeStreamResults(
  [{ streams: t05.kept, cam: t05.cam }, { streams: h05.kept, cam: h05.cam }], 40, deskCmps);
eq(mergedE05.parsed.length, 2, 'E05 merges to 2 rows');
eq(mergedE05.parsed[0].source, 'hdhub', 'HdHub 588 MB ranks FIRST (source outranks the size-class demotion)');
check((mergedE05.parsed[0].size.value === 588.42 && mergedE05.parsed[0].size.unit === 'MB'), 'first row is the 588 MB HdHub file');
eq(mergedE05.parsed[1].source, 'torrentio', 'torrent 1.14 GB second');

// Resolution still outranks source: a Hindi 720p HdHub must NOT beat a
// Hindi 1080p torrent on desktop.
const hdhub720 = [{
  name: 'HdHub 1080p',
  description: '[💾 266.16 MB] Dhindora.S02E05.720p.WEB-DL.Hindi.H.264-HDHub4u.Ms.mkv\nHindi',
  url: 'https://pixeldrain.dev/api/file/3zA22qu1?download',
}];
const h720 = processSourceStreams('hdhub', hdhub720, desk);
const mergedRes = mergeStreamResults(
  [{ streams: t05.kept, cam: t05.cam }, { streams: h720.kept, cam: h720.cam }], 40, deskCmps);
eq(mergedRes.parsed[0].source, 'torrentio', 'desktop: 1080p torrent still beats 720p HdHub (resolution outranks source)');
eq(mergedRes.parsed[0].resolution, 1080, 'first row is 1080p');

// Language still outranks source: an English-only HdHub must NOT beat a
// Hindi torrent.
const hdhubEng = [{
  name: 'HdHub 1080p',
  description: '[💾 900.00 MB] Some.Show.S01E01.1080p.WEB-DL.English.H.264-HDHub4u.Ms.mkv\nEnglish',
  url: 'https://pixeldrain.dev/api/file/Eng12345?download',
}];
const torrentHin = [{
  name: 'Some Show S01E01 1080p WEB-DL Hindi',
  title: 'Some Show S01E01 1080p WEB-DL Hindi\n👤 10 💾 1.00 GB\n🇮🇳',
  infoHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', fileIdx: 0,
  behaviorHints: { filename: 'Some.Show.S01E01.1080p.WEB-DL.Hindi.mkv' },
}];
const hEng = processSourceStreams('hdhub', hdhubEng, desk);
const tHin = processSourceStreams('torrentio', torrentHin, desk);
const mergedLang = mergeStreamResults(
  [{ streams: tHin.kept, cam: tHin.cam }, { streams: hEng.kept, cam: hEng.cam }], 40, deskCmps);
eq(mergedLang.parsed[0].source, 'torrentio', 'Hindi torrent beats English HdHub (language outranks source)');

// --- (4) mergeDuplicates ---
console.log('(4) mergeDuplicates');
const fourHosts = (res, sizeVal, sizeUnit, file, tag) => ([
  { name: 'HdHub 1080p', description: `[💾 ${sizeVal} ${sizeUnit}] ${file}\nHindi`, url: EXPIRED_R2('161cc26b6ea08e39f2714552ce321481.r2.cloudflarestorage.com', `hax/aaa-${tag}`) },
  { name: 'HdHub 1080p', description: `[💾 ${sizeVal} ${sizeUnit}] ${file}\nHindi`, url: `https://1c8e2ebb17c55ccc855414dc97ed1e80.r2.cloudflarestorage.com/hub/x-${tag}` },
  { name: 'HdHub 1080p', description: `[💾 ${sizeVal} ${sizeUnit}] ${file}\nHindi`, url: `https://gpdl.hubcloud.mov/?id=abc123-${tag}` },
  { name: 'HdHub 1080p', description: `[💾 ${sizeVal} ${sizeUnit}] ${file}\nHindi`, url: `https://pixeldrain.dev/api/file/JckQmXKy-${tag}?download` },
]);
const dup720 = processSourceStreams('hdhub',
  fourHosts(720, 611.36, 'MB', 'Bigg.Boss.S20E76.720p.WEB-DL.Hindi.2.0.x264-HDHub4u.Ms.mkv', '720'),
  { ...desk, nowMs: NOW_MS });
eq(dup720.kept.length, 3, 'expired R2 dropped before merge (3 survivors: r2-hub, hubcloud, pixeldrain)');
const mergedDup = mergeDuplicates(dup720.kept);
eq(mergedDup.list.length, 1, '4 identical rows -> 1 after merge');
eq(mergedDup.merged, 2, 'merge count is 2 (3 survivors -> 1)');
check(mergedDup.list[0].raw.url.includes('pixeldrain.dev'), 'kept copy is the pixeldrain one (links never expire)');

// Different sizes stay separate.
const twoSizes = processSourceStreams('hdhub', [
  { name: 'HdHub 1080p', description: '[💾 611.36 MB] Bigg.Boss.S20E76.720p.WEB-DL.Hindi.2.0.x264-HDHub4u.Ms.mkv\nHindi', url: 'https://pixeldrain.dev/api/file/AAA?download' },
  { name: 'HdHub 1080p', description: '[💾 1.16 GB] Bigg.Boss.S20E76.1080p.WEB-DL.Hindi.AAC2.0.H.264-HDHub4u.Ag.mkv\nHindi', url: 'https://pixeldrain.dev/api/file/BBB?download' },
], desk);
eq(mergeDuplicates(twoSizes.kept).list.length, 2, 'different sizes never merge');

// Rows with no size/resolution never merge (the HubCDN blanks).
const noInfo = processSourceStreams('hdhub', [
  { name: 'HdHub\nHubCDN', description: 'HdHub\nHubCDN', url: 'https://pub-0be00833ff0b4efbae63822bdf570da8.r2.dev/44616327' },
  { name: 'HdHub\nHubCDN', description: 'HdHub\nHubCDN', url: 'https://pub-0be00833ff0b4efbae63822bdf570da8.r2.dev/9ddf037b' },
], desk);
eq(noInfo.kept.length, 2, 'no-size/no-res rows kept (alive, just unlabeled)');
eq(mergeDuplicates(noInfo.kept).list.length, 2, 'no-size rows never merge (two different files could share the key)');

// --- (5) E76 end-to-end (phone) ---
console.log('(5) E76 end-to-end on phone: 8 raw -> 2 alive rows');
const e76Raw = [
  ...fourHosts(720, 611.36, 'MB', 'Bigg.Boss.S20E76.720p.WEB-DL.Hindi.2.0.x264-HDHub4u.Ms.mkv', '720'),
  ...fourHosts(1080, 1.16, 'GB', 'Bigg.Boss.S20E76.1080p.JHS.WEB-DL.Hindi.AAC2.0.H.264-HDHub4u.Ag.mkv', '1080'),
];
const e76 = processSourceStreams('hdhub', e76Raw, { ...phone, nowMs: NOW_MS });
eq(e76.kept.length, 6, 'E76: 2 expired R2 dropped, 6 kept (3 per resolution)');
eq(e76.dropped.expired, 2, 'E76: dropped.expired is 2');
const e76Merged = mergeStreamResults([{ streams: e76.kept, cam: e76.cam }], 40, phoneCmps);
eq(e76Merged.parsed.length, 2, 'E76 phone: 8 raw rows -> 2 unique rows');
eq(e76Merged.parsed[0].resolution, 720, 'phone: 720p first');
eq(e76Merged.parsed[1].resolution, 1080, 'phone: 1080p second');
check(e76Merged.parsed.every((p) => (p.raw.url || '').includes('pixeldrain.dev')), 'both kept rows are pixeldrain (the only alive host)');
check(e76Merged.parsed.every((p) => !isExpiredSignedUrl(p.raw.url, NOW_MS)), 'no kept row is an expired signed link');

console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
