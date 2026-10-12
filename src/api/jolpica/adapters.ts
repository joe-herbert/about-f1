// Jolpica → OpenF1-shaped records, so every panel can read either source.
// Session-level adapters take a decoded synthetic session (year, round, kind).

import type {
  ChampionshipDriver,
  ChampionshipTeam,
  Driver,
  Interval,
  Lap,
  Meeting,
  Pit,
  Position,
  Session,
  SessionResult,
  StartingGrid,
} from '../types'
import { liveryAssigner } from '../../lib/livery'
import { CIRCUIT_TIME_ZONES } from '../../lib/trackTime'
import { synthMeetingKey, synthSessionKey, SESSION_NAME, type JKind } from '../synthetic'
import { FOREVER, HOUR, jolpica } from './client'
import type { JDriverStanding, JQualifying, JRace, JResult } from './types'
import { isFinish, jCode, parseLapTime } from './util'

export const LAPS_FROM = 1996
export const PITSTOPS_FROM = 2011
export const QUALIFYING_FROM = 1994

const thisYear = () => new Date().getFullYear()
export const seasonTtl = (year: number) => (year < thisYear() ? FOREVER : HOUR)

/* ---------- calendar ---------- */

export const jSchedule = (year: number) => jolpica(`${year}/races`, seasonTtl(year))

// Three-letter codes for round labels, matching OpenF1's style where it overlaps.
const COUNTRY_CODES: Record<string, string> = {
  UK: 'GBR', USA: 'USA', 'United States': 'USA', UAE: 'UAE', Spain: 'ESP', Germany: 'GER', Netherlands: 'NED', Monaco: 'MON',
  Japan: 'JPN', Portugal: 'POR', Switzerland: 'SUI', 'South Africa': 'RSA', Korea: 'KOR', Malaysia: 'MAL', Bahrain: 'BRN',
  'Saudi Arabia': 'KSA', Singapore: 'SGP', Azerbaijan: 'AZE', Austria: 'AUT', Hungary: 'HUN', Belgium: 'BEL', Italy: 'ITA',
  France: 'FRA', Canada: 'CAN', Mexico: 'MEX', Brazil: 'BRA', Argentina: 'ARG', Australia: 'AUS', China: 'CHN', India: 'IND',
  Russia: 'RUS', Turkey: 'TUR', Sweden: 'SWE', Morocco: 'MAR', Qatar: 'QAT', Vietnam: 'VIE', 'San Marino': 'SMR', Europe: 'EUR',
}
const countryCode = (c: string) => COUNTRY_CODES[c] ?? c.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()

function raceStart(r: JRace) {
  return Date.parse(`${r.date}T${r.time ?? '13:00:00Z'}`)
}

function sessionStart(r: JRace, kind: JKind) {
  const s = kind === 'qualifying' ? r.Qualifying : kind === 'sprint' ? r.Sprint : undefined
  if (s) return Date.parse(`${s.date}T${s.time ?? '13:00:00Z'}`)
  return kind === 'qualifying' ? raceStart(r) - 86400000 : raceStart(r)
}

export function kindsFor(r: JRace): JKind[] {
  const year = Number(r.season)
  const kinds: JKind[] = []
  if (year >= QUALIFYING_FROM) kinds.push('qualifying')
  if (r.Sprint) kinds.push('sprint')
  kinds.push('race')
  return kinds
}

export function synthMeeting(r: JRace): Meeting {
  const year = Number(r.season)
  return {
    meeting_key: synthMeetingKey(year, Number(r.round)),
    meeting_name: r.raceName,
    meeting_official_name: r.raceName,
    location: r.Circuit.Location.locality,
    country_code: countryCode(r.Circuit.Location.country),
    country_name: r.Circuit.Location.country,
    circuit_key: 0,
    circuit_short_name: r.Circuit.circuitName,
    date_start: new Date(sessionStart(r, kindsFor(r)[0])).toISOString(),
    date_end: new Date(raceStart(r) + 2 * HOUR).toISOString(),
    gmt_offset: '00:00:00',
    year,
  }
}

