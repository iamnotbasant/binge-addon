# Binge Addon — Deploy Notes

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
