import { useMemo } from 'react'
import { useResults } from '../../api/hooks'
import { Empty, gate, NeedSession, TeamBar } from '../../components/ui'
import { byChampionship, standingOf, useChampionshipOrder } from '../../lib/championshipOrder'
import { useDriverMap } from '../../lib/drivers'
import { lapTime, ordinal, speed } from '../../lib/format'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { sortResults } from './shared'
import { useDriverStats } from './useDriverStats'
import './results.css'

function DriverCard({ sessionKey, session, opts, filter }: WidgetProps) {
  const prefs = useStore((s) => s.prefs)
  const { map, isLoading } = useDriverMap(sessionKey)
  const results = useResults(sessionKey)
  const { stats, queries } = useDriverStats(sessionKey)
  const standings = useChampionshipOrder(sessionKey)
  const rank = Number(opts.rank) || 0

  const n = useMemo(() => {
    // Championship mode: the Nth driver in this session by championship order (as in the Focus bar).
    if (rank > 0) return [...map.values()].sort(byChampionship(standings))[rank - 1]?.driver_number ?? null
    if (typeof opts.driver === 'number') return opts.driver
    if (filter.selected.length) return filter.selected[0]
    return sortResults(results.data)[0]?.driver_number ?? [...map.keys()][0] ?? null
  }, [rank, standings, opts.driver, filter.selected, results.data, map])

  if (!sessionKey) return <NeedSession />
  const g = gate(results, ...queries)
  if (g) return g
  if (rank > 0 && !n && !isLoading) return <Empty>Only {map.size} drivers took part in this session, so there’s no {ordinal(rank)} card to show.</Empty>
  if (!n || (!map.get(n) && !isLoading)) return <Empty>Pick a driver in this panel’s settings.</Empty>
  const d = map.get(n)
  const s = stats.get(n)
  const champ = standingOf(standings, d)
  // Figures a season didn't record show a dash rather than zero.
  const year = session?.year ?? 9999
  const count = (v: number | undefined, from: number) => (year < from ? '—' : String(v ?? 0))
  const items: [string, string][] = [
    ['Championship', champ ? `${ordinal(champ.pos)}, ${champ.pts} pts` : '—'],
    ['Result', s?.finish ? ordinal(s.finish) : s?.status ?? '—'],
    ['Grid', s?.grid ? ordinal(s.grid) : '—'],
    ['Places gained', s?.gained === null || s?.gained === undefined ? '—' : s.gained > 0 ? `+${s.gained}` : s.gained < 0 ? `−${-s.gained}` : '0'],
    ['Best lap', lapTime(s?.bestLap)],
    ['Average clean lap', lapTime(s?.avgLap)],
    ['Top speed', speed(s?.topSpeed, prefs)],
    ['Pit stops', count(s?.pitStops, 2011)],
    ['Overtakes made', count(s?.overtakes, 2023)],
    ['Laps led', count(s?.lapsLed, 1996)],
    ['Laps completed', String(s?.laps ?? 0)],
  ]
  return (
    <div className="dc-root">
      <div className="dc-head">
        {opts.showPhoto && d?.headshot_url && <img className="dc-photo" src={d.headshot_url} alt={d.full_name} />}
        <div style={{ minWidth: 0 }}>
          <div className="dc-num" style={{ color: d?.color }} aria-label={`Car ${n}`}>
            {n}
          </div>
          <div className="dc-name">{d ? `${d.first_name} ${d.last_name}` : `#${n}`}</div>
          <div className="dc-team">
            <TeamBar color={d?.color ?? '#888'} />
            {d?.team_name ?? '—'}
          </div>
        </div>
      </div>
      <div className="dc-stats">
        {items.map(([k, v]) => (
          <div key={k}>
            <div className="dc-stat-label">{k}</div>
            <div className="dc-stat-value">{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const driverCard: WidgetDef = {
  type: 'driver-card',
  name: 'Driver card',
  description: 'One driver’s session at a glance: championship standing, result, grid, best and average lap, top speed, stops, overtakes, laps led. Can follow a championship position instead of a fixed driver.',
  category: 'Results',
  defaultSize: { w: 6, h: 10 },
  // The card's own header names the driver, so the panel needs no title bar.
  bare: true,
  Component: DriverCard,
  options: [
    {
      key: 'rank',
      label: 'Show the Nth driver in championship order',
      type: 'number',
      default: 0,
      min: 0,
      max: 40,
      help: 'Counts the drivers in the selected session in championship order (as in the Focus bar), so a card never goes empty when someone sits a race out. 0 uses the driver below instead.',
    },
    { key: 'driver', label: 'Driver', type: 'driver', default: null, help: 'Automatic picks the first driver in the header filter, else the session winner.' },
    { key: 'showPhoto', label: 'Show headshot', type: 'toggle', default: true },
  ],
}
