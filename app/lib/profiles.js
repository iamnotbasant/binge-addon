// Binge Addon — per-device stream profiles (v1.2.7).
// ONE codebase, ONE shared store: the three built-in profiles
// (desktop / phone / TV) plus any custom profiles basant creates in
// the dashboard all live in ONE Blob file (profiles.json). A change
// applies to every profile's data — there are no separate copies to
// edit. config.json is untouched by this file (its shape must never
// break), and profiles.json is a separate file for the same reason.
//
// A profile cfg drives the whole rank (see compareWithProfile in
// lib/parse.js):
//   keyOrder: which rank keys, in which order.
//     desktop/phone: language > resolution > sizeClass > tier > size > seeders
//     TV: language > tier > resolution > size > seeders (no size class)
//   resolutionOrder: resolutions best-first. A resolution NOT in the
//     list is disabled for that profile (dropped at filter time).
//   sizeClassOrder: size classes best-first; null = size classes off (TV).
//   tierOrder: quality tiers best-first; 'none' = no source tag.
//   sizeDirection: 'asc' (smaller first — data saving) or 'desc'
//     (bigger first — TV, bigger = better quality).
//   maxRes: resolution ceiling for the profile (desktop/phone never
//     above 1080 — 2160p is TV-only).
// The desktop default reproduces v1.2.4 EXACTLY (same key order, same
// resolution/tier/size-class orders, same size-asc + seeders tiebreak).

'use strict';

const TIER_NAMES = ['Remux', 'BluRay', 'WEB-DL', 'BDRip', 'WEBRip', 'HDRip', 'HDTV', 'none'];
const RESOLUTIONS = [2160, 1080, 1080.1, 720, 480];
const SIZE_CLASSES = [0, 1, 2, 3];
const KEY_ORDER = ['language', 'resolution', 'sizeClass', 'tier', 'size', 'seeders'];
const TV_KEY_ORDER = ['language', 'tier', 'resolution', 'size', 'seeders'];
const PROFILE_IDS = ['desktop', 'phone', 'tv'];

const DEFAULT_PROFILES = {
  desktop: {
    label: 'Desktop / Laptop',
    maxRes: 1080,
    keyOrder: [...KEY_ORDER],
    resolutionOrder: [1080, 1080.1, 720, 480],
    sizeClassOrder: [0, 1, 2, 3],
    tierOrder: [...TIER_NAMES],
    sizeDirection: 'asc',
  },
  phone: {
    label: 'Phone',
    maxRes: 1080,
    keyOrder: [...KEY_ORDER],
    resolutionOrder: [720, 1080, 1080.1, 480],
    sizeClassOrder: [0, 1, 2, 3],
    tierOrder: [...TIER_NAMES],
    sizeDirection: 'asc',
  },
  tv: {
    label: 'TV',
    maxRes: 2160,
    keyOrder: [...TV_KEY_ORDER],
    resolutionOrder: [2160, 1080, 1080.1, 720, 480],
    sizeClassOrder: null,
    tierOrder: [...TIER_NAMES],
    sizeDirection: 'desc',
  },
};

function defaultProfiles() {
  return {
    version: 1,
    updatedAt: null,
    profiles: JSON.parse(JSON.stringify(DEFAULT_PROFILES)),
    custom: {},
  };
}

// Validate one profile cfg over a base (built-in default). Bad or
// partial values fall back to the base — a broken dashboard save can
// never break the server or silently change the desktop sort.
function normalizeProfile(raw, base) {
  const cfg = JSON.parse(JSON.stringify(base));
  if (!raw || typeof raw !== 'object') return cfg;
  if (typeof raw.label === 'string' && raw.label.trim()) cfg.label = raw.label.trim().slice(0, 60);
  if (typeof raw.maxRes === 'number' && [720, 1080, 2160].includes(raw.maxRes)) cfg.maxRes = raw.maxRes;
  if (Array.isArray(raw.keyOrder) && raw.keyOrder.length === KEY_ORDER.length
    && KEY_ORDER.every((k) => raw.keyOrder.includes(k))) cfg.keyOrder = [...raw.keyOrder];
  if (Array.isArray(raw.resolutionOrder) && raw.resolutionOrder.length > 0) {
    const seen = new Set();
    const ord = [];
    for (const r of raw.resolutionOrder) {
      if (RESOLUTIONS.includes(r) && !seen.has(r)) { seen.add(r); ord.push(r); }
    }
    if (ord.length) cfg.resolutionOrder = ord;
  }
  if (raw.sizeClassOrder === null) cfg.sizeClassOrder = null;
  else if (Array.isArray(raw.sizeClassOrder) && raw.sizeClassOrder.length === SIZE_CLASSES.length
    && SIZE_CLASSES.every((c) => raw.sizeClassOrder.includes(c))) cfg.sizeClassOrder = [...raw.sizeClassOrder];
  if (Array.isArray(raw.tierOrder) && raw.tierOrder.length === TIER_NAMES.length
    && TIER_NAMES.every((t) => raw.tierOrder.includes(t))) cfg.tierOrder = [...raw.tierOrder];
  if (raw.sizeDirection === 'asc' || raw.sizeDirection === 'desc') cfg.sizeDirection = raw.sizeDirection;
  return cfg;
}

