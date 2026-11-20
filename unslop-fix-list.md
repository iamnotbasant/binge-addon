# Binge Admin Panel — Unslop Fix List (v1.1.0)

Synthesised by the coordinator from 5 skill audits + 1 research report (18 Nov 2026).
Every fix below is traceable to a named skill finding. The builder implements
THIS file only — do not re-audit, do not redesign, do not add features.

## Skills run (all fetched live, all read in full)

| Skill | Repo | Verdict on current panel |
|---|---|---|
| heydamir/unslop | github.com/heydamir/unslop | 30 findings F1–F30, light-to-medium slop |
| Emil Kowalski (8 of 18 skills) | github.com/emilkowalski/skills | Mostly lifeless/mechanical; Block verdict (no reduced-motion, no press feedback, teleporting modal/toasts) |
| frontend-craft | github.com/nattergabriel/frontend-craft | 14 tells fire — heavy slop by density rule |
| anti-slop-design | github.com/Ferousco-dev/anti-slop-design | FAIL — Gate 1 fails ×2 (glows), Gate 2/4/5 fail |
| unslop-ui (+ devibe_scan.py) | joaovjo/vaultless `.agents/skills/unslop-ui` | Scanner: vibe score **16, STRONG AI-default look** (8 medium) |
| Finch | — | **NO separate skill exists.** Finch was the Finch self-care app used as a *design reference* for Bite's dashboard (translated, not cloned); shipped as Bite 2.16.12, REJECTED by basant, fully reverted as 2.16.13. Finch-as-look is therefore doubly out: not runnable, and already rejected by the user. Do not import Finch's look. |

