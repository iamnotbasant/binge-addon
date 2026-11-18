#!/usr/bin/env python3
"""Splice v2.0 content into ~/workspace/bharat-streams/design_draft.md."""
import sys

path = '/home/hatch/workspace/bharat-streams/design_draft.md'
doc = open(path, encoding='utf-8').read()
orig = doc

def must_find(marker, label):
    i = doc.find(marker)
    assert i != -1, f'NOT FOUND: {label}: {marker!r}'
    return i

# 1. Header status line: note the v2.0 rebuild.
doc = doc.replace(
    'Phase 2 implementation in progress. Design:',
    'Phase 2 implementation in progress. v2.0 catalog rebuild (18 Nov 2026, see §14). Design:',
    1)

# 2. §6.1 heading.
doc = doc.replace(
    '### 6.1 Catalog list (24 catalogs, not 22 — v1 miscounted)',
    '### 6.1 Catalog list (27 catalogs — v2.0, basant\u2019s 25-item mega-list)',
    1)

# 3. §6.1 table: replace rows between the table header and the dubbed row.
lines = doc.split('\n')
hdr = next(i for i, l in enumerate(lines) if l.startswith('| # | Catalog id | Display name | Type |'))
last = next(i for i, l in enumerate(lines) if l.startswith('| 23\u201324 | `lang-hi-dubbed'))
new_table = '''| # | Catalog id | Display name | Type |
|---|---|---|---|
| 1–2 | `trending-indian-movie` / `trending-indian-series` | Trending in India | movie / series |
| 3–4 | `global-trending-movie` / `global-trending-series` | Trending Worldwide | movie / series |
| 5 | `fresh-digital-drops-movie` | Fresh Digital Drops | movie |
| 6 | `latest-indian-ott-movie` | Latest Indian Movies — OTT Ready | movie |
| 7 | `latest-indian-series-series` | Latest Indian Web Series | series |
| 8–9 | `releasing-next-30-days-movie` / `releasing-next-30-days-series` | Releasing Next 30 Days | movie / series |
| 10–11 | `big-announcements-movie` / `big-announcements-series` | Big Announcements 2026–2027 | movie / series |
| 12 | `newly-announced-series-series` | Newly Announced Web Series | series |
| 13 | `returning-soon-series` | New Season Returning Soon | series |
| 14 | `now-in-theatres-movie` | Now in Theatres | movie |
| 15 | `south-blockbusters-movie` | South Indian Blockbusters | movie |
| 16 | `dark-crime-series` | Indian Dark Crime & Thrillers | series |
| 17–18 | `underrated-gems-movie` / `underrated-gems-series` | Underrated Indian Gems | movie / series |
| 19–20 | `scifi-time-travel-movie` / `scifi-time-travel-series` | Mind-Bending Sci-Fi & Time Travel | movie / series |
| 21–22 | `psychological-thrillers-movie` / `psychological-thrillers-series` | High-Tension Psychological Thrillers | movie / series |
| 23 | `action-heist-revenge-movie` | Adrenaline Action, Heist & Revenge | movie |
| 24 | `one-season-miniseries-series` | 1-Season Binge Mini-Series | series |
| 25 | `visual-spectacles-movie` | 4K IMAX Visual Spectacles | movie |
| 26 | `action-anime-series` | Top Action & Dark Anime | series |
| 27 | `all-time-classics-movie` | All-Time Classics | movie |'''
lines[hdr:last + 1] = new_table.split('\n')
doc = '\n'.join(lines)

# 4. Manifest size paragraph + trim order.
doc = doc.replace(
    'so 24 entries ≈ 1.7–2.6 KB + base manifest (~0.5–1 KB for id, version, name, description, resources, types, `idPrefixes`, logo URLs) ≈ **2.2–3.6 KB total — comfortable headroom**.',
    'so 27 entries ≈ 2.0–3.0 KB + base manifest (~0.5–1 KB for id, version, name, description, resources, types, `idPrefixes`, logo URLs) ≈ **2.5–4.0 KB total — verified 2,979 bytes locally for v2.0, comfortable headroom**.',
    1)
doc = doc.replace(
    'The trim order, if ever needed: drop the `series` half of the smallest language rows first (Gujarati, Punjabi series), then Marathi/Bengali series.',
    'The trim order, if ever needed: drop the `series` half of the narrowest pairs first (Underrated Gems, Sci-Fi & Time Travel series), then single rows by lowest use.',
    1)