export function synthSession(r: JRace, kind: JKind): Session {
  const year = Number(r.season)
  const start = sessionStart(r, kind)
  const timed = kind === 'qualifying' ? r.Qualifying?.time : kind === 'sprint' ? r.Sprint?.time : r.time
  return {
    time_zone: CIRCUIT_TIME_ZONES[r.Circuit.circuitId],
    time_known: !!timed,
    session_key: synthSessionKey(year, Number(r.round), kind),
    session_type: kind === 'qualifying' ? 'Qualifying' : 'Race',
    session_name: SESSION_NAME[kind],
    date_start: new Date(start).toISOString(),
    date_end: new Date(start + 2 * HOUR).toISOString(),
    meeting_key: synthMeetingKey(year, Number(r.round)),
    circuit_key: 0,
    circuit_short_name: r.Circuit.Location.locality,
    country_code: countryCode(r.Circuit.Location.country),
    country_name: r.Circuit.Location.country,
    location: r.Circuit.Location.locality,
    gmt_offset: '00:00:00',
    year,
  }
}

export async function adaptMeetings(year: number): Promise<Meeting[]> {
  return (await jSchedule(year)).races.map(synthMeeting)
}

export async function adaptSessions(year: number): Promise<Session[]> {
  return (await jSchedule(year)).races.flatMap((r) => kindsFor(r).map((k) => synthSession(r, k)))
}

export async function adaptSession(year: number, round: number, kind: JKind): Promise<Session[]> {
  const r = (await jSchedule(year)).races.find((x) => Number(x.round) === round)
  return r ? [synthSession(r, kind)] : []
}

/* ---------- one session ---------- */

type Ref = { year: number; round: number; kind: JKind }
const base = (ref: Ref) => ({ session_key: synthSessionKey(ref.year, ref.round, ref.kind), meeting_key: synthMeetingKey(ref.year, ref.round) })

async function raceRows(ref: Ref): Promise<{ race?: JRace; rows: JResult[] }> {
  const path = ref.kind === 'sprint' ? 'sprint' : 'results'
  const d = await jolpica(`${ref.year}/${ref.round}/${path}`, seasonTtl(ref.year))
  const race = d.races[0]
  return { race, rows: (ref.kind === 'sprint' ? race?.SprintResults : race?.Results) ?? [] }
}

async function qualiRows(ref: Ref): Promise<JQualifying[]> {
  if (ref.year < QUALIFYING_FROM) return []
  const d = await jolpica(`${ref.year}/${ref.round}/qualifying`, seasonTtl(ref.year))
  return d.races[0]?.QualifyingResults ?? []
}

/** Car number per driverId for a weekend (race entry list, else qualifying). */
async function numberMap(ref: Ref): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  const { rows } = await raceRows({ ...ref, kind: ref.kind === 'sprint' ? 'sprint' : 'race' })
  const list: { number: string; Driver: { driverId: string } }[] = rows.length ? rows : await qualiRows(ref)
  list.forEach((r, i) => m.set(r.Driver.driverId, Number(r.number) || 900 + i))
  return m
}

function toDriver(r: JResult | JQualifying, i: number, ref: Ref, color: (id: string) => string): Driver {
  const d = r.Driver
  return {
    ...base(ref),
    driver_number: Number(r.number) || 900 + i,
    broadcast_name: `${d.givenName[0]} ${d.familyName.toUpperCase()}`,
    full_name: `${d.givenName} ${d.familyName.toUpperCase()}`,
    name_acronym: jCode(d),
    team_name: r.Constructor.name,
    team_colour: color(r.Constructor.constructorId).slice(1),
    first_name: d.givenName,
    last_name: d.familyName,
    headshot_url: null,
    country_code: null,
    driver_id: d.driverId,
  }
}

export async function adaptDrivers(ref: Ref): Promise<Driver[]> {
  const color = liveryAssigner()
  if (ref.kind === 'qualifying') {
    const q = await qualiRows(ref)
    if (q.length) return q.map((r, i) => toDriver(r, i, ref, color))
  }
  const { rows } = await raceRows(ref.kind === 'qualifying' ? { ...ref, kind: 'race' } : ref)
  return rows.map((r, i) => toDriver(r, i, ref, color))
}

