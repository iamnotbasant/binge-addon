# Binge Addon — AI System Design Draft (Elephant, v2 — post-Goldfish rewrite)

> Design only. No code, no deploy, no version bump. Written 18 Nov 2026,
> rewritten same day after 2 Goldfish reviews.
> **Review outcome: both reviewers returned REJECT on v1.** This v2 is a
> rewrite, not a polish pass — see §14 for what changed and why.
> Sources: `app/scripts/build-catalogs.js`, `app/lib/manifest.js`,
> `app/lib/config.js`, `app/lib/admin.html`, `app/lib/parse.js`,
> `app/lib/sources.js`, `app/lib/store.js`, `app/index.js`,
> `~/MEMORY.md` + daily logs under `~/memory/` (Moctale taste),
> `app/vercel.json`, `app/api/cron/rebuild.js`.
> Live state at draft time: manifest 1.0.4, badges.json live; v1.0.5
> dashboard redesign **stopped in Muse 18 Nov ~14:47 IST and moved to
> Antigravity** — this draft is drawn against the actual `admin.html`
> in the repo, not against the in-flight redesign (see §8).

## 0. What basant asked, in one line

"Addon ke andar AI integrate karo — Moctale jaise research karke catalog
banaye, sab kuch dekhne me achha lage; dashboard me bhi AI ho; cheezein
AI se ho jayein; kuch missing ho to system khud sambhal le."

Translation into a buildable product: an AI layer that (1) curates
catalog rows from basant's own Moctale taste instead of generic TMDB
popularity, (2) detects and fills the gaps the current builder leaves
(thin rows, unplayable titles, missing Hindi audio, missing posters),
and (3) reports everything in the dashboard for his approval — nothing
goes live silently.

## 1. Principles (non-negotiable, inherited from the addon)

1. **Free only.** No paid service, no paid model tier, no debrid, no
   login-gated API. If a provider stops being free, the system falls
   back to TMDB-only rules (§6, option D) — never to a paywall.
2. **Hindi first, 1080p max, never 4K/CAM.** Every AI row obeys the
   same filters as the hand-built rows: IMDb id required, TV-show
   filter for series, 1080p cap. The AI cannot override these.
3. **No invented titles.** An AI suggestion is a *proposal*, not a
   row. It only becomes a row item after it resolves to a real TMDB
   id and passes the existing filters (§5). A hallucinated title can
   never reach Nuvio.
4. **His taste, not generic popular.** Anchored to his Moctale
   verdicts (§2). If the AI cannot tell a pick from a generic
   "trending" list, the row does not ship as an AI row — it ships
   as a rules row and the dashboard says so (§5.4).
5. **Approve-first by default.** Nothing AI-proposed goes live
   without basant's tap until he explicitly chooses auto-live (D2).
6. **Keys never in chat, repo, or logs.** Any provider key is set by
   basant himself in the Vercel dashboard (or through the approved
   secure flow). Muse never sees, stores, or prints a key value.
7. **Yesterday's rows keep serving.** Like the current builder, the
   AI step writes nothing until its output is complete and validated;
   a failed AI run leaves the previous rows untouched.
8. **Rows are single-type catalogs.** A Stremio catalog has exactly
   one `type` (`manifest.js`, `build-catalogs.js` writes
   `${rowId}-${type}`). There is no "movie + series" or "mixed" row.
   Every AI row below is therefore TWO catalogs (movie + series),
   with explicit ids (§3).

## 2. Taste profile — the AI's only source of "what basant likes"

### 2.1 What is on record (verified from the daily logs, 18 Nov 2026)

> ⚠️ v1 of this draft got this section wrong. The corrections below
> come from Goldfish review (verified against
> `memory/2026-11-10.md:455,468` and `memory/2026-11-13.md:388`).

