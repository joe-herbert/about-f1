import { useMemo } from 'react'
import { useSeasonChampionshipDrivers, useSessionByKey, useSessions } from '../api/hooks'
import type { ChampionshipDriver, Driver } from '../api/types'

/** Championship position by car number, and by Jolpica driverId where known (numbers weren't personal before 2014). */
export interface ChampionshipOrder {
  byNumber: Map<number, number>
  byId: Map<string, number>
  pointsByNumber: Map<number, number>
  pointsById: Map<string, number>
}

const EMPTY: ChampionshipOrder = { byNumber: new Map(), byId: new Map(), pointsByNumber: new Map(), pointsById: new Map() }

/** Positions from the latest standings in `rows` dated on or before `cutoff` (ms). */
function standingsAt(rows: ChampionshipDriver[] | undefined, dateOf: Map<number, number>, cutoff: number): ChampionshipOrder | null {
  let bestKey: number | null = null
  let bestDate = -Infinity
  for (const r of rows ?? []) {
    const d = dateOf.get(r.session_key)
    if (d === undefined || d > cutoff || d <= bestDate) continue
    bestDate = d
    bestKey = r.session_key
  }
  if (bestKey === null) return null
  const out: ChampionshipOrder = { byNumber: new Map(), byId: new Map(), pointsByNumber: new Map(), pointsById: new Map() }
  for (const r of rows!) {
    if (r.session_key !== bestKey || !r.position_current) continue
    out.byNumber.set(r.driver_number, r.position_current)
    out.pointsByNumber.set(r.driver_number, r.points_current ?? 0)
    if (r.driver?.driver_id) {
      out.byId.set(r.driver.driver_id, r.position_current)
      out.pointsById.set(r.driver.driver_id, r.points_current ?? 0)
    }
  }
  return out
}

/**
 * Drivers' championship position for every driver as of a session: the standings after it
 * when it scored points (race or sprint), else the latest standings before it. Before a
 * season's first points session, the previous season's final order stands in.
 */
export function useChampionshipOrder(sessionKey: number | null | undefined) {
  const session = useSessionByKey(sessionKey).data?.[0]
  const year = session?.year ?? 0
  const sessions = useSessions(year)
  const season = useSeasonChampionshipDrivers(year)

  const dateOf = useMemo(() => new Map((sessions.data ?? []).map((s) => [s.session_key, Date.parse(s.date_start)])), [sessions.data])
  // The session's own standings count when it scored; otherwise only earlier ones do.
  const cutoff = session ? Date.parse(session.date_start) : -Infinity
  const current = useMemo(() => (session ? standingsAt(season.data, dateOf, cutoff) : null), [session, season.data, dateOf, cutoff])

  // Only reach for last season when this one has no standings yet.
  const needPrev = !!session && season.isSuccess && sessions.isSuccess && !current
  const prevYear = needPrev ? year - 1 : 0
  const prevSessions = useSessions(prevYear)
  const prevSeason = useSeasonChampionshipDrivers(prevYear)
  const previous = useMemo(() => {
    if (!needPrev) return null
    const dates = new Map((prevSessions.data ?? []).map((s) => [s.session_key, Date.parse(s.date_start)]))
    return standingsAt(prevSeason.data, dates, Infinity)
  }, [needPrev, prevSessions.data, prevSeason.data])

  return current ?? previous ?? EMPTY
}

/** The latest standings of a season (final standings once it's over). */
export function useSeasonOrder(year: number) {
  const sessions = useSessions(year)
  const season = useSeasonChampionshipDrivers(year)
  return useMemo(() => {
    const dateOf = new Map((sessions.data ?? []).map((s) => [s.session_key, Date.parse(s.date_start)]))
    return standingsAt(season.data, dateOf, Infinity) ?? EMPTY
  }, [sessions.data, season.data])
}

/** A driver's championship position and points, matched by driverId, else car number. */
export function standingOf(order: ChampionshipOrder, d: Driver | undefined) {
  if (!d) return null
  const pos = (d.driver_id ? order.byId.get(d.driver_id) : undefined) ?? order.byNumber.get(d.driver_number)
  if (!pos) return null
  const pts = (d.driver_id ? order.pointsById.get(d.driver_id) : undefined) ?? order.pointsByNumber.get(d.driver_number) ?? 0
  return { pos, pts }
}

/** Sort drivers by championship position (matched by driverId, else car number), then car number. */
export function byChampionship(order: ChampionshipOrder) {
  const pos = (d: Driver) => (d.driver_id ? order.byId.get(d.driver_id) : undefined) ?? order.byNumber.get(d.driver_number) ?? 999
  return (a: Driver, b: Driver) => pos(a) - pos(b) || a.driver_number - b.driver_number
}
