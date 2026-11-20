# Binge Addon — Admin Dashboard Redesign: Design Draft (Elephant v2)

> **Document:** Design Specification for Binge Addon Admin Dashboard (`/admin`)  
> **Target Version:** v1.1.0 (un-slop pass on the v1.0.9 admin panel; v1.0.8 was this draft's original target, v1.0.7 the nuviobadges.com style upgrade)  
> **Author:** Elephant (EGM Method) — DESIGN ONLY (no code, no implementation, no git, no deploy)  
> **Target Files Affected:**
> - `app/lib/admin.html` (single self-contained UI dashboard file)
> - `app/api/admin/rebuild.js` (NEW: dedicated serverless endpoint for authenticated manual rebuilds, `maxDuration: 300`)
> - `app/vercel.json` (configure `api/admin/rebuild.js` with `maxDuration: 300`)
> - `app/index.js` (status API optimization, version bump to v1.1.0)
> - `app/api/cron/rebuild.js` (enforce `Bearer CRON_SECRET` authentication)
> - `app/scripts/build-catalogs.js` (persist `catalogs/_summary.json` at end of rebuild)
> - Version bump manifest files: `app/lib/manifest.js`, `app/package.json`, `app/package-lock.json`, and `DEPLOY.md`  
> **Date:** 18 Nov 2026  
> **Thesis (v1.1.0 un-slop):** "A quiet ledger: near-neutral black surfaces, one blue reserved only for action, mono numerals, Hinglish microcopy as the only voice."

---

## 1. Goal

Rebuild the Binge Addon admin dashboard (`/admin`) into a high-craft, dark-themed control panel modeled after modern open-source Stremio settings interfaces (specifically the AIOMetadata configuration experience). The dashboard must:
1. **Be effortless for a Gen-Z teenager**: Plain-language labels, clear mental models, zero raw database terminology, zero developer jargon, accompanied by helpful bilingual Hindi-English microcopy.
2. **Guarantee 100% functional parity**: Allow editing every catalog (show/hide, rename, move up/down), every row tuning knob (`windowDays`, `voteFloor`, `voteCountFloor`, and `voteCountCeil` as 'Maximum votes'), stream provider toggles (Torrentio, Comet, HdHub), and stream quality caps (1080p / 720p).
3. **Make the connected flow visible**: Explicitly show how settings travel from dashboard `Save` &rarr; Vercel Blob &rarr; live manifest within ~1 minute &rarr; Nuvio desktop app on refresh.
4. **Fix two critical system defects**:
   - Eliminate the cold-start HTTP 504 Gateway Timeout on `GET /admin/api/status` by introducing a primary summary manifest with a parallel Blob fetch fallback, prefix-list filtering, and disabled-row merging.
   - Close the unauthenticated hole on `/api/cron/rebuild` (enforce `Bearer CRON_SECRET` strictly) and route dashboard manual rebuilds through a dedicated, authenticated serverless function (`/api/admin/rebuild`) configured with `maxDuration: 300`.
5. **Strictly avoid AI slop**: Deep dark slate/charcoal tones, single clean accent colour (electric blue), system font stack, high-contrast typography, zero purple/blue gradients, zero emoji soup, and zero fake stats.
6. **Dark-only per basant's explicit order (18 Nov 2026); no light mode.**

---

## 2. Reference UIs Studied

### 2.1 AIOMetadata Configure Page (`cedya77/aiometadata`)
- **Visual Language**: Modern dark design system inspired by Shadcn UI and Tailwind. Deep charcoal canvas (`#0b0f17`), raised dark slate card containers (`#141c2b`), crisp 1px borders (`#1e293b`), and subdued muted secondary text (`#94a3b8`).
- **Sidebar Navigation**: Fixed left-hand vertical navigation sidebar separating complex configuration into distinct, focused domains (Overview, Catalogs, Rows, Streams, Rebuild) rather than an overwhelming single endless scroll.
- **Component Controls**: Rounded pill toggle switches (replacing raw HTML checkboxes), clean number steppers with inline units, and sticky actionable save triggers.
- **Microcopy**: Short explanatory sentences immediately below control labels telling the user exactly what effect the setting has on the client (Nuvio / Stremio).

### 2.2 Other Open-Source Settings Interfaces (MediaFusion, Torrentio, Comet)
- **Torrentio**: High utility, but too primitive (no live feedback, no reordering, raw native browser checkboxes).
- **MediaFusion**: Comprehensive feature set, but overly dense, intimidating technical jargon, and lacks clean visual hierarchy.
- **Key Architectural Takeaway**: Adopt the clean left-sidebar layout, card structure, and switch toggles from AIOMetadata, but deliver it as a **single, zero-dependency vanilla HTML/CSS/JS file** (`app/lib/admin.html`) without React, Tailwind CLI, external CDNs, or offline-fragile web fonts.

---

## 3. Layout Architecture & Navigation

The new dashboard replaces the single long scrolling page with a persistent **Left Sidebar Navigation** paired with an **Active Content View** on the right.

```
+--------------------------------------------------------------------------------------------------+
|  BINGE ADDON [v1.1.0]              |  Catalog Management                                         |
|  Status: Connected [●]             |  Manage all 27 rows shown in Nuvio                          |
+------------------------------------+-------------------------------------------------------------+
|  [≡] Overview                      |  +-------------------------------------------------------+  |
|                                    |  | [Toggle] Trending in India (Movie)                    |  |
|  [■] Catalogs (27 rows)            |  | Name: [Trending in India              ] [Movie]       |  |
|                                    |  | Items: 20 items   Top: Jawan, Animal, Stree 2  [↑][↓] |  |
|  [⚙] Row Settings                  |  +-------------------------------------------------------+  |
|                                    |  | [Toggle] Trending in India (Series)                   |  |
|  [▶] Stream Sources                |  | Name: [Trending in India              ] [Series]      |  |
|                                    |  | Items: 20 items   Top: Mirzapur, Panchayat     [↑][↓] |  |
|  [⚡] Rebuild Catalogs             |  +-------------------------------------------------------+  |
|                                    |                                                             |
|------------------------------------|                                                             |
|  [Save Settings] (Dirty Dot ●)     |                                                             |
|  [Sign Out]                        |                                                             |
+--------------------------------------------------------------------------------------------------+
```

### 3.1 Authentication Screen (`#view-login`)
- Clean, centered login card on dark canvas (`#0b0f17`).
- Password input with toggle visibility, enter key binding, clear error feedback on HTTP 401/503.
- Persists session in `sessionStorage.getItem('bs-admin-pw')` — never saved in cookies, local storage, or URL queries.

### 3.2 Main App Shell (`#app`)
- **Left Sidebar** (Width: 240px, fixed desktop/laptop, sticky full-height):
  - **Brand Header**: Addon title (`Binge Addon`), version badge (`v1.1.0`), and binary real-time connectivity dot:
    - Green (`#10b981`) = Healthy (both TMDB key and Blob storage connected).
    - Red (`#ef4444`) = Error (either TMDB key or Blob storage missing).
    *(No ambiguous amber/degraded state since backend status exposes binary booleans `tmdbKeySet` and `blobSet`).*
  - **Nav Links** (5 tabs):
    1. **Overview**: Live status indicators, quick resource links, system diagnostics.
    2. **Catalogs**: All 27 rows with on/off switches, inline renaming, item counts, top titles, and reordering.
    3. **Rows**: Fine-tuning release windows, minimum rating floors, vote count floors, and maximum vote ceilings.
    4. **Streams**: Scraper source toggles and video quality limits.
    5. **Rebuild**: Manual catalog build trigger, progress state, and build stats.
  - **Sidebar Footer (Single Unified Save Point)**:
    - Sticky `Save Settings` button with animated saving spinner and unsaved dirty state badge.
    *(To avoid confusion, this is the single primary Save button in the entire interface; duplicate header buttons are omitted).*
    - `Sign Out` button (clears `sessionStorage` and returns to login view).

### 3.3 Responsive Breakpoint Specification
- **Primary Target**: Desktop and laptop displays (viewport width &ge; 1024px).
- **Responsive Collapse (< 900px)**:
  - Sidebar transitions from vertical column to a sticky top horizontal navigation bar with horizontally scrollable tab pills.
  - Content container takes 100% viewport width with 16px horizontal padding.
  - Sidebar Save button docks as a sticky bottom action bar.

### 3.4 The 5 View Panels (`#view-*`)

#### Panel 1: Overview
- **Diagnostic Cards Grid**:
  - *Addon Core*:
    - Name: `Binge Addon` (from `status.addon` / `MANIFEST.name`)
    - Version: `v1.1.0` (from `status.version`)
    - Manifest ID: `com.bharatstreams` (hardcoded reference from `MANIFEST.id`)
  - *TMDB Movie Database*:
    - Status pill: `Connected` (Green) if `status.tmdbKeySet === true`, else `Missing Key` (Red).
    *(Fictional latency indicators are strictly dropped; status API returns only the boolean `tmdbKeySet`).*
  - *Cloud Storage (Vercel Blob)*:
    - Status pill: `Connected` (Green) if `status.blobSet === true`, else `Not Configured` (Red), Mumbai region.
  - *Catalog Counts*:
    - Active rows: e.g. `27 of 27 visible` (calculated from `status.catalogs` where `disabled !== true`).
    - Total cataloged items: e.g. `540 items` (sum of all row item counts, marked as dynamic example).
  - *Update Schedule*:
    - Last catalog build: `status.lastBuiltAt` formatted in Indian Standard Time (IST) (e.g. *"Today at 10:30 AM IST"*), or *"Never / Pending"* if null.
    - Next automated cron run: `status.nextCron` (*"Daily 05:00 UTC = 10:30 IST"*).
- **Resource Hub**: Direct clickable links to all essential project endpoints:
  - `manifest.json` (`${status.liveUrl}/manifest.json`)
  - `badges.json` (`${status.liveUrl}/badges.json`)
  - `Live URL` (`status.liveUrl`) — direct link to live addon root
  - `Vercel Project` (`status.projectUrl`)
  - `Live Health` (`${status.liveUrl}/health`)

#### Panel 2: Catalogs
- Summary counter: `Showing X of 27 rows in Nuvio`.
- **Search/Filter Bar (Client-Side Only)**:
  - Text input to instantly filter the 27 catalog cards by row title or type (`Movie` / `Series`).
  - Implemented entirely in client-side JS; zero API requests, instant filtering.
- **Row Card Items**:
  - **Visibility Switch**: Smooth toggle switch on the left (`Active` vs `Hidden`). When disabled, row card dims with an explicit `Hidden from Nuvio` tag.
  - **Name Field**: Text input for renaming rows in Nuvio.
  - **Media Type Badge**: Subtle pill indicating `Movie` or `Series`.
  - **Item Count**: Pill showing current cached count (e.g. `20 items`).
  - **Sample Titles**: Top 3 titles currently listed (e.g. *"Jawan, Animal, Stree 2"*).
    *(Crucial: displays human-readable title strings `m.name`, never raw IDs).*
  - **Order Controls**: `↑` and `↓` buttons to move row position up or down.

#### Panel 3: Rows (Tuning Knobs)
- Clean card grid grouping configurable rows (e.g. Digital drops, OTT releases, Releasing next 30 days, South blockbusters, Underrated gems, Thrillers, Action, etc.).
- Each card contains only relevant knobs with Gen-Z friendly labels:
  - *Release window (days)*: `windowDays`
  - *Minimum rating*: `voteFloor` (0–10 step 0.1, TMDB vote average)
  - *Minimum votes*: `voteCountFloor` (min 0 step 100)
  - *Maximum votes*: `voteCountCeil` (min 0 step 100, rendered for `#13 Underrated Indian Gems`)
- Instant validation: bounds checking (`windowDays` 1–1825, `voteFloor` 0–10, `voteCountFloor` &ge; 0, `voteCountCeil` &ge; 0).

#### Panel 4: Streams
- **Source Scrapers Card**:
  - Torrentio (Toggle switch)
  - Comet (Toggle switch)
  - HdHub (Toggle switch)
  - Subtitle: *"Streams are fetched in parallel with a 7-second cutoff; disabled scrapers are skipped immediately."*
- **Resolution Limit Card**:
  - Segmented toggle or clean dropdown:
    - `1080p Full HD (Recommended)`
    - `720p HD (Data Saver)`
  - Reassurance microcopy: *"4K and CAM rips are always blocked to ensure instant, buffer-free playback on Indian home broadband."*

#### Panel 5: Rebuild
- **Manual Trigger Console**:
  - Big action button: `Rebuild Catalogs Now` (accent crimson for intentional action).
  - Status narrative: Explains what rebuild does (runs TMDB discovery pipeline, updates Blob caches).
  - Progress state: Spinner with elapsed time counter and keep-tab-open notification.
  - Rebuild API Route: Calls dedicated `POST /api/admin/rebuild` (300s timeout budget).
  - Results summary banner: Upon completion, shows updated counts per catalog and total item count. Handles both `{ skipped: false, counts: {...} }` and `{ skipped: true, error: '...' }`.

---

## 4. Colour, Typography & Spacing Tokens

### 4.1 Colour Palette (Strict "No AI Slop" Standard)
- **Canvas / Background**: `#0b0f17` (Deep dark slate, neutral dark base)
- **Sidebar Background**: `#0e1420` (Subtly distinct dark nav column)
- **Card / Surface**: `#141c2b` (Elevated dark card surface)
- **Card Hover / Active**: `#1a2436`
- **Borders & Dividers**: `#1e293b` (Subtle 1px border)
- **Border Focus**: `#3b82f6` (Clean electric blue glow, no purple)
- **Text Primary**: `#f8fafc` (98% off-white, high contrast readable)
- **Text Secondary / Muted**: `#94a3b8` (Slate secondary, 70% contrast)
- **Text Tertiary / Disabled**: `#64748b`
- **Accent Primary**: `#2563eb` (Solid blue button / toggle on state)
- **Accent Primary Hover**: `#1d4ed8`
- **Success / Connected**: `#10b981` (Emerald green; background tint `rgba(16, 185, 129, 0.12)`)
- **Danger / Destructive / Error**: `#ef4444` (Crimson red; background tint `rgba(239, 68, 68, 0.12)`)

### 4.2 Typography
- **Font Family**: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`  
  *(Zero external Google Fonts or Typekit dependencies; loads offline instantly).*
  **Font rationale (v1.1.0):** utility surface; OS type keeps attention on numbers; single-file constraint forbids a webfont.
- **Monospace Family**: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`  
  *(For IDs, timestamps, and version tags).*
- **Scale**:
  - App / Brand Title: `18px`, Weight 700, letter-spacing `-0.01em`
  - View Title: `20px`, Weight 600, letter-spacing `-0.02em`
  - Card Header: `15px`, Weight 600
  - Body Text: `14px`, Weight 400, line-height `1.5`
  - Form Labels & Microcopy: `12px` / `13px`, Weight 500
  - Badges & Pills: `11px`, Weight 600, letter-spacing `0.02em`

### 4.3 Spacing & Dimensions
- Sidebar Width: `240px`
- Content Max-Width: `1440px` (centered in remaining viewport)
- Padding:
  - Sidebar: `20px 16px`
  - Content container: `24px 32px`
  - Cards: `16px 20px`
- Border Radius:
  - Cards: `10px`
  - Inputs & Buttons: `6px`
  - Badges & Switches: `9999px` (full pill)
- Gaps:
  - Card stack: `12px`
  - Grid columns: `12px`
  - Form rows: `10px`

### 4.4 Form Control Specifications
- **Toggle Switch**:
  - Outer track: `38px` width &times; `20px` height, rounded pill.
  - Track color: `#334155` (off) &rarr; `#2563eb` (on).
  - Thumb: `16px` circle, white, smooth `transform 0.15s ease`.
- **Text Inputs**:
  - Background `#0b0f17`, border `1px solid #1e293b`, text `#f8fafc`.
  - Padding `8px 12px`, border-radius `6px`.
  - Focus: border color `#3b82f6`, box-shadow `0 0 0 2px rgba(59, 130, 246, 0.2)`.

---

## 5. What Stays vs. What Goes

| Existing Dashboard Element | Status in Redesign | Reason / Replacement |
|---|---|---|
| **Vercel Blob `config.json` contract** | **STAYS 100% UNCHANGED** | Server and builder rely on exact schema: `{ catalogs: {...}, knobs: {...}, streams: {...} }`. Never mutate shape. |
| **All 27 Catalogs** | **STAYS 100%** | All 27 catalogs from `manifest.js` configurable (enable/disable, rename, reorder). |
| **Password Authentication Gate** | **STAYS 100%** | Requires `X-Admin-Password` matching `ADMIN_PASSWORD`. Session kept in `sessionStorage`. |
| **Stream Toggles & Quality Cap** | **STAYS 100%** | Torrentio, Comet, HdHub, 1080p/720p selector remain fully functional. |
| **Row Knobs (`windowDays`, `voteFloor`, `voteCountFloor`)** | **STAYS 100%** | Every knob from `config.defaultConfig()` preserved. |
| **`voteCountCeil` (Maximum votes)** | **STAYS 100% (EDITABLE)** | Kept on rows that define it (Underrated Gems) with label **"Maximum votes"**. Full capability parity. |
| **Diagnostic & Live Links** | **STAYS 100%** | Links to `manifest.json`, `badges.json`, `Live URL`, Vercel project, and `/health` kept in Overview. |
| **Single Self-Contained File** | **STAYS 100%** | Everything packaged inside `app/lib/admin.html` with no build step and no external assets. |
| *Light Theme (`#f6f8fb` background, white cards)* | **GOES** | Replaced with AIOMetadata-inspired dark theme (`#0b0f17` canvas, `#141c2b` cards). |
| *Long Scrolling Single Page* | **GOES** | Replaced with structured 5-tab Left Sidebar Navigation. |
| *Bare Native Browser Checkboxes* | **GOES** | Replaced with modern CSS pill toggle switches with accessible labels. |
| *Raw Unstyled HTML Table for Catalogs* | **GOES** | Replaced with sleek catalog row cards with clear status pills and inline edit fields. |
| *Unauthenticated Rebuild Call to `/api/cron/rebuild`* | **GOES** | Replaced with authenticated `POST /api/admin/rebuild` (dedicated serverless function with `maxDuration: 300`). |
| *Duplicate Header Save Buttons* | **GOES** | Replaced with single persistent Save trigger in the sidebar footer. |

---

## 6. Plain-Language Labels (Gen-Z Teenager Friendly)

Every raw database key and developer acronym is mapped to clear, intuitive plain language with bilingual Hindi-English helper microcopy:

| Technical Contract Key | Old Dashboard Label | New Dashboard Plain Label | Helper Microcopy / Hint |
|---|---|---|---|
| `enabled` (catalog) | Show (checkbox) | **Show in Nuvio** (Toggle switch) | *"Band karoge to Nuvio se row gayab ho jayegi; on karoge to wapas aa jayegi."* |
| `name` (catalog) | Name in Nuvio | **Row Name** (Input) | *"Nuvio screen pe ye naam dikhega."* |
| `order` (catalog) | Order (↑ ↓) | **Row Position** (Move buttons) | *"Upar ya neeche shift karo."* |
| `windowDays` | Window (days) | **Release Window** | *"Pichhle kitne dino ki releases dikhani hain (e.g. 45 days)."* |
| `voteFloor` | Vote floor (0–10) | **Minimum Rating** | *"Isse kam TMDB rating wali movies filter out ho jayengi (e.g. 7.5)."* |
| `voteCountFloor` | Min votes | **Minimum Votes Required** | *"Kam se kam itne logon ne vote kiya ho, taaki bekar movies na aayein (e.g. 1000)."* |
| `voteCountCeil` | Max votes | **Maximum Votes** | *"Isse zyada votes wali popular movies filter out ho jayengi taaki sirf chhupi hui gems dikhein (e.g. 25000)."* |
| `torrentio` / `comet` / `hdhub` | Scraper names | **Stream Providers** | *"Kaunse search engines se streams fetch karni hain."* |
| `maxQuality` | Max quality | **Maximum Video Quality** | *"1080p recommended hai. 4K disabled hai taaki buffering na ho."* |
| `tmdbKeySet` | TMDB key | **TMDB Movie Database** | *Connected (Green) / Missing Key (Red)* |
| `blobSet` | Blob store | **Cloud Storage (Vercel Blob)** | *Connected (Green) / Disconnected (Red)* |
| `lastBuiltAt` | Last rebuild | **Last Catalog Update** | *Formatted as readable IST (e.g. "Today at 10:30 AM IST")* |
| `nextCron` | Next cron | **Next Auto-Update** | *"Roz subah 10:30 AM IST automatically update hota hai."* |
| `Manual Rebuild` | Manual Rebuild | **Rebuild Catalogs Now** | *"TMDB se fresh movies fetch karke naye rows banata hai (~45 sec lagte hain)."* |

---

## 7. Connected Flow, Feedback Loop & State Handling

The user must have zero ambiguity about how changes reach Nuvio. The interface explicitly visualizes the two distinct update speeds:

```
[ Dashboard Action ]                     [ Storage & Propagation ]                [ Nuvio Client ]
1. Toggle / Rename / Reorder / Streams -> Blob config.json (instant) -----------> Live in Manifest (~60s)
                                          (Server cache TTL: 60s)                 Just refresh / reopen Nuvio!

2. Row Knobs (Windows / Rating floors) -> Blob config.json (instant) -----------> Rebuild Needed!
                                          Requires "Rebuild Catalogs Now" -------> Runs builder (~45s) -> Live!
```

### 7.1 Fast Path: Config Updates (Show/Hide, Rename, Reorder, Streams, Quality)
- When user clicks **Save Settings**:
  1. Save button transitions to loading spinner: `Saving changes…`
  2. Submits `POST /admin/api/config` with `X-Admin-Password`.
  3. On success, an alert toast appears at the top right:
     > **Settings Saved!**  
     > *Nuvio me ~1 minute me dikhega. Nuvio ko refresh ya restart kar lo.*
  4. An informational status badge notes:
     `Server manifest cache refreshes within ~60s (Nuvio client may also cache).`
     *(This is informational UX guidance explaining cache TTL, not an absolute clock guarantee).*

### 7.2 Heavy Path: Row Content Updates (Tuning Knobs)
- When changing date windows or rating floors in the **Rows** tab:
  - An inline banner reminds the user:
    > **Note on Row Knobs:**  
    > *Window ya rating badalne ke baad **Rebuild Catalogs** dabana zaroori hai, tabhi naye items Nuvio me aayenge.*

### 7.3 Rebuild Progress & Completion Flow
- When user triggers **Rebuild Catalogs Now**:
  1. Action triggers `POST /api/admin/rebuild` (dedicated serverless function with `maxDuration: 300`).
  2. Rebuild button disables immediately, showing elapsed timer: `Rebuilding catalogs… 00:23 / ~00:45`.
  3. Notice displayed: `Tab band mat karna — builder TMDB se 27 rows generate kar raha hai.`
  4. Concurrency Policy:
     - Manual rebuild and automated cron rebuild write atomically to Blob objects with `allowOverwrite: true`.
     - The dashboard disables the Rebuild button during execution to prevent duplicate manual triggers.
     - In the rare event a manual rebuild overlaps with the daily 10:30 AM IST cron, Blob writes are atomic per object (`put` with `allowOverwrite: true`), ensuring yesterday's files serve until replaced, with zero risk of file corruption.
  5. Response Handling:
     - If API returns `{ ok: true, skipped: false, counts: {...} }`:
       - Success banner appears:
         > **Rebuild Done!**  
         > *27 rows updated. Total items: 540 (e.g.).*  
         > *Trending Indian Movie: 20 items · Series: 20 items.*
       - Overview status cards and catalog count badges **auto-refresh immediately** via `GET /admin/api/status` without requiring a full browser page reload.
     - If API returns `{ ok: false, skipped: true, error: '...' }`:
       - Crimson alert toast informs the user why rebuild was skipped (e.g. `TMDB_API_KEY is not configured on Vercel`).

### 7.4 State & Failure Handling (New in v2)

To ensure a rock-solid, production-grade admin experience across multi-view navigation, the client implements the following state and failure model:

#### 7.4.1 In-Memory Dirty State Tracking Across Views
- The client maintains two in-memory objects:
  - `savedConfig`: Deep clone of the configuration currently saved in Vercel Blob.
  - `draftConfig`: Working copy mutated by user edits across all panels (Catalogs, Rows, Streams).
- Switching between sidebar tabs (e.g. renaming a row in Catalogs &rarr; switching to Rows to adjust a rating &rarr; switching to Streams) **never discards draft edits**. All panels read from and write to the shared `draftConfig`.
- A continuous dirty-check comparison (`JSON.stringify(draftConfig) !== JSON.stringify(savedConfig)`) updates UI state:
  - **Clean state**: Save button remains idle (`opacity: 0.7`).
  - **Dirty state**: Save button highlights in electric blue with an active indicator: `Save Settings ● (Unsaved edits)`.
  - **Browser Navigation Protection**: An `onbeforeunload` listener warns the user if they attempt to refresh or navigate away while `draftConfig` has unsaved changes.

#### 7.4.2 401 Mid-Edit Session Recovery (Edit Preservation)
- If `ADMIN_PASSWORD` is invalidated, or the session expires while a user is actively editing:
  - The API returns HTTP 401.
  - The application **must never wipe `draftConfig`** or crash back to a blank login view.
  - A non-destructive modal re-authentication overlay appears:
    > **Session Expired**  
    > *Please enter your admin password to save your pending changes.*
  - The user enters the password. The client validates it against `/admin/api/config`, updates `sessionStorage`, closes the modal overlay, and automatically completes the pending `Save` action without losing a single keystroke.

#### 7.4.3 Save Failure Notification & Recovery
- If `POST /admin/api/config` fails due to a network glitch or HTTP 500:
  - The Save button resets from spinner to active state.
  - A sticky crimson error toast appears:
    > **Save Failed: [Error Message]**  
    > *Your edits are safely kept in your browser. Check your connection and click Save Settings to retry.*
  - No draft data is rolled back, allowing immediate retry.

#### 7.4.4 Render Strategy & Input Focus Preservation
- In the Catalogs view (27 row cards):
  - Typing in a catalog name input or dragging a knob stepper **must not trigger a full container `innerHTML` re-render**. Wiping `innerHTML` destroys DOM nodes, instantly stealing input focus and resetting the user's scroll position.
  - **Targeted DOM Updates**:
    - Input `input` / `change` event listeners mutate `draftConfig` directly without touching the DOM tree.
    - Status pills (e.g. `Active` vs `Hidden`) update classes and text directly on the individual card DOM node.
    - Full list re-renders are strictly restricted to: (1) initial page load, and (2) structural row reordering (`↑` / `↓` button clicks).

---

## 8. Defect Root Cause Analysis & Concrete Fixes

### 8.1 Defect 1: HTTP 504 Gateway Timeout on `GET /admin/api/status`

#### Correct Root Cause Analysis
- In `app/index.js` (lines 228–229):
  ```js
  for (const c of effectiveCatalogs(cfg)) {
    const file = await readCatalogMeta(c.id);
    ...
  ```
- In `app/lib/store.js` (lines 16–44), `readCatalogFile` maintains an in-memory cache:
  `const CACHE_TTL_MS = 5 * 60 * 1000;` (5 minutes).
- On **warm** serverless instances, catalog metadata is already cached in memory, so `/admin/api/status` returns rapidly.
- However, on a **cold serverless container** (or when the 5-minute cache has expired):
  - The sequential loop iterates through up to 27 catalogs.
  - For each catalog, `readCatalogMeta` calls `@vercel/blob` `list({ prefix: key, token })` followed by `await fetch(file.url)`.
  - That constitutes **54 sequential HTTP network round-trips over the public internet**.
- `app/vercel.json` configures a hard execution timeout: `"api/index.js": { "maxDuration": 10 }`.
- Cold-start Node runtime initialization + `@vercel/blob` SDK instantiation + 54 sequential network requests easily exceeds 10,000ms. Vercel terminates the function with `HTTP 504 Gateway Timeout`.

#### Concrete Technical Fix Specification

1. **Primary Mechanism — Lightweight Summary Manifest (`catalogs/_summary.json`)**:
   - In `app/scripts/build-catalogs.js`, at the end of `main()`, immediately following `await writeRowsToBlob(rows, idMap, token)`:
     Write a single summary manifest `catalogs/_summary.json` to Vercel Blob:
     ```js
     const summary = {
       builtAt: new Date().toISOString(),
       catalogs: Object.fromEntries(
         Object.entries(rows).map(([id, metas]) => [
           id,
           {
             count: metas.length,
             top: metas.slice(0, 3).map((m) => m.name),
             builtAt: new Date().toISOString(),
           }
         ])
       )
     };
     try {
       await put('catalogs/_summary.json', JSON.stringify(summary), {
         access: 'public',
         token,
         addRandomSuffix: false,
         allowOverwrite: true,
       });
     } catch (err) {
       console.error(`[build-catalogs] summary manifest write failed: ${err.message}`);
       // Non-fatal: failed summary write must never abort or fail the catalog rebuild.
     }
     ```
   - Schema properties:
     - `builtAt`: ISO timestamp of build completion.
     - `catalogs`: Map of catalog IDs to `{ count, top, builtAt }`.
     - `top`: Array of up to 3 movie/series display names (`m.name`), NOT IDs.
     - Storage access level: `access: 'public'` (consistent with rows and idmap).

2. **Status Endpoint Assembly & Cache Bypass in `app/index.js`**:
   - `GET /admin/api/status` reads `catalogs/_summary.json` directly from Vercel Blob.
   - **Cache Bypass**: The summary read explicitly bypasses `store.js`'s 5-minute in-memory cache by querying Blob storage directly, ensuring that immediately after a manual or cron rebuild, status displays fresh counts without stale cache lag.
   - **Disabled-Row & Full Config Merge**:
     Because `main()` only builds enabled catalogs, `catalogs/_summary.json` contains entries only for active rows.
     When assembling the response, `app/index.js` iterates over all 27 catalogs from `cfg.catalogs`:
     - If the catalog exists in summary and `enabled !== false`: populates `{ id, type, name, count, top, builtAt }`.
     - If disabled (`enabled === false`) or missing from summary: appends `{ id, type, name, count: 0, top: [], builtAt: null, disabled: true }`.
     - Sorts the combined array by `cfg.catalogs[id].order`.
     - Sets global `lastBuiltAt` to `summary.builtAt`.

3. **Fallback Mechanism — Concurrently Fetched Blob List**:
   - If `catalogs/_summary.json` does not exist or fails to fetch/parse (e.g. before initial rebuild):
     - The endpoint falls back to listing the prefix once: `list({ prefix: 'catalogs/', token })`.
     - **Prefix Filter Rule**: Filter out non-catalog and internal files:
       ```js
       const catalogBlobs = blobs.filter((b) => 
         b.pathname.endsWith('.json') && 
         !b.pathname.includes('/_') // Excludes _idmap.json and _summary.json
       );
       ```
     - Concurrently fetch all catalog files using `Promise.allSettled(...)`.
     - Merge with `cfg.catalogs` to ensure disabled rows are preserved with count 0.

4. **Latency Measurement Target**:
   - Acceptance target: `GET /admin/api/status` responds in `<1500ms` on cold starts.
   - Clarification: `<1500ms` is a concrete target to measure during acceptance testing, not an unsubstantiated mathematical promise.

---

### 8.2 Defect 2: Unauthenticated Rebuild & Serverless Function Timeout

#### Root Cause Analysis
- The manual rebuild button in `app/lib/admin.html` calls `fetch('/api/cron/rebuild')`.
- In `app/api/cron/rebuild.js` (lines 12–16), the endpoint does not verify authorization:
  *"accept the call either way in v1 (the endpoint only rebuilds public catalog rows)"*.
- Any external actor could trigger rebuilds indefinitely, exhausting Vercel serverless execution limits and burning TMDB API quotas.
- Furthermore, attempting to place an authenticated rebuild route inside `app/index.js` fails:
  `app/vercel.json` limits `api/index.js` to `maxDuration: 10`. The rebuild process takes 30–60 seconds. Placing rebuild inside `app/index.js` would immediately recreate the exact HTTP 504 Gateway Timeout!
- In v1, `/api/cron/rebuild` was the only route configured with `maxDuration: 300`.
- The v1 draft suggested an unverified `x-vercel-cron === '1'` header check. Vercel's documentation specifies that cron jobs are secured via `Authorization: Bearer <CRON_SECRET>`. A client-settable custom header is insecure and must not be used.

#### Concrete Technical Fix Specification

1. **Dedicated Serverless Function for Admin Rebuild (`app/api/admin/rebuild.js`)**:
   - Create a dedicated standalone serverless file: `app/api/admin/rebuild.js` (reachable at `/api/admin/rebuild`).
   - In Vercel, standalone files in `api/` take routing precedence over wildcard rewrites (`/(.*) -> /api`).
   - In `app/vercel.json`, allocate `maxDuration: 300`:
     ```json
     {
       "crons": [{ "path": "/api/cron/rebuild", "schedule": "0 5 * * *" }],
       "functions": {
         "api/cron/rebuild.js": { "maxDuration": 300 },
         "api/admin/rebuild.js": { "maxDuration": 300 },
         "api/index.js": { "maxDuration": 10 }
       },
       "rewrites": [{ "destination": "/api", "source": "/(.*)" }]
     }
     ```

2. **Authentication Gate in `app/api/admin/rebuild.js`**:
   - Verifies the `X-Admin-Password` header against `process.env.ADMIN_PASSWORD`.
   - If `process.env.ADMIN_PASSWORD` is not configured: returns HTTP 503 `{ ok: false, error: 'admin password not configured' }`.
   - If header is missing or incorrect: returns HTTP 401 `{ ok: false, error: 'unauthorized' }`.

3. **Skipped-State & Execution Handling in `app/api/admin/rebuild.js`**:
   - `build-catalogs.js`'s `main()` returns `{ skipped: true, reason?: string }` if prerequisites are missing.
   - The endpoint handles this cleanly:
     ```js
     const { main } = require('../../scripts/build-catalogs');
     module.exports = async (req, res) => {
       if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });
       const expected = process.env.ADMIN_PASSWORD;
       if (!expected) return res.status(503).json({ ok: false, error: 'admin password not configured' });
       if (req.headers['x-admin-password'] !== expected) {
         return res.status(401).json({ ok: false, error: 'unauthorized' });
       }
       try {
         const result = await main();
         if (result.skipped) {
           return res.status(200).json({
             ok: false,
             skipped: true,
             error: result.reason === 'no-blob-token' 
               ? 'BLOB_READ_WRITE_TOKEN missing on Vercel' 
               : 'TMDB_API_KEY missing on Vercel'
           });
         }
         res.status(200).json({ ok: true, skipped: false, ...result });
       } catch (e) {
         console.error(`[admin/rebuild] FAILED: ${e.message}`);
         res.status(500).json({ ok: false, error: String(e.message) });
       }
     };
     ```

4. **Securing `/api/cron/rebuild.js`**:
   - Requires `Authorization: Bearer <CRON_SECRET>`.
   - The unverified `x-vercel-cron` check is **completely deleted**.
   ```js
   module.exports = async (req, res) => {
     const auth = req.headers['authorization'];
     const cronSecret = process.env.CRON_SECRET;
     if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
       return res.status(401).json({ ok: false, error: 'unauthorized cron trigger' });
     }
     try {
       const result = await main();
       res.status(200).json({ ok: true, ...result });
     } catch (e) {
       console.error(`[cron/rebuild] FAILED: ${e.message}`);
       res.status(500).json({ ok: false, error: String(e.message) });
     }
   };
   ```
   - **Prerequisite Release Step**: Configuring `CRON_SECRET` on Vercel (Production Environment Variables) is a mandatory release step.
   - Consistent HTTP error status codes: HTTP 401 on unauthorized, HTTP 500 on execution failure.

5. **Dashboard Integration**:
   - In `app/lib/admin.html`, the Rebuild button sends `POST /api/admin/rebuild` with headers including `X-Admin-Password`.

---

## 9. Acceptance Checks

The implementation phase (next step after approval) must satisfy every single check below before release:

### 9.1 Visual & Layout Checks
- [ ] Theme is strictly dark mode: base background `#0b0f17`, cards `#141c2b`, borders `#1e293b`.
- [ ] Zero purple/blue gradients, zero emoji soup, zero stock artwork, zero fake charts.
- [ ] Left sidebar navigation correctly switches between the 5 panels without full page reloads:
  - Overview
  - Catalogs
  - Rows
  - Streams
  - Rebuild
- [ ] Responsive behavior: on desktop &ge; 1024px, fixed left sidebar; on viewports < 900px, collapses into sticky top nav bar with horizontal tab scrolling.
- [ ] System font stack used exclusively; no network requests to Google Fonts or third-party CSS.

### 9.2 Functional Parity & Contract Checks
- [ ] `app/lib/config.js` contract schema remains 100% unaltered.
- [ ] Manifest ID `com.bharatstreams` is unchanged.
- [ ] All 27 catalogs from `manifest.js` appear in the Catalogs panel.
- [ ] Toggling a catalog off sets `enabled: false`; on sets `enabled: true`.
- [ ] Renaming a catalog updates `name` in config and reflects in `effectiveCatalogs`.
- [ ] Reordering catalogs with `↑` and `↓` adjusts `order` numbers properly.
- [ ] All row knobs (`windowDays`, `voteFloor`, `voteCountFloor`) can be edited and saved.
- [ ] `voteCountCeil` is rendered as **"Maximum votes"** on `#13 Underrated Indian Gems` and is fully editable and savable.
- [ ] Stream scraper checkboxes (Torrentio, Comet, HdHub) toggle correctly.
- [ ] Max quality selector correctly saves `1080p` or `720p`.
- [ ] Links to `manifest.json`, `badges.json`, `Live URL`, Vercel project, and `/health` work correctly.

### 9.3 Connected Flow Verification
- [ ] Tapping `Save Settings` in sidebar footer saves to Blob and shows the Hinglish confirmation:  
  *"Settings Saved! Nuvio me ~1 minute me dikhega. Nuvio ko refresh ya restart kar lo."*
- [ ] **Toggle test (live test)**:
  1. Hide 1 catalog (e.g. `now-in-theatres-movie`) &rarr; Save.
  2. Inspect `/manifest.json` after 60s &rarr; row is gone.
  3. Re-enable the catalog &rarr; Save &rarr; row reappears in manifest after 60s.
- [ ] Triggering `Rebuild Catalogs Now` shows elapsed timer, completes in 30–60s via `/api/admin/rebuild`, and updates status cards and counts without page reload.

### 9.4 State & Failure Handling Verification
- [ ] Editing row names in Catalogs, switching to Rows, and modifying ratings preserves all draft edits in `draftConfig`.
- [ ] Dirty indicator displays on sidebar Save button when draft differs from saved config.
- [ ] If a 401 occurs during Save, a password modal appears, preserves edits, and re-submits successfully upon entry.
- [ ] Save network errors trigger a persistent crimson toast without wiping draft changes.
- [ ] Inline editing in Catalogs does not steal input focus or reset cursor position.

### 9.5 Defect Fix Verification
- [ ] `GET /admin/api/status` responds in `<1500ms` with HTTP 200 on cold starts (measured target).
- [ ] `catalogs/_summary.json` is generated at the end of rebuild with display names (`m.name`) in `top`.
- [ ] `GET /admin/api/status` merges disabled rows with count 0 and handles missing summary gracefully via parallel fetch.
- [ ] Calling `POST /api/admin/rebuild` without `X-Admin-Password` returns HTTP 401.
- [ ] Calling `POST /api/admin/rebuild` with valid password completes build within `maxDuration: 300` budget.
- [ ] Direct unauthenticated `GET /api/cron/rebuild` returns HTTP 401.
- [ ] Direct `GET /api/cron/rebuild` with `Authorization: Bearer <CRON_SECRET>` executes successfully.

### 9.6 File & Packaging Constraints
- [ ] Dashboard lives entirely in one file: `app/lib/admin.html`.
- [ ] Dedicated serverless rebuild route in `app/api/admin/rebuild.js` configured with `maxDuration: 300` in `app/vercel.json`.
- [ ] Zero new runtime npm dependencies.
- [ ] No secrets (passwords or API keys) hardcoded or logged anywhere.
- [ ] Version bump prepared for **v1.1.0** across:
  - `app/index.js` (`VERSION = '1.0.8'`)
  - `app/lib/manifest.js` (`version: '1.0.8'`)
  - `app/package.json` (`"version": "1.0.8"`)
  - `app/package-lock.json`
  - `DEPLOY.md`
