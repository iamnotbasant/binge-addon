# Binge Admin Panel — Unslop Round 3 (final micro-round)

Round-2 council (3 fresh reviewers, frozen rubric): BEFORE 5, 4, 5 → **avg 4.67**.
AFTER 7, 7, 7 → **avg 7.0 (+2.33)**. Round 1 was 5.0 → 7.33 (+2.33).
Same delta, different (harsher) reviewer set — the improvement is confirmed twice.
Round 3 fixes the flags that 5–6 of 6 reviewers named. After this: re-score once
(round 3), then deploy. No round 4 — remaining disagreements are taste calls,
recorded at the bottom.

## Fix (11 items, all in app/lib/admin.html)

### R3-1. Rebuild button: solid LIGHT treatment, class renamed (6/6 reviewers)
Round 2 made it outlined blue — all 3 round-2 reviewers say it now reads as a
secondary link, subordinate to solid-blue Save. Round-1's problem was the
opposite (identical blue). Resolution that satisfies both: Rebuild becomes the
SOLID LIGHT button — distinct from the blue primary, no red anywhere:
```css
button.btn-rebuild { background: var(--text-primary); color: var(--bg-canvas); border: none; }
button.btn-rebuild:hover { background: #e6e4df; }
```
Rename the class `btn-danger` → `btn-rebuild` (round-2 verified no JS references
it by class — only `id="rebuildActionBtn"`; grep to confirm before renaming,
and rename every occurrence: CSS rule, hover rule, markup). Update the `:active`
shared rule if it lists `.btn-danger` by name.

### R3-2. Toast 400ms → 200ms enter/exit (6/6 reviewers)
The most-seen animation is the slowest in the file. Cut the toast transition
duration 400ms → 200ms AND the JS `setTimeout(remove, …)` delay to match
(find both — they must agree, or the exit is cut short / lingers).

### R3-3. Modal: opacity only, hide timeout fixed (reviewers 2–3, round 2)
Drop `scale(0.97) translateY(4px)` from `.modal-card` (opacity fade only).
`hideAuthModal` hides after 200ms while the fade is 250ms — change the timeout
to 250ms so the fade is not cut short.

### R3-4. Hero line: sans, not mono (3/3 round-2 reviewers)
`.hero-line` forces `font-family: var(--font-mono)` — reads like a terminal
log ("0 of 27 visible · 0 items"). Remove the mono family from the hero line
(numbers stay aligned via the existing `tabular-nums` on `body`).

### R3-5. Save button: full opacity + visible dirty state (reviewers 2–3, round 2)
Clean `.save-btn` sits at `opacity: 0.7` on white-on-`#2f6fed` (4.55:1) — the
most-clicked button is the dimmest text in the app, and dirty (● + bold) is
nearly invisible. Fix: clean opacity `0.7` → `1`; dirty state becomes
`background: var(--border-focus)` (lighter blue, visible brightening) + the
existing `●` label + `font-weight: 700`. `:disabled` stays `0.6` (now clearly
distinct from clean `1.0`).

### R3-6. Dimmed rows: opacity 0.6 → 0.85 (reviewer 2, round 2)
`.cat-card.dimmed { opacity: 0.6 }` drags hidden-row text to ~3.4:1, undoing the
contrast win exactly on rows the user just hid. `0.85` keeps the dim readable
(~6:1) while the "Hidden from Nuvio" dot+text remains the real signal.

### R3-7. Catalog rows: ruled list like knob cards (5/6 reviewers)
`.cat-card` is the most-repeated surface (27×) and the only one that kept a
filled box + border + 12px radius, while `.card`/`.knob-card` were de-carded —
the visual language contradicts itself. The round-1 "interactive keeps
containment" rule is already inconsistent (knob inputs sit in ruled sections).
Fix: `.cat-card` → `background: transparent; border: none; border-top: 1px solid
var(--border-subtle); border-radius: 0; padding: 14px 0;` (same as `.knob-card`).
The rename `<input>` inside keeps its own border; the row's own padding/gaps
stay as-is otherwise.

