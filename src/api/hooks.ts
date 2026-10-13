import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { get, type Params } from './client'
import {
  adaptChampionshipDrivers,
  adaptChampionshipTeams,
  adaptDrivers,
  adaptGrid,
  adaptIntervals,
  adaptLaps,
  adaptMeetings,
  adaptPits,
  adaptPositions,
  adaptResults,
  adaptSeasonChampionshipDrivers,
  adaptSeasonChampionshipTeams,
  adaptSeasonDrivers,
  adaptSeasonResults,
  adaptSession,
  adaptSessions,
  roundForDate,
} from './jolpica/adapters'
import { decodeSessionKey, isSynthetic, kindFromSessionName, OPENF1_FIRST_YEAR, type JKind } from './synthetic'
import type {
  CarData,
  ChampionshipDriver,
  ChampionshipTeam,
  Driver,
  Interval,
  Lap,
  Location,
  Meeting,
  Overtake,
  Pit,
  Position,
  RaceControl,
  Session,
  SessionResult,
  StartingGrid,
  Stint,
  TeamRadio,
  Weather,
} from './types'

/** Sessions whose end time is known, used to decide what is safe to cache forever. */
const sessionEnds = new Map<number, number>()
const SETTLE_MS = 3 * 60 * 60 * 1000

export function isSettled(sessionKey: number | null | undefined): boolean {
  if (!sessionKey) return false
  const end = sessionEnds.get(sessionKey)
  return end !== undefined && Date.now() - end > SETTLE_MS
}

function useEndpoint<T>(endpoint: string, params: Params, enabled = true, persist?: boolean, select?: (rows: T[]) => T[]) {
  const sessionKey = typeof params.session_key === 'number' ? params.session_key : undefined
  const settled = persist ?? isSettled(sessionKey)
  return useQuery({
    queryKey: [endpoint, params],
    queryFn: ({ signal }) => get<T>(endpoint, params, { persist: settled, signal }),
    enabled,
    staleTime: settled ? Infinity : 30_000,
    refetchInterval: settled ? false : 60_000,
    select,
  })
}

/* ---------- source selection ----------
 * OpenF1 covers 2023 onward. Earlier seasons use synthetic (negative) session keys
 * backed by Jolpica adapters that return OpenF1-shaped rows. For OpenF1 sessions,
 * endpoints with a Jolpica equivalent fall back to it when OpenF1 has no rows
 * (e.g. starting grids, or pit stops missing from some 2023 races).
 */

export type Source = 'openf1' | 'jolpica' | null

export interface DataResult<T> {
  data: T[] | undefined
  isLoading: boolean
  isPending: boolean
  isSuccess: boolean
  fetchStatus: 'fetching' | 'paused' | 'idle'
  error: Error | null
  source: Source
}

type Ref = { year: number; round: number; kind: JKind }
type Adapter<T> = (ref: Ref) => Promise<T[]>

const NONE: DataResult<never> = { data: [], isLoading: false, isPending: false, isSuccess: true, fetchStatus: 'idle', error: null, source: null }

function wrap<T>(q: UseQueryResult<T[]>, source: Source): DataResult<T> {
  return { data: q.data, isLoading: q.isLoading, isPending: q.isPending, isSuccess: q.isSuccess, fetchStatus: q.fetchStatus, error: q.error, source }
}

const ADAPT_STALE = 10 * 60 * 1000

/** The Jolpica weekend (year, round, kind) matching a real OpenF1 session. */
function useJolpicaTwin(sessionKey: number | null | undefined) {
  const session = useSessionByKey(sessionKey && !isSynthetic(sessionKey) ? sessionKey : null)
  const s = session.data?.[0]
  const kind = kindFromSessionName(s?.session_name)
  return useQuery({
    queryKey: ['jolpica-twin', sessionKey],
    queryFn: async (): Promise<Ref | null> => {
      const round = await roundForDate(s!.year, s!.date_start)
      return round ? { year: s!.year, round, kind: kind! } : null
    },
    enabled: !!s && !!kind,
    staleTime: Infinity,
    retry: 0,
  })
}

