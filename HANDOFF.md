# Olvastin Tana · Jukola — Engineering Handoff

> Single-page site charting a Finnish orienteering team's **Jukola relay** history
> (2014–2025) and providing **live tracking** for Kotka-Jukola 2026. This document is a
> complete, self-contained handoff: an AI coding assistant (or human) should be able to
> continue from here with zero prior context.

---

## 1. What this project is

- **Team:** *Olvastin Tana FC* (Tampere, Finland), bib **1107** in the men's relay (Jukolan Viesti).
- **Jukola** is a massive overnight 7-leg orienteering relay (~1,700+ teams, mass start 23:00 Saturday). "Venla" (Venlojen Viesti) is the women's 4-leg counterpart.
- The site is a **dark, brand-yellow single-page React app** with these views (client-side routing via the History API, no router lib):
  - **History (home):** hero stats, "Since 2014" totals, a course-line of years, a Finland venue map, "A typical night" (avg changeover clock times), a recharts chart (team vs winner vs Jukola estimate), results table, records, team records, roster.
  - **Event view:** per-year detail — winner benchmark, Jukola-estimate benchmark, position-through-race chart, per-leg breakdown with splits, changeover clock times.
  - **Profile view:** per-runner stats + GPX track upload (self-serve, stored in Firebase).
  - **Track view:** Leaflet map of an uploaded GPS route.
  - **Compare view:** head-to-head runner comparison.
  - **Live 2026 view:** countdown → live split tracking on race night (the actively-developed part; see §5).
- **Live site:** https://maunoahlgren.github.io/olvastin-tana-jukola/
- **Repo:** https://github.com/maunoahlgren/olvastin-tana-jukola (branch `main`)

---

## 2. Tech stack & repo layout

- **Vite 5 + React 18** (plain JavaScript, **not** TypeScript). `"type": "module"`.
- **recharts** (charts), **firebase** (anon auth + Firestore, for GPS tracks), **leaflet** + OpenStreetMap tiles (route maps).
- Deploys to **GitHub Pages** via GitHub Actions. `vite.config.js` sets `base: "./"` (relative paths for project-page hosting).

```
index.html
package.json            # deps: react, react-dom, recharts, firebase, leaflet
                        # devDeps: vite, @vitejs/plugin-react
vite.config.js          # base: "./"
src/
  main.jsx              # createRoot(...).render(<App/>)
  App.jsx               # ~1,400 lines — ENTIRE app lives here (components + data logic + styles)
  data/history.json     # all historical race data (the data model — see §4)
.github/workflows/deploy.yml   # node 20, upload-pages-artifact@v3, deploy-pages@v4
```

> **Everything is in `src/App.jsx`.** Components, the data-derivation hook (`useModel`), the
> live-feed adapter, and **all CSS** (an inline `<style>` block inside a `Style()` component).
> The only external CSS asset in the build is Leaflet's. Practical consequence: **CSS changes
> show up in the JS bundle hash, not the CSS asset hash** — don't be confused when the
> `.css` file hash is unchanged after a style edit.

---

## 3. Build / run / deploy workflow

```bash
npm install
npm run dev      # local dev server (port 5173; see .claude/launch.json)
npm run build    # → dist/  (expect a >500 KB chunk-size warning; harmless)
npm run preview
```

**Deploy = commit to `main` + push.** GitHub Actions builds and publishes to Pages.
The standard loop used throughout this project:

1. Edit `src/App.jsx`.
2. Run the two **mandatory post-write fixes** (see §6).
3. `npm run build` (must be clean apart from the chunk-size note).
4. Grep the built bundle for feature strings to confirm they're present:
   `grep -c "<feature string>" dist/assets/index-*.js`
5. `git commit` + `git push origin main`.
6. Watch deploy: `gh run watch "$(gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status`
7. Confirm live: `curl -s https://maunoahlgren.github.io/olvastin-tana-jukola/ | grep -o 'assets/index-[^"]*\.js'` then curl that asset and grep for the feature.

Commit-message convention ends with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

> Note: `actions/*@v... on Node 20` deprecation warnings appear on every run — informational only.

---

## 4. Data model — `src/data/history.json`

`App.jsx` does `import DATA from "./data/history.json"` (never re-inline it). Shape:

```jsonc
{
  "events": [
    {
      "year": 2025,
      "competition": "Mikkeli-Jukola, ...",   // shortComp() takes text before first comma
      "status": "finished",                    // "finished" | anything else = DNF
      "final_time": "8:23:45", "final_time_s": 30225,
      "final_place": 1234, "field_size": 1700,
      "team_number": 1107, "course_km": 7,
      "winner_team": "...", "winner_country": "FIN",
      "winner_time": "5:43:21", "winner_time_s": 20601,
      "legs": [
        {
          "leg": 1, "runner": "Antti Haritonov",
          "leg_time": "1:12:30", "leg_time_s": 4350, "official": true,
          "leg_rank": 800, "leg_field": 1700,
          "cumulative_place": 900, "cumulative_time_s": 4350, "place_change": -20,
          "distance_km": 12.3,
          "splits": [ { "km": 3.1, "place": 850, "leg_time_s": 1100, "total_time_s": 1100 } ]
        }
        // ... 7 legs
      ]
    }
    // ... one object per year, 2014–2025
  ]
}
```

