import { useQuery } from '@tanstack/react-query'
import { FOREVER, HOUR, jolpica } from './client'
import type { JData, JRace, JStandingsList } from './types'

// Baked from Jolpica (seasons through BAKED_THROUGH); loaded on demand.
const loadChampions = () => import('./champions.json').then((m) => m.default as unknown as { drivers: JStandingsList[]; constructors: JStandingsList[] })
const loadWinners = () => import('./winners.json').then((m) => m.default as unknown as JRace[])

export const FIRST_SEASON = 1950

const thisYear = () => new Date().getFullYear()
/** Past seasons can't change; the current one refreshes hourly. */
const seasonTtl = (year: number) => (year < thisYear() ? FOREVER : HOUR)
/** Queries spanning every season change at most once per race weekend. */
const ALL_TIME_TTL = 12 * HOUR

export function useJolpica(path: string | null, ttl: number) {
  return useQuery({
    queryKey: ['jolpica', path],
    queryFn: () => jolpica(path!, ttl),
    enabled: !!path,
    staleTime: ttl === FOREVER ? Infinity : Math.min(ttl, 10 * 60 * 1000),
    retry: 0,
  })
}

const seasonPath = (year: number | null | undefined, rest: string) => (year ? `${year}/${rest}` : null)
const roundPath = (year: number | null | undefined, round: number | null | undefined, rest: string) =>
  year && round ? `${year}/${round}/${rest}` : null

/* ---------- one season ---------- */

export const useJSchedule = (year: number | null | undefined) => useJolpica(seasonPath(year, 'races'), year ? seasonTtl(year) : HOUR)
export const useJSeasonResults = (year: number | null | undefined) => useJolpica(seasonPath(year, 'results'), year ? seasonTtl(year) : HOUR)
export const useJSeasonSprints = (year: number | null | undefined) => useJolpica(seasonPath(year, 'sprint'), year ? seasonTtl(year) : HOUR)
export const useJSeasonQualifying = (year: number | null | undefined) => useJolpica(seasonPath(year, 'qualifying'), year ? seasonTtl(year) : HOUR)
export const useJSeasonDrivers = (year: number | null | undefined) => useJolpica(seasonPath(year, 'drivers'), year ? seasonTtl(year) : HOUR)

/** Standings after a round (or the latest round when round is null). */
export function useJDriverStandings(year: number | null | undefined, round?: number | null) {
  return useJolpica(round ? roundPath(year, round, 'driverstandings') : seasonPath(year, 'driverstandings'), year ? seasonTtl(year) : HOUR)
}
export function useJConstructorStandings(year: number | null | undefined, round?: number | null) {
  return useJolpica(round ? roundPath(year, round, 'constructorstandings') : seasonPath(year, 'constructorstandings'), year ? seasonTtl(year) : HOUR)
}

/* ---------- one race ---------- */

// A finished race's data never changes; an hour covers late penalties on the latest one.
const raceTtl = (year: number | null | undefined) => (year && year < thisYear() ? FOREVER : HOUR)
export const useJResults = (year: number | null | undefined, round: number | null | undefined) => useJolpica(roundPath(year, round, 'results'), raceTtl(year))
export const useJQualifying = (year: number | null | undefined, round: number | null | undefined) => useJolpica(roundPath(year, round, 'qualifying'), raceTtl(year))
export const useJSprint = (year: number | null | undefined, round: number | null | undefined) => useJolpica(roundPath(year, round, 'sprint'), raceTtl(year))
/** Lap-by-lap positions and times; available from 1996. Expensive (about 10 pages). */
export const useJLaps = (year: number | null | undefined, round: number | null | undefined) => useJolpica(roundPath(year, round, 'laps'), raceTtl(year))
/** Pit stops; available from 2011. */
export const useJPitStops = (year: number | null | undefined, round: number | null | undefined) => useJolpica(roundPath(year, round, 'pitstops'), raceTtl(year))

/* ---------- across all seasons ---------- */

export const useJSeasons = () => useJolpica('seasons', ALL_TIME_TTL)
// Jolpica only serves standings for a given season, so past champions ship as a
// static file (baked from Jolpica) and only seasons after it are fetched.
const BAKED_THROUGH = 2025

