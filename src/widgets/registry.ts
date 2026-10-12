import { useSyncExternalStore } from 'react'
import { historyWidgets } from './history'
import { miscWidgets } from './misc'
import { raceWidgets } from './race'
import { resultsWidgets } from './results'
import type { BuiltinCategory, Category, WidgetDef } from './types'

/**
 * Every panel type the app knows about. Built-ins register at startup; local widgets in
 * `src/widgets/custom` are picked up automatically; plugins loaded from a URL register at runtime
 * (see `plugins.ts`). Components read it through `useWidgets` / `useWidgetDef` so plugin panels
 * appear without a reload.
 */
const registry = new Map<string, WidgetDef>()
const listeners = new Set<() => void>()
let snapshot: WidgetDef[] = []

function changed() {
  snapshot = [...registry.values()]
  listeners.forEach((l) => l())
}

/** Throws with a readable message when a definition is unusable. */
export function validateWidget(def: unknown): asserts def is WidgetDef {
  const d = def as Partial<WidgetDef> | null
  const where = d && typeof d.type === 'string' ? `Panel “${d.type}”` : 'Panel'
  if (!d || typeof d !== 'object') throw new Error('A panel definition must be an object.')
  if (typeof d.type !== 'string' || !/^[a-z0-9][a-z0-9:._-]*$/i.test(d.type)) throw new Error(`${where}: “type” must be a non-empty id of letters, digits, “-”, “_”, “.” or “:”.`)
  if (typeof d.name !== 'string' || !d.name) throw new Error(`${where}: “name” is required.`)
  if (typeof d.Component !== 'function' && typeof d.Component !== 'object') throw new Error(`${where}: “Component” must be a React component.`)
  if (!d.defaultSize || !(d.defaultSize.w > 0) || !(d.defaultSize.h > 0)) throw new Error(`${where}: “defaultSize” needs positive w and h.`)
  if (d.options !== undefined && !Array.isArray(d.options)) throw new Error(`${where}: “options” must be an array.`)
  for (const o of d.options ?? []) {
    if (!o || typeof o.key !== 'string' || typeof o.label !== 'string' || typeof o.type !== 'string') throw new Error(`${where}: every option needs a key, label and type.`)
    if (o.type === 'custom' && typeof o.Field !== 'function') throw new Error(`${where}: custom option “${o.key}” needs a Field component.`)
  }
}

/**
 * Adds panel types to the library. Returns a function that removes them again.
 * Built-in types can't be replaced; anything else with the same type is overwritten,
 * so reloading a plugin during development just works.
 */
export function registerWidget(defs: WidgetDef | WidgetDef[], source = 'local'): () => void {
  const list = (Array.isArray(defs) ? defs : [defs]).map((d) => {
    validateWidget(d)
    const existing = registry.get(d.type)
    if (existing?.source === 'builtin' && source !== 'builtin') throw new Error(`Panel type “${d.type}” is built in. Pick another type id, e.g. “yourname:${d.type}”.`)
    // Plugins are plain JavaScript, so fill in what they may leave out.
    return { ...d, description: d.description ?? '', category: d.category ?? 'Utility', options: d.options ?? [], source } satisfies WidgetDef
  })
  for (const d of list) registry.set(d.type, d)
  changed()
  return () => {
    let any = false
    for (const d of list) if (registry.get(d.type) === d) any = registry.delete(d.type) || any
    if (any) changed()
  }
}

/** Removes every panel type a plugin registered. */
export function unregisterSource(source: string) {
  let any = false
  for (const [type, d] of registry) if (d.source === source) any = registry.delete(type) || any
  if (any) changed()
}

export function subscribeWidgets(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export const getWidgets = () => snapshot
export const getWidget = (type: string) => registry.get(type)

export function useWidgets(): WidgetDef[] {
  return useSyncExternalStore(subscribeWidgets, getWidgets)
}

export function useWidgetDef(type: string | undefined): WidgetDef | undefined {
  return useSyncExternalStore(subscribeWidgets, () => (type ? registry.get(type) : undefined))
}

export const CATEGORIES: BuiltinCategory[] = [
  'Results',
  'Championship',
  'Race',
  'Laps',
  'Strategy',
  'Telemetry',
  'Conditions',
  'Session',
  'Records',
  'Utility',
]

/** Built-in categories in their usual order, then any categories plugins introduced. */
export function categoriesOf(defs: WidgetDef[]): Category[] {
  const used = new Set(defs.map((d) => d.category))
  const extra = [...used].filter((c) => !(CATEGORIES as string[]).includes(c)).sort()
  return [...CATEGORIES.filter((c) => used.has(c)), ...extra]
}

export function defaultOptions(def: WidgetDef) {
  return Object.fromEntries(def.options.map((o) => [o.key, o.default]))
}

registerWidget([...resultsWidgets, ...raceWidgets, ...miscWidgets, ...historyWidgets], 'builtin')

// Drop a file in src/widgets/custom that exports one or more WidgetDefs and it's registered here.
const local = import.meta.glob<Record<string, unknown>>('./custom/**/*.{ts,tsx,js,jsx}', { eager: true })
for (const [file, mod] of Object.entries(local)) {
  for (const value of Object.values(mod)) {
    const defs = Array.isArray(value) ? value : [value]
    if (!defs.length || !defs.every((d) => d && typeof d === 'object' && 'type' in d && 'Component' in d)) continue
    try {
      registerWidget(defs as WidgetDef[], 'local')
    } catch (e) {
      console.error(`[widgets] ${file}:`, e)
    }
  }
}
