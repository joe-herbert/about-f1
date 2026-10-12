import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layout, Layouts } from 'react-grid-layout'
import { defaultDashboards, driversDashboard, recordsDashboard } from './presets'
import { OPENF1_FIRST_YEAR, synthSessionKey } from '../api/synthetic'

/** History-only panel types that now exist as regular panels reading both sources. */
const MERGED_TYPES: Record<string, string> = {
  'hist-results': 'results-table',
  'hist-qualifying': 'results-table',
  'hist-driver-standings': 'driver-standings',
  'hist-constructor-standings': 'team-standings',
  'hist-race-laps': 'position-chart',
  'hist-pitstops': 'pit-stops',
  'hist-season-progression': 'season-progression',
  'hist-season-grid': 'season-matrix',
}

export type OptionValue = string | number | boolean | number[] | null

export interface WidgetInstance {
  id: string
  type: string
  title?: string
  /** null = follow the session picked in the header */
  sessionKey?: number | null
  /** null = follow the header's driver filter */
  drivers?: number[] | null
  options: Record<string, OptionValue>
}

export interface Dashboard {
  id: string
  name: string
  layouts: Layouts
  widgets: Record<string, WidgetInstance>
}

export type ThemePref = 'system' | 'light' | 'dark'

export interface Prefs {
  theme: ThemePref
  speedUnit: 'kmh' | 'mph'
  tempUnit: 'C' | 'F'
  /** How the header driver filter treats other drivers in charts */
  filterMode: 'hide' | 'dim'
  density: 'comfortable' | 'compact'
  showLegends: boolean
  animate: boolean
}

interface State {
  dashboards: Dashboard[]
  activeId: string
  year: number
  /** null = latest session */
  sessionKey: number | null
  drivers: number[]
  /** Layout locked: no dragging or resizing */
  locked: boolean
  prefs: Prefs
  /** URLs of plugin modules that add panel types */
  plugins: string[]

  setYear: (y: number) => void
  setSession: (k: number | null) => void
  setDrivers: (d: number[]) => void
  toggleDriver: (d: number) => void
  setLocked: (l: boolean) => void
  setPrefs: (p: Partial<Prefs>) => void
  setPlugins: (urls: string[]) => void

  setActive: (id: string) => void
  addDashboard: (name?: string, from?: Dashboard) => string
  renameDashboard: (id: string, name: string) => void
  deleteDashboard: (id: string) => void
  moveDashboard: (id: string, dir: -1 | 1) => void
  importDashboard: (d: Dashboard) => void
  resetDashboards: () => void

  setLayouts: (layouts: Layouts) => void
  addWidget: (type: string, size: { w: number; h: number }, options?: Record<string, OptionValue>) => void
  updateWidget: (id: string, patch: Partial<WidgetInstance>) => void
  setWidgetOption: (id: string, key: string, value: OptionValue) => void
  duplicateWidget: (id: string) => void
  removeWidget: (id: string) => void
}

export const uid = () => Math.random().toString(36).slice(2, 10)

const BREAKPOINTS = ['lg', 'md', 'sm'] as const
export const COLS = { lg: 24, md: 12, sm: 4 }

function mapActive(s: State, fn: (d: Dashboard) => Dashboard): Pick<State, 'dashboards'> {
  return { dashboards: s.dashboards.map((d) => (d.id === s.activeId ? fn(d) : d)) }
}

function bottom(layout: Layout[] = []) {
  return layout.reduce((m, l) => Math.max(m, l.y + l.h), 0)
}

function cloneDashboard(d: Dashboard, name: string): Dashboard {
  const idMap: Record<string, string> = {}
  const widgets: Record<string, WidgetInstance> = {}
  for (const w of Object.values(d.widgets)) {
    const id = uid()
    idMap[w.id] = id
    widgets[id] = { ...structuredClone(w), id }
  }
  const layouts: Layouts = {}
  for (const [bp, l] of Object.entries(d.layouts)) {
    layouts[bp] = l.filter((i) => idMap[i.i]).map((i) => ({ ...i, i: idMap[i.i] }))
  }
  return { id: uid(), name, layouts, widgets }
}

const initialDashboards = defaultDashboards()