function useSessionEndpoint<T>(endpoint: string, sessionKey: number | null | undefined, extra: Params, adapter?: Adapter<T>, fallbackOnEmpty = false): DataResult<T> {
  const synthetic = isSynthetic(sessionKey)
  const of1 = useEndpoint<T>(endpoint, { session_key: sessionKey ?? undefined, ...extra }, !!sessionKey && !synthetic)
  const needFallback = !synthetic && fallbackOnEmpty && !!adapter && of1.isSuccess && (of1.data?.length ?? 0) === 0
  const twin = useJolpicaTwin(needFallback ? sessionKey : null)
  const ref = synthetic ? decodeSessionKey(sessionKey!) : needFallback ? (twin.data ?? null) : null
  const j = useQuery({
    queryKey: ['jolpica-adapt', endpoint, ref],
    queryFn: () => adapter!(ref!),
    enabled: !!adapter && !!ref,
    staleTime: ADAPT_STALE,
    retry: 0,
  })
  if (synthetic) return adapter ? wrap(j, 'jolpica') : NONE
  if (needFallback) {
    if (twin.isLoading) return { ...wrap(j, 'jolpica'), isLoading: true, isPending: true, fetchStatus: 'fetching' }
    if (!ref) return wrap(of1, 'openf1')
    return wrap(j, 'jolpica')
  }
  return wrap(of1, 'openf1')
}

/* ---------- calendar ---------- */

const covered = (year: number) => year >= OPENF1_FIRST_YEAR

function useYearEndpoint<T>(endpoint: string, year: number, adapter: (year: number) => Promise<T[]>): DataResult<T> {
  const of1 = useEndpoint<T>(endpoint, { year }, covered(year), year < new Date().getFullYear())
  const j = useQuery({ queryKey: ['jolpica-adapt', endpoint, year], queryFn: () => adapter(year), enabled: !covered(year) && year > 0, staleTime: ADAPT_STALE, retry: 0 })
  return covered(year) ? wrap(of1, 'openf1') : wrap(j, 'jolpica')
}

export function useMeetings(year: number) {
  return useYearEndpoint<Meeting>('meetings', year, adaptMeetings)
}

export function useSessions(year: number) {
  const q = useYearEndpoint<Session>('sessions', year, adaptSessions)
  if (q.data) for (const s of q.data) sessionEnds.set(s.session_key, Date.parse(s.date_end))
  return q
}

export function useSessionByKey(sessionKey: number | null | undefined): DataResult<Session> {
  const synthetic = isSynthetic(sessionKey)
  const of1 = useEndpoint<Session>('sessions', { session_key: sessionKey ?? undefined }, !!sessionKey && !synthetic, true)
  const ref = synthetic ? decodeSessionKey(sessionKey!) : null
  const j = useQuery({ queryKey: ['jolpica-adapt', 'session', ref], queryFn: () => adaptSession(ref!.year, ref!.round, ref!.kind), enabled: !!ref, staleTime: ADAPT_STALE, retry: 0 })
  const q = synthetic ? wrap(j, 'jolpica') : wrap(of1, 'openf1')
  if (q.data) for (const s of q.data) sessionEnds.set(s.session_key, Date.parse(s.date_end))
  return q
}

/* ---------- per-session ---------- */

const per =
  <T>(endpoint: string, adapter?: Adapter<T>, fallbackOnEmpty = false) =>
  (sessionKey: number | null | undefined, extra: Params = {}) =>
    useSessionEndpoint<T>(endpoint, sessionKey, extra, adapter, fallbackOnEmpty)

export const useDrivers = per<Driver>('drivers', adaptDrivers)
export const useLaps = per<Lap>('laps', adaptLaps)
export const useStints = per<Stint>('stints')
export const usePits = per<Pit>('pit', adaptPits, true)
export const usePositions = per<Position>('position', adaptPositions)
export const useIntervals = per<Interval>('intervals', adaptIntervals)
export const useRaceControl = per<RaceControl>('race_control')
export const useTeamRadio = per<TeamRadio>('team_radio')
export const useResults = per<SessionResult>('session_result', adaptResults, true)
export const useStartingGrid = per<StartingGrid>('starting_grid', adaptGrid, true)
export const useOvertakes = per<Overtake>('overtakes')
export const useChampionshipDrivers = per<ChampionshipDriver>('championship_drivers', adaptChampionshipDrivers, true)
export const useChampionshipTeams = per<ChampionshipTeam>('championship_teams', adaptChampionshipTeams, true)

