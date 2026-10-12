import { Component, useMemo, useState, type ReactNode } from 'react'
import { Copy, GripVertical, Maximize2, Minimize2, Settings2, Table2, Trash2, LineChart, Pin } from 'lucide-react'
import { useSessionByKey } from '../api/hooks'
import { useWidgetSession } from '../lib/session'
import { useStore, type WidgetInstance } from '../store'
import { usePluginsLoading } from '../widgets/plugins'
import { defaultOptions, useWidgetDef } from '../widgets/registry'
import type { DriverFilter } from '../widgets/types'
import { Loading } from './ui'
import { TableCapabilityContext, ViewModeContext, type ViewMode } from './viewMode'

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { key: string }) {
    return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null
  }
  render() {
    if (this.state.error)
      return <div className="state state-error">This panel hit an error: {this.state.error.message}. Change its settings or remove it.</div>
    return this.props.children
  }
}

/** Why a panel has nothing for an older season. */
export function coverageNote(minYear: number, year: number) {
  const what =
    minYear >= 2023
      ? 'This panel uses live timing data (telemetry, tyres, weather, race control), which starts in 2023'
      : minYear >= 2011
        ? 'Pit stop timing starts in 2011'
        : 'Lap-by-lap timing starts in 1996'
  return `${what}, so there’s nothing to show for ${year}. Results, standings and records panels cover every season since 1950.`
}

export function useFilterFor(instance: WidgetInstance): DriverFilter {
  const global = useStore((s) => s.drivers)
  const mode = useStore((s) => s.prefs.filterMode)
  const selected = instance.drivers ?? global
  return useMemo(() => {
    const set = new Set(selected)
    const none = set.size === 0
    // A panel with its own driver list always hides the rest.
    const m: 'hide' | 'dim' = instance.drivers ? 'hide' : mode
    return {
      selected,
      mode: m,
      visible: (n: number) => none || m === 'dim' || set.has(n),
      dimmed: (n: number) => !none && m === 'dim' && !set.has(n),
    }
  }, [selected, mode, instance.drivers])
}

export function WidgetBody({ instance, view }: { instance: WidgetInstance; view: ViewMode }) {
  const def = useWidgetDef(instance.type)
  const pluginsLoading = usePluginsLoading()
  const year = useStore((s) => s.year)
  const { sessionKey, session } = useWidgetSession(instance.sessionKey)
  const filter = useFilterFor(instance)
  const opts = useMemo(() => (def ? { ...defaultOptions(def), ...instance.options } : {}), [def, instance.options])
  if (!def && pluginsLoading) return <Loading label="Loading plugins" />
  if (!def)
    return (
      <div className="state">
        Unknown panel type “{instance.type}”. If it comes from a plugin, add the plugin under Add panel → Plugins; otherwise remove it from this dashboard.
      </div>
    )
  if (def.minYear && session && session.year < def.minYear) return <div className="state">{coverageNote(def.minYear, session.year)}</div>
  const C = def.Component
  return (
    <ViewModeContext.Provider value={view}>
      <Boundary resetKey={JSON.stringify([instance.options, sessionKey, view])}>
        <C instance={instance} opts={opts} sessionKey={sessionKey} session={session} year={session?.year ?? year} filter={filter} />
      </Boundary>
    </ViewModeContext.Provider>
  )
}

function PinnedTag({ sessionKey }: { sessionKey: number }) {
  const q = useSessionByKey(sessionKey)
  const s = q.data?.[0]
  return (
    <span className="pinned" title="This panel shows its own session">
      <Pin size={11} />
      {s ? `${s.location} ${s.year}, ${s.session_name}` : 'Pinned session'}
    </span>
  )
}

interface FrameProps {
  instance: WidgetInstance
  onSettings: () => void
  onMaximize: () => void
  maximized?: boolean
}

export function WidgetFrame({ instance, onSettings, onMaximize, maximized }: FrameProps) {
  const def = useWidgetDef(instance.type)
  const locked = useStore((s) => s.locked)
  const duplicate = useStore((s) => s.duplicateWidget)
  const remove = useStore((s) => s.removeWidget)
  const [view, setView] = useState<ViewMode>('chart')
  const [hasTable, setHasTable] = useState(false)
  const title = instance.title || def?.name || instance.type
  const driverCount = instance.drivers?.length

  return (
    <article className={`widget${def?.bare && !maximized ? ' widget-bare' : ''}`} aria-label={title}>
      <header className="widget-head">
        {!locked && !maximized && (
          <span className="drag-handle" title="Drag to move" aria-hidden>
            <GripVertical size={14} />
          </span>
        )}
        <h2 className="widget-title">{title}</h2>
        {instance.sessionKey ? <PinnedTag sessionKey={instance.sessionKey} /> : null}
        {driverCount ? <span className="pinned">{driverCount} drivers</span> : null}
        <div className="widget-tools">
          {hasTable && (
            <button
              type="button"
              className="icon-btn"
              title={view === 'chart' ? 'Show as table' : 'Show as chart'}
              aria-label={view === 'chart' ? 'Show as table' : 'Show as chart'}
              onClick={() => setView(view === 'chart' ? 'table' : 'chart')}
            >
              {view === 'chart' ? <Table2 size={14} /> : <LineChart size={14} />}
            </button>
          )}
          <button type="button" className="icon-btn" title={maximized ? 'Close' : 'Expand'} aria-label={maximized ? 'Close' : 'Expand'} onClick={onMaximize}>
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button type="button" className="icon-btn" title="Panel settings" aria-label="Panel settings" onClick={onSettings}>
            <Settings2 size={14} />
          </button>
          {!maximized && !locked && (
            <>
              <button type="button" className="icon-btn" title="Duplicate" aria-label="Duplicate panel" onClick={() => duplicate(instance.id)}>
                <Copy size={14} />
              </button>
              <button type="button" className="icon-btn danger" title="Remove" aria-label="Remove panel" onClick={() => remove(instance.id)}>
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </header>
      <div className="widget-body">
        <TableCapabilityContext.Provider value={setHasTable}>
          <WidgetBody instance={instance} view={view} />
        </TableCapabilityContext.Provider>
      </div>
    </article>
  )
}
