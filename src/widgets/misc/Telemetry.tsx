import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useCarDataMany, useLaps } from '../../api/hooks'
import type { Lap } from '../../api/types'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap, type DriverInfo } from '../../lib/drivers'
import { fastestLap, groupBy, lapWindow, withDistance, type TelemetryPoint } from '../../lib/derive'
import { lapTime, speedValue } from '../../lib/format'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'

const CHANNELS = [
  { key: 'speed', label: 'Speed' },
  { key: 'throttle', label: 'Throttle %' },
  { key: 'brake', label: 'Brake' },
  { key: 'n_gear', label: 'Gear' },
  { key: 'rpm', label: 'RPM' },
  { key: 'drs', label: 'DRS' },
  { key: 'delta', label: 'Delta' },
] as const

/** Time at a given distance by linear interpolation. */
function timeAt(pts: TelemetryPoint[], d: number) {
  let lo = 0
  let hi = pts.length - 1
  if (!pts.length || d < pts[0].dist || d > pts[hi].dist) return null
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].dist <= d) lo = mid
    else hi = mid
  }
  const a = pts[lo]
  const b = pts[hi]
  if (b.dist === a.dist) return a.t
  return a.t + ((d - a.dist) / (b.dist - a.dist)) * (b.t - a.t)
}

/** Drivers compared automatically when nobody is in focus */
const MAX_AUTO = 6

/** OpenF1 DRS codes: 10/12/14 = open, 8 = eligible */
const drsOpen = (v: number | null) => (v != null && v >= 10 ? 1 : 0)

function pickLap(laps: Lap[] | undefined, driver: number | null, lapNo: number) {
  if (!driver) return undefined
  if (lapNo > 0) return laps?.find((l) => l.driver_number === driver && l.lap_number === lapNo)
  return fastestLap(laps, driver)
}