function resultFlags(r: JResult) {
  const pt = r.positionText
  const dsq = pt === 'D' || pt === 'E'
  const dns = pt === 'W' || pt === 'F' || /did not (start|qualify)|withdrew/i.test(r.status)
  const dnf = !dsq && !dns && !isFinish(r.status)
  return { dsq, dns, dnf }
}

export async function adaptResults(ref: Ref): Promise<SessionResult[]> {
  if (ref.kind === 'qualifying') {
    const q = await qualiRows(ref)
    const segs = [0, 1, 2].map((i) => q.map((r) => parseLapTime([r.Q1, r.Q2, r.Q3][i])).filter((x): x is number => x !== null))
    const best = segs.map((s) => (s.length ? Math.min(...s) : null))
    return q.map((r, i) => {
      const times = [r.Q1, r.Q2, r.Q3].map(parseLapTime)
      return {
        ...base(ref),
        driver_number: Number(r.number) || 900 + i,
        position: Number(r.position),
        number_of_laps: null,
        dnf: false,
        dns: times.every((t) => t === null),
        dsq: false,
        duration: times,
        gap_to_leader: times.map((t, k) => (t !== null && best[k] !== null ? Math.round((t - best[k]!) * 1000) / 1000 : null)),
      }
    })
  }
  const { rows } = await raceRows(ref)
  const winnerSec = rows[0]?.Time?.millis ? Number(rows[0].Time.millis) / 1000 : null
  return rows.map((r, i) => {
    const flags = resultFlags(r)
    let gap: number | string | null = null
    let duration: number | null = null
    if (i === 0) {
      gap = 0
      duration = winnerSec
    } else if (r.Time?.time?.startsWith('+')) {
      gap = parseLapTime(r.Time.time.slice(1))
      duration = winnerSec !== null && gap !== null ? winnerSec + gap : null
    } else if (/^\+\d+ Laps?$/.test(r.status)) {
      gap = r.status.toUpperCase()
    }
    return {
      ...base(ref),
      driver_number: Number(r.number) || 900 + i,
      position: Number(r.position),
      number_of_laps: Number(r.laps),
      points: Number(r.points),
      ...flags,
      duration,
      gap_to_leader: gap,
    }
  })
}

export async function adaptGrid(ref: Ref): Promise<StartingGrid[]> {
  if (ref.kind === 'qualifying') return []
  const { rows } = await raceRows(ref)
  const pitLaneStart = rows.length + 1
  return rows
    .map((r, i) => ({
      ...base(ref),
      driver_number: Number(r.number) || 900 + i,
      position: Number(r.grid) || pitLaneStart,
      lap_duration: null,
    }))
    .sort((a, b) => a.position - b.position)
}

/* ---------- lap timeline (race only, 1996+) ---------- */

interface Timeline {
  laps: Lap[]
  positions: Position[]
  intervals: Interval[]
  pits: Pit[]
}

const timelines = new Map<string, Promise<Timeline>>()

function timeline(ref: Ref): Promise<Timeline> {
  const key = `${ref.year}:${ref.round}`
  let p = timelines.get(key)
  if (!p) {
    p = buildTimeline(ref).catch((e) => {
      timelines.delete(key)
      throw e
    })
    timelines.set(key, p)
  }
  return p
}