# 5. §6.2 row definitions: replace the v1 row subsections (New Indian
# Releases / OTT / Language rows / Hindi Dubbed) with the v2.0 block.
new_rows = '''**v2.0 rows (18 Nov 2026 — basant's 25-item mega-list, 27 catalogs):** the v1 rows are dropped entirely (New Indian Releases, OTT Releases, Popular Indian, Top Indian, Top This Month, Top This Year, Hindi Movies/Series, Hindi Dubbed). Every row caps at 20 items. Pairs are movie + series; singles are one type only (see §6.1). Detail-heavy rows reuse one detail call per title for the imdb id + all filters (movie: `/movie/{id}?append_to_response=external_ids,release_dates`; series: `/tv/{id}?append_to_response=external_ids`), cached per build run.

- **#1 Trending in India (both):** `/trending/{type}/week`, Indian titles only (original_language in hi/te/ta/ml/kn/bn/mr/gu/pa, else detail origin_country == IN). Up to 5 pages. No top-up row anymore (Popular Indian is dropped) — a thin row stays thin.
- **#2 Trending Worldwide (both):** `/trending/{type}/week`, no filter. Up to 3 pages, cap 20.
- **#3 Fresh Digital / OTT Drops (movie):** discover by `release_date` window (last 45 days), vote_average>=6, sort `release_date.desc`; then the detail check: any country's type-4 (Digital) release date inside the window. Final order is the actual digital date desc (from the detail). Up to 3 discover pages (60 detail calls max).
- **#4 Latest Indian Movies — OTT Ready (movie):** discover origin IN, `primary_release_date` last 90 days, sort date desc; same digital detail check as #3 (type 4, any country, in window). Up to 3 pages (60 detail max).
- **#5 Latest Indian Web Series (series):** discover origin IN, `first_air_date` last 90 days, sort date desc, WITH the v1.4 TV-show filter. Up to 5 refill pages.
- **#6 Releasing Next 30 Days (both):** `primary_release_date` / `first_air_date` within the next 30 days, sort **popularity.desc** (hype proxy — no Trakt watchlists in TMDB). Date-asc was considered and rejected: it would put the nearest-dated obscure titles first; popularity inside the window puts the biggest upcoming titles on top (same reasoning as the v1.2 New Releases sort change).
- **#7 Big Announcements 2026–2027 (both):** status Planned / In Production, release within the next 500 days, sort popularity. TMDB discover has NO status filter for movies — the movie side filters by status via detail calls (up to 3 pages, 60 detail max). The series side filters in discover (`with_status=1|2`) and the detail verifies it again. **Substitution, honest:** "Announced" is NOT a TMDB status value (movie: Rumored/Planned/In Production/Post Production/Released/Canceled; TV: Returning Series/Planned/In Production/Ended/Canceled/Pilot) — Planned is TMDB's equivalent of "announced".
- **#8 Newly Announced Web Series (series):** discover `with_status=1|2` (Planned/In Production), `first_air_date` within next 365 days, sort popularity. Detail verifies status + TV filter. Up to 3 pages.
- **#9 New Season Returning Soon (series):** discover `with_status=0` (Returning Series) + `air_date` window (an episode airing in the next 45 days); detail verifies status AND `next_episode_to_air.air_date` inside the window; the row is then sorted by that air date asc. **Approach verified workable** (18 Nov 2026, TMDB API docs): `with_status` and `air_date.gte/lte` are real `/discover/tv` parameters and `next_episode_to_air` is a real `/tv/{id}` field. **Honest caveat:** a Returning Series between seasons has `next_episode_to_air=null` when TMDB knows no date yet — those shows cannot appear here (no date to sort by), so the row only holds shows with a known next date. Up to 3 pages (60 detail max).
- **#10 Now in Theatres (movie):** `/movie/now_playing`, region IN, vote_count>=1000 (client-side filter), popularity order. Up to 3 pages.
- **#11 South Indian Blockbusters (movie):** ONE combined row (not per-language): `with_original_language=te|ta|ml`, vote_average>=7, last 2 years, sort popularity.
- **#12 Indian Dark Crime & Thrillers (series):** origin IN, genres Crime/Mystery, vote_average>=7.2, sort vote_average desc, WITH the v1.4 TV filter. (TV has no Thriller genre — see #20.)
- **#13 Underrated Indian Gems (both):** origin IN, vote_average>=7.8, vote_count 2000–25000 (the "underrated" band: loved, but not widely voted), sort vote_average desc.
- **#19 Mind-Bending Sci-Fi & Time Travel (both):** genre Sci-Fi (movie 878 / TV 10765 Sci-Fi & Fantasy), keywords time travel / simulation / space / dystopia, vote_average>=7.3, sort vote_average desc. Global, not India-only. **Keyword ids are resolved AT BUILD TIME via `/search/keyword`** (exact case-insensitive name match); no ids are hardcoded. A term the endpoint cannot resolve is dropped and logged (`stats.keywords.dropped`); if all drop, the row is genre-only (logged, not faked).
- **#20 High-Tension Psychological Thrillers (both):** genres Thriller/Mystery, vote_average>=7.5, vote_count>=20000, sort popularity. **Series side substitution:** TMDB has NO Thriller genre for TV — the series side uses Mystery + Crime.
- **#21 Adrenaline Action, Heist & Revenge (movie):** genres Action/Crime, vote_average>=7, vote_count>=25000, sort popularity.
- **#22 1-Season Binge Mini-Series (series):** TMDB type Miniseries preferred (`with_type=2`), else status Ended + `number_of_seasons<=1`, vote_average>=7.8, vote_count>=10000, sort vote_average desc, WITH the v1.4 TV filter. Two passes: `with_type=2` first (up to 5 pages), then the Ended fallback only if the row is still short.
- **#23 4K IMAX Visual Spectacles (movie):** genres Sci-Fi/Adventure/Fantasy, vote_average>=7.5, after 2015, sort popularity. **HONEST LIMIT: TMDB carries no IMAX/4K flag — there is no way to verify a title is actually IMAX or 4K from TMDB data.** This row is a genre + rating proxy for visually spectacular titles; the NAME stays as basant wants it.
- **#24 Top Action & Dark Anime (series):** genre Animation, origin JP, vote_average>=8, vote_count>=10000, sort popularity, WITH the v1.4 TV filter. Honest note: the 100-episode cap excludes long-running anime (One Piece etc.) — the filter working as designed.
- **#25 All-Time Classics (movie):** substitute for the exact IMDb Top 250 (not available via TMDB) — TMDB `/movie/top_rated`, which already requires a high vote count. Up to 3 pages.

**Substitutions (all accepted by basant, all for the same reason — the source does not exist in TMDB):** IMDb ratings → TMDB `vote_average`/`vote_count`; IMDb Top 250 → TMDB `/movie/top_rated`; Trakt watchlists → `popularity` (hype proxy); "Announced" status → Planned + In Production; IMAX/4K verification → genre + rating proxy (unverifiable, stated plainly); Thriller TV genre → Mystery + Crime; Sci-Fi keywords resolved at build time via `/search/keyword` (no hardcoded ids; unresolvable terms dropped + logged); #6 sort popularity.desc, not date-asc (date-asc would surface obscure nearest-dated titles first); #9 approach verified workable (`with_status` + `air_date` window + `next_episode_to_air` — but shows with a null next date cannot appear); #22 two-pass (`with_type=2` first, then Ended + <=1 season fallback); #24's 100-episode cap excludes long-running anime (One Piece etc.) by design.

**Dropped in v2.0:** New Indian Releases, OTT Releases, Popular Indian, Top Indian, Top This Month, Top This Year, Hindi Movies/Series, Hindi Dubbed (all 20 v1.4 catalogs). **Not in this build:** items #14–18 of basant's 25-item list are OTT shelves — a separate Nuvio Catalog Addon step for basant, not part of this build.

'''
start = doc.find('**"New Indian Releases" (the top row):**')
assert start != -1, '§6.2 start marker not found'
end = doc.find('**Series rows — TV-show filter (v1.4, 18 Nov 2026):**', start)
assert end != -1, '§6.2 end marker not found'
doc = doc[:start] + new_rows + doc[end:]

