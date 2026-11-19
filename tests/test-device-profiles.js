// Binge Addon — device profiles tests (v1.2.7, basant: "Ek smart addon
// — device khud pehchanega").
//
// Covers: (1) UA detection matrix — Android phone, iPhone, Windows /
// macOS / Linux desktop, Android TV, Fire TV, webOS, Tizen, unknown /
// missing UA -> desktop; (2) the three profile comparators on synthetic
// rows — desktop MUST be byte-identical to v1.2.4 compareParsed (the
// same mixed list sorts identically through both), phone puts 720p
// first with 1080p below (never dropped), TV allows 2160p, orders by
// tier then resolution desc then size DESC; (3) profile data —
// normalizeProfiles repairs bad values, custom profiles resolve and
// slug-collisions are disambiguated; (4) merge sort-before-slice
// invariant holds under a profile comparator.
//
// Fixtures: synthetic Torrentio-style rows (same helper shape as
// test-size-ranking.js). Run: node tests/test-device-profiles.js
// (exit 0 = all pass)
'use strict';

const {
  detectDevice, getProfile, runWithRequest,
} = require('../app/lib/device');
const {
  DEFAULT_PROFILES, normalizeProfiles, resolveProfile,
  createCustomProfile, slugify,
} = require('../app/lib/profiles');
const {
  processSourceStreams, compareParsed, compareWithProfile,
  compareCamWithProfile, formatStream,
} = require('../app/lib/parse');
const { mergeStreamResults } = require('../app/lib/sources');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

let n = 0;
const synth = (filename, seeders, size, extraTitle = '') => ({
  infoHash: `prof${String(++n).padStart(4, '0')}abcdef`,
  behaviorHints: { filename },
  title: `${filename}\n👤 ${seeders} 💾 ${size}\n🇮🇳${extraTitle ? `\n${extraTitle}` : ''}`,
});
const desc = (list) => list.map((p) => formatStream(p).description.split('\n')[0].replace('Quality: ', ''));

