import { useCallback, useMemo } from 'react'
import { useJSchedule } from '../api/jolpica/hooks'
import type { JConstructor, JDriver, JRace } from '../api/jolpica/types'
import { jCode } from '../api/jolpica/util'
import { decodeSessionKey } from '../api/synthetic'
import { liveryAssigner } from './livery'
import { useStore } from '../store'
import { contrastSafe, useDriverMap } from './drivers'
import { useGlobalSession } from './session'
import { useTokens } from './theme'

export { OPENF1_FIRST_YEAR } from '../api/synthetic'
export { isFinish, jCode, jName, num, parseLapTime } from '../api/jolpica/util'

/**
 * The Jolpica race for the header's session: decoded from a synthetic (pre-2023) key,
 * or matched to an OpenF1 session by race date. Falls back to the latest completed round.
 */
export function useHistoryRef(): { year: number; round: number | null; race: JRace | undefined; isLoading: boolean } {
  const storeYear = useStore((s) => s.year)
  const { session, sessionKey } = useGlobalSession()
  const year = session?.year ?? storeYear
  const schedule = useJSchedule(year)

  return useMemo(() => {
    const races = schedule.data?.races ?? []
    let race: JRace | undefined
    const decoded = sessionKey ? decodeSessionKey(sessionKey) : null
    if (decoded) race = races.find((r) => Number(r.round) === decoded.round)
    else if (session) {
      const t = Date.parse(session.date_start)
      race = races.find((r) => Math.abs(Date.parse(r.date) - t) < 4 * 86400000)
    }
    if (!race) race = latestCompleted(races)
    return { year, round: race ? Number(race.round) : null, race, isLoading: schedule.isLoading }
  }, [year, session, sessionKey, schedule.data, schedule.isLoading])
}

export function latestCompleted(races: JRace[]): JRace | undefined {
  const today = new Date().toISOString().slice(0, 10)
  const done = races.filter((r) => r.date <= today)
  return done[done.length - 1] ?? races[0]
}

/* ---------- constructor colours ---------- */

/** Stable colour per constructorId for the current theme. */
export function useConstructorColors() {
  const t = useTokens()
  return useMemo(() => {
    const assign = liveryAssigner()
    return (c: JConstructor | string | undefined) => {
      const id = typeof c === 'string' ? c : c?.constructorId
      return id ? contrastSafe(assign(id), t) : t.muted
    }
  }, [t])
}

/* ---------- header focus, mapped to Jolpica drivers ---------- */

/**
 * The header driver focus expressed as three-letter codes, so Jolpica panels can
 * honour it in OpenF1 seasons. Empty set = no focus.
 */
export function useFocusCodes() {
  const selected = useStore((s) => s.drivers)
  const mode = useStore((s) => s.prefs.filterMode)
  const { sessionKey } = useGlobalSession()
  const { map } = useDriverMap(sessionKey)
  const codes = useMemo(() => new Set(selected.map((n) => map.get(n)?.name_acronym).filter(Boolean) as string[]), [selected, map])
  const visible = useCallback((d: JDriver) => !codes.size || mode === 'dim' || codes.has(jCode(d)), [codes, mode])
  const dimmed = useCallback((d: JDriver) => codes.size > 0 && mode === 'dim' && !codes.has(jCode(d)), [codes, mode])
  return { codes, visible, dimmed }
}

/**
 * Season/round a History panel shows: its own `season`/`round` options when set,
 * otherwise the header's race.
 */
export function useHistTarget(opts: Record<string, unknown>) {
  const header = useHistoryRef()
  const season = Number(opts.season) || 0
  const ownRound = Number(opts.round) || 0
  const schedule = useJSchedule(season || null)
  return useMemo(() => {
    if (!season) return { ...header, follows: true }
    const races = schedule.data?.races ?? []
    const race = (ownRound ? races.find((r) => Number(r.round) === ownRound) : undefined) ?? latestCompleted(races)
    return { year: season, round: race ? Number(race.round) : null, race, isLoading: schedule.isLoading, follows: false }
  }, [season, ownRound, header, schedule.data, schedule.isLoading])
}

/** Drivers worth offering in a driver search before anything is typed. */
export const LEGENDS: { id: string; name: string }[] = [
  { id: 'hamilton', name: 'Lewis Hamilton' },
  { id: 'michael_schumacher', name: 'Michael Schumacher' },
  { id: 'max_verstappen', name: 'Max Verstappen' },
  { id: 'vettel', name: 'Sebastian Vettel' },
  { id: 'alonso', name: 'Fernando Alonso' },
  { id: 'senna', name: 'Ayrton Senna' },
  { id: 'prost', name: 'Alain Prost' },
  { id: 'lauda', name: 'Niki Lauda' },
  { id: 'piquet', name: 'Nelson Piquet' },
  { id: 'mansell', name: 'Nigel Mansell' },
  { id: 'hakkinen', name: 'Mika Häkkinen' },
  { id: 'raikkonen', name: 'Kimi Räikkönen' },
  { id: 'rosberg', name: 'Nico Rosberg' },
  { id: 'button', name: 'Jenson Button' },
  { id: 'damon_hill', name: 'Damon Hill' },
  { id: 'hill', name: 'Graham Hill' },
  { id: 'stewart', name: 'Jackie Stewart' },
  { id: 'clark', name: 'Jim Clark' },
  { id: 'fangio', name: 'Juan Manuel Fangio' },
  { id: 'jack_brabham', name: 'Jack Brabham' },
  { id: 'moss', name: 'Stirling Moss' },
  { id: 'ascari', name: 'Alberto Ascari' },
  { id: 'emerson_fittipaldi', name: 'Emerson Fittipaldi' },
  { id: 'villeneuve', name: 'Jacques Villeneuve' },
  { id: 'gilles_villeneuve', name: 'Gilles Villeneuve' },
  { id: 'leclerc', name: 'Charles Leclerc' },
  { id: 'norris', name: 'Lando Norris' },
]
