import { useMemo } from 'react'
import { useLaps, useOvertakes, usePits, usePositions } from '../../api/hooks'
import { cleanLaps, fastestLap, groupBy, mean, positionsByLap, stdev } from '../../lib/derive'
import { useGridFinish } from './useGridFinish'

export interface DriverStats {
  n: number
  finish: number | null
  status: string | null
  grid: number | null
  gained: number | null
  bestLap: number | null
  avgLap: number | null
  consistency: number | null
  bestS1: number | null
  bestS2: number | null
  bestS3: number | null
  topSpeed: number | null
  pitStops: number
  overtakes: number
  lapsLed: number
  laps: number
}

const minOf = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number' && x > 0)
  return v.length ? Math.min(...v) : null
}

export function useDriverStats(sessionKey: number | null) {
  const laps = useLaps(sessionKey)
  const pits = usePits(sessionKey)
  const overtakes = useOvertakes(sessionKey)
  const positions = usePositions(sessionKey)
  const gf = useGridFinish(sessionKey)

  const stats = useMemo(() => {
    const out = new Map<number, DriverStats>()
    const byDriver = groupBy(laps.data, (l) => l.driver_number)
    const clean = groupBy(cleanLaps(laps.data, { excludePitOut: true, excludeInLaps: true, excludeLap1: true, outlierPct: 7 }), (l) => l.driver_number)
    const pitCount = groupBy(pits.data, (p) => p.driver_number)
    const otCount = groupBy(overtakes.data, (o) => o.overtaking_driver_number)
    const pbl = positionsByLap(laps.data, positions.data)
    const gfMap = new Map(gf.rows.map((r) => [r.n, r]))
    const drivers = new Set([...byDriver.keys(), ...gfMap.keys()])
    for (const n of drivers) {
      const ls = byDriver.get(n) ?? []
      const cl = (clean.get(n) ?? []).map((l) => l.lap_duration!)
      const g = gfMap.get(n)
      const led = (pbl.get(n) ?? []).filter((p, i) => i > 0 && p === 1).length
      out.set(n, {
        n,
        finish: g?.finish ?? null,
        status: g?.status ?? null,
        grid: g?.grid ?? null,
        gained: g?.grid && g.finish ? g.grid - g.finish : null,
        bestLap: fastestLap(ls)?.lap_duration ?? null,
        avgLap: cl.length ? mean(cl) : null,
        consistency: cl.length > 2 ? stdev(cl) : null,
        bestS1: minOf(ls.map((l) => l.duration_sector_1)),
        bestS2: minOf(ls.map((l) => l.duration_sector_2)),
        bestS3: minOf(ls.map((l) => l.duration_sector_3)),
        topSpeed: ls.reduce<number | null>((m, l) => Math.max(m ?? 0, l.st_speed ?? 0, l.i1_speed ?? 0, l.i2_speed ?? 0) || m, null),
        pitStops: pitCount.get(n)?.length ?? 0,
        overtakes: otCount.get(n)?.length ?? 0,
        lapsLed: led,
        laps: ls.length,
      })
    }
    return out
  }, [laps.data, pits.data, overtakes.data, positions.data, gf.rows])

  return { stats, laps: laps.data, queries: [laps, pits, overtakes, positions, ...gf.queries] as const }
}