const emptyData = (): JData => ({ total: 0, races: [], standings: [], drivers: [], constructors: [], circuits: [], seasons: [] })

async function championsFor(kind: 'driverstandings' | 'constructorstandings'): Promise<JData> {
  const baked = await loadChampions()
  const out = emptyData()
  out.standings = [...(kind === 'driverstandings' ? baked.drivers : baked.constructors)]
  for (let y = BAKED_THROUGH + 1; y <= thisYear(); y++) {
    const live = await jolpica(`${y}/${kind}/1`, seasonTtl(y))
    out.standings.push(...live.standings)
  }
  out.total = out.standings.length
  return out
}

/** Every season's drivers' champion (the current season shows its leader). */
export const useJDriverChampions = () =>
  useQuery({
    queryKey: ['jolpica', 'champions', 'drivers'],
    queryFn: () => championsFor('driverstandings'),
    staleTime: 10 * 60 * 1000,
    retry: 0,
  })

/** Every season's constructors' champion (the title began in 1958). */
export const useJConstructorChampions = () =>
  useQuery({
    queryKey: ['jolpica', 'champions', 'constructors'],
    queryFn: () => championsFor('constructorstandings'),
    staleTime: 10 * 60 * 1000,
    retry: 0,
  })

/**
 * Season-by-season standings for one driver or constructor: the seasons list, then each
 * season's standings (one request per season, cached forever for past seasons). If the
 * hourly budget runs out part-way, the seasons fetched so far are returned.
 */
async function careerStandings(kind: 'drivers' | 'constructors', id: string): Promise<JData> {
  const seasons = await jolpica(`${kind}/${id}/seasons`, ALL_TIME_TTL)
  const out = emptyData()
  out.seasons = seasons.seasons
  const table = kind === 'drivers' ? 'driverstandings' : 'constructorstandings'
  for (const { season } of seasons.seasons) {
    const y = Number(season)
    try {
      const d = await jolpica(`${y}/${kind}/${id}/${table}`, seasonTtl(y))
      out.standings.push(...d.standings)
    } catch (e) {
      if (!out.standings.length) throw e
      break
    }
  }
  out.total = out.standings.length
  return out
}
/** Every Grand Prix winner: the baked file plus one request per season after it. */
async function allWinners(): Promise<JData> {
  const out = emptyData()
  out.races = [...(await loadWinners())]
  for (let y = BAKED_THROUGH + 1; y <= thisYear(); y++) out.races.push(...(await jolpica(`${y}/results/1`, seasonTtl(y))).races)
  out.total = out.races.length
  return out
}

export const useJAllWinners = () =>
  useQuery({ queryKey: ['jolpica', 'winners'], queryFn: allWinners, staleTime: 10 * 60 * 1000, retry: 0 })

/** Winners at one circuit, filtered from the all-winners data (no extra requests). */
export const useJCircuitWinners = (circuitId: string | null | undefined) =>
  useQuery({
    queryKey: ['jolpica', 'winners'],
    queryFn: allWinners,
    enabled: !!circuitId,
    staleTime: 10 * 60 * 1000,
    retry: 0,
    select: (d: JData): JData => {
      const races = d.races.filter((r) => r.Circuit.circuitId === circuitId)
      return { ...d, races, total: races.length }
    },
  })
export const useJCircuitPoles = (circuitId: string | null | undefined) => useJolpica(circuitId ? `circuits/${circuitId}/qualifying/1` : null, ALL_TIME_TTL)
export const useJDriverCareer = (driverId: string | null | undefined) => useJolpica(driverId ? `drivers/${driverId}/results` : null, ALL_TIME_TTL)
export const useJDriverSeasons = (driverId: string | null | undefined) =>
  useQuery({
    queryKey: ['jolpica', 'career', 'drivers', driverId],
    queryFn: () => careerStandings('drivers', driverId!),
    enabled: !!driverId,
    staleTime: 10 * 60 * 1000,
    retry: 0,
  })
export const useJConstructorSeasons = (constructorId: string | null | undefined) =>
  useQuery({
    queryKey: ['jolpica', 'career', 'constructors', constructorId],
    queryFn: () => careerStandings('constructors', constructorId!),
    enabled: !!constructorId,
    staleTime: 10 * 60 * 1000,
    retry: 0,
  })
