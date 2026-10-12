import type { CarData, Interval, Lap, Position, Session } from '../api/types'

export const isRace = (s?: Session) => s?.session_type === 'Race'
export const isQuali = (s?: Session) => s?.session_type === 'Qualifying'

export function groupBy<T, K>(items: T[] | undefined, key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const it of items ?? []) {
    const k = key(it)
    const arr = m.get(k)
    if (arr) arr.push(it)
    else m.set(k, [it])
  }
  return m
}

/* ---------- stats ---------- */

export function median(xs: number[]) {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
export function stdev(xs: number[]) {
  if (xs.length < 2) return NaN
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}
export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}
export function linreg(points: [number, number][]) {
  const n = points.length
  if (n < 2) return null
  const mx = mean(points.map((p) => p[0]))
  const my = mean(points.map((p) => p[1]))
  let num = 0
  let den = 0
  for (const [x, y] of points) {
    num += (x - mx) * (y - my)
    den += (x - mx) ** 2
  }
  if (!den) return null
  const slope = num / den
  return { slope, intercept: my - slope * mx }
}

/* ---------- laps ---------- */

export interface LapFilter {
  excludePitOut?: boolean
  excludeLap1?: boolean
  /** Drop laps slower than median * (1 + pct/100). 0 disables. */
  outlierPct?: number
  /** Laps that include a pit entry (the lap before a pit-out lap). */
  excludeInLaps?: boolean
}

export function cleanLaps(laps: Lap[] | undefined, f: LapFilter = {}): Lap[] {
  if (!laps) return []
  let out = laps.filter((l) => l.lap_duration && l.lap_duration > 0)
  if (f.excludeLap1) out = out.filter((l) => l.lap_number > 1)
  if (f.excludePitOut) out = out.filter((l) => !l.is_pit_out_lap)
  if (f.excludeInLaps) {
    const inLaps = new Set(laps.filter((l) => l.is_pit_out_lap).map((l) => `${l.driver_number}:${l.lap_number - 1}`))
    out = out.filter((l) => !inLaps.has(`${l.driver_number}:${l.lap_number}`))
  }
  if (f.outlierPct && f.outlierPct > 0) {
    const med = median(out.map((l) => l.lap_duration!))
    const cut = med * (1 + f.outlierPct / 100)
    out = out.filter((l) => l.lap_duration! <= cut)
  }
  return out
}

export function maxLap(laps: Lap[] | undefined) {
  return (laps ?? []).reduce((m, l) => Math.max(m, l.lap_number), 0)
}

/** End timestamp of each driver's lap n (ms), using the next lap's start or start + duration. */
export function lapEndTimes(laps: Lap[] | undefined): Map<number, Map<number, number>> {
  const out = new Map<number, Map<number, number>>()
  for (const [drv, ls] of groupBy(laps, (l) => l.driver_number)) {
    const sorted = [...ls].sort((a, b) => a.lap_number - b.lap_number)
    const m = new Map<number, number>()
    sorted.forEach((l, i) => {
      const next = sorted[i + 1]
      if (next?.date_start && next.lap_number === l.lap_number + 1) m.set(l.lap_number, Date.parse(next.date_start))
      else if (l.date_start && l.lap_duration) m.set(l.lap_number, Date.parse(l.date_start) + l.lap_duration * 1000)
    })
    out.set(drv, m)
  }
  return out
}

