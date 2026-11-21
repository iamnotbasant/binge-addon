// Binge Addon — v1.6.0 HdHub fake-2160p fix tests (basant, 20 Nov 2026:
// Dhindora S2E1 showed only 1 stream in Nuvio while HdHub had 6 more.
// Root cause: TWO fake-2160p signals made real 1080p/720p files parse as
// 2160p, and the desktop/phone 1080p cap dropped them as over1080:
// (a) HdHub's `name` is a quality-bucket label — Dhindora's files all sit
// under "HdHub 2160p" even though the files are 1080p/720p; (b) the
// filename tag "DS4K" matched the bare `4k\b` in parseResolution.
// Fix: parseResolution requires a non-letter before 4K (`(?<![A-Za-z])4k`)
// so DS4K no longer fakes 2160p, and parseHdHub reads resolution from
// the FILENAME first, using `name` only as a fallback when the filename
// carries no resolution token at all.
//
// Covers:
// (0) manifest — version 1.6.0, 18 catalogs, id unchanged;
// (1) real Dhindora S2E1 HdHub fixture (8 raw: 6 real + 2 notices) —
//     desktop AND phone keep 6 (1080p x3 + 720p x3), dropped.over1080 0,
//     TV keeps 6 with the CORRECT resolutions (no longer 2160);
// (2) parseResolution units — DS4K alone is not 2160p, genuine " 4K" /
//     "2160p" / "_4K" still are;
// (3) genuine 2160p still dropped on desktop/phone, kept on TV;
// (4) name fallback — a filename with no resolution token still takes
//     the resolution from the "HdHub 1080p" name;
// (5) Torrentio DS4K files benefit from the same lookbehind fix.
// Fixture: tests/fixtures/dhindora-hdhub-s2e1-20261120.json (live raw
// HdHub response, 20 Nov 2026). Run: node tests/test-v160.js
// (exit 0 = all pass)
'use strict';

const fs = require('fs');
const path = require('path');
const { MANIFEST, catalogs } = require('../app/lib/manifest');
const { DEFAULT_PROFILES } = require('../app/lib/profiles');
const { parseResolution, processSourceStreams } = require('../app/lib/parse');

let fail = 0;
const check = (ok, msg) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${msg}`); if (!ok) fail++; };
const eq = (got, want, msg) => check(got === want, `${msg}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);

// v1.6.3: the fixture's R2 links were signed 20261120T100750Z (8 h
// validity, expired 18:07 UTC 20 Nov) — pin "now" inside that window
// so the expired-link filter does not eat the fixture while this test
// verifies the fake-2160p fix. The expiry filter itself is covered
// (with its own pinned times) in tests/test-v163.js.
const NOW_MS = Date.UTC(2026, 10, 20, 11, 0, 0);
const desk = { maxRes: DEFAULT_PROFILES.desktop.maxRes, profileCfg: DEFAULT_PROFILES.desktop, nowMs: NOW_MS };
const phone = { maxRes: DEFAULT_PROFILES.phone.maxRes, profileCfg: DEFAULT_PROFILES.phone, nowMs: NOW_MS };
const tv = { maxRes: DEFAULT_PROFILES.tv.maxRes, profileCfg: DEFAULT_PROFILES.tv, nowMs: NOW_MS };

// ---------------------------------------------------------------------------
// 0. Manifest
// ---------------------------------------------------------------------------
console.log('=== 0. Manifest ===');
{
  const list = catalogs();
  eq(MANIFEST.id, 'com.bharatstreams', 'manifest id unchanged (no reinstall)');
  eq(MANIFEST.version, '1.6.3', 'manifest version 1.6.1');
  eq(list.length, 18, '18 catalogs (no row added or removed)');
}

// ---------------------------------------------------------------------------
// 1. Real Dhindora S2E1 HdHub fixture
// ---------------------------------------------------------------------------
console.log('=== 1. Dhindora S2E1 HdHub fixture (live 20 Nov 2026) ===');
{
  const raw = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'dhindora-hdhub-s2e1-20261120.json'), 'utf8')).streams;
  eq(raw.length, 8, 'fixture has 8 raw entries (6 real + 2 notices)');

  const d = processSourceStreams('hdhub', raw, desk);
  eq(d.kept.length, 6, 'desktop keeps all 6 real HdHub streams');
  eq(d.dropped.over1080 || 0, 0, 'desktop drops ZERO as over1080 (was 6)');
  eq(d.dropped.noPlayable, 2, 'the 2 donation/discord notices still drop (noPlayable)');
  eq(d.kept.map((k) => k.resolution).sort().join(','), '1080,1080,1080,720,720,720',
    'desktop resolutions are the TRUE 1080p x3 + 720p x3');
  eq(d.kept[0].resolution, 1080, 'desktop top is 1080p (was: nothing kept)');

  const p = processSourceStreams('hdhub', raw, phone);
  eq(p.kept.length, 6, 'phone keeps all 6 real HdHub streams');
  eq(p.dropped.over1080 || 0, 0, 'phone drops ZERO as over1080');
  eq(p.kept[0].resolution, 720, 'phone top is 720p first (phone profile)');

  const t = processSourceStreams('hdhub', raw, tv);
  eq(t.kept.length, 6, 'TV keeps all 6');
  eq(t.kept.map((k) => k.resolution).sort().join(','), '1080,1080,1080,720,720,720',
    'TV resolutions are TRUE 1080p/720p (was: all mislabelled 2160)');
  check(t.kept.every((k) => k.resolution !== 2160), 'no 2160p anywhere on TV either');
}

