import { useMemo } from 'react'
import { useResults } from '../api/hooks'
import { useDriverMap, type DriverInfo } from '../lib/drivers'
import { byChampionship, useChampionshipOrder } from '../lib/championshipOrder'
import { useGlobalSession } from '../lib/session'
import { useStore } from '../store'

export function DriverChips({
  drivers,
  selected,
  onToggle,
}: {
  drivers: DriverInfo[]
  selected: number[]
  onToggle: (n: number) => void
}) {
  const none = selected.length === 0
  return (
    <div className="chips" role="group" aria-label="Drivers">
      {drivers.map((d) => {
        const on = selected.includes(d.driver_number)
        return (
          <button
            key={d.driver_number}
            type="button"
            className={`chip${on ? ' on' : ''}${!none && !on ? ' off' : ''}`}
            aria-pressed={on}
            title={`${d.full_name}, ${d.team_name ?? ''}`}
            onClick={() => onToggle(d.driver_number)}
            style={{ ['--chip' as string]: d.color }}
          >
            <span className="chip-swatch" data-secondary={d.secondary || undefined} />
            {d.name_acronym}
          </button>
        )
      })}
    </div>
  )
}

/** The header-level driver focus that every panel follows unless it has its own. */
export function DriverFilterBar() {
  const { sessionKey } = useGlobalSession()
  const { map } = useDriverMap(sessionKey)
  const results = useResults(sessionKey)
  const selected = useStore((s) => s.drivers)
  const setDrivers = useStore((s) => s.setDrivers)
  const toggle = useStore((s) => s.toggleDriver)
  const mode = useStore((s) => s.prefs.filterMode)
  const setPrefs = useStore((s) => s.setPrefs)

  // Chips follow the drivers' championship as it stood at the selected session.
  const standings = useChampionshipOrder(sessionKey)
  const order = useMemo(() => {
    const cmp = byChampionship(standings)
    return [...map.values()].sort(cmp)
  }, [map, standings])

  const topN = (n: number) => {
    const top = [...(results.data ?? [])]
      .filter((r) => r.position)
      .sort((a, b) => a.position! - b.position!)
      .slice(0, n)
      .map((r) => r.driver_number)
    if (top.length) setDrivers(top)
  }

  if (!map.size) return null

  return (
    <div className="filter-bar">
      <span className="filter-label">Focus</span>
      <DriverChips drivers={order} selected={selected} onToggle={toggle} />
      <div className="filter-actions">
        <button type="button" className="link-btn" onClick={() => topN(3)} disabled={!results.data?.length}>
          Top 3
        </button>
        <button type="button" className="link-btn" onClick={() => topN(10)} disabled={!results.data?.length}>
          Top 10
        </button>
        <button type="button" className="link-btn" onClick={() => setDrivers([])} disabled={!selected.length}>
          Everyone
        </button>
        <div className="segmented" role="radiogroup" aria-label="Unfocused drivers">
          <button type="button" role="radio" aria-checked={mode === 'dim'} className={mode === 'dim' ? 'on' : ''} onClick={() => setPrefs({ filterMode: 'dim' })}>
            Dim others
          </button>
          <button type="button" role="radio" aria-checked={mode === 'hide'} className={mode === 'hide' ? 'on' : ''} onClick={() => setPrefs({ filterMode: 'hide' })}>
            Hide others
          </button>
        </div>
      </div>
    </div>
  )
}