function Telemetry({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const prefs = useStore((s) => s.prefs)
  const laps = useLaps(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const lapNo = Number(opts.lap) || 0

  // Everyone in focus is compared; with no focus, explicit slots plus the fastest drivers fill `count`.
  const drivers = useMemo(() => {
    const best = [...groupBy(laps.data, (l) => l.driver_number).keys()]
      .map((n) => ({ n, lap: fastestLap(laps.data, n) }))
      .filter((x) => x.lap)
      .sort((a, b) => a.lap!.lap_duration! - b.lap!.lap_duration!)
      .map((x) => x.n)
    const ref = typeof opts.driverA === 'number' ? opts.driverA : null
    if (filter.selected.length) {
      const focused = best.filter((n) => filter.selected.includes(n))
      // The reference (delta baseline) leads when it is one of the focused drivers.
      return ref && focused.includes(ref) ? [ref, ...focused.filter((n) => n !== ref)] : focused
    }
    const count = Math.max(1, Math.min(MAX_AUTO, Number(opts.count) || 2))
    const explicit = [opts.driverA, opts.driverB, opts.driverC].filter((d): d is number => typeof d === 'number')
    const pool = best.filter((n) => !explicit.includes(n))
    return [...explicit, ...pool].slice(0, Math.max(count, explicit.length))
  }, [opts.driverA, opts.driverB, opts.driverC, opts.count, laps.data, filter.selected])

  const picked = useMemo(
    () => drivers.map((n) => ({ n, lap: pickLap(laps.data, n, lapNo) })).filter((x): x is { n: number; lap: Lap } => !!x.lap),
    [drivers, laps.data, lapNo],
  )
  const car = useCarDataMany(
    sessionKey,
    picked.map((p) => {
      const w = lapWindow(p.lap)
      return { driver: p.n, from: w?.[0], to: w?.[1] }
    }),
  )
  const carData = car.map((q) => q.data)
  const carKey = car.map((q) => q.dataUpdatedAt).join(',')

  const traces = useMemo(() => {
    const out: { n: number; d?: DriverInfo; lap: Lap; pts: TelemetryPoint[] }[] = []
    picked.forEach((p, i) => {
      const data = carData[i]
      if (data?.length) out.push({ n: p.n, d: map.get(p.n), lap: p.lap, pts: withDistance(data) })
    })
    return out
    // carKey tracks when any driver's data arrives
  }, [picked, carKey, map])

  const { option, rows } = useMemo(() => {
    const channels = CHANNELS.filter((c) => opts[c.key] && (c.key !== 'delta' || traces.length > 1))
    const n = channels.length || 1
    // Lay grids out in percentages; speed gets double height since it's read most.
    const topPct = prefs.showLegends ? 9 : 3
    const bottomPct = 9
    const gapPct = 3
    const weights = channels.map((c) => (c.key === 'speed' ? 2 : 1))
    const totalW = weights.reduce((a, b) => a + b, 0) || 1
    const usable = 100 - topPct - bottomPct - gapPct * (n - 1)
    let cursor = topPct
    const grids = weights.map((w) => {
      const h = (usable * w) / totalW
      const g = { left: 52, right: 16, top: `${cursor.toFixed(2)}%`, height: `${h.toFixed(2)}%` }
      cursor += h + gapPct
      return g
    })
    const maxDist = Math.max(0, ...traces.map((tr) => tr.pts[tr.pts.length - 1]?.dist ?? 0))
    const series: any[] = []
    const ref = traces[0]
    channels.forEach((c, gi) => {
      traces.forEach((tr, ti) => {
        if (c.key === 'delta' && ti === 0) return
        const color = tr.d?.color ?? '#888888'
        let data: (number | null)[][]
        if (c.key === 'delta') {
          data = tr.pts.filter((_, i) => i % 2 === 0).map((p) => {
            const ta = timeAt(ref.pts, p.dist)
            return [p.dist, ta == null ? null : +(p.t - ta).toFixed(3)]
          })
        } else
          data = tr.pts.map((p) => {
            const v =
              c.key === 'speed' ? speedValue(p.speed, prefs) : c.key === 'drs' ? drsOpen(p.drs) : c.key === 'brake' ? (p.brake > 0 ? 100 : 0) : (p as any)[c.key]
            return [p.dist, v]
          })
        series.push({
          type: 'line',
          name: tr.d?.name_acronym ?? `#${tr.n}`,
          xAxisIndex: gi,
          yAxisIndex: gi,
          data,
          step: c.key === 'n_gear' || c.key === 'drs' || c.key === 'brake' ? 'end' : undefined,
          lineStyle: { color, width: c.key === 'speed' ? 2 : 1.5, type: tr.d?.secondary ? [6, 3] : 'solid' },
          itemStyle: { color },
          showSymbol: false,
          connectNulls: false,
          sampling: 'lttb',
        })
      })
    })
    const option: EChartsOption = {
      legend: prefs.showLegends ? { top: 0, data: traces.map((tr) => tr.d?.name_acronym ?? `#${tr.n}`) } : undefined,
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: any) => {
          const arr = Array.isArray(ps) ? ps : [ps]
          if (!arr.length) return ''
          const dist = arr[0].value?.[0]
          let html = tipTitle(`${Math.round(dist)} m`)
          for (const c of channels) {
            const items = arr.filter((p: any) => series[p.seriesIndex]?.xAxisIndex === channels.indexOf(c))
            if (!items.length) continue
            html += `<div style="opacity:.6;margin-top:4px">${c.key === 'speed' ? `Speed (${prefs.speedUnit === 'mph' ? 'mph' : 'km/h'})` : c.label}</div>`
            html += items
              .map((p: any) => {
                const v = p.value?.[1]
                const s = v == null ? '—' : c.key === 'delta' ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)} s` : c.key === 'drs' ? (v ? 'Open' : 'Closed') : c.key === 'brake' ? (v ? 'On' : 'Off') : String(Math.round(v))
                return tipRow(p.color, s, p.seriesName, traces.find((tr) => (tr.d?.name_acronym ?? `#${tr.n}`) === p.seriesName)?.d?.secondary)
              })
              .join('')
          }
          return html
        },
      },
      grid: grids,
      xAxis: channels.map((_, i) => ({
        type: 'value' as const,
        gridIndex: i,
        min: 0,
        max: Math.ceil(maxDist),
        axisLabel: { show: i === channels.length - 1, formatter: (v: number) => `${(v / 1000).toFixed(1)} km` },
        splitLine: { show: false },
        axisLine: { show: i === channels.length - 1 },
      })),
      yAxis: channels.map((c, i) => ({
        type: 'value' as const,
        gridIndex: i,
        name: c.key === 'speed' ? (prefs.speedUnit === 'mph' ? 'mph' : 'km/h') : c.label,
        nameLocation: 'end' as const,
        nameGap: 4,
        nameTextStyle: { align: 'left' as const, padding: [0, 0, 0, -44] },
        scale: c.key === 'speed' || c.key === 'rpm' || c.key === 'delta',
        min: c.key === 'throttle' || c.key === 'brake' ? 0 : c.key === 'drs' ? 0 : undefined,
        max: c.key === 'throttle' || c.key === 'brake' ? 100 : c.key === 'drs' ? 1 : undefined,
        splitNumber: c.key === 'speed' ? 4 : 2,
        axisLabel: { formatter: (v: number) => (c.key === 'rpm' ? `${Math.round(v / 1000)}k` : c.key === 'delta' ? v.toFixed(1) : String(v)) },
      })),
      dataZoom: [{ type: 'inside', xAxisIndex: channels.map((_, i) => i) }],
      series,
    }
    const rows = traces.map((tr) => ({
      driver: tr.d?.name_acronym ?? `#${tr.n}`,
      lap: tr.lap.lap_number,
      time: tr.lap.lap_duration,
      top: Math.max(...tr.pts.map((p) => p.speed)),
      avgThrottle: tr.pts.reduce((a, p) => a + p.throttle, 0) / tr.pts.length,
      fullThrottle: (tr.pts.filter((p) => p.throttle >= 98).length / tr.pts.length) * 100,
      braking: (tr.pts.filter((p) => p.brake > 0).length / tr.pts.length) * 100,
    }))
    return { option, rows }
  }, [traces, opts, prefs, t])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  if (!picked.length) return <Empty>No timed lap found for these drivers on that lap.</Empty>
  // Draw as soon as any driver's trace is in; the rest join as they load.
  if (!traces.length) {
    const g2 = gate(...car)
    if (g2) return g2
    return <Empty>No car telemetry published for this lap.</Empty>
  }
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'driver', label: 'Driver' },
          { key: 'lap', label: 'Lap', align: 'right' },
          { key: 'time', label: 'Lap time', align: 'right', render: (r: any) => lapTime(r.time) },
          { key: 'top', label: 'Top speed', align: 'right', render: (r: any) => Math.round(speedValue(r.top, prefs)) },
          { key: 'fullThrottle', label: 'Full throttle %', align: 'right', render: (r: any) => r.fullThrottle.toFixed(0) },
          { key: 'braking', label: 'Braking %', align: 'right', render: (r: any) => r.braking.toFixed(0) },
        ],
        rows,
      }}
    />
  )
}

