import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useResults } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { DriverTag, Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { groupBy } from '../../lib/derive'
import { lapTime, speed } from '../../lib/format'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { sortResults } from './shared'
import { useDriverStats, type DriverStats } from './useDriverStats'
import './results.css'

interface Metric {
  label: string
  get: (s: DriverStats) => number | null
  fmt: (v: number) => string
  lowerBetter: boolean
  /** Difference that maps to an empty bar */
  scale: (a: number, b: number) => number
}

function H2H({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const prefs = useStore((s) => s.prefs)
  const { map } = useDriverMap(sessionKey)
  const results = useResults(sessionKey)
  const { stats, laps, queries } = useDriverStats(sessionKey)

  const [a, b] = useMemo(() => {
    const order = sortResults(results.data).map((r) => r.driver_number)
    const pool = order.length ? order : [...map.keys()]
    const auto = filter.selected.length >= 2 ? filter.selected : pool
    const A = typeof opts.driverA === 'number' ? opts.driverA : auto[0]
    const B = typeof opts.driverB === 'number' ? opts.driverB : auto.find((x) => x !== A)
    return [A ?? null, B ?? null]
  }, [opts.driverA, opts.driverB, results.data, map, filter.selected])

  const metrics: Metric[] = useMemo(() => {
    const lap = (pct: number) => (x: number, y: number) => Math.min(x, y) * pct
    const count = (x: number, y: number) => Math.max(x, y, 1)
    return [
      { label: 'Finish', get: (s) => s.finish, fmt: (v) => `P${v}`, lowerBetter: true, scale: () => 20 },
      { label: 'Places gained', get: (s) => s.gained, fmt: (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0'), lowerBetter: false, scale: () => 20 },
      { label: 'Best lap', get: (s) => s.bestLap, fmt: (v) => lapTime(v), lowerBetter: true, scale: lap(0.02) },
      { label: 'Average lap', get: (s) => s.avgLap, fmt: (v) => lapTime(v), lowerBetter: true, scale: lap(0.02) },
      { label: 'Best sector 1', get: (s) => s.bestS1, fmt: (v) => v.toFixed(3), lowerBetter: true, scale: lap(0.04) },
      { label: 'Best sector 2', get: (s) => s.bestS2, fmt: (v) => v.toFixed(3), lowerBetter: true, scale: lap(0.04) },
      { label: 'Best sector 3', get: (s) => s.bestS3, fmt: (v) => v.toFixed(3), lowerBetter: true, scale: lap(0.04) },
      { label: 'Top speed', get: (s) => s.topSpeed, fmt: (v) => speed(v, prefs), lowerBetter: false, scale: (x, y) => Math.max(x, y) * 0.05 },
      { label: 'Consistency (σ)', get: (s) => s.consistency, fmt: (v) => `${v.toFixed(2)}s`, lowerBetter: true, scale: (x, y) => Math.max(x, y) },
      { label: 'Pit stops', get: (s) => s.pitStops, fmt: (v) => String(v), lowerBetter: true, scale: count },
      { label: 'Overtakes', get: (s) => s.overtakes, fmt: (v) => String(v), lowerBetter: false, scale: count },
      { label: 'Laps led', get: (s) => s.lapsLed, fmt: (v) => String(v), lowerBetter: false, scale: count },
    ]
  }, [prefs])

  const delta = useMemo(() => {
    if (!a || !b) return []
    const by = groupBy(laps, (l) => l.driver_number)
    const la = new Map((by.get(a) ?? []).map((l) => [l.lap_number, l.lap_duration]))
    const lb = new Map((by.get(b) ?? []).map((l) => [l.lap_number, l.lap_duration]))
    const nums = [...la.keys()].filter((n) => la.get(n) && lb.get(n)).sort((x, y) => x - y)
    let cum = 0
    return nums.map((n) => {
      cum += la.get(n)! - lb.get(n)!
      return [n, Math.round(cum * 1000) / 1000] as [number, number]
    })
  }, [laps, a, b])

  const da = a ? map.get(a) : undefined
  const db = b ? map.get(b) : undefined
  const ca = da?.color ?? t.divNeg
  const cb = db?.color && db.color !== ca ? db.color : t.divPos

  const option = useMemo<EChartsOption>(() => {
    const nameA = da?.name_acronym ?? `#${a}`
    const nameB = db?.name_acronym ?? `#${b}`
    return {
      grid: { left: 44, right: 12, top: 18, bottom: 22 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: any) => {
          const p = (Array.isArray(ps) ? ps : [ps])[0]
          const v = p.value[1]
          return tipTitle(`Lap ${p.value[0]}`) + tipRow(v > 0 ? cb : ca, `${Math.abs(v).toFixed(3)}s`, `${v > 0 ? nameB : nameA} ahead`)
        },
      },
      xAxis: { type: 'value', min: 'dataMin', max: 'dataMax', minInterval: 1, name: 'Lap', nameLocation: 'end', nameGap: 4 },
      yAxis: { type: 'value', name: `${nameB} ahead ↑  ${nameA} ahead ↓`, nameTextStyle: { align: 'left' }, axisLabel: { formatter: (v: number) => `${Math.abs(v)}` } },
      series: [{ type: 'line', data: delta, showSymbol: false, lineStyle: { width: 2, color: t.ink2 }, itemStyle: { color: t.ink2 }, areaStyle: { color: t.ink2, opacity: 0.08 } }],
    }
  }, [delta, da, db, a, b, ca, cb, t])

  if (!sessionKey) return <NeedSession />
  const g = gate(results, ...queries)
  if (g) return g
  if (!a || !b) return <Empty>Pick two drivers in this panel’s settings.</Empty>
  const sa = stats.get(a)
  const sb = stats.get(b)

  return (
    <div className="h2h-root">
      <div className="h2h-names">
        <span>
          <DriverTag d={da} n={a} /> <span className="minor-text">{da?.last_name}</span>
        </span>
        <span className="h2h-vs">vs</span>
        <span className="right">
          <span className="minor-text">{db?.last_name}</span> <DriverTag d={db} n={b} />
        </span>
      </div>
      <div className="h2h-rows">
        {metrics.map((m) => {
          const va = sa ? m.get(sa) : null
          const vb = sb ? m.get(sb) : null
          if (va === null && vb === null) return null
          let wa = 0
          let wb = 0
          let winA = false
          let winB = false
          if (va !== null && vb !== null) {
            const diff = Math.abs(va - vb)
            const sc = m.scale(va, vb) || 1
            const loser = Math.max(0.12, 1 - diff / sc)
            winA = m.lowerBetter ? va < vb : va > vb
            winB = m.lowerBetter ? vb < va : vb > va
            wa = winA || va === vb ? 1 : loser
            wb = winB || va === vb ? 1 : loser
          } else {
            wa = va !== null ? 1 : 0
            wb = vb !== null ? 1 : 0
          }
          return (
            <div className="h2h-row" key={m.label}>
              <div className="h2h-side left">
                <span className={`h2h-val ${winA ? 'win' : ''}`}>{va === null ? '—' : m.fmt(va)}</span>
                <span className="h2h-bar">
                  <span style={{ width: `${wa * 100}%`, background: ca, opacity: winA ? 1 : 0.45 }} />
                </span>
              </div>
              <div className="h2h-metric">{m.label}</div>
              <div className="h2h-side right">
                <span className="h2h-bar">
                  <span
                    style={{
                      width: `${wb * 100}%`,
                      background: db?.secondary && db.team_name === da?.team_name ? 'transparent' : cb,
                      boxShadow: `inset 0 0 0 1.5px ${cb}`,
                      opacity: winB ? 1 : 0.45,
                    }}
                  />
                </span>
                <span className={`h2h-val ${winB ? 'win' : ''}`}>{vb === null ? '—' : m.fmt(vb)}</span>
              </div>
            </div>
          )
        })}
      </div>
      {opts.showChart && delta.length > 1 && (
        <div className="h2h-chart">
          <Chart
            option={option}
            table={{
              columns: [
                { key: 'lap', label: 'Lap', align: 'right' },
                { key: 'gap', label: `Gap (+ = ${db?.name_acronym ?? b} ahead)`, align: 'right' },
              ],
              rows: delta.map(([lap, gap]) => ({ lap, gap })),
            }}
          />
        </div>
      )}
    </div>
  )
}

export const headToHead: WidgetDef = {
  type: 'head-to-head',
  name: 'Head to head',
  description: 'Two drivers side by side across a dozen measures, plus the gap between them lap by lap.',
  category: 'Results',
  defaultSize: { w: 8, h: 15 },
  Component: H2H,
  options: [
    { key: 'driverA', label: 'Driver A', type: 'driver', default: null, help: 'Automatic uses the header filter, else the session winner.' },
    { key: 'driverB', label: 'Driver B', type: 'driver', default: null, help: 'Automatic uses the header filter, else second place.' },
    { key: 'showChart', label: 'Show lap-by-lap gap chart', type: 'toggle', default: true },
  ],
}
