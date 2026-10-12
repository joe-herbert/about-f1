# About F1

Build-your-own Formula 1 dashboards from [OpenF1](https://openf1.org) timing data (2023 onward) and [Jolpica F1](https://github.com/jolpica/jolpica-f1) history (every season since 1950). No account: dashboards, layouts and preferences live in your browser's localStorage, and finished sessions are cached in IndexedDB.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Using it

- **Session**: pick season → Grand Prix → session in the top bar, any season since 1950. "Latest" follows the most recent session.
- **One set of panels, two sources**: panels use OpenF1 where it has the data (2023 onward) and Jolpica otherwise: whole seasons before 2023, plus gaps in OpenF1 such as starting grids or missing pit stops. Panels whose data only exists in live timing (telemetry, tyres, weather, race control) say so for older seasons; lap-by-lap panels work from 1996 and pit stops from 2011.
- **Records**: all-time panels (champions, win leaders, careers, circuit history) follow the header's race, or set their own season in panel settings.
- Jolpica allows 500 requests an hour, so past seasons are cached permanently in IndexedDB and the app tracks the hourly budget (shown in Preferences).
- **Focus**: click driver chips to focus them. Every panel dims (or hides) everyone else.
- **Dashboards**: tabs across the top. Double-click to rename, `+` for a new one, `⋯` to duplicate, reorder, export/import JSON or delete.
- **Panels**: "Add panel" opens the library (44 built-in panel types, plus any plugins you add at the bottom of it). Drag by the grip, resize from the corner, lock the layout when you're happy.
- **Panel settings** (gear icon): title, display options, its own driver list, or pin it to a different session, e.g. last year's race at this track next to this year's.
- **Table view**: chart panels have a table toggle showing the underlying numbers.

## Rules guide

`/guide/` is a plain-English guide to the rules, written in Markdown under `guide/` (one folder per section, order set in `guide/sections.json`). `plugins/guide` turns it into static HTML pages at build time, so they load fast and are indexable without running the dashboard, and adds a search index, `sitemap.xml` and `robots.txt` for aboutf1.com. In dev the pages render per request, so edits show on reload. Broken links between guide pages fail the build. Readers can star pages as favourites; they're kept in localStorage and listed on the guide home page and at the top of the sidebar. `guide/STYLE.md` covers tone and frontmatter for new pages.

## Code map

- `src/api`: OpenF1 client (throttled queue, 429 retry, IndexedDB cache) and React Query hooks. `hooks.ts` picks the source per request: OpenF1 for real sessions (falling back to Jolpica when an endpoint is empty), Jolpica adapters for synthetic sessions
- `src/api/synthetic.ts`: pre-2023 sessions use negative session keys encoding season, round and kind, so the rest of the app is source-agnostic
- `src/api/jolpica/adapters.ts`: turns Jolpica data into OpenF1-shaped rows (drivers, results, grid, laps, positions, gaps, pit stops, standings, season progressions)
- `src/api/jolpica`: Jolpica client (slow queue, hourly budget, pagination merging, TTL cache) and hooks. `champions.json` and `winners.json` are baked from Jolpica (seasons through 2025) because Jolpica won't serve standings without a season and the all-winners query costs 12 requests; bump `BAKED_THROUGH` in `hooks.ts` after re-baking.
- `src/lib/history.ts`, `src/lib/livery.ts`: header session → Jolpica round, constructor livery colours
- `src/store`: Zustand store persisted to localStorage, plus the starter dashboards
- `src/lib`: derivations (positions per lap, gaps, telemetry distance), formatting, theme tokens
- `src/components`: app shell, grid, panel frame, drawers, chart wrapper, sortable table
- `src/widgets/{results,race,misc,history}`: panel types; each exports a `WidgetDef` registered in its group's `index.ts`

- `src/widgets/registry.ts`: the panel registry. Built-ins, files in `src/widgets/custom/` and plugins all register here; components read it reactively, so plugin panels appear without a reload
- `src/widgets/plugins.ts`, `src/widgets/sdk.ts`: loads plugin modules from URLs and the SDK they get (also `window.AboutF1`, and `import … from 'aboutf1'` via the import map in `index.html` and the shims in `public/sdk/`)

## Adding panels

Panels are extendable without changing the app: write a component taking `WidgetProps` and a `WidgetDef` describing it (name, category, size, options schema; the settings form is generated from the schema). Then either:

- add it to a group index under `src/widgets/` to ship it as a built-in,
- drop the file in `src/widgets/custom/` and it's registered automatically, or
- publish it as an ES module anywhere and add its URL under **Add panel → Plugins**. No build of this repo needed; `public/plugins/example-panel.js` is a working example.

[`WIDGETS.md`](WIDGETS.md) is the full guide: the definition, props, option types, the SDK, hosting and JSX.
