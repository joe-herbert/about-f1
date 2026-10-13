import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Download, Lock, MoreHorizontal, Pencil, Plus, Trash2, Unlock, Upload } from 'lucide-react'
import { useGlobalSession, useHeaderUpcoming } from '../lib/session'
import { useActiveDashboard, useStore, type Dashboard } from '../store'
import { installPlugin, pluginsFor } from '../widgets/plugins'

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Adds the plugin URLs the dashboards' panels come from, so importing elsewhere can offer to install them. */
function withPlugins<T extends object>(data: T, dashboards: Dashboard[]) {
  const plugins = pluginsFor(dashboards.flatMap((d) => Object.values(d.widgets).map((w) => w.type)))
  return plugins.length ? { ...data, plugins } : data
}

function offerPlugins(parsed: unknown, dashboards: unknown[]) {
  const listed = [parsed, ...dashboards].flatMap((x) => {
    const p = (x as { plugins?: unknown } | null)?.plugins
    return Array.isArray(p) ? p.filter((u): u is string => typeof u === 'string') : []
  })
  const installed = useStore.getState().plugins
  const missing = [...new Set(listed)].filter((u) => !installed.includes(u))
  if (!missing.length) return
  if (!confirm(`These dashboards use panels from plugins:\n\n${missing.join('\n')}\n\nPlugins run with the same access as this page. Install them?`)) return
  for (const url of missing) {
    try {
      void installPlugin(url)
    } catch (e) {
      console.error(`[plugins] ${url}:`, e)
    }
  }
}

function isDashboard(x: unknown): x is Dashboard {
  const d = x as Dashboard
  return !!d && typeof d.name === 'string' && typeof d.widgets === 'object' && typeof d.layouts === 'object'
}

/**
 * Opens the preview dashboard when the header moves to a session that hasn't started,
 * and goes back to the dashboard that was open before once it has (or another is picked).
 */
function useUpcomingSwitch(upcoming: boolean | null) {
  const { sessionKey } = useGlobalSession()
  const before = useRef<string | null>(null)
  useEffect(() => {
    if (upcoming === null) return
    const { dashboards, activeId, setActive } = useStore.getState()
    const active = dashboards.find((d) => d.id === activeId)
    if (upcoming) {
      const preview = dashboards.find((d) => d.upcoming)
      if (!preview || active?.upcoming) return
      before.current = activeId
      setActive(preview.id)
    } else if (active?.upcoming) {
      const back = dashboards.find((d) => d.id === before.current && !d.upcoming) ?? dashboards.find((d) => !d.upcoming)
      if (back) setActive(back.id)
    }
  }, [upcoming, sessionKey])
}

export function DashboardTabs({ onAdd }: { onAdd: () => void }) {
  const all = useStore((s) => s.dashboards)
  const upcoming = useHeaderUpcoming()
  useUpcomingSwitch(upcoming)
  // Preview dashboards only make sense before the session; keep them out of the way otherwise.
  const activeId = useActiveDashboard().id
  const dashboards = useMemo(() => all.filter((d) => !d.upcoming || upcoming || d.id === activeId), [all, upcoming, activeId])
  const setActive = useStore((s) => s.setActive)
  const addDashboard = useStore((s) => s.addDashboard)
  const rename = useStore((s) => s.renameDashboard)
  const del = useStore((s) => s.deleteDashboard)
  const move = useStore((s) => s.moveDashboard)
  const importDashboard = useStore((s) => s.importDashboard)
  const locked = useStore((s) => s.locked)
  const setLocked = useStore((s) => s.setLocked)
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const active = all.find((d) => d.id === activeId)!

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const onImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      const list = Array.isArray(parsed) ? parsed : parsed?.dashboards ?? [parsed]
      const valid = list.filter(isDashboard)
      if (!valid.length) throw new Error('no dashboards')
      valid.forEach(importDashboard)
      offerPlugins(parsed, valid)
      setNotice(`Imported ${valid.length} dashboard${valid.length > 1 ? 's' : ''}`)
    } catch {
      setNotice('That file isn’t a dashboard export. Choose a .json file exported from this app.')
    }
    setTimeout(() => setNotice(null), 4000)
  }

  return (
    <div className="tabs-row">
      <nav className="tabs" aria-label="Dashboards">
        {dashboards.map((d) =>
          editing === d.id ? (
            <input
              key={d.id}
              className="tab-input"
              autoFocus
              defaultValue={d.name}
              onBlur={(e) => {
                rename(d.id, e.target.value.trim() || d.name)
                setEditing(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditing(null)
              }}
            />
          ) : (
            <button
              key={d.id}
              type="button"
              className={`tab${d.id === activeId ? ' on' : ''}${d.upcoming ? ' tab-preview' : ''}`}
              aria-current={d.id === activeId ? 'page' : undefined}
              onClick={() => setActive(d.id)}
              onDoubleClick={() => setEditing(d.id)}
              title={d.upcoming ? 'Shown while the selected session is still to come. Double-click to rename' : 'Double-click to rename'}
            >
              {d.name}
            </button>
          ),
        )}
        <button type="button" className="tab tab-new" onClick={() => addDashboard()} title="New dashboard" aria-label="New dashboard">
          <Plus size={14} />
        </button>
      </nav>

      <div className="tabs-actions">
        {notice && <span className="notice" role="status">{notice}</span>}
        <button type="button" className="btn ghost" onClick={() => setLocked(!locked)} aria-pressed={locked} title={locked ? 'Unlock to move and resize panels' : 'Lock the layout'}>
          {locked ? <Lock size={14} /> : <Unlock size={14} />}
          {locked ? 'Locked' : 'Lock layout'}
        </button>
        <button type="button" className="btn primary" onClick={onAdd}>
          <Plus size={14} />
          Add panel
        </button>
        <div className="menu-wrap" ref={menuRef}>
          <button type="button" className="icon-btn" aria-label="Dashboard options" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <MoreHorizontal size={16} />
          </button>
          {menu && (
            <div className="menu" role="menu">
              <button role="menuitem" type="button" onClick={() => (setEditing(active.id), setMenu(false))}>
                <Pencil size={14} /> Rename
              </button>
              <button role="menuitem" type="button" onClick={() => (addDashboard(`${active.name} copy`, active), setMenu(false))}>
                <Copy size={14} /> Duplicate
              </button>
              <button role="menuitem" type="button" onClick={() => move(active.id, -1)}>
                <ChevronLeft size={14} /> Move left
              </button>
              <button role="menuitem" type="button" onClick={() => move(active.id, 1)}>
                <ChevronRight size={14} /> Move right
              </button>
              <hr />
              <button role="menuitem" type="button" onClick={() => (download(`${active.name}.json`, withPlugins(active, [active])), setMenu(false))}>
                <Download size={14} /> Export this dashboard
              </button>
              <button role="menuitem" type="button" onClick={() => (download('f1-dashboards.json', withPlugins({ dashboards: all }, all)), setMenu(false))}>
                <Download size={14} /> Export all dashboards
              </button>
              <button role="menuitem" type="button" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Import from file
              </button>
              <hr />
              <button
                role="menuitem"
                type="button"
                className="danger"
                onClick={() => {
                  if (confirm(`Delete “${active.name}”? Its panels and layout will be lost.`)) del(active.id)
                  setMenu(false)
                }}
              >
                <Trash2 size={14} /> Delete dashboard
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImport(f)
              e.target.value = ''
              setMenu(false)
            }}
          />
        </div>
      </div>
    </div>
  )
}
