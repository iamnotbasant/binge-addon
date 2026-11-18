# Bharat Streams — Pre-test: bare stream-endpoint probes

Probed 2026-11-18 ~12:10–12:15 IST from this VM via curl (egress proxy
`hatch-egress-proxy:3128`, browser UA `Chrome/120.0` on Windows, `--max-time 30`,
one call per endpoint per title, 2 s pauses). No addon code written, nothing deployed.

IMDb ids verified correct from returned titles: `tt0111161` = The Shawshank
Redemption (1994), `tt5074352` = Dangal (2016), `tt1187043` = 3 Idiots (2009).

## Manifests — all 4 LIVE (HTTP 200)

| Source | Manifest URL (bare) | HTTP | Version | id |
|---|---|---|---|---|
| Torrentio | torrentio.strem.fun/manifest.json | 200 | 0.0.15 | com.stremio.torrentio.addon |
| Comet | comet.elfhosted.com/manifest.json | 200 | 2.0.0 | comet.elfhosted.com |
| MediaFusion | mediafusion.elfhosted.com/manifest.json | 200 | 6.2.0 | stremio.addons.mediafusion\|elfhosted |
| HdHub | hdhub.thevolecitor.qzz.io/{config}/manifest.json | 200 | 1.0.7 | com.stremio.HdHub |

Comet manifest says `configurationRequired: false`; MediaFusion likewise.
HdHub probe used config `eyJ0b3Jib3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAiLCJzb3J0IjoiZGVzYyJ9`
(torbox=unset, qualities=2160p,1080p,720p, sort=desc) — **note: it includes 2160p**,
so the addon must filter to ≤1080p (see below).

## Stream yields (playable = has `infoHash` or `url`)

| Source | tt0111161 Shawshank | tt5074352 Dangal | tt1187043 3 Idiots |
|---|---|---|---|
| **Torrentio** | 200 · 500 streams · 1.11 s | 200 · 166 · 0.76 s | 200 · 171 · 1.21 s |
| **Comet** | 403 · 0 · 0.72 s | 403 · 0 · 0.84 s | 403 · 0 · 0.85 s |
| **MediaFusion** | 200 · **0** · 1.04 s | 200 · **0** · 1.45 s | 200 · **0** · 1.07 s |
| **HdHub** | 200 · 18 total / **16 playable** · 1.26 s | 200 · 9 / **7** · 1.05 s | 200 · 5 / **3** · 1.45 s |

(HdHub totals include 2 non-playable notice entries — "🌟 Donation needed." and
"💬 Join the Discord server" — which carry only `externalUrl`, no stream URL.
Playable counts exclude them.)

## Sample streams

- **Torrentio — Shawshank:** `Torrentio\n4k DV | HDR | Побег из Шоушенка / The Shawshank Redemption [1994 UHD BDRemux 2160p HDR10 Dolby Vision]…` (infoHash ✓); `Torrentio\n4k HDR | The Shawshank Redemption 1994 2160p BluRay 👤 100 💾 6.91 GB ⚙️ YTS` (infoHash ✓). 457/500 are ≤1080p-ish; 21 Hindi-tagged.
- **Torrentio — Dangal:** `Torrentio\n1080p | Dangal 2016 1080p BluRay 👤 52 💾 2.6 GB ⚙️ YTS` (infoHash ✓); `Dangal.2016.Hindi.1080p.BluRay.x264.AC3-LOKI-M2Tv 👤 18 💾 2.7 GB ⚙️ ThePirateBay 🇮🇳` (infoHash ✓). All 166 ≤1080p; 84 Hindi-tagged.
- **Torrentio — 3 Idiots:** `Torrentio\n1080p | 3 Idiots 2009 1080p BluRay 👤 143 💾 2.75 GB ⚙️ YTS` (infoHash ✓); `3 Idiots 2009 1080p BluRay x264 Hindi AAC - Ozlem 👤 118 💾 2.51 GB ⚙️ ThePirateBay 🇮🇳` (infoHash ✓). All 171 ≤1080p; 63 Hindi-tagged.
- **Comet — all titles:** body is literally `Forbidden` (9 bytes), no JSON.
- **MediaFusion — all titles:** body is literally `{"streams":[]}` (14 bytes).
- **HdHub — Shawshank:** `HdHub 1080p` → `https://pixeldrain.dev/api/file/5hUgvP7Y?download`, desc `[PixelDrain] [💾 5.15 GB] The.Shawshank.Redemption.1994.1080p.BluRay.Hindi.English.DD5.1.x264.ESubs.Untouch.mkv` (url ✓, Hindi audio present). 16 playable: 1080p/720p/4K mixes — 2× `4KHDHub 4K` entries present, must be filtered out.
- **HdHub — Dangal:** `HdHub 1080p` → `https://pixeldrain.dev/api/file/wktKVddJ?download`, desc `[PixelDrain] [💾 2GB] Dangal.2016.1080p.HEVC.Hindi.BluRay.5.1.ESub.x265-HDHub4u.Ms.mkv` (url ✓). 7 playable, all 1080p/720p.
- **HdHub — 3 Idiots:** 3 playable (1080p/720p).