// ---------------------------------------------------------------------------
// 2. parseResolution units — DS4K is a tag, not 2160p
// ---------------------------------------------------------------------------
console.log('=== 2. parseResolution: DS4K vs genuine 4K ===');
{
  eq(parseResolution('Dhindora.S02E01.1080p.Hindi.DS4K.WEB-DL.5.1.ESub.x264'), 1080,
    'DS4K filename with 1080p parses as 1080, not 2160');
  eq(parseResolution('Dhindora.S02E01.720p.Hindi.DS4K.WEB-DL.5.1.ESub.x264'), 720,
    'DS4K filename with 720p parses as 720, not 2160');
  eq(parseResolution('DS4K'), null, 'bare DS4K alone is not a resolution');
  eq(parseResolution('Movie.2026.4K.WEB-DL.Hindi'), 2160,
    'genuine " 4K" (space before) still parses as 2160');
  eq(parseResolution('Movie.2026.2160p.WEB-DL.Hindi'), 2160,
    'genuine 2160p still parses as 2160');
  eq(parseResolution('Movie.2026.X4K.WEB-DL'), null,
    'letter before 4K blocks it (X4K tag, same as DS4K)');
  eq(parseResolution('Movie_2026_4K_WEB-DL'), null,
    'underscore-joined 4K was never detected (trailing \\b) — pre-existing, unchanged by this fix');
  eq(parseResolution('Movie.2026.1080p.WEB-DL.Hindi'), 1080, 'plain 1080p unchanged');
}

// ---------------------------------------------------------------------------
// 3. Genuine 2160p still dropped on desktop/phone, kept on TV
// ---------------------------------------------------------------------------
console.log('=== 3. Genuine 2160p still capped ===');
{
  const real4k = [{
    name: 'HdHub 2160p',
    description: '[FSL] [💾 20.76 GB] Jailer-2.2026.4K-2160p.SDR.AMZN.WEB-DL.Hindi-Multi.DDP5.1.HEVC.mkv\nHindi',
    url: 'https://example.invalid/jailer2-4k.mkv',
  }];
  const d = processSourceStreams('hdhub', real4k, desk);
  eq(d.kept.length, 0, 'genuine 4K HdHub stream still dropped on desktop');
  eq(d.dropped.over1080, 1, 'dropped as over1080 (not silently lost)');
  const p = processSourceStreams('hdhub', real4k, phone);
  eq(p.kept.length, 0, 'genuine 4K HdHub stream still dropped on phone');
  const t = processSourceStreams('hdhub', real4k, tv);
  eq(t.kept.length, 1, 'genuine 4K HdHub stream kept on TV');
  eq(t.kept[0].resolution, 2160, 'TV keeps it as 2160');
}

// ---------------------------------------------------------------------------
// 4. Name fallback — filename with no resolution token
// ---------------------------------------------------------------------------
console.log('=== 4. HdHub name fallback ===');
{
  const noToken = [{
    name: 'HdHub 1080p',
    description: '[PixelDrain] [💾 1.20 GB] Some.Movie.2026.Hindi.WEB-DL.mkv\nHindi',
    url: 'https://example.invalid/some-movie.mkv',
  }];
  const d = processSourceStreams('hdhub', noToken, desk);
  eq(d.kept.length, 1, 'no-token file still kept (name fallback)');
  eq(d.kept[0].resolution, 1080, 'resolution falls back to the "HdHub 1080p" name');
}

// ---------------------------------------------------------------------------
// 5. Torrentio DS4K files benefit too
// ---------------------------------------------------------------------------
console.log('=== 5. Torrentio DS4K ===');
{
  const t = processSourceStreams('torrentio', [{
    infoHash: 'abcdef0123456789abcdef0123456789abcdef01',
    behaviorHints: { filename: 'Dhindora.S02E01.1080p.Hindi.DS4K.WEB-DL.5.1.ESub.x264.mkv' },
    title: 'Dhindora.S02E01.1080p.Hindi.DS4K.WEB-DL.5.1.ESub.x264\n👤 42 💾 1.53 GB\n🇮🇳',
  }], desk);
  eq(t.kept.length, 1, 'Torrentio DS4K 1080p file kept on desktop');
  eq(t.kept[0].resolution, 1080, 'Torrentio DS4K file parses as 1080, not 2160');
}

console.log(fail === 0 ? '\nALL v1.6.0 TESTS PASSED' : `\n${fail} v1.6.0 TEST(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
