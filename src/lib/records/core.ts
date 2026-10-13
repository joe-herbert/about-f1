import type { RDriver, REntry, RRace, Records } from '../../api/records/types'
import { Flag, Status } from '../../api/records/types'

/** One line of a record table. */
export interface Row {
  key: string
  /** Driver the row is about (drives the nationality and active filters) */
  d?: number
  /** Constructor used for the row's colour */
  t?: number
  label: string
  /** What the table sorts by */
  value: number
  display: string
  detail?: string
  /** Breaks ties: earlier first */
  date?: string
}

export interface RecordDef {
  id: string
  label: string
  help?: string
  /** Smaller values rank higher (ages, grid slots) */
  asc?: boolean
  /** Draw bars for the values; off for dates and other non-quantities */
  bars?: boolean
  /** Rows are drivers (filters by nationality/active apply) */
  perDriver?: boolean
  /** First season with the data this record needs */
  dataFrom?: number
  /** Header for the value column */
  valueLabel?: string
  compute: (ctx: Ctx) => Row[]
}

export interface Ctx {
  r: Records
  races: RRace[]
  from: number
  to: number
  minStarts: number
  /** Grand Prix entries per driver, chronological, within the range */
  gp: Map<number, REntry[]>
  /** Sprint entries per driver */
  sprint: Map<number, REntry[]>
  /** Season -> champion driver, for completed seasons */
  champion: Map<number, number>
  /** The race index that follows `i` in the range, skipping the Indianapolis 500 (1950–60) */
  nextRace: (i: number) => number
  latestSeason: number
}

const NOT_STARTED = new Set<number>([Status.DNS, Status.DNQ, Status.DNPQ, Status.DNP])
export const started = (e: REntry) => !NOT_STARTED.has(e.status)
export const classified = (e: REntry) => e.status === Status.Classified && e.pos > 0
export const win = (e: REntry) => classified(e) && e.pos === 1
export const podium = (e: REntry) => classified(e) && e.pos <= 3
export const pole = (e: REntry) => (e.flags & Flag.Pole) !== 0
export const fastest = (e: REntry) => (e.flags & Flag.Fastest) !== 0
export const isIndy = (race: RRace) => race.gp.id === 'indianapolis'

export function buildCtx(r: Records, from: number, to: number, minStarts: number): Ctx {
  const races = r.races.filter((x) => x.season >= from && x.season <= to)
  const gp = new Map<number, REntry[]>()
  const sprint = new Map<number, REntry[]>()
  const push = (m: Map<number, REntry[]>, e: REntry) => {
    const list = m.get(e.d)
    if (list) list.push(e)
    else m.set(e.d, [e])
  }
  for (const race of races) {
    for (const e of race.results) push(gp, e)
    for (const e of race.sprint) push(sprint, e)
  }
  const champion = new Map<number, number>()
  for (const s of r.seasons.values()) {
    const c = s.drivers.find((d) => d.champion)
    if (c && s.over) champion.set(s.year, c.d)
  }
  const next = new Map<number, number>()
  const main = races.filter((x) => !isIndy(x))
  for (let k = 0; k < main.length - 1; k++) next.set(main[k].i, main[k + 1].i)
  return {
    r,
    races,
    from,
    to,
    minStarts,
    gp,
    sprint,
    champion,
    nextRace: (i) => next.get(i) ?? -1,
    latestSeason: r.races.at(-1)?.season ?? to,
  }
}

/* ---------- formatting ---------- */

const DAY = 86400000

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

/** Whole years and remaining days from `dob` to `date`. */
export function age(dob: string, date: string) {
  const [by, bm, bd] = dob.split('-').map(Number)
  const [y, m, d] = date.split('-').map(Number)
  let years = y - by
  if (m < bm || (m === bm && d < bd)) years--
  const anniversary = `${by + years}-${String(bm).padStart(2, '0')}-${String(bd).padStart(2, '0')}`
  return { years, days: daysBetween(anniversary, date), total: daysBetween(dob, date) }
}

export const fmtAge = (dob: string, date: string) => {
  const a = age(dob, date)
  return `${a.years}y ${a.days}d`
}

export function fmtDays(n: number) {
  const y = Math.floor(n / 365.25)
  const d = Math.round(n - y * 365.25)
  return y ? `${y}y ${d}d` : `${d}d`
}

export const fmtNum = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { maximumFractionDigits: 2 }))
export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`

export const shortGp = (name: string) => name.replace(/Grand Prix/, 'GP')
export const raceLabel = (race: RRace) => `${race.season} ${shortGp(race.gp.name)}`

export const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** The constructor a driver raced most often among `entries`. */
export function mainTeam(entries: REntry[]): number | undefined {
  const n = new Map<number, number>()
  for (const e of entries) n.set(e.t, (n.get(e.t) ?? 0) + 1)
  let best: number | undefined
  let max = 0
  for (const [t, c] of n) if (c > max) [best, max] = [t, c]
  return best
}

/** Collapses a sorted list of years into "1950–53, 1957". */
export function yearList(years: number[]) {
  const ys = [...new Set(years)].sort((a, b) => a - b)
  const out: string[] = []
  for (let k = 0; k < ys.length; k++) {
    let j = k
    while (ys[j + 1] === ys[j] + 1) j++
    out.push(j > k ? `${ys[k]}–${ys[j]}` : String(ys[k]))
    k = j
  }
  return out.join(', ')
}

export const driverName = (ctx: Ctx, d: number) => ctx.r.drivers[d]?.name ?? '?'
export const teamName = (ctx: Ctx, t: number) => ctx.r.teams[t]?.name ?? '?'

export function driverRow(ctx: Ctx, d: number, value: number, display: string, extra: Partial<Row> = {}): Row {
  return { key: `d${d}`, d, label: driverName(ctx, d), value, display, ...extra }
}

/** Drivers whose most recent start is in the latest season. */
export function activeDrivers(ctx: Ctx): Set<number> {
  const out = new Set<number>()
  for (const race of ctx.r.races) if (race.season === ctx.latestSeason) for (const e of race.results) if (started(e)) out.add(e.d)
  return out
}

export type { RDriver }
