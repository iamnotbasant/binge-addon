# Binge Addon — Deploy Notes

> **Rename (v1.0.2, 18 Nov 2026):** the Vercel project itself was renamed
> `bharat-streams` → **`binge-addon`** (same id
> `prj_oKm4isKC8VkBBT8kbLkpC2oqFXMq`). **New URL:
> https://binge-addon-httpbasant2-9067s-projects.vercel.app — basant must
> reinstall once in Nuvio.** The old URL still answered 200 (v1.0.1) at
> rename time — Vercel kept the old subdomain serving the previous
> deployment; it is NOT relied on and may die at any time. **Unchanged:**
> manifest id `com.bharatstreams`, Blob store `bharat-streams`, local
> folder `~/workspace/bharat-streams`. Dated sections below keep the old
> project name/URL where they were current at the time.
>
> **Rename (v1.0.1, 18 Nov 2026):** the addon was formerly "Bharat Streams" — display name, log prefixes, package name and `bingeGroup` key are now "Binge Addon" / `binge-addon`. **Unchanged:** manifest id `com.bharatstreams`, Vercel project `bharat-streams`, its URL, and the Blob store. Dated sections below keep the old name where it was the name at the time.

**Status: CODE COMPLETE + LOCAL SMOKE PASSED. DEPLOY BLOCKED — Vercel team access.**
Date: 18 Nov 2026. Built by Muse subagents on this VM (no external person/company/service).

## What is blocked (Vercel)

- `list_projects` returns **403** — the Vercel connection is not authorized for
  team scope `httpbasant2-9067s-projects` (`team_1T774NhZ0qNqvmri9AyIqUPz`).
  Per the parent agent's update, **no Vercel MCP tool needing team scope was
  called**: no `list_projects`, `create_project`, `upload_file`,
  `create_deployment`, `create_storage_stores_blob`, `create_project_env`.
- The parent agent is fixing the authorization with basant.
- **Once unblocked, the deploy steps are:**
  1. `create_storage_stores_blob` (Vercel Blob store, free tier) → wire its
     token as project env var `BLOB_READ_WRITE_TOKEN`.
  2. `create_project` "bharat-streams" (Hobby, free tier only — no purchases,
     no domains, no paid add-ons).
  3. `upload_file` the contents of `app/` (see `app/README.md`), then
     `create_deployment`.
  4. Set env var `TMDB_API_KEY` — **the parent agent already holds basant's
     key and will set it in Vercel itself**. No key value is written anywhere
     in this repo, in any log, or in this report.
  5. `DISABLE_SOURCES` left unset.
  6. Verify deployment status + URL, then `GET /manifest.json` live and one
     live stream call before reporting live.
- **Deployed URL:** _not yet assigned (blocked)_.
- **Manifest URL:** _not yet assigned — will be `<deployed-url>/manifest.json`_.
- **Install URL (for Nuvio → Settings → Addons → Install from URL):** same
  manifest URL above, once live.

## DEPLOYED 18 Nov 2026 (REST token route — MCP team scope still broken)

- Token route: personal token via custom connector `custom.vercel-rest`
  (helper `~/workspace/custom-connectors/custom.vercel-rest/bin/vercel-rest.py`).
  Token verified: `GET /v9/projects` → 10 team projects, HTTP 200.
- **Project:** `bharat-streams`, id `prj_oKm4isKC8VkBBT8kbLkpC2oqFXMq`,
  team `team_1T774NhZ0qNqvmri9AyIqUPz`, Hobby/free, framework null.
- **Blob store:** `bharat-streams`, id `store_drqjSj6Uy2iBuItV`, region `bom1`,
  public, connected to the project at creation. `BLOB_READ_WRITE_TOKEN` env var
  auto-created on the project (verified by key list only, value never read).
  Note: a store created WITHOUT `projectId` gets no token and no documented
  endpoint attaches it later — the first such store was deleted empty and
  re-created with `projectId`.
- **Deployment:** `dpl_Cuh8FXyfkyeJPwQZ9ozQfK2wxn79`, READY.
  **URL: https://bharat-streams-httpbasant2-9067s-projects.vercel.app**
  **Manifest URL: https://bharat-streams-httpbasant2-9067s-projects.vercel.app/manifest.json**
- **Two fixes needed on top of the shipped code:**
  1. Vercel Authentication was ON by default → all requests 302. Disabled via
     `PATCH /v9/projects/{id}` `{"ssoProtection": null}` (verified null).
  2. `vercel.json` had no rewrites → `/manifest.json` 404 even though both
     lambdas (`api/index`, `api/cron/rebuild`) built fine. Added
     `{"rewrites": [{"source": "/(.*)", "destination": "/api"}]}` and
     redeployed. No addon logic changed.
- **Live checks (18 Nov):** `GET /manifest.json` → 200, 2,022 bytes, id
  `com.bharatstreams`, v1.0.0, 24 catalogs, New Indian Releases first.
  `GET /health` → 200. Catalog row → 200 `{metas: []}` (expected, no key yet).
  `GET /stream/movie/tt5074352.json` (Dangal) → 200 in 1.58 s, 40 streams,
  first Hindi dual 🇮🇳🇬🇧 1080p, zero 2160p/4K/CAM.
- **Still open (parent):** set `TMDB_API_KEY` env var → trigger first cron
  rebuild → T2/T3/T4 → basant installs in Nuvio → T5/T8/T10 + on-device verdict.
  **DONE 18 Nov (see "REDEPLOY + FIRST REBUILD" below):** key set, rebuild ran,
  T2/T3/T4 + T6 all PASS live. Remaining: basant installs in Nuvio
  (manifest URL below) → T5/T8/T10 + on-device verdict.

## REDEPLOY + FIRST REBUILD 18 Nov 2026 (TMDB key landed)

- **TMDB_API_KEY env var set by the parent** (HTTP 201, id
  `lhoEOgAel9HFf5lD`, encrypted, production). Not set again here; value
  never read or written anywhere.
- **Redeploy 1 (key now in env):** `dpl_5YuPsBtQMChcwXmm1SF7NNTuvMfe` →
  READY. Manifest 200, 24 catalogs. Health 200.
- **First rebuild attempt FAILED:** `GET /api/cron/rebuild` →
  `504 FUNCTION_INVOCATION_TIMEOUT` at ~11.6 s. Cause: `vercel.json` had
  `maxDuration: 10` on the cron function, but a cold build makes ~680
  sequential TMDB calls (discover + per-title `/external_ids`, id map empty
  on first run) — ~42 s, cannot fit in 10 s. Builder writes only at the
  end, so **nothing was written** (catalogs stayed `{metas: []}`, verified).
- **Fix (config only, no addon logic changed):** `api/cron/rebuild.js`
  `maxDuration: 10` → **300** in `vercel.json` — 300 s is the Hobby cap
  under Fluid compute (current default for new projects); `api/index.js`
  stays at 10 s (streams have their own ~7 s deadline by design).
- **Redeploy 2:** `dpl_HKsajzUfEhkwHervF2nCMWxXxuxq` → READY
  (300 s accepted — Fluid confirmed). Manifest 200, 24 catalogs.
  **Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app**
- **First rebuild SUCCEEDED:** `GET /api/cron/rebuild` → 200 in **42.2 s**,
  `{ok: true, skipped: false}`, **24 rows, 423 items total**,
  `excludedNoImdb: 109` (titles with no IMDb id, excluded per design).
  Per-row counts: new-indian-releases movie 39 / series 31; ott-releases
  movie 14 / series 15; language rows 10–20 each; Hindi Dubbed 1 + 1.
- **Live tests on the production URL (all PASS):**
  - **T2** New Indian Releases: movie 39 items (first: Kidney, Ghamela,
    Parivarik ManuRanjan), series 31 (first: Student of the Year: After
    Dark, Aaj Phir Jeene Ki Tamanna Hai, RAMAYAN AN ATHARV SRIVASTAVA
    SERIES) — real recent Indian titles, Hindi first.
  - **T3** OTT Releases: movie 14 (Mrigaya 1.5, Titanic), series 15
    (Kauriburi, Rudravanam PS). Hindi Dubbed: movie 1 (RRR), series 1
    (Akka).
  - **T4** Series language rows: hi 20 (C.I.D., Kyunki Saas Bhi Kabhi
    Bahu Thi), te 10, ta 16. Movie rows spot-checked: hi 20 (Ramayana:
    Rise of a Legend), pa 19 (Sardaarji 3).
  - **T6** Streams Dangal (new deployment): 200 in 1.9 s, 40 streams;
    first = Hindi dual 🇮🇳🇬🇧 1080p; **zero** 2160p/4K/1440p/CAM by
    programmatic scan. (First stream has no `url` — normal for Torrentio
    infoHash streams, not a failure.)
- **Observation (not a failure, flag for parent):** Hindi Dubbed rows are
  thin — 1 item each. The build-time post-filter (top-20 popular non-Hindi
  Indian titles whose `spoken_languages` include Hindi) is strict. Real
  data, design-conformant, but a wider dubbed pool would fill the row
  better — parent/design call, not changed here.
- **Install URL (for Nuvio → Settings → Addons → Install from URL):**
  **https://bharat-streams-httpbasant2-9067s-projects.vercel.app/manifest.json**

## v1.1 CATALOG FIX 18 Nov 2026 (basant: rows don't update + New Releases wrong)

- **Cron VERIFIED registered:** deployment object carries
  `crons: [{"path": "/api/cron/rebuild", "schedule": "0 5 * * *"}]`
  (= 05:00 UTC = 10:30 IST daily; Hobby allows max 1 cron/day, so daily is
  the ceiling). Rows were built ONCE manually (12:39 IST); the first
  automatic run is 19 Nov 10:30 IST — that run is the proof the daily
  update works.
- **New Releases quality floor:** `vote_count >= 10` per language, probed
  live on TMDB (Kidney: no user score at all, 0 votes, 3 days after
  release; Ramayana: Rise of a Legend: 7.5/10, 57 ratings, 13 days after
  release). Fallback: if a language yields <3 after the floor, fill from
  the most recent unfiltered titles (min 3/language).
- **New rows:** Popular Indian (discover, origin IN, popularity.desc) +
  Trending Indian (/trending/{type}/week, Indian filter by original
  language, else detail-check origin_country == IN; up to 3 pages),
  movie + series each. Total catalogs 24 → 28. Manifest order: New
  Releases, OTT, Popular, Trending, per-language rows, Hindi Dubbed.
- Version bumped 1.0.0 → 1.1.0 (manifest, package.json, /health).
- **Redeploy v1.1:** `dpl_A9nqYGdGkrJLhcjRdZ8cUVKEBKJ1` → READY (manifest 200,
  28 catalogs, v1.1.0; crons still registered on the new deployment).
  **Rebuild 1:** 200 in 32.2 s, 28 rows, 421 items. New Releases movie 15
  (top: Ramayana — floor works, Kidney/Ghamela/Parivarik gone from top),
  series 10; Popular 20 + 20 (Ramayana, Jailer 2 / C.I.D., Kyunki);
  Trending movie 3 (Ramayana listed TWICE — trending pagination repeats
  titles) and series 0 (EMPTY — global trending week has ~no Indian
  series). No regressions: Hindi Movies 20, OTT 14, Hindi Dubbed 1 + 1.
- **Fix (same day):** trending dedupe by tmdb id across pages + scan 5
  pages (was 3) + fallback: if trending <10, top up from Popular Indian
  (same type) to 10. Redeploy `dpl_76GrHkQn14MGhonhhJwKayLD11ZK` → READY.
  **Rebuild 2:** 200 in 30.7 s, 28 rows, 438 items, excludedNoImdb 64.
  Trending movie 10 + series 10, all unique ids. **T6 re-check (Dangal,
  new deployment):** 200 in 1.6 s, 40 streams, first = Hindi dual 1080p;
  one regex hit was a false positive ("DTS" audio inside a 1080p BluRay
  title) — zero real 2160p/4K/1440p/CAM.
- **Still thin (flag, not fixed here):** Hindi Dubbed 1 + 1 (unchanged —
  separate design call); New Releases movie 15 / series 10 (thin but
  honest — floor + imdb exclusion; small languages have few 10+-vote
  titles per 90 days). Trending rows are mostly Popular fallback items
  (genuinely trending Indian titles are 2-3/week globally) — recorded
  honestly in the design changelog.
- Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app

## v1.2 CATALOG REDESIGN 18 Nov 2026 (basant: New Releases still wrong + best trending etc.)

- **Basant's call:** New Releases STILL not right after v1.1 (floor was not
  enough — after Ramayana the row was still obscure titles) + "best trending
  movie etc". He confirmed the new set with "ha". Interpretation (stated so
  he can correct it): New Releases = only big/recognizable recent films on
  top; Hindi + Global releases; Top Movies; Dubbed Movies widened; NO
  Gujarati/Tamil/etc. language rows.
- **Changes (code only, no stream logic touched):**
  - `scripts/build-catalogs.js` — New Releases sort date-desc →
    popularity.desc inside the 90-day window (per language, Hindi first;
    vote_count >= 10 floor + min-3 fallback kept). Top Indian rows
    (discover, origin IN, vote_average.desc, vote_count >= 300 movie /
    100 series — 300 is TMDB's own Top Rated threshold; series use 100
    because Indian TV carries far fewer votes). Global Trending rows
    (/trending/{type}/week, NO Indian filter, top 20, dedupe by tmdb id,
    up to 3 pages to fill). Hindi Dubbed pool widened: 5 discover pages
    (was 1 page / 40 titles), stop at 20; spoken-language filter unchanged.
    Regional language row builders removed (LANG_ROW_LANGS = ['hi'] only).
  - `lib/manifest.js` — 16 catalogs, order: New Indian Releases, OTT
    Releases, Popular Indian, Trending Indian, Top Indian, Global Trending,
    Hindi Movies/Series, Hindi Dubbed. Version 1.2.0 (manifest, package.json,
    /health).
- **Deploy v1.2:** `dpl_CVwLobecbQtRUVViEnyJdYc1QHta` → READY. Manifest live:
  v1.2.0, 16 catalogs, 1,600 bytes. Cron still registered on the new
  deployment (`0 5 * * *` = 10:30 IST daily).
- **Rebuild:** 200 in 32.1 s, 16 rows, 266 items total, excludedNoImdb 12.
  Counts: new-releases 32/15, ott 14/15, popular 20/20, trending-indian
  10/10, top-indian 20/18, global-trending 20/20, lang-hi 20/20,
  lang-hi-dubbed 10/2.
- **Live verification (production URL, all PASS):**
  - New Releases movie top 5: Ramayana: Rise of a Legend, Gajab Raat,
    Reporting Live, Drishyam: The Conclusion, Lust Stories 3 — all
    recognizable recent Indian releases. (Acceptance met.)
  - Top Indian movie: DDLJ, My Name Is Khan, 3 Idiots, Like Stars on Earth
    (Taare Zameen Par), 12th Fail, Dangal. Series: Scam 1992, Panchayat,
    Kota Factory, Mirzapur, Asur, Sacred Games — genuinely top-rated.
  - Global Trending movie: The Odyssey, Avengers: Doomsday, Hunger Games:
    Sunrise on the Reaping, Other Mommy. Series: Rings of Power,
    VisionQuest, MobLand — worldwide hits.
  - Hindi Dubbed movie 10 (RRR, Jailer, Bandra, Bāhubali: The Epic, DC) —
    widening worked. Series 2 (Akka, Tula Pahate Re) — still thin: the
    non-Hindi Indian series pool that lists Hindi in spoken_languages is
    genuinely small; reported honestly, not faked.
  - No regressions: OTT movie 14, Popular movie 20, Trending Indian movie
    10, Hindi Movies 20 — same tops as v1.1.
  - T6 streams (Dangal, new deployment): 200 in 1.38 s, 40 streams, first
    = Hindi dual 🇮🇳🇬🇧 1080p; one regex hit was the known false positive
    ("DTS" audio inside a 1080p BluRay title) — zero real 2160p/4K/1440p/CAM.
- **Still open (parent):** basant installs/refreshes in Nuvio (no reinstall
  needed — manifest version bumped, catalogs refresh per Nuvio cache) →
  T5/T8/T10 + on-device verdict. First auto cron run 19 Nov 10:30 IST.

## v1.3 TOP THIS MONTH + TOP THIS YEAR 18 Nov 2026 (basant: "top movies recent ke hisab se")

- **Basant's ask:** this month ke top movies + yearly top movies. ADDED 4 catalogs
  (movie + series each), after Top Indian, before Global Trending → 16 → **20
  catalogs**. Top Indian (all-time) kept as-is. Version 1.3.0 (manifest,
  package.json, /health).