async function buildTimeline(ref: Ref): Promise<Timeline> {
  const empty: Timeline = { laps: [], positions: [], intervals: [], pits: [] }
  if (ref.kind !== 'race') return empty
  const { race, rows } = await raceRows(ref)
  if (!race) return empty
  const numbers = new Map(rows.map((r, i) => [r.Driver.driverId, Number(r.number) || 900 + i]))
  const start = raceStart(race)
  const b = base(ref)

  const jl = ref.year >= LAPS_FROM ? (await jolpica(`${ref.year}/${ref.round}/laps`, seasonTtl(ref.year))).races[0]?.Laps ?? [] : []
  const jp = ref.year >= PITSTOPS_FROM ? (await jolpica(`${ref.year}/${ref.round}/pitstops`, seasonTtl(ref.year))).races[0]?.PitStops ?? [] : []

  // Cumulative race time per driver per lap.
  const cum = new Map<number, Map<number, number>>()
  const posAt = new Map<number, Map<number, number>>()
  const sortedLaps = [...jl].sort((a, b2) => Number(a.number) - Number(b2.number))
  const running = new Map<number, number>()
  for (const lap of sortedLaps) {
    const n = Number(lap.number)
    for (const t of lap.Timings) {
      const drv = numbers.get(t.driverId)
      const sec = parseLapTime(t.time)
      if (drv === undefined || sec === null) continue
      const total = (running.get(drv) ?? 0) + sec
      running.set(drv, total)
      if (!cum.has(drv)) cum.set(drv, new Map())
      cum.get(drv)!.set(n, total)
      if (!posAt.has(n)) posAt.set(n, new Map())
      posAt.get(n)!.set(drv, Number(t.position))
    }
  }

  const pitOut = new Set(jp.map((p) => `${numbers.get(p.driverId)}:${Number(p.lap) + 1}`))
  const iso = (sec: number) => new Date(start + sec * 1000).toISOString()

  const laps: Lap[] = []
  for (const [drv, m] of cum) {
    for (const [n, total] of m) {
      const prev = n === 1 ? 0 : m.get(n - 1)
      if (prev === undefined) continue
      laps.push({
        session_key: b.session_key,
        driver_number: drv,
        lap_number: n,
        date_start: iso(prev),
        duration_sector_1: null,
        duration_sector_2: null,
        duration_sector_3: null,
        i1_speed: null,
        i2_speed: null,
        st_speed: null,
        is_pit_out_lap: pitOut.has(`${drv}:${n}`),
        lap_duration: Math.round((total - prev) * 1000) / 1000,
        segments_sector_1: null,
        segments_sector_2: null,
        segments_sector_3: null,
      })
    }
  }

  // Grid slot just before the start, then position at each lap end.
  const positions: Position[] = rows.map((r, i) => ({
    session_key: b.session_key,
    driver_number: Number(r.number) || 900 + i,
    position: Number(r.grid) || rows.length,
    date: new Date(start - 1000).toISOString(),
  }))
  const intervals: Interval[] = []
  for (const [n, byDrv] of posAt) {
    const order = [...byDrv.entries()].sort((a, b2) => a[1] - b2[1])
    const leaderCum = cum.get(order[0][0])?.get(n)
    order.forEach(([drv, pos], i) => {
      const t = cum.get(drv)?.get(n)
      if (t === undefined) return
      positions.push({ session_key: b.session_key, driver_number: drv, position: pos, date: iso(t) })
      const ahead = i > 0 ? cum.get(order[i - 1][0])?.get(n) : undefined
      intervals.push({
        session_key: b.session_key,
        driver_number: drv,
        date: iso(t),
        gap_to_leader: leaderCum !== undefined ? Math.round((t - leaderCum) * 1000) / 1000 : null,
        interval: i === 0 ? 0 : ahead !== undefined ? Math.round((t - ahead) * 1000) / 1000 : null,
      })
    })
  }

  const pits: Pit[] = jp.map((p) => {
    const drv = numbers.get(p.driverId) ?? 0
    const lapEnd = cum.get(drv)?.get(Number(p.lap))
    const dur = parseLapTime(p.duration)
    return {
      session_key: b.session_key,
      driver_number: drv,
      lap_number: Number(p.lap),
      date: lapEnd !== undefined ? iso(lapEnd) : new Date(start).toISOString(),
      pit_duration: dur,
      lane_duration: dur,
      stop_duration: null,
    }
  })

  return { laps, positions, intervals, pits }
}