// ---------------------------------------------------------------------------
// 1. UA detection matrix
// ---------------------------------------------------------------------------
console.log('=== 1. UA detection ===');
const UAS = [
  ['Windows Chrome desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'desktop'],
  ['macOS Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'desktop'],
  ['Linux desktop', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'desktop'],
  ['Stremio desktop (Electron/Windows)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Electron/28.0 Stremio/4.4.168', 'desktop'],
  ['Android phone (Oppo A16k class)', 'Mozilla/5.0 (Linux; Android 13; CPH2343) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36', 'phone'],
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1', 'phone'],
  ['iPad', 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1', 'phone'],
  ['Android tablet', 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'phone'],
  ['Stremio Android app', 'Stremio/1.6.0 (Android)', 'phone'],
  ['Android TV', 'Mozilla/5.0 (Linux; Android 11; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'tv'],
  ['Google TV (Chromecast)', 'Mozilla/5.0 (Linux; Android 12; Chromecast with Google TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'tv'],
  ['Fire TV Stick 4K', 'Mozilla/5.0 (Linux; Android 9; AFTKA) AppleWebKit/537.36 (KHTML, like Gecko) Silk/90.0 Chrome/90.0 Safari/537.36', 'tv'],
  ['Fire TV (explicit)', 'Mozilla/5.0 (Linux; Android 9; Fire TV) AppleWebKit/537.36 (KHTML, like Gecko) Silk/90.0 Safari/537.36', 'tv'],
  ['webOS (LG TV)', 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 WebAppManager', 'tv'],
  ['Tizen (Samsung TV)', 'Mozilla/5.0 (Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36', 'tv'],
  ['SmartTV token', 'Mozilla/5.0 (Linux; SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'tv'],
  ['Roku', 'Roku/DVP-12.0 (12.0.0.4184)', 'tv'],
  ['NVIDIA Shield', 'Mozilla/5.0 (Linux; Android 11; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'tv'],
  ['empty UA', '', 'desktop'],
  ['undefined UA', undefined, 'desktop'],
  ['curl (no device signal)', 'curl/8.5.0', 'desktop'],
  ['bare Stremio token', 'Stremio', 'desktop'],
];
for (const [label, ua, want] of UAS) eq(detectDevice(ua), want, `${label} -> ${want}`);

// getProfile: forced profile wins over UA; no context -> desktop.
eq(getProfile(), 'desktop', 'getProfile() outside any request -> desktop');
runWithRequest({ headers: { 'user-agent': UAS[4][1] } }, null, () => {
  eq(getProfile(), 'phone', 'phone UA in request context -> phone');
});
runWithRequest({ headers: { 'user-agent': UAS[0][1] } }, 'tv', () => {
  eq(getProfile(), 'tv', 'forced tv profile wins over a desktop UA');
});
runWithRequest({ headers: {} }, 'custom:my-mix', () => {
  eq(getProfile(), 'custom:my-mix', 'forced custom slug rides in the context');
});

// ---------------------------------------------------------------------------
// 2. Desktop comparator is byte-identical to v1.2.4 compareParsed
// ---------------------------------------------------------------------------
console.log('\n=== 2. Desktop == v1.2.4 compareParsed ===');
const mixed = [
  synth('Dangal.2016.1080p.BluRay.x264', 40, '32.18 GB'),
  synth('Dangal.2016.1080p.BluRay.x264', 19, '2.01 GB'),
  synth('Dangal.2016.1080p.WEB-DL.DDP5.1', 30, '5.3 GB'),
  synth('Dangal.2016.1080p.HDRip.x264', 12, '2.24 GB'),
  synth('Dangal.2016.720p.BluRay.x264', 25, '1.89 GB'),
  synth('Dangal.2016.720p.HDRip.x264', 8, '861 MB'),
  synth('Dangal.2016.1080p.WEBRip.x264', 15, '3.6 GB'),
  synth('Dangal.2016.1080p', 5, '3.09 GB'),
];
const viaOld = processSourceStreams('torrentio', mixed.map((r) => ({ ...r })));
const viaNew = processSourceStreams('torrentio', mixed.map((r) => ({ ...r })), { profileCfg: DEFAULT_PROFILES.desktop });
eq(desc(viaNew.kept).join(' | '), desc(viaOld.kept).join(' | '),
  'desktop profile sort == compareParsed sort on the same mixed list');
eq(desc(viaNew.kept)[0], '1080p BluRay', 'desktop top is the 2.01 GB efficient BluRay (not the 32 GB Remux)');
eq(desc(viaNew.kept)[5], '1080p BluRay', 'the 32.18 GB oversized BluRay sits below all efficient 1080p (index 5)');
eq(desc(viaNew.kept)[viaNew.kept.length - 1], '720p HDRip', 'desktop last is a 720p row (resolution key: all 1080p first)');
check(viaNew.kept.every((p) => p.resolution !== 2160), 'desktop keeps zero 2160p');

// Direct comparator equivalence on a shuffled copy of the PARSED rows
// (comparators take parsed objects, not raw rows).
const shuffled = [...viaOld.kept].sort(() => 0.5 - Math.random());
const a = [...shuffled].sort(compareParsed);
const b = [...shuffled].sort((x, y) => compareWithProfile(x, y, DEFAULT_PROFILES.desktop));
eq(a.map((p) => p.raw.infoHash).join(','), b.map((p) => p.raw.infoHash).join(','),
  'compareWithProfile(desktop) orders identically to compareParsed');

// ---------------------------------------------------------------------------
// 3. Phone: 720p first, 1080p below (never dropped), no 2160p
// ---------------------------------------------------------------------------
console.log('\n=== 3. Phone: 720p first ===');
const phoneRows = [
  synth('Dangal.2016.1080p.BluRay.x264', 40, '2.01 GB'),
  synth('Dangal.2016.1080p.WEB-DL.DDP5.1', 30, '2.36 GB'),
  synth('Dangal.2016.720p.BluRay.x264', 25, '1.89 GB'),
  synth('Dangal.2016.720p.WEB-DL.DDP5.1', 20, '1.1 GB'),
  synth('Dangal.2016.720p.HDRip.x264', 15, '1.04 GB'),
  synth('Dangal.2016.2160p.BluRay.x265', 50, '12.5 GB'),
  synth('Dangal.2016.480p.DVDRip.x264', 5, '700 MB'),
];
const ph = processSourceStreams('torrentio', phoneRows, { profileCfg: DEFAULT_PROFILES.phone });
eq(ph.kept.length, 6, '2160p dropped on phone (6 kept of 7)');
eq(desc(ph.kept).join(' | '),
  '720p BluRay | 720p WEB-DL | 720p HDRip | 1080p BluRay | 1080p WEB-DL | 480p',
  'phone order: all 720p first (tier order inside), then 1080p fallback, then 480p');
check(!ph.kept.some((p) => p.resolution === 2160), 'no 2160p anywhere on phone');

// Phone CAM pool is also 720-first.
const camRows = [
  synth('Ramayana.2026.1080p.HDTC.Hindi', 10, '2.41 GB'),
  synth('Ramayana.2026.720p.HDTC.Hindi', 12, '1.26 GB'),
  synth('Ramayana.2026.1080p.CAM.Hindi', 8, '1.5 GB'),
];
const phCam = processSourceStreams('torrentio', camRows, { profileCfg: DEFAULT_PROFILES.phone });
eq(phCam.cam.length, 3, 'all 3 CAM rows kept in the cam pool');
eq(desc(phCam.cam).join(' | '), '720p CAM HDTC | 1080p CAM HDTC | 1080p CAM',
  'phone CAM pool: HDTC first, 720p before 1080p inside the kind');

// ---------------------------------------------------------------------------
// 4. TV: 4K allowed, tier first, resolution desc, size DESC
// ---------------------------------------------------------------------------
console.log('\n=== 4. TV: best quality only ===');
const tvRows = [
  synth('Dune.2021.2160p.WEB-DL.DDP5.1.Atmos', 30, '18.5 GB'),
  synth('Dune.2021.2160p.BluRay.REMUX.HDR', 25, '55.2 GB'),
  synth('Dune.2021.1080p.BluRay.REMUX', 40, '32.18 GB'),
  synth('Dune.2021.1080p.BluRay.x264', 35, '3.29 GB'),
  synth('Dune.2021.2160p.BluRay.REMUX.HDR', 20, '48.1 GB'),
  synth('Dune.2021.1080p.WEB-DL.DDP5.1', 28, '3.3 GB'),
  synth('Dune.2021.720p.BluRay.x264', 15, '1.9 GB'),
  synth('Dune.2021.2160p.WEBRip.x264', 10, '9.4 GB'),
];
const tv = processSourceStreams('torrentio', tvRows, { maxRes: 2160, profileCfg: DEFAULT_PROFILES.tv });
eq(tv.kept.length, 8, 'TV keeps all 8 rows — 2160p is allowed');
eq(desc(tv.kept).join(' | '),
  '2160p BluRay HDR | 2160p BluRay HDR | 1080p BluRay | 1080p BluRay | 720p BluRay | 2160p WEB-DL | 1080p WEB-DL | 2160p WEBRip',
  'TV order: tier first (Remux > BluRay > WEB-DL > WEBRip), then resolution desc, then size DESC inside tier+res');
eq(formatStream(tv.kept[0]).description.split('\n')[2], 'Size: 55.2 GB',
  'TV top is the BIGGEST 2160p Remux (55.2 GB), not the smallest');
check(tv.kept[0].resolution === 2160 && tv.kept[0].visual.includes('Remux'), 'TV top is a 2160p Remux-tagged stream');

// TV with 4K off (maxRes 1080) drops 2160p but keeps the TV order.
const tvNo4k = processSourceStreams('torrentio', tvRows, { maxRes: 1080, profileCfg: DEFAULT_PROFILES.tv });
eq(tvNo4k.kept.length, 4, 'TV 4K-off drops the four 2160p rows');
eq(desc(tvNo4k.kept)[0], '1080p BluRay', 'TV 4K-off top is the 1080p Remux-class stream');
eq(formatStream(tvNo4k.kept[0]).description.split('\n')[2], 'Size: 32.18 GB',
  'TV 4K-off top is the biggest 1080p Remux (size DESC still applies)');

// ---------------------------------------------------------------------------
// 5. Profile data: normalize + resolve + custom links
// ---------------------------------------------------------------------------
console.log('\n=== 5. Profiles data ===');
const bad = normalizeProfiles({
  profiles: {
    desktop: { tierOrder: ['WEB-DL', 'BluRay'], maxRes: 2160, sizeDirection: 'sideways' },
    phone: { resolutionOrder: [720, 720, 999, 1080], sizeClassOrder: [3, 2, 1, 0] },
    tv: { maxRes: 720, sizeClassOrder: [0, 1] },
  },
  custom: { 'Bad Slug!': { name: 'x', base: 'tv' } },
});
eq(bad.profiles.desktop.tierOrder.join(','), DEFAULT_PROFILES.desktop.tierOrder.join(','),
  'bad tierOrder (missing entries) falls back to the default');
eq(bad.profiles.desktop.maxRes, 1080, 'desktop maxRes clamped to 1080 (2160p is TV-only)');
eq(bad.profiles.desktop.sizeDirection, 'asc', 'bad sizeDirection falls back to asc');
eq(bad.profiles.phone.resolutionOrder.join(','), '720,1080',
  'phone resolutionOrder deduped + invalid entries dropped (720 first kept)');
eq(bad.profiles.phone.sizeClassOrder.join(','), '3,2,1,0', 'phone sizeClassOrder reorder is kept');
eq(bad.profiles.tv.maxRes, 720, 'TV maxRes 720 is kept (4K off)');
eq(bad.profiles.tv.sizeClassOrder, null, 'bad TV sizeClassOrder (missing entries) falls back to null (off)');
eq(Object.keys(bad.custom).length, 0, 'custom slug with illegal characters is dropped');

eq(slugify('My TV Mix!!'), 'my-tv-mix', 'slugify: My TV Mix!! -> my-tv-mix');
eq(slugify('  '), '', 'slugify: blank -> empty');
const doc = normalizeProfiles({});
const { slug, entry } = createCustomProfile(doc, { name: 'Weekend 4K', base: 'tv' });
eq(slug, 'weekend-4k', 'custom slug from name');
eq(entry.base, 'tv', 'custom profile copies the TV base');
eq(entry.maxRes, 2160, 'custom TV-based profile keeps maxRes 2160');
eq(entry.sizeDirection, 'desc', 'custom TV-based profile keeps size DESC');
doc.custom[slug] = entry;
const again = createCustomProfile(doc, { name: 'Weekend 4K', base: 'tv' });
eq(again.slug, 'weekend-4k-2', 'slug collision disambiguated with -2');

const resolved = resolveProfile(doc, 'custom:weekend-4k');
eq(resolved && resolved.id, 'custom:weekend-4k', 'custom profile resolves by slug');
eq(resolved && resolved.name, 'Weekend 4K', 'custom profile keeps its name');
eq(resolveProfile(doc, 'custom:nope'), null, 'unknown custom slug resolves to null');
eq(resolveProfile(doc, 'desktop').id, 'desktop', 'desktop resolves');
eq(resolveProfile(doc, 'phone').resolutionOrder[0], 720, 'phone resolutionOrder starts at 720');
eq(resolveProfile(doc, 'tv').sizeClassOrder, null, 'TV has no size classes');

// ---------------------------------------------------------------------------
// 6. Merge: sort-before-slice holds under a profile comparator
// ---------------------------------------------------------------------------
console.log('\n=== 6. Merge invariant (profile) ===');
const many = [];
for (let i = 0; i < 30; i++) many.push(synth(`Dune.2021.1080p.BluRay.REMUX.HDR`, 5, `${20 + i}.0 GB`));
for (let i = 0; i < 30; i++) many.push(synth(`Dune.2021.720p.BluRay.x264`, 40, `${1 + (i % 3)}.5 GB`));
const phMany = processSourceStreams('torrentio', many, { profileCfg: DEFAULT_PROFILES.phone });
const merged = mergeStreamResults(
  [{ name: 'torrentio', streams: phMany.kept, cam: phMany.cam }], 40,
  { compare: (a, b) => compareWithProfile(a, b, DEFAULT_PROFILES.phone),
    compareCam: (a, b) => compareCamWithProfile(a, b, DEFAULT_PROFILES.phone) },
);
eq(merged.parsed.length, 40, 'cap 40 kept under the phone comparator');
check(merged.parsed.slice(0, 30).every((p) => p.resolution === 720),
  'phone merge: all 720p rows come before any 1080p row (sort ran before the slice)');
check(!merged.parsed.some((p) => p.resolution === 2160), 'phone merge: no 2160p');

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILURES`}`);
process.exit(fail === 0 ? 0 : 1);