**Thesis (adopted from anti-slop #4 + unslop-ui §3):** *"A quiet ledger: near-neutral black surfaces, one blue reserved only for action, mono numerals, Hinglish microcopy as the only voice."* Direction: mission control for one teenager's Stremio addon — every number is his, every label is in his words. Do NOT re-skin into cream+serif or any other default (unslop-ui's core warning).

**Baseload facts (verified):** scanner baseline 16/STRONG; 14 tells fire (frontend-craft); zero purple/gradients/fake stats (all agree — the draft's bans held); dark-only is basant's EXPLICIT order (his own words, multiple times) — record that in the draft, do not ask him again.

## 0. Tokens — replace lines 9–28 exactly with this ramp

```css
--bg-canvas: #0a0d12; --bg-sidebar: #0d1117; --bg-card: #12161d;
--bg-card-hover: #171d27; --border-subtle: #212a36;
--text-primary: #f4f3ef; --text-secondary: #9ba1a6; --text-tertiary: #8fa0b3;
--accent-primary: #2f6fed; --accent-hover: #245fcf; --border-focus: #4a86f5;
--status-success: #10b981; --status-error: #ef4444;
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--text-xs: 11px; --text-sm: 12px; --text-md: 14px; --text-lg: 16px; --text-xl: 20px;
--space-1: 8px; --space-2: 12px; --space-3: 16px; --space-4: 24px; --space-5: 32px;
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; /* unslop-ignore: system stack is intentional — single-file, zero-dependency; utility surface, OS type keeps attention on numbers */
--font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
```

Rules: no Tailwind hex may remain anywhere (`#0b0f17 #141c2b #1e293b #334155 #94a3b8 #64748b #2563eb #3b82f6 #60a5fa #f59e0b #1a2436 #2a374a #0f1521 #101622 #1a1e23` — grep after editing; the only blues left are `#2f6fed` fills, `#4a86f5` focus, `#60a5fa` text-blue — wait, `#60a5fa` IS a Tailwind stop (blue-400). Replace text-blue uses with `#6ea8fe`? NO — do not invent a new hex: use `var(--accent-primary)` lightened via `color-mix(in srgb, var(--accent-primary) 72%, white)`? That is fragile in old browsers. DECISION: text-blue = `#7aa5f8` — a non-Tailwind-stop blue, verified ≥4.5:1 on `#12161d` (builder: compute and record the ratio; if <4.5:1, lighten to `#8db1fa` and record). Replace every `#60a5fa` and `#93c5fd` with it. Delete `--status-warn` / `--status-warn-bg` (unused). Delete `--status-success-bg` / `--status-error-bg` tint tokens if toasts go tint-free (see §4).

## 1. Color

1. **Delete both glows** (all 5 skills agree): line ~175 `.status-dot.online` `box-shadow: 0 0 8px rgba(16,185,129,0.4)` and line ~261 `.save-btn.dirty` `box-shadow: 0 0 10px rgba(37,99,235,0.4)`. Dirty state becomes: `opacity: 1` + `font-weight: 700` + the existing `●` label. Keep the input focus ring (line ~360) and the neutral login/modal shadows ONLY if their border is removed — DECISION: delete the login-card (line ~59) and modal-card (line ~773) `box-shadow` lines too, keep their 1px borders (frontend-craft F10 wins over heydamir's permission; borders already separate them).
2. **One accent family:** fills/selection stay `var(--accent-primary)`; `.btn-danger` background becomes `var(--accent-primary)` (crimson is error-only from now: toasts, error text, danger dot). `.rebuild-icon` is deleted anyway (§3).
3. **One border:** every border/divider uses `var(--border-subtle)`; hover border → `rgba(248,250,252,0.14)`.
4. **Tertiary contrast:** `--text-tertiary: #8fa0b3` (frontend-craft's value — brightest of the three proposed, 6.38:1 on card; beats heydamir `#7d8ca3` and anti-slop `#7d8aa0`, both of which also pass).
5. **Toasts go tint-free** (frontend-craft wins over heydamir F6): `.toast.success/.error/.info { background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--text-primary); }` with only the `<strong>` title in the semantic color (`#10b981` / `#ef4444` / text-blue). Delete the tinted-bg toast rules.
6. **Status pills → dot + text** (heydamir F26, strictest): replace every status `.pill` (Active / Hidden from Nuvio / Connected / Missing Key / Disconnected / Checking…) with `<span class="status-text"><span class="dot dot-ok|dot-err|dot-neutral"></span>Label</span>` — 8px dot + 12px secondary text, no tinted background, no border. Keep tinted backgrounds NOWHERE except toasts (see 5 — toasts are tint-free too, so: no tinted pill backgrounds anywhere).
7. **Counts/type → quiet mono text** (heydamir F25): per catalog row, type + count become 12px mono `var(--text-secondary)` text (`20 items · Movie`); nav badge "27 rows" → `<span class="nav-count">27</span>` 11px mono tertiary; `27 rows total` pill and `Version v1.0.9` pill → plain 12px mono muted text (version tag keeps NO chip background). Derive the "27" from `statusData.catalogs.length` in JS (anti-slop #24) — never hardcode again.
8. **Focus:** add global `:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }` (keep the input `box-shadow` ring as well). Add `aria-label`s: login input, search input, catalog name inputs (`Row name for ${id}`), knob inputs (real `<label for="knob-${key}-${field}">`), quality `<select>` (visually-hidden label ok), toggle inputs (`aria-label="Torrentio enabled"` etc.).

## 2. Type

- **Scale (only these):** 11px meta/labels only, 12px secondary, 14px body/inputs/nav, 16px figures (`.diag-val`) + brand, 20px page title. Map: body 13→14px; card-title 15→14px/600; brand-title 17→16px/600; rebuild h3 18→16px/600; modal h3 17→16px/600; nav-badge 10→11px mono. `body { line-height: 1.5; }`.
- **Weights:** headings 700→600 (login h1, brand-title). No weight above 600 anywhere.
- **Tracking:** `letter-spacing: 0` on all three negative-tracking rules (login h1, brand-title, `.view-title`).
- **Case:** sentence case everywhere — headings, nav labels, card titles, knob labels (`Release window (days)`, `Minimum rating (0–10)`, `Minimum votes required`, `Maximum votes`), diag labels (delete `text-transform: uppercase`, `letter-spacing: 0`; TMDB stays caps as an acronym). "Catalogs Management" → "Catalogs". "Row Settings (Tuning Knobs)" → "Row Settings".
- **Numbers:** `font-variant-numeric: tabular-nums` on `body`; all counts via `toLocaleString('en-IN')`; mono face on ALL updating numerals (`.diag-val`, knob inputs, counts, rebuild timer).
- **Radius (heydamir scale — wins over frontend-craft's draft-baked 10/6):** cards 12px (`.card`, `.diag-card` where bordered, `.cat-card`), controls/inputs/buttons 8px, `.btn-icon` 8px, badges/pills 6px, `9999px` ONLY on `.toggle-slider` (switch track). Add `/* unslop-ignore: toggle track is functionally a pill */` there.

## 3. Icons (all 5 skills agree — Lucide inline SVG, 16px, stroke 1.5)

- Fetch EXACT path data from the Lucide repo (do not draw from memory): Overview `layout-dashboard`, Catalogs `layers`, Row Settings `sliders-horizontal`, Stream Sources `play`, Rebuild `refresh-cw`. `fill="none" stroke="currentColor" stroke-width="1.5"`, fixed 18px box, 10px gap to label, `color: var(--text-secondary)` (active: `var(--text-primary)`). Delete the `.nav-icon` font-size/opacity rule.
- **Delete** the rebuild hero `<div class="rebuild-icon">⚡</div>` entirely (filler — anti-slop #6, frontend-craft #8).
- **Spinner:** replace `⏳` (line ~1113) with `<span class="spinner"></span>` + `.spinner { width:14px; height:14px; border:2px solid var(--border-subtle); border-top-color: <text-blue>; border-radius:50%; animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`.
- **Move buttons:** `↑`/`↓` → Lucide `chevron-up` / `chevron-down` 16px stroke 1.5 + `aria-label="Move row up/down"`.
- **Toast close:** 16px Lucide `x` SVG. **Drop** `⚠️`/`✓`/`✗` glyphs in JS strings (colored text carries it). Keep `↗` (external links) and `×` (dismiss) — standard typographic marks.
- **Nav active state:** DELETE the accent stripe (frontend-craft wins over Emil's inset-shadow preservation — the stripe itself is the tell). Active = `background: var(--bg-card-hover); color: var(--text-primary); font-weight: 600; padding-left: 12px` (same on mobile, no `border-bottom`).

## 4. Spacing / layout

- **4px grid** (heydamir F1): 10→12, 14→16, 18→16/20, 5→4, 3→4, 7→8, pill vertical padding 2→4 (`padding: 4px 8px`). Nav rows 36px (`.nav-btn` padding `8px 12px`; `.nav-menu` padding `16px 12px`).
- **Gap jumps** (frontend-craft F12): within-group 8px (`.catalog-stack` stays 8; `.knob-field` margin 10→8), between-group 16px (diag/knob grids 12→16), section 24px (`.view-header` margin 20→24; `.card` margin 16→20).
- **Card treatment — ruled lists, not card-ification** (anti-slop #7 wins): keep bordered containment ONLY for interactive/form surfaces (`.login-card`, `.modal-card`, `.cat-card` rows, inputs). `.diag-card` → `background: transparent; border: none; padding: 0;` (label + value + sub). `.knob-card` → `background: transparent; border: none; border-top: 1px solid var(--border-subtle); border-radius: 0; padding: 14px 0;`. Generic `.card` (Resource Hub, Streams, Rebuild console) → same ruled treatment (`border: none; border-top: 1px solid var(--border-subtle); border-radius: 0;`). `.rebuild-status-box` → strip background/border/radius; plain mono block with `border-top: 1px solid var(--border-subtle); padding-top: 14px;` (also fixes frontend-craft F11 cards-in-cards).
- **Overview hierarchy** (anti-slop #8 + heydamir F24 + unslop-ui): lead with ONE hero line `X of 27 visible · N items` (20px/600, mono tabular numerals) with sub `Last rebuilt <absolute IST> · <relative, e.g. 3h ago>` (anti-slop #14; compute relative age in `renderOverview()`; append `· as of <time>` to items-cached). TMDB/Blob become a compact dot+text status list (no cards). Delete the four diag pill rows (lines ~932/943/954/965) and the static `27 rows total` pill.
- **Content width:** `#main-content { max-width: 1440px }` (heydamir F23; update the draft to match).
- **Inline styles → classes** (heydamir F29 + unslop-ui F7): `.diag-foot { margin-top: 10px; }` (replaces 4× inline), `.diag-split`, `.rebuild-lede`, `.rebuild-note`, `.rebuild-title` (16px/600), `.modal-title` (16px/600), `.rebuild-progress` (uses text-blue token, never hardcoded `#60a5fa`), `.quality-select-wrap`. Display-only toggles (`display:none`) may stay inline.
- **Titles preview:** wrap to 2 lines (`white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;`), drop the `title` attribute (anti-slop #26).
- **Empty state** (anti-slop #29): in `filterCatalogCards()`, zero matches → `<p class="empty-note">No rows match "X". <button>Clear filter</button></p>` (text-only, no illustration).
- **Load non-blocking** (anti-slop #20): show the app shell immediately after config loads (render Catalogs/Rows/Streams from config); fetch status in parallel via `Promise.allSettled`, render Overview when it lands (keep the existing "Checking…" placeholders visible instead of hiding the whole app).
- **Delete `backdrop-filter: blur(4px)`** from `.modal-backdrop` (anti-slop #21 wins over frontend-craft's exception — the 0.75 scrim does the work; keep the scrim).

## 5. Copy (exact strings — all skills agree)

- `'Settings Saved!'` → `'Settings saved'`; `'Rebuild Done!'` → `'Rebuild done'` (no `!`, sentence case).
- Delete trailing periods on subheads (login L~856, Overview, Rows, Streams, Rebuild subtitles). Two-sentence paragraphs keep their periods.
- Placeholder `Filter rows by name or type…` → `Search rows`.
- L~1084 → `"1080p recommended hai. 4K and CAM rips are always blocked."` (delete "instant, buffer-free").
- `KNOB_LABELS['visual-spectacles']`: `'4K IMAX Visual Spectacles'` → `'Visual spectacles'`.
- `High-speed P2P torrent search provider` → `Torrent search via Torrentio`; `Fast multi-source stream aggregator` → `Multi-source aggregator (Comet)`.
- Em-dashes: login-desc `—` → `. ` (two sentences); rebuild copy `— builder 27 rows…` → `: builder 27 rows…`; knob title `'Latest Indian Movies — OTT Ready'` → `'Latest Indian Movies · OTT Ready'`.
- Subtitle rewrites (anti-slop #16): Rows subtitle → `"Release windows, minimum ratings, and vote counts. Changes apply on the next rebuild."`; diag-sub `"Discovery & metadata pipeline"` → `"Movie and show discovery"`; login-desc → `"Admin Dashboard — Manage catalogs, row settings, stream providers, and run manual rebuilds."` — wait, that keeps an em-dash in body copy (allowed: login-desc dash is body copy, not a headline — frontend-craft/heydamir pass it). Keep the `—` there. Vary subtitle lengths (Catalogs keeps the longer Hinglish subtitle; Rebuild cut to `"Fetch fresh movies from TMDB and regenerate all 27 rows."`).
- Keep the Hinglish microcopy VERBATIM everywhere else — it is the product's only voice.

## 6. Motion (Emil is authoritative; heydamir F30 + anti-slop #18/#22 agree where cited)

- Easing tokens from §0 (`--ease-out`, `--ease-in-out`); replace every bare `ease` with `var(--ease-out)`; name every transitioned property (no `transition: background` shorthand → `background-color`).
- **Press feedback:** `.save-btn, .btn-primary, .btn-danger, .btn-icon, .nav-btn, .signout-btn { transition: transform 160ms var(--ease-out), background-color 150ms var(--ease-out), color 150ms var(--ease-out), opacity 150ms var(--ease-out); }` + `:active:not(:disabled) { transform: scale(0.97); }` (Emil wins over anti-slop's `translateY(1px)`).
- **Toasts:** transition-based enter/exit, 400ms Sonner timing (Emil wins over heydamir's 0.2s), same edge `translateY(-8px)`; JS adds `data-entering`, force reflow, removes on enter; dismiss sets `data-exiting` then `setTimeout(remove, 400)`. Keep 7s auto-dismiss.
- **Modal:** `.modal-backdrop { opacity: 0; transition: opacity 250ms var(--ease-out); }` + `[data-open]` → 1; `.modal-card { opacity: 0; transform: scale(0.97) translateY(4px); transition: opacity 250ms var(--ease-out), transform 250ms var(--ease-out); }` + `[data-open]` → settled. JS: open sets `display:flex`, reflow, adds `data-open`; close removes `data-open`, `setTimeout(hide, 200)`. Keep `backdrop-filter` deleted per §4 (static blur is gone anyway).
- **Modal a11y:** `role="dialog" aria-modal="true" aria-labelledby="authModalTitle"` + `<h3 id="authModalTitle">`; Escape closes + restores focus to the opener (store `document.activeElement` on open); Tab trap cycles `#modalPw`, `#modalCancelBtn`, `#modalSubmitBtn`.
- **View switching:** replace keyframe with `@starting-style` + transition (`opacity 150ms var(--ease-out), transform 150ms var(--ease-out)`); delete the `fadeIn` keyframes' use for panels (keep the name only if still needed — it is not after the toast fix).
- **Save:** glow deleted (§1); add the 14px CSS border spinner from §3 while `isSaving` (draft promised it; code lacked it).
- **Rebuild:** 16px CSS spinner (§3); result box gets `@starting-style` fade (`opacity 200ms var(--ease-out)`, `translateY(4px)→0`). Keep the 1s timer text unanimated.
- **Reorder:** FLIP via WAAPI only — record `getBoundingClientRect()` per `.cat-card` before the swap, re-render, then `el.animate([{transform: translateY(${dy}px)}, {transform: 'translateY(0)'}], {duration: 200, easing: 'cubic-bezier(0.23,1,0.32,1)'})` per moved card. Never animate `top`/`margin`.
- **Toggles:** `transition: background-color 150ms var(--ease-out)` / `transform 150ms var(--ease-out)` (no bounce/spring). **Focus ring:** `transition: border-color 150ms var(--ease-out), box-shadow 150ms var(--ease-out)`.
- **Status dot:** `transition: background-color 200ms var(--ease-out), box-shadow 200ms var(--ease-out)` — box-shadow stays in the transition list for the focus-ring case only; the glow itself is deleted.
- **Reduced motion (Emil's gentler version wins over anti-slop's nuke):**
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    .view-panel.active, .toast, .modal-card { transform: none !important; }
  }
  ```
- **Hover gating:** wrap ALL hover rules in `@media (hover: hover) and (pointer: fine) { … }` (his phone is a primary device).
- **Do NOT animate:** catalog search filter (instant show/hide is correct); nav switching beyond 150ms; diag/knob/list entrance stagger; diag numbers/timer text; toggle bounce, card hover lift, login entrance, blur animation; hold-to-confirm on Rebuild; Enter-key login / beforeunload.

## 7. Document / hygiene

- Version strings in admin.html (`v1.0.9` login badge, version tag, status pill) → `v1.1.0`.
- Update `dashboard-design-draft.md` (NOT committed — local record only): version → v1.1.0, max-width → 1440px, thesis line (see header), dark rationale → "dark-only per basant's explicit order (18 Nov 2026); no light mode", font rationale → "utility surface; OS type keeps attention on numbers; single-file constraint forbids a webfont".
- `body` gets `line-height: 1.5`.
- Skip link as first element in `<body>`: `<a href="#main-content" class="skip-link">Skip to content</a>` + `.skip-link { position:absolute; left:-9999px; } .skip-link:focus { left:16px; top:16px; … }`.
- Sidebar `.brand-title` span → `<h1 class="brand-title">Binge Addon</h1>` (same styling; the app view needs an `<h1>`).
- `#toastArea` gets `role="status" aria-live="polite"`.
- Add `/* unslop-ignore: … */` annotations ONLY where this file says so (toggle track 9999px; system font stack). Do not annotate anything else — everything else must actually be fixed.

## 8. KEEP — do not touch (consensus)

Hinglish microcopy verbatim; zero gradients/blobs/hero/fake stats; single-file zero-dependency constraint; left sidebar 5 tabs; toggle switches (real checkbox + label); dirty-state tracking + `beforeunload` + non-destructive 401 modal behavior (fix trap only); elapsed rebuild timer + auto-refresh; blue reserved for action (new hue `#2f6fed`); status dot + text label pairing; no charts; no light mode; no illustrations in empty states; modal 0.75 scrim; `↗`/`×` typographic marks; `●` dirty dot; `↑`/`↓` semantics (now SVG chevrons + aria-labels). Do NOT introduce cream+serif, a new gradient, a hero image, or any generated visual.

## 9. Conflicts resolved (for the record)

| Conflict | Decision | Reason |
|---|---|---|
| Palette: keep (heydamir) vs move off-swatch (unslop-ui, anti-slop) | MOVE off-swatch (§0) | The swatch-match IS the slop basant named; identity is kept (dark + one blue), only the framework hexes go |
| Tertiary: `#7d8ca3` vs `#7d8aa0` vs `#8fa0b3` | `#8fa0b3` | Brightest; all pass 4.5:1; 11–12px labels need the margin |
| Radius: 10/6/9999 (frontend-craft, draft) vs 12/8/6 (heydamir) | 12/8/6, 9999px toggle-only | Draft's own scale baked the slop in; heydamir's is the complete scale |
| Toasts: keep tints unified (heydamir) vs tint-free (frontend-craft) | Tint-free, color on `<strong>` only | Words-first; tinted toast = semantic-rainbow tell |
| Stripe: inset shadow (Emil) vs delete (frontend-craft) | DELETE | The stripe itself is the tell; Emil's fix preserves it |
| Title: 24px (frontend-craft) vs 20px (heydamir, anti-slop) | 20px | Dense utility panel; 24px is shouty; 2 of 3 reviewers say 20 |
| Toast duration: 400ms (Emil/Sonner) vs 200ms (heydamir) | 400ms | Emil is the motion authority; Sonner is the reference |
| :active: scale(0.97) (Emil) vs translateY(1px) (anti-slop) | scale(0.97) | Documented Emil pattern |
| Reduced motion: gentle (Emil) vs nuke-all (anti-slop) | Gentle | Keeps opacity/color legibility; only movement dies |
| Nav icons: delete (anti-slop) vs SVG set (3 others) | SVG set | Consensus 3–1; icons aid scanning; noted dissent |
| Modal blur: keep (frontend-craft exception) vs delete (anti-slop) | DELETE | 0.75 scrim does the work; blur costs a compositing layer |
| Login/modal shadow: keep (heydamir) vs delete (frontend-craft) | DELETE shadows, keep borders | Borders already separate them; satisfies the tell fully |
| Dark justification: weak (anti-slop) | Documented, keep dark-only | Basant ordered dark explicitly, multiple times — on record |
| System stack: false rationale (anti-slop) | Keep stack, rewrite rationale | Single-file constraint is real; "offline" was the false part |
| Max-width: 1000 (draft) / 1100 (file) / 1440 (heydamir) | 1440px | Laptop + 240px sidebar leaves dead margins at 1100 |