Notes:
- `place_change` negative = places **gained** (moved up). `official:false` legs render in parentheses and are excluded from records (e.g. a DNQ/DSQ year — 2024 Lakia was a leg-2 disqualification, no classified finish).
- Runners are keyed by `normName()` = accent-stripped lowercase, so the same person across years merges into one profile even with spelling variants.
- **Past edits were surgical** (e.g. fixing a single leg's runner name). Treat this file as the source of truth for history; don't regenerate it wholesale.

---

## 5. Live 2026 feed — the reverse-engineered integration (most important section)

The `LiveView` component polls Jukola's public results service. **No backend** — the JSON is
CORS-open (`access-control-allow-origin: *`) and fetched directly from the static site.
All of the following was reverse-engineered and **verified against live data**; trust it.

### Config (the `LIVE` object in App.jsx)
```js
const LIVE = {
  base: "https://online.jukola.fi/tulokset/online",
  eventId: "j2026_ju",          // men's relay. (women's = j2026_ve; rehearsal was j2026_ke)
  bib: 1107,
  club: "Olvastin Tana",
  legs: 7,
  massStart: "2026-06-13T23:00:00+03:00",
  refreshMs: 120000,            // 120s poll (raised from 75s as a safeguard)
  resultsUrl: "https://online3.jukola.com/tulokset-new/fi/j2026_ju/",
};
```

### Endpoints & real shapes (base = `https://online.jukola.fi/tulokset/online`)

**`/online_events_dt.json`** — events list. Each event has `EventID`, `EventTitle`,
`Online` (bool), `CurrentRace` (int), `MaxRaces`, and a `JsonFileFormats` schema map.
`isLiveNow(ev)` = `ev.Online === true || ev.CurrentRace > 0`.

**`/online_<eventId>_startlist.json?ClubNameShort=<NAME>`** — **flat** rows, one per team:
```json
{"data":[{"Bib":1107,"BaseBib":1107,"Name":"Antti Haritonov",
  "ClubNameLong":"","ClubNamePlain":"Olvastin Tana","ClassNameShort":"JU","ClassID":0}]}
```
- The `ClubNameShort=` filter **works here** (server-side) — returns just our team's row.
- Used only to learn our **`ClassNameShort`** (= `"JU"` for the men's relay) + bib + the leg-1 starter name. There is **no per-leg array** in the startlist.

**`/online_<eventId>_resultlist.json?ClassNameShort=JU&Point=0&Language=fi`** — **interleaved** rows.
A `RaceNo:0` **team header** row, then `RaceNo:1..7` **leg rows**:
```json
{"data":[
  {"RaceNo":0,"Bib":1107,"BaseBib":1107,"ClubNameLong":"Olvastin Tana", ...},
  {"RaceNo":1,"Name":"Antti Haritonov","RaceResult":"","TotalResult":"-","RaceRank":"","TotalRank":"","Status":"-"},
  {"RaceNo":2,"Name":"Iiro Mäkelä", ...},
  ... up to RaceNo:7 ...,
  {"RaceNo":0, ...next team... }
]}
```
- This carries **both** the declared per-leg lineup (the `Name`s) **and** the live results
  (`RaceResult` = leg split time, `TotalResult` = cumulative, `RaceRank`/`TotalRank`, `Status`).
  Pre-race those are `""`/`"-"`.
- ⚠️ **The `ClubNameShort=` filter is IGNORED on the resultlist** — it returns the **entire
  class** (~15,000 rows). The client parses our team out by walking `RaceNo:0` headers and
  matching `BaseBib === 1107` (or club substring). **This is by design and verified.**
- ⚠️ The `Get=["OLBigRelayResult"]` param (seen in the official SPA) applies to the
  **statuslist**, not the resultlist; the resultlist returns its own fixed shape regardless.

**`/online_<eventId>_statuslist.json?a=<ts>&Get=<json>`** — the incremental/refresh feed the
official SPA uses. **Not currently used** by this app (we poll the full resultlist instead).
This is the lighter alternative if bandwidth ever needs cutting (see §7).

### The adapter functions in App.jsx (the contract to preserve)
- `fetchEvent()` → the `j2026_ju` event object (for `isLiveNow`).
- `fetchClassInfo()` → `{ classShort, bib, starter }` from the club-filtered startlist.
- `fetchTeamRows(classShort)` → our team `{ bib, club, legs:[{leg,name,legTime,rankRace,totalTime,rankTotal,status}] }`
  by parsing the interleaved resultlist (RaceNo:0 header + RaceNo:1..7).
- `deriveStatus(team)` → `{ leg, runner, finished, totalTime, rankTotal, lastLeg, lastLegTime, lastLegRank, legs }`.
  `finished` flips true once 7 legs have a real `TotalResult` (regex `/\d:\d\d/`).
- `LiveView` also renders a **"Tonight's target schedule"** from `JUKOLA_ESTIMATES[2026]`
  (per-leg minute estimates) vs the actual changeover clock times.

### Polling safeguards (current `main`)
- `refreshMs: 120000` (120s).
- A `stop` ref: once `deriveStatus().finished` is true, `load()` early-returns forever — the
  page stops polling the big feed after the anchor finishes.

---

## 6. Conventions & gotchas (read before editing `App.jsx`)

These are **mandatory** and have bitten every past edit:

1. **`stripAccents` regex.** The source line must be exactly:
   ```js
   const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
   ```
   When the file is written by some tools the `̀-ͯ` escape can get stored as
   literal combining marks. **After every write, normalize it back to the escaped form.**
   Verification one-liner (Python):
   ```python
   import re; s=open("src/App.jsx",encoding="utf-8").read()
   s=re.sub(r'const stripAccents = \(s\) => s\.normalize\("NFD"\)\.replace\(/\[[^\]]*\]/g, ""\);',
            lambda _:'const stripAccents = (s) => s.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");', s)
   open("src/App.jsx","w",encoding="utf-8").write(s)
   ```

2. **The logo.** `const LOGO = "data:image/png;base64,..."` — a **3346-byte PNG**. A stray
   space once got introduced into the base64 string and broke it. **After every write,
   verify**: no space in the base64, `base64.b64decode` length == 3346, and bytes start with
   the PNG magic `\x89PNG\r\n\x1a\n`.

3. **Styles live in the JS bundle** (inline `<style>` in `Style()`), so a CSS-only change
   won't change the `dist/assets/*.css` hash — check the `.js` bundle instead.

4. **`base: "./"`** in vite.config.js is required for GitHub Pages project hosting. Don't change to `/`.

5. **No new dependencies** unless explicitly requested. The historical workflow has been:
   "replace `src/App.jsx` with this new file, data unchanged, build, commit `<msg>`, push."

6. **Firebase** (GPS tracks) uses anonymous auth + a `tracks` Firestore collection. Config is
   inline in `App.jsx`. For this to work in production the Firebase console needs: Anonymous
   auth enabled, Firestore enabled, `maunoahlgren.github.io` as an authorized domain, and
   appropriate security rules. (Flagged previously; not blocking the rest of the site.)

---

## 7. Verified facts & open items (as of last session)

**Verified live (race weekend 13 Jun 2026):**
- `j2026_ju` went `Online=true`. Our startlist row: **bib 1107, classShort `JU`, starter Antti Haritonov**.
- Declared lineup parsed correctly by the adapter (RaceNo:0 header + RaceNo 1..7):
  1 Antti Haritonov · 2 Iiro Mäkelä · 3 Jyrki Orjasniemi · 4 Tero Backman ·
  5 Mauno Ahlgrén · 6 Olli Nissinen · 7 Aki Tuokko. **Parser holds. No code change needed.**
- Resultlist `ClubNameShort=` filter is ignored → full class (~15k rows, ~2.3 MB decoded).
- **BUT** the response is served **`Content-Encoding: gzip`** → real wire transfer ≈ **378 KB**
  (~6× smaller than the decoded body). **Decision: leave the code as-is — bandwidth is fine.**

**Open / future:**
- Optional optimization (not needed): switch live reads from the full resultlist to the
  lighter `statuslist.json?Get=[...]` incremental feed the official SPA uses. Only worth it if
  many simultaneous viewers become a concern; gzip already makes this low-priority.
- The Firebase console setup (item §6.6) should be confirmed before relying on GPS uploads in prod.

---

## 8. Quick orientation map of `App.jsx` (top → bottom)

1. Imports + `firebaseConfig` / `fbApp` / `authReady`.
2. GPS/GPX pipeline: `_hav` (haversine), `parseGpxText`, `trimIdle`, `simplifyTrack` (RDP),
   `buildTrack`, `trackKey`, `loadTracks`, `saveTrack`.
3. `LOGO` (data URI) and `FINLAND` (SVG path + venue coordinates per year).
4. Helpers: `stripAccents`, `normName`, `shortComp`, `topPct`, `fmtPace`, `km`, `hms`,
   `parseHMS`, `clockAt`, `JUKOLA_ESTIMATES` + `estLegS`/`estTotalS`, changeover constants +
   `changeoverInfo` (09:15 close / 09:30 anchor / 09:45 legs-2-6 mass-restart logic).
5. **Live feed:** `LIVE`, `getJSON`, `fetchEvent`, `fetchClassInfo`, `fetchTeamRows`,
   `deriveStatus`, `isLiveNow`.
6. `useModel()` — memoized derivation of everything the history views need from `DATA`.
7. Components: `Stat`, `CourseLine`, `VenueMap`, `MiniRoute`, `TrackMap`, `TrackView`,
   `Home`, `EventView`, `Profile`, `useCountdown`, `LiveView`, `CompareView`, `App` (shell), `Style`.

---

*Last verified: race weekend, June 2026. Live at https://maunoahlgren.github.io/olvastin-tana-jukola/*