export const adaptLaps = async (ref: Ref) => (await timeline(ref)).laps
export const adaptPositions = async (ref: Ref) => (await timeline(ref)).positions
export const adaptIntervals = async (ref: Ref) => (await timeline(ref)).intervals
export const adaptPits = async (ref: Ref) => (await timeline(ref)).pits

/* ---------- championship after a race ---------- */

async function standings(year: number, round: number, kind: 'driverstandings' | 'constructorstandings') {
  if (round < 1) return undefined
  return (await jolpica(`${year}/${round}/${kind}`, seasonTtl(year))).standings[0]
}

export async function adaptChampionshipDrivers(ref: Ref): Promise<ChampionshipDriver[]> {
  if (ref.kind !== 'race') return []
  const [now, before, numbers] = await Promise.all([
    standings(ref.year, ref.round, 'driverstandings'),
    standings(ref.year, ref.round - 1, 'driverstandings'),
    numberMap(ref),
  ])
  const list = (now as { DriverStandings?: JDriverStanding[] } | undefined)?.DriverStandings ?? []
  const prev = new Map(((before as { DriverStandings?: JDriverStanding[] } | undefined)?.DriverStandings ?? []).map((s) => [s.Driver.driverId, s]))
  const color = liveryAssigner()
  return list.map((s, i) => {
    const p = prev.get(s.Driver.driverId)
    const n = numbers.get(s.Driver.driverId) ?? (Number(s.Driver.permanentNumber) || 9000 + i)
    const team = s.Constructors[s.Constructors.length - 1]
    return {
      ...base(ref),
      driver_number: n,
      driver: toDriver({ number: String(n), Driver: s.Driver, Constructor: team ?? { constructorId: '', name: '' } } as JResult, i, ref, color),
      position_start: p ? Number(p.position ?? p.positionText) || null : null,
      position_current: Number(s.position ?? s.positionText) || null,
      points_start: p ? Number(p.points) : 0,
      points_current: Number(s.points),
    }
  })
}

export async function adaptChampionshipTeams(ref: Ref): Promise<ChampionshipTeam[]> {
  if (ref.kind !== 'race' || ref.year < 1958) return []
  const [now, before] = await Promise.all([
    standings(ref.year, ref.round, 'constructorstandings'),
    standings(ref.year, ref.round - 1, 'constructorstandings'),
  ])
  const list = (now as { ConstructorStandings?: { Constructor: { constructorId: string; name: string }; position?: string; positionText: string; points: string }[] } | undefined)?.ConstructorStandings ?? []
  const prevList = (before as typeof now)?.ConstructorStandings ?? []
  const prev = new Map(prevList.map((s: any) => [s.Constructor.constructorId, s]))
  return list.map((s) => {
    const p: any = prev.get(s.Constructor.constructorId)
    return {
      ...base(ref),
      team_name: s.Constructor.name,
      position_start: p ? Number(p.position ?? p.positionText) || null : null,
      position_current: Number(s.position ?? s.positionText) || null,
      points_start: p ? Number(p.points) : 0,
      points_current: Number(s.points),
    }
  })
}

/* ---------- whole season ---------- */

async function seasonRaces(year: number, withQualifying = false) {
  const [res, spr, qual] = await Promise.all([
    jolpica(`${year}/results`, seasonTtl(year)),
    jolpica(`${year}/sprint`, seasonTtl(year)),
    withQualifying && year >= QUALIFYING_FROM ? jolpica(`${year}/qualifying`, seasonTtl(year)) : Promise.resolve(null),
  ])
  return { res: res.races, spr: spr.races, qual: qual?.races ?? [] }
}

export async function adaptSeasonResults(year: number): Promise<SessionResult[]> {
  const { res, spr, qual } = await seasonRaces(year, true)
  const numbering = seasonNumbering([...res.map((r) => r.Results ?? []), ...spr.map((r) => r.SprintResults ?? [])])
  const out: SessionResult[] = []
  for (const r of res) out.push(...adaptResultsFromRace(r, 'race', numbering))
  for (const r of spr) out.push(...adaptResultsFromRace(r, 'sprint', numbering))
  for (const r of qual) {
    const ref = { year, round: Number(r.round), kind: 'qualifying' as const }
    out.push(
      ...(r.QualifyingResults ?? []).map((q, i) => ({
        ...base(ref),
        driver_number: numbering.get(q.Driver.driverId) ?? (Number(q.number) || 900 + i),
        position: Number(q.position),
        number_of_laps: null,
        dnf: false,
        dns: false,
        dsq: false,
        duration: [q.Q1, q.Q2, q.Q3].map(parseLapTime),
        gap_to_leader: null,
      })),
    )
  }
  return out
}

