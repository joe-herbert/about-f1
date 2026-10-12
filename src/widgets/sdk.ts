import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as apiHooks from '../api/hooks'
import * as jolpicaHooks from '../api/jolpica/hooks'
import { Chart, escapeHtml, tipRow, tipTitle } from '../components/Chart'
import { DataTable } from '../components/DataTable'
import { Compound, DriverTag, Empty, ErrorState, gate, Legend, Loading, NeedSession, Pill, TeamBar } from '../components/ui'
import { useViewMode } from '../components/viewMode'
import { useChampionshipOrder, useSeasonOrder } from '../lib/championshipOrder'
import * as derive from '../lib/derive'
import { label as driverLabel, teamColorMap, useDriverMap, useDriverMapWithSeason, useSeasonDriverMap } from '../lib/drivers'
import * as format from '../lib/format'
import { useConstructorColors, useFocusCodes, useHistoryRef } from '../lib/history'
import { LIVERY, PALETTE } from '../lib/livery'
import { useGlobalSession, useWidgetSession } from '../lib/session'
import { COMPOUNDS, compoundColor, FLAG_COLORS, inkOn, mix, useTokens } from '../lib/theme'
import { useStore } from '../store'
import { CATEGORIES, defaultOptions, registerWidget } from './registry'
import type { WidgetDef } from './types'

/**
 * Everything a plugin panel can use. Plugins get it as the argument to their default export,
 * as `window.AboutF1`, or with `import { hooks, ui } from 'aboutf1'` (see the import map in index.html).
 * Only add to this; renaming or removing anything breaks published plugins. Bump `version` when adding.
 */
export function createSdk(source: () => string) {
  return {
    version: 1,
    React,
    jsxRuntime,
    /** Add panel types. Returns a function that removes them again. */
    registerWidget: (defs: WidgetDef | WidgetDef[]) => registerWidget(defs, source()),
    categories: CATEGORIES,
    defaultOptions,
    /** Data hooks. Session hooks take a session key and return React Query results with `data` already in OpenF1's shape for every season. */
    hooks: {
      ...apiHooks,
      ...jolpicaHooks,
      useDriverMap,
      useSeasonDriverMap,
      useDriverMapWithSeason,
      useChampionshipOrder,
      useSeasonOrder,
      useHistoryRef,
      useConstructorColors,
      useFocusCodes,
      useGlobalSession,
      useWidgetSession,
      useTokens,
      useViewMode,
      /** The app's store: `useStore((s) => s.prefs)` for units, theme and density. */
      useStore,
    },
    /** Components and helpers that match the built-in panels. */
    ui: { Chart, DataTable, Loading, Empty, ErrorState, gate, NeedSession, DriverTag, TeamBar, Compound, Pill, Legend, tipRow, tipTitle, escapeHtml },
    lib: { format, derive, driverLabel, teamColorMap, COMPOUNDS, compoundColor, FLAG_COLORS, inkOn, mix, LIVERY, PALETTE },
  }
}

export type WidgetSdk = ReturnType<typeof createSdk>
export type { WidgetDef, WidgetProps, OptionSpec, OptionFieldProps, Category, DriverFilter } from './types'