/** High-frequency telemetry (OpenF1 only): always scope by driver and a time window. */
export function useCarData(sessionKey: number | null | undefined, driver: number | null, from?: string, to?: string) {
  return useEndpoint<CarData>(
    'car_data',
    { session_key: sessionKey ?? undefined, driver_number: driver ?? undefined, 'date>': from, 'date<': to },
    !!sessionKey && !isSynthetic(sessionKey) && !!driver && !!from && !!to,
  )
}

/** Car data for any number of drivers at once (shares cache entries with useCarData). */
export function useCarDataMany(sessionKey: number | null | undefined, specs: { driver: number; from?: string; to?: string }[]) {
  const settled = isSettled(sessionKey)
  return useQueries({
    queries: specs.map((sp) => {
      const params: Params = { session_key: sessionKey ?? undefined, driver_number: sp.driver, 'date>': sp.from, 'date<': sp.to }
      return {
        queryKey: ['car_data', params],
        queryFn: ({ signal }: { signal: AbortSignal }) => get<CarData>('car_data', params, { persist: settled, signal }),
        enabled: !!sessionKey && !isSynthetic(sessionKey) && !!sp.from && !!sp.to,
        staleTime: settled ? Infinity : 30_000,
      }
    }),
  })
}

export function useLocation(sessionKey: number | null | undefined, driver: number | null, from?: string, to?: string) {
  return useEndpoint<Location>(
    'location',
    { session_key: sessionKey ?? undefined, driver_number: driver ?? undefined, 'date>': from, 'date<': to },
    !!sessionKey && !isSynthetic(sessionKey) && !!driver && !!from && !!to,
  )
}

/** Every car's location over several time windows (one request each, so windows cache independently). */
export function useLocationWindows(sessionKey: number | null | undefined, windows: [string, string][]) {
  const settled = isSettled(sessionKey)
  return useQueries({
    queries: windows.map(([from, to]) => {
      const params: Params = { session_key: sessionKey ?? undefined, 'date>=': from, 'date<': to }
      return {
        queryKey: ['location', params],
        queryFn: ({ signal }: { signal: AbortSignal }) => get<Location>('location', params, { persist: settled, signal }),
        enabled: !!sessionKey && !isSynthetic(sessionKey),
        staleTime: settled ? Infinity : 30_000,
      }
    }),
  })
}

/* ---------- season-wide ---------- */

function useMeetingRange(year: number) {
  const meetings = useMeetings(covered(year) ? year : 0)
  const keys = (meetings.data ?? []).map((m) => m.meeting_key)
  return keys.length ? { min: Math.min(...keys), max: Math.max(...keys) } : null
}

/** OpenF1 range query over the season's meetings, or the Jolpica adapter before 2023 (or if OpenF1 is empty). */
function useSeasonEndpoint<T>(endpoint: string, year: number, adapter: (year: number) => Promise<T[]>): DataResult<T> {
  const r = useMeetingRange(year)
  const of1 = useEndpoint<T>(endpoint, { 'meeting_key>=': r?.min, 'meeting_key<=': r?.max }, covered(year) && !!r, year < new Date().getFullYear())
  const useJ = !covered(year)
  const j = useQuery({ queryKey: ['jolpica-adapt', endpoint, 'season', year], queryFn: () => adapter(year), enabled: useJ && year > 0, staleTime: ADAPT_STALE, retry: 0 })
  return useJ ? wrap(j, 'jolpica') : wrap(of1, 'openf1')
}

export const useSeasonChampionshipDrivers = (year: number) => useSeasonEndpoint<ChampionshipDriver>('championship_drivers', year, adaptSeasonChampionshipDrivers)
export const useSeasonChampionshipTeams = (year: number) => useSeasonEndpoint<ChampionshipTeam>('championship_teams', year, adaptSeasonChampionshipTeams)
export const useSeasonResults = (year: number) => useSeasonEndpoint<SessionResult>('session_result', year, adaptSeasonResults)
export const useSeasonDrivers = (year: number) => useSeasonEndpoint<Driver>('drivers', year, adaptSeasonDrivers)

/** Weather stations occasionally report 0.0 for a temperature; drop those samples. */
const dropSensorGlitches = (rows: Weather[]) => rows.filter((w) => w.track_temperature !== 0 && w.air_temperature !== 0)

export function useWeather(sessionKey: number | null | undefined) {
  return wrap(useEndpoint<Weather>('weather', { session_key: sessionKey ?? undefined }, !!sessionKey && !isSynthetic(sessionKey), undefined, dropSensorGlitches), 'openf1')
}
