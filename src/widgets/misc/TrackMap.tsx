import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useCarDataMany, useLaps, useLocation } from '../../api/hooks'
import type { CarData, Lap } from '../../api/types'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, Legend, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { fastestLap, groupBy, lapWindow, withDistance, type TelemetryPoint } from '../../lib/derive'
import { lapTime, speedValue } from '../../lib/format'
import { mix, useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'

const MINISECTORS = 25

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
  value: number
  label: string
  sector: number
}

function nearest(samples: CarData[], t: number) {
  let lo = 0
  let hi = samples.length - 1
  if (hi < 0) return undefined
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (Date.parse(samples[mid].date) <= t) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  return Math.abs(Date.parse(a.date) - t) <= Math.abs(Date.parse(b.date) - t) ? a : b
}

function timeAtFrac(pts: TelemetryPoint[], f: number) {
  const total = pts[pts.length - 1]?.dist ?? 0
  const d = f * total
  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].dist <= d) lo = mid
    else hi = mid
  }
  const a = pts[lo]
  const b = pts[hi]
  if (!a || !b) return 0
  if (b.dist === a.dist) return a.t
  return a.t + ((d - a.dist) / (b.dist - a.dist)) * (b.t - a.t)
}

function TrackMap({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const prefs = useStore((s) => s.prefs)
  const laps = useLaps(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const mode = String(opts.color)
  const dominance = mode === 'dominance'

  // Track shape comes from one driver. Dominance compares every driver in focus
  // (two or more), else this panel's two driver options / the two fastest.
  const ranked = useMemo(
    () =>
      [...groupBy(laps.data, (l) => l.driver_number).keys()]
        .map((n) => ({ n, lap: fastestLap(laps.data, n) }))
        .filter((x) => x.lap)
        .sort((a, b) => a.lap!.lap_duration! - b.lap!.lap_duration!)
        .map((x) => x.n),
    [laps.data],
  )
  const contenders = useMemo(() => {
    const focused = ranked.filter((n) => filter.selected.includes(n))
    const a = (opts.driver as number | null) ?? focused[0] ?? ranked[0] ?? null
    if (!dominance) return a ? [a] : []
    if (focused.length >= 2) return a && focused.includes(a) ? [a, ...focused.filter((n) => n !== a)] : focused
    const b = (opts.driverB as number | null) ?? ranked.find((n) => n !== a) ?? null
    return [a, b].filter((n): n is number => n !== null)
  }, [ranked, filter.selected, opts.driver, opts.driverB, dominance])
  const drvA = contenders[0] ?? null

  const lapNo = Number(opts.lap) || 0
  const pick = (n: number | null): Lap | undefined =>
    n ? (lapNo ? laps.data?.find((l) => l.driver_number === n && l.lap_number === lapNo) : fastestLap(laps.data, n)) : undefined
  const picked = contenders.map((n) => ({ n, lap: pick(n) })).filter((x): x is { n: number; lap: Lap } => !!x.lap)
  const lapA = picked[0]?.n === drvA ? picked[0].lap : undefined
  const wA = lapWindow(lapA)
  const loc = useLocation(sessionKey, lapA ? drvA : null, wA?.[0], wA?.[1])
  const car = useCarDataMany(
    sessionKey,
    picked.map((p) => {
      const w = lapWindow(p.lap)
      return { driver: p.n, from: w?.[0], to: w?.[1] }
    }),
  )
  const carA = car[0] ?? { data: undefined }
  const carKey = car.map((q) => q.dataUpdatedAt).join(',')

  const dA = drvA ? map.get(drvA) : undefined
  const code = (n: number) => map.get(n)?.name_acronym ?? `#${n}`
  // One colour per contender; a teammate's shared colour is lightened so it stays distinct.
  const contenderColors = useMemo(() => {
    const used: string[] = []
    return picked.map((p, i) => {
      let c = map.get(p.n)?.color ?? [t.divNeg, t.divPos][i % 2]
      if (used.includes(c)) c = mix(c, t.panel, 0.55)
      used.push(c)
      return c
    })
  }, [picked.map((p) => p.n).join(','), map, t])

  const { option, rows, legend } = useMemo(() => {
    const raw = (loc.data ?? []).filter((p) => p.x !== 0 || p.y !== 0).sort((a, b) => a.date.localeCompare(b.date))
    const carRows = [...(carA.data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
    const ptsA = withDistance(carA.data)
    const allPts = car.map((q) => withDistance(q.data))
    const totalA = ptsA[ptsA.length - 1]?.dist ?? 0
    const t0 = carRows.length ? Date.parse(carRows[0].date) : 0

    // Rotate around the centroid.
    const rot = ((Number(opts.rotation) || 0) * Math.PI) / 180
    const cx = raw.reduce((a, p) => a + p.x, 0) / (raw.length || 1)
    const cy = raw.reduce((a, p) => a + p.y, 0) / (raw.length || 1)
    const pts = raw.map((p) => {
      const dx = p.x - cx
      const dy = p.y - cy
      return { x: dx * Math.cos(rot) - dy * Math.sin(rot), y: dx * Math.sin(rot) + dy * Math.cos(rot), t: Date.parse(p.date) }
    })

    // Minisector winners for dominance.
    // Minisector time per contender; the fastest wins the sector.
    const winners: { k: number; times: (number | null)[]; best: number; margin: number }[] = []
    const ready = allPts.filter((p) => p.length).length
    if (dominance && ready >= 2) {
      for (let k = 0; k < MINISECTORS; k++) {
        const f0 = k / MINISECTORS
        const f1 = (k + 1) / MINISECTORS
        const times = allPts.map((p) => (p.length ? timeAtFrac(p, f1) - timeAtFrac(p, f0) : null))
        const order = times.map((v, i) => ({ v, i })).filter((x) => x.v !== null).sort((x, y) => x.v! - y.v!)
        winners.push({ k, times, best: order[0].i, margin: order.length > 1 ? order[1].v! - order[0].v! : 0 })
      }
    }

    const seq = (f: number) => mix(t.seqLow, t.seqHigh, Math.max(0, Math.min(1, f)))
    const speeds = carRows.map((c) => c.speed)
    const sMin = Math.min(...speeds)
    const sMax = Math.max(...speeds)
    const segs: Seg[] = []
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]
      const q = pts[i]
      const c = nearest(carRows, (p.t + q.t) / 2)
      const ta = c ? (Date.parse(c.date) - t0) / 1000 : 0
      const pa = ptsA.find((x) => x.t >= ta) ?? ptsA[ptsA.length - 1]
      const frac = totalA ? (pa?.dist ?? 0) / totalA : 0
      const sector = Math.min(MINISECTORS - 1, Math.floor(frac * MINISECTORS))
      let color = t.axis
      let value = 0
      let label = ''
      if (c) {
        if (mode === 'speed') {
          value = speedValue(c.speed, prefs)
          color = seq((c.speed - sMin) / (sMax - sMin || 1))
          label = `${Math.round(value)} ${prefs.speedUnit === 'mph' ? 'mph' : 'km/h'}`
        } else if (mode === 'gear') {
          value = c.n_gear
          color = seq((c.n_gear - 1) / 7)
          label = `Gear ${c.n_gear}`
        } else if (mode === 'throttle') {
          value = c.throttle
          color = seq(c.throttle / 100)
          label = `${Math.round(c.throttle)}% throttle`
        } else if (mode === 'brake') {
          value = c.brake > 0 ? 1 : 0
          color = value ? t.divPos : t.axis
          label = value ? 'Braking' : 'Off brake'
        } else if (dominance) {
          const w = winners[sector]
          if (w) {
            color = contenderColors[w.best]
            value = w.margin
            label = `${code(picked[w.best].n)} fastest, by ${value.toFixed(3)} s`
          }
        }
      }
      segs.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y, color, value, label, sector })
    }

    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const option: EChartsOption = {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const s: Seg = segs[p.dataIndex]
          return s ? tipTitle(`Minisector ${s.sector + 1}`) + tipRow(s.color, s.label, '') : ''
        },
      },
      series: [
        {
          type: 'custom',
          coordinateSystem: 'none',
          data: segs.map((_, i) => i),
          renderItem: (params: any, api: any) => {
            const s = segs[params.dataIndex]
            const W = api.getWidth()
            const H = api.getHeight()
            const pad = 16
            const scale = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1))
            const ox = (W - (maxX - minX) * scale) / 2
            const oy = (H - (maxY - minY) * scale) / 2
            const px = (x: number) => ox + (x - minX) * scale
            const py = (y: number) => H - (oy + (y - minY) * scale)
            return {
              type: 'line',
              shape: { x1: px(s.x1), y1: py(s.y1), x2: px(s.x2), y2: py(s.y2) },
              style: { stroke: s.color, lineWidth: Number(opts.width) || 5, lineCap: 'round' },
              emphasis: { style: { lineWidth: (Number(opts.width) || 5) + 3 } },
            }
          },
        } as any,
      ],
    }

    let legend: { color: string; label: string; rect?: boolean }[] = []
    if (dominance) legend = picked.map((p, i) => ({ color: contenderColors[i], label: code(p.n), rect: true }))
    else if (mode === 'brake') legend = [{ color: t.divPos, label: 'Braking', rect: true }, { color: t.axis, label: 'Off brake', rect: true }]
    else if (mode === 'speed')
      legend = [
        { color: seq(0), label: `${Math.round(speedValue(sMin, prefs))}`, rect: true },
        { color: seq(0.5), label: 'Speed', rect: true },
        { color: seq(1), label: `${Math.round(speedValue(sMax, prefs))} ${prefs.speedUnit === 'mph' ? 'mph' : 'km/h'}`, rect: true },
      ]
    else if (mode === 'gear') legend = [1, 3, 5, 8].map((g) => ({ color: seq((g - 1) / 7), label: `Gear ${g}`, rect: true }))
    else if (mode === 'throttle') legend = [0, 50, 100].map((v) => ({ color: seq(v / 100), label: `${v}%`, rect: true }))

    const rows = Array.from({ length: MINISECTORS }, (_, k) => {
      const ss = segs.filter((s) => s.sector === k)
      const w = winners[k]
      return {
        sector: k + 1,
        avg: ss.length && !dominance ? ss.reduce((a, s) => a + s.value, 0) / ss.length : null,
        ...Object.fromEntries(picked.map((_, i) => [`t${i}`, w?.times[i] ?? null])),
        faster: w ? code(picked[w.best].n) : '',
      }
    })
    return { option, rows, legend }
    // carKey tracks when any contender's data arrives
  }, [loc.data, carKey, mode, dominance, opts.rotation, opts.width, prefs, t, contenderColors, map])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  if (!lapA) return <Empty>No timed lap found for this driver and lap.</Empty>
  const g2 = gate(loc, ...car)
  if (g2) return g2
  if (!loc.data?.length) return <Empty>No position data published for this lap.</Empty>

  const columns = dominance
    ? [
        { key: 'sector', label: 'Minisector', align: 'right' as const },
        ...picked.map((p, i) => ({ key: `t${i}`, label: code(p.n), align: 'right' as const, render: (r: any) => (r[`t${i}`] != null ? r[`t${i}`].toFixed(3) : '—') })),
        { key: 'faster', label: 'Faster' },
      ]
    : [
        { key: 'sector', label: 'Minisector', align: 'right' as const },
        { key: 'avg', label: `Average ${mode}`, align: 'right' as const, render: (r: any) => (r.avg != null ? r.avg.toFixed(1) : '—') },
      ]

  return (
    <div className="mw-col">
      <div className="mw-grow">
        <Chart option={option} table={{ columns, rows }} />
      </div>
      <div className="mw-hint" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        {prefs.showLegends && <Legend items={legend} />}
        <span>
          {dominance && picked.length > 1
            ? picked.map((p) => `${code(p.n)} ${lapTime(p.lap.lap_duration)}`).join(', ')
            : `${dA?.name_acronym ?? ''} lap ${lapA.lap_number}, ${lapTime(lapA.lap_duration)}`}
        </span>
      </div>
    </div>
  )
}

