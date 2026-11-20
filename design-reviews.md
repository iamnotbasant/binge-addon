# Dashboard design draft v1 — Goldfish reviews (18 Nov 2026)

Both reviewers REJECTED v1. They agree on the same blockers. Fold ALL of them
into the v2 rewrite of dashboard-design-draft.md. Keep everything both
reviewers say the draft gets right (layout, tokens, label mapping, config
contract, connected-flow description, toggle test).

## Reviewer 1 (builder's chair) — 6 blockers

- **B1 — Authed rebuild endpoint cannot work in app/index.js.** `vercel.json`
  caps `api/index.js` at `maxDuration: 10`, rebuild takes 30–60s — Vercel
  kills it at 10s (the 504 the draft fixes, recreated on the rebuild path).
  Draft never mentions `maxDuration`. FIX: separate serverless function
  (e.g. `app/api/admin/rebuild.js`, reachable at `/api/admin/rebuild` —
  `api/` files take precedence over the `/(.*) → /api` rewrite, as
  `/api/cron/rebuild` proves) with `maxDuration: 300` in `vercel.json`,
  behind the same `X-Admin-Password` gate. Specify exact route, the
  `vercel.json` change, response shape — including the `{ skipped: true }`
  case `main()` returns when TMDB key/Blob token missing
  (`build-catalogs.js` lines 983–996).
- **B2 — Status fix specifies 3 mechanisms without choosing one; summary-file
  path underspecified.** Steps 1 (single list), 2 (parallel fetch), 3
  (`catalogs/_summary.json`) presented as a stack, no primary/fallback
  statement. Summary schema `{ builtAt, counts, top }` cannot reproduce the
  current status response: `main()` skips disabled catalogs entirely, so a
  summary-only status loses disabled rows the dashboard lists with count 0
  (`index.js` lines 232–237); no per-row `builtAt` in schema. FIX: declare
  summary file primary, parallel fetch fallback-only-when-summary-missing-
  or-unreadable. Specify: write point (end of `main()`, after
  `writeRowsToBlob`, only on full success; failed summary write must not
  fail the rebuild); status assembly (merge `cfg` + summary; disabled rows
  → `{ count: 0, top: [] }`); summary read must bypass the 5-minute
  in-memory cache in `store.js`; summary's Blob access level.
- **B3 — "100% knob parity" is false: `voteCountCeil` silently deleted.**
  Current dashboard renders it ("Max votes"), it controls the
  underrated-gems ceiling of 25,000. FIX: show it with the brief's
  "Maximum votes" label (preferred), or declare it intentionally uneditable
  with a stated reason. Drop the "100%" claim until true.
- **B4 — Cron hole not actually closed.** Guard `if (cronSecret && ...)` is
  a no-op when `CRON_SECRET` unset; draft never mandates setting it. The
  `x-vercel-cron === '1'` bypass is presented as fact with no source;
  Vercel's documented cron auth is `Bearer CRON_SECRET`, and a
  client-settable header cannot be a security gate. FIX: make setting
  `CRON_SECRET` (Vercel env var, production) a required release step;
  verify post-deploy unauthenticated `GET /api/cron/rebuild` returns 401.
  Verify the `x-vercel-cron` header against Vercel docs; if unverified,
  delete that branch.
