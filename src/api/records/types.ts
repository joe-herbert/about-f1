// Every championship Grand Prix and sprint since 1950, baked by scripts/bake-records.ts.
// The JSON is positional to keep it small; `decode` (load.ts) turns it into the objects below.

/** [f1dbId, jolpicaId, name, dateOfBirth, dateOfDeath, nationality (ISO alpha-3), female] */
export type RawDriver = [string, string | null, string, string | null, string | null, string | null, 0 | 1]
/** [f1dbId, jolpicaId, name] */
export type RawTeam = [string, string | null, string]
/** [id, name] */
export type RawEngine = [string, string]
/** [id, name, country (ISO alpha-3), Jolpica id (circuits only)] */
export type RawPlace = [string, string, string, string?]
/** [driver, team, engine, position (0 = none), status, grid (0 = pit lane/none), qualifying, points, laps, flags, laps led (-1 = no lap data)] */
export type RawEntry = [number, number, number, number, number, number, number, number, number, number, number]
/** [season, round, date, grandPrix, circuit, laps, lap length km, championship leaders after the race, race entries, sprint entries] */
export type RawRace = [number, number, string, number, number, number, number, number[], RawEntry[], RawEntry[]]
/** Final standings: d = [driver, position, points, champion], t = [team, engine, position, points, champion] */
export interface RawSeason {
  n: number
  d: [number, number, number, 0 | 1][]
  t: [number, number, number, number, 0 | 1][]
}

export interface RawRecords {
  source: string
  /** Date of the last race in the file */
  through: string
  drivers: RawDriver[]
  teams: RawTeam[]
  engines: RawEngine[]
  gps: RawPlace[]
  circuits: RawPlace[]
  seasons: Record<string, RawSeason>
  races: RawRace[]
  /** Test or third drivers who never entered a race: [name, dateOfBirth, nationality] */
  tests: [string, string | null, string | null][]
  /** [driver, driver, relation of the second to the first] */
  family: [number, number, string][]
}

/* ---------- decoded ---------- */

export const Status = { Classified: 0, DNF: 1, DNS: 2, DNQ: 3, DNPQ: 4, NC: 5, DSQ: 6, EX: 7, DNP: 8 } as const

export const Flag = { Pole: 1, Fastest: 2, Slam: 4, Shared: 8, LeadLap: 16, DriverOfTheDay: 32 } as const

export interface RDriver {
  i: number
  id: string
  jid: string | null
  name: string
  dob: string | null
  dod: string | null
  nat: string | null
  female: boolean
}

export interface RTeam {
  i: number
  id: string
  jid: string | null
  name: string
}

export interface RPlace {
  i: number
  id: string
  name: string
  country: string
  jid?: string
}

export interface REntry {
  race: RRace
  sprint: boolean
  d: number
  t: number
  e: number
  pos: number
  status: number
  grid: number
  quali: number
  pts: number
  laps: number
  flags: number
  /** null when there's no lap-by-lap data for the race */
  led: number | null
}

export interface RRace {
  /** Chronological index */
  i: number
  season: number
  round: number
  date: string
  gp: RPlace
  circuit: RPlace
  laps: number
  km: number
  leaders: number[]
  results: REntry[]
  sprint: REntry[]
  /** Added from the Jolpica API after the bake */
  live: boolean
}

export interface RSeason {
  year: number
  /** Rounds on the calendar */
  rounds: number
  /** Final standings (or latest, while the season runs) */
  drivers: { d: number; pos: number; pts: number; champion: boolean }[]
  teams: { t: number; e: number; pos: number; pts: number; champion: boolean }[]
  /** Every round has been run */
  over: boolean
}

export interface Records {
  source: string
  through: string
  drivers: RDriver[]
  teams: RTeam[]
  engines: { i: number; id: string; name: string }[]
  gps: RPlace[]
  circuits: RPlace[]
  races: RRace[]
  seasons: Map<number, RSeason>
  tests: { name: string; dob: string | null; nat: string | null }[]
  family: { a: number; b: number; type: string }[]
}