export const telemetry: WidgetDef = {
  type: 'telemetry',
  name: 'Telemetry trace',
  description: 'Speed, throttle, brake, gear, RPM and DRS against lap distance for every driver in focus (or the fastest few), plus a running time delta to the reference driver.',
  category: 'Telemetry',
  minYear: 2023,
  defaultSize: { w: 14, h: 14 },
  usesDrivers: true,
  Component: Telemetry,
  options: [
    {
      key: 'count',
      label: 'Drivers to compare when nobody is in focus',
      type: 'select',
      default: 2,
      choices: [1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: String(v) })),
      help: 'With drivers in focus (header or this panel’s own list), all of them are shown.',
    },
    { key: 'driverA', label: 'Reference driver', type: 'driver', default: null, help: 'Baseline for the time delta. Automatic uses the fastest.' },
    { key: 'driverB', label: 'Also include', type: 'driver', default: null },
    { key: 'driverC', label: 'Also include', type: 'driver', default: null },
    { key: 'lap', label: 'Lap number (0 = each driver’s fastest)', type: 'number', default: 0, min: 0, max: 100, step: 1 },
    { key: 'speed', label: 'Speed', type: 'toggle', default: true },
    { key: 'throttle', label: 'Throttle', type: 'toggle', default: true },
    { key: 'brake', label: 'Brake', type: 'toggle', default: true },
    { key: 'n_gear', label: 'Gear', type: 'toggle', default: true },
    { key: 'rpm', label: 'RPM', type: 'toggle', default: false },
    { key: 'drs', label: 'DRS', type: 'toggle', default: false },
    { key: 'delta', label: 'Time delta to the reference driver', type: 'toggle', default: true },
  ],
}