function normalizeProfiles(stored) {
  const out = defaultProfiles();
  if (!stored || typeof stored !== 'object') return out;
  if (stored.profiles && typeof stored.profiles === 'object') {
    for (const id of PROFILE_IDS) {
      out.profiles[id] = normalizeProfile(stored.profiles[id], DEFAULT_PROFILES[id]);
      // 2160p is TV-only: phone/desktop can never exceed 1080.
      if (id !== 'tv' && out.profiles[id].maxRes > 1080) out.profiles[id].maxRes = 1080;
    }
  }
  if (stored.custom && typeof stored.custom === 'object') {
    for (const [slug, c] of Object.entries(stored.custom)) {
      if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(slug)) continue;
      if (!c || typeof c !== 'object') continue;
      const base = PROFILE_IDS.includes(c.base) ? c.base : 'desktop';
      const cfg = normalizeProfile(c, DEFAULT_PROFILES[base]);
      if (base !== 'tv' && cfg.maxRes > 1080) cfg.maxRes = 1080;
      out.custom[slug] = {
        name: (typeof c.name === 'string' && c.name.trim()) ? c.name.trim().slice(0, 60) : slug,
        base,
        maxRes: cfg.maxRes,
        keyOrder: cfg.keyOrder,
        resolutionOrder: cfg.resolutionOrder,
        sizeClassOrder: cfg.sizeClassOrder,
        tierOrder: cfg.tierOrder,
        sizeDirection: cfg.sizeDirection,
      };
    }
  }
  return out;
}

// Resolve a profile id to its full cfg (or null for an unknown custom
// slug — the caller falls back to desktop and logs it).
// profileId: 'desktop' | 'phone' | 'tv' | 'custom:<slug>'.
function resolveProfile(profiles, profileId) {
  const p = (profiles && profiles.profiles) || {};
  if (profileId === 'phone' || profileId === 'tv') {
    return { id: profileId, ...JSON.parse(JSON.stringify(p[profileId] || DEFAULT_PROFILES[profileId])) };
  }
  if (typeof profileId === 'string' && profileId.startsWith('custom:')) {
    const slug = profileId.slice(7);
    const c = profiles && profiles.custom && profiles.custom[slug];
    if (!c) return null;
    return {
      id: profileId, slug, name: c.name || slug, base: c.base,
      maxRes: c.maxRes, keyOrder: c.keyOrder, resolutionOrder: c.resolutionOrder,
      sizeClassOrder: c.sizeClassOrder, tierOrder: c.tierOrder, sizeDirection: c.sizeDirection,
    };
  }
  return { id: 'desktop', ...JSON.parse(JSON.stringify(p.desktop || DEFAULT_PROFILES.desktop)) };
}

function slugify(name) {
  return String(name || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-')
    .slice(0, 40);
}

// Build a new custom profile entry (copies the base profile's
// sequence — editable in the dashboard afterwards). Returns
// { slug, entry }; the caller stores entry under profiles.custom[slug]
// and writes the doc. Does NOT write Blob itself.
function createCustomProfile(profiles, { name, base }) {
  const b = PROFILE_IDS.includes(base) ? base : 'desktop';
  let slug = slugify(name) || b;
  if (!/^[a-z0-9]/.test(slug)) slug = b;
  const taken = new Set(Object.keys((profiles && profiles.custom) || {}));
  let candidate = slug;
  let n = 2;
  while (taken.has(candidate)) candidate = `${slug}-${n++}`;
  slug = candidate;
  const cfg = normalizeProfile({}, DEFAULT_PROFILES[b]);
  const entry = {
    name: (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 60) : slug,
    base: b,
    maxRes: cfg.maxRes,
    keyOrder: cfg.keyOrder,
    resolutionOrder: cfg.resolutionOrder,
    sizeClassOrder: cfg.sizeClassOrder,
    tierOrder: cfg.tierOrder,
    sizeDirection: cfg.sizeDirection,
  };
  return { slug, entry };
}

// --- Blob store (same pattern as lib/config.js: 60 s cache) ---
const PROFILES_KEY = 'profiles.json';
let cache = null; // { at, value }
const CACHE_TTL_MS = 60 * 1000;

function invalidateProfilesCache() { cache = null; }

async function readProfiles() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  // v1.2.8: direct public-URL read (SIMPLE request) with list()
  // fallback inside readBlobJson.
  let doc = defaultProfiles();
  try {
    const { readBlobJson } = require('./blob');
    const json = await readBlobJson(PROFILES_KEY);
    if (json) doc = normalizeProfiles(json);
  } catch (e) {
    console.log(`[binge-addon] profiles read failed, using defaults: ${e.message}`);
  }
  cache = { at: Date.now(), value: doc };
  return doc;
}

async function writeProfiles(doc) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('no BLOB_READ_WRITE_TOKEN');
  const clean = normalizeProfiles(doc);
  clean.updatedAt = new Date().toISOString();
  const { put } = require('@vercel/blob');
  await put(PROFILES_KEY, JSON.stringify(clean), {
    access: 'public', token, addRandomSuffix: false, allowOverwrite: true,
  });
  cache = { at: Date.now(), value: clean };
  return clean;
}

module.exports = {
  TIER_NAMES, RESOLUTIONS, SIZE_CLASSES, KEY_ORDER, TV_KEY_ORDER, PROFILE_IDS,
  DEFAULT_PROFILES, defaultProfiles, normalizeProfile, normalizeProfiles,
  resolveProfile, slugify, createCustomProfile,
  readProfiles, writeProfiles, invalidateProfilesCache,
};