- **Row definitions (code: `scripts/build-catalogs.js`):**
  - **Top This Month** (`top-this-month-{movie,series}`): discover, origin IN,
    current calendar month (1st → today; series first_air_date), sort
    popularity.desc, NO vote floor, cap 20 (up to 2 discover pages so IMDb
    exclusions don't thin the row). Fallback: if the month window yields <5 raw
    titles, widen to last 30 days; the window used is logged + returned by the
    rebuild (`topThisMonthWindow`).
  - **Top This Year** (`top-this-year-{movie,series}`): discover, origin IN,
    current calendar year (1 Jan → today; series first_air_date), sort
    popularity.desc, NO vote floor, cap 20 (up to 2 pages).
  - **Sort choice probe (18 Nov 2026, public TMDB pages + box-office reports):**
    vote_average.desc REJECTED — it surfaces niche high-rated titles, not the
    big releases. popularity.desc puts 2026's biggest Indian releases on top:
    Dhurandhar: The Revenge (₹1,813 Cr worldwide), Drishyam: The Conclusion
    (₹575 Cr), Ramayana: Rise of a Legend (₹1,090+ Cr), Jailer 2 (₹828 Cr).
    November 2026 releases probed: Ramayana (5 Nov), Haiwaan (6 Nov), Daayra
    (13 Nov), Student of the Year: After Dark (13 Nov).
- **Deploy v1.3:** `dpl_BM5frnMC7ndTK3us4VESGFLRe5Mc` → READY. Manifest 200,
  v1.3.0, 20 catalogs, 1,907 bytes, correct order. Cron still registered on the
  new deployment (`0 5 * * *` = 10:30 IST daily).
- **Rebuild:** 200 in 25.4 s, 20 rows, 332 items total, excludedNoImdb 23.
  `topThisMonthWindow: {movie: "calendar-month", series: "calendar-month"}` —
  NO fallback needed (month is 18 days in). Counts: new-releases 32/15, ott
  14/15, popular 20/20, trending-indian 10/10, top-indian 20/18,
  top-this-month 20/6, top-this-year 20/20, global-trending 20/20, lang-hi
  20/20, lang-hi-dubbed 10/2.
- **Live verification (production URL, all PASS):**
  - Top This Month movie 20 — Ramayana: Rise of a Legend, Scene, Mookuthi
    Amman 2, DNK, Parivarik ManuRanjan (all Nov 2026 releases).
  - Top This Month series **6 — thin, honest:** November series premieres are
    few (Student of the Year: After Dark, Kauriburi: The Cursed Temple, Mr &
    Mrs Office, Pushpaka Vimanam, Aaj Phir Jeene Ki Tamanna Hai, +1). Calendar-
    month window used; the <5 fallback did NOT trigger (6 raw titles ≥ 5).
    The row fills up as the month goes on (daily cron rebuilds it).
  - Top This Year movie 20 — Ramayana, Jailer 2, Ranabaali, Gajab Raat,
    Reporting Live (top 5); Dhurandhar: The Revenge #19 and Drishyam: The
    Conclusion #18 are IN the row, lower by current popularity — Ramayana is
    hotter right now. Popularity sort choice validated.
  - Top This Year series 20 — Ali Baba Aur 40 Bhoot, Akka, Student of the Year:
    After Dark, Brothers and Sisters, The Court.
  - No regressions: New Releases 32 (top Ramayana), OTT 14 (Mrigaya 1.5), Popular
    20, Trending Indian 10, Top Indian 20 (DDLJ) / 18 (Scam 1992), Global
    Trending 20 (The Odyssey / Rings of Power), Hindi Movies 20, Hindi Dubbed 10.
    All tops/counts match v1.2.
  - **T6 streams (Dangal, new deployment):** 200 in 1.54 s, 40 streams, first =
    Hindi dual 🇮🇳🇬🇧 1080p (description "1080p 💾 32.18GB 🔊 🇮🇳🇬🇧",
    bingeGroup `bharat-streams:1080p:hindi`); **zero** 2160p/4K/1440p/CAM by
    programmatic scan (0 regex hits at all this run).
- **Still open (parent):** basant installs/refreshes in Nuvio (no reinstall
  needed — manifest version bumped, catalogs refresh per Nuvio cache) →
  T5/T8/T10 + on-device verdict. First auto cron run 19 Nov 10:30 IST.
- Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app

## v1.4 TV-SHOW FILTER FOR SERIES ROWS 18 Nov 2026 (basant: "series ke andar TV show aa rahe hain")

- **Basant's complaint (18 Nov ~13:16 IST, with Nuvio screenshot):** Popular
  Indian - Series showed C.I.D. (1998), Kyunki Saas Bhi Kabhi Bahu Thi
  (2000), The Kapil Sharma Show (2016), Charmsukh (2019). First three are
  broadcast TV shows, not web series. **BEFORE (live v1.3.0, 20 items):**
  C.I.D., Kyunki, Kapil Sharma Show, Charmsukh, Diya Aur Baati Hum, Pushpa
  Impossible, Kasauti Zindagii Kay, RadhaKrishn, Palang Tod, Anupamaa,
  Devon Ke Dev...Mahadev, Crime Patrol Satark, Iss Pyaar Ko Kya Naam Doon?,
  Bade Achhe Lagte Hain, Indian Idol, Saat Paake Bandha, Mastram,
  Dill Mill Gayye, Jodha & Akbar, Baa Bahoo Aur Baby — 17/20 TV shows.
- **Probe (TMDB website, 18 Nov 2026):** TV shows — C.I.D. 1,651 eps,
  type Scripted, Sony Entertainment Television; Kyunki 2,287 eps, Scripted,
  Star Plus; Kapil Sharma Show 474 eps, type **Talk Show**, Sony
  Entertainment Television; Taarak Mehta 4,870 eps, Scripted, Sony SAB.
  Web series (keep) — Sacred Games 16, Mirzapur 29, Scam 1992 10
  (Miniseries), Panchayat 40, Charmsukh 56 (ULLU, OTT). TMDB type
  vocabulary is only 7 values (Documentary, News, Miniseries, Reality,
  Scripted, Talk Show, Video) — **type alone does NOT kill the soaps**
  (they are "Scripted", TMDB's default; only the Talk Show dies by type).
- **The fix (code: `scripts/build-catalogs.js`, series rows only, all 10
  series rows; movie rows untouched):** three layers on the TMDB `/tv/{id}`
  detail — **(1) type** in {Talk Show, Reality, News, Video} → exclude
  (keep Scripted, Miniseries, Documentary); **(2) number_of_episodes >
  100** → exclude (biggest real web series probed 56, smallest TV show
  probed 474); **(3) broadcast-network blocklist** (exact TMDB network
  names, spaces stripped + lowercased; OTT networks deliberately NOT
  blocked). One `/tv/{id}?append_to_response=external_ids` call returns
  imdb id + filter fields together (replaces the separate `/external_ids`
  call for series); detail cached per build run and reused by the
  Trending (origin_country) + Dubbed (spoken_languages) checks — Dubbed
  series drops from 2 calls/item to 1. Series detail calls per page are
  concurrent (existing `mapLimit`, 10 workers); excluded titles counted +
  named in the rebuild response (`excludedTvShow`).
- **Refill:** freed slots backfilled from later discover pages — Popular /
  Hindi up to 20 pages, Top 10, OTT 5, New Releases 2/page/language.
  First rebuild (10/5/3 pages) left Popular series 14/20 + Hindi 13/20 —
  the Indian popularity pool is soap-heavy — so depths were raised to
  20/20/10/5 and redeployed; second rebuild filled both to 20/20.
- **Network layer WAS needed (probe proof):** short/finite broadcast
  series slip past type + cap — Yudh (Sony TV, 20 eps) and 24 (Colors,
  24 eps) are Scripted + under the cap, so only the network kills them.
- **Name trap found in live verification:** TMDB stores the Colors
  network as **"Colors"**, NOT "Colors TV" — Comedy Nights Bachao (64 eps,
  Colors) and 24: India (48 eps, Colors) slipped past the first blocklist
  into Popular/Hindi series; same for new Tamil GEC **Sony Vizha**
  (launched 19 Oct 2026) — Tamil Idol + Celebrity MasterChef Tamil are
  reality shows on Sony Vizha, but TMDB types them Scripted, so only the
  network name kills them. Blocklist patched ('colors', 'sonyvizha',
  'dangal', 'etvtelugu', 'vijaytv', Jaya/Kalaignar/Raj/Vendhar/Polimer/
  Vasanth TV) and redeployed as a same-version fix (v1.4.0, pre-delivery
  — basant had not refreshed yet). Third rebuild confirms all four gone:
  `network:Colors` (Shayad Yahi Hai Pyaar), `network:Sony VIZHA`
  (Celebrity MasterChef Tamil, Tamil Idol ×2).
- **Deploy v1.4:** `dpl_2gZxJJYHdkW6DvARRvvGHRAR89RK` → READY (manifest 200,
  v1.4.0, 20 catalogs, 1,907 bytes; cron still `0 5 * * *`). Rebuild 1:
  200 in 45.0 s, 20 rows, 314 items, excludedTvShow 359 (episodes 307,
  type 48, network 4). **Refill fix redeploy:**
  `dpl_2RsvxgbtDPoeSjx1nCe3T2pkbRNB` → READY. Rebuild 2: 200 in 30.7 s,
  327 items, excludedTvShow 529 (episodes 458, type 58, network 13).
  **Blocklist-patch redeploy:** `dpl_3NVgxyczxHJH3fXHTkL8Cnu4cJQK` →
  READY. Rebuild 3: 200 in 31.0 s, 20 rows, 326 items, excludedTvShow
  550 (episodes 470, type 58, network 22), excludedNoImdb 130 (up from
  23 — more candidates scanned on the refill pages).
- **Live verification (production URL, final rebuild, all PASS):**
  - **Popular Indian - Series 20/20 (BEFORE → AFTER):** C.I.D., Kyunki,
    Kapil Sharma Show, Diya Aur Baati Hum, Pushpa Impossible, Kasauti,
    RadhaKrishn, Anupamaa, Mahadev, Crime Patrol, Iss Pyaar Ko Kya Naam
    Doon?, Bade Achhe, Indian Idol, Saat Paake, Dill Mill Gayye, Jodha
    & Akbar, Baa Bahoo Aur Baby — ALL GONE. Now: Charmsukh, Palang Tod,
    Mastram, Ali Baba Aur 40 Bhoot, Akka, Student of the Year: After
    Dark, Brothers and Sisters, The Court, Mirzapur, X.X.X: Uncensored,
    Pritam and Pedro, Resort, Riti Riwaj, Rudravanam PS, The Family Man,
    Chumbak, Gandii Baat, Panchayat, Kavita Bhabhi, ToddWorld — all web
    series (see ToddWorld note below).
  - **Hindi Series 20/20:** same web-series set + Gullak, Sacred Games,
    The Legend of Hanuman, Special Ops, Four More Shots Please! — 24:
    India GONE.
  - **Top Indian Series 14** (Scam 1992, Panchayat, Kota Factory,
    Mirzapur, Asur, Sacred Games, Farzi, Delhi Crime, The Family Man,
    TVF Pitchers, Paatal Lok, The Forgotten Army, GHOUL, Betaal) — short
    of 20 HONESTLY: after 10 refill pages the vote_count ≥ 100 +
    vote-sorted pool of Indian web series is genuinely exhausted (the
    old top-rated slots were DD/broadcast classics killed by the network
    layer, e.g. Ramayan/Mahabharat on DD National). No faking.
  - **New Indian Releases Series 16:** Celebrity MasterChef Tamil GONE
    (replaced by #Love). **OTT Releases Series 14:** Tamil Idol GONE.
    **Top This Year Series 20/20, Trending Indian Series 10/10, Global
    Trending Series 20/20** (Rings of Power, VisionQuest, MobLand,
    Dexter: Resurrection…).
  - **Thin-but-honest rows:** Top This Month Series 5 (was 6 — November
    series premieres are few; one dropped title was a TV show), Hindi
    Dubbed Series 1 (Akka; was 2 — the other was a TV show / no-imdb).
  - **Movie rows UNCHANGED:** Popular movie 20 (Ramayana, Jailer 2),
    New Releases movie 32 (Ramayana, Gajab Raat, Reporting Live),
    Top Indian movie 20 (DDLJ, My Name Is Khan, 3 Idiots) — same tops
    as v1.3.
  - **T6 streams (Dangal, new deployment):** 200 in 1.23 s, 40 streams,
    first = Dangal (2016) 1080p h264; **zero** 2160p/4K/1440p/CAM — the
    4 'TS' regex hits are the known false positive ("DTS"/"DTS-HDMA"
    audio codec inside 1080p BluRay titles, same as v1.1/v1.2).
- **Still-a-TV-show? — honest notes:**
  - **ToddWorld (#20, Popular Indian - Series):** a US kids' cartoon
    (TLC/Discovery Kids, 39 eps) — but Wikipedia lists its countries of
    origin as US + Ireland + **India** (DQ Entertainment, Hyderabad, did
    the animation), so TMDB counts it Indian-origin and the discover
    query legitimately returns it. It is NOT a broadcast Indian TV show
    and passes all three filter layers (Scripted, 39 eps, TLC/Discovery
    Kids not in the blocklist). Fixing it would need an origin/language
    rule change — out of scope for this TV-show fix; reported, not
    hidden.
  - **Global Trending Series** can still show a short Western broadcast
    show (cap kills long runners; network list is Indian-only by design).
  - **Cunk on Cinema** (BBC Two mockumentary) sits in Global Trending
    Series — same honest limit as above.
- **Still open (parent):** basant refreshes in Nuvio (no reinstall
  needed — manifest version bumped, catalogs refresh per Nuvio cache) →
  on-device verdict that the Series rows are TV-show-free. First auto
  cron run 19 Nov 10:30 IST (daily rebuild now runs the v1.4 filter).
- Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app

## v2.0 CATALOG REBUILD 18 Nov 2026 (basant's 25-item mega-list → 27 catalogs)

- **What changed (code, by the implementation worker — this worker only
  deployed it):** `scripts/build-catalogs.js` rewritten for 27 catalogs;
  `lib/manifest.js` 27 catalogs, version 2.0.0; `index.js` /health 2.0.0;
  `package.json` 2.0.0. Old v1.4 rows GONE from the manifest (New Indian
  Releases, OTT Releases, Popular Indian, Top Indian, Top This Month/Year,
  Hindi Movies/Series, Hindi Dubbed). Old v1.4 row files remain in Blob
  unreferenced — harmless, NOT deleted.
- **Deploy v2.0:** `dpl_tigthiM7SSTN1isV93rhAs4dySkw` → READY (build ~20 s).
  Manifest live: 200, **2,979 bytes**, id `com.bharatstreams`, v2.0.0,
  **27 catalogs** in the manifest order below. Health 200 v2.0.0. Cron
  still registered on the new deployment (`0 5 * * *` = 10:30 IST daily).
  Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app
- **Rebuild:** 200 in **60.4 s**, **27 rows, 329 items total**,
  `excludedNoImdb: 144`, `excludedTvShow: 86` (type 29, episodes 50,
  network 7 — incl. One Piece 1180 eps, Bleach 416, Tamil Idol +
  Celebrity MasterChef Tamil on Sony Vizha). **Keywords: ALL 4 resolved,
  none dropped** — time travel 4379, simulation 2423, space 9882,
  dystopia 4565 (`dropped: []`, `allDropped: false`).
- **Live per-row counts (production URL, all 27 fetched):**
  trending-indian 2/0, global-trending 20/20, fresh-digital-drops 10,
  latest-indian-ott 7, latest-indian-series 20, releasing-next-30-days
  20/20, big-announcements 12/20, newly-announced-series 20,
  returning-soon 11, now-in-theatres 0, south-blockbusters 20,
  dark-crime-series 20, underrated-gems 2/0, scifi-time-travel 13/20,
  psychological-thrillers 11/1, action-heist-revenge 19,
  one-season-miniseries 1, visual-spectacles 20, action-anime 0,
  all-time-classics 20.
- **Live verification (all PASS where the row filled; tricky rows
  spot-checked by their defining property):**
  - **Trending India 2/0 — thin, honest:** Ramayana: Rise of a Legend,
    Jailer 2 (movie); series EMPTY. No top-up anymore by design (Popular
    Indian is dropped) — the global trending week genuinely holds ~2
    Indian movies and 0 Indian series this week.
  - **Global Trending 20/20:** The Odyssey, Avengers: Doomsday, Hunger
    Games: Sunrise on the Reaping (movie); Rings of Power, VisionQuest,
    MobLand (series) — worldwide hits, correct.
  - **Fresh Digital Drops 10 — GLOBAL by design (no origin filter),
    digital-date-desc sort:** top titles are German/world films (KI -
    Die letzte Erfindung der Menschheit?, Zwei an Weihnachten, Russell
    Brand: Open Secret…); only 1 Indian title (#10 Parivarik
    ManuRanjan). The digital-release detail check ran (code), but the
    row reads as a world row, not an Indian one — design follow-up if
    basant expects Indian drops here.
  - **Latest Indian OTT 7:** Khushi, Ghamela, Mrigaya 1.5, Parivarik
    ManuRanjan, Punjab Na Bhuliyo — real recent Indian digital titles.
    Thin: only 7 of 60 candidates passed the digital check in 90 days.
  - **Latest Indian Series 20:** Mr & Mrs Office, Student of the Year:
    After Dark, Pushpaka Vimanam, Kauriburi, Rudravanam PS — all recent
    Indian web series, no TV shows.
  - **Releasing Next 30 Days 20/20 — dates check out:** Avengers:
    Doomsday (18 Dec 2026), Hunger Games: Sunrise on the Reaping
    (20 Nov 2026), Dune: Part Three (18 Dec 2026), Yeh Prem Mol Liya —
    all genuinely within the next 30 days. Global by design (no origin
    filter), popularity sort.
  - **Big Announcements 12/20 (movie) + 20 (series) — FILLED:**
    Gatto, Avengers: Secret Wars, The Batman: Part II, Spider-Man:
    Beyond the Spider-Verse (movie); Harry Potter, Blade Runner 2099,
    Neuromancer (series) — all Planned/In Production upcoming titles.
    **Newly Announced Series 20 is IDENTICAL to Big Announcements
    series** (same top 20) — same query, only the window differs
    (365d vs 500d); design-conformant duplication, flagged honestly.
  - **Returning Soon 11:** Rings of Power, The Remarried Empress,
    MobLand, Tulsa King, Dexter: Resurrection — Returning Series with a
    known next episode inside 45 days (builder detail-checks
    `next_episode_to_air`; metas carry year only, so exact air dates
    were not re-verified from the live JSON).
  - **Now in Theatres 0 — EMPTY:** `/movie/now_playing` region IN,
    vote_count>=1000, 3 pages — nothing passed. Likely cause: the
    current Indian slate is recent releases with few TMDB votes
    (Ramayana had 57 votes on 15 Nov) — the 1000-vote floor is too high
    for a fresh slate. Design follow-up (lower/drop the floor).
  - **South Blockbusters 20:** Jailer 2, Scene, I'm Game, Baththa, The
    Third Murder — te/ta/ml, vote>=7, last 2 years. Correct.
  - **Dark Crime Series 20:** Eyes, TMT 1952, Mintoo, High, Ishq Aaj
    Kal — Indian Crime/Mystery web series. Correct.
  - **Underrated Gems 2/0 — thin, honest:** movie = DDLJ + 3 Idiots
    ONLY (famous films, but their TMDB vote counts fall inside the
    2,000–25,000 "underrated" band); series EMPTY — the Indian
    vote>=7.8 + 2k–25k-vote pool is genuinely exhausted after the TV
    filter in the scanned pages.
  - **Sci-Fi & Time Travel 13/20 — keywords all resolved, but the row
    is obscure:** movie top = CYBEROW, The Light That Remains, Love
    Love: Fractures…; series top = Hell PHYRE, Olympus: A
    Retrospective, Kamen Rider Drive 1-Minute Stories… — the
    vote_average.desc sort surfaces high-rated obscure titles, not the
    recognisable mind-benders. Design-conformant, quality flag.
  - **Psychological Thrillers 11/1:** movie = The Dark Knight, Fight
    Club, Parasite, Pulp Fiction, Se7en — global, correct by the
    genre+rating definition; series = Stranger Things ONLY (Mystery +
    Crime proxy, vote>=7.5 + votes>=20,000 is a narrow pool for TV).
  - **Action Heist Revenge 19:** Avengers: Endgame, The Dark Knight,
    Shawshank, Inception, The Matrix — global Action/Crime, vote>=7 +
    votes>=25k. Correct by definition.
  - **1-Season Mini-Series 1 — thin:** WandaVision ONLY. The
    vote>=7.8 + votes>=10,000 floors are strict for miniseries (few
    voters); two-pass scan found just 1 in 10 pages.
  - **Visual Spectacles 20:** Heart of the Beast, The Odyssey, Resident
    Evil, Spider-Man: Brand New Day, Project Hail Mary, Ramayana —
    genre+rating proxy (IMAX/4K unverifiable by design, name kept).
  - **Action Anime 0 — EMPTY:** popularity-sorted JP animation is
    dominated by >100-episode long-runners (One Piece, Bleach, JoJo,
    Black Clover all excluded by the cap — visible in
    `excludedTvShow`), and the 10-page scan never reached a qualifying
    short title (vote>=8 + votes>=10,000). Needs a different sort
    (e.g. vote_average desc) — design follow-up, not a code crash.
  - **All-Time Classics 20 — top 6 polluted by a TMDB quirk:** Batman:
    Knightfall Part 1, Avatar Aang: The Last Airbender, Swapped, Demon
    Slayer: Infinity Castle, Accidental Partners, Facing El Chapo are
    new/unreleased titles with few but very high votes floating to the
    top of `/movie/top_rated`; genuine classics from #7 — Shawshank,
    Godfather, 12 Angry Men, Schindler's List, Dark Knight, Spirited
    Away, LOTR: Return of the King, Green Mile. Design follow-up (add a
    vote_count floor and/or a pre-2020 date cap).
  - **Old v1.4 rows GONE from the manifest:** confirmed — no
    new-indian-releases / ott-releases / popular-indian / top-indian /
    top-this-month / top-this-year / lang-hi / lang-hi-dubbed ids
    present in the live manifest.
  - **T6 streams (Dangal, new deployment):** 200 in 1.56 s, **40
    streams**, first = Dangal (2016) 1080p h264, description "1080p
    32.18GB 🔊 🇮🇳🇬🇧", bingeGroup `bharat-streams:1080p:hindi`;
    **zero** 2160p/4K/1440p/CAM by programmatic scan (0 regex hits at
    all this run — not even the known "DTS" false positive).
- **Still open (parent):** basant refreshes in Nuvio (no reinstall
  needed — manifest version bumped, catalogs refresh per Nuvio cache)
  → on-device verdict. First auto cron run 19 Nov 10:30 IST (daily
  rebuild now runs the v2.0 builder). **Design follow-ups (not this
  worker's scope — no code changed):** (1) Fresh Digital Drops reads
  global — Indian-only or not? (2) Now in Theatres 0 — lower the
  1000-vote floor. (3) Action Anime 0 — change sort to vote_average
  desc or widen scan. (4) All-Time Classics top-6 pollution — add
  vote floor / pre-2020 cap. (5) Sci-Fi rows obscure — popularity
  sort instead of vote_average desc? (6) Trending Indian thin (2/0)
  — accept thin or restore a top-up. (7) Newly Announced Series ==
  Big Announcements series — accept or differentiate.

## v2.0.1 CATALOG FIXES 18 Nov 2026 (5 broken rows fixed)

- **What changed (code, by the implementation worker — this worker only
  deployed it):** `scripts/build-catalogs.js` fixes for the 5 v2.0 rows
  flagged in the v2.0 follow-ups; `lib/manifest.js`, `index.js`,
  `package.json` version 2.0.1. No stream logic touched.
- **Deploy v2.0.1:** `dpl_7rABs8pirje2vHUydHoXK376sLHY` → READY (build
  ~25 s). Manifest live: 200, **2,979 bytes**, v2.0.1, **27 catalogs**,
  same order as v2.0. Health 200 v2.0.1. Cron still registered on the new
  deployment (`0 5 * * *` = 10:30 IST daily). Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app
- **Rebuild:** 200 in **37.1 s**, **27 rows, 407 items total**,
  `excludedNoImdb: 108`, `excludedTvShow: 129` (type 29, episodes 92,
  network 8). **Keywords: ALL 4 resolved, none dropped** — time travel
  4379, simulation 2423, space 9882, dystopia 4565.
- **Live verification (production URL, all 27 rows fetched — ALL 5 FIXED
  ROWS PASS):**
  - **Now in Theatres 13** (was 0): Hope, Ramayana: Rise of a Legend,
    Godzilla Minus Zero, Ghost Soldier, Street Fighter, Wildwood,
    Clayface, Jailer 2, The Cat in the Hat, I Play Rocky, Scene, Tom and
    Jerry: Forbidden Compass, Mohra — real in-theatre titles.
  - **Action Anime 20** (was 0): Frieren: Beyond Journey's End,
    Fullmetal Alchemist: Brotherhood, Attack on Titan, Solo Leveling,
    Demon Slayer, Kamisama Kiss, Death Note, Haikyu!!, JUJUTSU KAISEN,
    Your Lie in April… — real anime. **Cowboy Bebop NOT in the row**
    (honest gap — the vote>=8 + votes>=10k scan did not surface it).
  - **All-Time Classics 20 — top 6 EXACTLY right:** The Shawshank
    Redemption, The Godfather, 12 Angry Men, The Godfather Part II,
    Schindler's List, The Dark Knight. The 6 polluting titles (Batman:
    Knightfall, Avatar Aang, Swapped, Demon Slayer: Infinity Castle,
    Accidental Partners, Facing El Chapo) are GONE from the whole row,
    not just the top.
  - **Sci-Fi & Time Travel 20/20** (was 13/20): movie — Project Hail
    Mary, Hunger Games: Sunrise on the Reaping, Avengers: Endgame,
    Interstellar, Avengers: Infinity War, Dune, The Matrix, Star Wars,
    Blade Runner 2049, Back to the Future…; series — The 100, Rick and
    Morty, Silo, Re:ZERO, Star Trek, Black Mirror, Quantum Leap, Loki,
    The Expanse, Dark, Battlestar Galactica… Obscure titles (CYBEROW,
    Hell PHYRE, Olympus: A Retrospective) GONE from both rows. **Doctor
    Who, Stargate SG-1, Star Trek: The Next Generation NOT in the
    series row** (plain "Star Trek" #5 + "Star Trek: Enterprise" #13
    are) — honest gap.
  - **1-Season Mini-Series 20** (was 1): Teach You a Lesson,
    Chernobyl, Planet Earth, Band of Brothers, Over the Garden Wall,
    ERASED, The Queen's Gambit, Veneno, The Penguin, 1883, The Last
    Dance, WandaVision, Mare of Easttown… **Thrillers series 20** (was
    1): The 100, True Detective, Tulsa King, MINDHUNTER, Sherlock,
    Reacher, Orange Is the New Black, FROM, Breaking Bad, Dexter,
    Stranger Things, Prison Break, Lupin, The Sopranos, Better Call
    Saul, Lucifer, Homeland, Sons of Anarchy, Fargo, Peaky Blinders —
    all 7 expected titles present.
  - **NO REGRESSIONS — all 22 other rows match the v2.0.0 baseline
    exactly:** trending-indian 2/0, global-trending 20/20,
    fresh-digital-drops 10, latest-indian-ott 7, latest-indian-series
    20, releasing-next-30-days 20/20, big-announcements 12/20,
    newly-announced-series 20, returning-soon 11, south-blockbusters
    20, dark-crime-series 20, underrated-gems 2/0, psychological-
    thrillers-movie 11, action-heist-revenge 19, visual-spectacles 20.
    Thin rows unchanged (trending-indian-series 0, underrated-gems 2/0
    — not worse).
  - **T6 streams (Dangal, new deployment):** 200 in 1.93 s, **40
    streams**, first = Dangal (2016) 1080p h264, "1080p 💾 32.18GB
    🔊 🇮🇳🇬🇧" (Hindi dual); **zero** real 2160p/4K/1440p/CAM —
    resolutions only 1080p (22) + 720p (14); the 5 regex hits are the
    known false positives ("DTS-HDMA" audio, "HDRip" encode names).
    First stream has no `url` — normal for Torrentio infoHash streams.
- **Still open / honest notes:** (1) Fresh Digital Drops still reads
  global (v2.0 design follow-up, unchanged). (2) Newly Announced
  Series still identical to Big Announcements series (same query,
  unchanged). (3) Thrillers-series top has some odd fits (The 100 #1,
  Tulsa King, Reacher, Orange Is the New Black) — genre-proxy
  limitation, not a regression. (4) Cowboy Bebop / Doctor Who /
  Stargate SG-1 / Star Trek: TNG absent from their rows (see above).
- **Still open (parent):** basant refreshes in Nuvio (no reinstall
  needed — manifest version bumped, catalogs refresh per Nuvio cache)
  → on-device verdict. First auto cron run 19 Nov 10:30 IST (daily
  rebuild now runs the v2.0.1 builder).

## v2.0.2 FRESH DIGITAL DROPS INDIAN-ONLY 18 Nov 2026 (basant: "Indian-only karo")

- **Basant's decision (18 Nov ~13:46 IST):** the live v2.0.1 Fresh
  Digital Drops row was GLOBAL by design — 10 items, top = KI - Die
  letzte Erfindung der Menschheit?, Russell Brand: Open Secret, Another
  Body, Zwei an Weihnachten (German/world films), only 1 Indian title
  (Parivarik ManuRanjan at #10). He tapped "Indian-only karo".
- **Change (code, one line + version bump):**
  `scripts/build-catalogs.js` #3 builder — added
  `with_origin_country: 'IN'` to the `/discover/movie` call (the same
  filter #4 Latest Indian Movies already uses). Detail check (any
  country's type-4 digital date in window), 45-day window
  (`FRESH_DIGITAL_DAYS = 45`), vote_average>=6 floor, digital-date-desc
  sort — all UNCHANGED. Comment updated to note Indian-only (v2.0.2).
  Version 2.0.1 → 2.0.2 in `lib/manifest.js`, `package.json`,
  `index.js` /health. Local checks: `node --check` clean; builder with
  no key logs "no key, skipping", exit 0. No TMDB key used, read, or
  requested anywhere — the Vercel rebuild (project env key) was the
  probe, per the task.
- **Deploy v2.0.2:** `dpl_7ZzajF1qtSpXLxYooGuLjhYQfKw4` → READY (build
  ~10 s, first poll). Manifest live: 200, **2,979 bytes**, v2.0.2,
  **27 catalogs**, same order as v2.0.1. Health 200 v2.0.2. Cron still
  registered on the new deployment (`0 5 * * *` = 10:30 IST daily).
  Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app
- **Rebuild (45-day window, FIRST try):** 200 in **31.8 s**, **27 rows,
  417 items total** (was 407 — the +10 is exactly Fresh Digital Drops
  10 → 20), `excludedNoImdb: 83`, `excludedTvShow: 127` (type 28,
  episodes 91, network 8). **Keywords: ALL 4 resolved, none dropped.**
  **Fresh Digital Drops: 20/20 at 45 days — the <5 widening trigger
  never fired, so the window was NOT widened to 90 days** (the 45-day
  Indian digital pool is healthy; this first rebuild IS the probe
  evidence). No second rebuild was needed.
- **Live verification (production URL, all 27 rows fetched):**
  - **Fresh Digital Drops 20 — ALL INDIAN:** The Third Murder, Happy
    Journey, Daayra, Parivarik ManuRanjan, Jailer 2, Meesaya Murukku 2,
    Last Man in Tower, I'm Game, Dilwali Diwali, Anakapalli, Avaraachan
    & Sons, Immortal, Mirzapur: The Movie, Baththa, Gajab Raat,
    Dhoomakethu, Dorothy, Lenin Pandiyan, Aasha, Enna Vilai. The 4
    German/world titles from v2.0.1 are GONE from the row.
  - **NO REGRESSIONS — all 26 other rows match the v2.0.1 baseline
    exactly:** trending-indian 2/0, global-trending 20/20,
    latest-indian-ott 7, latest-indian-series 20,
    releasing-next-30-days 20/20, big-announcements 12/20,
    newly-announced-series 20, returning-soon 11, south-blockbusters
    20, dark-crime-series 20, underrated-gems 2/0,
    psychological-thrillers-movie 11, psychological-thrillers-series
    20, action-heist-revenge 19, visual-spectacles 20,
    now-in-theatres 13, action-anime 20, all-time-classics 20,
    scifi-time-travel 20/20, one-season-miniseries 20.
  - **T6 streams (Dangal, new deployment):** 200 in 1.0 s, **40
    streams**, first = Dangal (2016) 1080p h264, "1080p 💾 32.18GB
    🔊 🇮🇳🇬🇧" (Hindi dual), bingeGroup `bharat-streams:1080p:hindi`;
    **zero** 2160p/4K/1440p/CAM (0 regex hits at all); resolutions
    only 1080p + 720p.
- **Still open / honest notes:** (1) Newly Announced Series still
  identical to Big Announcements series (same query, NOT touched —
  still basant's open call). (2) Thin rows unchanged (trending-indian
  2/0, underrated-gems 2/0 — not worse). (3) Fresh Digital Drops
  metas carry no year in the live JSON (same as before — builder
  `toMeta` omits it; the row is digital-date sorted, not year-sorted).
- **Still open (parent):** basant refreshes in Nuvio (no reinstall
  needed — manifest version bumped, catalogs refresh per Nuvio cache)
  → on-device verdict that Fresh Digital Drops is Indian-only. First
  auto cron run 19 Nov 10:30 IST (daily rebuild now runs the v2.0.2
  builder).

## v2.1.0 TRENDING FIX + IN-ADDON META + ADMIN DASHBOARD + RENAME TO "BINGE ADDON" 18 Nov 2026

- **RENAME (final, basant's call, supersedes the brief "Basant Streams"
  rename earlier in v2.1.0):** display name is now **"Binge Addon"** —
  his name must NOT appear in it. Display name ONLY: manifest id stays
  `com.bharatstreams`, Vercel project name stays `bharat-streams`, URL
  unchanged, so his existing Nuvio install just updates the name on
  refresh — no reinstall needed. Changed: `lib/manifest.js` name,
  `index.js` /health addon field (`binge-addon`), stream fallback name
  in `lib/parse.js`, User-Agent in `lib/sources.js`, package.json
  description, admin dashboard title/header. If he later asks for a
  different name, it is a one-field change (manifest `name` + the
  health/stream labels).
- **Part 1 — Trending Indian fix:** live v2.0.2 had trending-indian
  2/0 (Ramayana + Jailer 2, series empty) because the builder used
  TMDB /trending/week + Indian filter with NO top-up (v2.0 removed
  v1.1's Popular top-up by design). v2.1.0 restores a top-up: if
  trending yields <20, fill to 20 from the most-popular recent Indian
  titles (discover, origin IN, released in the last 120 days,
  popularity.desc; same imdb-id + TV-show filter rules). Trending
  titles stay first, top-up after. Same for series.
- **Part 2 — In-addon meta (fixes the Jailer 2 tap failure):** tapping
  Jailer 2 showed "Failed to load / No addon provides meta for this
  content" because the manifest declared catalog + stream only, NO
  meta. Added `meta` resource + `defineMetaHandler` in `index.js`:
  tt id → tmdb id via the persisted Blob id map
  (`catalogs/_idmap.json`, reverse lookup, 5-min in-memory cache),
  then TMDB /movie|tv/{id} with `append_to_response=credits` and full
  meta back (name, poster, background, description, year, genres, cast
  top 10, director, runtime). Series also synthesize `meta.videos`
  from the detail's seasons array (`tt:S:E` ids) so series detail
  pages open too. No map entry / no key → `{meta: null}` (Nuvio falls
  back to any other installed meta addon). Manifest stays < 8 KB.
- **Part 3 — Admin dashboard v1 (same Vercel project, no new
  hosting):** `GET /admin` serves one bright/clean page from the same
  Express app (`lib/admin.html`; `vercel.json` rewrite `/(.*)` → `/api`
  routes it to the app, while `/api/cron/rebuild` still hits the
  filesystem cron function). Password gate via `ADMIN_PASSWORD` env var
  (encrypted, production; value never written to repo files, logs, or
  the page — sent as the `X-Admin-Password` header). Config lives in
  Blob as `config.json` (`lib/config.js`: read/write/normalize, 60 s
  cache); the builder and server read it, the dashboard writes it.
  Features: (a) all 27 catalogs with live counts + top titles + last
  rebuild + next cron (daily 05:00 UTC = 10:30 IST); (b) per catalog
  enable/disable, rename, reorder (↑↓); (c) per-row knobs — window
  days + vote floor / vote-count floor/ceiling where the row has one
  (18 knobbed rows; builder reads them via `knob()`, defaults
  unchanged without a config); (d) stream settings — Torrentio/Comet/
  HdHub on/off + max quality (1080p default, 720p option; threaded
  through `fetchAllStreams` opts → `processSourceStreams` maxRes);
  (e) Manual Rebuild button — calls the same `GET /api/cron/rebuild`
  path as the daily cron (300 s function, not the 10 s app function);
  (f) connection status panel — Vercel project link, TMDB key set/
  not-set (value NEVER shown), Blob set/not-set, live URL.
  Disabled catalogs are hidden from the dynamic `/manifest.json`
  (served by an Express route ahead of the SDK router) and serve
  `{metas: []}`; the builder skips writing their rows on rebuild.
- **Deploy v2.1.0 (first):** `dpl_27WNyGufdVqxUY8gREfBwdc8TLm8` → READY
  (name was "Basant Streams" in this build). **Rebuild:** 200 in
  **~31 s**, **27 rows, 455 items total** (was 417), excludedNoImdb 87,
  excludedTvShow 131. **trending-indian-movie 20** (top-up +17:
  Ramayana + Jailer 2 first, then popular recent Indian titles),
  **trending-indian-series 20** (top-up from 0). All other rows match
  the v2.0.2 baseline exactly (global-trending 20/20, fresh-digital
  20, latest-ott 7, now-in-theatres 13, south 20, action 19, visual
  20, classics 20, next-30-days 20/20, big-announcements 12/20,
  underrated 2/0, scifi 20/20, thrillers 11/20, latest-series 20,
  newly-announced 20, returning-soon 11, dark-crime 20, miniseries 20,
  anime 20). Keywords all 4 resolved, none dropped.
- **Deploy v2.1.0 (final, rename only):**
  `dpl_HcPvp8B1TPsBDKGqKaPdNPHoNJox` → READY. No code changed except
  display-name strings, so no rebuild was needed (Blob rows from the
  first v2.1.0 rebuild keep serving). Manifest live: 200, **3,243
  bytes** (live response), name **"Binge Addon"**, id `com.bharatstreams`, v2.1.0, 27
  catalogs, resources catalog + meta + stream. Health 200
  (`binge-addon`, 2.1.0). Cron still registered on the new deployment
  (`0 5 * * *` = 10:30 IST daily).
- **Live verification (production URL, final deployment — script
  /tmp/verify-v210.py, 25/25 checks PASS, zero failures):**
  - Health 200 (`binge-addon`, 2.1.0). Manifest 200, **3,243 bytes**
    (live JSON incl. whitespace), name "Binge Addon", id
    `com.bharatstreams`, v2.1.0, 27 catalogs, resources catalog + meta
    + stream.
  - All 27 rows fetched live: **455 items total** — trending-indian
    20/20 (movie top 4: Ramayana: Rise of a Legend, Jailer 2,
    Ranabaali, Gajab Raat — genuine trending first, top-up after),
    global-trending 20/20, fresh-digital 20, latest-ott 7,
    latest-series 20, next-30-days 20/20, big-announcements 12/20,
    newly-announced 20, returning-soon 11, theatres 13, south 20,
    dark-crime 20, underrated 2/0, scifi 20/20, thrillers 11/20,
    action 19, miniseries 20, visual 20, anime 20, classics 20.
  - Meta Jailer 2 (`/meta/movie/tt33318732.json`) 200, full meta:
    name Jailer 2, genres Action/Comedy/Drama, director Nelson, year
    2026, runtime 165 min, poster + description + cast. Meta series
    (Ali Baba Aur 40 Bhoot, tt44101690) 200 with **40 videos**
    (episodes synthesized from seasons). Unknown tt id → 200
    `{meta: null}`, no crash.
  - **T6 Dangal:** 200, **40 streams**, first = "1080p 💾 32.18GB 🔊
    🇮🇳🇬🇧 Dangal (2016) 1080p h264" (Hindi dual); **zero** 2160p/4K/
    1440p/CAM.
  - Dashboard: `/admin` 200; API without password → 401; with
    password → config 200. Round-trip: disabled Visual Spectacles →
    manifest 26, catalog `[]` → re-enabled → manifest 27, catalog 20
    again. Status: TMDB key set, Blob connected, last rebuild
    2026-11-18T08:41:40Z, next cron daily 05:00 UTC = 10:30 IST.
- **Admin dashboard:** https://bharat-streams-httpbasant2-9067s-projects.vercel.app/admin
  — password set on the project (reported to the parent agent only,
  never in this file). API without password → 401; with password →
  config + status (TMDB key set, Blob connected). Round-trip test:
  disable Visual Spectacles via dashboard → manifest 26 + catalog
  `[]` → re-enable → manifest 27 + 20 items again.
- **Still open (parent):** basant refreshes in Nuvio (no reinstall
  needed — manifest id unchanged, name updates on refresh) → tap
  Jailer 2 (meta should now open in-app) + check Trending in India
  shows 20/20 → on-device verdict (T5/T8/T10). First auto cron run
  19 Nov 10:30 IST (daily rebuild now runs the v2.1.0 builder with
  top-up + dashboard config). Open decision from before, still
  unanswered: Newly Announced Series vs Big Announcements Series are
  identical — merge or keep both?
- Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app

## Source list (v1 fan-out)

| Source | Status in v1 |
|---|---|
| Torrentio | **IN** — live, 166–500 streams/title in pre-test |
| Comet | **IN** — 403-blocked ONLY from this VM (Cloudflare bot gate, egress-IP reputation). Kept in the fan-out with the §7.1 circuit-breaker; a failure never fails the whole response. |
| HdHub | **IN** — live, 3–16 playable HTTP links/title; notice entries (no `url`) filtered; >1080p dropped by the addon |
| **MediaFusion** | **DROPPED from v1** — bare endpoint AND configured endpoints (P2P-only AND P2P+live-search configs, encrypted via the live `/encrypt-user-data` endpoint) both returned `{"streams":[]}` for all 3 probe titles. The elfhosted instance has no indexer and its Torrentio fallback is off by default (`IS_SCRAP_FROM_TORRENTIO=false`); the only remaining fix would be the user's own Prowlarr/Jackett indexer (self-hosting, outside v1 constraints). No working config exists within free/no-login constraints. MediaFusion appears **nowhere** in the code. |

## Catalog state (known limitation, honest)

- **Catalogs are EMPTY until the TMDB key lands and the first rebuild runs.**
  `GET /catalog/movie/new-indian-releases-movie.json` returns `{ metas: [] }`
  (verified locally). The builder (`app/scripts/build-catalogs.js`) and the
  cron endpoint (`app/api/cron/rebuild.js`, daily 05:00 UTC via `vercel.json`)
  both handle a missing `TMDB_API_KEY` gracefully: they log
  `"no key, skipping"` and exit/return 200 — never crash, never fake rows.
- The builder implements design §6.2 exactly: 24 rows, `tt…` ids via
  `/external_ids` (persisted id map in Blob), 90-day window, grouped
  Hindi-first New Indian Releases, OTT row (Indian + flatrate), per-language
  popularity rows, Hindi Dubbed via build-time `spoken_languages` post-filter.
  Titles with no `imdb_id` are excluded and backfilled (count logged).
- Posters: TMDB CDN `w342` (D4: TMDB only in v1, no RPDB).

## Local smoke results (18 Nov 2026, server on :7000, Node v24)

- `npm install` — OK (124 packages; note: `stremio-addon-sdk@1.6.11` does not
  exist, latest is **1.6.10** — `package.json` pins `^1.6.10`).
- `GET /health` — 200 `{"ok":true,"addon":"bharat-streams","version":"1.0.0"}`.
- `GET /manifest.json` — 200, **2,022 bytes (< 8 KB)**, id `com.bharatstreams`,
  version `1.0.0`, resources `["catalog", {"name":"stream","types":["movie","series"],"idPrefixes":["tt"]}]`,
  `types ["movie","series"]`, `behaviorHints {p2p:true}`, **24 catalogs**,
  "New Indian Releases" first, description includes the TMDB attribution
  notice ("This product uses the TMDB API but is not endorsed or certified
  by TMDB").
- `GET /catalog/movie/new-indian-releases-movie.json` — 200, `{ metas: [] }`
  (expected: no Blob token / no TMDB key yet).
- `GET /stream/movie/tt5074352.json` (**Dangal**) — 200 in **3.5 s**, 40 streams.
  First: Hindi 🇮🇳🇬🇧, 1080p, seeders 19. Zero 2160p/4K/1440p/CAM in the list.
  Unknown-language streams ranked last (positions 25–39, D1 include-last).
  Per-source log: Torrentio 200, raw 166 → kept 49 (dropped: 2 over-1080,
  6 CAM, 15 language-drop, 78 zero-seeder); Comet 403; HdHub timed out at
  3.5 s on this call (flaky from this VM — worked at 940 ms for Shawshank);
  partial results returned correctly at the deadline.
- `GET /stream/movie/tt0111161.json` (**Shawshank**) — 200 in **0.95 s**,
  40 streams. First: 1080p, seeders 89, Hindi+English dual 🇮🇳🇬🇧. Zero
  2160p/4K/1440p/CAM (one verification-regex hit was the release-group name
  "Hallowed-4kHdHu" inside a 1080p title — false positive, not a 2160p
  stream). Per-source: Torrentio 200, raw 500 → kept 95 (53 over-1080
  dropped); Comet 403; HdHub 200, raw 20 → kept 15 (2 notice entries, 3
  over-1080 dropped). 13 URL streams kept, `notWebReady: true` preserved
  from the source; `filename`/`videoSize` preserved; `bingeGroup` set.
- `GET /stream/movie/tmdb:27205.json` — 200, `{ streams: [] }` (non-tt id
  defensive case, §7.2).
- **T9 failure tolerance:** `DISABLE_SOURCES=hdhub,comet` → Dangal in
  **0.6 s**, 40 streams, Torrentio-only, same first pick; log shows both
  sources skipped by flag.
- **Builder graceful-skip:** `node scripts/build-catalogs.js` with no
  `TMDB_API_KEY` → logs `[build-catalogs] no key, skipping`, exit 0.
  Cron endpoint `/api/cron/rebuild` (mock-invoked locally) → 200
  `{ ok: true, skipped: true }`.
- **Notes / nuances (design-conformant, not bugs):**
  - For an English title the first stream may be a Hindi+English **dual**
    (Hindi-presence ranks 0 globally per §7.5) — it does carry English audio.
  - Dangal's Torrentio batch drops 78 zero-seeder streams (§7.4 liveness
    rule) — seeded alternatives exist, so 0-seeders are dropped.
  - HdHub is slow/flaky from this VM (one 3.5 s timeout); the 7 s overall
    deadline + per-source timeout absorb it. Real-world latency from Vercel
    egress may differ — verify live after deploy.

## Files

- Code: `app/` (`index.js`, `api/index.js`, `api/cron/rebuild.js`,
  `lib/manifest.js`, `lib/sources.js`, `lib/parse.js`, `lib/store.js`,
  `scripts/build-catalogs.js`, `vercel.json`, `package.json`).
- Design: `design_draft.md` (v3). Pre-test evidence: `pretest/SUMMARY.md`.

## What remains (not this worker's scope)

- Vercel authorization fix (parent + basant) → project + Blob store +
  deploy + `TMDB_API_KEY` env (parent sets it).
- First cron rebuild → catalogs populate (T2/T3/T4).
- basant's on-device verdict in Nuvio (T5–T8) — only that closes testing.

## v1.0.0 VERSION RESET 18 Nov 2026 (basant: new name = fresh 1.0.0)

- **Basant's order (18 Nov ~14:13 IST, via side chat):** Binge Addon ka
  version **1.0.0** rakhna hai, 2.1.0 NAHI — new name = fresh 1.0.0
  release. **Binge versioning = Bite-style (18 Nov ~14:14 IST):** base
  1.0.0; uske baad har batch me version user-requested changes ki COUNT
  se badhega (e.g. 3 changes → 1.0.3); har field single digit 0–9,
  10 pe carry (1.0.9 + 2 = 1.1.1); build se PEHLE intended version
  batana; failed retry se version consume nahi hoga; har version GitHub
  pe professional bullet changelog (Changes / New features / Bug fixes)
  ke saath record hoga.
- **Change (version values only, no logic):** `lib/manifest.js`
  version 2.1.0 → 1.0.0, `package.json` version → 1.0.0, `index.js`
  `VERSION` const → 1.0.0, `lib/sources.js` User-Agent
  `BingeAddon/2.1.0` → `BingeAddon/1.0.0`. v2.1.0 comments kept as
  history. No rebuild needed — Blob rows persist across deployments.
- **Deploy v1.0.0:** `dpl_8wx4CYbwLmSZKUNskqTajEJG3gW4` → READY, PROMOTED
  (REST token route; no env vars touched, ADMIN_PASSWORD persists).
  Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app
- **Live verification (production URL, parent, all PASS):** /health
  `{"ok":true,"addon":"binge-addon","version":"1.0.0"}`; manifest
  **Binge Addon 1.0.0**, 27 catalogs, resources catalog + meta +
  stream; trending-indian-movie 20, series 20; meta Jailer 2 200;
  /admin 200; Dangal streams 40, first 1080p h264, zero 2160p/4K.
- **GAP (flag, not fixed here):** Binge Addon ka koi GitHub repo NAHI
  hai (code sirf `~/workspace/bharat-streams` me local hai) — GitHub
  changelog tabhi possible hai jab basant repo banane ko kahe.
- **Still open (parent):** basant refreshes in Nuvio → on-device
  verdict (name "Binge Addon" 1.0.0, Jailer 2 detail page, Trending
  20/20, play a title T5/T8/T10). First auto cron run 19 Nov 10:30 IST.

## v1.0.0 PHASE 1 — VERSION RESET (2.1.0 → 1.0.0) 18 Nov 2026

- **Note:** the three version fields were ALREADY '1.0.0' in the working
  tree when the deploy worker started (`index.js` VERSION const,
  `lib/manifest.js` version, `package.json` version — verified by grep;
  '2.1.0' survived only in code comments, kept as history, plus
  third-party `node_modules`/`package-lock.json` dependency entries).
  No source file was edited for this step; the live deployment was the
  only thing still serving 2.1.0.
- **Deploy v1.0.0:** `dpl_4KUkziNmN2DgbJCxLX7R4JefdvVk` → READY (same
  project `prj_oKm4isKC8VkBBT8kbLkpC2oqFXMq`, same production URL,
  same Blob store, same env vars; REST token route, no catalog rebuild
  — Blob rows from the v2.1.0 rebuild keep serving). Cron still
  registered on the new deployment (`0 5 * * *` = 10:30 IST daily).
- **Live verification (production URL, all PASS):**
  - Manifest 200: name **"Binge Addon"**, id `com.bharatstreams`,
    **version 1.0.0**, **27 catalogs**, resources catalog + meta + stream.
  - Health 200: `{"ok":true,"addon":"binge-addon","version":"1.0.0"}`.
  - Trending Indian movie **20/20** (Ramayana: Rise of a Legend,
    Jailer 2, Ranabaali, Gajab Raat, Reporting Live); series **20/20**
    (Ali Baba Aur 40 Bhoot, Akka, Student of the Year: After Dark,
    The Court, Rudravanam PS).
  - Meta Jailer 2 (`/meta/movie/tt33318732.json`) 200, full meta:
    poster + background, description (150 chars), genres
    Action/Comedy/Drama, director Nelson, runtime 165 min, cast
    Rajinikanth / S. J. Suryah / Suraj Venjaramoodu / Ramya Krishnan /
    Vidya Balan, `releaseInfo` 2026 (no separate `year` key — same
    shape as v2.1.0, not a regression).
  - `/admin` 200.
- **Nuvio:** refresh should pick up the 1.0.0 number (manifest id
  unchanged, same URL) — no reinstall expected; on-device verdict
  pending (parent).
- Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app

## v1.0.1 RENAME SWEEP 18 Nov 2026 (Bharat Streams → Binge Addon)

- **What changed (code, rename-only, no logic):** every comment/header
  saying "Bharat Streams" → "Binge Addon"; log prefixes
  `[bharat-streams]` → `[binge-addon]` (`lib/sources.js` ×10,
  `lib/store.js` ×3, `lib/config.js` ×1); `bingeGroup` key
  `bharat-streams:…` → `binge-addon:…` (`lib/parse.js` — resets Nuvio's
  binge-grouping once, harmless); package name `bharat-streams` →
  `binge-addon` (`package.json`, `package-lock.json`); `app/README.md`
  + `pretest/SUMMARY.md` titles → Binge Addon; `scripts/build-catalogs.js`
  header → Binge Addon. Version 1.0.0 → **1.0.1** in `index.js` VERSION
  const, `lib/manifest.js` version, `package.json` version,
  `package-lock.json` (name + version), `lib/sources.js` User-Agent
  (`BingeAddon/1.0.1`).
- **Docs:** this file's heading → "Binge Addon — Deploy Notes" + rename
  note at top; `design_draft.md` title + header note only (40+ body
  mentions kept as history); `tests/T1-T10.md` title + header note only
  (dated test records intact); root `README.md` already said Binge Addon.
  `admin.html` had no user-visible "Bharat Streams" text — only the two
  href URLs, which stay exactly as they are.
- **NOT changed (per task):** manifest id `com.bharatstreams`; Vercel
  project name `bharat-streams`, its URL, Blob store name; `/health`
  `project`/`projectUrl`/`liveUrl` fields; local folder
  `~/workspace/bharat-streams`; TMDB network slug `starbharat` in the
  builder blocklist (real channel name, not the addon); `update-design-v20.py`
  local-path references (one-off script).
- **Deploy v1.0.1:** `dpl_9Kw9ogcVtSpRq7pKzQZ6NuT9RtUu` → READY, PROMOTED
  (REST token route, 15 files, ~13 s build; no env vars touched, no
  catalog rebuild — Blob rows persist). Cron still registered on the new
  deployment (`0 5 * * *` = 10:30 IST daily). Production URL unchanged:
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app
- **Live verification (production URL, all PASS):**
  - Manifest 200, 3,039 bytes: name **"Binge Addon"**, id
    `com.bharatstreams`, **version 1.0.1**, **27 catalogs**, resources
    catalog + meta + stream.
  - Health 200: `{"ok":true,"addon":"binge-addon","version":"1.0.1"}`.
  - Trending Indian movie **20/20** (Ramayana: Rise of a Legend first),
    series **20/20** (Ali Baba Aur 40 Bhoot first).
  - Meta Jailer 2 (`/meta/movie/tt33318732.json`) 200, full meta: genres
    Action/Comedy/Drama, director Nelson, year 2026, runtime 165 min,
    cast 10, poster + 150-char description.
  - `/admin` 200. Dangal streams 40, first `bingeGroup`
    `binge-addon:1080p:hindi` (new key live).
- **Still open (parent):** basant refreshes in Nuvio (no reinstall
  needed — manifest id unchanged, name + version update on refresh) →
  on-device verdict. First auto cron run 19 Nov 10:30 IST.

## v1.0.2 VERCEL PROJECT RENAME 18 Nov 2026 (bharat-streams → binge-addon)

- **Basant's order (18 Nov, explicit yes):** rename the Vercel project so
  the install URL itself says "binge". He knows the old link will stop
  working and he must reinstall once in Nuvio. One user-requested change
  → version 1.0.1 → **1.0.2** (bite-style versioning).
- **Name check FIRST:** `GET /v9/projects` (team
  `httpbasant2-9067s-projects`) → 11 projects, HTTP 200 — NO project
  named `binge-addon` existed. Free to take.
- **Rename:** `PATCH /v9/projects/prj_oKm4isKC8VkBBT8kbLkpC2oqFXMq`
  `{"name": "binge-addon"}` → HTTP 200, response `name: binge-addon`,
  same id, `ssoProtection: null` (still public, no re-disable needed).
  **New URL: https://binge-addon-httpbasant2-9067s-projects.vercel.app**
- **Code/docs updated (no logic changed):** version 1.0.2 in `index.js`
  VERSION const, `lib/manifest.js`, `package.json`, `package-lock.json`
  (both version fields); `/health` project fields in `index.js` →
  project `binge-addon`, projectUrl
  `https://vercel.com/httpbasant2-9067s-projects/binge-addon`, liveUrl
  new URL; `lib/admin.html` live + project links → new URL; root
  `README.md` install + deploy URLs → new URL (`app/README.md` had no
  old-URL references). This file: rename note at top + this section.
- **NOT changed (per task):** manifest id `com.bharatstreams`; Blob
  store `bharat-streams` (store_drqjSj6Uy2iBuItV, bom1 — stores are
  separate from the project name); local folder
  `~/workspace/bharat-streams`; GitHub repo (Phase 2's job, untouched
  here).
- **Deploy v1.0.2:** `dpl_BAXvmaXaXZxdPypYC5y6wqSpz8Fu` → READY (REST
  token route, 15 files, ~20 s build; no env vars touched, no catalog
  rebuild — Blob rows persist). Cron still registered on the new
  deployment (`0 5 * * *` = 10:30 IST daily).
- **Live verification (NEW production URL, all PASS):**
  - Manifest 200, 3,039 bytes: name **"Binge Addon"**, id
    `com.bharatstreams`, **version 1.0.2**, **27 catalogs**, resources
    catalog + meta + stream.
  - Health 200: `{"ok":true,"addon":"binge-addon","version":"1.0.2"}`.
    (Note: `/health` carries addon + version only; the new project
    name/URL live in the admin status API + the `/admin` page links,
    both verified — `/admin` page serves the new manifest + project
    links, zero old-URL references.)
  - Trending Indian movie **20/20** (Ramayana: Rise of a Legend first),
    series **20/20** (Ali Baba Aur 40 Bhoot first).
  - Meta Jailer 2 (`/meta/movie/tt33318732.json`) 200, full meta: genres
    Action/Comedy/Drama, director Nelson, year 2026, runtime 165 min,
    cast 10, poster + description.
  - `/admin` 200 (14,428 bytes).
  - Dangal streams 200, **40 streams** in 2.4 s, first
    `behaviorHints.bingeGroup` `binge-addon:1080p:hindi` (15 streams in
    that group); **zero** 2160p/4K/1440p/CAM.
  - All 27 catalog rows fetched live: **455 items total** — identical
    counts to v1.0.1 (trending 20/20, global 20/20, fresh-digital 20,
    latest-ott 7, latest-series 20, next-30-days 20/20, big-announcements
    12/20, newly-announced 20, returning-soon 11, theatres 13, south 20,
    dark-crime 20, underrated 2/0, scifi 20/20, thrillers 11/20, action
    19, miniseries 20, visual 20, anime 20, classics 20) — Blob binding
    survived the rename.
- **OLD URL status (honest, checked live):** the old URL
  https://bharat-streams-httpbasant2-9067s-projects.vercel.app/manifest.json
  still answers **HTTP 200 with the v1.0.1 manifest** (and `/health`
  200, v1.0.1) — Vercel kept the old subdomain serving the previous
  deployment at rename time. It was NOT dead as expected. Basant should
  still reinstall from the NEW link (the old one may die at any time and
  will never get new versions); the old link is a temporary fallback,
  not relied on.
- **Still open (parent):** basant REINSTALLS in Nuvio from the NEW
  manifest URL (old install will NOT auto-update to the new URL — new
  project name = new domain) → on-device verdict. First auto cron run
  19 Nov 10:30 IST (daily rebuild now runs on the renamed project).
- **New install URL (for Nuvio → Settings → Addons → Install from URL):**
  **https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json**

## v1.0.3 STREAM-TITLE + DESCRIPTION FORMAT FIX 18 Nov 2026

- **What changed (code, by a previous worker — this worker only deployed it):**
  `app/lib/parse.js` only (161+/14−) + new local verify script
  `tests/repro-format.js` (never inside `app/`, so it cannot ship).
  Version 1.0.3 in `app/index.js`, `app/lib/manifest.js`,
  `app/package.json`, `app/package-lock.json` (both version fields).
  Local: `node --check app/lib/parse.js` clean,
  `node tests/repro-format.js` ALL CHECKS PASS (exit 0) against real
  fetched titles.
- **The five fixes:**
  1. **CAM filter widened:** DVDScr/SCR/screener/PreDVD/HDTS/HDTC now
     dropped (was only cam/hdcam/ts/tc/telesync/telecine/camrip, word
     boundaries). Live before: 9 DVDScr + 3 PreDVD streams in
     production Ranabaali output.
  2. **Decimals preserved:** `cleanTitle` no longer turns every dot into
     a space — 'DD+5.1', '1.5GB', '3.19GB' intact (was 'DD+5 1', '1 5GB').
  3. **'INGB' gone:** flag emojis (regional-indicator pairs) replaced by
     language words — description line 2 now reads e.g.
     '🔊 DD+ AAC Hindi + English' (was '🔊 DD+ DD AAC 🇮🇳🇬🇧', rendering
     as 'INGB' on clients without flag-emoji support).
  4. **Site/spam prefixes stripped:** 'www 5MovieRulz company -',
     'www 1TamilMV io -', '[Bolly4u org]' etc. removed from display
     titles (was: 37/40 Ranabaali production names started with 'www').
  5. **Badge-tag false positives fixed:** boundary-aware matching +
     subsumption — 'DD' no longer matches inside 'DD+'/'DDP' (was
     'DD+ DD'), 'DV' no longer matches inside 'DVDScr', 'HDR' no longer
     matches inside 'HDRip'; DDP maps to DD+.
- **Untouched:** Hindi-first sort, 1080p cap, dedupe, stream sources,
  manifest id `com.bharatstreams`, 27 catalogs.
- **Deploy v1.0.3:** `dpl_6hhYLcVcuvFLEZoYWZ4q3gpn2LwR` → READY (REST token
  route; no env vars touched). Cron still registered on the new
  deployment (`0 5 * * *` = 10:30 IST daily).
- **Catalog note (found + fixed during this deploy):** the first live
  check fetched `/catalog/movie/trending-indian.json` (wrong id — the
  real catalog ids carry the type suffix, e.g.
  `trending-indian-movie`) and returned `{metas: []}`, which looked
  like empty Blob rows. A manual rebuild was run on that reading
  (`GET /api/cron/rebuild` → 200 in 29.3 s, 27 rows, 455 items —
  counts identical to the v1.0.2 baseline), then the correct ids
  confirmed 20/20. The rebuild was harmless (same builder, same rows);
  the empty read was a wrong-URL artefact, not a data loss.
- **Live verification (production URL, all PASS):**
  - Manifest 200, name "Binge Addon", id `com.bharatstreams`,
    version **1.0.3**, **27 catalogs**, resources catalog + meta + stream.
  - Health 200 (`binge-addon`, 1.0.3). `/admin` 200 (14,428 bytes).
  - All 27 rows fetched live: **455 items total** — trending-indian
    20/20 (movie: Ramayana first; series: Ali Baba Aur 40 Bhoot first),
    global-trending 20/20, fresh-digital 20, latest-ott 7,
    latest-series 20, next-30-days 20/20, big-announcements 12/20,
    newly-announced 20, returning-soon 11, theatres 13, south 20,
    dark-crime 20, underrated 2/0, scifi 20/20, thrillers 11/20,
    action 19, miniseries 20, visual 20, anime 20, classics 20 —
    identical counts to v1.0.2.
  - Meta Jailer 2 (`/meta/movie/tt33318732.json`) 200, full meta: genres
    Action/Comedy/Drama, director Nelson, releaseInfo 2026, runtime
    165 min, cast 10, poster + description.
  - **Ranabaali streams (`tt32324552`, confirmed from live trending
    catalog) — 40 streams, 200 in 1.50 s:** 0 DVDScr/SCR/PreDVD,
    0 www-prefixed names, 0 INGB/flag-emoji in descriptions, 0
    dot-damage, 0 'DD+ DD', 0 2160p/4K (resolutions only 1080p + 720p).
    21 names carry intact decimals. First stream:
    'Ranabaali (2026) 1080p Telugu HQ HDRip - HEVC - x265 -
    (DD+5.1 - 192Kbps & AAC) - 1.5GB - ESub' /
    '1080p | HEVC x265 💾 1.5GB\n🔊 DD+ AAC Hindi + English'.
    Badge tokens present: 1080p, HDR, HEVC, WEB-DL, DD+, AAC
    (BluRay absent — Ranabaali is a 2026 WEB/HDRip title, expected).
  - **Dangal streams (`tt5074352`) — 40 streams, 200 in 1.32 s:** same
    0s across all checks; first stream 'Dangal (2016) 1080p h264' /
    '1080p 💾 32.18GB\n🔊 Hindi + English'. Badge tokens incl. BluRay.
  - **Known pre-existing caveat (NOT fixed here):** one HdHub/Dangal
    stream can show fallback name 'Binge Addon' (empty display title,
    no parseable filename) — not seen in this run's 40+40 streams, but
    it is intermittent by source data.
- **Still open (parent):** basant refreshes in Nuvio (no reinstall
  needed — manifest version bumped, catalogs refresh per Nuvio cache)
  → on-device verdict that stream titles/descriptions read clean.
  First auto cron run 19 Nov 10:30 IST.
- **Install URL (unchanged):**
  **https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json**

## v1.0.4 BADGE PACK 18 Nov 2026 (basant: Nuvio stream badges, served by the addon)

- **What it is:** Binge's OWN badge pack — 7 groups, 38 text-only badges
  (`imageURL` blank on every badge, so no artwork is hotlinked or copied
  from Xperience/FR-Badges), served by the addon itself at
  `GET /badges.json`. Schema reverse-engineered from the live Xperience
  pack + cross-checked against FR-Badges (no official spec exists):
  top-level object has EXACTLY two keys `{groups, filters}`; group
  `{id, name, color, borderColor, isExpanded}`; filter
  `{type: "filter", id, name, pattern, tagColor, borderColor, textColor,
  tagStyle: "filled and bordered", imageURL, isEnabled, groupId}`.
  Matching is regex against the stream's title + description text;
  badges are evaluated in array order, first match per group wins.
- **Groups (7 — no Streaming group):** Quality, Resolution, Visual,
  Audio, Encoder, Channels, Language.
  **Badges:** Quality — REMUX, BluRay; Resolution — 1080p, 720p, 480p
  (NO 4K — the addon caps at 1080p, so a 4K badge must never appear);
  Visual — HDR10+, HDR10, Dolby Vision, HDR, WEB-DL, WEBRip; Audio —
  Dolby Atmos, TrueHD, DTS-HD MA, DTS, DD+, DD, AAC, FLAC, Opus;
  Encoder — HEVC, x265, AVC, x264, 10-Bit; Channels — 7.1, 5.1, 2.0;
  Language — Hindi, English, Tamil, Telugu, Malayalam, Kannada,
  Bengali, Marathi, Gujarati, Punjabi. One palette for all badges:
  dark fill `#1A1A1A`, border `#FF858283`, white text `#FFFFFF`.
- **Boundary traps (all fixed by pattern, not by luck):** HDR must not
  fire on `HDRip` (`\bhdr\b` — no boundary inside HDRip); DV must not
  fire on `DVDScr`/`DVDRip` (`\bdv\b`); DD must not fire inside `DD+`/
  `DDP` (`\bdd(?!\+)\b`, DDP maps to DD+); HDR10+ suppresses HDR10/HDR
  (order + `(?![a-z0-9+])`); DTS-HD MA suppresses DTS (`\bdts\b(?!-)`);
  REMUX before BluRay (array order — only one Quality badge shows);
  language rules fire on description words (`Hindi + English`) AND
  title tokens (`[Tam + Hin + Mal + Kan]`, `Telugu`, `Tamil`…).
- **Code changes:** new `app/lib/badges.json` (9,680 bytes); `GET
  /badges.json` route in `app/index.js` right after `/manifest.json`
  (same `sendFile` pattern as `/admin`, static JSON — far under the
  10 s `api/index.js` limit); one-line `badges.json` link in the
  Connection-status paragraph of `app/lib/admin.html`. No `vercel.json`
  change (the `/(.*)` → `/api` rewrite already routes it). Version
  1.0.3 → **1.0.4** in `app/index.js`, `app/lib/manifest.js`,
  `app/package.json`, `app/package-lock.json` (both version fields).
  New test `tests/test-badges.js` (kept under `tests/`, never ships in
  `app/`): schema validation + synthetic trap checks + real live titles.
- **Local test BEFORE deploy (all PASS, exit 0):**
  `node tests/test-badges.js` — **227 checks PASS, 0 FAIL** against
  119 real live titles (Ranabaali 39 + Dangal 40 + The Odyssey 40,
  tt33764258 from the live Global Trending catalog): no title gets a
  4K badge; no HDR from `HDRip` alone (21 HDRip titles checked);
  no DV from `DVDScr`; no DD on any `DD+`/`DDP` title; at least one
  title each gets 1080p, HEVC, BluRay, WEB-DL, DD+, Hindi, English.
  Badges seen across the 119 titles: 1080p, 720p, 480p, 5.1, 7.1,
  REMUX, BluRay, WEB-DL, WEBRip, HEVC, x264, x265, AVC, 10-Bit, DD,
  DD+, DTS-HD MA, Dolby Atmos, TrueHD, AAC, Hindi, English, HDR.
  Local smoke: `GET /badges.json` 200, 7 groups, 38 filters;
  `/health` 1.0.4; `/manifest.json` + `/admin` 200.
- **Deploy v1.0.4:** `dpl_CR21NkjzyAS7oea1WYg9iCx17Yuo` → READY (REST
  token route, 16 files incl. `lib/badges.json`, ~25 s; no env vars
  touched, no catalog rebuild — Blob rows persist). Cron still
  registered on the new deployment (`0 5 * * *` = 10:30 IST daily).
  Deploy helper committed as `deploy-binge.py` (repo root) for reuse.
- **Live verification (production URL, all PASS):**
  - Manifest 200: name **"Binge Addon"**, id `com.bharatstreams`,
    **version 1.0.4**, **27 catalogs**, resources catalog + meta +
    stream. Health 200 (`binge-addon`, 1.0.4).
  - `GET /badges.json` 200, `Content-Type: application/json`,
    keys exactly `{groups, filters}`, 7 groups, 38 filters, all
    text-only, **zero URLs inside the file** (no external artwork).
  - `/admin` 200, page links `badges.json` next to `manifest.json`.
  - Trending Indian movie **20/20** (Ramayana: Rise of a Legend,
    Jailer 2, Ranabaali), series **20/20** (Ali Baba Aur 40 Bhoot,
    Akka, Student of the Year: After Dark). All 27 rows fetched:
    **455 items total** — identical counts to the v1.0.3 baseline.
  - Meta Jailer 2 (`/meta/movie/tt33318732.json`) 200, full meta:
    genres Action/Comedy/Drama, director Nelson, releaseInfo 2026,
    runtime 165 min, cast 10, poster + description.
  - **Rule test re-run against the LIVE `/badges.json`** (`BADGES_URL=…
    node tests/test-badges.js`): **243 checks PASS, 0 FAIL** on live
    titles — same traps verified on the served file, not just the
    local copy. Sample per-title badges (live):
    Ranabaali 1080p HDRip HEVC x265 DD+5.1 → `{1080p, DD+, HEVC,
    5.1, Hindi}` (no HDR — HDRip correctly suppressed); Ranabaali
    TRUE WEB-DL AVC DD+5.1 → `{1080p, WEB-DL, DD+, AVC, 5.1,
    Hindi}`; The Odyssey BluRay REMUX AVC DTS-HD MA → `{REMUX,
    1080p, DTS-HD MA, AVC, 5.1, Hindi}`; The Odyssey BRRip x265
    DDP 5.1 → `{1080p, DD+, x265, 5.1, Hindi}`.
- **Badge pack link (for Nuvio → Profile → Layout → Streams →
  Fusion badge URL):**
  **https://binge-addon-httpbasant2-9067s-projects.vercel.app/badges.json**
  Nuvio snapshots the pack on import — later pack edits need a
  re-paste by the user. Up to 3 Fusion badge URLs per profile.
- **Still open (parent):** basant pastes the badge link in Nuvio
  himself → on-device verdict whether the badges show on stream
  lists (the addon serving the pack is verified; applying it in
  Nuvio is his one paste, NOT verified here). First auto cron run
  19 Nov 10:30 IST.

## v1.0.5 BADGE IMAGES 18 Nov 2026 (basant: Nuvio showed "0 Fusion-style badges")

- **The bug (verified):** Nuvio showed **"0 Fusion-style badges"** for our
  `/badges.json` because every badge had `imageURL: ""` (text-only).
  Schema diff vs the Xperience reference pack and FR-Badges is done:
  `imageURL` is the ONLY gap — same top-level keys, same group/filter
  fields, same `tagStyle`/`type` values. Patterns, groups and the badge
  list are untouched in this release.
- **What changed (one user-requested change → 1.0.5; dashboard redesign
  is v1.0.6, not this):**
  - **38 real PNGs**, rendered in-app into `app/lib/badge-images/<id>.png`
    (5.0–21.1 KB each, 432,269 bytes total; dark `#1A1A1A` fill, salmon
    `#FF858283` border, white text — same palette as the badges).
  - **New route `GET /badges/:id.png`** in `app/index.js`, next to
    `/badges.json`: serves the PNG with `Content-Type: image/png` and
    `Cache-Control: public, max-age=86400`. SECURITY: allowlist built at
    startup from the ids in `app/lib/badges.json` — only those 38 ids are
    ever served; anything else is a 404. The id is validated against the
    allowlist BEFORE any path is built, and the served path is fixed
    (`lib/badge-images/<id>.png`) — raw user input is never joined into a
    filesystem path, so no traversal is possible.
  - **`app/lib/badges.json`:** every filter's `imageURL` is now
    `https://binge-addon-httpbasant2-9067s-projects.vercel.app/badges/<id>.png`.
    Verified by diff: patterns, groups, names and colors are byte-identical
    except `imageURL` (38 replacements).
  - Version 1.0.4 → **1.0.5** in `app/index.js`, `app/lib/manifest.js`,
    `app/package.json`, `app/package-lock.json` (both version fields).
    No dashboard/admin file touched.
  - Test updated to v1.0.5 semantics: `tests/test-badges.js` now asserts
    each `imageURL` equals the addon-hosted PNG URL (v1.0.4 asserted
    `imageURL === ''` — that check failed 38× by design after the fix,
    patterns untouched). All pattern/trap checks unchanged.
- **Local test BEFORE deploy (all PASS):** `GET /badges.json` 200, 38
  filters, all 38 `imageURL`s non-empty and addon-hosted; ALL 38
  `GET /badges/<id>.png` 200, `image/png`, 5,000–21,097 B, valid PNG
  magic, `Cache-Control: public, max-age=86400`; `/badges/nonexistent.png`
  404, `/badges/../badges.json` 404, `/badges/%2e%2e%2fbadges.json` 404,
  `/badges/.png` 404 (no file leak); `/manifest.json` 1.0.5, 27 catalogs;
  `/health` 1.0.5. Rule test `node tests/test-badges.js`: ALL CHECKS PASS.
- **Deploy v1.0.5:** `dpl_2Zy8uJ1dJJwrPkxmPuWbMFapH9RH` → READY (REST
  token route, ~24 s; 54 files incl. all 38 PNGs; no env vars touched,
  no catalog rebuild — Blob rows persist).
- **Live verification (production URL, all PASS):**
  - Manifest 200: name **"Binge Addon"**, id `com.bharatstreams`,
    **version 1.0.5**, **27 catalogs**. Health 200 (`binge-addon`, 1.0.5).
  - `GET /badges.json` 200, `application/json`, 7 groups, 38 filters,
    all 38 `imageURL`s non-empty and addon-hosted.
  - **ALL 38 image URLs fetched live: 200, `image/png`, sane sizes**
    (5,000–21,097 B, 432,269 B total, 0 failures).
  - Rule test re-run against the LIVE `/badges.json`
    (`BADGES_URL=… node tests/test-badges.js`): **243 checks PASS, 0 FAIL**
    on live titles.
  - Trending Indian movie **20/20** (Ramayana: Rise of a Legend,
    Jailer 2, Ranabaali), series **20/20** (Ali Baba Aur 40 Bhoot,
    Akka, Student of the Year: After Dark).
  - Meta Jailer 2 (`/meta/movie/tt33318732.json`) 200, full meta:
    genres Action/Comedy/Drama, director Nelson, releaseInfo 2026,
    runtime 165 min, cast 10, poster + description.
  - `/admin` 200, page links `badges.json` next to `manifest.json`.
- **Still open (parent):** the ONE thing unverifiable headlessly is
  Nuvio's own preview count — basant re-pastes the badge link in Nuvio
  himself (same URL, pack re-imported) and confirms on-device whether it
  now shows 38 Fusion-style badges. That on-device preview is the final
  verdict; nothing here claims it will show 38 until he confirms it.

## v1.0.6 MINIMAL BADGE REDESIGN 18 Nov 2026 (basant's verdict: 7–9 jargon pills per stream)

- **The problem (his Jailer 2 screenshot):** each stream showed 7–9 pills of
  jargon (1080p, WEB-DL, DD+, AAC, AVC, 5.1, Hindi, English, Tamil…) — a
  wall of things beyond his understanding. The v1.0.5 pack WORKED in Nuvio;
  the problem was purely look + jargon. Dashboard files untouched (that is
  v1.0.7, separate).
- **What changed (one user-requested change → 1.0.6):**
  - **DROPPED 15 badges** (from `app/lib/badges.json` + PNGs deleted):
    whole Encoder group (hevc, x265, avc, x264, bit10), whole Channels
    group (ch-7-1, ch-5-1, ch-2-0), audio cuts (truehd, dts-hd-ma, dts,
    dd, aac, flac, opus).
  - **KEPT 23 badges, patterns UNCHANGED:** remux, bluray, res-1080p,
    res-720p, res-480p, hdr10plus, hdr10, dolby-vision, hdr, web-dl,
    webrip, atmos, dd-plus, lang-hindi/english/tamil/telugu/malayalam/
    kannada/bengali/marathi/gujarati/punjabi. Groups 7 → 5 (encoder +
    channels deleted). web-dl/webrip moved into the Quality group.
    A stream now shows at most 4 pills (quality + resolution + audio +
    language) instead of 7–9.
  - **ICONS:** every kept badge re-rendered as icon + short-text PNG
    (same 1200×320 canvas, same dark `#1A1A1A` fill, `#858283` border,
    white DejaVu Sans Bold). Simple drawn glyphs: speaker (atmos,
    dd-plus), sun/rays (hdr10plus, hdr10, dolby-vision, hdr), disc
    (bluray), globe (web-dl + all 10 languages — the language WORD is the
    label), film frame + play triangle (webrip); plain bold text for
    REMUX + resolutions. Render script committed as
    `scripts/render-badges-v106.py` (no render script existed in the repo
    for v1.0.5). First render had the speaker sound-arcs overlapping the
    text ("Dolby Atmos" read ")Dolby Atmos") — fixed by centring the arcs
    on the cone tip inside the icon zone, re-rendered, visually checked.
    Contact sheet: `tests/badge-contact-sheet-106.png` — all 23 checked
    by eye: no clipping, all glyphs legible. No icon fell back to text.
  - **Route unchanged:** `GET /badges/:id.png` allowlist is built from
    `badges.json` at startup, so deleted ids now 404 automatically.
  - Version 1.0.5 → **1.0.6** in `app/index.js`, `app/lib/manifest.js`,
    `app/package.json`, `app/package-lock.json`. No dashboard/admin file
    touched. Test updated to v1.0.6 semantics (`tests/test-badges.js`:
    5 groups, 23 badges, dropped-id assertions, DD+/Atmos audio winner).
- **Local test BEFORE deploy (all PASS):** `GET /badges.json` 200, 5
  groups, 23 filters, all `imageURL`s addon-hosted; all 23 PNGs valid,
  1200×320, 7,290–19,349 B; `/badges/hevc.png`, `/badges/ch-5-1.png`,
  `/badges/aac.png`, `/badges/nonexistent.png` 404;
  `/badges/../badges.json`, `/badges/%2e%2e%2fbadges.json`,
  `/badges/.png` 404 (no traversal); `/manifest.json` 1.0.6, 27 catalogs;
  `/health` 1.0.6; `/admin` 200. Rule test `node tests/test-badges.js`:
  ALL CHECKS PASS on live titles (max 4 badges/stream seen).
- **Deploy v1.0.6:** `dpl_AjMcsHmHPfjmdwiP1Txtv9jQRs51` → READY (REST token
  route, ~24 s; no env vars touched, no catalog rebuild — Blob rows
  persist). Production URL unchanged.
- **Live verification (production URL, all PASS):**
  - Manifest 200: name **"Binge Addon"**, id `com.bharatstreams`,
    **version 1.0.6**, **27 catalogs**. Health 200 (`binge-addon`, 1.0.6).
  - `GET /badges.json` 200, `application/json`, **5 groups, 23 filters**,
    all 23 `imageURL`s non-empty and addon-hosted.
  - **ALL 23 image URLs fetched live: 200, `image/png`, 7,290–19,349 B,
    344,042 B total, 0 failures.**
  - Deleted ids 404 live: hevc, ch-5-1, ch-7-1, x265, truehd, dts, aac,
    opus, nonexistent. `/badges/%2e%2e%2fbadges.json` 404,
    `/badges/.png` 404, `/badges/../lib/badges.json` 404,
    `/badges/../../package.json` 400. NOTE: `/badges/../badges.json`
    returns 200 — Vercel normalises the path to `/badges.json` BEFORE the
    function runs, and that file is already public; no non-public file
    leaks (local Express returned 404 for the same probe in v1.0.5 — the
    difference is Vercel edge normalisation, not a code change).
  - Rule test re-run against the LIVE `/badges.json`
    (`BADGES_URL=… node tests/test-badges.js`): **ALL CHECKS PASS** on
    live titles; badges seen: 1080p, 720p, BluRay, DD+, Dolby Atmos,
    English, Hindi, REMUX, WEB-DL, WEBRip (max 4 per stream).
  - Trending Indian movie **20/20** (Ramayana: Rise of a Legend first),
    series **20/20** (Ali Baba Aur 40 Bhoot first).
  - Meta Jailer 2 (`/meta/movie/tt33318732.json`) 200, full meta:
    genres Action/Comedy/Drama, director Nelson, releaseInfo 2026,
    runtime 165 min, cast 10, poster + description.
  - `/admin` 200.
- **Still open (parent):** the ONE thing unverifiable headlessly is how
  the new minimal badges LOOK in Nuvio on-device — basant removes +
  re-pastes the badges.json URL in Nuvio himself (Fusion ON) and sends a
  stream-list screenshot. That on-device look is the final verdict;
  nothing here claims the look until he confirms it.

## v1.0.7 ONYX BADGE RESTYLE 18 Nov 2026 (basant: restyle the badge pack with the best of nuviobadges.com)
- **Research (nuviobadges.com, verified live 18 Nov 2026 — ideas/style only, NO copied assets, NO hotlinking, licensing not verified for any pack):**
  - **Xperience Onyx (41 badges, best dark premium reference):** opaque near-black fill `#15171C`, white text, hairline border white-14% (`#24FFFFFF`), `tagStyle "filled"`, white-glyph images, bold condensed all-caps text — looks like a native dark-UI chip. Prism sibling proves theme = image-folder swap + tagColor/tagStyle change.
  - **Savant Stealth (49):** frosted fill white-10% alpha (`#1AFFFFFF`), quiet ghost-like premium.
  - **Elite Badges:** resolution hierarchy by tint (strongest for top tier, dimmed for lower).
  - **Kit Obsidian (261, best language coverage):** language patterns = English name + native script + 3-letter code (`hindi|हिन्दी|हिंदी|hin`); flag chips for languages.
  - **FR Minimal (219, best regex craft):** Hindi audio pattern is Unicode-aware with lookaheads excluding subtitle contexts. Same dataset powers ~10 themes by image-folder swap only.
  - **Minimalistic / nobnobz (43):** softest treatment, black-13% fill + white-18% border. Anti-pattern avoided: tiered REMUX 1/2/3 variants.
  - Schema (all packs): top-level `{groups, filters}`; group `{id, name, color, borderColor, isExpanded}`; filter `{id, groupId, name, pattern, imageURL, tagColor, borderColor, textColor, tagStyle, isEnabled, type: "filter"}`; colors are 8-digit ARGB (`#AARRGGBB`).
- **Applied to our pack (look only — same 23 badges, same groups, same imageURLs, same route):**
  - **Onyx fill formula:** fill `#1A1A1A` → `#15171C`; heavy grey `#858283` border → thin white-14% hairline (PIL outline `(255,255,255,36)`, width 5, same rounded-rect radius); white bold text kept. `badges.json`: every filter + group now `tagColor/color #FF15171C`, `borderColor #24FFFFFF`, `textColor #FFFFFF`, `tagStyle "filled"` (was `"filled and bordered"`).
  - **Resolution hierarchy by tint (Elite-style, PNG fill variants only):** 1080p solid `#15171C`; 720p frosted white-10% fill (`(255,255,255,26)` over transparency); 480p faintest white-3% fill (`(255,255,255,8)`, outline-only look). `badges.json` tagColor stays `#FF15171C` for all three — the hierarchy lives in the images.
  - **Icons refined, same 5 types** (speaker, sun, disc, globe, film): bolder strokes (14→16/18), icon zone narrowed 56..300 → 48..288, text starts x=340 (was 330) — speaker arcs capped at r=56, gutter pixel-scan proves zero white pixels in 288..340 on atmos/dd-plus. Language labels stay English words — NO Devanagari glyphs in images (DejaVu Sans has no Devanagari coverage).
  - **ONE pattern change (only allowed change):** 9 non-English language patterns gained native-script alternations (Obsidian recipe), bare alternations with NO `\b` around non-Latin scripts (`\b` is ASCII-only): Hindi `(?i)\bhindi\b|\bhin\b|हिन्दी|हिंदी`, Tamil `|தமிழ்`, Telugu `|తెలుగు`, Malayalam `|മലയാളം`, Kannada `|ಕನ್ನಡ`, Bengali `|বাংলা`, Marathi `|मराठी`, Gujarati `|ગુજરાતી`, Punjabi `|ਪੰਜਾਬੀ`. English unchanged (its native script IS Latin). Every other pattern byte-identical to v1.0.6 — verified by diff against the v1.0.6 backup.
  - **NOT built (future options, not this version):** no new badges — no Cached/debrid badge, no combo pills, no subtitle badges.
  - **Render script:** `scripts/render-badges-v107.py` is a copy of v106 (v106 kept intact). Contact sheet `tests/badge-contact-sheet-107.png` is on a DARK background now (frosted fills + white text only read on dark) and pastes with the alpha mask — the first render's mask-less paste flattened the translucent 720p/480p fills to opaque white boxes; caught on the visual check, fixed, re-rendered. All 23 visually checked: no clipping, all glyphs legible, hierarchy visible (1080p clearly strongest, 480p clearly dimmest). Fill pixels verified: 1080p `(21,23,28,255)`, 720p `(255,255,255,26)`, 480p `(255,255,255,8)`.
  - Test updated to v1.0.7 semantics (`tests/test-badges.js`): asserts Onyx colors + `tagStyle "filled"`, plus 11 new native-script checks (both Hindi spellings, all 9 scripts) and a Hindi-does-NOT-fire-on-English guard.
  - Version 1.0.6 → **1.0.7** in `app/index.js`, `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json`. NOTE: a blind `sed` on the lockfile first bumped two dependency versions too (content-type, escape-string-regexp 1.0.6→1.0.7 against resolved 1.0.5 tarballs) — caught in the diff review, reverted; final lockfile diff is exactly the 2 top-level version lines. No dashboard/admin file touched (dashboard is v1.0.8, separate).
- **Local test BEFORE deploy (all PASS):** `GET /badges.json` 200 (local server :7001), 5 groups, 23 filters, 0 empty imageURLs; all 23 PNGs 200 `image/png`, 7,331–19,490 B, valid PNG magic; `/badges/hevc.png` 404; `/manifest.json` 1.0.7, 27 catalogs; `/health` 1.0.7; `/admin` 200. Rule test `node tests/test-badges.js`: **ALL CHECKS PASS** (188 PASS, 0 FAIL, 119 real titles).
- **Deploy v1.0.7:** `dpl_AXiqTwS9VoMo1z6BLmpi1Dmn2siX` → READY (REST token route, ~25 s; no env vars touched, no catalog rebuild — Blob rows persist). Production URL unchanged.
- **Live verification (production URL, all PASS):**
  - `GET /badges.json` 200, `application/json`, **5 groups, 23 filters**, 0 empty imageURLs; tagColor `#FF15171C`, borderColor `#24FFFFFF`, tagStyle `filled`, textColor `#FFFFFF` on all 23; Hindi pattern live shows `हिन्दी|हिंदी`.
  - **ALL 23 image URLs fetched live: 200, `image/png`, 7,331–19,490 B, 338,185 B total, 0 failures.** Live PNG pixels re-checked after deploy: 1080p `(21,23,28,255)`, 720p `(255,255,255,26)`, 480p `(255,255,255,8)` — the NEW images are serving, not cached old ones.
  - Rule test re-run against the LIVE `/badges.json` (`BADGES_URL=… node tests/test-badges.js`): **ALL CHECKS PASS — 199 PASS, 0 FAIL, 120 real titles**; badges seen: 1080p, 720p, BluRay, DD+, Dolby Atmos, English, Hindi, REMUX, WEB-DL, WEBRip. Zero regressions from the language-pattern change — no revert needed.
  - Manifest 200: name **"Binge Addon"**, id `com.bharatstreams`, **version 1.0.7**, **27 catalogs**. Health 200 (`binge-addon`, 1.0.7).
  - Trending Indian movie **20/20** (Ramayana: Rise of a Legend first), series **20/20** (Ali Baba Aur 40 Bhoot first).
  - Meta Jailer 2 (`/meta/movie/tt33318732.json`) 200, full meta: genres Action/Comedy/Drama, director Nelson, releaseInfo 2026, runtime 165 min, cast 10, poster + description.
  - `/admin` 200.
- **Still open (parent):** the ONE thing unverifiable headlessly is how the restyled badges LOOK in Nuvio on-device — basant removes + re-pastes the badges.json URL in Nuvio himself (Fusion ON) and sends a stream-list screenshot. That on-device look is the final verdict; nothing here claims the look until he confirms it.

## v1.0.8 ADMIN DASHBOARD REDESIGN 18 Nov 2026 (basant: approved Elephant v2 design)
- **Goal:** Rebuild the Binge Addon admin dashboard (`/admin`) into a high-craft, dark-themed control panel modeled after modern open-source Stremio configuration interfaces (specifically the AIOMetadata configuration experience), fixing the status 504 Gateway Timeout defect and securing the unauthenticated cron hole.
- **What changed (code complete, target version v1.0.8 everywhere):**
  - **`app/lib/admin.html` (Full rewrite per Elephant v2 design):**
    - **Visual Theme:** Strict dark mode palette (`#0b0f17` canvas, `#0e1420` sidebar, `#141c2b` cards, `#1e293b` borders, `#2563eb` electric blue accent, emerald green `#10b981` status, crimson `#ef4444` destructive triggers). Zero AI slop, zero generic purple gradients, zero stock photos, zero fake metrics. System font stack only.
    - **Sidebar Navigation:** Fixed 240px vertical sidebar with 5 dedicated view panels: Overview, Catalogs, Rows, Streams, Rebuild. Collapses into sticky top nav on mobile/tablets (< 900px).
    - **Overview Panel:** Diagnostic cards for Addon Core (v1.0.8, com.bharatstreams), TMDB API status, Vercel Blob store status, catalog row counts, and update schedule (IST formatted). Resource Hub with direct links to `manifest.json`, `badges.json`, `Live URL`, `Vercel Project`, and `Live Health`.
    - **Catalogs Panel:** All 27 rows configurable with pill toggles (Show in Nuvio), inline row rename inputs, media type pills (Movie/Series), cached item counts, sample titles, and position reorder buttons (`↑`/`↓`). Instant client-side search/filter bar.
    - **Rows Panel:** Full tuning parity for date windows and rating floors across all rows (`windowDays`, `voteFloor`, `voteCountFloor`). Preserves `voteCountCeil` rendered with user-friendly label **"Maximum votes"** on `#13 Underrated Indian Gems`.
    - **Streams Panel:** Toggle switches for stream scraper sources (Torrentio, Comet, HdHub) and video quality dropdown (1080p Full HD vs 720p HD Data Saver).
    - **Rebuild Panel:** Manual build console triggering `POST /api/admin/rebuild` with elapsed timer display (`00:23 / ~00:45`), keep-tab-open notification, and live status refresh without full page reload.
    - **State & Failure Handling (§7.4):** In-memory dirty state tracking (`savedConfig` vs `draftConfig`) across view navigation; sticky Save button with dirty indicator; `onbeforeunload` unsaved changes warning; non-destructive 401 session recovery modal overlay preserving draft edits; error toasts with retry capability; targeted DOM updates preserving text input focus and scroll positions.
  - **`app/api/admin/rebuild.js` (NEW):**
    - Dedicated authenticated manual rebuild endpoint configured with `maxDuration: 300` in `vercel.json`.
    - Authenticated via `X-Admin-Password` header matching `ADMIN_PASSWORD`.
    - Cleanly handles `{ skipped: true }` responses when prerequisites are missing, returning human-readable messages.
  - **`app/index.js`:**
    - Status endpoint (`GET /admin/api/status`) completely reworked: queries `catalogs/_summary.json` directly as primary path (bypassing 5-minute memory cache); falls back to single `catalogs/` prefix list with internal file exclusion (`!b.pathname.includes('/_')`) and concurrent `Promise.allSettled` Blob fetches; merges disabled rows with count 0 and preserves order.
    - Cron route (`/api/cron/rebuild`) enforces `Authorization: Bearer <CRON_SECRET>` strictly; removed unverified headers.
    - Local Express mounts `app.all('/api/admin/rebuild', require('./api/admin/rebuild'))` for local dev parity.
    - Version bumped to `1.0.8`.
  - **`app/scripts/build-catalogs.js`:**
    - Generates and writes summary manifest `catalogs/_summary.json` to Vercel Blob at end of `main()` on full success only. Includes counts, top 3 display title names (`m.name`), and timestamp.
  - **`app/vercel.json`:**
    - Configured `api/admin/rebuild.js` with `maxDuration: 300`.
  - **Version bumps:**
    - `app/index.js` (VERSION = '1.0.8')
    - `app/lib/manifest.js` (version: '1.0.8')
    - `app/package.json` ("version": "1.0.8")
    - `app/package-lock.json` (top-level package version fields only)
- **Local verification BEFORE finish (all PASS):**
  - Node syntax checks on all edited JS files (`app/index.js`, `app/lib/manifest.js`, `app/scripts/build-catalogs.js`, `app/api/admin/rebuild.js`): clean exit 0.
  - Server local smoke test:
    - `GET /admin` -> 200 OK, full dark theme HTML delivered with all 5 view panels.
    - `GET /admin/api/config` -> 401 without password, 200 with valid password.
    - `POST /admin/api/config` -> 401 without password, 200 with valid password (round-trip verified).
    - `GET /admin/api/status` -> 401 without password, 200 with valid password (fast response, all 27 catalogs returned with disabled rows mapped to count 0).
    - `POST /api/admin/rebuild` -> 401 without password, rejects unauthorized triggers.
    - `GET /api/cron/rebuild` -> 401 without `Bearer CRON_SECRET`, rejects unauthorized triggers.


## v1.0.9 CRON AUTH + STATUS LATENCY 18 Nov 2026
- **Goal:** Close the unauthenticated cron hole properly (strict Bearer CRON_SECRET on both cron routes) and cut warm `/admin/api/status` latency under the 1500ms target.
- **What changed:**
  - **`app/api/cron/rebuild.js`:** strict `Authorization: Bearer <CRON_SECRET>` guard — any call without the matching header gets 401 and the rebuild never runs. (Vercel Cron sends the header automatically when the CRON_SECRET env var is set.)
  - **`app/index.js`:** `_summary.json` in-memory cache, 60s TTL, in the `GET /admin/api/status` Primary branch (module-level `summaryCache = { at, data }`; checked before the Blob `list()` call, stored on successful fetch; fallback branch untouched). Profiled warm status was ~1448ms, of which ~0.87s was the uncached summary read; expected warm ~600ms. Cold stays ~2s (Hobby freeze — accepted, not gold-plated).
  - **`app/lib/admin.html`:** hardcoded `v1.0.8` strings → `v1.0.9` (login badge, version tag, status pill).
  - **Version bumps:** `app/index.js` (VERSION = '1.0.9'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only).
  - **CRON_SECRET rotated** at deploy time (fresh value, production + encrypted; value never written anywhere). Deployment captures it at build time, so rotation happened before deploy.
- **Live verification (production, 18 Nov 2026 — see release notes for ms values):** manifest 1.0.9 / 27 catalogs; /health 1.0.9; /admin 200; status with password 200 (two calls, warm under 1500ms); status without password 401; cron GET without auth 401, with Bearer CRON_SECRET 200 (full rebuild ~28s); admin rebuild POST 401 without password; Trending Indian 20/20 + 20/20; Jailer 2 meta full; /badges.json 200 (23 filters, 0 empty imageURLs).
- **Deployment:** `dpl_36c9QkGrKHrc1zAotPi7FpV5xWaS` (READY). **Status ms measured live:** call 1 (fresh deploy) 1507ms, call 2 2966ms (cold Hobby instance, cache empty there — NOT under target); 4 rapid follow-up probes on warm instance: 685ms, 541ms, 654ms, 787ms — all under 1500ms. Honest summary: warm same-instance status is ~0.5–0.8s; a fresh cold instance can still be ~2–3s. Commit `453de76`, tag + release `v1.0.9`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.0.9
- **Still to prove:** next scheduled Vercel cron fire (19 Nov 10:30 IST) is the final proof the rotated secret works with Vercel's automatic Bearer.

## v1.1.0 ADMIN PANEL UN-SLOP 18 Nov 2026 (basant: "Antigravity ne AI slop banaya hai")
- **Goal:** Run the GitHub unslop skills over the Antigravity-built admin dashboard (v1.0.8) and fix what they found. Three rounds, two fresh-reviewer councils, no redesign, no new features, no code outside `app/lib/admin.html` + version bumps.
- **Skills run (all fetched live, read in full):** heydamir/unslop — 30 findings F1–F30; Emil Kowalski skills (8 of 18) — motion authority, Block verdict on the original (no reduced-motion, no press feedback, teleporting modal/toasts); frontend-craft — 14 tells fired; Ferousco-dev/anti-slop-design — FAIL on the original (glows, card-ification); joaovjo/vaultless unslop-ui (+ devibe_scan.py) — scanner 16/STRONG on the original, 0/Clean after. Finch: NO separate skill exists — it was a design reference for Bite's dashboard, rejected by basant and fully reverted as 2.16.13; not used here. Thesis adopted: "A quiet ledger: near-neutral black surfaces, one blue reserved only for action, mono numerals, Hinglish microcopy as the only voice."
- **Round 1 (fix list `unslop-fix-list.md`, untracked):** new token ramp (`#0a0d12`/`#0d1117`/`#12161d`, one blue `#2f6fed`, tertiary `#8fa0b3` 6.38:1); both glows + login/modal shadows deleted; status pills → dot + text; counts/type → quiet mono text; Lucide inline SVG icons (16px, stroke 1.5, exact paths from the Lucide repo) for nav/move/toast/spinner; rebuild hero ⚡ deleted; sentence case everywhere; type scale 11/12/14/16/20px, headings 600, `tabular-nums`; radius 12/8/6 (9999px toggle-track only); 4px spacing grid; ruled lists not cards (diag/knob/generic cards de-carded, interactive surfaces keep containment); Overview hero line `X of 27 visible · N items` + last-rebuilt absolute + relative age; non-blocking load (`Promise.allSettled`, shell renders from config first); copy fixes (exact strings, Hinglish verbatim elsewhere); motion (press scale 0.97, toast 400ms Sonner timing, modal fade + focus trap + Escape, FLIP reorder via WAAPI, reduced-motion gentle version, hover gating); a11y (skip link, `<h1>` brand, aria-labels, `role="status"` toast area).
- **Round 2 (fix list `unslop-round2-fixes.md`, untracked):** mobile bottom bar gated on login state (was leaking onto the logged-out login screen at 375px); Rebuild button outlined blue (distinct from Save, no red); FLIP reorder wrapped in `prefers-reduced-motion` matchMedia guard; dead tokens deleted (grep-verified zero uses); toggle `input:focus-visible + .toggle-slider` ring; hero "· as of <time>" removed. Council: BEFORE 5/10 ×3 → AFTER 7/7/8, avg 5.0 → 7.33.
- **Round 3 (fix list `unslop-round3-fixes.md`, untracked):** Rebuild button → solid light (`btn-danger` renamed `btn-rebuild`, 0 hits left), toast 400ms → 200ms (JS timeout matched), modal opacity-only + hide timeout 250ms, hero line sans (mono removed), Save button opacity 1 + dirty brightening (`var(--border-focus)`), dimmed rows 0.6 → 0.85, `.cat-card` → ruled list like knob cards, copy de-jargon (Overview subtitle, resource hub plain words), mobile nav scrolls instead of truncating, password toggle `aria-pressed`, reduced-motion spinner static ring. Council: BEFORE 5/4/5 → AFTER 7/7/7, avg 4.67 → 7.0. No round 4 — remaining disagreements are recorded taste calls.
- **Version bumps:** `app/index.js` (VERSION = '1.1.0'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — diff verified: no dependency version changed).
- **Live verification (production, 18 Nov 2026):** manifest Binge Addon 1.1.0 / 27 catalogs, id `com.bharatstreams`; /health 1.1.0; /admin 200 (64,618B; `v1.1.0` ×3, `btn-rebuild` ×5, `btn-danger` 0, skip-link present); status with password 200, 27 catalogs, 1.32s (under the 1500ms target); status without password 401; config GET 200, 27 catalogs, `underrated-gems.voteCountCeil` 25000; cron GET without auth 401 (1.0.9 guard holds); Trending Indian 20/20 + 20/20 (Ramayana / Ali Baba Aur 40 Bhoot first); Jailer 2 meta full (2026, 165 min, cast 10, director Nelson, Action/Comedy/Drama); /badges.json 200 (5 groups, 23 filters, 0 empty imageURLs). Script block `node --check` PASS; diff grep-verified against all three fix lists (no Tailwind hexes, no glows, no emoji, no backdrop blur, no `400ms`, no modal scale).
- **Deployment:** `dpl_GaMskDPGYfcD6dddLds7sdTVd1zY` (READY, latest on the project, verified via Vercel REST API). Commit `993b838`, tag + release `v1.1.0`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.1.0
- **Notes:** the release was finished by a finisher coordinator — the unslop coordinator deployed 1.1.0 but ended before committing/pushing/tagging/releasing; this tail (diff review, live verify, commit, push, tag, release) was done without re-deploying or changing any code. The separate `stream-format-fix` branch (Telegram-format title work, commit dc22acd) was NOT touched, NOT merged, NOT included in this release. Design/unslop notes (`unslop-*.md`, `dashboard-design-draft.md`, `ai-design-draft.md`, `design-reviews.md`) stay untracked by design.

## v1.1.1 TELEGRAM-FORMAT STREAM TITLES 18 Nov 2026 (basant: "title + neeche wali quality/size/audio lines Telegram jaise format me")
- **Goal:** Stream titles are raw torrent filenames ("Jailer 2 (2026) 1080p Telugu HQ HDRip - HEVC - (DD+5.1 - 192Kbps & AAC) - 1.6GB - ESub") with duplicated info (1080p/size in title AND info lines) and a language contradiction (title says Telugu, audio line says Hindi + English). Replace with the Telegram-channel format basant approved.
- **Locked format:** name = `Jailer 2 (2026)` (name + year only); then labeled lines, one signal each: `Quality: 1080p HDRip` / `Audio: Hindi + English | DD+ 5.1` / `Size: 1.57 GB`. Junk tokens stripped (HQ, ESub, 192Kbps, parenthesis soup); nothing duplicated; a line is omitted entirely if its signal is genuinely missing — never invented. Language rule: Torrentio flag-emoji line wins over filename language tokens.
- **What changed:** `app/lib/parse.js` only (branch `stream-format-fix`, commit dc22acd, merged into main as 53d2e5b — clean merge, zero conflicts; main's 1.1.0 touched admin.html + version files only). New tests: `tests/test-stream-format.js` + `tests/fixtures/stream-format-corpus.json` (22 fixtures, 31/31 rows, zero info loss). `tests/test-badges.js` still passes (23 Onyx badges). Badges NOT in scope (his screenshot's badges were the Sterzeck pack's, not ours).
- **Version bumps:** `app/index.js` (VERSION = '1.1.1'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — diff verified: only lines 3 and 9 changed, no dependency version touched).
- **Known caveats from branch work:** Ramayana had 0 keepable live streams at branch time (all CAM/HDTS dropped); series used 1 synthetic fixture; Comet is 403 from this VM.
- **Deployment:** `dpl_FQQ9kQDwhtUN5RjAMUSFqK1gBF5F` (READY). Note: first deploy `dpl_9gjxNAMQHbLrwup4c8fntngAyAuV` (READY) shipped with stale hardcoded `v1.1.0` strings in `app/lib/admin.html` (login badge, version tag, status pill) — caught during live verification, fixed in commit `5a46e49`, redeployed as `dpl_FQQ9kQDwhtUN5RjAMUSFqK1gBF5F`. **Live verification (production, 18 Nov 2026):** manifest Binge Addon 1.1.1 / 27 catalogs, id `com.bharatstreams`; /health 1.1.1; /admin 200 (64,618B, `v1.1.1` ×3, `v1.1.0` ×0); status with password 200, 27 catalogs, 1.42s (under 1500ms target); status without password 401; config GET 200, 27 catalogs, `underrated-gems.voteCountCeil` 25000; cron GET without auth 401 (1.0.9 guard holds); Trending Indian 20/20 + 20/20 (Ramayana / Ali Baba Aur 40 Bhoot first); Jailer 2 meta full (2026, 165 min, cast 10, director Nelson, Action/Comedy/Drama); /badges.json 200 (5 groups, 23 filters, 0 empty imageURLs). **Stream-format proof (live, Jailer 2, 40 streams):** first stream `Jailer 2 (2026)` / `Quality: 1080p HDRip` / `Audio: Hindi + English | DD+ 5.1` / `Size: 1.57 GB` — the exact locked format, same stream as basant's screenshot.

## v1.1.2 CAM LAST-RESORT FALLBACK 18 Nov 2026 (basant: "cam dikha do")
- **Goal:** Ramayana: Rise of a Legend (tt27988879) showed "No streams found" in Nuvio because ALL 43 live Torrentio streams are CAM/TeleCine/TeleSync and the addon filtered CAM out (his v1.0.3 order). Jailer 2 still returned 40 clean streams — the addon was fine, only cam-only titles were empty.
- **Rule (exact):** CAM/TeleCine/TeleSync/HDTS/HDTC/DVDScr/SCR streams stay HIDDEN whenever clean streams exist (v1.0.3 stands). They appear ONLY as a last resort when a title has ZERO clean streams after filtering, and every shown CAM stream is CLEARLY marked so it is never mistaken for clean HD.
- **What changed:** `app/lib/parse.js` — `processSourceStreams` now returns `{kept, cam, dropped}`; a row that fails ONLY the CAM check is retained in `cam` (it must still pass the resolution cap and language verdict; the 0-seeder rule applies to the cam pool too — a 2160p CAM or Tamil-only CAM stays dropped). Each CAM row is tagged `isCam` + `camKind`/`camRank`: TeleCine (0) > TeleSync/HDTS/HDTC (1) > DVDScr/Screener/PreDVD (2) > CAM/HDCAM/CAMRip (3); the cam list sorts best-first (camRank, then `compareParsed`). `formatStream` marks CAM in the Quality line (`Quality: 1080p CAM TeleCine`) AND adds `Note: CAM print — theatre recording`; clean streams are never marked. `app/lib/sources.js` — `fetchSource` carries `cam` through; new `mergeStreamResults(results, cap)` merges clean from ALL sources first and falls back to the merged CAM list ONLY when the deduped clean list is empty (cap 40). `app/index.js` — stream handler uses it and logs `returning N clean` vs `returning N CAM fallback`.
- **Tests:** new `tests/test-cam-fallback.js` + fixtures `tests/fixtures/ramayana-torrentio-20261118.json` (43 live rows, all CAM) and `tests/fixtures/jailer2-torrentio-20261118.json` (145 live rows) captured 18 Nov 2026 ~18:30 IST. Asserts: cam-only → 36 CAM returned (7 Tamil-only CAM rows stay dropped), all marked, best-first; mixed → 40 clean, ZERO CAM in output; clean-only (Dangal corpus) → unchanged; synthetic rows prove 2160p CAM / Tamil-only CAM / 0-seeder CAM rules. `tests/test-stream-format.js` and `tests/test-badges.js` still pass (all suites green).
- **Version bumps:** `app/index.js` (VERSION = '1.1.2'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — diff verified: only lines 3 and 9 changed, no dependency version touched), `app/lib/admin.html` (all 3 hardcoded `v1.1.1` strings → `v1.1.2`).
- **Deployment:** `dpl_3oMG3Pr4LcoaD5pmaZaFydRhvgRH` (READY, first attempt). **Live verification (production, 18 Nov 2026):** manifest Binge Addon 1.1.2 / 27 catalogs, id `com.bharatstreams`; /health 1.1.2; /admin 200 (64,618B, `v1.1.2` ×3, `v1.1.1` ×0); status with password 200, 27 catalogs, tmdbKeySet + blobSet true; status without password 401; config GET 200, 27 catalogs, `knobs/underrated-gems/voteCountCeil` 25000; cron GET without auth 401; Trending Indian 20/20 + 20/20 (Ramayana / Ali Baba Aur 40 Bhoot first); Jailer 2 meta full (2026, 165 min, cast 10, director Nelson, Action/Comedy/Drama); /badges.json 200 (5 groups, 23 filters, 0 empty imageURLs). **CAM proof (live):** Ramayana tt27988879 → 40 streams, ALL marked CAM — first stream `Ramayana (2026)` / `Quality: 1080p CAM TeleCine` / `Note: CAM print — theatre recording` / `Size: 6.38 GB` (kinds seen: TeleCine, TeleSync, HDTC, DVDScr at 1080p/720p/480p). **Clean proof (live):** Jailer 2 tt33318732 → 40 streams, ZERO CAM anywhere in name/description; first stream unchanged `Jailer 2 (2026)` / `Quality: 1080p HDRip` / `Audio: Hindi + English | DD+ 5.1` / `Size: 1.57 GB`.

## v1.1.3 REMOVE CAM NOTE LINE 18 Nov 2026 (basant: "note likhne ke jarurat nahi hai bhai")
- **Goal:** v1.1.2 marked every CAM stream twice — `Quality: 1080p CAM TeleCine` AND `Note: CAM print — theatre recording`. Basant said the Note line is not needed; the Quality line's CAM + kind marking is enough.
- **What changed:** `app/lib/parse.js` — `formatStream` no longer pushes the `Note: CAM print — theatre recording` line (1 line removed, nothing else). CAM last-resort rule unchanged (CAM only when zero clean streams), Quality line keeps `CAM` + kind, Telegram format (name + Quality/Audio/Size lines) unchanged, sorting unchanged. `tests/test-cam-fallback.js` — updated: asserts CAM in the Quality line AND asserts NO `Note:` line in any CAM description; first CAM stream exact description now `Quality: 1080p CAM TeleCine\nSize: 6.38 GB`; clean-output no-Note assertion kept.
- **Tests:** `tests/test-cam-fallback.js`, `tests/test-stream-format.js`, `tests/test-badges.js` — all suites PASS (no fixtures changed).
- **Version bumps:** `app/index.js` (VERSION = '1.1.3'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — diff verified: only lines 3 and 9 changed, no dependency version touched), `app/lib/admin.html` (all 3 hardcoded `v1.1.2` strings → `v1.1.3`).
- **Deployment:** `dpl_CdMrvGXJQXdwt7GipfLjmwNDuPVW` (READY, first attempt). **Live verification (production, 18 Nov 2026):** manifest Binge Addon 1.1.3 / 27 catalogs, id `com.bharatstreams`; /health 1.1.3; /admin 200 (64,618B, `v1.1.3` ×3, `v1.1.2` ×0); status with password 200, 27 catalogs, 0.58s; status without password 401; config GET 200, 27 catalogs, `knobs/underrated-gems/voteCountCeil` 25000; cron GET without auth 401; Trending Indian 20/20 + 20/20 (Ramayana / Ali Baba Aur 40 Bhoot first); Jailer 2 meta full (releaseInfo 2026, 165 min, cast 10, director Nelson, Action/Comedy/Drama); /badges.json 200 (5 groups, 23 filters, 0 empty imageURLs). **CAM proof (live):** Ramayana tt27988879 → 40 streams, ALL 40 with CAM in the Quality line, ZERO with any `Note:` line — first stream `Ramayana (2026)` / `Quality: 1080p CAM TeleCine` / `Size: 6.38 GB` (second stream `Quality: 1080p CAM HDTC` / `Audio: Hindi` / `Size: 2.43 GB`). **Clean proof (live):** Jailer 2 tt33318732 → 40 streams, ZERO CAM, ZERO `Note:` anywhere; first stream unchanged `Jailer 2 (2026)` / `Quality: 1080p HDRip` / `Audio: Hindi + English | DD+ 5.1` / `Size: 1.57 GB`.

## v1.1.5 EXACT 7-LINE BLUEPRINT FORMAT 19 Nov 2026 (basant: screenshot ka poora blueprint)
- **Goal:** v1.1.4's compact format was still not exact enough for basant — he re-sent the same Nuvio screenshot plus a full 7-line blueprint (line-by-line breakdown, an AIOStreams Custom Formatter template, and an AI-prompt for the card UI). This version implements that blueprint exactly: the NAME is now the resolution badge (🚀 FHD etc.), not the title, and the description is 6 lines (🎬 title / 📹 spec / 🎧 audio / 📦 size / 🏷️ group / ⚡ Ready + 🔍 source).
- **New format (live example — Jailer 2 first stream):** NAME `🚀 FHD`; DESC `🎬 Jailer 2 (2026)` / `📹 HDRip 🎞️ HEVC` / `🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧` / `📦 1.57 GB` / `🏷️ NOGRP` / `🔍 Torrentio`. Blueprint example (synthetic Comet row, Reacher S4E2): `🎬 Reacher 🍂 S04 🎞️ E02` / `📹 BluRay Remux 🎞️ AVC ⏱️ 41m:22s` / `🎧 DTS-HD MA 🔊 5.1 🌐 🇬🇧` / `📦 8.5 GB 📊 27.4 Mbps` / `🏷️ Preacher 💎 DebridAccount|torbox` / `⚡ Ready (TB) 🔍 Comet`. Each line omitted when its signal is genuinely missing — never invented, never "⏳ Uncached".
- **What changed:** `app/lib/parse.js` — `formatStream` rewritten to the blueprint (new signature `formatStream(p, opts = {})`); new helpers `extractBaseTitle` (displayTitle minus SxxEyy; `extractDisplayName` refactored onto it, behavior identical), `seriesTag`, `parseDebridProvider` (keeps `DebridAccount|torbox` as-is; "dmm_hashlist" and other Comet-internal junk stay out), `durationSeconds` (bitrate = size_bytes × 8 / duration_seconds / 1e6, 1 decimal — verified: 8.5 GB / 41m22s = 27.4 Mbps, 4.01 GB / 43m11s = 12.4 Mbps), `RESOLUTION_LABEL` (2160p→🔥 4K, 1080p→🚀 FHD, 720p→⚡ HD, 480p→💿 SD; 2160p never fires — the 1080p cap drops those streams — mapping implemented anyway; unknown resolution falls back to the display title). Season/episode threaded from the request id (`tt9288030:4:2` → S04 E02, 2-digit pad) via opts from `app/index.js`; filename SxxExx tag is the fallback. HDR variant stays after the source (deliberate: Onyx HDR badge matching runs on description text). Flags joined with ` / ` (blueprint separator). Group default is the blueprint's explicit `NOGRP`. CAM mark stays in the spec line (`📹 1080p CAM TeleCine`). `§7.6` lock comment updated (compact format -> blueprint format).
- **Badges fix (deliberate call):** the new format removes "1080p" and the language words from the description, which would otherwise have killed the resolution + language badges in Nuvio (v1.1.4 silently broke the language badges the same way — flags replaced the words with no pattern update, and test-badges was run pre-deploy so it went unnoticed). `app/lib/badges.json`: 5 patterns patched in place (res-1080p `|🚀 FHD`, res-720p `|⚡ HD`, res-480p `|💿 SD`, lang-hindi `|🇮🇳`, lang-english `|🇬🇧`). The emoji-header/flag alternations are exact-literal matches that cannot false-fire ("⚡ HD" matches only the 720p header, not "DTS-HD MA"). Language group is first-match-wins with lang-hindi first, so 🇮🇳 streams show the Hindi badge (same as v1.1.3 behavior). Verified live: test-badges.js against the live pack passes (1080p, Hindi, English badges all still fire).
- **Tests:** `tests/test-stream-format.js` (all 22 fixtures re-pinned to exact blueprint output + §7 unit tests: extractBaseTitle, parseDebridProvider, durationSeconds, name headers incl. 2160/720/480/unknown, opts S/E override vs filename fallback, 5-line no-audio case; §6b synthetic Comet rows re-pinned — one expectation corrected during the run: the blueprint example shows "Reacher (2022)" but real Reacher torrent filenames carry NO year, so the correct line 1 is "🎬 Reacher 🍂 S04 🎞️ E02" — the year shows only when the filename carries it, never invented; the screenshot's own card shows no year either), `tests/test-cam-fallback.js` (first CAM stream now `🚀 FHD` / `🎬 Ramayana (2026)\n📹 1080p CAM TeleCine\n📦 6.38 GB\n🏷️ 1O8Op\n🔍 Torrentio`; CAM check moved from description line [0] to line [1]), `tests/repro-format.js` (REFRESHED — was stale since v1.1.1: asserted the old no-flag-emoji rule and needed /tmp inputs that are gone; now self-contained with the 25-spelling CAM matrix + inline cleanTitle demos + v1.1.5 blueprint invariants over the corpus fixtures), `tests/test-badges.js` (live pack) — all suites PASS.
- **Version bumps:** `app/index.js` (VERSION = '1.1.5'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only), `app/lib/admin.html` (3 hardcoded strings, 0 remaining v1.1.4).
- **Deployment:** `dpl_6Kn298mUPausxVtmGGbwCH7wd2e8` (READY; a first deployment `dpl_6QLsaDU92Ck7E54XPjNwGbc4FqEA` was superseded by a comment-only parse.js touch-up — 3 stale "(compact format, v1.1.4)" comments → "(blueprint format, v1.1.5)" — and redeployed so the tagged code matches live byte-for-byte). **Live verification (production, 19 Nov 2026):** manifest Binge Addon 1.1.5 / 27 catalogs, id `com.bharatstreams`; /health 1.1.5; /badges.json 200 (23 filters, all 5 patched patterns live). **Stream-format proof (live):** Jailer 2 tt33318732 → 40 streams (Torrentio + HdHub), first stream exactly the blueprint shape above. Reacher S4E2 tt9288030:4:2 → 40 streams, `🍂 S04 🎞️ E02` threading works live from the request id (first stream `🎬 reacher 🍂 S04 🎞️ E02` — lowercase "reacher" is the pre-existing raw-filename quirk; second stream shows "Reacher (2022)" where the filename carries the year).
- **Honest caveats:** **Comet still contributed 0 streams live** (same Cloudflare gate; Torrentio + HdHub only on both probes). So the ⏱️ duration, 📊 bitrate, 💎 debrid and ⚡ Ready lines are implemented + synthetic-tested but NOT proven on a real Comet payload — they appear automatically if/when Comet starts answering, no code change needed. Multi-language rows still show many flags (Reacher rows carry 8–9) — cap only if basant says it looks noisy. TorrentsDB NOT in this batch (his pick still pending).
- **Status:** Commit `b6cbf37`, tag + release `v1.1.5`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.1.5

## v1.1.4 COMPACT STREAM FORMAT 19 Nov 2026 (basant: "image jaisa banao")
- **Goal:** Basant sent a Nuvio screenshot (Reacher S4E2, AIOStreams) and said the emoji-labeled-lines attempt (v1.1.4 first try, stopped before deploy) was still not right — "image jaisa banao". The screenshot's card is COMPACT: no "Quality:"/"Audio:"/"Size:" labeled lines at all. Nuvio draws that card by parsing the stream's name+description text, so Binge's Telegram format could never render as that card. Replaced with the AIOStreams minimalist formatter shape (basant's own AIOStreams config: Description = "resolution | visualTags + encode" newline "audioTags + languageEmojis").
- **New format (name line unchanged — "Jailer 2 (2026)" / series name as before):** `1080p | BluRay Remux AVC ⏱ 41m:22s` / `DTS-HD MA 5.1 🇬🇧` / `💾 8.5 GB` / `📦 Preacher` / `🔍 Comet ⚡ Ready (TB)`. Each line omitted when its signal is genuinely missing — never invented.
- **What changed:** `app/lib/parse.js` only (plus tests + version bumps). New extractors: `parseReleaseGroup` (trailing "-GROUP", bracketed "[YTS.AM]" -> "YTS", paren "(WiKi-LUMiX)" -> "WiKi"; last dash segment wins so "AC3-LOKI-M2Tv" -> "M2Tv"; site suffixes (HDHub4u), codec tails (x264), junk tails (ESub), truncated paren tails ("(ATELiE") all rejected); `parseDuration` ("41m:22s", "41m 22s", "1h 23m" — Comet titles carry it, Torrentio titles do not, verified live 19 Nov: 0 duration tokens in 190 Torrentio rows for Reacher S4E2); `parseReady` ("Ready (TB)"/"(RD)" passthrough, TorBox/Real-Debrid names normalised to TB/RD, Comet-internal junk "NOGRP"/"DebridAccount|torbox"/"dmm_hashlist" excluded). `h264`/`h265` (incl. "H.264" spelling) normalise to `x264`/`x265`; "Remux" rides along after the primary source ("BluRay Remux"); HDR variant stays in line 1 (it feeds the Onyx HDR badges — dropping it would lose a real signal vs v1.1.3); identical flags collapse to one (four Indian languages -> one 🇮🇳). CAM rule unchanged (CAM + kind in line 1, "1080p CAM TeleCine", last-resort only). `formatStream` rewritten; `§7.6` lock comment updated (Telegram labeled format -> compact format).
- **Tests:** `tests/test-stream-format.js` (22 fixtures re-pinned to exact compact output + extractor unit tests + synthetic Comet Reacher rows shaped from basant's screenshot — the Preacher row reproduces the brief's example exactly), `tests/test-cam-fallback.js` (first CAM stream now `1080p CAM TeleCine\n💾 6.38 GB\n📦 1O8Op\n🔍 Torrentio`), `tests/test-badges.js` — all suites PASS. `tests/repro-format.js` is stale (asserts the v1.1.1 no-flag-emoji rule; its /tmp inputs are gone so it cannot run) — left untouched, needs a refresh if revived.
- **Version bumps:** `app/index.js` (VERSION = '1.1.4'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — diff verified: only lines 3 and 9 changed; a `color-name` dependency version was briefly caught by the same sed and reverted), `app/lib/admin.html` (all 3 hardcoded `v1.1.3` strings → `v1.1.4`).
- **Deployment:** `dpl_GZXqkubvduejVprceqqU2iNTkh4H` (READY, first attempt). **Live verification (production, 19 Nov 2026):** manifest Binge Addon 1.1.4 / 27 catalogs, id `com.bharatstreams`; /health 1.1.4; /admin 200 (64,618B, `v1.1.4` ×3, `v1.1.3` ×0); /badges.json 200; Trending Indian 20/20 + 20/20 (Ramayana / Ali Baba Aur 40 Bhoot first). **Stream-format proof (live):** Jailer 2 tt33318732 → 40 streams, ZERO CAM — first stream `Jailer 2 (2026)` / `1080p | HDRip HEVC` / `DD+ 5.1 🇮🇳 🇬🇧` / `💾 1.57 GB` / `🔍 Torrentio` (25 Torrentio + 15 HdHub). Reacher S4E2 tt9288030:4:2 → 40 streams (30 Torrentio + 10 HdHub), 29/40 with a 📦 group line (EZTVx, Ghost, TheBlackKing…).
- **Honest caveats:** **Comet contributed 0 streams live on both probes** (same as this VM — Vercel's IPs hit the same Cloudflare gate, most likely; two consecutive probes identical, not flaky). So the duration/Ready passthrough is implemented + synthetic-tested but NOT proven on a real Comet payload — if/when Comet starts answering, those lines appear automatically, no code change needed. Multi-language rows show many flags (Reacher rows carry 8: 🇮🇳 🇬🇧 🇫🇷 🇩🇪 🇯🇵 🇰🇷 🇪🇸 🇹🇭) — the same set v1.1.3 showed as words, now as flags; cap it later only if basant says it looks noisy. One cosmetic pre-existing quirk, untouched by this change: a Reacher row's name renders lowercase ("reacher S04E02") because the raw torrent filename is lowercase.
- **Status:** Commit `fa384f9`, tag + release `v1.1.4`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.1.4

## v1.1.6 META ENRICHMENT (LOGO + YEAR) 19 Nov 2026 (basant: detail page pe poster/logo + cast photos)
- **Goal:** Nuvio detail page showed no poster/logo and bare cast names. Meta handler now enriches from TMDB: logo + year added; cast photos investigated and honestly ruled out (see protocol verdict below).
- **What changed:** NEW `app/lib/meta.js` — pure `buildMetaFromTmdb()` + `pickLogo()` (logo from TMDB `images.logos`, English preferred, `https://image.tmdb.org/t/p/w500<file_path>`, null if none; year from `release_date`/`first_air_date`; cast stays name-strings). `app/index.js` — meta handler now `append_to_response=credits,images`, uses `buildMetaFromTmdb`; dead `TMDB_IMG` const removed; VERSION 1.1.6. `app/scripts/build-catalogs.js` — catalog `toMeta()` also adds `year` (reaches Blob rows on next rebuild). NEW `tests/test-meta.js` (37/37 pass).
- **Protocol verdict (honest, do NOT "fix"):** Stremio meta protocol (SDK 1.6.10, `docs/api/responses/meta.md`) allows cast ONLY as `string[]` — no picture field exists; Cinemeta also sends bare name strings (verified live in tests). So cast photos CANNOT come from any addon; only from Nuvio's own TMDB Enrichment setting on basant's device. Cast was deliberately left as names.
- **Tests:** `tests/test-meta.js` 37/37 PASS; `tests/test-stream-format.js` 204 PASS; `tests/test-badges.js` ALL PASS; `tests/test-cam-fallback.js` 47 PASS. Server boot check: /health → version 1.1.6.
- **Version bumps:** `app/index.js` (VERSION = '1.1.6'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only), `app/lib/admin.html` (all 3 hardcoded strings, 0 remaining v1.1.5).
- **Deployment:** `dpl_BZG6h5p78ggST3ZpK98XZ4NUCyZd` (READY, first attempt). **Live verification (production, 19 Nov 2026):** manifest Binge Addon 1.1.6 / 27 catalogs, id `com.bharatstreams`; /health 1.1.6; /admin 200 (64,618B, `v1.1.6` ×3, `v1.1.5` ×0); /admin/api/status without password 401; /admin/api/config without password 401; cron GET without auth 401; /badges.json 200 (23 filters); Trending Indian 20/20 + 20/20 (Ramayana / Ali Baba Aur 40 Bhoot first). **Meta proofs (live):** Ramayana tt27988879 → logo `https://image.tmdb.org/t/p/w500/xsMGmNELfdLQrzbCcgaGgbBYv7B.png` (fetched: HTTP 200), year 2026, cast name-strings (Ranbir Kapoor, Yash, Sai Pallavi, Ravi Dubey, Arun Govil). Jailer 2 tt33318732 → logo `https://image.tmdb.org/t/p/w500/q1Jmo0QVwUSojit5Eq3jwtGBVdY.png` (fetched: HTTP 200), year 2026, cast 10 name-strings, runtime 165 min, director Nelson. **Streams unchanged (live):** Jailer 2 → 40 streams, ZERO CAM, first stream exact v1.1.5 blueprint (`🚀 FHD` / `🎬 Jailer 2 (2026)` / `📹 HDRip 🎞️ HEVC` / `🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧` / `📦 1.57 GB` / `🏷️ NOGRP` / `🔍 Torrentio`; Torrentio + HdHub).
- **Pending (needs admin password from basant/parent):** /admin/api/status with password → 200, 27 catalogs; /admin/api/config with password → 200, `underrated-gems.voteCountCeil` 25000. Not guessed, not skipped silently.
- **Status:** Commit `17729e2`, tag + release `v1.1.6`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.1.6

## v1.1.7 CATALOG SEARCH 19 Nov 2026 (basant: Nuvio Search "reacher" -> "No searchable catalogs")
- **Goal:** Nuvio Search showed "No searchable catalogs — Your enabled addons do not support catalog search." Diagnosis verified live before building: manifest 1.1.6 had 27 catalogs with NO `extra`, and `?search=reacher` returned the same unfiltered 20-item row (first: Ali Baba Aur 40 Bhoot, zero Reacher). Key nuance: Reacher is in NONE of our fixed rows, so filtering rows would still return 0 — search MUST query TMDB live.
- **What changed:** NEW `app/lib/search.js` — `searchCatalogs(type, query)` queries TMDB live (`search/movie` + `search/tv`, `include_adult=false`, page 1), resolves each result to its IMDb id via `external_ids`, maps to a Stremio meta preview (id/type/name/poster w342/background w780/releaseInfo+year/description); results without an IMDb id are skipped, never invented; cap 20, TMDB order kept; empty/whitespace query, unknown type, missing key, or TMDB error all return empty metas (never the full row). `app/lib/manifest.js` — all 27 catalogs now carry `extra: [{ name: "search", isRequired: false }]` (shape verified against stremio-addon-sdk 1.6.10 `docs/api/responses/manifest.md`: "If your catalog supports full text searching, set `extra: [{ name: \"search\", isRequired: false }]`"; `isRequired: false` so rows still serve as Board/Discover feeds); manifest still 4,308 bytes (< 8 KB). `app/lib/config.js` — `effectiveCatalogs()` carries `extra` through, otherwise the served /manifest.json would lose search. `app/index.js` — catalog handler reads `extra.search` (the real Stremio/Nuvio path-extra form `/catalog/<type>/<id>/search=<query>.json`) and searches live; PLUS a new Express route before the SDK router handles the `?search=` query form, because the SDK router only parses search from the path segment — a plain query string would otherwise reach the handler as a feed request and return the unfiltered row (exactly the reported bug). No-search path untouched (same `readCatalog` call); disabled-catalog check applies to search too. v1.1.5 stream format and v1.1.6 meta work untouched. NEW `tests/test-search.js` (62 checks).
- **Tests:** `tests/test-search.js` 62/62 PASS (42 offline: stubbed-TMDB mapping, no-Imdb skip, cap 20, empty/no-key/TMDB-error -> empty; 20 live §4 against production 1.1.7). `tests/test-meta.js` 36/36 PASS (note: v1.1.6 record said 37 — the file is untouched since 1.1.6, recount is 36, so the old number was a miscount, not a regression); `tests/test-stream-format.js` 204 PASS; `tests/test-badges.js` ALL PASS; `tests/test-cam-fallback.js` 47 PASS. Local end-to-end smoke (stubbed TMDB fetch, server :7017): manifest 1.1.7 + 27/27 extra, `?search=reacher` -> Reacher tt9288030, path-extra form -> Reacher, `?search=jailer` -> Jailer 2, plain catalog -> 200, /health 1.1.7.
- **Version bumps:** `app/index.js` (VERSION = '1.1.7'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only), `app/lib/admin.html` (all 3 hardcoded strings, 0 remaining v1.1.6).
- **Deployment:** `dpl_2dmTHUVSaeHBLatN4FciPznkCgcb` (READY, first attempt; previous latest `dpl_BZG6h5p78ggST3ZpK98XZ4NUCyZd` confirmed READY before deploying). **Live verification (production, 19 Nov 2026):** manifest Binge Addon 1.1.7 / 27 catalogs, id `com.bharatstreams`, search extra on all 27; /health 1.1.7; /admin 200 (64,618B, `v1.1.7` ×3, `v1.1.6` ×0); /admin/api/status without password 401; /admin/api/config without password 401; cron GET without auth 401; /badges.json 200 (23 filters); Trending Indian 20/20 + 20/20 (Ramayana / Ali Baba Aur 40 Bhoot first). **Meta regression check (v1.1.6):** Ramayana tt27988879 -> logo `https://image.tmdb.org/t/p/w500/xsMGmNELfdLQrzbCcgaGgbBYv7B.png` (fetched: HTTP 200), year 2026. **Streams unchanged (live):** Jailer 2 -> 40 streams, ZERO CAM, first stream exact v1.1.5 blueprint (`🚀 FHD` / `🎬 Jailer 2 (2026)` / `📹 HDRip 🎞️ HEVC` / `🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧` / `📦 1.57 GB` / `🏷️ NOGRP` / `🔍 Torrentio`; 25 Torrentio + 15 HdHub, infoHash present). **Search proofs (live):** `?search=reacher` -> 2 results, Reacher tt9288030 first (series, 2022, poster) + Neagley (Reacher spinoff); path-extra `/search=reacher.json` -> Reacher too; `?search=jailer` -> 7 results, Jailer 2 tt33318732 first; `?search=ramayana` -> 16 results, Ramayana tt27988879 first; `?search=zzznothinghere` -> 0 metas (empty, never the row).
- **Pending (needs admin password from basant/parent):** /admin/api/status with password -> 200, 27 catalogs; /admin/api/config with password -> 200. Not guessed, not skipped silently. On-device verdict still pending: basant must re-open Nuvio Search and type "reacher" — the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Status:** Commit `444bdb6`, tag + release `v1.1.7`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.1.7

## v1.1.8 WINDOWS-ONLY LANGUAGE CODES 19 Nov 2026 (basant: "jo best vo karo bhai" — best option picked: Windows-only codes)
- **Goal:** Windows Chromium/WebView renders flag emojis as bare "IN"/"GB" letters, so the Audio line looked broken on his laptop while his phone showed flags fine. Best option (parent's pick): Windows clients get 2-letter codes, everyone else keeps flags. NOT "codes everywhere", NOT as-is. Twemoji SVGs / CSS colours / padding / pill-badge removal were ruled out of scope by design — Stremio streams are plain text, Nuvio renders the cards, no SVG/CSS can ride along.
- **What changed:** NEW `app/lib/request-context.js` — AsyncLocalStorage per-request User-Agent (`runWithRequest` middleware + `isWindowsClient()`, case-insensitive "Windows" substring; no/unknown UA defaults to NOT Windows = flags). The SDK router never passes the raw request to handlers, so the UA is captured by Express middleware before the SDK router runs. `app/index.js` — middleware added after `express.json()`; stream handler threads `useTextLangs` into `formatStream`. `app/lib/parse.js` — `LANG_CODE` map (ISO 639-1 for all 19 LANG_LABEL languages: HI/EN/TA/TE/ML/KN/BN/MR/GU/PA/KO/RU/JA/ZH/ES/FR/DE/TH/VI); `formatStream` renders codes when `opts.useTextLangs`, flags otherwise; parsing side (FLAG_LANG) untouched; fallback to flag if a code is ever missing. `app/lib/badges.json` — lang-hindi/lang-english gain anchored code alternatives (`🌐[^\n]*\bHI\b` / `\bEN\b`) so badges fire on the Windows variant; the other 8 language badges need none (their patterns never matched flags either — parity kept). Two bugs caught during the run and fixed before deploy: (1) a misplaced paren put `.filter(Boolean)` on a string in parse.js; (2) the first badge patch wrote real newline/backspace control chars into the patterns (shell+Python escape layers) — restored from backup and re-patched via a file-based script with raw strings; codepoints verified (U+5C U+6E / U+5C U+62). `tests/test-search.js` — pinned version 1.1.7 -> 1.1.8 (the 1 failure on first run was the pin, not a regression — verified by stash check).
- **Tests:** NEW `tests/test-windows-langs.js` — ALL PASS (UA detection incl. case-insensitivity, missing UA, nested-context no-leak; flag vs code variants on real corpus fixtures incl. 3-language Dangal row `🌐 HI / EN / RU`; byte-identical lines except Audio; badge firing for both variants + the "Hi Nanna" title trap). `tests/test-stream-format.js` 204 PASS; `tests/test-meta.js` 36/36 PASS; `tests/test-cam-fallback.js` 47 PASS; `tests/test-search.js` ALL PASS; `tests/test-badges.js` ALL PASS. Local end-to-end smoke (server :7019): Windows UA -> `🎧 DD+ 🔊 5.1 🌐 HI / EN`; Android UA -> `🎧 DD+ 🔊 5.1 🌐 🇮🇳 / 🇬🇧`; no UA -> flags.
- **Version bumps:** `app/index.js` (VERSION = '1.1.8'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only), `app/lib/admin.html` (all 3 hardcoded strings, 0 remaining v1.1.7).
- **Deployment:** `dpl_4a3LsrUFFFnyKDNopTusKLfMSQ3V` (READY, first attempt; previous latest `dpl_2dmTHUVSaeHBLatN4FciPznkCgcb` confirmed READY before deploying). **Live verification (production, 19 Nov 2026):** manifest Binge Addon 1.1.8 / 27 catalogs, id `com.bharatstreams`; /health 1.1.8; /admin 200 (64,618B, `v1.1.8` ×3, `v1.1.7` ×0); /admin/api/status without password 401; /admin/api/config without password 401; cron GET without auth 401; /badges.json 200 (23 filters, new HI/EN patterns live); Trending Indian 20/20 + 20/20 (Ramayana / Ali Baba Aur 40 Bhoot first). **Meta regression check (v1.1.6):** Ramayana tt27988879 -> logo `https://image.tmdb.org/t/p/w500/xsMGmNELfdLQrzbCcgaGgbBYv7B.png`, year 2026. **Search regression check (v1.1.7):** `?search=reacher` -> 2 results, Reacher tt9288030 first. **Flag proofs (live, Jailer 2 tt33318732):** Windows UA -> 40 streams, ZERO flag emojis anywhere, 0 CAM, first stream `🚀 FHD` / `🎬 Jailer 2 (2026)` / `📹 HDRip 🎞️ HEVC` / `🎧 DD+ 🔊 5.1 🌐 HI / EN` / `📦 1.57 GB` / `🏷️ NOGRP` / `🔍 Torrentio`, all 40 with HI/EN audio lines; Android UA -> 40 streams, all 40 with flags, first stream `🌐 🇮🇳 / 🇬🇧`; no UA -> flags. **Badge check on live text:** Hindi 40/40 + English 11/40 in BOTH variants (identical).
- **Pending (needs admin password from basant/parent):** /admin/api/status with password -> 200, 27 catalogs; /admin/api/config with password -> 200. Not guessed, not skipped silently. On-device verdict still pending: basant must open Jailer 2 streams on his Windows laptop (Nuvio) and confirm `HI / EN` — the Windows variant was proven with a Windows UA string via curl, not from a real Nuvio Windows client (none available here); the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Status:** Commit `56d8b44`, tag + release `v1.1.8`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.1.8

## v1.2.0 META FALLBACKS — TMDB /find + CINEMETA 19 Nov 2026 (basant: Preacher tap fails + "Cinemeta apne addon me add nahi ho sakta kya")

- **Basant's bug (19 Nov ~10:54 IST, with Nuvio screenshots):** clicking "Preacher" in the "Trending in India • Series" row on Windows gives "Failed to load — Could not load details from any addon." **Root cause (live-verified before building):** the meta handler resolved IMDb→TMDB id ONLY via the persisted Blob id map (`catalogs/_idmap.json`), which holds only titles currently in our catalogs. Preacher (tt5016504, series) is NOT in the live trending-indian-series row → no map entry → handler returned `{"meta":null}` (HTTP 200). Cinemeta HAS Preacher meta (verified live), but basant has NO Cinemeta installed, so there was no fallback. Control proofs: our meta for Breaking Bad tt0903747 (in the map), Ali Baba tt44101690, Dangal tt5074352, Ramayana, Jailer 2 all returned full meta — the failure was specific to ids missing from the map, not to series in general.
- **Scope addition mid-batch (19 Nov ~10:57 IST, basant's ask):** "https://v3-cinemeta.strem.io/manifest.json — ye apne addon me add nahi ho sakta kya" — can Cinemeta be added INSIDE our addon? YES. A second fallback was added after the TMDB /find fallback. **Version is therefore 1.2.0, NOT 1.1.9** — the batch has TWO user-requested changes (1.1.8 + 2, carry at 10).
- **What changed (code only, no stream/catalog/search/admin/badge changes):**
  - NEW `app/lib/meta-fetch.js` — the meta handler's TMDB calls, factored out so tests can stub them: `findTmdbId` (TMDB `/find/{imdb_id}?external_source=imdb_id`, only the result list matching the requested type is used — a series id asked as a movie resolves to null, never a mismatched meta), `fetchMetaForTmdbId` (detail + credits + images → `buildMetaFromTmdb`, series `videos` synthesized from `d.seasons`, byte-identical to the v2.1.0 handler), `fetchMetaFromCinemeta` (free, no key, no auth — maps Cinemeta's meta into OUR shape: name, year, poster, background, logo, cast as bare name strings, genres from `genre`/`genres`, runtime, description, releaseInfo kept as-is, imdbRating if present, series `videos` mapped from Cinemeta's episode list; only whitelisted fields copied — `credits_cast`/`credits_crew`/`trailers`/`moviedb_id` stay out; nothing invented, a missing field is omitted), `resolveMeta` (never throws — any failure resolves to `{meta: null}`).
  - `app/index.js` — meta handler now: **(1) id-map fast path → (2) TMDB /find → (3) Cinemeta** → `{meta: null}` only when all three miss (or no TMDB key). Find-resolved mappings are cached in the existing in-memory reverse-map cache; deliberately NOT written back to Blob `_idmap.json` (the daily rebuild regenerates that map from catalog titles only, so a write-back would be overwritten anyway, and a bad write could corrupt the map for every title). A Cinemeta-resolved title has no TMDB id to cache. The TMDB-key gate is unchanged (Cinemeta needs no key, but the gate is pre-existing behaviour — out of scope to change).
  - **Real values verified live for fixtures:** Preacher TMDB tv id **64230** (themoviedb.org/tv/64230-preacher), first aired 2016-05-22, 43 episodes S1 10 / S2 13 / S3 10 / S4 10 + season-0 Specials 18 (production meta carries 61 videos); Paddington 2 IMDb id corrected to **tt4468740** (tt4463894 is a different title — the first probe used the wrong id, caught before shipping), UK release 2017-11-10, 104 min, director Paul King. Cinemeta series `year` is a range ('2016–2019') — the mapping takes the first year of `released` ('2016') and keeps `releaseInfo` as-is. Fake-id note: Cinemeta movie tt9999999 actually resolves to a real junk title ("Revolutionary Russian Roulette"), so the both-miss live check uses the series form (Cinemeta returns `{}` for it).
- **Tests:** `tests/test-meta.js` extended with §5 (stubbed TMDB + Cinemeta, offline) — **91 checks, 0 failures** (was 36): Preacher via /find (name/year/poster/logo, 61 videos, first tt5016504:0:1, S1E1 at [18], last tt5016504:4:10; Cinemeta NOT called when /find hits); Paddington 2 via /find (movie, year 2017, runtime, director); map fast path still works + Ramayana meta via the new code path byte-identical to the v1.1.6 direct build; wrong type → null; fake id → null without crashing (both miss + fetch throwing); Cinemeta mapping direct (series + movie, director array → first element, null director → omitted, no `credits_cast`/`moviedb_id` leak, `{}` and HTTP 404 → null); third fallback end-to-end (map + /find miss → via 'cinemeta'). `tests/test-search.js` version pin updated 1.1.8 → 1.2.0 (the 1 failure on first run was the pin, not a regression — same pattern as v1.1.8). Full suite: test-meta 91 PASS, test-windows-langs PASS, test-stream-format 204 PASS, test-search PASS, test-cam-fallback 47 PASS, test-badges PASS.
- **Version bumps:** `app/index.js` (VERSION = '1.2.0'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only), `app/lib/admin.html` (all 3 hardcoded strings, 0 remaining v1.1.8).
- **Deployment:** `dpl_FrHAq4uT9nbUFSp75Ug1DziXKrRi` (READY, first poll; previous latest `dpl_4a3LsrUFFFnyKDNopTusKLfMSQ3V` confirmed READY before deploying). **Live verification (production, 19 Nov 2026, script /tmp/verify-v120.py — ALL CHECKS PASSED):** manifest Binge Addon 1.2.0 / 27 catalogs, id `com.bharatstreams`, meta resource declared; /health 1.2.0; /admin 200 (64,618B, `v1.2.0` ×3, `v1.1.8` ×0); /admin/api/status without password 401; /admin/api/config without password 401; cron GET without auth 401; /badges.json 200 (23 filters); Trending Indian 20/20 + 20/20 (Ramayana / Ali Baba Aur 40 Bhoot first). **Meta proofs:** Preacher tt5016504 → full meta, name Preacher, year 2016, poster `https://image.tmdb.org/t/p/w342/ey1WQajA25E5sFGHSApcqSWUSEc.jpg` (TMDB URL = /find path, NOT Cinemeta), logo w500, 61 videos; Paddington 2 tt4468740 → full meta, name Paddington 2, year 2017, TMDB poster, director Paul King. **Meta regression check (v1.1.6):** Ramayana logo `https://image.tmdb.org/t/p/w500/xsMGmNELfdLQrzbCcgaGgbBYv7B.png`, year 2026; Jailer 2, Ali Baba, Dangal, Breaking Bad metas unchanged. **Both-miss:** unknown series tt9999999 → 200 `{"meta":null}`, no crash. **Search regression (v1.1.7):** `?search=reacher` → Reacher tt9288030 first. **Flag proofs (v1.1.8):** Jailer 2 Windows UA → 40 streams, 0 CAM, zero flag emojis, HI/EN codes; Android UA → 40 streams, 0 CAM, all 40 with flags (`🌐 🇮🇳 / 🇬🇧`). Two verify-script bugs caught during the run (not addon bugs): `json.dumps` ASCII-escaping hid the flags, and the Preacher expectation was 43 videos before TMDB's season-0 Specials (18) were counted — both fixed in the script + test fixture, then re-verified green.
- **Honest gap — Cinemeta path NOT proven live:** no real title was found live that TMDB /find misses but Cinemeta resolves (TMDB /find covers essentially every IMDb id a user would tap; the fallback exists for the long tail + TMDB outages). The Cinemeta path is proven by the stubbed unit tests (§5f/5g) and the deployed payload contains `lib/meta-fetch.js` (verified in the deploy payload). If basant/parent can name such a title, it can be proven live in one curl.
- **Pending (needs admin password from basant/parent):** /admin/api/status with password -> 200, 27 catalogs; /admin/api/config with password -> 200. Not guessed, not skipped silently. On-device verdict still pending: basant must tap Preacher in Nuvio (Windows) and confirm the detail page loads — proven via production curl, not from a real Nuvio client (none available here); the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Status:** Commit `5cfa39d`, tag + release `v1.2.0`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.2.0

## v1.2.1 STREAM-FORMAT REVERT TO v1.1.3 TELEGRAM FORMAT 19 Nov 2026 (basant: "formate phele jaise hi kar do bhai")

- **Basant's order (19 Nov ~11:05 IST, Windows Nuvio screenshot):** after v1.1.8 his Windows Nuvio still showed `🌐 IN / GB` letters + muddy emoji lines — "formate phele jaise hi kar do bhai". "Pehle jaise" = the **v1.1.3 Telegram format he himself locked on 18 Nov ~16:26 IST**. Reverted, not re-litigated. **Version is 1.2.1** — one user-requested change (1.2.0 + 1).
- **The reverted format (byte-identical to v1.1.3):** name line = title + year only (`Jailer 2 (2026)`; series carry the SxxExx tag from the title, e.g. `Reacher (2022) S01E01`), then labeled lines only — `Quality: 1080p HDRip`, `Audio: Hindi + English | DD+ 5.1`, `Size: 1.57 GB`. Language WORDS, never flags or codes; a missing signal omits its line, never invented; junk stripped, nothing duplicated. NO emoji prefixes, NO 🚀/🎬/📹/🎧/📦/🏷️/🔍 lines, NO Group/Codec/Provider lines, NO flags, NO HI/EN codes. CAM fallback unchanged (v1.1.2/v1.1.3): Quality line gets `CAM` + kind when the title has zero clean streams (`Quality: 1080p CAM TeleCine`), NO Note line.
- **What changed:** `app/lib/parse.js` — `formatStream(p)` restored from tag v1.1.3 (code byte-identical; two stale comments fixed — the v1.1.3 comment wrongly said CAM "AND gets a plain warning line" when v1.1.3 itself removed the Note line). `extractDisplayName` now delegates to `extractBaseTitle` + the SxxExx tag (behavior verified identical against the v1.1.3 fixture expectations). Display-only tables removed: `LANG_FLAG`, `LANG_CODE`, `RESOLUTION_LABEL`, `PROVIDER_LABEL`, `seriesTag`. **Kept (non-format fixes):** h264/h265 encode normalisation, `parseReleaseGroup`/`parseDuration`/`parseReady`/`parseDebridProvider`/`durationSeconds` (parsed but no longer displayed), WORD_LANG boundary fix, HdHub name strip, language/drop rules, 1080p cap, CAM fallback logic, 40 cap, 0-seeder rule. Source flag-emoji parsing (`FLAG_LANG`) untouched. `app/lib/request-context.js` **DELETED** (not left dormant) — the v1.1.8 UA middleware is gone; `app/index.js` no longer reads any User-Agent and calls plain `parsed.map(formatStream)`, so every client gets byte-identical text. `app/lib/badges.json` restored **byte-identical to v1.1.3** (23 filters; the v1.1.5 🚀/⚡/💿 header alternations and v1.1.8 🇮🇳/🇬🇧/HI/EN alternations are gone — the reverted text carries `1080p` and the language words again, so the original patterns fire). `tests/test-windows-langs.js` **DELETED** (the Windows variant no longer exists); its UA-invariance assertions live in `test-stream-format.js` §5 (no emoji / no flags / no 2-letter codes anywhere, for any UA) plus a stale-opts check (`{useTextLangs: true, season, episode}` → byte-identical output).
- **Tests:** `tests/test-stream-format.js` — restored from v1.1.3 (exact locked output on all 22 corpus fixtures) + §5 strengthened (broad emoji + HI/EN-code checks) + §6/§7 parser-helper tests kept + §6b synthetic Comet rows re-pinned to the reverted format (`Reacher S04E02` / `Quality: 1080p BluRay` / `Audio: English | DTS-HD MA 5.1` / `Size: 8.5 GB`; duration/Ready/group/debrid parsed but not shown) + reverted name checks (name is always the display title, never a resolution header). `tests/test-cam-fallback.js` re-pinned (first CAM `Ramayana (2026)` / `Quality: 1080p CAM TeleCine\nSize: 6.38 GB`; CAM check back on description line [0]). `tests/test-search.js` version pin 1.2.0 → 1.2.1 (live §4 included). `tests/test-meta.js` 91 PASS, `tests/test-search.js` ALL PASS, `tests/test-stream-format.js` ALL PASS, `tests/test-cam-fallback.js` ALL PASS, `tests/test-badges.js` ALL PASS (local pack AND live pack — 1080p, Hindi, English all fire on live text again). `tests/repro-format.js` is STALE again (asserts v1.1.5 blueprint invariants, 14 failures) — left untouched, needs a refresh if revived.
- **Version bumps:** `app/index.js` (VERSION = '1.2.1'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — lines 3 and 9; a dependency at 1.2.1 on line 965 was NOT touched), `app/lib/admin.html` (3 hardcoded strings, 0 remaining v1.2.0).
- **Deployment:** `dpl_5Jth9Qnd5RoV6VKbneBbieQ5G9fz` (READY; previous latest `dpl_FrHAq4uT9nbUFSp75Ug1DziXKrRi` confirmed READY before deploying). **Live verification (production, 19 Nov 2026, script /tmp/verify-v121.py — ALL CHECKS PASSED):** manifest Binge Addon 1.2.1 / 27 catalogs, id `com.bharatstreams`; /health 1.2.1; /admin 200 (64,540B, `v1.2.1` ×3, `v1.2.0` ×0); /admin/api/status without password 401; /admin/api/config without password 401; cron GET without auth 401; /badges.json 200 (23 filters, v1.1.3 patterns, no flag/code alternations); Trending Indian 20/20 + 20/20 (Ramayana: Rise of a Legend / Ali Baba Aur 40 Bhoot first). **Meta regression check (v1.2.0):** Ramayana logo `https://image.tmdb.org/t/p/w500/xsMGmNELfdLQrzbCcgaGgbBYv7B.png`, year 2026; Preacher tt5016504 full meta, year 2016, 61 videos. **Search regression (v1.1.7):** series `?search=reacher` → Reacher tt9288030 first. **Format proofs (live):** Jailer 2 tt33318732 → 40 streams, ZERO CAM, first stream exactly `Jailer 2 (2026)` / `Quality: 1080p HDRip` / `Audio: Hindi + English | DD+ 5.1` / `Size: 1.57 GB` — byte-identical under no UA, Windows UA and Android UA; zero emoji / zero flags / zero HI-EN codes in all 40 × 3 UA variants. Ramayana tt27988879 → **36 CAM streams** (not 40 — the 7 Tamil-only rows stay dropped by the language verdict, same as the local fixture; the "40" in the task brief was the cap, the real CAM pool is 36), first `Ramayana (2026)` / `Quality: 1080p CAM TeleCine` / `Size: 6.38 GB`, all 36 Quality-line marked, no Note line, zero emoji/flags/codes under both UAs. Reacher S4E2 tt9288030:4:2 → 40 streams, first name `reacher S04E02` (lowercase "reacher" is the pre-existing raw-filename quirk, same as v1.1.5 noted — no year in the filename, never invented), first Audio line `Hindi + English + French + German + Japanese + Korean + Spanish + Thai` (8 languages as WORDS, the v1.1.3 behavior).
- **Honest notes:** the movie-catalog `?search=reacher` path returns only the three Jack Reacher movies — that is correct type-scoped behavior (series search lives on the series catalog, where Reacher is first). Two verify-script expectations were wrong on first run (Ramayana meta name is the full TMDB title "Ramayana: Rise of a Legend", not "Ramayana"; Ramayana CAM pool is 36, not 40) — both fixed in the script, not the addon, then re-verified green.
- **Pending (needs admin password from basant/parent):** /admin/api/status with password → 200, 27 catalogs; /admin/api/config with password → 200. Not guessed, not skipped silently. On-device verdict still pending: basant must open Jailer 2 streams on his Windows laptop (Nuvio) and confirm the Telegram format — proven via production curl with a Windows UA, not from a real Nuvio Windows client (none available here); the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Status:** Commit `5289007`, tag + release `v1.2.1`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.2.1

## v1.2.2 SERIES EPISODE NAMES + STILL THUMBNAILS 19 Nov 2026 (basant: Preacher detail page — all episode cards show the same season poster + generic "Episode 1/2/3/4")

- **Basant's bug (19 Nov ~11:06 IST, Preacher Seasons screenshot):** the detail page loads now (v1.2.0 worked), but episode cards all show the SAME season poster and generic "Episode 1/2/3/4" titles. **Root cause (live-verified before building):** series meta `videos` were only `{id, title: "Episode N", season, episode}` — NO thumbnail, NO real episode name, NO overview. Live proof: Preacher tt5016504 S4E1 was `{'id': 'tt5016504:4:1', 'title': 'Episode 1', 'season': 4, 'episode': 1}`, 61 videos. Cast photos are a SEPARATE, known-impossible item (Stremio protocol has no cast-picture field) — NOT touched.
- **What changed (series meta ONLY — stream format, search, catalogs, badges, admin, cast, fallback chain untouched):** `app/lib/meta-fetch.js` — after the TMDB detail call, `fetchMetaForTmdbId` now enriches series videos via TMDB season details (`GET /tv/{tmdbId}/season/{n}`), one request per season, all in PARALLEL with `Promise.allSettled` and a 2.5 s per-request timeout (bounded budget: slowest season, not the sum). Each video gains: `title` = real episode name, `thumbnail` = `https://image.tmdb.org/t/p/w300{still_path}` (only where a still exists — omitted otherwise, never a placeholder), `overview` + `released` (ISO air date) — all four fields are in the official Stremio Video object type (stremio-addon-sdk 1.6.10, docs/api/responses/meta.md). Nothing invented: no name → generic title kept; no still/overview/air date → field omitted. Video ids EXACTLY `tt...:S:E` (unchanged — streams depend on them); season 0 (Specials) enriched the same way. **Failure-proof:** a season fetch that fails/times out/throws falls back to the generic videos for that season — meta NEVER fails because of this (allSettled + try/catch). In-memory season cache, 6 h TTL (episode data is effectively static); no new Blob writes. Real names verified against TMDB before building: Preacher S4E1 "Masada" (2019-08-04), S4E2 "Last Supper", S4E3 "Deviant", S4E10 "End of the World", S1E1 "Pilot". Note: the old test fixture wrongly labelled S4E10 "Masada" (Cinemeta stub data) — the real S4E10 is "End of the World"; the fixture is stub-only and was left as-is.
- **Tests:** `tests/test-meta.js` §6 (stubbed seasons) — **123 checks, 0 failures** (was 91): enriched Preacher (61 videos, S4E1 "Masada" + w300 thumbnail + overview + released 2019-08-04, S4E2 "Last Supper", S4E3 "Deviant" with NO thumbnail when still_path is null, S4E10 "End of the World", season-0 special "A Look at the Series" enriched, S1E1 "Pilot", empty-name episode keeps generic "Episode 2", unfetched season stays generic, all ids exactly tt:S:E); fallback (season fetches 404 → generic "Episode N", meta + 61 videos intact); fallback (season fetch throws → same); movie path makes zero season calls, no videos key. Full suite: test-meta 123 PASS, test-search PASS, test-stream-format PASS, test-cam-fallback PASS, test-badges PASS. Local smoke: server :7001, /health + manifest 1.2.2.
- **Version bumps:** `app/index.js` (VERSION = '1.2.2'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — lines 3 and 9; the range-parser dependency at 1.2.1 was NOT touched), `app/lib/admin.html` (3 hardcoded strings, 0 remaining v1.2.1; the one remaining "1.2.1" in app/index.js is a historical comment about the v1.2.1 stream format, not a version string).
- **Deployment:** `dpl_kvuPBTmHBvHXYfA3CF7YsEmP4q8F` (READY; previous latest `dpl_5Jth9Qnd5RoV6VKbneBbieQ5G9fz` confirmed READY before deploying). **Live verification (production, 19 Nov 2026 — ALL CHECKS PASSED):** manifest Binge Addon 1.2.2 / 27 catalogs, id `com.bharatstreams`; /health 1.2.2; /admin 200 (64,618B, `v1.2.2` ×3, `v1.2.1` ×0); /admin/api/status without password 401; /admin/api/config without password 401; cron GET without auth 401; /badges.json 200 (23 filters); Trending Indian 20/20 + 20/20 (Ramayana: Rise of a Legend / Ali Baba Aur 40 Bhoot first). **Episode proofs (live):** Preacher tt5016504 → 61 videos, S4E1 "Masada" + thumbnail `https://image.tmdb.org/t/p/w300/kwGCiyT433ZTtpJlUJG6oF4AQPS.jpg` (HEAD **HTTP 200**), released 2019-08-04, overview "Jesse is rocked by visions…"; S4E2 "Last Supper", S4E10 "End of the World", S1E1 "Pilot", S2E1 "On the Road" — all with real stills; S0E1 "A Look at the Series" (real name, no still on TMDB → thumbnail correctly omitted); meta latency 0.72 s. Breaking Bad tt0903747 → 71 videos, S1E1 "Pilot", S1E2 "Cat's in the Bag...", S5E16 "Felina", all with stills; S1E1 thumbnail HEAD **HTTP 200**; meta 0.61 s. Mirzapur tt6473300 → 29 videos, S1E1 "JHANDU", S1E2 "GOODA", both with stills. **Regression checks:** Ramayana logo w500 + year 2026; `?search=reacher` → Reacher first; Jailer 2 streams → 40 streams, first exactly `Jailer 2 (2026)` / `Quality: 1080p HDRip` / `Audio: Hindi + English | DD+ 5.1` / `Size: 1.57 GB` — the locked v1.2.1 Telegram format, byte-identical. One verify-script slip caught during the run (not an addon bug): the first Trending check used the wrong catalog id `trending-indian` (0/0) — the real ids are `trending-indian-movie` / `trending-indian-series` (20/20 each), re-verified green.
- **Pending (needs admin password from basant/parent):** /admin/api/status with password → 200, 27 catalogs; /admin/api/config with password → 200. Not guessed, not skipped silently. On-device verdict still pending: basant must open Preacher in Nuvio and confirm episode cards now show real names + stills — proven via production curl, not from a real Nuvio client (none available here); the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Status:** Commit `8c39526`, tag + release `v1.2.2`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.2.2

## v1.2.3 SIZE-AWARE STREAM RANKING 19 Nov 2026 (basant: top stream 1080p, good quality, BEST BY SIZE — 32 GB Dangal Remux on top would eat 10 days of his 3 GB/day Jio data)

- **Basant's order (19 Nov ~11:23 IST):** the top stream must be 1080p, good quality, BEST BY SIZE. His data is precious (Jio ₹147 + ₹39 pack, 3 GB/day) and the old sort put a 32.18 GB Dangal Remux on top — one movie eating 10 days of data. He also asked which WEB type is best — the sort design answer: WEB-DL (direct download from the streaming service, original quality) > WEB-Rip (WEB-DL re-encoded smaller, slightly lower quality) > WEB screen-recording/capture (worst). Pure quality order: Remux > BluRay > WEB-DL > BDRip ≈ WEBRip > HDRip > HDTV. Size-efficiency order: WEB-DL / BDRip / encoded BluRay / HDRip (~1.5–5 GB for a ~2.5 h movie) are the sweet spot; Remux is wasteful for a phone/laptop screen.
- **Live-confirmed before building (production 1.2.2):** Dangal top = 32.18 GB 1080p Remux (Hindi + English + Russian); Jailer 2 top = 1.57 GB 1080p HDRip (Hindi + English | DD+ 5.1); 3 Idiots top = 2.51 GB 1080p BluRay (Hindi | AAC).
- **What changed (sort only — `app/lib/parse.js`, no format/search/catalog/meta/badge/admin/drop-rule change):** `compareParsed` now ranks Hindi 1080p first (unchanged), then **size class** — efficient (~1.5–5 GB sweet spot for a feature film, class 0) < large (5–12 GB) < oversized (>12 GB) < suspiciously tiny (<0.7 GB feature-length, class 3, must never outrank a normal encode) — then **quality tier** inside the class (good-encode group BluRay/WEB-DL/WEBRip/HDRip/BDRip/Remux together, HDTV a step down, no source tag last), then **smaller size first** inside the tier, then **seeders as the final tiebreak**, plus a deterministic displayTitle/infoHash tiebreak so the same set always orders the same way. Size is judged relative to runtime where a per-file duration is known (Comet rows: normalised to a 150-min feature, so a 600 MB / 41-min episode is efficient, not tiny); otherwise absolute. **Re-rank only, never drop:** a title with only a Remux still shows its Remux; a tiny-only title still shows its tiny stream. `BDRip` is now a parsed visual tag (was unrecognised) so it lands in the good-encode tier — display unchanged (the locked Telegram format never showed BDRip). The old pure-quality `ENCODE_RANK` (BluRay > WEB-DL > WEBRip > HDTV, biggest size first) is removed from the sort. `sizeClass`/`qualityTier` exported for tests.
- **Tests:** NEW `tests/test-size-ranking.js` — ALL PASS (real fixtures: Dangal corpus top 2.7 GB BluRay, Remux last; Jailer 2 145-row fixture top stays the 1.57 GB HDRip, top 5 all efficient; 3 Idiots top is the 2.49 GB BDRip — same band, sensible; Remux-only keeps its Remux; 500 MB WEB-DL never beats a 2.5 GB BluRay; 600 MB episode with duration tops, without duration falls to tiny, 600 MB with a 2h 30m duration stays tiny; Hindi-first, seeders tiebreak, unknown-size = large, determinism on reversed input, Ramayana CAM pool still camRank-first with the 6.38 GB TeleCine first). Full suite: test-meta 123 PASS, test-search ALL PASS (incl. live §4, un-gated after deploy), test-stream-format ALL PASS, test-badges ALL PASS, test-cam-fallback 47 PASS, test-size-ranking ALL PASS. `tests/test-search.js` version pin was STALE (still 1.2.1 while manifest was 1.2.2 — a pre-existing pin miss, not a regression) — pinned to 1.2.3. Local smoke (server :7023, pre-deploy): Dangal top 2 GB BluRay, Jailer 2 top 1.57 GB HDRip exact, 3 Idiots top 2.49 GB BDRip.
- **Version bumps:** `app/index.js` (VERSION = '1.2.3'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — lines 3 and 9), `app/lib/admin.html` (3 hardcoded strings, 0 remaining v1.2.2).
- **Deployment:** `dpl_AU9Dyfz7kfVupeRhUC8sZA1dyZCq` (READY, first attempt; previous latest `dpl_kvuPBTmHBvHXYfA3CF7YsEmP4q8F` confirmed READY before deploying). **Live verification (production, 19 Nov 2026, script /tmp/verify-v123b.py — ALL CHECKS PASSED):** manifest Binge Addon 1.2.3 / 27 catalogs, id `com.bharatstreams`; /health 1.2.3; /admin 200 (64,540B, `v1.2.3` ×3, `v1.2.2` ×0); /admin/api/status without password 401; /admin/api/config without password 401; cron GET without auth 401; /badges.json 200 (23 filters); Trending Indian 20/20 + 20/20 (Ramayana: Rise of a Legend / Ali Baba Aur 40 Bhoot first). **Ranking proofs (live):** Dangal tt5074352 → 40 streams, top `Dangal (2016)` / `Quality: 1080p BluRay` / `Audio: Hindi` / `Size: 2 GB` (was the 32.18 GB Remux); Jailer 2 tt33318732 → 40 streams, ZERO CAM, top exactly `Jailer 2 (2026)` / `Quality: 1080p HDRip` / `Audio: Hindi + English | DD+ 5.1` / `Size: 1.57 GB` — byte-identical locked Telegram format; 3 Idiots tt1187043 → top `3 Idiots (2009)` / `Quality: 1080p` / `Audio: Hindi + English | AAC` / `Size: 2.49 GB` (BDRip, sensible); Ramayana tt27988879 → 36 CAM streams, all Quality-line marked, first `Ramayana (2026)` / `Quality: 1080p CAM TeleCine` / `Size: 6.38 GB`, no Note line. **Regression checks:** Ramayana logo w500 + year 2026; `?search=reacher` → Reacher tt9288030 first. Two verify-script slips caught during the run (not addon bugs): Python urllib hit IncompleteRead/RemoteDisconnected through the egress proxy on /admin and /health (curl fetched the same URLs cleanly every time, 64,618B), and the curl-based script first had its rpartition operands swapped — both fixed in the script, then re-verified green.
- **Pending (needs admin password from basant/parent):** /admin/api/status with password → 200, 27 catalogs; /admin/api/config with password → 200. Not guessed, not skipped silently. On-device verdict still pending: basant must open Dangal streams in Nuvio and confirm the top stream is now a ~2 GB encode, not the 32 GB Remux — proven via production curl, not from a real Nuvio client (none available here); the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Status:** Commit `51f1a29`, tag + release `v1.2.3`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.2.3

## v1.2.4 TIER-FIRST RANKING INSIDE SIZE CLASS 19 Nov 2026 (basant, third time asking: WEB-DL must rank ABOVE WEBRip — his Pushpa 2 screenshot topped with a 2 GB WEBRip while a 2.4 GB WEB-DL sat below it, because v1.2.3 sorted by size first inside the efficient band)

- **Basant's order (19 Nov ~11:48 IST):** WEB-DL must be above WEBRip. Facts encoded (verified): pure quality order is Remux > BluRay > WEB-DL > BDRip > WEBRip > HDRip (BluRay disc source is slightly above WEB-DL; WEB-DL is best only among WEB types; WEBRip is a re-encode of a WEB-DL, ~8% softer). So the fix is TIER-FIRST inside each size class — NOT "WEB-DL literally #1 above everything" (that would wrongly put Dangal's 5.3 GB WEB-DL above its 2.01 GB BluRay).
- **Live-confirmed before building (production 1.2.3):** Pushpa 2 tt16539454 top = `Quality: 1080p WEBRip` / `Audio: Hindi | AAC` / `Size: 2 GB` (Torrentio, 2 seeders), #2/#3 = `Quality: 1080p WEB-DL` / `Audio: Hindi` / `Size: 2.4 GB` (HdHub direct links); Dangal tt5074352 top = 1080p BluRay 2 GB; /health 1.2.3.
- **What changed (sort only — `app/lib/parse.js`, no format/search/catalog/meta/badge/admin/drop-rule/duplicate/SAMPLE change):** `qualityTier` is no longer one flat good-encode group — it is now a per-source tier: Remux 0 > BluRay 1 > WEB-DL 2 > BDRip 3 > WEBRip 4 > HDRip 5 > HDTV 6 > no tag 7 (best tag wins if a row carries several). `compareParsed` order is unchanged otherwise: Hindi first, resolution, size class (efficient < large < oversized < tiny), THEN tier, then smaller size inside the tier, then seeders, then deterministic tiebreaks. Size class still dominates (a large-class WEB-DL never jumps an efficient BluRay; a 32 GB Remux stays oversized and below efficient encodes). Re-rank only, never drop.
- **Consequence to state plainly (intended, not a bug):** Jailer 2's top CHANGES from the 1.57 GB HDRip to a 2.36 GB WEB-DL (`Quality: 1080p WEB-DL` / `Audio: Hindi + English` / `Size: 2.36 GB`) — WEB-DL outranks HDRip under tier-first, which is exactly what basant asked for (WEB-DL on top). 3 Idiots' top changes from the 2.49 GB BDRip to the 2.51 GB BluRay (BluRay tier above BDRip). The §6 episode check also changed: a 600 MB WEB-DL episode no longer tops a 4 GB BluRay episode (tier-first); the runtime-normalisation proof is now the sizeClass check (episode row is class 0, not tiny). Tests updated to the new expectations in the same commit.
- **Tests:** `tests/test-size-ranking.js` extended with §9 Pushpa 2 tier-first proofs (WEB-DL 2.4 GB tops WEBRip 2 GB; BluRay 2.01 GB tops WEB-DL 2.4 GB; large-class WEB-DL 5.3 GB does NOT jump efficient BluRay 2.01 GB; WEB-DL 2.99 GB tops HDRip 1.57 GB; WEBRip-only title keeps its WEBRip) + updated §2 (Jailer 2 top now WEB-DL 2.36 GB), §3 (3 Idiots top now 2.51 GB BluRay), §6 (episode normalisation), §7 tier numbers, and `tests/test-cam-fallback.js` first-clean-stream expectation (now the 2.36 GB WEB-DL, format unchanged). Full suite ALL PASS: test-size-ranking 45 checks, test-meta 123, test-search 62, test-stream-format 198, test-cam-fallback 47, test-badges ALL PASS. 0 failures.
- **Version bumps:** `app/index.js` (VERSION = '1.2.4'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — lines 3 and 9), `app/lib/admin.html` (3 hardcoded strings, 0 remaining v1.2.3).
- **Deployment:** `dpl_HJBg5rd4kgJ4bywZMqFLTemN1Mjr` (READY, first attempt; previous latest `dpl_AU9Dyfz7kfVupeRhUC8sZA1dyZCq` confirmed READY before deploying). **Live verification (production, 19 Nov 2026, scripts /tmp/verify-v124.py + /tmp/verify-v124b.py — ALL CHECKS PASSED after fixing 3 script-side slips, no addon changes):** manifest Binge Addon 1.2.4 / 27 catalogs, id `com.bharatstreams`; /health 1.2.4; /admin 200 (`v1.2.4` ×3, `v1.2.3` ×0); /admin/api/status without password 401; /admin/api/config without password 401; cron GET without auth 401; /badges.json 200 (23 filters); Trending Indian 20/20 + 20/20. **Ranking proofs (live):** Pushpa 2 tt16539454 → 40 streams (13 http HdHub + 27 magnet Torrentio, stable across 3 consecutive runs), top `Quality: 1080p WEB-DL` / `Audio: Hindi + Telugu` / `Size: 3.17 GB` (HdHub direct link — HdHub CAN top the list; sort ignores source), 2 GB WEBRip at index 5 below ALL class-0 WEB-DLs (3.17 / 3.8 / 4.5 / 4.79 / 4.79 GB), then WEBRip 2.57–4.65 GB, HDRip 2.94 GB, large-class WEB-DL 5.1–9.82 GB, 720p from index 17; Dangal tt5074352 → top `Quality: 1080p BluRay` / `Audio: Hindi` / `Size: 2 GB` (unchanged); Jailer 2 tt33318732 → top exactly `Quality: 1080p WEB-DL` / `Audio: Hindi + English` / `Size: 2.36 GB` (locked Telegram format, only the rank changed); Ramayana tt27988879 → 36 CAM streams, all Quality-line marked, first `Quality: 1080p CAM TeleCine` / `Size: 6.38 GB`, no Note line. **Regression checks:** Ramayana logo w500 + year 2026 (year is the string '2026' in the meta payload); movie-catalog `?search=reacher` → Jack Reacher tt0790724 first (correct for movies); series-catalog `?search=reacher` → Reacher tt9288030 first. **Live-data notes (not addon bugs):** (a) the 2.4 GB WEB-DL rows from basant's 11:45 IST screenshot are GONE from HdHub's live feed now (upstream churn — those pixeldrain/hubcloud links expired/were removed), so the brief's expected "Pushpa 2 top = WEB-DL 2.4 GB" cannot be observed; the live top is the 3.17 GB WEB-DL, which still proves the rule (WEB-DL on top, WEBRip below). (b) One request mid-run returned only 27 magnet streams (HdHub timed out that once); the next 3 consecutive runs returned the full 40 — transient upstream flake, merge handles an empty source fine. (c) The first verify run's 5 "failures" were script-side: year compared as int vs string '2026', movie-vs-series search catalog mix-up, the stale 2.4 GB expectation, and a newline-vs-pipe comparison — all fixed in the script, then re-verified green.
- **Pending (needs admin password from basant/parent):** /admin/api/status with password → 200, 27 catalogs; /admin/api/config with password → 200. Not guessed, not skipped silently. On-device verdict still pending: basant must open Pushpa 2 streams in Nuvio and confirm the top is now a WEB-DL, not the 2 GB WEBRip — proven via production curl, not from a real Nuvio client (none available here); the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Status:** Commit `b27f3b4`, tag + release `v1.2.4`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.2.4

## v1.2.7 ONE SMART ADDON — DEVICE PROFILES + DASHBOARD SEQUENCE EDITOR + LINK GENERATOR 19 Nov 2026 (basant, ~13:44 IST: "Ek smart addon — device khud pehchanega", picked over 3 separate addons)

- **Basant's order:** one smart addon that recognises the device and sets quality/order accordingly; a change must apply to all profiles at once; the dashboard must let him reorder the quality sequence himself and generate a new addon link. TV profile: best quality only, 4K allowed (his words: "TV wale me only matter is best quality"). Desktop profile: exactly current v1.2.4, unchanged. **Version is 1.2.7** — this batch = 3 user-requested changes (1.2.4 + 3).
- **What changed (3 changes, one codebase, one shared config):**
  - **(1) Device detection + 3 profiles.** NEW `app/lib/device.js` — UA detection + AsyncLocalStorage request context (the v1.1.8 pattern, recovered from git history, re-applied only for profile selection — NOT for stream text). TV checked first (Android TV UAs contain "Android"): Android TV / Google TV / SmartTV / Fire TV (incl. AFT model codes) / Tizen / webOS / web0s / Netcast / Roku / AppleTV / Viera / Aquos / Bravia / Shield / HbbTV / Vizio / Vidaa / Opera TV; phone = iPhone/iPad/Android/Windows Phone/BlackBerry/Mobile; desktop = Windows/macOS/Linux or anything else; unknown/missing UA → desktop. NEW `app/lib/profiles.js` — profile data + Blob store (`profiles.json`, separate file — `config.json` untouched, shape intact; 60s cache, same pattern as `config.js`). Profile cfg drives the whole rank: `keyOrder`, `resolutionOrder`, `sizeClassOrder`, `tierOrder`, `sizeDirection`, `maxRes`. Defaults: desktop — keyOrder language > resolution > sizeClass > tier > size > seeders, resolutionOrder [1080, 1080.1, 720, 480], sizeClassOrder [0,1,2,3], tierOrder [Remux, BluRay, WEB-DL, BDRip, WEBRip, HDRip, HDTV, none], sizeDirection asc, maxRes 1080; phone — same keyOrder, resolutionOrder [720, 1080, 1080.1, 480], maxRes 1080 (1080p demoted, never dropped); TV — keyOrder language > tier > resolution > size > seeders, resolutionOrder [2160, 1080, 1080.1, 720, 480], sizeClassOrder null (off), sizeDirection desc, maxRes 2160. `normalizeProfiles` repairs bad values (tierOrder/sizeClassOrder/keyOrder must be full permutations else default; resolutionOrder = enabled subset, absent = disabled; phone/desktop maxRes clamped to ≤1080 — 2160p is TV-only). Custom profiles: `{ name, base, maxRes, keyOrder, resolutionOrder, sizeClassOrder, tierOrder, sizeDirection}` under `custom.<slug>`; `createCustomProfile` slugifies the name and disambiguates collisions (-2, -3…); `resolveProfile` returns null for unknown custom slugs.
  - **`app/lib/parse.js`:** new data-driven `compareWithProfile(a, b, cfg)` + `compareCamWithProfile` + `tierRank`/`resolutionRankFor`/`sizeClassRank`; `compareParsed` now delegates to the desktop default cfg. `processSourceStreams` accepts `opts.profileCfg` + `opts.maxRes`; drop rule is `resolution > maxRes` with 1080i counted as 1080 for the cap (1080i was kept at maxRes 1080 before and must stay kept); resolutions not in the profile's `resolutionOrder` are dropped at filter time (unknown resolution null is never dropped, ranks last). **`app/lib/sources.js`:** `mergeStreamResults(results, cap, cmps?)` accepts optional profile comparators; defaults to desktop comparators so existing callers/tests are unchanged. Sort-before-slice invariant kept for all profiles.
  - **`app/index.js`:** VERSION = '1.2.7'. Middleware before all routes: `/phone/...`, `/tv/...`, `/p/<slug>/...` prefixes force that profile and are stripped before routing (Stremio resolves addon URLs relative to the manifest URL, so an install from `/phone/manifest.json` sends every later request under `/phone/`). Stream handler resolves the profile (unknown custom slug → desktop fallback + log), applies the legacy dashboard `maxQuality` 720p knob to the DESKTOP profile only, passes `profileCfg` + `maxRes` to `fetchAllStreams`, merges with profile comparators, logs `profile=<id>`. Manifest handler: main `/manifest.json` keeps name "Binge Addon"; `/phone/manifest.json` → "Binge Addon — Phone"; `/tv/manifest.json` → "Binge Addon — TV"; `/p/<slug>/manifest.json` → custom name, unknown slug → 404. Manifest id stays `com.bharatstreams` on every profile. New admin APIs (all `requireAdmin` password-gated): `GET /admin/api/profiles`, `POST /admin/api/profiles`, `POST /admin/api/profiles/link` (returns slug, name, base, path, full URL built from request host).
  - **(2) Dashboard sequence editor.** `app/lib/admin.html` — sidebar nav + new panels `#view-profiles` (per-profile cards: maxRes select, size-direction select, tier order ↑↓, resolution order ↑↓ + enable/disable toggles, size-class order ↑↓; TV shows size classes off) and `#view-links` (built-in links + custom link generator with name input + base select + result box + custom links list); JS: `savedProfiles`/`draftProfiles` state, `isDirty()` extended, `saveSettings()` also POSTs profiles, `loadDashboard()` fetches profiles in parallel, `setupProfileListeners()` (delegated, attached once), `createLink()`, `copyText()` (clipboard + fallback), `.btn-copy` CSS added. Streams card-desc now says CAM always blocked, 4K only in TV profile.
  - **(3) Link generator.** In `/admin` `#view-links`: built-in profile links (main/phone/TV) + a generator for a new named custom profile (copies an existing profile's sequence, editable in the profiles panel). Generated links are working manifest URLs (`/p/<slug>/manifest.json`) that install in Nuvio and serve that profile.
- **Tests:** NEW `tests/test-device-profiles.js` — **ALL PASS**: §1 UA detection matrix (22 cases: Windows/macOS/Linux desktop, Stremio desktop, Android phone, iPhone, iPad, Android tablet, Stremio Android app, Android TV, Google TV, Fire TV Stick 4K, Fire TV, webOS, Tizen, SmartTV, Roku, Shield, empty/undefined/curl/bare-Stremio → desktop; forced profile wins over UA); §2 desktop == v1.2.4 `compareParsed` (same mixed list sorts identically through both + direct comparator equivalence on shuffled parsed rows); §3 phone 720p first (2160p dropped, 1080p below all 720p, 480p last; CAM pool also 720-first); §4 TV (2160p Remux 55.2 GB tops, tier > resolution desc > size DESC; 4K-off drops four 2160p rows, top = 32.18 GB 1080p Remux); §5 profiles data (normalize repairs, slugify, collision -2, resolve null for unknown slug); §6 merge sort-before-slice under phone comparator (first 30 of 40 are 720p). Full suite ALL PASS: test-device-profiles, test-stream-format, test-cam-fallback, test-size-ranking, test-badges, test-meta, test-search (pin fixed: stale 1.2.3 → 1.2.7; it was already failing at 1.2.4, pre-existing, not caused by this build).
- **Version bumps:** `app/index.js` (VERSION = '1.2.7'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only), `app/lib/admin.html` (3 hardcoded strings, verified ×3, 0 remaining v1.2.4).
- **Deployment:** `dpl_GU7jgYepwjJXVXMkE2eTcg9HthF6` (READY; Vercel token verified HTTP 200 on `/v9/projects` first; deployed via `deploy-binge.py`, REST token route). **Live verification (production, 19 Nov 2026, scripts `/tmp/verify-v127.py` + `/tmp/verify-v127-sort.py` — ALL CHECKS PASSED after fixing script-side expectations, no addon changes):** /health 1.2.7; main manifest Binge Addon 1.2.7 / 27 catalogs, id `com.bharatstreams`; `/phone/manifest.json` "Binge Addon — Phone"; `/tv/manifest.json` "Binge Addon — TV"; `/p/nope/manifest.json` → 404; /admin 200, 82,374B, `v1.2.7` ×7, `v1.2.4` ×0, contains Device profiles + Install links panels; `GET /admin/api/profiles` without password → 401; `POST /admin/api/profiles/link` without password → 401; `GET /admin/api/config` without password → 401. **Desktop proofs (live):** Dangal tt5074352 → 40 streams, top `Quality: 1080p BluRay` / `Audio: Hindi` / `Size: 2 GB` (top 6 zero 2160p); Pushpa 2 tt16539454 → top `Quality: 1080p WEB-DL` / `Audio: Hindi + Telugu` / `Size: 3.17 GB` (first verify run, HdHub answering — see HdHub note below); Ramayana tt27988879 → 36–40 CAM streams depending on HdHub, first `Quality: 1080p CAM TeleCine` / `Size: 6.38 GB`, all CAM-marked. **Phone proofs (live):** phone UA Dangal → top `Quality: 720p BluRay` / `Audio: Hindi | DD 5.1` / `Size: 1.06 GB`, top 6 zero 2160p, within Hindi rows every 720p above every 1080p; `/phone/` prefix Dangal → top 720p BluRay 1.06 GB. **TV proofs (live):** TV UA Dune tt1160419 → top `Quality: 2160p BluRay Dolby Vision HDR` / `Audio: Hindi + English + French + German + Japanese + Spanish | Atmos` / `Size: 86.41 GB`, #3 2160p Remux 73.69 GB; `/tv/` prefix Dangal → top `Quality: 1080p Remux` / `Audio: Hindi + English + Russian` / `Size: 32.18 GB` (NOT the 2 GB efficient BluRay), then 16.76 GB / 7.78 GB / 7.64 GB BluRays (size desc within tier). **Byte-identical sort proofs (live vs local, same raw Torrentio inputs):** desktop Dangal live order == local `compareParsed` order 40/40; phone Dangal live order == local phone comparator order 40/40 — this is the rigorous check that replaced the naive sort-property script (see note (c) below).
- **Live-data notes (not addon bugs):** (a) **HdHub was DOWN during the later verify runs** — direct probe to the HdHub stream endpoint returned 000 (connection failure after 10 s). While down, Pushpa 2 returns only Torrentio's 27 rows (top correctly the 2 GB WEBRip — best efficient tier Torrentio has) and Ramayana returns 36 CAM (Torrentio-only count). The first verify run, while HdHub still answered, showed Pushpa 2 top = 3.17 GB WEB-DL and Ramayana = 40 CAM (the cap). Both states are correct given the inputs at that moment; HdHub flake is the known upstream behaviour (same as v1.2.4 note (b)). (b) Ramayana's count is 36 (HdHub down) to 40 (HdHub up, cap) — the brief's "36 CAM" was the Torrentio-only figure from 18 Nov; the raw Torrentio CAM rows are now 41 (was 43 on 18 Nov, upstream churn). (c) Three verify-script slips caught during the run (not addon bugs): the first script's Ramayana expectation was a stale fixed 36; the phone-order check ignored language ranks (language outranks resolution, so unknown-language 720p rows correctly sit below English 1080p rows — the fixed check is language-aware); the sort-property checker ignored resolution boundaries and duration normalisation — replaced by the byte-identical live-vs-local comparator diff, which is the stronger proof.
- **Honest gaps — NOT live-tested with the password (coordinator does not know it, never guessed):** the dashboard profile editor and link generator WRITE paths (`POST /admin/api/profiles`, `POST /admin/api/profiles/link` with the password) and the "new order appears in a stream fetch within ~2 min" end-to-end flow. Verified instead: routes mounted + gated (401 without password on production), code-level tests for normalize/resolve/slug/link-creation logic, and the built-in profile links (`/phone/manifest.json`, `/tv/manifest.json`) live. A profiles.json change is picked up within the 60s server cache. Auto-detection is best-effort (Stremio/Nuvio UAs vary; unknown UA → desktop); the profile links are the deterministic path. On-device verdicts pending: basant must install/refresh the phone + TV profile links in Nuvio and confirm 720p-first on phone and 4K on TV — proven via production curl with phone/TV UAs and `/phone/` + `/tv/` prefixes, not from a real Nuvio client (none available here); the addon updates on manifest refresh, no reinstall needed for the main install (id unchanged); the phone/TV links are NEW installs.
- **Install links (all same id `com.bharatstreams`):** main/desktop — https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json · phone — https://binge-addon-httpbasant2-9067s-projects.vercel.app/phone/manifest.json · TV — https://binge-addon-httpbasant2-9067s-projects.vercel.app/tv/manifest.json
- **Status:** Commit `644d774`, tag + release `v1.2.7`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.2.7

## v1.2.8 BLOB DIRECT-URL READS 19 Nov 2026 (Vercel alert: Blob Advanced Requests 75% used — 1,500/2,000, only 500 left, one day after the store was created; basant's tap: "Haan, v1.2.5 banao" — version is 1.2.8 because v1.2.7 landed after the fix was proposed)

- **The problem:** every catalog read did a Blob list() — 27 list calls per full catalog load on a cold serverless instance, plus one per id-map, config, profiles and _summary read. At 100% on Hobby there is no bill and no way to buy more: Blob access blocks until the ~30-day window resets (most likely ~18 Dec) unless upgraded to Pro ($20/month — not wanted). If blocked, catalog rows stop serving and Nuvio rows go empty; meta for catalog titles degrades too (id-map in Blob). Streams themselves don't use Blob.
- **What changed (reads only — `app/lib/blob.js` NEW, no sort/format/catalog/stream change):** every Blob JSON file is now read by its DIRECT PUBLIC URL (`https://<store-host>.public.blob.vercel-storage.com/<pathname>`) — a SIMPLE Blob request that does not burn the Advanced Requests allowance. The rebuild already writes with `addRandomSuffix: false`, so every file URL is deterministic. **Store host VERIFIED live before building:** `https://drqjSj6Uy2iBuItV.public.blob.vercel-storage.com/catalogs/trending-indian-movie.json` returned HTTP 200 with the real row (20 metas, builtAt 2026-11-19T05:23:49Z). The host is the store id (`store_drqjSj6Uy2iBuItV`) minus the `store_` prefix — the full id as subdomain 400s ("Store ID not found"). **Safety net (brief requirement):** if a direct read ever misses, the code falls back to the verbatim pre-1.2.8 list() path — a wrong direct assumption can never break reads. Host-level direct failures (400/403/5xx/network) are remembered per instance; a 404 is NOT remembered (usually the file genuinely doesn't exist yet). Host derivation order: `BLOB_PUBLIC_BASE_URL` env override → parse from the runtime read-write token (`vercel_blob_rw_store_<host>_<secret>`, best-effort — the Vercel API only returns the ENCRYPTED env value, so this parse cannot be verified from outside the runtime) → verified hardcoded host. Reads no longer need `BLOB_READ_WRITE_TOKEN` on the direct path.
- **Converted readers:** catalog rows + id-map (`lib/store.js`), config (`lib/config.js`), profiles (`lib/profiles.js`), builder id-map (`scripts/build-catalogs.js`), admin status summary + fallback (`index.js` — the old prefix-list fallback now reads rows directly via the store's 5-min cache). Exactly ONE list() call remains in the hot path: the fallback inside `lib/blob.js` (enforced by `tests/test-blob-direct.js` §5).
- **Remaining burn:** ~29 puts/day (daily rebuild: 27 rows + idmap + summary) plus rare lists. **Headroom estimate (honest, unmeasured — the exact number is only on the Vercel usage dashboard, and checking it costs Advanced Requests, so it was NOT checked):** 500 left at the 11:15 IST alert. Post-alert burn was small — the v1.2.7 verification scripts (checked: `/tmp/verify-v127.py`, `/tmp/verify-v127-sort.py`) fetched ZERO catalog endpoints; they were manifests + admin + stream fetches, i.e. only config/profiles lists on cold instances (~10–30 lists), and this version's own verification used zero lists (direct reads) — so roughly 460–490 remain. At ~29 puts/day that lasts ~16 days, to ~5 Dec. Whether that reaches the reset depends on the reset date, which is UNVERIFIED: ~18 Dec if the window is 30 days from first use (store created 18 Nov), or 1 Dec if Vercel's cycle is calendar-month. If the reset is 1 Dec, we're fine (29/day × 12 days ≈ 350 < 460); if 18 Dec, the allowance exhausts ~5 Dec and catalog serving blocks until the earliest ops age out (~18 Dec). If the 100% alert fires, the only remedies are Pro ($20/month) or waiting out the window — flag it then, don't pre-pay. One mitigation available without Pro: rebuild every other day halves puts to ~15/day — needs basant's call, not done here. The fix's value is that it stops the per-load burn, which was the dominant term; the rebuild puts alone are the floor and cannot be cut without changing the daily rebuild.
- **Tests:** NEW `tests/test-blob-direct.js` — ALL PASS (22 checks: host derivation incl. encrypted-token → null, live direct read of a real row, missing-file → null, broken-host + fake-token fallback degrades to null with the SDK's "This store does not exist" caught, zero list() calls outside the fallback). Full suite ALL PASS: test-device-profiles, test-stream-format, test-cam-fallback, test-size-ranking, test-badges, test-meta, test-search (live search checks SKIP — production was still 1.2.7 at run time; pin updated to 1.2.8). Local smoke (server :7023, NO Blob token set — direct reads work without it): health 1.2.8, manifest Binge Addon 1.2.8 / 27 catalogs, phone + TV manifests, trending movie 20/20 (Ramayana first), trending series 20/20 (Ali Baba first), unknown slug 404.
- **Version bumps:** `app/index.js` (VERSION = '1.2.8'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — lines 3 and 9), `app/lib/admin.html` (3 display strings; the 4 remaining `v1.2.7` matches are historical JS comments, not display strings). `tests/test-search.js` version pin 1.2.7 → 1.2.8.
- **Deployment:** `dpl_6bH4cVxaVzAe6SYwABSiMQ5pErog` (READY, first attempt; previous latest `dpl_GU7jgYepwjJXVXMkE2eTcg9HthF6` confirmed READY before deploying; deployed via `deploy-binge.py`, REST token route). **Live verification (production, 19 Nov 2026, scripts `/tmp/verify-v128.py` + curl — ALL CHECKS PASSED after fixing script-side issues, no addon changes):** /health 1.2.8; main manifest Binge Addon 1.2.8 / 27 catalogs, id `com.bharatstreams`; `/phone/manifest.json` "Binge Addon — Phone"; `/tv/manifest.json` "Binge Addon — TV"; `/p/nope/manifest.json` → 404; trending-indian-movie 20/20 (Ramayana first); trending-indian-series 20/20 (Ali Baba first); meta Jailer 2 (id-map direct read, year 2026); /admin 200 (82,374B, `v1.2.8` ×3, no stale display strings); `GET /admin/api/status`, `/admin/api/config`, `/admin/api/profiles` without password → 401; /badges.json 200. **Deliberately NOT verified (per brief, to save Advanced Requests):** no full 27-catalog sweep; today's 10:30 IST rebuild outcome left unverified beyond the two trending rows (which carry today's builtAt). Two verify-script slips caught during the run (not addon bugs): Python urllib hit a non-JSON/empty response through the egress proxy on /phone/manifest.json (curl fetched it cleanly), and the first script's "zero v1.2.7" admin check counted the 4 historical JS comments — corrected to check display strings only.
- **Honest gaps — NOT live-tested with the password (coordinator does not know it, never guessed):** /admin/api/status with password → 200, 27 catalogs (would also exercise the summary direct read + the new fallback branch end-to-end). Verified instead: summary read via readBlobJson in code + the fallback branch unit-covered by test-blob-direct §4's degrade-to-null path. On-device verdict pending: basant must confirm rows still load in Nuvio after the fix — proven via production curl (direct-URL reads serving), not from a real Nuvio client (none available here); the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Install links (unchanged, all same id `com.bharatstreams`):** main/desktop — https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json · phone — https://binge-addon-httpbasant2-9067s-projects.vercel.app/phone/manifest.json · TV — https://binge-addon-httpbasant2-9067s-projects.vercel.app/tv/manifest.json
- **Status:** Commit `9327b14`, tag + release `v1.2.8`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.2.8

## v1.2.9 SINGLE-BUNDLE BLOB WRITES 19 Nov 2026 (basant's tap: "Ha fix karo best tarika se" — permanent fix for the Blob Advanced Requests alert)

- **Step 1 — verified before designing (from Vercel's OWN docs, fetched live 19 Nov 2026, vercel.com/docs/vercel-blob/usage-and-pricing, last updated 2026-09-23):** "Simple Operations: counts when a blob is accessed by its URL and it's a cache MISS, or when you retrieve blob metadata" (Hobby: first 10,000); "Advanced Operations: counts when you upload, copy, or list blobs, when you set a TTL on a blob, and when you create a Blob store" (Hobby: first 2,000); "Cache HITs do not count as Simple Operations"; each blob URL access also counts as one CDN Request (Hobby 1,000,000/month — irrelevant at personal scale); on Hobby "you will not pay for any additional usage. However, you will not be able to access Vercel Blob if limits are exceeded... you will have to wait until 30 days have passed". So a plain GET of a public Blob URL is SIMPLE (free on cache hit), NOT Advanced — v1.2.8's assumption was right, and reads already cost 0 Advanced. The only Advanced burn left was the WRITES: ~29 puts/day.
- **Step 2 — candidates evaluated honestly, winner picked on merit:** (a) static files + git auto-deploy — REJECTED: the Vercel project has `link: null` (verified via REST API `GET /v9/projects/prj_oKm4isKC8VkBBT8kbLkpC2oqFXMq`), i.e. NO git integration; it would need basant's dashboard action + a GitHub token in Vercel env vars for the cron to commit + a deploy every day + repo churn. (b) GitHub + jsDelivr — REJECTED: same commit-token problem, plus jsDelivr edge-cache staleness on branch files and a second external dependency in the read path. (c) diff-only per-row writes — REJECTED as the whole fix: ~10–15 puts/day is better but not near-zero. (e) WINNER — single-bundle put: the rebuild writes ONE file, `catalogs/_bundle.json` = `{ version, builtAt, hash, rows, idmap, summary }`, ~260KB (27 rows ≈ 216KB + idmap 37KB for 1,409 entries + summary). Steady state = 1 put/day (~30/month = 1.5% of the 2,000 allowance), which can never exhaust it on its own — that is the permanent part. Plus a hash-skip: when the bundle content is identical to yesterday's, the put is skipped (0 that day). No new service, no credential, no git, no deploy, no CDN semantics, daily freshness preserved.
- **What changed (write side only in behaviour — `app/lib/bundle.js` NEW; readers keep their exact public interface):** `scripts/build-catalogs.js` — `writeRowsToBlob` (27 puts) + the separate `_summary.json` put are replaced by `writeBundle` (one put, or zero on hash match); one shared `builtAt` for the whole run so identical content hashes identically; `readIdMap` now reads the idmap from the bundle with the legacy `_idmap.json` as fallback. `lib/store.js` — `readCatalogFile` tries the bundle first, then the frozen legacy per-row file; `readIdMap` tries the bundle idmap first, then legacy `_idmap.json`. `index.js` — admin status summary now reads the bundle's embedded summary first, then legacy `_summary.json`, then the per-row fallback (unchanged). The legacy per-row files are NO LONGER WRITTEN but stay in Blob as a frozen safety net (~500KB of the 1GB storage allowance) — a missing/wrong bundle can never break reads; it serves yesterday's rows, exactly as a failed rebuild does today. Hash covers ONLY rows + idmap (builtAt/summary are timestamps by construction — including them would make the skip never fire).
- **Tests:** NEW `tests/test-bundle.js` — ALL PASS (22 checks: hash stability incl. same-content-different-builtAt → same hash, one changed meta → different hash, skip-put true/false/no-prev/no-hash; bundle-first reads via a local fixture Blob host with NO token — row from bundle, row missing from bundle → legacy file, idmap from bundle not legacy; bundle missing → legacy files still serve; row in neither → null, no throw; dead host → null, no hang; zero list() in lib/bundle.js). `tests/test-blob-direct.js` §5 extended to include lib/bundle.js — still exactly ONE list() in the hot path (the blob.js fallback). Full suite ALL PASS (9 files): test-blob-direct, test-bundle, test-device-profiles, test-stream-format, test-cam-fallback, test-size-ranking, test-badges, test-meta, test-search (one failure found and fixed during the run: the version pin `1.2.8` → `1.2.9` in test-search.js — the same pin the v1.2.8 run updated; not an addon bug). Local smoke (server :7024, live Blob, bundle not yet written — exercises the legacy fallback path): health 1.2.9, manifest 1.2.9 / 27 catalogs, phone + TV manifests 27 each, trending movie 20/20 (Ramayana first), trending series 20/20 (Ali Baba first), unknown slug 404.
- **Version bumps:** `app/index.js` (VERSION = '1.2.9'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — lines 3 and 9; the `minimist` dependency at 1.2.8 was NOT touched).
- **Deployment:** `dpl_GUvdDpiA6xL1DrDmXhJ6aTuCzKX1` (READY, first attempt; deployed via `deploy-binge.py`, REST token route). **Live verification (production, 19 Nov 2026, curl — bundle NOT yet written, so this proves the legacy-fallback path):** /health 1.2.9; main manifest Binge Addon 1.2.9 / 27 catalogs, id `com.bharatstreams`; `/phone/manifest.json` "Binge Addon — Phone" 27; `/tv/manifest.json` "Binge Addon — TV" 27; trending-indian-movie 20/20 (Ramayana first); trending-indian-series 20/20 (Ali Baba first); meta Jailer 2 tt33318732 (name Jailer 2, year 2026 — exercises the idmap path; note: an earlier probe with a guessed id tt34323935 returned `{"meta":null}` — wrong id, not an addon bug); /admin 200; direct bundle URL → 404 as expected (no rebuild has run since deploy). **New Blob burn from today:** ~1 put/day + 0 read burn. The already-burned ~1,500 ops age out ~18–19 Dec (rolling 30-day window per Vercel docs); at 1/day the total stays ≈1,520, far under 2,000 — the ~5 Dec exhaustion risk is gone in either reset reading.
- **Honest gaps — UPDATED 19 Nov ~14:53 IST (v1.2.9 now fully finished):** the bundle EXISTS and the bundle READ path is proven live — manual rebuild triggered 19 Nov 14:51 IST (HTTP 200, 27 rows), bundle builtAt 2026-11-19T09:21:56Z, 27 rows, 1,415 idmap entries; /admin/api/status 200, version 1.2.9, lastBuiltAt matches, so production code reads the bundle live. Admin password was reset 19 Nov (old value dead, 401 — removed from this doc; current value stored nowhere, given to basant in chat). CRON_SECRET remains unrecoverable (rotated, stored nowhere), so `/api/cron/rebuild` cannot be triggered manually. On-device verdict pending: basant must confirm rows still load in Nuvio — proven via production curl, not a real Nuvio client; the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Install links (unchanged, all same id `com.bharatstreams`):** main/desktop — https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json · phone — https://binge-addon-httpbasant2-9067s-projects.vercel.app/phone/manifest.json · TV — https://binge-addon-httpbasant2-9067s-projects.vercel.app/tv/manifest.json
- **Status:** Commit `746ff5c`, tag + release `v1.2.9`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.2.9

## v1.3.1 NEW RELEASES — INDIA + WORLDWIDE + SOUTH INDIAN BLOCKBUSTERS REMOVED 19 Nov 2026 (basant's orders: ~15:52 IST "Trending in India ke niche karo — new release, jo bhi badiya movies ho jo launch hui hai recently, India + worldwide, movies and web series dono count hogi" + ~15:54 IST "South Indian Blockbusters" hatao)
- **Version v1.3.1** (1.2.9 + 2 user-requested changes, carry at 10). Catalog-only change — device profiles / stream sort untouched.
- **What changed — new rows:** TWO new catalogs, `new-releases-movie` + `new-releases-series`, both named "New Releases — India + Worldwide", placed in the manifest directly under the two "Trending in India" rows (per-type order: movie row under Trending in India — movie, series row under Trending in India — series; the manifest array interleaves types, so the series row is index 4 overall, right after global-trending-movie). Builder (`scripts/build-catalogs.js`, new `collectNewReleases` logic inside `buildRows` right after the Trending Indian top-up): titles released in the last 45 days from build date (TMDB `primary_release_date` / `first_air_date`), India + worldwide mixed, sorted newest-first, cap 20/row. Two passes per type — Indian pass (`with_origin_country: 'IN'`, reserved target 10) then worldwide pass (skips Indian-origin titles), merged by release date desc. Movie side resolves IMDb via `resolveImdb`; series side via `seriesMeta` (v1.4 TV-show filter applies). Stats recorded per type in `stats.newReleases` and returned by the rebuild (`total`, `indian`, `worldwide`, `newest`, `oldest`, `windowDays`). New knob in `lib/config.js` defaults: `'new-releases': { windowDays: 45, voteFloor: 6.5, voteCountFloor: 100, voteCountFloorIndian: 10, voteCountFloorSeries: 25 }` — toggleable/reorderable from /admin like other rows (knob label added to `admin.html` KNOB_LABELS).
- **Quality floor — SPLIT, with live evidence for each split (not guessed):** vote_average >= 6.5 everywhere ("badiya"). vote_count floor is split by pool: worldwide movies 100, worldwide series 25, Indian 10. First v1.3.1 rebuild (all floors 100): movie 18/20 with indian 0, series 8/20 with indian 0 — the 100 floor emptied the Indian pool (Ramayana 57 votes, Jailer 2 40 on 18 Nov 2026 — Indian titles on TMDB have very few votes; theatres-row precedent v2.0.1: floor 10 for Indian titles). Indian floor lowered to 10 → second rebuild: movie 20/20 (indian 4), series still 8/20 (indian 0) — the worldwide series pool at 100 was only 8 (new series accumulate TMDB votes slower than movies). Worldwide series floor lowered to 25 → third rebuild: series 19/20 (indian 0, worldwide 19). Movie worldwide floor stayed 100 (row fills 20/20 there).
- **What changed — South removal:** `south-blockbusters-movie` deleted from the manifest (`lib/manifest.js`, incl. the "South Blockbusters" mention in the description), from the builder (constants `SOUTH_YEARS`/`SOUTH_MIN_VOTE`, knob reads, and the #11 builder block), from the config knob defaults, and from `admin.html` KNOB_LABELS. The stored Blob `config.json` needs no migration — `normalizeConfig` drops stored entries whose id is not in the defaults, so the stale south catalog/knob entries vanish on read. **Legacy-prune hole found live:** the catalog endpoint falls back to the frozen legacy per-row Blob file when the bundle lacks a row, so `/catalog/movie/south-blockbusters-movie.json` still returned the stale 20-item South row (Jailer 2 first) even after the manifest/builder removal. Fix: the rebuild now prunes legacy files for removed rows (`REMOVED_LEGACY_ROWS = ['south-blockbusters-movie']` in the builder; HEAD first — a SIMPLE request — then `del` only when the file exists, so quiet days cost 0 Advanced requests; errors swallowed, never a rebuild failure; runs even on a hash-skipped put). Third rebuild response: `prunedLegacy: ['south-blockbusters-movie']` — the endpoint now returns empty metas.
- **Tests:** NEW `tests/test-new-releases.js` — ALL PASS (manifest position 28 catalogs + south gone; movie row 20/20 with the 10/10 Indian/worldwide split, newest/oldest dates, no-imdb/out-of-window/below-floor exclusions, `isIndianTitle` cases; series row 20/20 with the TV filter traps; thin-Indian-pool fill; split-floor cases: Indian vc 50 passes the Indian floor 10, worldwide vc 50 fails the movie floor 100, worldwide series vc 30 passes the series floor 25, vc 20 fails it). Full suite ALL PASS (10 files): test-new-releases, test-search (pins updated to 1.3.1 / 28 catalogs; live gate skipped until deploy), test-blob-direct, test-bundle, test-device-profiles, test-stream-format, test-cam-fallback, test-size-ranking, test-badges, test-meta. `buildRows` + `isIndianTitle` are now exported from the builder for tests.
- **Version bumps:** `app/index.js` (VERSION = '1.3.1'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — lines 3 and 9), `app/lib/admin.html` (3 hardcoded strings v1.2.8 → v1.3.1: lines 882, 903, 976).
- **Deployments (same version, three deploys — fixes landed before release, so no version was consumed):** `dpl_2BhvAu2gJGu4yFTx3P15M1f3syt1` (READY; first rebuild exposed the Indian-pool floor problem), `dpl_HMbL8zLMKxEvTbYxyJgGAtdadM6e` (READY; Indian floor 10 — exposed the series-pool floor problem + the south legacy-fallback hole), `dpl_4SkYr5LUiczRsZHohs2EmhiRnbnP` (READY, current). All via `deploy-binge.py`, REST token route. Rebuilds triggered via the admin API (`POST /api/admin/rebuild`, `X-Admin-Password` from the main-chat record — transient use only, value stored nowhere) so the rows populated the same day, not at tomorrow's 10:30 IST cron. CRON_SECRET still unrecoverable (rotated, stored nowhere), so `/api/cron/rebuild` cannot be triggered manually.
- **Live verification (production, 19 Nov 2026, curl):** /health 1.3.1; main manifest 1.3.1 / 28 catalogs, id `com.bharatstreams`; `/phone/manifest.json` 1.3.1 / 28; `/tv/manifest.json` 1.3.1 / 28. New rows: movie 20/20 live (Indian 4 — Scene, Ramayana: Rise of a Legend, Jailer 2, Reporting Live — + worldwide 16; newest 2026-11-11, oldest 2026-10-07, all within the 45-day window), series 19/20 live (Indian 0, worldwide 19; newest 2026-11-11, oldest 2026-10-07). South endpoint returns empty metas after the prune. Spot-check: trending-indian-movie 20/20 (Ramayana: Rise of a Legend first, Jailer 2 second).
- **Honest gaps:** series row is 19/20, not 20/20 — the worldwide series pool at the 25 floor has 19 qualifying series in the 45-day window (the 20th slot stays empty rather than admitting a below-floor title). Series Indian count is 0 — no Indian series premiered in the 45-day window meeting vote_average >= 6.5 + vote_count >= 10: the floor was lowered 100 → 10 and the count stayed 0, so the pool (not the floor) is empty; the daily 10:30 IST rebuild picks up Indian series premieres as their votes accumulate. On-device verdict pending: basant must confirm the new rows in Nuvio — proven via production curl, not a real Nuvio client; the addon updates on manifest refresh, no reinstall needed (id unchanged).
- **Install links (unchanged, all same id `com.bharatstreams`):** main/desktop — https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json · phone — https://binge-addon-httpbasant2-9067s-projects.vercel.app/phone/manifest.json · TV — https://binge-addon-httpbasant2-9067s-projects.vercel.app/tv/manifest.json
- **Status:** Commit `3d48b4c`, tag + release `v1.3.1`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.3.1

## v1.3.3 RELEASING NEXT 30 DAYS — RETURNING SEASONS + INDIAN BIG DROPS 19 Nov 2026 (basant's approval ~16:03 IST: "Haan, dono rows fix kar do")
- **Version v1.3.3** (1.3.1 + 2 user-requested changes). Catalog-only change — device profiles / stream sort untouched. Both rows stay toggleable/reorderable in /admin (config.json shape untouched).
- **Change 1 — series row includes RETURNING seasons (`releasing-next-30-days-series`):** root cause (code-verified): the row filtered TMDB discover by `first_air_date` in [today, +30 days], so a returning season — whose `first_air_date` is its ORIGINAL premiere — could never match. Proof case: Dhindora Season 2 premieres on Netflix 20 Nov 2026 (8 episodes, trailer 13 Nov 2026), first aired 14 Oct 2021 — absent from the live row. Fix (builder `scripts/build-catalogs.js`, #6 series branch): the row is now two passes — (A) new premieres (unchanged `first_air_date` discover, target 10) + (B) returning seasons, merged by air date ASC (soonest first) and deduped. The returning detail check accepts a season premiering in the window as EITHER a next episode that is a season premiere (`next_episode_to_air` with `episode_number === 1` in window) OR any season (number >= 1) whose `air_date` is in the window — season 0 (Specials) excluded, TMDB data only, never invented. **Build history (same version, fixes before release consumed no version):** build 1 used the #9 approach (`with_status=0` + `next_episode_to_air` + `status === 'Returning Series'`) and Dhindora still missed — live-proved the gap is TMDB's show-level data: Dhindora's S2 episodes carry air_date 2026-11-20 (proven via the live meta endpoint `/meta/series/tt14650074.json`, 16 videos S1 8 + S2 8) yet the #9 "Returning Soon" row itself lacks Dhindora, so its status/next_episode_to_air never flipped from S1's 'Ended'. Build 2 dropped `with_status` globally and REGRESSED to 0 returning — the unfiltered discover pool (every show with an episode in the window: soaps, weekly shows) drowned the signal beyond page 5. Build 3 (final) splits the returning pass in two: **B1** global returning (`with_status=0` + `air_date` window, 3 pages — proven: found 10 in build 1) with the relaxed detail check, plus **B2** Indian stale-status (`with_origin_country=IN` + `air_date` window, NO status filter, 5 pages — the unfiltered scan is scoped to Indian titles only, where Dhindora lives), deduped against each other and the premieres; combined returning target is the slots the premiere pass left. Stats in `stats.releasingNext30.series` (`total`, `premieres`, `returning`, `windowDays`).
- **Change 2 — movie row reserves half for Indian titles (`releasing-next-30-days-movie`):** root cause: the old row sorted the whole in-window pool by global popularity, so only 2/20 Indian titles survived (O.M: Operation Mole, Yeh Prem Mol Liya — verified 19 Nov ~16:02 IST). Fix: same 10/10 split as v1.3.1 — Indian pass (`with_origin_country: 'IN'`, target 10) then worldwide pass (skips Indian-origin titles via `isIndianTitle`), merged by release date desc, no vote floors. **Selection evolved across three builds, each proven live:** build 1 sorted both passes by `primary_release_date.desc` — the 10 Indian slots filled from the LATEST dates and the nearest big drops vanished (O.M + Yeh Prem Mol Liya were in the old popularity-sorted row and disappeared). Build 2 sorted both passes by `popularity.desc` — O.M / Yeh Prem / Bokshi / Kaali Kheti came back, but Pratap + Eetha were STILL out even though live addon search proves both have IMDb ids on TMDB (Pratap tt28023987, Eetha tt38840418) — TMDB popularity is an unreliable proxy for Indian hype. Build 3 (final): the **Indian pass selects by IMMINENCE** (`primary_release_date.asc` — the 10 nearest Indian releases), the **worldwide pass keeps `popularity.desc`** (global TMDB popularity IS a good proxy for big worldwide titles — Avengers: Doomsday, Dune: Part Three stay). Stats in `stats.releasingNext30.movie` (`total`, `indian`, `worldwide`, `windowDays`). King (SRK, 24 Dec 2026) is outside the 30-day window and is never forced in (test asserts it).
- **Tests:** NEW `tests/test-releasing-next-30.js` — ALL PASS (manifest 28; movie 20/20 10/10, King +35d excluded, no-imdb/out-of-window excluded, early+obscure Indian title IN and late+popular OUT proving date-asc selection; series 18 = 10 premieres + 8 returning incl. a stale-status Indian returning title caught by B2, date-asc merge, TV-filter traps excluded; thin-premiere fill 3+8). Full suite ALL PASS (11 files): test-releasing-next-30, test-new-releases, test-search (pins updated to 1.3.3 / 28 catalogs), test-blob-direct, test-bundle, test-device-profiles, test-stream-format, test-cam-fallback, test-size-ranking, test-badges, test-meta.
- **Version bumps:** `app/index.js` (VERSION = '1.3.3'), `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json` (version fields only — lines 3 and 9, NOT line 401 `finalhandler ~1.3.1`), `app/lib/admin.html` (3 hardcoded strings v1.3.1 → v1.3.3).
- **Deployments (same version, three deploys — fixes landed before release, so no version was consumed):** `dpl_G1y3eTYMxD6WuQW1souzGJRGEqiF` (READY; build 1 — date-desc selection failure), `dpl_HZnsnZ3v9HsEfPDhroiCGsKaQJJy` (READY; build 2 — popularity selection + series regression), `dpl_HE4fipkhg8F4N2HUTrCC5UPasGiz` (READY, current; build 3). All via the REST token route (`/tmp/deploy-v133.py`, 47 files inlined — the repo's own deploy script was NOT used after a tool result reading it was flagged by a security notice; deployed via direct REST calls per the connector doc instead). Rebuilds triggered via the admin API (`POST /api/admin/rebuild`, `X-Admin-Password` from the main-chat record — transient use only, value stored nowhere) so the rows populated the same day. **Operational lessons:** (a) the rebuild helper reads the password from stdin — the first rebuild-3 attempt was run with NO stdin and blocked ~10 min on `sys.stdin.read()` without ever firing (killed; re-ran with the password piped via stdin); always pipe it. (b) The bundle read cache is 5 min (`app/lib/bundle.js` CACHE_TTL_MS) — live catalog rows lag a rebuild by up to 5 min; verify only after waiting it out.
- **Rebuilds (admin API, HTTP 200):** rebuild 1 — movie 20 (indian 10, worldwide 10), series 20 (premieres 10, returning 10), bundleHash `30b3f20d…`; rebuild 2 — movie 20 (10/10), series 10 (premieres 10, returning 0), bundleSkipped false; rebuild 3 — movie 20 (indian 10, worldwide 10), series 17 (premieres 10, returning 7), bundleHash `757ba6abb7362ab7ddaaa78fccc6e920a74acd1d24b6b71e27835de3fa0de68a`, `excludedNoImdb` 84, `excludedTvShow` 196. Note: build 3's returning count is 7, not 10 — the season-premiere check is stricter than build 1's (which also counted mid-season weekly episodes); the 7 are true season premieres.
- **Live verification (production, 19 Nov 2026, curl, after the 5-min bundle cache expired):** /health 1.3.3; main manifest 1.3.3 / 28 catalogs, id `com.bharatstreams`. **Series row 17/20 — DHINDORA IS IN** (`Dhindora | 2021 | tt14650074`, #4): premieres 10 (Çiçekçi Kiz, The Altruists, The Blue Road, Dig, Blade Runner 2099, Fool Night, The Grim Lover, Pride and Prejudice, Tantara, Frisco King) + returning 7 (Dhindora, Sathyameva, Dhai Chaal, Panchayat, O Saathi Re, Black Warrant, Call Me Bae). **Movie row 20/20, Indian 10 — PRATAP IS IN** (`Pratap | 2026 | tt28023987`, #11): Indian 10 incl. Pratap, Kaali Kheti (#15), O.M: Operation Mole (#19), Maarige Daari, Brindavihari, Shankarabharana, Appa Kutty, Nazarbandi + 2 more; worldwide 10 incl. Avengers: Doomsday (#1), Dune: Part Three (#2). #9 "Returning Soon" row unchanged at 12 (MobLand, Tulsa King, The Chosen, Dexter: Resurrection, Rings of Power…) and still lacks Dhindora — consistent with the TMDB stale-status diagnosis, not an addon bug.
- **Honest gaps — movie row (which named titles are still out, and why):** the Indian pass takes the **10 nearest** Indian releases, so the row is a rolling window — a title enters ~7–10 days before its release as earlier titles drop out of the window, and appears on its release eve (Pratap, 20 Nov, is in today). Still absent: **Suryaa** — TMDB entry exists but carries NO release date (live search shows empty releaseInfo), so the date filter excludes it: TMDB data gap. **Maatrubhumi** — TMDB date reads 2026-11-04, before the window (web reports 4 Dec): stale TMDB date, likely data gap. **Eetha (4 Dec), Gunmaaster G9 (27 Nov), Bokshi (4 Dec), Yeh Prem Mol Liya (27 Nov)** — all have IMDb ids on TMDB (live search confirms); they are NOT among the 10 nearest Indian releases today, so date-asc selection cuts them for now — they enter the row as their dates approach (Yeh Prem / Gunmaaster ~23–24 Nov, Bokshi / Eetha ~27–28 Nov, on the daily 10:30 IST rebuild). **Chamunda (2026)** — not found via TMDB website search (but that search already proved unreliable: it also missed Kaali Kheti, which IS on TMDB) — unconfirmed, possibly a TMDB data gap. **Aakasamlo Oka Tara** (web-reported 20 Nov) is NOT in the row despite the date-asc selection — its TMDB `primary_release_date` may differ from the web report, or the 3-page discover scan cut it (many Indian titles share the 19–20 Nov dates and TMDB's secondary sort is popularity); TMDB date unverifiable from this VM (no API key here, website bot-blocked) — reported as-is, not guessed. **King correctly absent** (24 Dec, outside the window). Series row is 17/20, not 20/20 — only 7 returning seasons premiere in the window; the slots fill as more seasons are announced.
- **Install links (unchanged, all same id `com.bharatstreams`):** main/desktop — https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json · phone — https://binge-addon-httpbasant2-9067s-projects.vercel.app/phone/manifest.json · TV — https://binge-addon-httpbasant2-9067s-projects.vercel.app/tv/manifest.json
- **Status:** Commit `6a07753`, tag + release `v1.3.3`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.3.3

## v1.3.4 INDIA BUZZING NOW — REDDIT + YOUTUBE + NEWS, GROQ-RANKED 19 Nov 2026 (basant's approval ~16:05 IST: "kar bhai buzz wala system on bhai")
- **Version v1.3.4** (1.3.3 + 1 user-requested change). Catalog-only change — device profiles / stream sort untouched. Both rows stay toggleable/reorderable in /admin (config.json shape untouched; knob label added to `admin.html` KNOB_LABELS).
- **What changed — the buzz system:** once a day, inside the EXISTING daily catalog rebuild (05:00 UTC = 10:30 IST cron — no second cron added; Hobby allows 1/day), the addon reads what people are actually discussing about movies/series in India, Groq ranks it, and the builder writes ONE new row pair, "India Buzzing Now" (movie + series — Stremio catalogs are single-type, so two rows), placed in the manifest directly after the New Releases rows. NEW `app/lib/buzz.js` (`fetchBuzzItems` + `groqAnalyze` + `normalizeTitle` + `matchTmdbTitle` + `buzzFloorPass`); builder (`scripts/build-catalogs.js`) gains `collectBuzz()` — fetch + one Groq call ONCE per rebuild, stored in `ctx.buzz`, consumed per type inside `buildRows` right after the New Releases block; rows key `india-buzzing-now` → `india-buzzing-now-movie` / `-series`. Stats in `stats.buzz` (`sources`, `groq`, per-type `ranked/matched/unmatched[]/belowFloor[]/noImdb/total`) and returned by the rebuild. The row keeps the LLM's buzz rank order — it is NOT re-sorted by popularity; the buzz ranking IS the row. Series go through the same `seriesMeta` path (IMDb + v1.4 TV filter) as every other series row; movies resolve IMDb the same way. A title that cannot be matched, fails the floor, or has no IMDb id is skipped and named in stats — never invented, never padded.
- **Sources (no keys, no paid APIs):** Reddit public JSON — r/bollywood, r/IndianCinema, r/movies (`hot.json?limit=25`, keep score >= 25 or comments >= 15); YouTube search pages — "bollywood trailer 2026", "hindi web series trailer" (HTML parse of `ytInitialData`, brace-matched, recursive `videoRenderer` walk, top 15/query — the lemnoslife API mirror is unreachable from this VM, so it is not used); entertainment news — Google News RSS, "Bollywood movie" + "Indian web series" (15 each, trailing " - Source" stripped). All fetched in parallel, 12s timeout each, per-source status recorded; items capped at 70. **X/Twitter is EXCLUDED by design** (API paid, $100+/month) — never attempted.
- **LLM:** Groq `openai/gpt-oss-20b`, key read ONLY from `process.env.GROQ_API_KEY` at runtime (already set in Vercel as an encrypted production env var, verified working 19 Nov ~16:10 IST — never asked for again, value stored nowhere, never logged). System prompt demands JSON-only `{"movies": [{"title","reason"}], "series": [...]}` (max 15/list, ranked by discussion volume, only titles named in the items, never invent). `parseGroqResponse` validates shape; non-JSON/empty → error, rows stay empty, rebuild proceeds.
- **Quality floor — buzz is hype, so it is NOT pure hype (basant was told this):** a buzzed title enters the row only when TMDB backs it — RATED path: vote_average >= 6.0 AND vote_count >= 10; OR FRESH/UPCOMING path: released in the last 30 days or releasing in the next 90 days, with no votes yet or a >= 6.0 average. Knob in `lib/config.js` defaults: `'india-buzzing-now': { voteFloor: 6, voteCountFloor: 10 }`. TMDB is the source of truth for matching (title → TMDB id via /search on the NORMALIZED title — trailer/teaser words and "Season N" stripped, "Part One" kept; top-3, prefix-aware — "Ramayana" matches "Ramayana: Rise of a Legend", "King" must NOT match "The King").
- **Live Groq failure + fix (the real story of this version):** the first production rebuild returned `groq: {ok: false, error: "Groq HTTP 400"}` with the rows 0/0 — sources had worked (YouTube 21+20 items, News 103+100), so the failure was the LLM call, not the fetching. The error message was discarded by the code, so the fix cycle was: (a) deploy with error-body capture (first 300 chars of Groq's error body recorded in stats — the key is never logged); (b) rebuild → exact error: `400 json_validate_failed — "Failed to validate JSON. Please adjust your prompt."`, `failed_generation: ""` — the `response_format: {type: 'json_object'}` mode was accepted, but the reasoning model emitted NO final JSON at all. Fix: `response_format: {type: 'json_schema', json_schema: BUZZ_SCHEMA, strict: true}` (Groq's Structured Outputs docs list gpt-oss-20b as supporting strict mode) + `reasoning_effort: 'low'` (keeps the reasoning trace short for this simple extraction task, so the answer fits in max_tokens 2500) + a fence/prose-strip fallback in `parseGroqResponse` (strips ```json fences and any prose around the braces before parsing; invalid JSON still fails). Next rebuild: `groq: {ok: true, candidates: 29}` — rows filled. (c) A second live lesson from that rebuild's stats: "Panchayat Season 5" / "Campus Diaries Season 2" / "Delhi vs Mumbai Season 3" were UNMATCHED — the builder searched TMDB with the RAW Groq title, and TMDB search with "Season N" in the query matches nothing. Fix: the builder now searches (and matches) with the NORMALIZED title; test asserts "Panchayat Season 5" matches Panchayat.
- **Deployments (same version, four deploys — fixes landed before release, so no version was consumed):** `dpl_ABVXp6H2fVrHPPqxbibFRotnLRpZ` (READY; first build — Groq 400, rows 0/0), `dpl_4NtYLetaTnBkxTitRNe9M1NdxrJs` (READY; error-body capture — exposed the exact json_validate_failed error), `dpl_74iCN6mgUqo76sBAvGK9Zaj9pB2S` (READY; json_schema + reasoning_effort fix — rows filled), `dpl_E3ypEQYNkrKjuxqYCvknW1paSmid` (READY, current; normalized-title search fix). All via the REST token route (`/tmp/deploy-v134.py`, 48 files inlined). Rebuilds triggered via the admin API (`POST /api/admin/rebuild`, `X-Admin-Password` from the main-chat record — transient use only, value stored nowhere) so the row populated the same day. **Operational lessons (carried from v1.3.3):** pipe the password on stdin (never let the helper block on `sys.stdin.read()`); the bundle read cache is 5 min — live rows lag a rebuild by up to 5 min; the public catalog endpoint serves an edge cache (cacheMaxAge 3600) — verify live rows with a cache-busting `?t=<unix timestamp>`.
- **Rebuilds (admin API, HTTP 200):** rebuild 1 — groq 400, buzz 0/0, bundleHash `d6400a69…`; rebuild 2 (capture deploy) — same 400 with the exact error text; rebuild 3 (json_schema fix) — groq ok, 29 candidates, movie 5 (ranked 14, matched 5), series 4 (ranked 15, matched 4); rebuild 4 (normalize fix, current bundle) — groq ok, 17 candidates, movie 2 (ranked 4, matched 2), series 3 (ranked 13, matched 3). Sources in rebuild 4: Reddit 403 on all three subs (see honest gaps), YouTube 21+20, News 103+100.
- **Tests:** NEW `tests/test-buzz.js` — ALL PASS (manifest 30 + buzz rows at indices 4–5 static order + knob defaults; Reddit parser noise cut; YouTube parser ytInitialData + channel ignored; News RSS source-suffix strip + CDATA; fetchBuzzItems merge + Reddit 403 recorded; Groq parse valid/malformed/empty/capped-15/fenced/prose-wrapped; normalizeTitle cases incl. "Part One" kept; matchTmdbTitle "King" vs "The King" reject + prefix match; floor cases rated/fresh/upcoming/old-unvoted/far-future; buildRows end-to-end — movie row fills in BUZZ order, series row applies the v1.4 TV filter, unmatched + below-floor named, no-imdb counted, "Panchayat Season 5" matched via normalized search; collectBuzz end-to-end incl. no-key → empty rows, no crash; Groq request-shape assertions — model `openai/gpt-oss-20b`, `response_format` json_schema strict true, `reasoning_effort` low). Full suite ALL PASS (12 files): test-buzz, test-releasing-next-30, test-new-releases, test-search, test-blob-direct, test-bundle, test-device-profiles, test-stream-format, test-cam-fallback, test-size-ranking, test-badges, test-meta. Stale pins in test-new-releases / test-releasing-next-30 / test-search updated 28 → 30 catalogs, 1.3.3 → 1.3.4 (the counts moved because of this version, not a regression). `collectBuzz` is now exported from the builder for tests (alongside `buildRows`, `isIndianTitle`).
- **Version bumps:** `app/index.js` (VERSION = '1.3.4'), `app/lib/manifest.js` (version + 2 catalog pushes after new-releases + description mentions India Buzzing Now), `app/lib/config.js` (buzz knob), `app/package.json`, `app/package-lock.json` (version fields only — lines 3 and 9, NOT line 401 `finalhandler ~1.3.1`), `app/lib/admin.html` (3 hardcoded strings v1.3.3 → v1.3.4: lines 882, 903, 976; KNOB_LABELS entry `'india-buzzing-now': 'India Buzzing Now'`).
- **Live verification (production, 19 Nov 2026, curl with `?t=` cache-busting, after the 5-min bundle cache expired):** /health 1.3.4; main manifest 1.3.4 / 30 catalogs, id `com.bharatstreams`; `/phone/manifest.json` 1.3.4 / 30; `/tv/manifest.json` 1.3.4 / 30. Effective manifest order (from stored Blob config.json, NOT the static order — buzz rows land at 6 and 8, right after the New Releases rows at 2 and 4): 0 trending-indian-movie, 1 trending-indian-series, 2 new-releases-movie, 3 global-trending-movie, 4 new-releases-series, 5 global-trending-series, **6 india-buzzing-now-movie**, 7 fresh-digital-drops-movie, **8 india-buzzing-now-series**, 9 latest-indian-ott-movie, … (30 total). **India Buzzing Now — movie (2/20):** Ramayana: Rise of a Legend (tt27988879 — rated path, 7.5/10, 57 votes; box-office-record buzz) + Yeh Prem Mol Liya (tt38907401 — upcoming path, releases 27 Nov 2026; trailer buzz). **India Buzzing Now — series (3/20):** Campus Diaries (tt15295490 — season-2 buzz, matched via normalized title, rated path), Raakh (tt35870921 — rated path), Akka (tt29625288 — rated path). Admin config (`GET /admin/api/config`) shows both buzz rows enabled with order 4/5 + knob `{voteFloor: 6, voteCountFloor: 10}` — toggleable/reorderable from /admin. No-regression spot-checks: trending-indian-movie 20/20; Dangal streams 40, first Hindi 1080p, zero 2160p, zero CAM.
- **Honest gaps:** (1) **Reddit is 403 from Vercel too** — all three subs failed in every production rebuild (datacenter IP reputation, same as this VM); the row currently fills from YouTube + News only, and the 403 is recorded in `stats.buzz.sources` on every rebuild. It may answer from a different egress IP later — report honestly, never fake it. (2) **Row fullness varies run to run** — the LLM is non-deterministic: rebuild 3 ranked 29 candidates (movie 5, series 4), rebuild 4 ranked 17 (movie 2, series 3). The row is thin on quiet-buzz days and fills as discussion grows; the daily 10:30 IST rebuild refreshes it. (3) **Groq cross-type mislabels are skipped, not fixed** — the LLM puts series titles in the movie list and vice versa ("Student Of The Year - After Dark" in movies, "Pratap" in series, "Daayra" in series); TMDB matching by type correctly rejects them, so they never appear — but they consume ranked slots. (4) **Below-floor drops (by design, named in stats):** Alpha (va 5.237/vc 38 — rated below 6.0), Daayra (va 6.0/vc 3 — too few votes and not fresh), Pralay / The Last Meal / Nine to Five (va 0/vc 0, old, unvoted), The Revolutionaries (va 7.667/vc 3 — good score, only 3 votes, not fresh). (5) **Unmatched (by design, named in stats):** "Echoes of Valour", "Blind Game", "VVAAN: Force Of The Forrest", "Last Man In Tower", "Shashaank Khaitaan's romantic movie Aisi..." (a garbled partial Groq title, not a clean title). (6) On-device verdict pending: basant must confirm the new rows in Nuvio — proven via production curl, not a real Nuvio client; Nuvio may show the new row after its own cache expires (edge cache up to 1h); no reinstall needed (id unchanged).
- **Install links (unchanged, all same id `com.bharatstreams`):** main/desktop — https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json · phone — https://binge-addon-httpbasant2-9067s-projects.vercel.app/phone/manifest.json · TV — https://binge-addon-httpbasant2-9067s-projects.vercel.app/tv/manifest.json
- **Status:** Commit `2b8f437`, tag + release `v1.3.4`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.3.4

## v1.4.3 CATALOG FIXES BATCH 19 Nov 2026 (other-AI audit, parent-verified specs — 9 user-requested changes)

- **Changes (exact specs, no improvised bands):** (1) Underrated Indian Gems — movies vc 50–800 / va ≥7.5 / `with_runtime.gte=80`, series vc 25–300 / va ≥7.6 (was shared va 7.8 / vc 2000–25000; live row was 2/20). (2) Action, Heist & Revenge — vc floor 25000 → 3000, va ≥7.2, + 4-slot Indian reserve (origin IN, vc ≥150, va ≥7.2) on the v1.3.1/v1.3.3 two-pass pattern. (3) Top Action & Dark Anime — `with_genres=16,10759` + `without_genres=10751,10762,10749`; 100-episode cap scoped: fires for Indian-origin, Soap-genre (10766), OR unknown-origin titles, skipped only when KNOWN non-Indian and not Soap (conservative default — caught by the test suite: the old test-new-releases stub lacked `origin_country`, so the cap initially passed a 150-ep Indian series; stub fixed to mirror real TMDB detail shape). (4) Latest Indian Movies — OTT Ready — ADD `watch_region=IN` + `with_watch_monetization_types=flatrate` + `with_watch_providers` (8|119|122|2336|237|232), 90-day window kept; provider list re-validated live per build against `/watch/providers/movie` — invalid ids dropped, validation failure falls back to no provider filter. (5) Psychological Thrillers — `with_keywords` pipe-OR, resolved at build time via `/search/keyword` like Sci-Fi (`resolveKeywords` generalized): psychological thriller 12565, plot twist 275311, mind game 184312, serial killer 10714, conspiracy 10410 — all 5 resolved, none dropped. (6) Reddit OAuth in `app/lib/buzz.js` — `fetchRedditToken` (client_credentials, token fetched once per rebuild, never logged/stored) + per-subreddit OAuth → public.json fallback; `stats.buzz.sources.reddit.*.auth` records `oauth`|`public`; graceful fallback when `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are absent — build never crashes. (7) Titles — Big Announcements year dynamic `${currentYear}–${currentYear+1}` at build time (code default AND config/admin label; `effectiveCatalogs` overrides the stored name at serve time so a stale stored name can never freeze the year); 4 renames: "Mind-Bending Sci-Fi & Time Travel" → "Mind-Bending Sci-Fi", "High-Tension Psychological Thrillers" → "Psychological Thrillers", "Adrenaline Action, Heist & Revenge" → "Action, Heist & Revenge", "1-Season Binge Mini-Series" → "1-Season Binge"; catalog IDs byte-identical. (8) Reorder — upcoming rows (Releasing Next 30 Days movie+series, Big Announcements movie+series, New Season Returning Soon, Now in Theatres) to the END via config.json order + code default; relative order preserved. (9) Remove Newly Announced Web Series — builder, manifest, config knob, admin labels; legacy per-row Blob file pruned via `REMOVED_LEGACY_ROWS` (HEAD check first) — rebuild `prunedLegacy: ['newly-announced-series-series']`.
- **Code:** `app/scripts/build-catalogs.js` (per-type underrated constants/knobs, action reserve two-pass, anime genres + cap scoping, OTT provider validation, thriller keywords, newly-announced block removed, `REMOVED_LEGACY_ROWS` now `['south-blockbusters-movie', 'newly-announced-series-series']`; `resolveKeywords`/`resolveOttProviders`/`tvShowExcludeReason` exported for tests), `app/lib/buzz.js` (Reddit OAuth), `app/lib/manifest.js` (v1.4.3, 29 catalogs in new order, 4 renames, dynamic Big Announcements year), `app/lib/config.js` (per-type underrated knob fields, action knob 7.2/3000/150, newly-announced knob removed, `effectiveCatalogs` dynamic year override), `app/index.js` (VERSION 1.4.3), `app/package.json` + `app/package-lock.json` (1.4.3), `app/lib/admin.html` (3 version strings → v1.4.3; KNOB_LABELS updated — newly-announced removed, big-announcements label without year, 4 renames; new render blocks for per-type knob fields `voteFloorMovie/Series`, `voteCountFloorMovie/Series`, `voteCountCeilMovie/Series`, `voteCountFloorIndian`).
- **Provider IDs verified before deploying:** Netflix 8, Prime Video 119, JioHotstar 2336, Zee5 232 confirmed against an independent TMDB-based source (halo-tv repo, web search 19 Nov 2026); Disney+ Hotstar 122 and SonyLIV 237 are the long-standing TMDB ids. Live runtime validation then DROPPED 122 — TMDB's live IN provider list no longer carries it (retired into JioHotstar 2336); the OTT discover ran with 8|119|2336|237|232. The validation layer earned its keep on day one.
- **Tests:** NEW `tests/test-v143.js` (manifest/config, underrated bands + runtime, action reserve, anime genres + cap scoping incl. unknown-origin conservative default, OTT provider validation incl. failure fallback, thriller keyword resolution with a dropped term, Reddit OAuth 4 scenarios) — ALL PASS. 30-count assertions updated to 29 in test-buzz.js, test-new-releases.js, test-releasing-next-30.js, test-search.js (incl. manifest version 1.4.3). **Full suite green 13/13** (test-badges, test-blob-direct, test-bundle, test-buzz, test-cam-fallback, test-device-profiles, test-meta, test-new-releases, test-releasing-next-30, test-search, test-size-ranking, test-stream-format, test-v143). `tests/repro-format.js` remains STALE (not part of the suite).
- **Deployment:** `dpl_212VM6hX5PcPEu4ZuKvXMSyYn6Sj` (READY, first attempt; deployed via `/tmp/deploy-v143.py`, REST token route, 48 files inlined). Admin config POST via `/tmp/binge-admin.py` — first attempt hit an egress IncompleteRead (0 bytes read, 3729 expected) but the write HAD applied server-side (verified by re-GET: updatedAt 2026-11-19T12:58:55Z, 29 catalogs, correct order/names/knobs). Same IncompleteRead hit the first row-verification fetch; curl + `--retry 2` fixed it — use curl for live row fetches, not urllib.
- **Production rebuild (admin API, 19 Nov ~12:59 IST):** ok, bundle written (hash c4dd49b0), all 29 rows: trending-indian 20/20, new-releases 20/19, buzz 6/2, global-trending 20/20, fresh-digital 20, latest-indian-ott 20, now-in-theatres 13, action 20 (indian 4 / worldwide 16), visual 20, classics 20, releasing-next-30 20/18 (series: 10 premieres + 8 returning), big-announcements 12/20, underrated 20/20, scifi 20/20, thrillers 5/17, latest-indian-series 20, returning-soon 20, dark-crime 20, miniseries 20, anime 20. Buzz: Groq ranked 25 candidates; Reddit 403 public on all 3 subs (no OAuth creds yet — expected), YouTube 20+20, News 92+65.
- **Live verification (production, cache-busting `?t=`, 19 Nov ~13:05 IST):** manifest Binge Addon **1.4.3 / 29 catalogs**, id `com.bharatstreams`, 4854 bytes; upcoming rows at indices 23–28; newly-announced absent; removed-row endpoint returns 0 metas. Per-affected-row top 5: underrated-movie 20 — Taylor Swift: The 1989 World Tour - Live, Ramayana: The Legend of Prince Rama, Pariyerum Perumal, Meiyazhagan, Jersey; underrated-series 20 — Rocket Boys, Scam 1992, Panchayat, Special Ops, Special Ops 1.5; action 20 — RRR, Dhurandhar, Dhurandhar: The Revenge, Bāhubali: The Beginning, The Odyssey; anime 20 — Frieren, One Piece, Fullmetal Alchemist: Brotherhood, Attack on Titan, Solo Leveling (One Piece is IN — cap no longer kills long anime; romance/sports/drama gone); OTT 20 — Mrigaya 1.5, Parivarik ManuRanjan, Nooru Kodi Vaanavil, Dilwali Diwali, Meethe Mein Kya Hai; thrillers-movie 5 — Parasite, Se7en, Joker, Shutter Island, Gone Girl; thrillers-series 17 — American Horror Story, True Detective, Reacher, MINDHUNTER, Dexter; buzz-movie 6 — The Vvaan, Pratap, Yeh Prem Mol Liya, Gunmaaster G9, Eetha; buzz-series 2 — Campus Diaries, Student of the Year: After Dark; big-announcements 12/20 — Gatto, Avengers: Secret Wars, Violent Night 2, The Batman: Part II, Spider-Man: Beyond the Spider-Verse; trending-indian-movie 20 — Ramayana, Ranabaali, Jailer 2, Gajab Raat, DNK. Dangal streams: **40, top 1080p BluRay Hindi 2 GB, top 10 all 1080p, Hindi-first, zero 2160p, zero CAM** (streams carry the format in `description`, not `title` — a first check script read the wrong field and was corrected).
- **Row 8 vs Row 10 verdict — KEEP BOTH:** Fresh Digital Drops vs Latest Indian Movies — OTT Ready share only **7/20** titles (Jailer 2, Parivarik ManuRanjan + 5). Different signals: Fresh = by digital-release DATE (any provider, incl. smaller services/rent), OTT Ready = by live PROVIDER presence on the 5 majors. 65% of each row is distinct; overlap is expected (a new Indian film on Netflix is both). No merge.
- **Honest gaps / watch items:** (1) **Psychological Thrillers movie row is thin at 5/20** (was 11/20 before keywords) — the keyword filter + the 20000 vote floor together narrow the pool; all 5 are genuinely psychological. If basant wants it fuller, the lever is the movie vote floor (20000 → lower), NOT removing keywords — his call, no change made. (2) Underrated-series top titles (Scam 1992, Panchayat) are famous but correctly in-band: TMDB vote counts for Indian series are low (Indian users vote on IMDb, not TMDB), so famous-but-low-TMDB-vote titles fit the 25–300 band by design. (3) **Reddit OAuth is code-only until basant acts** — needs a Reddit script app + `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` in Vercel env vars; until then buzz rows fill from YouTube + News (Reddit stays 403, recorded in stats). (4) On-device verdict pending: basant must confirm the new rows/order in Nuvio — proven via production curl, not a real Nuvio client; Nuvio may show the new order after its own cache expires (edge cache up to 1h); no reinstall needed (id unchanged).
- **Install links (unchanged, all same id `com.bharatstreams`):** main/desktop — https://binge-addon-httpbasant2-9067s-projects.vercel.app/manifest.json · phone — https://binge-addon-httpbasant2-9067s-projects.vercel.app/phone/manifest.json · TV — https://binge-addon-httpbasant2-9067s-projects.vercel.app/tv/manifest.json
- **Status:** Commit `99407a1`, tag + release `v1.4.3`: https://github.com/iamnotbasant/binge-addon/releases/tag/v1.4.3
