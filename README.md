# Binge Addon

A Stremio addon for Indian + global movies & series — Hindi-first, 1080p max,
free sources only. Built fresh with Node.js + `stremio-addon-sdk`; no code
copied from any existing addon.

## Install

In Stremio / Nuvio, add this manifest URL:

**https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json**

## What it is

- **27 catalogs** — Trending in India, Trending Worldwide, Fresh Digital
  Drops, Latest Indian Movies & Web Series, Releasing Next 30 Days, Big
  Announcements, Now in Theatres, South Indian Blockbusters, Dark Crime,
  Underrated Gems, Sci-Fi, Thrillers, Action, Mini-Series, Visual Spectacles,
  Anime, All-Time Classics, and more (see `design_draft.md` for the full list
  and mapping).
- **Stream sources:** Torrentio + Comet + HdHub — free sources only, Hindi
  first then English, **1080p max** (never 2160p), sorted language >
  resolution > seeders.
- **Catalogs rebuild daily** at 05:00 UTC (**10:30 IST**) from TMDB via a
  Vercel cron; rows are stored in Vercel Blob.
- **In-addon meta handler** — tapping a title (e.g. Jailer 2) shows the full
  poster, cast, director and runtime inside the addon.
- **`/admin` dashboard v1** — enable / rename / reorder catalogs, stream
  source toggles, max-quality knob.
- **Badge pack (v1.0.4)** — text-only stream badges (quality, resolution,
  HDR/Dolby Vision, audio, encoder, channels, language) served by the addon
  itself, no artwork hotlinked:
  **https://binge-addon-httpbasant2-9067s-projects.vercel.app/badges.json**
  Nuvio steps: Profile → Layout → Streams → **Fusion badge URL** → paste the
  link above → Save. Nuvio snapshots the pack on import, so after a pack
  update re-paste the same link to refresh it.

## Layout

- `app/` — the addon itself (see `app/README.md` for the file layout and env
  vars: `TMDB_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `DISABLE_SOURCES`).
- `design_draft.md` — the full design (Elephant draft + Goldfish review).
- `DEPLOY.md` — deploy history and runbook (Vercel).
- `pretest/` — pre-deploy probe outputs for each stream source.
- `tests/` — test plan T1–T10.

## Versioning

Base version is **1.0.0**. Each later batch advances the version by the
**count of user-requested changes** in that batch. Every version field is a
single digit 0–9, with carry at 10 (e.g. 1.0.9 + 1 change → 1.1.0). The
intended version is stated **before** building, and failed retries never
consume a version.

## Deploy

Deployed on Vercel (Hobby/free): https://binge-addon-httpbasant2-9067s-projects.vercel.app