## Verdicts

| Source | Verdict | Evidence |
|---|---|---|
| Torrentio | **LIVE** | 166–500 streams/title, infoHash on all, Hindi-tagged entries present, ~1 s latency. |
| Comet | **BLOCKED (from this VM)** | 403 `Forbidden` on all 3 titles, both browser UA and `Stremio/4.4.0` UA (one diagnostic retry). Response headers show `Server: cloudflare` + `CF-RAY` — this is a Cloudflare bot gate, NOT proof the endpoint is dead. The manifest (same host) returns 200, so only the `/stream/` route is gated here. Likely cause: this VM's egress-proxy IP reputation. A real Nuvio client on a home connection may pass. **Inconclusive for real-world use — do not drop Comet on this evidence alone.** |
| MediaFusion | **EMPTY** | HTTP 200 + valid JSON `{"streams":[]}` on all 3 titles, including Shawshank (hugely popular) — this is a genuine empty result, not an error. Bare endpoint (no config) yields nothing. Earlier empty probe confirmed, now 3/3. |
| HdHub | **LIVE** | 3–16 playable direct HTTP links/title (Pixeldrain etc.), Hindi audio present, ~1–1.5 s latency. |

## Design implications (for the parent/coordinator)

1. **Fan-out of 4 does NOT stand as designed.** Only 2 of 4 bare sources yield
   streams: Torrentio + HdHub. The design needs changing for the other two:
2. **MediaFusion needs a config to yield anything.** Bare `mediafusion.elfhosted.com`
   returns empty for every title. Options: (a) drop MediaFusion from v1;
   (b) keep it only with a configured URL (its manifest says configuration is
   optional, but empirically the bare default has no scrapers enabled — a
   configured instance with torrent providers enabled is the known fix; that
   needs a decision, since "no config" was a design constraint).
3. **Comet cannot be validated from this VM.** Keep it in the design as a
   fan-out target (its manifest is live and it is a major source), but its
   yield must be verified from a non-flagged network (basant's laptop / Nuvio
   itself) before relying on it. Do not count it as a working source yet.
4. **Torrentio alone covers the Hindi-first need well** (84/166 Dangal and
   63/171 3 Idiots streams Hindi-tagged; Shawshank 21 Hindi-tagged), and HdHub
   adds direct HTTP links with Hindi audio. The two live sources together are
   a viable v1 fan-out.
5. **1080p filtering is mandatory, not optional:** Torrentio's top Shawshank
   results are 2160p/DV, and the HdHub probe config itself includes 2160p
   (2× 4K entries returned for Shawshank). The addon must drop >1080p
   entries from both sources (design already plans this — confirmed necessary).
6. **HdHub notice entries must be skipped:** the first 2 entries of every
   HdHub response are donation/Discord notices with no stream URL — filter on
   presence of `url`.

## Raw files (all under `~/workspace/bharat-streams/pretest/`)

- `manifest-torrentio.json`, `manifest-comet.json`, `manifest-mediafusion.json`, `manifest-hdhub.json`
- `torrentio-tt0111161.json`, `torrentio-tt5074352.json`, `torrentio-tt1187043.json`
- `comet-tt0111161.json`, `comet-tt5074352.json`, `comet-tt1187043.json` (each 9 bytes: `Forbidden`)
- `mediafusion-tt0111161.json`, `mediafusion-tt5074352.json`, `mediafusion-tt1187043.json` (each `{"streams":[]}`)
- `hdhub-tt0111161.json`, `hdhub-tt5074352.json`, `hdhub-tt1187043.json`
- `SUMMARY.md` (this file)

---

## Addendum — Configured MediaFusion probe (18 Nov 2026 ~12:40–12:45 IST)

