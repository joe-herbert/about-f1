import { useMemo, useState } from 'react'
import { Plug, Plus, RotateCw, Search, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { installPlugin, loadPlugin, uninstallPlugin, usePluginStatus } from '../widgets/plugins'
import { categoriesOf, defaultOptions, useWidgets } from '../widgets/registry'
import type { Category } from '../widgets/types'
import { Drawer } from './Drawer'

function pluginName(url: string) {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`
  } catch {
    return url
  }
}

function Plugins() {
  const urls = useStore((s) => s.plugins)
  const status = usePluginStatus()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    if (!draft.trim()) return
    try {
      void installPlugin(draft)
      setDraft('')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <fieldset className="fieldset plugins">
      <legend>Plugins</legend>
      <p className="settings-desc">
        Add panels anyone has written by pasting the URL of a plugin module. Plugins run with the same access as this page, so only add ones you trust. To write your own, see{' '}
        <code>WIDGETS.md</code> in the source, or try <code>/plugins/example-panel.js</code>.
      </p>
      <form
        className="plugin-add"
        // Relative URLs (a plugin served by this site) are fine; installPlugin validates.
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input type="url" placeholder="https://example.com/my-panel.js" aria-label="Plugin URL" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn" disabled={!draft.trim()}>
          <Plug size={14} /> Add
        </button>
      </form>
      {error && <small className="plugin-error">{error}</small>}
      {urls.length > 0 && (
        <ul className="plugin-list">
          {urls.map((url) => {
            const s = status[url]
            return (
              <li key={url}>
                <div>
                  <div className="plugin-url" title={url}>
                    {pluginName(url)}
                  </div>
                  <small className={s?.state === 'error' ? 'plugin-error' : undefined}>
                    {!s || s.state === 'loading' ? 'Loading…' : s.state === 'error' ? s.error : `${s.types.length} panel${s.types.length === 1 ? '' : 's'}: ${s.types.join(', ')}`}
                  </small>
                </div>
                <button type="button" className="icon-btn" title="Reload" aria-label="Reload plugin" onClick={() => void loadPlugin(url)}>
                  <RotateCw size={14} />
                </button>
                <button type="button" className="icon-btn danger" title="Remove" aria-label="Remove plugin" onClick={() => uninstallPlugin(url)}>
                  <Trash2 size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}

export function WidgetLibrary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addWidget = useStore((s) => s.addWidget)
  const year = useStore((s) => s.year)
  const widgets = useWidgets()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Category | 'All'>('All')
  const [added, setAdded] = useState<string | null>(null)

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return widgets.filter(
      (w) =>
        (cat === 'All' || w.category === cat) &&
        (!needle || w.name.toLowerCase().includes(needle) || w.description.toLowerCase().includes(needle)),
    )
  }, [widgets, q, cat])

  const cats = useMemo(() => categoriesOf(widgets), [widgets])

  return (
    <Drawer open={open} title="Add a panel" onClose={onClose}>
      <label className="search">
        <Search size={14} aria-hidden />
        <input autoFocus placeholder={`Search ${widgets.length} panels`} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="cat-tabs" role="tablist">
        {(['All', ...cats] as const).map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <ul className="lib-list">
        {list.map((w) => (
          <li key={w.type} className="lib-item">
            <div>
              <div className="lib-name">
                {w.name}
                <span className="lib-cat">{w.category}</span>
                {w.source !== 'builtin' && <span className="lib-cat">{w.source === 'local' ? 'Custom' : 'Plugin'}</span>}
                {w.minYear && year < w.minYear && <span className="lib-cat">from {w.minYear}</span>}
              </div>
              <p className="lib-desc">{w.description}</p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                addWidget(w.type, w.defaultSize, defaultOptions(w))
                setAdded(w.type)
                setTimeout(() => setAdded((a) => (a === w.type ? null : a)), 1400)
              }}
            >
              <Plus size={14} />
              {added === w.type ? 'Added' : 'Add'}
            </button>
          </li>
        ))}
        {!list.length && <li className="state">No panels match “{q}”.</li>}
      </ul>
      <Plugins />
    </Drawer>
  )
}