export const useStore = create<State>()(
  persist(
    (set) => ({
      dashboards: initialDashboards,
      activeId: initialDashboards[0].id,
      year: new Date().getFullYear(),
      sessionKey: null,
      drivers: [],
      locked: false,
      prefs: {
        theme: 'system',
        speedUnit: 'kmh',
        tempUnit: 'C',
        filterMode: 'dim',
        density: 'comfortable',
        showLegends: true,
        animate: true,
      },
      plugins: [],

      setYear: (year) => set({ year, sessionKey: null, drivers: [] }),
      setSession: (sessionKey) => set({ sessionKey }),
      setDrivers: (drivers) => set({ drivers }),
      toggleDriver: (d) =>
        set((s) => ({ drivers: s.drivers.includes(d) ? s.drivers.filter((x) => x !== d) : [...s.drivers, d] })),
      setLocked: (locked) => set({ locked }),
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
      setPlugins: (plugins) => set({ plugins }),

      setActive: (activeId) => set({ activeId }),
      addDashboard: (name, from) => {
        const d = from
          ? cloneDashboard(from, name ?? `${from.name} copy`)
          : { id: uid(), name: name ?? 'New dashboard', layouts: { lg: [] }, widgets: {} }
        set((s) => ({ dashboards: [...s.dashboards, d], activeId: d.id }))
        return d.id
      },
      renameDashboard: (id, name) =>
        set((s) => ({ dashboards: s.dashboards.map((d) => (d.id === id ? { ...d, name } : d)) })),
      deleteDashboard: (id) =>
        set((s) => {
          const rest = s.dashboards.filter((d) => d.id !== id)
          const dashboards = rest.length ? rest : defaultDashboards()
          return { dashboards, activeId: dashboards[0].id }
        }),
      moveDashboard: (id, dir) =>
        set((s) => {
          const i = s.dashboards.findIndex((d) => d.id === id)
          const j = i + dir
          if (i < 0 || j < 0 || j >= s.dashboards.length) return {}
          const dashboards = [...s.dashboards]
          ;[dashboards[i], dashboards[j]] = [dashboards[j], dashboards[i]]
          return { dashboards }
        }),
      importDashboard: (d) => {
        const copy = cloneDashboard(d, d.name)
        set((s) => ({ dashboards: [...s.dashboards, copy], activeId: copy.id }))
      },
      resetDashboards: () => {
        const dashboards = defaultDashboards()
        set({ dashboards, activeId: dashboards[0].id })
      },

      setLayouts: (layouts) => set((s) => mapActive(s, (d) => ({ ...d, layouts }))),
      addWidget: (type, size, options = {}) =>
        set((s) =>
          mapActive(s, (d) => {
            const id = uid()
            const layouts: Layouts = { ...d.layouts }
            for (const bp of BREAKPOINTS) {
              const cols = COLS[bp]
              const w = Math.min(cols, bp === 'lg' ? size.w : Math.round((size.w / 24) * cols) || cols)
              layouts[bp] = [...(layouts[bp] ?? []), { i: id, x: 0, y: bottom(layouts[bp]), w, h: size.h, minW: 2, minH: 3 }]
            }
            return { ...d, layouts, widgets: { ...d.widgets, [id]: { id, type, options } } }
          }),
        ),
      updateWidget: (id, patch) =>
        set((s) =>
          mapActive(s, (d) => ({ ...d, widgets: { ...d.widgets, [id]: { ...d.widgets[id], ...patch, id } } })),
        ),
      setWidgetOption: (id, key, value) =>
        set((s) =>
          mapActive(s, (d) => ({
            ...d,
            widgets: { ...d.widgets, [id]: { ...d.widgets[id], options: { ...d.widgets[id].options, [key]: value } } },
          })),
        ),
      duplicateWidget: (id) =>
        set((s) =>
          mapActive(s, (d) => {
            const src = d.widgets[id]
            if (!src) return d
            const nid = uid()
            const layouts: Layouts = {}
            for (const [bp, l] of Object.entries(d.layouts)) {
              const item = l.find((i) => i.i === id)
              layouts[bp] = item ? [...l, { ...item, i: nid, y: bottom(l) }] : l
            }
            return { ...d, layouts, widgets: { ...d.widgets, [nid]: { ...structuredClone(src), id: nid } } }
          }),
        ),
      removeWidget: (id) =>
        set((s) =>
          mapActive(s, (d) => {
            const widgets = { ...d.widgets }
            delete widgets[id]
            const layouts: Layouts = {}
            for (const [bp, l] of Object.entries(d.layouts)) layouts[bp] = l.filter((i) => i.i !== id)
            return { ...d, layouts, widgets }
          }),
        ),
    }),
    {
      name: 'f1-stats',
      version: 5,
      migrate: (persisted, version) => {
        const s = persisted as State & { round?: number | null }
        if (!Array.isArray(s.dashboards)) return s
        // v2 added the records (formerly History) dashboard.
        if (version < 2) s.dashboards = [...s.dashboards, recordsDashboard()]
        // v3 merged OpenF1 and Jolpica: history-only duplicates became the regular panels,
        // and pre-2023 rounds became synthetic session keys.
        if (version < 3) {
          for (const d of s.dashboards) {
            if (d.name === 'History') d.name = 'Records'
            for (const w of Object.values(d.widgets)) {
              const to = MERGED_TYPES[w.type]
              if (to) Object.assign(w, { type: to, options: {} })
            }
          }
          if (s.round && s.year < OPENF1_FIRST_YEAR) s.sessionKey = synthSessionKey(s.year, s.round, 'race')
          delete s.round
        }
        // v4 added the Drivers dashboard (a card per championship position).
        if (version < 4) s.dashboards = [...s.dashboards, driversDashboard()]
        // v5: championship-order cards lost their fixed position titles and grew a row.
        else if (version < 5) {
          for (const d of s.dashboards) {
            const cards = Object.values(d.widgets).filter((w) => w.type === 'driver-card' && w.title?.endsWith('in the championship'))
            const ids = new Set(cards.map((w) => w.id))
            cards.forEach((w) => delete w.title)
            for (const l of Object.values(d.layouts)) for (const item of l) if (ids.has(item.i) && item.h === 11) item.h = 12
          }
        }
        return s
      },
      partialize: (s) => ({
        dashboards: s.dashboards,
        activeId: s.activeId,
        year: s.year,
        sessionKey: s.sessionKey,
        drivers: s.drivers,
        locked: s.locked,
        prefs: s.prefs,
        plugins: s.plugins,
      }),
      onRehydrateStorage: () => (s) => {
        if (s && !s.dashboards.some((d) => d.id === s.activeId)) s.activeId = s.dashboards[0]?.id ?? ''
      },
    },
  ),
)

export function useActiveDashboard(): Dashboard {
  return useStore((s) => s.dashboards.find((d) => d.id === s.activeId) ?? s.dashboards[0])
}

export { cloneDashboard }
