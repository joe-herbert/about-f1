import { useMemo } from 'react'
import { useLaps, usePositions, useResults } from '../../api/hooks'
import { DriverTag, Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { maxLap } from '../../lib/derive'
import { lapTime } from '../../lib/format'
import type { WidgetDef, WidgetProps } from '../types'
import { finishingOrder } from './common'
import './race.css'

function LapChartTable({ sessionKey, opts, filter }: WidgetProps) {
  const laps = useLaps(sessionKey)
  const results = useResults(sessionKey)
  const positions = usePositions(sessionKey)
  const { map } = useDriverMap(sessionKey)

  const { drivers, grid, nLaps } = useMemo(() => {
    const order = finishingOrder(results.data, positions.data)
    const withLaps = new Set((laps.data ?? []).map((l) => l.driver_number))
    const all = [...order.filter((n) => withLaps.has(n)), ...[...withLaps].filter((n) => !order.includes(n))]
    const drivers = filter.selected.length
      ? all.filter((n) => filter.selected.includes(n))
      : all.slice(0, Number(opts.count) || 6)
    const grid = new Map<string, { t: number | null; pit: boolean }>()
    for (const l of laps.data ?? []) grid.set(`${l.driver_number}:${l.lap_number}`, { t: l.lap_duration, pit: l.is_pit_out_lap })
    return { drivers, grid, nLaps: maxLap(laps.data) }
  }, [laps.data, results.data, positions.data, filter.selected, opts.count])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  if (!nLaps || !drivers.length) return <Empty>No lap times recorded for this session yet.</Empty>

  const lapNumbers = Array.from({ length: nLaps }, (_, i) => i + 1)
  if (opts.order === 'desc') lapNumbers.reverse()

  return (
    <div className="lapgrid">
      <table>
        <thead>
          <tr>
            <th>Lap</th>
            {drivers.map((n) => (
              <th key={n}>
                <DriverTag d={map.get(n)} n={n} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lapNumbers.map((lap) => {
            const times = drivers.map((n) => grid.get(`${n}:${lap}`))
            const best = Math.min(...times.map((c) => (c?.t && !c.pit ? c.t : Infinity)))
            return (
              <tr key={lap}>
                <td>{lap}</td>
                {times.map((c, i) => {
                  const cls = c?.pit ? 'lap-pit' : c?.t && c.t === best && drivers.length > 1 ? 'lap-best' : undefined
                  return (
                    <td key={drivers[i]} className={cls} title={c?.pit ? 'Pit out lap' : cls ? 'Fastest of this lap' : undefined}>
                      {c?.t ? lapTime(c.t) : '—'}
                      {c?.pit ? ' P' : ''}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export const lapChartTable: WidgetDef = {
  type: 'lap-chart-table',
  name: 'Lap by lap table',
  description: 'Every lap time side by side for chosen drivers. The quickest of each lap is marked in purple; P marks a pit out lap.',
  category: 'Laps',
  minYear: 1996,
  defaultSize: { w: 12, h: 12 },
  usesDrivers: true,
  Component: LapChartTable,
  options: [
    { key: 'count', label: 'Drivers to show when none are selected', type: 'number', default: 6, min: 1, max: 22, step: 1, help: 'Takes the top finishers. Select drivers in the header to choose exactly.' },
    { key: 'order', label: 'Lap order', type: 'select', default: 'asc', choices: [{ value: 'asc', label: 'First lap at top' }, { value: 'desc', label: 'Latest lap at top' }] },
  ],
}
