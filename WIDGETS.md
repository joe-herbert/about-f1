# Writing a panel

Every panel in the library, built-in or not, is a `WidgetDef`: an object describing the panel plus a React component that draws it. There are three ways to add one:

| Where it lives | How it's added | Good for |
| --- | --- | --- |
| `src/widgets/<group>/` | Listed in the group's `index.ts` | Panels shipped with the app |
| `src/widgets/custom/` | Any file there is picked up automatically | Your own fork or local build |
| Anywhere on the web | Paste its URL in **Add panel → Plugins** | Sharing panels without touching this repo |

All three use the same definition and the same props, so a panel can move between them unchanged.

## The definition

```js
export default {
  type: 'yourname:lap-spread',  // unique id, saved in dashboards; never change it once published
  name: 'Lap spread',           // shown in the library and as the default title
  description: 'How consistent each driver’s laps were.',
  category: 'Laps',             // a built-in category, or any new name
  defaultSize: { w: 8, h: 10 }, // grid units: 24 columns wide, rows about 30px
  Component: LapSpread,
  options: [],                  // settings form, see below

  // optional
  usesDrivers: true,            // follows driver focus; settings get a "choose drivers" override
  sessionless: false,           // true if it doesn't need a session (settings hide "pin a session")
  minYear: 1996,                // earliest season with the data it needs; older seasons get an explanation
  bare: false,                  // no title bar; tools float on hover
}
```

Built-in categories: Results, Championship, Race, Laps, Strategy, Telemetry, Conditions, Session, Records, Utility. A new category gets its own tab after them.

Prefix plugin `type`s with your name (`yourname:thing`) so they can't collide with built-ins or other plugins. Registering a built-in type is refused.

## The component

The component receives `WidgetProps`:

| Prop | |
| --- | --- |
| `sessionKey` | The session to show: the header's, or one the user pinned. `null` when nothing is picked. Pre-2023 sessions have negative keys; the data hooks handle them. |
| `session` | That session's details (`year`, `session_type`, `circuit_short_name`…) |
| `year` | The season |
| `opts` | Option values with defaults filled in |
| `filter` | Driver focus: `filter.visible(n)` (leave them out when false), `filter.dimmed(n)` (draw them faded) |
| `instance` | The saved panel (`id`, `title`, `options`…) |

The panel frame handles the title bar, settings, resizing, the error boundary, and the "no data before `minYear`" message. Fill the space you're given (`height: 100%`).

## Options

Each option becomes a field in the panel's settings, and its value arrives in `opts[key]`.

| `type` | Value | Extra fields |
| --- | --- | --- |
| `toggle` | boolean | |
| `select` | string or number | `choices: [{ value, label }]` |
| `number` | number | `min`, `max`, `step` |
| `text`, `textarea` | string | |
| `season` | year, `0` = follow the header | |
| `driver` | driver number from the session, `null` = automatic | |
| `histDriver` | Jolpica driverId such as `"senna"`, `''` = automatic | |
| `custom` | anything JSON-serialisable | `Field`: your own React component |

All take `key`, `label`, `default` and an optional `help`. A `custom` field's `Field` component gets `{ id, label, help, value, onChange, sessionKey }`.

## The SDK

Plugins don't bundle the app's code; they use its SDK, which has the same data hooks and components the built-in panels use. Nothing else in the app is a stable API.

- **`hooks`**: data for a session key: `useResults`, `useLaps`, `useStints`, `usePits`, `usePositions`, `useIntervals`, `useRaceControl`, `useTeamRadio`, `useWeather`, `useStartingGrid`, `useOvertakes`, `useCarData`, `useLocation`, `useChampionshipDrivers`, `useChampionshipTeams`, `useSessionByKey`. Season-wide: `useSeasonResults`, `useSeasonDrivers`, `useSessions`, `useMeetings`. History (Jolpica): `useJResults`, `useJDriverStandings`, `useJDriverCareer`, `useJCircuitWinners` and the rest of `src/api/jolpica/hooks.ts`. Plus `useDriverMap(sessionKey)` (number → name, code, team colour), `useTokens()` (theme colours) and `useStore` (`useStore((s) => s.prefs)` for units). They return React Query results; the rows are OpenF1-shaped for every season (see `src/api/types.ts`).
- **`ui`**: `Chart` (themed ECharts with an optional table view), `DataTable`, `gate(...queries)` (loading and error states), `NeedSession`, `Empty`, `Loading`, `DriverTag`, `TeamBar`, `Compound`, `Pill`, `Legend`, `tipRow`, `tipTitle`.
- **`lib`**: `format` (`lapTime`, `gap`, `speed`, `temp`…), `derive` (`cleanLaps`, `groupBy`, `fastestLap`, `positionsByLap`, `mean`, `median`, `stdev`…), colour helpers.
- **`registerWidget(defs)`**, **`React`**, **`version`**.