Config format learned from LIVE sources (not guessed): the configure page
(`mediafusion.elfhosted.com/configure` → SPA `/app/configure`) is a React app;
its JS bundle shows the config is an AES-256-encrypted string produced by
`POST /encrypt-user-data` with the full config JSON, and the stream URL is
`https://mediafusion.elfhosted.com/<encrypted>/stream/movie/{id}.json`.
The frontend's compact→full mapping (`LN` in the bundle) gives the provider
shape: `{"name","service","priority","enabled"}`. "Direct P2P" is a free
provider (`service: "p2p"`, no token, no login). Verified against the repo
source (mhdzumair/MediaFusion, Rust backend, `src/models/user_data.rs`,
`src/routes/stream.rs`, `src/scrapers/orchestrator.rs`, `src/config.rs`).

Two configs were built, encrypted via the live endpoint (HTTP 200 both),
and probed for the same 3 titles (same method: curl, egress proxy,
Chrome/120 UA, `--max-time 30`, 2 s pauses):

**Config A — P2P only** (`config-p2p-only.json`):
`{"streaming_providers":[{"name":"p2p","service":"p2p","priority":0,"enabled":true}]}`
Encrypted: `D-TqtEFSr6vai3Y8sBp5U3BLrmiLthn61oYqbHBepGhCHiw02XmPffN3GOoqrs_SX9WCNY6-_sc4gKa6_5lDPrjz0udIWfoAyL40DViFDzKeHWp1o5Av8k_g4fiEVznFJufBjsv4P7alsyfB7Zk4-RMQ`
Configured manifest: HTTP 200 (669 B, `configurationRequired: false`).

**Config B — P2P + live search** (`config-p2p-livesearch.json`): same as A
plus `"live_search_streams":true`.
Encrypted: `D-Ewl_pLfyOYbnj5CvWBMwxKyV6RrHkM9wYGdEpw8_F9sd2jnbtPy03R1kuWsU5VWl6siI5pfroakTEA86B6o-KXBepKMDOELt7MGC5bV-wLK14angZRZ-ZmbR0RDDsSPHAGBs3D7tnaVdMhNm5CjwQQ`
(`live_search_streams` defaults to `false` in the backend model; with it
off, the stream endpoint serves only DB rows from background scraper jobs
and never scrapes live — that is why the bare endpoint was empty.)

### Configured-probe results (all HTTP 200, all `{"streams":[]}` — 14 B)

| Config | tt0111161 Shawshank | tt5074352 Dangal | tt1187043 3 Idiots |
|---|---|---|---|
| A — P2P only | 200 · **0** · 1.89 s | 200 · **0** · 2.97 s | 200 · **0** · 1.59 s |
| B — P2P + live search | 200 · **0** · 0.60 s (retry: 0.63 s, also 0) | 200 · **0** · 15.41 s | 200 · **0** · 12.53 s |

No streams at all in either config — no names/titles to sample. Raw files
in `mediafusion-configured/`: `mediafusion-configured-tt*.json` (A),
`mediafusion-livesearch-tt*.json` (B) + retry file, `manifest-configured.json`,
`config-p2p-only.json`, `config-p2p-livesearch.json`, `encrypt-resp*.json`.

### Why it stays empty (code-verified, not a guess)

- The 12–15 s latencies on Dangal/3 Idiots under config B show live
  scraping actually ran — and still returned nothing.
- The Torrentio fallback scraper is gated by the instance env var
  `IS_SCRAP_FROM_TORRENTIO`, whose **default is `false`**
  (`src/config.rs`) — the elfhosted instance evidently has it off, so
  there is no built-in Torrentio source.
- With no indexer configured, the only remaining live sources are the
  "public indexers", which returned nothing here (timeouts / health-gated /
  empty on this instance).
- The only remaining way to make MediaFusion yield would be
  `indexer_config` pointing at the user's own Prowlarr/Jackett/Torznab
  indexer — i.e. the user self-hosting an indexer. That is outside the
  v1 constraints (free, no login, zero-config, no self-hosting).

### Verdict: DROP MediaFusion from v1

Configured MediaFusion yields **0 streams for all 3 titles, in both
configs** (P2P-only and P2P + live search), on the elfhosted instance.
This is a genuine empty result, not an error (HTTP 200, valid JSON,
config accepted, manifest loads, live scrapers ran). There is no
config string to use in the addon — no working config exists within
the free/no-login/no-self-host constraints. **Fan-out for v1 =
Torrentio + HdHub** (Comet still inconclusive — VM-only 403).