export const trackMap: WidgetDef = {
  type: 'track-map',
  name: 'Track map',
  description: 'The circuit traced from car position data, coloured by speed, gear, throttle, braking, or which driver was fastest in each minisector (every driver in focus, or two of your choice).',
  category: 'Telemetry',
  minYear: 2023,
  defaultSize: { w: 8, h: 12 },
  usesDrivers: true,
  Component: TrackMap,
  options: [
    {
      key: 'color',
      label: 'Colour by',
      type: 'select',
      default: 'speed',
      choices: [
        { value: 'speed', label: 'Speed' },
        { value: 'gear', label: 'Gear' },
        { value: 'throttle', label: 'Throttle' },
        { value: 'brake', label: 'Braking' },
        { value: 'dominance', label: 'Track dominance (two drivers)' },
      ],
    },
    { key: 'driver', label: 'Driver', type: 'driver', default: null, help: 'Automatic uses the fastest lap of the session.' },
    { key: 'driverB', label: 'Compare with (dominance)', type: 'driver', default: null },
    { key: 'lap', label: 'Lap number (0 = fastest)', type: 'number', default: 0, min: 0, max: 100, step: 1 },
    { key: 'rotation', label: 'Rotation', type: 'select', default: 0, choices: [{ value: 0, label: '0°' }, { value: 90, label: '90°' }, { value: 180, label: '180°' }, { value: 270, label: '270°' }] },
    { key: 'width', label: 'Line width', type: 'number', default: 5, min: 2, max: 12, step: 1 },
  ],
}