### R3-8. Copy: de-jargon the two remaining subtitles (reviewer 2, round 2)
- Overview subtitle "Live system diagnostics, storage connectivity, and quick
  resource links" → "System status and quick links."
- Resource hub "configuration artifacts" → plain words, e.g. "config, manifest
  and badges" (find the exact string first; keep it short and plain).
Do NOT rename knob titles ("Mind-Bending Sci-Fi & Time Travel" etc.) — those
mirror basant's own catalog names; changing the admin label without changing
config would create inconsistency.

### R3-9. Mobile nav: stop truncating labels (reviewers 2–3, round 2)
At 375px the nav truncates to "Row settin…" with no scroll affordance. Fix:
mobile nav gets `overflow-x: auto` + `white-space: nowrap` on the buttons so
labels scroll instead of truncating.

### R3-10. Password toggle: aria-pressed state (reviewer 2, round 2)
The Show/Hide password toggle has no state announcement. Add
`aria-pressed="false"` initially and toggle it in the existing show/hide
handler.

### R3-11. Reduced-motion spinner: static ring, not frozen mid-arc (reviewer 2, round 2)
The reduced-motion block sets `animation-duration: 0.01ms`, freezing the
spinner mid-arc. Add inside the reduced-motion block:
```css
.spinner { animation: none; border-top-color: var(--border-subtle); }
```

## Deliberately NOT changing (recorded dissent)

- **max-width 1440px stays.** The "empty void" is VERTICAL (short page, tall
  viewport) — no max-width fixes it; filler would be slop.
- **Toast keeps an exit animation** (200ms now, not 0) — toasts must not
  teleport; 200ms is the compromise between Emil/Sonner 400ms and BEFORE's 200ms
  fade-in. (Round 3 adopts the reviewers' number.)
- **Version `v1.1.0` stays hardcoded in 3 places.** It is a build-time constant
  set at deploy, not runtime data like row counts — hardcoding it is standard
  practice, not the same lie. (Reviewer 1, round 2, disagreed.)
- **"Search rows" placeholder stays.** Shorter and plain; the longer
  "Filter rows by name or type…" is marginally more helpful but the behaviour
  is obvious as-you-type. (Reviewer 3, round 2, disagreed.)
- **Knob helpers stay 11px.** At 7.27:1 they pass AA; the scale reserves 11px
  for meta text only.
- **White-on-`#2f6fed` 4.55:1 stays.** Marginal AA pass; darkening the accent
  would re-open the whole ramp. Clean-state opacity is now 1.0 (R3-5), so the
  effective contrast is the full 4.55:1.
- **`unslop-ignore` comments stay.** Scanner annotations for deliberate
  exceptions (standard practice).

## Verify before reporting

1. Re-run scanner: must stay **0 / Clean, 0 findings**.
2. Greps: `btn-danger` = 0 hits anywhere; `btn-rebuild` present (CSS + markup);
   toast `200ms` present and `400ms` = 0 in toast rules + JS timeout; modal
   `scale(` = 0 in modal rules; `.hero-line` has no `font-mono`; `.save-btn`
   clean opacity 1; `.cat-card` has no `background: var(--bg-card)`; `aria-pressed`
   present on password toggle.
3. `node --check` on the extracted `<script>` block: PASS.
4. Screenshots (headless Chromium from Playwright cache): Rebuild view at
   1440px (solid light Rebuild button visible) + Overview at 1440px (sans hero)
   + Catalogs at 1440px (ruled rows, no boxes) + login at 375px (no bottom bar
   — regression check). Save to /tmp/admin-r3-*.png.
5. Local serve + curl 200.
6. Confirm via git status that only app/lib/admin.html is modified among
   tracked files; diff against /tmp/admin-r1.html.bak must show only rounds
   1–3 changes.

## Report back

What you changed per item (with line numbers), scanner score, every grep count,
script check result, screenshot paths, anything you could not do and why, any
deviation and its reason.
