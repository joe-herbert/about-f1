import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { clearCache } from '../api/client'
import { budgetRemaining } from '../api/jolpica/client'
import { useStore, type Prefs } from '../store'
import { Drawer } from './Drawer'

function Segmented<T extends string>({ value, choices, onChange, label }: { value: T; choices: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {choices.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={value === c.value} className={value === c.value ? 'on' : ''} onClick={() => onChange(c.value)}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function PrefsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = useStore((s) => s.prefs)
  const set = useStore((s) => s.setPrefs)
  const reset = useStore((s) => s.resetDashboards)
  const qc = useQueryClient()
  const [cleared, setCleared] = useState(false)
  const p = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => set({ [k]: v } as Partial<Prefs>)

  return (
    <Drawer open={open} title="Preferences" onClose={onClose}>
      <div className="settings">
        <Segmented label="Theme" value={prefs.theme} onChange={p('theme')} choices={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        <Segmented label="Speed" value={prefs.speedUnit} onChange={p('speedUnit')} choices={[{ value: 'kmh', label: 'km/h' }, { value: 'mph', label: 'mph' }]} />
        <Segmented label="Temperature" value={prefs.tempUnit} onChange={p('tempUnit')} choices={[{ value: 'C', label: '°C' }, { value: 'F', label: '°F' }]} />
        <Segmented label="Drivers outside your focus" value={prefs.filterMode} onChange={p('filterMode')} choices={[{ value: 'dim', label: 'Dim them' }, { value: 'hide', label: 'Hide them' }]} />
        <Segmented label="Density" value={prefs.density} onChange={p('density')} choices={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
        <label className="field field-toggle">
          <span>Chart legends</span>
          <input type="checkbox" className="switch" checked={prefs.showLegends} onChange={(e) => set({ showLegends: e.target.checked })} />
        </label>
        <label className="field field-toggle">
          <span>
            Chart animation
            <small>Turned off automatically if your system asks for reduced motion.</small>
          </span>
          <input type="checkbox" className="switch" checked={prefs.animate} onChange={(e) => set({ animate: e.target.checked })} />
        </label>

        <fieldset className="fieldset">
          <legend>Data</legend>
          <p className="settings-desc">
            Finished sessions are cached in your browser so they load instantly and don’t count against OpenF1’s rate limit. Everything you set up is saved in this browser only.
          </p>
          <p className="settings-desc">
            Live timing (2023 onward) comes from OpenF1; anything older, and gaps such as starting grids, come from <a href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noreferrer">Jolpica F1</a>, which allows 500 requests an hour. Past seasons are cached permanently.{' '}
            <strong>{budgetRemaining()}</strong> requests left this hour.
          </p>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await clearCache()
              qc.clear()
              setCleared(true)
            }}
          >
            {cleared ? 'Cache cleared' : 'Clear cached data'}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (confirm('Replace all dashboards with the starter dashboards? Your own layouts will be lost.')) reset()
            }}
          >
            Restore starter dashboards
          </button>
        </fieldset>
        <p className="settings-desc">
          Data from <a href="https://openf1.org" target="_blank" rel="noreferrer">OpenF1</a> and <a href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noreferrer">Jolpica F1</a>. This project is unofficial and not associated with Formula 1.
        </p>
      </div>
    </Drawer>
  )
}