# 6. TMDB call budget paragraph (v2.0 recompute).
new_budget = '''**TMDB call budget (v2.0, recomputed):** discover/list calls ~130/run worst case (trending 8 + 6 pages, digital/OTT/announcements ~9 + 9, the rest 2–3 pages each, plus 4 keyword searches); detail/external_ids calls: first run ~700–1,500 (the persisted id map starts empty and every series candidate needs a detail call; worst case if every series row scans its full refill depth), steady state ~500–900/day (the id map covers repeat movie titles; series details re-fetch daily for titles still in the windows). Concurrency 10, 429 backoff unchanged. **Estimated rebuild time: first run ~45–75 s, steady state ~30–60 s** (v1.4 measured 31 s with ~700 calls) — inside the 300 s cron limit with wide margin. The rebuild is parallelised (batched concurrency, 10 in flight).

'''
bstart = doc.find('**TMDB call budget (recomputed):**')
assert bstart != -1, 'call budget marker not found'
bend = doc.find('**TMDB key, limits, attribution:**', bstart)
assert bend != -1, 'call budget end marker not found'
doc = doc[:bstart] + new_budget + doc[bend:]

# 7. §14 revision log: append the v2.0 entry after the v1.4 bullet.
anchor = 'Version 1.4.0 (manifest, package.json, /health). Live verification + rebuild result: see DEPLOY.md v1.4 section.'
assert anchor in doc, '§14 v1.4 anchor not found'
v20 = anchor + '''
- **v2.0 catalog rebuild (18 Nov 2026):** basant's 25-item mega-list → **27 catalogs** (7 movie+series pairs = 14, 13 singles). **The full list + mapping:** #1 Trending in India (both), #2 Trending Worldwide (both), #3 Fresh Digital Drops (movie), #4 Latest Indian Movies — OTT Ready (movie), #5 Latest Indian Web Series (series), #6 Releasing Next 30 Days (both), #7 Big Announcements 2026–2027 (both), #8 Newly Announced Web Series (series), #9 New Season Returning Soon (series), #10 Now in Theatres (movie), #11 South Indian Blockbusters (movie), #12 Indian Dark Crime & Thrillers (series), #13 Underrated Indian Gems (both), #19 Mind-Bending Sci-Fi & Time Travel (both), #20 High-Tension Psychological Thrillers (both), #21 Adrenaline Action, Heist & Revenge (movie), #22 1-Season Binge Mini-Series (series), #23 4K IMAX Visual Spectacles (movie), #24 Top Action & Dark Anime (series), #25 All-Time Classics (movie). **Manifest order:** Trending India, Trending Worldwide, Fresh Digital Drops, Latest Indian Movies, Latest Indian Web Series, Releasing Next 30 Days, Big Announcements, Newly Announced Series, Returning Soon, Now in Theatres, South Blockbusters, Dark Crime, Underrated Gems, Sci-Fi, Thrillers, Action, Mini-Series, Visual Spectacles, Anime, All-Time Classics (pairs adjacent). **Dropped:** all 20 v1.4 catalogs (New Indian Releases, OTT Releases, Popular Indian, Top Indian, Top This Month/Year, Hindi Movies/Series, Hindi Dubbed). **Substitutions (all accepted by basant):** IMDb ratings → TMDB vote_average/vote_count; IMDb Top 250 → TMDB /movie/top_rated; Trakt watchlists → popularity (hype proxy); "Announced" status → Planned + In Production ("Announced" is not a TMDB status value — verified against TMDB API docs 18 Nov 2026); IMAX/4K verification → genre + rating proxy (TMDB has no IMAX/4K flag — stated plainly in §6.2 and the code); Thriller TV genre → Mystery + Crime (TMDB has no Thriller genre for TV); Sci-Fi keywords resolved at build time via /search/keyword (no hardcoded ids; unresolvable terms dropped + logged); #6 sort popularity.desc, not date-asc (date-asc would surface obscure nearest-dated titles first); #9 approach verified workable (with_status + air_date window + next_episode_to_air — but shows with a null next date cannot appear); #22 two-pass (with_type=2 first, then Ended + <=1 season fallback); #24's 100-episode cap excludes long-running anime (One Piece etc.) by design. **#14–18 OTT shelves:** NOT in this build — a separate Nuvio Catalog Addon step for basant. **Code:** `scripts/build-catalogs.js` rewritten (v1.4 TV filter + detail patterns reused; one detail call per title, cached per run; detail-heavy rows capped at 60 candidates); `lib/manifest.js` 27 catalogs; version 2.0.0 (manifest, package.json, /health). **Local checks (no key, no deploy):** `node --check` clean on all edited files; builder with no key logs "no key, skipping", exit 0; server boots, /health 2.0.0, /manifest.json 27 catalogs, 2,979 bytes (< 8 KB); builder row keys match manifest ids exactly. **Estimated rebuild:** first run ~45–75 s, steady state ~30–60 s (inside the 300 s cron limit). **Deploy worker to watch:** the first rebuild's per-row counts + `keywords` in the rebuild response (which of time travel/simulation/space/dystopia resolved), and whether #7/#8/#9 fill (status-filtered rows depend on TMDB having Planned/In Production/Returning titles with dates in the windows).'''
doc = doc.replace(anchor, v20, 1)

assert doc != orig, 'no changes made'
open(path, 'w', encoding='utf-8').write(doc)
print('design_draft.md updated OK')