/** Value of a time series at time t (last sample at or before t). Series must be sorted by time. */
function sampleAt<T>(series: { t: number; v: T }[], t: number): T | null {
  let lo = 0
  let hi = series.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (series[mid].t <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans >= 0 ? series[ans].v : null
}

/** Position of each driver at the end of each lap. Index 0 = start (first known position). */
export function positionsByLap(laps: Lap[] | undefined, positions: Position[] | undefined) {
  const ends = lapEndTimes(laps)
  const out = new Map<number, (number | null)[]>()
  for (const [drv, ps] of groupBy(positions, (p) => p.driver_number)) {
    const series = ps.map((p) => ({ t: Date.parse(p.date), v: p.position })).sort((a, b) => a.t - b.t)
    const lapEnds = ends.get(drv)
    const arr: (number | null)[] = []
    // Grid position: last position published before the first lap started.
    const firstLapStart = (laps ?? []).find((l) => l.driver_number === drv && l.lap_number === 1)?.date_start
    arr[0] = firstLapStart ? sampleAt(series, Date.parse(firstLapStart)) ?? series[0]?.v ?? null : series[0]?.v ?? null
    if (lapEnds) for (const [n, t] of lapEnds) arr[n] = sampleAt(series, t + 500)
    out.set(drv, arr)
  }
  return out
}

/** Gap to leader (seconds) at the end of each lap; lapped cars are null. */
export function gapsByLap(laps: Lap[] | undefined, intervals: Interval[] | undefined, field: 'gap_to_leader' | 'interval' = 'gap_to_leader') {
  const ends = lapEndTimes(laps)
  const out = new Map<number, (number | null)[]>()
  for (const [drv, is] of groupBy(intervals, (i) => i.driver_number)) {
    const series = is
      .map((i) => ({ t: Date.parse(i.date), v: typeof i[field] === 'number' ? (i[field] as number) : null }))
      .sort((a, b) => a.t - b.t)
    const arr: (number | null)[] = []
    const lapEnds = ends.get(drv)
    if (lapEnds) for (const [n, t] of lapEnds) arr[n] = sampleAt(series, t + 1500)
    out.set(drv, arr)
  }
  return out
}

/** Final position from the last position sample per driver. */
export function latestPositions(positions: Position[] | undefined) {
  const m = new Map<number, Position>()
  for (const p of positions ?? []) {
    const prev = m.get(p.driver_number)
    if (!prev || p.date > prev.date) m.set(p.driver_number, p)
  }
  return m
}

export function latestBy<T extends { date: string; driver_number: number }>(rows: T[] | undefined) {
  const m = new Map<number, T>()
  for (const r of rows ?? []) {
    const prev = m.get(r.driver_number)
    if (!prev || r.date > prev.date) m.set(r.driver_number, r)
  }
  return m
}

/* ---------- telemetry ---------- */

export interface TelemetryPoint extends CarData {
  t: number
  /** Distance from window start, metres. */
  dist: number
}

export function withDistance(samples: CarData[] | undefined): TelemetryPoint[] {
  if (!samples?.length) return []
  const sorted = [...samples].sort((a, b) => a.date.localeCompare(b.date))
  const t0 = Date.parse(sorted[0].date)
  let dist = 0
  return sorted.map((s, i) => {
    const t = Date.parse(s.date)
    if (i > 0) {
      const prev = sorted[i - 1]
      const dt = (t - Date.parse(prev.date)) / 1000
      dist += (((prev.speed + s.speed) / 2) * dt) / 3.6
    }
    return { ...s, t: (t - t0) / 1000, dist }
  })
}

/** The window [start, end] of a lap as ISO strings, padded slightly. */
export function lapWindow(lap: Lap | undefined, padSec = 0): [string, string] | null {
  if (!lap?.date_start || !lap.lap_duration) return null
  const s = Date.parse(lap.date_start) - padSec * 1000
  const e = Date.parse(lap.date_start) + (lap.lap_duration + padSec) * 1000
  return [new Date(s).toISOString(), new Date(e).toISOString()]
}

export function fastestLap(laps: Lap[] | undefined, driver?: number): Lap | undefined {
  let best: Lap | undefined
  for (const l of laps ?? []) {
    if (driver !== undefined && l.driver_number !== driver) continue
    if (!l.lap_duration || l.is_pit_out_lap) continue
    if (!best || l.lap_duration < best.lap_duration!) best = l
  }
  return best
}
