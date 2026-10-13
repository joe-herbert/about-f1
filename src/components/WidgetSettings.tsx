import { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useDriverMap } from '../lib/drivers'
import { useGlobalSession, useWidgetSession } from '../lib/session'
import { useActiveDashboard, useStore, type OptionValue, type WidgetInstance } from '../store'
import { defaultOptions, useWidgetDef } from '../widgets/registry'
import type { OptionSpec, WidgetDef } from '../widgets/types'
import { DriverChips } from './DriverFilterBar'
import { Drawer } from './Drawer'
import { SessionPicker, yearChoices } from './SessionPicker'
import { FIRST_SEASON, useJSeasonDrivers } from '../api/jolpica/hooks'
import { LEGENDS } from '../lib/history'
import { useDriverIndex } from '../api/records/load'
import { byChampionship, useChampionshipOrder } from '../lib/championshipOrder'

function OptionField({ spec, value, onChange, sessionKey }: { spec: OptionSpec; value: OptionValue; onChange: (v: OptionValue) => void; sessionKey: number | null }) {
  const { map } = useDriverMap(spec.type === 'driver' ? sessionKey : null)
  const id = `opt-${spec.key}`
  switch (spec.type) {
    case 'toggle':
      return (
        <label className="field field-toggle" htmlFor={id}>
          <span>
            {spec.label}
            {spec.help && <small>{spec.help}</small>}
          </span>
          <input id={id} type="checkbox" className="switch" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        </label>
      )
    case 'select':
      return (
        <label className="field" htmlFor={id}>
          <span>{spec.label}</span>
          <select
            id={id}
            value={String(value ?? spec.default)}
            onChange={(e) => {
              const c = spec.choices.find((x) => String(x.value) === e.target.value)
              onChange(c ? c.value : e.target.value)
            }}
          >
            {spec.choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {spec.help && <small>{spec.help}</small>}
        </label>
      )
    case 'number':
      return (
        <label className="field" htmlFor={id}>
          <span>{spec.label}</span>
          <input
            id={id}
            type="number"
            min={spec.min}
            max={spec.max}
            step={spec.step ?? 1}
            value={Number(value ?? spec.default)}
            onChange={(e) => onChange(e.target.value === '' ? spec.default : Number(e.target.value))}
          />
          {spec.help && <small>{spec.help}</small>}
        </label>
      )
    case 'text':
      return (
        <label className="field" htmlFor={id}>
          <span>{spec.label}</span>
          <input id={id} type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
          {spec.help && <small>{spec.help}</small>}
        </label>
      )
    case 'textarea':
      return (
        <label className="field" htmlFor={id}>
          <span>{spec.label}</span>
          <textarea id={id} rows={8} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
          {spec.help && <small>{spec.help}</small>}
        </label>
      )
    case 'season':
      return (
        <label className="field" htmlFor={id}>
          <span>{spec.label}</span>
          <select id={id} value={Number(value) || 0} onChange={(e) => onChange(Number(e.target.value))}>
            <option value={0}>Follow header</option>
            {yearChoices(FIRST_SEASON).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {spec.help && <small>{spec.help}</small>}
        </label>
      )
    case 'histDriver':
      return <HistDriverField id={id} label={spec.label} help={spec.help} value={String(value ?? '')} onChange={onChange} />
    case 'custom': {
      const { Field } = spec
      return <Field id={id} label={spec.label} help={spec.help} value={value ?? spec.default} onChange={onChange} sessionKey={sessionKey} />
    }
    case 'driver': {
      const drivers = [...map.values()].sort((a, b) => (a.team_name ?? '').localeCompare(b.team_name ?? ''))
      return (
        <label className="field" htmlFor={id}>
          <span>{spec.label}</span>
          <select id={id} value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">Automatic</option>
            {drivers.map((d) => (
              <option key={d.driver_number} value={d.driver_number}>
                {d.name_acronym}, {d.full_name} ({d.team_name})
              </option>
            ))}
          </select>
          {spec.help && <small>{spec.help}</small>}
        </label>
      )
    }
  }
}

function HistDriverField({ id, label, help, value, onChange }: { id: string; label: string; help?: string; value: string; onChange: (v: OptionValue) => void }) {
  const year = useStore((s) => s.year)
  const season = useJSeasonDrivers(year)
  const index = useDriverIndex()
  // Header season first, then legends, then everyone else since 1950 (the baked list
  // misses rookies after the bake, which the season list covers).
  const options = useMemo(() => {
    const out = new Map<string, string>()
    for (const d of season.data?.drivers ?? []) out.set(d.driverId, `${d.givenName} ${d.familyName}`)
    for (const l of LEGENDS) if (!out.has(l.id)) out.set(l.id, l.name)
    for (const d of [...(index.data ?? [])].sort((a, b) => a.name.localeCompare(b.name))) if (!out.has(d.id)) out.set(d.id, d.name)
    return out
  }, [season.data, index.data])
  const nameOf = (v: string) => options.get(v) ?? v
  const [text, setText] = useState<string | null>(null) // null while not editing: show the saved driver's name
  const resolve = (t: string) => {
    const q = t.trim().toLowerCase()
    if (options.has(q)) return q
    for (const [k, name] of options) if (name.toLowerCase() === q) return k
    return null
  }
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="text"
        list={`${id}-list`}
        placeholder="Automatic"
        autoComplete="off"
        value={text ?? nameOf(value)}
        onChange={(e) => {
          // Only save a recognised driver; saving every keystroke would fetch a career per letter.
          setText(e.target.value)
          const hit = e.target.value.trim() ? resolve(e.target.value) : ''
          if (hit !== null && hit !== value) onChange(hit)
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => e.key === 'Escape' && setText(null)}
      />
      <datalist id={`${id}-list`}>
        {[...options].map(([k, name]) => (
          <option key={k} value={name} />
        ))}
      </datalist>
      <small>{help ?? 'Start typing a name and choose from the list. Leave empty to follow the race winner.'}</small>
    </label>
  )
}

function Settings({ instance, def }: { instance: WidgetInstance; def: WidgetDef }) {
  const update = useStore((s) => s.updateWidget)
  const setOpt = useStore((s) => s.setWidgetOption)
  const globalYear = useStore((s) => s.year)
  const global = useGlobalSession()
  const { sessionKey } = useWidgetSession(instance.sessionKey)
  const { map } = useDriverMap(sessionKey)
  const standings = useChampionshipOrder(sessionKey)
  const orderedDrivers = useMemo(() => {
    const cmp = byChampionship(standings)
    return [...map.values()].sort(cmp)
  }, [map, standings])
  const [pinYear, setPinYear] = useState(globalYear)
  const opts = { ...defaultOptions(def), ...instance.options }
  const pinned = !!instance.sessionKey
  const customDrivers = !!instance.drivers

  return (
    <div className="settings">
      <p className="settings-desc">{def.description}</p>

      <label className="field" htmlFor="w-title">
        <span>Title</span>
        <input id="w-title" type="text" placeholder={def.name} value={instance.title ?? ''} onChange={(e) => update(instance.id, { title: e.target.value || undefined })} />
      </label>

      {!def.sessionless && (
        <fieldset className="fieldset">
          <legend>Session</legend>
          <div className="segmented">
            <button type="button" className={!pinned ? 'on' : ''} onClick={() => update(instance.id, { sessionKey: null })}>
              Follow header
            </button>
            <button type="button" className={pinned ? 'on' : ''} onClick={() => update(instance.id, { sessionKey: global.sessionKey })} disabled={!global.sessionKey}>
              Pin a session
            </button>
          </div>
          {pinned && (
            <SessionPicker
              year={pinYear}
              sessionKey={instance.sessionKey ?? null}
              onYear={setPinYear}
              onSession={(k) => update(instance.id, { sessionKey: k })}
              allowLatest={false}
              compact
            />
          )}
          <small>Pin a session to compare it with whatever the header shows, such as last year’s race at this track.</small>
        </fieldset>
      )}

      {def.usesDrivers && (
        <fieldset className="fieldset">
          <legend>Drivers</legend>
          <div className="segmented">
            <button type="button" className={!customDrivers ? 'on' : ''} onClick={() => update(instance.id, { drivers: null })}>
              Follow focus
            </button>
            <button type="button" className={customDrivers ? 'on' : ''} onClick={() => update(instance.id, { drivers: instance.drivers ?? [] })}>
              Choose drivers
            </button>
          </div>
          {customDrivers && (
            <DriverChips
              drivers={orderedDrivers}
              selected={instance.drivers ?? []}
              onToggle={(n) => {
                const cur = instance.drivers ?? []
                update(instance.id, { drivers: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n] })
              }}
            />
          )}
        </fieldset>
      )}

      {def.options.length > 0 && (
        <fieldset className="fieldset">
          <legend>Display</legend>
          {def.options.map((spec) => (
            <OptionField key={spec.key} spec={spec} value={opts[spec.key]} sessionKey={sessionKey} onChange={(v) => setOpt(instance.id, spec.key, v)} />
          ))}
          <button type="button" className="link-btn" onClick={() => update(instance.id, { options: defaultOptions(def) })}>
            <RotateCcw size={12} /> Reset display options
          </button>
        </fieldset>
      )}
    </div>
  )
}

export function WidgetSettings({ id, onClose }: { id: string | null; onClose: () => void }) {
  const dash = useActiveDashboard()
  const instance = id ? dash.widgets[id] : undefined
  const def = useWidgetDef(instance?.type)
  return (
    <Drawer open={!!instance && !!def} title={instance?.title || def?.name || 'Panel'} onClose={onClose}>
      {instance && def && <Settings instance={instance} def={def} />}
    </Drawer>
  )
}