function adaptResultsFromRace(r: JRace, kind: 'race' | 'sprint', numbering: Map<string, number>): SessionResult[] {
  const ref = { year: Number(r.season), round: Number(r.round), kind }
  const rows = (kind === 'sprint' ? r.SprintResults : r.Results) ?? []
  return rows.map((x, i) => ({
    ...base(ref),
    driver_number: numbering.get(x.Driver.driverId) ?? (Number(x.number) || 900 + i),
    position: Number(x.position),
    number_of_laps: Number(x.laps),
    points: Number(x.points),
    ...resultFlags(x),
    duration: null,
    gap_to_leader: null,
  }))
}

export async function adaptSeasonDrivers(year: number): Promise<Driver[]> {
  const { res, spr } = await seasonRaces(year)
  const numbering = seasonNumbering([...res.map((r) => r.Results ?? []), ...spr.map((r) => r.SprintResults ?? [])])
  const color = liveryAssigner()
  const out: Driver[] = []
  const add = (x: JResult, i: number, ref: Ref) => {
    const n = numbering.get(x.Driver.driverId)
    out.push(toDriver(n ? { ...x, number: String(n) } : x, i, ref, color))
  }
  for (const r of res) (r.Results ?? []).forEach((x, i) => add(x, i, { year, round: Number(r.round), kind: 'race' }))
  for (const r of spr) (r.SprintResults ?? []).forEach((x, i) => add(x, i, { year, round: Number(r.round), kind: 'sprint' }))
  return out
}

/**
 * Championship progression per race, accumulated from race + sprint points as scored.
 * The final round uses Jolpica's official standings (which apply dropped-score rules).
 */
/**
 * One number per driver for a whole season. Car numbers weren't personal before 2014, so a
 * stand-in can share a number with the regular driver: the driver who used a number most
 * keeps it, and anyone else whose usual number is taken gets a unique 9000+ number.
 */
function seasonNumbering(races: JResult[][]): Map<string, number> {
  const uses = new Map<string, Map<number, number>>()
  for (const rows of races)
    for (const x of rows) {
      const n = Number(x.number) || 0
      const m = uses.get(x.Driver.driverId) ?? new Map<number, number>()
      m.set(n, (m.get(n) ?? 0) + 1)
      uses.set(x.Driver.driverId, m)
    }
  const usual = new Map<string, { n: number; count: number }>()
  for (const [id, m] of uses) {
    const [n, count] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
    usual.set(id, { n, count })
  }
  const owner = new Map<number, string>()
  for (const [id, u] of usual) {
    const cur = owner.get(u.n)
    if (!cur || usual.get(cur)!.count < u.count) owner.set(u.n, id)
  }
  const out = new Map<string, number>()
  let extra = 9000
  for (const [id, u] of usual) out.set(id, owner.get(u.n) === id && u.n ? u.n : extra++)
  return out
}

/**
 * Championship progression per race, accumulated by driver from race + sprint points as
 * scored. The final round uses Jolpica's official standings (dropped-score rules, countback).
 */
