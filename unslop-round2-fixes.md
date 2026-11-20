# Binge Admin Panel — Unslop Round 2 (council feedback fixes)

Round-1 council (3 fresh reviewers, frozen rubric): BEFORE 5/10, 5/10, 5/10 → **avg 5.0**.
AFTER 7/10, 7/10, 8/10 → **avg 7.33 (+2.33)**. All three: "genuine improvement,
not just a different default". Round 1 is a success; round 2 fixes the unanimous,
cheap, concrete flags. Nothing here is a redesign.

## Fix (6 items, all in app/lib/admin.html)

### R2-1. Mobile bottom bar leaks onto the login screen (ALL 3 reviewers, #1)
`#mobile-bottom-bar` shows `display: flex !important` under 899px unconditionally —
proven in /tmp/admin-375.png: logged-out login screen shows dead "Save Settings /
Sign out" buttons. Pre-existing bug (also in BEFORE), carried over.
Fix: gate the bar on login state — hide it whenever the login view is shown,
show it only when the app view is shown. Find the exact place where `#app` /
`#view-login` visibility is toggled and gate the bar in the same place.
Verify: fresh 375px screenshot of the LOGIN screen must show NO bottom bar;
logged-in view at 375px must still show it.

### R2-2. Rebuild button lost its distinction (ALL 3 reviewers)
`button.btn-danger { background: var(--accent-primary); }` makes the 45-second
rebuild action visually identical to Save / Sign in. The fix list deliberately
removed crimson ("crimson is error-only") — that decision stands, so do NOT
restore red. Instead restyle as OUTLINED:
```css
button.btn-danger { background: transparent; border: 1px solid var(--accent-primary); color: var(--text-blue); }
button.btn-danger:hover { background: rgba(47, 111, 237, 0.12); }
```
Distinct from the primary fill, no red anywhere. Keep the class name `btn-danger`
if JS references it (check first); only the style changes.

### R2-3. FLIP reorder animation has no reduced-motion guard (reviewer 1)
The CSS reduced-motion block cannot stop the WAAPI call in the reorder code
(`el.animate(...)`). Wrap it:
```js
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) { /* existing el.animate(...) */ }
```

### R2-4. Dead tokens (reviewers 1, 3)
`--ease-in-out`, `--text-xs`, `--text-lg`, `--text-xl`, `--space-1`–`--space-5`
reportedly have zero `var()` uses. Grep each one first; delete ONLY the ones
with genuinely zero uses. Report the grep count per token.

### R2-5. Toggle inputs are keyboard-invisible (reviewer 3)
The toggle `<input>` is `opacity: 0`, 0×0, with no focus rule — tabbing across
27 catalog toggles shows no focus indicator. Add (check the actual DOM
structure first — input + `.toggle-slider` siblings inside the label):
```css
input:focus-visible + .toggle-slider { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
```

### R2-6. Hero line duplicates the subline (all 3 reviewers noted it)
Builder deviation #4 appended "· as of <time>" to the hero line; the subline
already says "Last rebuilt <absolute> · <relative>". Remove the "· as of <time>"
from the hero line. Hero becomes `X of 27 visible · N items` only; sub keeps
last-rebuilt absolute + relative age.

## Deliberately NOT changing (recorded dissent)

- **max-width 1440px stays.** The "empty void" all three noted is VERTICAL
  (short page on a tall viewport) — no max-width fixes that, and adding filler
  would be slop. Honest consequence of a short page.
- **`.cat-card` stays a bordered card.** It is the interactive surface (toggle +
  rename input + reorder buttons); the fix list's rule is "interactive/form
  surfaces keep containment". Reviewers 2–3 wanted it ruled too — noted, rejected.
- **Toast 400ms stays.** Emil/Sonner timing (motion authority); reviewers
  preferred BEFORE's 200ms. A toast lives 7s; 400ms enter/exit is the Sonner
  standard. Noted.
- **Subtitles at 12px stay.** They are secondary text per the type scale
  (body is 14px); reviewer 2's "dominant copy shrank" misreads the scale.
- **`/* unslop-ignore: … */` comments stay.** Scanner annotations (standard
  practice, like eslint-disable) marking deliberate exceptions. Removing them
  would make a future scan flag legitimate uses.
- **Dimmed rows at opacity 0.6 stay.** The dim IS the "hidden" signal.

## Verify before reporting

1. Re-run scanner: must stay **0 / Clean, 0 findings**.
2. Greps: no `btn-danger` background fill left; `matchMedia('(prefers-reduced-motion` present in JS; `input:focus-visible + .toggle-slider` present; no "as of" in hero line; dead-token grep counts.
3. `node --check` on the extracted `<script>` block: PASS.
4. Screenshots (headless Chromium from Playwright cache, as round 1): login at
   375px (NO bottom bar) + logged-in Overview at 375px (bar present) + Overview
   at 1440px (hero line without as-of). Save to /tmp/admin-r2-*.png.
5. Local serve + curl 200.
6. Confirm: no other file touched; `git status` shows only app/lib/admin.html
   modified among tracked files.

## Report back

What you changed per item (with line numbers), scanner score, every grep count,
script check, screenshot paths, anything you could not do and why, any deviation
and its reason.