- **B5 — Performance claims unsubstantiated and inconsistent.** §8.1 promises
  "<150ms" / "sub-second (<500ms)"; §9.4 accepts "<1500ms". No measurement
  exists; cold-start Node + SDK import alone can exceed 500ms on Hobby.
  Root-cause math ("54 sequential requests") ignores the 5-minute in-memory
  cache in `store.js` — on warm instances status is mostly cache hits; the
  504 is a cold-start phenomenon. FIX: correct root cause to include the
  cache; replace the three numbers with a single acceptance target (keep
  §9.4's <1500ms), labelled a target to measure, not a promise.
- **B6 — No state or failure model for the multi-view UI.** (a) Dirty state
  across views: edits in-memory `cfg`; rename in Catalogs → switch to Rows
  → sidebar Save — is everything saved? Save badged/disabled when nothing
  dirty? Save-failure UX? (b) 401 mid-edit: re-login behaviour, do unsaved
  edits survive? (c) Render strategy: current `renderCatalogs()` rewrites
  `innerHTML` on every change — loses text-input focus + scroll position
  with 27 cards. FIX: add §7.4 "State & failure handling" covering dirty
  tracking, 401 re-login with edit preservation, save-failure toast, render
  strategy for Catalogs panel.
- Nits: N1 version (confirmed v1.0.6); N2 "TMDB latency indicator" + "degraded"
  dot have no data source (status carries only `tmdbKeySet` boolean) —
  specify client-side fetch timing or drop; N3 search/filter bar is new scope
  not in brief — keep or cut explicitly; N4 no responsive breakpoint —
  specify collapse under 900px or desktop-only ≥1280px; N5 `top` entries must
  be display names not ids; step-1 `list({ prefix: 'catalogs/' })` also
  returns `_summary.json` / `_idmap.json` — filter them out; N6 rebuild
  concurrency (manual rebuild vs daily cron interleaving Blob writes) —
  specify block/queue/allow or explicitly accept; N7 §7.1 "countdown timer"
  cosmetic, "~1 minute" also depends on Nuvio caching — keep current wording,
  not a guarantee; N8 error-code convention — §8.2 returns 500 on rebuild
  failure while cron returns 200 `{ ok: false }` — pick one.

## Reviewer 2 (capability parity) — 5 blockers (same issues, independent check)

- **B1.** `voteCountCeil` dropped — draft contradicts itself (§5 "STAYS 100%"
  vs §5 "GOES" vs §9.2). Brief says translate it to "Maximum votes", not
  delete it. FIX: render as "Maximum votes" on rows that have it (today:
  only Underrated Gems). If basant wants it gone, that needs his explicit
  approval, not a buried design decision.
- **B2.** `POST /admin/api/rebuild` in `app/index.js` will 504 — draft's own
  §8.1 proves it (10s cap vs 30–60s build). Draft never acknowledges WHY
  the current dashboard calls `/api/cron/rebuild` (only route with 300s
  budget). FIX: own serverless function (e.g. `api/admin/rebuild.js`,
  `maxDuration: 300`, `requireAdmin` there) or async trigger + poll. Specify
  timeout budget explicitly + acceptance check that a full rebuild completes
  through the new route.
- **B3.** Cron "protection" unverified: `x-vercel-cron === '1'` appears
  nowhere in the codebase; only documented mechanism (in
  `app/api/cron/rebuild.js`'s own comment) is `Authorization: Bearer
  <CRON_SECRET>`. If the header doesn't exist, once `CRON_SECRET` is set the
  daily 10:30 IST cron gets 401'd and auto-rebuild silently breaks. Guard is
  no-op when secret unset; draft never establishes whether it is set nor
  mandates setting it. FIX: drop `x-vercel-cron`; authenticate cron route on
  `Bearer CRON_SECRET` only. Required step: set `CRON_SECRET` on Vercel and
  verify scheduled cron still fires + unauthenticated call is 401.
- **B4.** Target version wrong everywhere — must be v1.0.6 (known error,
  confirmed: `index.js` VERSION = '1.0.5', `manifest.js` 1.0.5 live).
  FIX: replace every v1.0.5 in the draft (header, mockup, badge, §9.5).
- **B5.** Status-fix spec underspecified: (a) prefix-list must filter out
  `catalogs/_idmap.json` and `catalogs/_summary.json`; (b) disabled rows —
  current status appends them with `count: 0`, summary file only has built
  rows, draft never specifies the merge; (c) cold-start-only — draft ignores
  `store.js` 5-minute cache (504 observed only once because warm instances
  are cache hits). FIX: specify `_summary.json` shape incl. disabled-row
  handling (or state status still merges from config), prefix-list filter
  rule, note the cache in root cause. Also draft header promises "minor API
  fixes in `app/index.js` & `app/api/cron/rebuild.js`" but §8.1.3 also changes
  `scripts/build-catalogs.js` — list it.
- Nits: N1 status loop is `app/index.js` lines 228–229, not 206–216; N2
  latency targets inconsistent (<500ms vs <1500ms) — pick one; N3 "TMDB
  latency indicator" fictional — drop or specify a TMDB ping; N4
  "degraded" connectivity never defined — define or drop amber; N5 current
  status grid's plain "Live URL" link has no home in new Overview — add it;
  N6 microcopy "IMDb/TMDB rating" — floor is TMDB `vote_average` only, say
  TMDB; N7 two Save buttons implied (sticky sidebar footer + content-header
  button) — specify one; N8 example numbers are invented placeholders
  ("Total items: 540", "Top: Jawan, Animal, Stree 2") — mark as examples;
  N9 §8.2.1 doesn't handle `main()` returning `{ skipped: true }` — specify
  the skipped path; N10 Panel 1 "Addon Core ID `com.bharatstreams`" — status
  API returns `addon: 'binge-addon'`, not manifest id — specify source
  (hardcode or read `MANIFEST.id`).

## What both agree the draft gets right (keep in v2)

- Layout, colour/type tokens, plain-language label mapping, config contract
  untouched, single self-contained file, connected-flow description correct
  (fast path Blob → manifest ≤60s cache; knobs need rebuild), toggle test
  valid, 504 root cause directionally correct (sequential loop + 10s limit),
  `main()` return shape matches, `badges.json` link kept, version-bump file
  list correct.