async function seasonChampionship(year: number) {
  const [{ res, spr }, finalD, finalC] = await Promise.all([
    seasonRaces(year),
    jolpica(`${year}/driverstandings`, seasonTtl(year)),
    year >= 1958 ? jolpica(`${year}/constructorstandings`, seasonTtl(year)) : Promise.resolve(null),
  ])
  const rounds = [...new Set(res.map((r) => Number(r.round)))].sort((a, b) => a - b)
  const sprintBy = new Map(spr.map((r) => [Number(r.round), r.SprintResults ?? []]))
  const raceBy = new Map(res.map((r) => [Number(r.round), r.Results ?? []]))
  const numbering = seasonNumbering([...raceBy.values(), ...sprintBy.values()])
  const color = liveryAssigner()

  const dPts = new Map<string, number>()
  const dWins = new Map<string, number>()
  const latest = new Map<string, JResult>()
  const tPts = new Map<string, number>()
  const drivers: ChampionshipDriver[] = []
  const teams: ChampionshipTeam[] = []
  let prevDRank = new Map<string, number>()
  let prevTRank = new Map<string, number>()
  const lastRound = rounds[rounds.length - 1]
  const officialD = finalD.standings[0]?.DriverStandings ?? []
  const officialC = finalC?.standings[0]?.ConstructorStandings ?? []

  for (const round of rounds) {
    const ref = { year, round, kind: 'race' as const }
    const startD = new Map(dPts)
    const startT = new Map(tPts)
    for (const x of [...(raceBy.get(round) ?? []), ...(sprintBy.get(round) ?? [])]) {
      const id = x.Driver.driverId
      latest.set(id, x)
      dPts.set(id, (dPts.get(id) ?? 0) + Number(x.points))
      tPts.set(x.Constructor.name, (tPts.get(x.Constructor.name) ?? 0) + Number(x.points))
    }
    const winner = raceBy.get(round)?.[0]
    if (winner) dWins.set(winner.Driver.driverId, (dWins.get(winner.Driver.driverId) ?? 0) + 1)

    let dRank: Map<string, number>
    let tRank: Map<string, number>
    if (round === lastRound && officialD.length) {
      for (const st of officialD) dPts.set(st.Driver.driverId, Number(st.points))
      dRank = new Map(officialD.map((st, i) => [st.Driver.driverId, Number(st.position) || i + 1]))
      for (const id of dPts.keys()) if (!dRank.has(id)) dRank.set(id, dRank.size + 1)
    } else {
      dRank = new Map([...dPts.entries()].sort((a, b) => b[1] - a[1] || (dWins.get(b[0]) ?? 0) - (dWins.get(a[0]) ?? 0)).map(([id], i) => [id, i + 1]))
    }
    if (round === lastRound && officialC.length) {
      for (const st of officialC) tPts.set(st.Constructor.name, Number(st.points))
      tRank = new Map(officialC.map((st, i) => [st.Constructor.name, Number(st.position) || i + 1]))
    } else {
      tRank = new Map([...tPts.entries()].sort((a, b) => b[1] - a[1]).map(([n], i) => [n, i + 1]))
    }

    for (const [id, pts] of dPts) {
      const n = numbering.get(id) ?? 0
      const row = latest.get(id)!
      drivers.push({
        ...base(ref),
        driver_number: n,
        driver: toDriver({ ...row, number: String(n) }, 0, ref, color),
        points_start: startD.get(id) ?? 0,
        points_current: pts,
        position_start: prevDRank.get(id) ?? null,
        position_current: dRank.get(id) ?? null,
      })
    }
    if (year >= 1958)
      for (const [name, pts] of tPts)
        teams.push({ ...base(ref), team_name: name, points_start: startT.get(name) ?? 0, points_current: pts, position_start: prevTRank.get(name) ?? null, position_current: tRank.get(name) ?? null })
    prevDRank = dRank
    prevTRank = tRank
  }
  return { drivers, teams }
}

export const adaptSeasonChampionshipDrivers = async (year: number) => (await seasonChampionship(year)).drivers
export const adaptSeasonChampionshipTeams = async (year: number) => (await seasonChampionship(year)).teams

/** The Jolpica round whose race weekend contains this date (within 4 days of race day). */
export async function roundForDate(year: number, isoDate: string): Promise<number | null> {
  const t = Date.parse(isoDate)
  const r = (await jSchedule(year)).races.find((x) => Math.abs(Date.parse(x.date) - t) < 4 * 86400000)
  return r ? Number(r.round) : null
}