## Plugins: panels from a URL

A plugin is an ES module. Inside the app the page has an import map, so a plugin can import the SDK and React by name:

```js
import { createElement as h } from 'react'
import { hooks, ui, lib } from 'aboutf1'

function Winner({ sessionKey }) {
  const results = hooks.useResults(sessionKey)
  const { map } = hooks.useDriverMap(sessionKey)
  if (!sessionKey) return h(ui.NeedSession)
  const g = ui.gate(results)
  if (g) return g
  const p1 = results.data?.find((r) => r.position === 1)
  return h('div', { style: { padding: 12, fontSize: 28 } }, p1 ? map.get(p1.driver_number)?.full_name : '—')
}

export default {
  type: 'yourname:winner',
  name: 'Winner',
  description: 'Who won.',
  category: 'Results',
  defaultSize: { w: 6, h: 4 },
  Component: Winner,
  options: [],
}
```

The default export can be:

- a definition, or an array of them;
- a function `(sdk) => definition | definition[]`, which can be `async`. Use this if you'd rather not rely on the import map: the SDK is passed in;
- nothing, if the module calls `registerWidget` itself while loading.

`public/plugins/example-panel.js` is a complete example with a chart, table view, driver focus and an option. Try it by adding `/plugins/example-panel.js` as a plugin.

### JSX and TypeScript

Plugins are plain JavaScript, so compile JSX with the automatic runtime and leave `react`, `react/jsx-runtime` and `aboutf1` as external imports:

```sh
npx esbuild my-panel.tsx --bundle --format=esm --jsx=automatic --external:react --external:react/jsx-runtime --external:aboutf1 --outfile=my-panel.js
```

For types, copy `src/widgets/types.ts` or point at this repo: `import type { WidgetDef, WidgetProps, WidgetSdk } from '<path to repo>/src/widgets/sdk'`.

### Hosting

The URL must serve JavaScript (`text/javascript`) and allow cross-origin requests. GitHub Pages, a gist through jsDelivr (`https://cdn.jsdelivr.net/gh/user/repo@tag/panel.js`) or any static host with CORS works; `raw.githubusercontent.com` doesn't (wrong content type). While developing, serve the file locally (`npx serve --cors`) and press reload next to it under **Plugins** to pick up changes without reloading the page.

### What users see

- Installed plugin URLs are saved in the browser and loaded on startup. Their panels are tagged "Plugin" in the library.
- Exporting a dashboard records the plugin URLs its panels need; importing it offers to install them.
- If a plugin fails to load, the error shows under **Plugins**, and its panels say which type they're missing instead of breaking the dashboard. A panel that throws while rendering shows an error in its own frame only.
- Plugins run with the page's full access (its localStorage and requests), so users should only add plugins they trust.

## Local panels (`src/widgets/custom/`)

For a panel that lives in your own copy of the app, put a `.tsx` file in `src/widgets/custom/` exporting a `WidgetDef` (named or default, or an array). It's registered at build time with nothing else to edit, and can import anything from `src/` directly, like the built-ins do:

```tsx
import { useResults } from '../../api/hooks'
import type { WidgetDef, WidgetProps } from '../types'

function MyPanel({ sessionKey }: WidgetProps) { … }

export const myPanel: WidgetDef = { type: 'my-panel', name: 'My panel', … , Component: MyPanel }
```

To ship it as a built-in instead, move it into a group folder and add it to that group's `index.ts`.
