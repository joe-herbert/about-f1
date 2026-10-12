import { useMemo } from 'react'
import { useDrivers, useSeasonDrivers, useSessionByKey } from '../api/hooks'
import type { Driver } from '../api/types'
import { standingOf, useChampionshipOrder, useSeasonOrder } from './championshipOrder'
import { mix, useTokens, type Tokens } from './theme'

export interface DriverInfo extends Driver {
  color: string
  /** Second driver of a team: draw dashed / hollow so teammates stay distinct. */
  secondary: boolean
}

export function contrastSafe(hex: string, t: Tokens) {
  const p = parseInt(hex.slice(1), 16)
  const lum = (0.2126 * ((p >> 16) & 255) + 0.7152 * ((p >> 8) & 255) + 0.0722 * (p & 255)) / 255
  if (t.mode === 'dark' && lum < 0.28) return mix(hex, '#ffffff', 0.35)
  if (t.mode === 'light' && lum > 0.78) return mix(hex, '#000000', 0.3)
  return hex
}

/**
 * @param standing championship position for a driver (lower is better); within a team the
 *   best-placed driver is primary (solid line) and teammates are secondary (dashed/hollow).
 */
export function buildDriverMap(drivers: Driver[] | undefined, t: Tokens, standing?: (d: Driver) => number | undefined): Map<number, DriverInfo> {
  const map = new Map<number, DriverInfo>()
  if (!drivers) return map
  // A season query has one row per session; keep the latest per driver.
  const latest = new Map<number, Driver>()
  for (const d of drivers) {
    const prev = latest.get(d.driver_number)
    if (!prev || d.session_key > prev.session_key) latest.set(d.driver_number, d)
  }
  const rank = (d: Driver) => standing?.(d) ?? Infinity
  const sorted = [...latest.values()].sort((a, b) => rank(a) - rank(b) || a.driver_number - b.driver_number)
  const seenTeam = new Set<string>()
  for (const d of sorted) {
    const team = d.team_name ?? `#${d.driver_number}`
    const secondary = seenTeam.has(team)
    seenTeam.add(team)
    const raw = d.team_colour ? `#${d.team_colour.replace('#', '')}` : '#8a8f98'
    map.set(d.driver_number, { ...d, color: contrastSafe(raw.toLowerCase(), t), secondary })
  }
  return map
}

export function useDriverMap(sessionKey: number | null | undefined) {
  const t = useTokens()
  const q = useDrivers(sessionKey)
  // Teammate styling follows the championship at this session.
  const order = useChampionshipOrder(sessionKey)
  const map = useMemo(() => buildDriverMap(q.data, t, (d) => standingOf(order, d)?.pos), [q.data, t, order])
  return { map, isLoading: q.isLoading, error: q.error }
}

export function useSeasonDriverMap(year: number) {
  const t = useTokens()
  const q = useSeasonDrivers(year)
  // Season-wide views use the season's latest standings.
  const order = useSeasonOrder(year)
  const map = useMemo(() => buildDriverMap(q.data, t, (d) => standingOf(order, d)?.pos), [q.data, t, order])
  return { map, isLoading: q.isLoading, error: q.error }
}

/**
 * Session drivers, plus the rest of the season's entrants for anyone not in this session —
 * championship tables list drivers who sat the race out (dropped, injured, replaced).
 */
export function useDriverMapWithSeason(sessionKey: number | null | undefined) {
  const year = useSessionByKey(sessionKey).data?.[0]?.year ?? 0
  const session = useDriverMap(sessionKey)
  const season = useSeasonDriverMap(year)
  const map = useMemo(() => {
    if (!season.map.size) return session.map
    const m = new Map(session.map)
    for (const [n, d] of season.map) if (!m.has(n)) m.set(n, d)
    return m
  }, [session.map, season.map])
  return { map, isLoading: session.isLoading, error: session.error }
}

export function teamColorMap(drivers: Map<number, DriverInfo>) {
  const m = new Map<string, string>()
  for (const d of drivers.values()) if (d.team_name && !m.has(d.team_name)) m.set(d.team_name, d.color)
  return m
}

export function label(d: DriverInfo | undefined, n: number) {
  return d?.name_acronym ?? `#${n}`
}