- **Moctale account:** moctale.in, username `basant`. **137 movies
  watched** in the Moctale Movie Sheet (Google Sheet, built 10 Nov
  2026; #001 Interstellar → #137 Jailer 2). **Only 105 have
  verdicts.** Verdict tally (136 titles, 10 Nov 2026): **Perfection
  45, Go For It 38, Timepass 20, Skip 1 (only Hanuman Ansh), no
  verdict 32** (watched tick only). **#137 Jailer 2 = Perfection
  (13 Nov 2026), so Perfection is 46, not 45.** The competing tally
  line in the same log (P49/G41/T13) conflicts with the detailed
  136-row list; this draft follows the detailed list, as the sheet
  does.
- **Verified Perfection anchors (the only titles the AI may use as
  anchors):** Ramayana: Part One, Jailer 2, Drishyam: The
  Conclusion, Andhadhun, Searching. (Confirmed Perfection in the
  daily logs.)
- **Blank-verdict titles — watched, verdict unknown, NEVER anchors:**
  Interstellar, Dangal, 3 Idiots, Drishyam (2013), The Dark Knight,
  Kota Factory, The Family Man, Oppenheimer. v1 listed most of these
  as "love anchors" — that was wrong, and is removed here. A row
  named "Because You Loved Interstellar" would be a lie in Nuvio:
  he never rated Interstellar.
- **Oppenheimer is NOT a negative anchor.** v1 called it
  "Oppenheimer = Timepass, the single most informative negative
  signal". On the rebuilt sheet Oppenheimer has a **blank verdict**;
  the Timepass label comes from the superseded October 131-title
  dataset (different tallies: 62/45/22/2). It is not used anywhere
  in this design.
- **Loves (from verified verdicts + logs):** high-concept sci-fi,
  story-driven animation, Indian dramas/series/stand-up, punchy
  action. **Stand-up has no TMDB mapping** (TMDB discover has no
  stand-up category) — it is recorded as a love the pipeline
  cannot currently express as candidates; the design does not
  pretend otherwise.
- **Speed Doctrine — downgraded.** The 17 Oct 2026 rule ("pacing
  predicts verdict more than genre; Fast = zero Timepass; Slow =
  62% Timepass/Skip") checks out arithmetically
  (`memory/2026-10-17.md:478`) but rests on **13 slow titles**
  from the superseded dataset, with a disclosed ±1
  aggregate/row mismatch. It is **thin evidence, not a first-class
  signal**. Worse, v1's pace proxy (runtime ≤ ~2h15) excludes his
  own verified favourites: Ramayana: Part One is **3h 15m**,
  Interstellar 169 min, Dangal 161 min. Runtime is not pace;
  genre is not pace. **Pace is therefore a dashboard-reported
  stat in this design, NOT a ranking signal** — until it is
  derived from the sheet once D4 lands (D4 is now load-bearing
  for this, see §12).

### 2.2 How the taste profile is stored

A single human-readable file, **`taste.json`**, committed in the
repo. Read path (specified, unlike v1): the builder reads it from
the repo bundle at build time (it is deployed with the code, like
`manifest.js`); the Muse-side job, if any, reads the same repo
file. There is **no** "copy to Blob" step — v1's was hand-waved
(no code copies repo files to Blob) and is deleted here.

```json
{
  "version": 2,
  "updated": "2026-11-18",
  "verdicts": { "perfection": 46, "goForIt": 38, "timepass": 20,
                "skip": 1, "watchedNoVerdict": 32, "totalWatched": 137 },
  "anchors": {
    "love": ["Ramayana: Part One", "Jailer 2",
             "Drishyam: The Conclusion", "Andhadhun", "Searching"],
    "neverAnchor": ["Interstellar", "Dangal", "3 Idiots",
      "Drishyam (2013)", "The Dark Knight", "Kota Factory",
      "The Family Man", "Oppenheimer"],
    "note": "Anchors are verified-Perfection titles only. Never-anchor
             titles are watched with no verdict; they may enter rows
             as ordinary candidates, never as the reason for a pick."
  },
  "loves": ["high-concept sci-fi", "story-driven animation",
            "indian drama", "stand-up (no TMDB mapping)",
            "punchy action"],
  "languages": ["hi", "te", "ta", "ml", "kn", "bn", "mr", "gu", "pa"],
  "note": "English picks are global, not Indian — 'en' is not a
           taste language here."
}
```

- The profile is built **once, by hand, from verified verdicts** —
  not auto-generated by the AI. The AI reads it; it never rewrites
  it.
- The dashboard shows the profile read-only. (v1's "suggest an
  edit" box is cut for v1 — a suggestion box with no reader is
  dead UI; see §8.)
- **OPEN INPUT (recorded, not guessed): the Moctale Movie Sheet
  link/ID could not be found** in `~/workspace` or memory after two
  searches. Until basant provides the link (D4), the profile above
  is the whole taste input, and the sheet's 18 micro-niches, vibe
  breakdowns and per-title speed tiers — which *do* exist in the
  sheet — cannot be used. The design ships anyway, but §2.1 is
  explicit about what is unverified rather than citing
  sheet-derived precision it never analysed.

### 2.3 Why a profile file, not "just ask the LLM"

An LLM asked "what would basant like?" with no grounding returns
generic popular titles (the same list TMDB popularity already
gives). The profile forces grounding: every proposal must name
which verified anchor it matches, and the validator (§5) checks
the claim with a signal independent of the candidate source
(§5 step 6, rewritten — the v1 version was circular: candidates
came from TMDB recommendations of the anchor and were then
"validated" by checking the same recommendations).

## 3. What the AI does — the product

### 3.1 Proposed AI rows (12 single-type catalogs, 20 items max each)

Each row below is TWO catalogs (movie + series) unless marked
movie-only / series-only. Manifest size check (Goldfish-verified):
27 catalogs = 3,031 bytes today; +12 AI catalogs ≈ 3,923 bytes —
the 8 KB manifest limit is **not** a blocker.

| # | Row (name in Nuvio) | Catalog ids | How it is built |
|---|---|---|---|
| A1 | **Basant's Picks** | `ai-basant-picks-movie`, `ai-basant-picks-series` | Top taste matches: candidates from TMDB recommendations/similar of his **verified** anchors, re-ranked by the taste profile, then validated (§5). The flagship row. Overlap with Trending Worldwide is reported in the dashboard; if it exceeds 50%, the row is flagged (it would mean the AI is just echoing popular). |
| A2 | **Because You Loved Ramayana** | `ai-because-loved-movie`, `ai-because-loved-series` | One verified anchor at a time. The anchor rotates by a **dashboard config name change** (the existing `name` override mechanism — no manifest change, Nuvio picks it up on manifest refresh in ~1 min). Rotation order is fixed in `taste.json` (Ramayana → Jailer 2 → Drishyam: The Conclusion → Andhadhun → Searching). The row name always names the current anchor. |
| A3 | **Hidden Gems for You** | `ai-hidden-gems-movie`, `ai-hidden-gems-series` | **Redefined (v1's claim was backwards).** The Indian Underrated row is 2/0 because its pool — Indian origin + vote_average ≥ 7.8 + vote_count 2,000–25,000 — contains ~2 titles; adding a taste filter to the same pool yields ≤ 2, not 20. So A3 is **global, not India-only**: same vote band, no origin restriction, plus the taste filter. The Indian Underrated Gems row itself is NOT fixed by AI — its fix is a knob change (widen the band), which is a dashboard decision, not an AI feature. A3's pool is stated honestly here. |
| A4 | **Weekend Binge List** | `ai-weekend-movie` (10), `ai-weekend-series` (10) | **Split (v1's "mixed" row cannot exist).** A fast-paced movie row + a 1-season-series row, 10 items each. The only row where stream-presence is checked for every item before it ships. "Weekend" is a name, not a schedule: it rebuilds daily like everything else — there is no Friday-only cron trigger (vercel.json has one daily cron). |
| A5 | **— dropped —** | — | v1's "Fast & Punchy" row is **deleted**. Its pace proxy (runtime ≤ 2h15) excludes Ramayana (3h15m) and his other long favourites, and TMDB has no pace field. Pace survives only as a dashboard-reported stat. If the sheet (D4) later yields a real pace signal, A5 can return as a new decision — it is not smuggled in now. |
| A6 | **New This Week, For You** | `ai-new-this-week-movie`, `ai-new-this-week-series` | Fresh releases ranked by verified-anchor neighbourhood, not by raw recency. **Framing corrected:** the v1.1 vote_count ≥ 10 floor already removed the 0-vote noise (Kidney/Ghamela); A6's job is taste-ranking new titles, not noise removal. |

Shipping order (recommendation, D3): **A1 + A3 first** (they prove
the taste engine on the two clearest pains), then **A4** (needs the
stream check), then A2 / A6. New AI catalogs must be registered in
`manifest.js` **and** `config.js` (`defaultConfig` /
`normalizeConfig` silently drop unregistered ids and knobs — v1
omitted this entirely; §11 lists the files) and in `admin.html`
(which hardcodes `KNOB_LABELS` and renders from `cfg`).

### 3.2 What the AI does NOT curate

- It does not reorder, rename, or delete his existing 27 rows.
  (Clarified vs v1: M1 backfill, §4, proposes titles for *thin*
  rows but never silently injects them — backfill proposals go
  through the same approve queue as AI rows. The rows' definitions
  do not change without his tap.)
- It does not touch Trending / Theatres / Announcements (news rows
  stay purely TMDB-driven).
- It does not decide stream order — Hindi-first sort stays in
  `parse.js`, untouched.

## 4. Gap-filling system — "kuch missing ho to system sambhal le"

### 4.1 What "missing" means here (taxonomy, with detectors)

Detectors must be computable from data the system actually stores.
v1's M2 and M5 were not; they are rewritten below. Build stats
are persisted to Blob as `_buildstats.json` each run (new — v1
claimed stats were "already logged", but `build-catalogs.js` only
`console.log`s them; the dashboard had no data source).

| Code | Missing thing | How it is detected | Fix |
|---|---|---|---|
| M1 | **Thin row** (< 10 of 20 items) | Per-row counts in `_buildstats.json`. **Re-baselined:** Trending Indian was 2/0 but the v2.1.0 top-up fixed it to 20/20 — it is no longer an example. Current thin rows: Underrated Gems 2/0, Latest OTT 7, Returning Soon 11, Theatres 13. | AI backfill proposals from the taste-matched pool **for that row's theme**; if the pool is genuinely exhausted, the row stays short and the dashboard says why — never padded with off-theme titles. Backfill is approve-first (§4.2). |
| M2 | **No Hindi audio** | **Rewritten.** TMDB `spoken_languages` is original audio, NOT dub availability, and TMDB translations are UI text, not audio tracks — v1's detector measured the wrong thing. Ground truth for Hindi audio in this system exists only at **stream level** (`lib/parse.js` language detection at watch time). Detector: for a sampled set of a row's titles, the stream endpoint's parsed languages lack Hindi. The check is sampled and reported as a rate, not a per-title verdict. | Titles whose sampled streams show no Hindi are demoted below Hindi-audio titles **inside AI rows only** (they stay in the row, just lower). Non-AI rows are untouched. |
| M3 | **No playable stream** | Stream sources (Torrentio/Comet/HdHub) return 0 streams for the title (after `parse.js` filtering — CAM/4K-filtered-out counts as 0). | Only A4 checks every item. Other AI rows **sample across the row, not just the top 5** (v1's top-5 sample is biased: the most popular titles are the most playable, so it would overstate the playable rate and under-flag thin rows). Sampled rate is reported in the dashboard; a row whose sample is mostly unplayable is flagged, not silently shipped. Full per-title checks for all 455 items daily would blow the cron budget — see D6. |
| M4 | **Missing poster / metadata** | `poster_path` null, or overview empty, in the TMDB detail. | Title is dropped from AI rows (a row of grey boxes looks broken). Reported in the gaps list. Never invent a poster or description. **Automatic** — the one gap action that is unambiguously safe. |
| M5 | **Stale row** | **Rewritten.** v1's detector ("newest `builtAt` item date") cannot work: catalog JSON is `{ metas, builtAt }` with one file-level `builtAt` rewritten daily for every row, and `toMeta` stores only a 4-char year. Detector now: the builder persists a small `_rowstate.json` (per-row item-id set + newest release year) each build; stale = the row's id set unchanged for **7 consecutive builds**. | Widen that row's window / loosen its vote floor by **one defined step** (step table, new: windowDays ×1.5, voteFloor −0.2, one step only; the previous values are stored in `_rowstate.json` so one tap reverts). **Needs approval** — it changes the row's definition. |
| M6 | **Duplicates across rows** | Same `tt` id in > 3 rows (cross-row membership tracked in `_rowstate.json`; the idMap is tmdb→imdb only and records no row membership — v1 misdescribed it). **Exemption:** duplicates between an AI flagship row (A1) and Trending/Top Indian do not count — A1 duplicates popular titles by design. | **Report only, never auto-remove.** v1 contradicted itself here ("reported, not auto-removed" vs "auto-action above the threshold" with the action unnamed). There is no auto-action. |
| M7 | **Full but wrong** | **New (the observed failure mode).** The codebase's real leaks are off-theme titles in *full* rows (ToddWorld #20 in Popular Series; Charmsukh surviving the TV filter; CYBEROW / Hell PHYRE topping Sci-Fi by rating — all in `build-catalogs.js` comments). Detector: row-theme spot checks in the AI report (titles failing the row's stated rule, sampled) + basant's own reports. | Queued for his review in the dashboard; never auto-dropped (a "wrong" title is a judgment call, not a missing field). |
| M8 | **Hindi audio exists, stream is CAM-only** | **New.** The intersection M2 × M3 never met in v1 — yet this is the case he actually complained about (DVDScr in lists, v1.0.3). Detector: sampled stream check where Hindi audio is present only on CAM/screener-filtered streams. | Title flagged in the gaps report; A4 swaps it out, other rows demote it. |
| M9 | **Series status flipped** | **New.** A Returning Soon / Newly Announced / Big Announcements title whose TMDB status became Ended/Cancelled, or a series with no next season coming. Detector: detail status check at build time. | Title dropped from announcement rows at build; reported. |
| M10 | **Meta missing** | **New.** The real recent bug was Jailer 2 tap → "No addon provides meta" (meta resource absent, fixed v2.1.0). Detector: meta handler returns null for a row title. | Reported; the title stays in the row (catalog is fine, detail page is the gap) — the fix is a meta-handler check, not a row change. |
| M11 | **Stream source outage** | **New.** A source returning 0/errors across the board (Comet 403 from this VM in pre-test; MediaFusion returning 0). Detector: per-source success rate in the stream layer (circuit-breaker state in `sources.js`). | Reported on the dashboard status card; the addon keeps serving from the healthy sources. No auto-action. |

### 4.2 Automatic vs needs-approval

| Action | Default | Why |
|---|---|---|
| Backfill a thin row with validated, taste-matched titles | **Needs approval** (row-level approve in the queue) | A wrong backfill is visible every time he opens Nuvio; taste is personal |
| Drop a title with no poster/metadata (M4) | **Automatic** | Invisible except as a count; dropping is strictly safer than a broken card |
| Demote no-Hindi-audio titles inside AI rows (M2) | **Automatic** | Ordering inside a row he asked the AI to rank; the title stays, just lower |
| Widen a stale row's window (M5) | **Needs approval** | Changes the row's definition; previous values stored for one-tap revert |
| Stream-presence check for A4 (M3) | **Automatic** | The row's promise ("weekend list, all playable") requires it; unplayable titles are swapped, never listed |
| Anything that deletes, renames, or reorders his existing 27 rows | **Never automatic; never without his explicit tap** | His rows are his; the AI is an advisor, not an owner |

### 4.3 Taste sync (weekly)

Every Tuesday ~10:43 IST (the existing Moctale weekly check): **if
the sheet link is provided (D4)**, the sync reads new Moctale
verdicts and proposes profile updates (e.g. "3 new Perfection
titles: add as anchors?"). Proposals appear in the dashboard;
the profile file is only updated when he approves. If the sheet
is not linked, the sync is skipped and the dashboard says so —
no silent guessing from memory.

## 5. Validation — the anti-hallucination gate

Every AI-proposed title must pass this pipeline **inside the
Vercel builder** (which holds the TMDB key). Nothing the AI says
is trusted on its own word.

```
AI proposal { title, tmdbId, reason, anchor }
  → 0. Proposals MUST carry a tmdbId. A bare title goes through
       TMDB /search (1 call) and is capped: at most 20 title-only
       proposals per run; the rest are rejected as "no id".
  → 1. Resolve: TMDB detail fetch (append_to_response=external_ids,
       as resolveMovieItem/resolveSeriesItem already do). No match → REJECT.
  → 2. Exists + released: detail.release_date / first_air_date in the
       past (A1/A3/A6) or in the row's window. Unreleased → REJECT
       (except announcement-type rows, which AI rows are not).
  → 3. IMDb id: external_ids.imdb_id present, else REJECT (rows are
       tt-id addressed; a title without one cannot play).
  → 4. Existing filters: TV-show filter for series (type/episodes/
       network blocklist).
  → 5. Poster + overview present (M4), else REJECT.
  → 6. Taste check (REWRITTEN — v1 was circular: candidates came from
       TMDB recommendations of the anchor and were "validated" by
       checking the same recommendations; and sharing one genre is
       trivially passable). The check is now TWO independent tests,
       either of which must pass:
       (a) Cross-anchor check: the title appears in TMDB
           /recommendations or /similar (page 1 only) of a DIFFERENT
           verified anchor than the one that generated it; OR
       (b) Sheet check (only when D4 is answered): the title's
           micro-niche / vibe tags from the Moctale sheet overlap
           the anchor's micro-niche / vibe tags.
       Genre-sharing alone does NOT pass. Keywords (TMDB
       /movie/{id}/keywords) may support a pass but never cause
       one alone.
       Worked example of a rejection: a popular sci-fi that shares
       genre 878 with Ramayana, appears in no other anchor's
       recommendations, and matches no sheet micro-niche → REJECTED
       as "generic", even though it is popular and well-rated.
  → 7. (A4 only) Stream check: ≥ 1 playable stream from the enabled
       sources AND at least one of them with Hindi audio (v1's step 7
       had no Hindi condition — a title with one English 720p stream
       passed); else swap.
  → PASS → row item. Every rejection is logged with its reason in
     _buildstats.json, and the dashboard shows "AI suggested X,
     Y passed, Z rejected (reasons)".
```

### 5.1 Call budget (new — v1 never counted this)

- Per proposed title: **2 TMDB calls** (detail + one
  recommendations/similar page-1 call), +1 `/search` call only
  for title-only proposals (capped at 20/run).
- 12 AI catalogs × 20 titles = up to 240 titles → **~480 calls**
  worst case, on top of a builder that already makes hundreds of
  detail calls per run (concurrency 10, 429 retries with
  `Retry-After` waits). TMDB's rate limit is never stated in the
  draft because it must be read live at implementation; the design
  caps AI validation at **300 calls per run** — overflow proposals
  defer to the next day, and the dashboard says so. If the budget
  is exceeded mid-run, the build still writes the TMDB rows and
  skips the remaining AI validations (partial success, reported)
  — never fail the whole rebuild because the AI was slow.
- The gate applies to every provider option, including D.

### 5.2 How rows are built — resolving v1's contradiction

v1 said two incompatible things: "if the AI invents 20 titles,
all 20 are rejected… the row ships empty" (§5) and "the rows
never go empty because the AI had a bad day" (§6 D). **Resolved:**
each AI row is built in **two layers**. The D-rules layer fills
the row to 20 first (guaranteed full, using the same vote-band /
genre rules as the hand-built rows). Validated AI picks then
**displace D-rule titles from the top** (AI picks first, D fills
the remainder). If the AI contributes 0, the row is all D-rules
and the dashboard flags it ("AI contributed 0/20 — rules only").
A row never shows a fake card and never goes empty; the AI's
contribution is counted honestly per row.

### 5.3 Stream checks — budget and placement (new)

- `sources.js`: 3.5 s per-source timeout, ~7 s overall deadline
  per title. A4's every-item check (10 titles per type) and D6's
  sampled checks must run **inside the cron build (300 s)**, never
  in `api/index.js` (10 s maxDuration — a single 7 s fan-out
  nearly exhausts it). A live "Research now" doing Groq + TMDB
  validation inside 10 s is implausible; §8 labels the button
  honestly about this.
- "≥ 1 playable stream" is defined against `parse.js` filtering
  (disabled sources, circuit-breaker state, CAM/4K filtered out
  all count as 0). Comet returned 403 from this VM in pre-test —
  builder-side Comet availability is unproven and must be probed
  at implementation; a source that fails from Vercel is reported
  (M11), not silently trusted.

## 6. Provider options — honest trade-offs

### Option D — TMDB-only smart rules (no LLM anywhere) ⭐ v1 ship

- **How:** the taste profile is encoded as deterministic filters
  — genre sets + keyword sets + vote bands + verified-anchor
  recommendations — and the builder applies them with no model
  call at all. A1 becomes "verified-anchor recommendations,
  cross-anchor checked"; A3 becomes "underrated band, global".
- **Cost/latency:** ₹0, zero added latency, cannot fail except
  when TMDB fails (and then the whole build already fails).
- **Trade-off:** no real research, no explanations beyond the
  anchor link, no adaptation to new taste signals except by
  editing `taste.json`. It is "smart rules", not AI — but it is
  honest, and it is the correct v1.
- **Role in this design:** D is the **v1 ship and the always-on
  base layer** (§5.2). Every other option adds taste ranking on
  top of D; none replaces it.

### Option A — Groq (his key in a Vercel env var) ⭐ v1 LLM

- **How:** `GROQ_API_KEY` set by basant in the Vercel dashboard.
  A build step (after the TMDB rows, before Blob writes) calls
  Groq chat completions with the taste profile + candidate lists,
  asking for ranked picks with reasons + anchors. Models on
  record: `gpt-oss-20b` (verified working Nov 2) and
  `qwen/qwen3-32b` (verified working Nov 12). **Model names must
  be re-verified at implementation** — free-tier availability
  changes; the design hardcodes no model.
- **Cost:** ₹0 on Groq's free tier for this volume (a few dozen
  short calls per day, **one call per row, not per title**).
  Exact rate limits unverified — implementation reads the live
  Groq limits and sizes batches under them.
- **Latency:** Groq is fast (seconds per call); fits the 300 s
  cron budget when batched. If it exceeds budget, §5.1 partial
  success applies.
- **Key handling:** he sets it himself in Vercel; Muse never sees
  it. **Key-missing state machine (new — v1 had none):** if D1 =
  A and the key is absent/expired, AI rows are D-only and the
  dashboard shows "AI key not set — showing rules-based rows".
  Rows are never mislabelled as AI, never empty.
- **Risks:** key creation is currently blocked by a Cloudflare
  Turnstile he must click himself (recorded 12 Nov). Precedent
  cuts against "he sets it himself": the TMDB key was set by the
  parent via the Vercel API (HTTP 201), not by him in the
  dashboard — so D5 must offer both routes honestly (Vercel
  dashboard by him, or the approved secure flow).
- **Why A is the v1 LLM (not C):** it runs where the TMDB key and
  the real candidate lists already are. That is the decisive
  difference.

### Option B — Gemini via his AI Studio key

- **How:** `GEMINI_API_KEY` in Vercel env, same shape as A.
  His key already drives SayIt, so it exists and is known-good
  for text tasks.
- **Trade-off vs A:** Gemini free-tier rate limits are tighter
  for repeated daily calls, and the SayIt key is shared with his
  dictation app — a quota incident in one place could affect the
  other. Groq is the cleaner separation.
- **Verdict:** viable backup to A, not the first choice.

### Option C — Muse-side curation on a schedule (UNPROVEN — do not recommend for v1)

- **How it would have to work:** a scheduled Muse job researches
  candidates and delivers them to Vercel. The v1 design had no
  mechanism for this, and the reviewers proved it: writing to
  Blob requires `BLOB_READ_WRITE_TOKEN`, a secret Muse would have
  to hold — contradicting principle 6 ("Muse never sees a key
  value"). **The concrete write path, if C is ever revived:** a
  new authenticated Vercel endpoint (`POST /api/ai/proposals`,
  gated by the same `ADMIN_PASSWORD` header as
  `/admin/api/config`) that accepts a proposals payload and writes
  the staging file; the Blob token never leaves Vercel; the Muse
  job authenticates with the admin password through the approved
  secure flow. Until that endpoint exists, C is not "zero new
  secrets, zero Vercel risk" — it is unimplemented.
- **Other gaps if revived:** build stats must be persisted
  (`_buildstats.json`) before any Muse job can read "current row
  stats" (today they exist only as `console.log`); the idMap is
  tmdb→imdb only and records no row membership (v1 misdescribed
  it); the Muse cron is a different scheduler from the Vercel
  cron with no ordering guarantee vs the 10:30 IST rebuild and no
  failure alerting.
- **Cost, stated honestly:** not ₹0 — it costs metered Muse
  usage (one research job/day over up to 455 items), unquantified
  in this draft. The comparison table must carry an estimate at
  implementation time.
- **Verdict:** kept as a D1 option with the write path now
  specified, not deleted — but **not recommended for v1**.

### Provider comparison (at a glance)

| | A: Groq ⭐ LLM | B: Gemini | C: Muse-side | D: rules only ⭐ ship |
|---|---|---|---|---|
| New key needed | Yes (his Groq key) | Yes (his AI Studio key) | No key, but needs new endpoint + admin auth | No |
| Extra cost | ₹0 (free tier) | ₹0 (free tier) | Metered Muse usage (unquantified) | ₹0 |
| Lives in Vercel cron | Yes | Yes | No (staging file) | Yes (no call) |
| Fits 300 s budget | Yes, if batched | Yes, if batched | N/A | Yes |
| Taste grounding | Profile in prompt | Profile in prompt | Full history | Profile as filters |
| "Research now" button | Yes (seconds) | Yes (seconds) | No (queued job) | N/A |
| New failure mode | Key/rate-limit | Key/quota (shared) | Scheduler + endpoint | None |
| Fallback | D | D | D | — |

**Recommendation: D ships v1 (base layer), A is the v1 LLM on top
of it, B is the backup, C stays a specified future option.**
v1's recommendation (C) is reversed — the reviewers proved C has
no mechanism and A runs where the key and candidates live.

## 7. Data flow (end to end)

```
Moctale sheet (if linked, D4) ─┐
Memory taste tallies (verified) ┤
                              ▼
                    taste.json (repo, v2 — verified verdicts only)
                              │
        ┌─────────────────────┼─────────────────────┐
        │ Option D (v1 ship)  │ Option A (v1 LLM)   │ Option C (future)
        │ deterministic rules │ Groq call in cron   │ Muse job → POST
        │ in the builder      │ ranks candidates    │ /api/ai/proposals
        └────────┬────────────┴────────┬────────────┘
                 ▼                     ▼
          proposals (in-memory in the cron run; or
          ai-proposals.<ts>.json in Blob + pointer write last,
          for the C path — versioned file + pointer is the
          atomicity mechanism; plain overwrite is NOT atomic,
          per writeRowsToBlob's in-place put)
                 │
                 ▼
        Builder validation gate (§5) — TMDB detail, IMDb id,
        TV filter, poster, cross-anchor/sheet taste check,
        (A4: stream + Hindi check) — capped at 300 calls/run
                 │
         ┌───────┴────────┐
         ▼                ▼
   D-base rows +        rejection log + counts
   AI-validated picks   → _buildstats.json (Blob)
   on top (§5.2)              │
         │                    ▼
         ▼              dashboard "AI report"
   catalogs/ai-*.json
         │
         ▼
   Manifest (new AI catalogs, registered in manifest.js +
   config.js, toggleable like the 27)
         │
         ▼
   Nuvio (refresh; AI rows appear like any other row)
```

- **Where the AI runs:** v1 — inside the cron build step (D
  always; A as one batched call per row). C, if ever revived,
  runs outside Vercel and delivers via the authenticated
  endpoint.
- **What it reads:** `taste.json`, the Moctale sheet (if linked),
  `_buildstats.json` / `_rowstate.json`, the existing idMap (for
  tmdb→imdb resolution only — it records no row membership).
- **What it writes:** `catalogs/ai-*.json` via the builder (same
  write path as the 27 rows), `_buildstats.json`,
  `_rowstate.json`, and (C path only) the staging proposal files.
  It never writes `config.json` (basant's, via the dashboard)
  and never touches the 27 existing rows.
- **Timing:** daily, in the 10:30 IST cron rebuild. Dashboard
  approval applies on the **next manual rebuild or next cron**
  (content needs a rebuild — the dashboard's existing Manual
  Rebuild button is the same-day fast path; v1's "~1 min" claim
  applies to manifest enable/disable only, not to row content).

## 8. Dashboard AI section

Drawn against the **actual `admin.html` in the repo** (light-theme
single page: header + cards for status, catalogs table, knobs,
streams — **no sidebar**). The v1.0.5 dark redesign moved to
Antigravity, so this section is specified as an addition to the
real dashboard, with a note to re-check layout when the
Antigravity dashboard lands (open input §13.3). It is also cut
for v1: **3 features, not 6** (v1's taste-profile view and
"Research now" are cut — a suggestion box with no reader is dead
UI, and a button that promises proposals "in a while" with no
delivery path is a dead end).

1. **AI row toggles** — one toggle per AI row (A1–A6 as 12
   catalogs), same as the existing catalog toggles. Off = the row
   vanishes from the manifest.
2. **Approve queue (row-level approve-all only for v1)** — "AI ne
   ye suggest kiya" list per row: poster, title, one-line reason
   ("Ramayana jaisa, fast-paced sci-fi") and the anchor it
   matched. Buttons: **Approve row** / **Reject row** (per-title
   approve/reject is a later phase — v1's per-title queue plus
   row-level approve contradicted each other and his actual
   pattern is fast taps, not daily triage). Rejections are
   remembered **30 days** in `ai-rejections.json` in Blob.
3. **Status card (absorbs the missing-things report as 3 lines)**
   — last run time, provider (D/A/C), proposed / validated /
   rejected counts, cost (₹0, or metered Muse usage if C), which
   fallback is active ("AI key not set — rules only"), and the
   top 3 gaps (e.g. "Underrated Gems: 2/20", "3 titles had no
   poster — dropped").

**Backend (specified — v1 had none):** new authenticated
endpoints `GET /admin/api/ai/proposals`, `POST
/admin/api/ai/approve`, `POST /admin/api/ai/reject` (same
`X-Admin-Password` gate as `/admin/api/config`); Blob files
`ai-proposals.<ts>.json` + pointer, `ai-rejections.json`,
`_buildstats.json`, `_rowstate.json`. No new config.json keys
(`normalizeConfig` drops unknown keys — approvals cannot live
there without a `config.js` change, which is listed in §11).

**Proposal lifecycle (specified — v1 had none):** unapproved
proposals **expire after 7 days** and are logged as expired, not
silently deleted; the daily job never overwrites a live queue —
it writes a new versioned file and the pointer moves only when
the file is complete. Approvals take effect on the next manual
rebuild (same-day fast path) or next cron. **D2 flip condition:**
after 3 consecutive approved rows with zero rejections, the
dashboard offers auto-live per row (one tap) — the defined
moment trust converts to automation.

## 9. What it will NOT do

- No paid service, no paid model, no debrid, no login-gated source.
- No 4K, no CAM/screener, no stream-order changes.
- No auto-deleting, renaming, or reordering his 27 rows.
- No auto-editing `taste.json` or `config.json`.
- No posting, sharing, or messaging anything anywhere.
- No using his personal email.
- No storing any key in the repo, in chat, in Blob, or in logs.
- No inventing titles, posters, descriptions, ratings, or "Hindi
  audio available" claims — every claim is checked against TMDB
  or the stream sources, or it is not made.

## 10. Risks + honest limits

1. **LLM suggests a title with no Hindi stream.** Mitigated:
   A4 checks every item (+ Hindi condition, §5 step 7); other
   rows sample across the row and report the playable rate.
   Residual risk accepted: a "Basant's Picks" title may have no
   Hindi stream on a given day — the row shows it anyway (it is
   a *pick*, not a *playable* promise), and the dashboard reports
   the rate. Only A4 promises playability.
2. **Taste drift to generic popular.** Mitigated: cross-anchor /
   sheet check (§5 step 6, rewritten) + verified anchors only +
   A1-vs-global-trending overlap reported, flagged above 50%.
   Residual risk: the check's baseline overlap is unmeasured —
   implementation must report the first week's overlap before
   the 50% flag is trusted.
3. **TMDB has no "pace" field.** Pace is a reported stat only in
   this design (§2.1). Any future pace ranking must be derived
   from the sheet (D4), not from runtime.
4. **Groq/Gemini model churn.** Free-tier model names change;
   the design pins no model. Implementation must re-verify the
   model and rate limits on the day, and the fallback (D) must
   be wired before the provider is.
5. **Cron budget (300 s) and TMDB rate limits.** §5.1 caps AI
   validation at 300 calls/run with partial success. If the
   budget is exceeded, TMDB rows still ship; AI rows are D-only
   that day, reported.
6. **Sheet link missing (open input).** Until D4 is answered,
   the taste check uses the cross-anchor test only, and the
   profile cannot auto-sync. The design ships anyway.
7. **Approval fatigue.** Mitigated by row-level approve-all,
   7-day expiry, 30-day rejection memory, and the defined D2
   flip condition (§8). If he never opens the queue, AI rows
   stay D-only — a safe default, not a broken one.
8. **Option C's mechanism does not exist yet.** If D1 ever
   chooses C, the endpoint + auth in §6 must be built first;
   the design does not pretend otherwise.
9. **Stream checks from Vercel may differ from his network.**
   Comet returned 403 from this VM in pre-test; builder-side
   stream availability is unproven until probed (M11 reports
   it; A4's promise depends on it).

## 11. Build plan (phases — for the implementation task, after approval)

- **P0 — Taste + validation + stats (no LLM):** corrected
  `taste.json` (verified verdicts only), the §5 validation gate
  in the builder (with the 300-call cap), `_buildstats.json` +
  `_rowstate.json` persistence, D rules as the base layer,
  `manifest.js` + `config.js` + `admin.html` registration of
  the AI catalog ids/knobs. Shippable alone; proves the plumbing
  with zero AI risk.
- **P1 — Groq in-cron (Option A):** batched ranking per row →
  validation → A1 + A3 rows, approve-first (row-level).
- **P2 — Dashboard AI section:** §8 (3 features + the specified
  backend endpoints and Blob files).
- **P3 — Weekend list (A4):** stream + Hindi check per item.
- **P4 — Optional Muse-side path (Option C):** only if D1
  chooses it, after the §6 endpoint + auth exists.
- **Versioning:** this addon's own line (currently 1.0.4) —
  Bite-style counting (base 1.0.0, +changes per batch) does not
  apply here; v1 wrongly imported it. The implementation task
  states its intended version before building, as always. No
  version is consumed by this design.

## 12. Open decisions for basant (he decides; design does not)

- **D1 — Provider route.** Options: D (rules, v1 ship) + A
  (Groq LLM on top) / B (Gemini backup) / C (Muse-side, only
  with the §6 endpoint built). **Recommendation: D ships v1, A
  is the v1 LLM; C stays a specified future option.** Needs from
  him: nothing for D; for A/B, he sets the key himself in the
  Vercel dashboard (or the approved secure flow — Muse never
  sees it).
- **D2 — Auto-live vs approve-first for AI rows.**
  **Recommendation: approve-first, row-level** (he taps once
  per row). Flip condition defined (§8): after 3 consecutive
  approved rows with zero rejections, the dashboard offers
  auto-live per row.
- **D3 — Which rows first.** **Recommendation: A1 Basant's Picks
  + A3 Hidden Gems (global, redefined) first**, then A4 Weekend
  Binge List, then A2 / A6. A5 is deleted, not deferred.
- **D4 — Moctale sheet link.** The sheet's URL/ID is not on
  record anywhere retrievable. **He must provide the link** for
  the weekly taste sync and for the sheet-based taste check
  (§5 step 6b). Without it, the profile stays hand-built from
  verified verdicts and the cross-anchor check is the only
  taste test.
- **D5 — Key re-provision (only if D1 = A or B).** His Groq key
  (verified working 12 Nov) and AI Studio key (drives SayIt)
  exist, but their values were never stored. For A/B he sets
  the key in Vercel himself (dashboard) or via the approved
  secure flow. For D, nothing is needed. (Precedent noted: the
  TMDB key was set by the parent via the Vercel API, not by him
  in the dashboard — so "he sets it himself" is a preference,
  not a proven flow.)
- **D6 — Stream-presence check depth.** Options: (i) only A4
  checks every item, other rows sample **across** the row and
  report the rate (**recommended** — fits the cron budget; top-5
  sampling is biased and is not used); (ii) every AI row checks
  every item (accurate, but risks the 300 s budget and needs a
  separate build step).
- **D7 — Taste profile source of truth.** Options: (i) the
  Moctale sheet, synced weekly (**recommended once D4 is
  answered**); (ii) the hand-built `taste.json` from verified
  verdicts, updated only when he says so. Until D4, (ii) is the
  only option.
- **D8 — "Research now" expectations.** v1 has no live button
  (cut from §8 — no job exists to queue). Only Option A makes
  it instant (seconds, inside the cron path — not inside the
  10 s `api/index.js` budget). Is minutes-via-queue acceptable
  later, or does he want instant (which forces D1 = A)?
  **Recommendation: no button in v1 at all.**

## 13. Open inputs (not decisions — missing facts)

1. Moctale Movie Sheet link/ID (see §2.2).
2. Live Groq free-tier rate limits + currently-working model
   name (re-verify at implementation; on record: gpt-oss-20b,
   qwen/qwen3-32b, both verified in Nov 2026).
3. Whether the Antigravity dashboard (v1.0.5, in flight there)
   changes the §8 layout assumptions — re-check against it when
   it lands; until then §8 is drawn against the real
   `admin.html`.
4. First-week A1-vs-global-trending overlap baseline (needed
   before the 50% flag in §3.1 is trusted).
5. Builder-side stream-source availability from Vercel (Comet
   403 from this VM is unproven from Vercel; M11).

## 14. Goldfish review — what changed in v2 (and what was kept against advice)

Both reviewers returned **REJECT** on v1. Their blockers are
folded in above; section references are to v1 unless noted.

**Folded in (accepted):**
1. Rows are 12 single-type catalogs, not 6 "movie + series"
   rows; A4 split 10+10; manifest math shown (3,031 → ~3,923
   bytes, fits 8 KB). (§1.8, §3.1)
2. Option C demoted from ⭐ recommendation to "unproven"; D is
   the v1 ship, A the v1 LLM. C's write path is now specified
   (authenticated Vercel endpoint + admin password) instead of
   asserted. (§6, §7)
3. Validation gate budgeted (§5.1: 2 calls/title, 300/run cap,
   partial success); step 6 rewritten as cross-anchor OR sheet
   check with a worked rejection example; genre-alone does not
   pass. (§5)
4. Empty-row vs D-fallback contradiction resolved with the
   two-layer build (§5.2): D fills, AI displaces from the top,
   contribution counted honestly.
5. Blob atomicity claims deleted; versioned file + pointer is
   the specified mechanism. (§7)
6. M2 rewritten to stream-level detection; M5 rewritten to a
   `_rowstate.json` id-set detector with a defined step table
   and stored revert values; M1 re-baselined (Trending fixed);
   build stats persisted (`_buildstats.json`); M6 report-only
   with the A1 exemption; new M7–M11 gaps (full-but-wrong,
   CAM-only Hindi, status flipped, meta missing, source
   outage); A4 Friday framing deleted. (§4)
7. AI catalog registration in `manifest.js` + `config.js` +
   `admin.html` specified; `normalizeConfig` silent-drop
   behaviour named. (§3.1, §11)
8. Pace proxy removed from ranking (A5 deleted); Speed Doctrine
   downgraded to thin evidence; Ramayana 3h15m contradiction
   removed by deleting the rule, not by exempting favourites.
   (§2.1, §3.1)
9. Taste facts corrected: 137 watched / 105 verdicts,
   Perfection 46, Oppenheimer removed as an anchor, blank-verdict
   titles excluded from anchor duty, verified anchors only
   (Ramayana, Jailer 2, Drishyam: The Conclusion, Andhadhun,
   Searching). (§2)
10. A3 redefined as global (same band + taste filter); the
    Indian row's fix is a knob change, not AI. (§3.1)
11. A2 rotation specified via the existing config `name`
    override (no manifest change). (§3.1)
12. Dashboard §8 redrawn against the real `admin.html` (no
    sidebar), cut to 3 features, backend endpoints + Blob files
    specified, proposal lifecycle defined (7-day expiry,
    30-day rejections, manual-rebuild fast path, D2 flip
    condition). (§8)
13. Key-missing state machine defined for A/B; "₹0" for C
    corrected to metered Muse usage; versioning corrected to
    this addon's own 1.0.x line. (§6, §11)
14. A6 reframed (v1.1 floor already removed the noise; its job
    is taste-ranking). (§3.1)
15. Sources list extended (`parse.js`, `sources.js`, `store.js`,
    `index.js`). (§15)

**Kept against reviewer advice (judgement calls, stated):**
1. **A6 kept.** Reviewer 2 said it fixes an already-fixed
   problem (Kidney/Ghamela removed by the v1.1 floor). Kept
   because the floor removes 0-vote noise but does not rank new
   releases by taste — ranking is A6's actual job, reframed in
   §3.1.
2. **Option C kept as a specified future option, not deleted.**
   Reviewer 1 said demote it; it is demoted, but kept on the
   D1 list with its write path now explicit, because the
   credential problem has a concrete solution (Vercel endpoint
   + admin-password gate) that is worth deciding on rather
   than discarding.
3. **Row-level approve-all as the v1 queue granularity.**
   Reviewer 2 noted the tension with per-title control; v1
   keeps row-level only for v1 (per-title is a later phase) —
   his actual pattern is fast taps, and a 20-title daily
   triage queue would rot.

## 15. Sources

- `app/scripts/build-catalogs.js` — builder: TMDB discover +
  detail, ROW_CAP 20, idMap in Blob, config knobs, trending
  top-up, v1.4 TV-show filter, stats only in `console.log`.
- `app/lib/manifest.js` — 27 catalogs (3,031 bytes), manifest
  1.0.4, id `com.bharatstreams`, resources catalog + meta +
  stream.
- `app/lib/config.js` — config.json shape in Blob; catalogs,
  knobs, streams; `effectiveCatalogs()` derives from the
  manifest; `normalizeConfig` drops unregistered ids/knobs.
- `app/lib/admin.html` — dashboard v1 (light theme, header +
  cards, no sidebar): password gate, status, catalogs table,
  knobs, stream toggles, save, manual rebuild.
- `app/lib/parse.js` — stream language detection (ground truth
  for M2), Hindi-first sort, CAM/4K filtering.
- `app/lib/sources.js` — stream fan-out (3.5 s per-source
  timeout, ~7 s deadline), circuit-breaker state (M11).
- `app/lib/store.js` — Blob reads with 5-min in-memory cache
  (no complete-file mechanism).
- `app/index.js` — routes incl. `/admin/api/config`,
  `/admin/api/status`; `api/index.js` maxDuration 10 s.
- `app/vercel.json` — cron `0 5 * * *` (10:30 IST), rebuild
  maxDuration 300 s.
- `~/MEMORY.md` + `~/memory/2026-11-10.md:455,468`,
  `~/memory/2026-11-13.md:388`, `~/memory/2026-10-17.md:478`
  — Moctale verdicts/tallies, Speed Doctrine, Groq/AI Studio
  key status, Vercel token note.
