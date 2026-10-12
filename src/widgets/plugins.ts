import { create } from 'zustand'
import { useStore } from '../store'
import { getWidgets, registerWidget, unregisterSource, validateWidget } from './registry'
import { createSdk } from './sdk'
import type { WidgetDef } from './types'

/**
 * Plugins are ES modules loaded from a URL. A module can
 * - `export default function (sdk) { return widgetDef or [widgetDefs] }` (may be async),
 * - `export default widgetDef` or `[widgetDefs]`, or
 * - call `registerWidget` from the SDK while it loads.
 * See WIDGETS.md for the full guide.
 */

export interface PluginStatus {
  state: 'loading' | 'ready' | 'error'
  error?: string
  /** Panel types it registered */
  types: string[]
}

export const usePluginStatus = create<Record<string, PluginStatus>>(() => ({}))

/** The plugin currently being loaded, so top-level `registerWidget` calls are credited to it. */
let current: string | null = null
const sdk = createSdk(() => current ?? 'local')
;(window as unknown as { AboutF1: typeof sdk }).AboutF1 = sdk

/** Loads run one at a time so registrations are credited to the right plugin. */
let queue: Promise<unknown> = Promise.resolve()
/** Times each URL has been imported this page view; re-imports get a fresh module instance. */
const imported = new Map<string, number>()

export function normalizePluginUrl(raw: string): string {
  const url = new URL(raw.trim(), location.href)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Use an http(s) URL to a JavaScript module.')
  return url.href
}

function setStatus(url: string, s: PluginStatus | null) {
  usePluginStatus.setState((all) => {
    const next = { ...all }
    if (s) next[url] = s
    else delete next[url]
    return next
  })
}

async function importPlugin(url: string) {
  current = url
  try {
    const n = imported.get(url) ?? 0
    imported.set(url, n + 1)
    // A fragment gives a new module instance (so its top-level code runs again) without bypassing the HTTP cache.
    const mod = await import(/* @vite-ignore */ n ? `${url}#reload-${n}` : url)
    let out: unknown = mod.default
    if (typeof out === 'function') out = await out(createSdk(() => url))
    if (out) {
      const defs = (Array.isArray(out) ? out : [out]) as WidgetDef[]
      defs.forEach(validateWidget)
      registerWidget(defs, url)
    }
  } finally {
    current = null
  }
  const types = getWidgets().filter((w) => w.source === url).map((w) => w.type)
  if (!types.length) throw new Error('The module loaded but didn’t provide any panels. Export a panel definition (or a function returning one) as its default export.')
  return types
}

export function loadPlugin(url: string): Promise<void> {
  setStatus(url, { state: 'loading', types: [] })
  const run = queue.then(async () => {
    unregisterSource(url)
    try {
      setStatus(url, { state: 'ready', types: await importPlugin(url) })
    } catch (e) {
      unregisterSource(url)
      const msg = e instanceof Error ? e.message : String(e)
      // Browsers report a failed module fetch as a TypeError ("Failed to fetch dynamically imported module", "Importing a module script failed").
      const fetchFailed = e instanceof TypeError && /import|fetch|module/i.test(msg)
      setStatus(url, { state: 'error', types: [], error: fetchFailed ? `Couldn’t load the module. Check the URL serves JavaScript with CORS allowed. (${msg})` : msg })
      console.error(`[plugins] ${url}:`, e)
    }
  })
  queue = run
  return run
}

export function installPlugin(raw: string) {
  const url = normalizePluginUrl(raw)
  const { plugins, setPlugins } = useStore.getState()
  if (!plugins.includes(url)) setPlugins([...plugins, url])
  return loadPlugin(url)
}

export function uninstallPlugin(url: string) {
  const { plugins, setPlugins } = useStore.getState()
  setPlugins(plugins.filter((p) => p !== url))
  unregisterSource(url)
  setStatus(url, null)
}

/** Plugin URLs providing these panel types (for dashboard exports). */
export function pluginsFor(types: Iterable<string>): string[] {
  const status = usePluginStatus.getState()
  const want = new Set(types)
  return Object.entries(status)
    .filter(([, s]) => s.types.some((t) => want.has(t)))
    .map(([url]) => url)
}

export const usePluginsLoading = () => usePluginStatus((s) => Object.values(s).some((p) => p.state === 'loading'))

export function loadInstalledPlugins() {
  for (const url of useStore.getState().plugins) void loadPlugin(url)
}
