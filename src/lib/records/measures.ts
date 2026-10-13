// Generic records: any per-race statistic ("metric") measured any of ~30 ways
// (total, youngest, longest streak, most in a season, at one Grand Prix...).

import type { REntry } from '../../api/records/types'
import {
  type Ctx,
  type RecordDef,
  type Row,
  age,
  daysBetween,
  driverName,
  driverRow,
  fmtAge,
  fmtDate,
  fmtDays,
  fmtNum,
  fmtPct,
  mainTeam,
  raceLabel,
  started,
  teamName,
  yearList,
} from './core'

export interface Metric {
  id: string
  title: string
  /** Plural noun for descriptions: "wins", "laps led" */
  noun: string
  sprint?: boolean
  /** Summed per race (points, laps); otherwise each race counts once when `test` passes */
  weight?: (e: REntry, ctx: Ctx) => number
  test?: (e: REntry, ctx: Ctx) => boolean
  /** Entries that count as chances (default: race starts) */
  pool?: (e: REntry) => boolean
  fmt?: (n: number) => string
  dataFrom?: number
  /** At most one driver per race achieves it (wins, poles) */
  single?: boolean
  /** A streak breaks when the driver misses a race, not just when they fail */
  strictStreak?: boolean
  /** Measure ids that don't make sense here */
  skip?: string[]
  /** Name for the chances in details: "starts" */
  chances?: string
  /** Counts taking part (starts, entries) rather than achieving something */
  participation?: boolean
}

export const value = (m: Metric, e: REntry, ctx: Ctx) => (m.weight ? m.weight(e, ctx) : m.test!(e, ctx) ? 1 : 0)
const fmtOf = (m: Metric) => m.fmt ?? fmtNum

/** Each driver's entries for the metric, in race order. */
function streams(m: Metric, ctx: Ctx): [number, REntry[]][] {
  const pool = m.pool ?? started
  const src = m.sprint ? ctx.sprint : ctx.gp
  const out: [number, REntry[]][] = []
  for (const [d, list] of src) {
    const s = list.filter(pool)
    if (s.length) out.push([d, s])
  }
  return out
}

function hitsOf(m: Metric, ctx: Ctx, s: REntry[]) {
  return s.filter((e) => value(m, e, ctx) > 0)
}

const sum = (m: Metric, ctx: Ctx, s: REntry[]) => s.reduce((a, e) => a + value(m, e, ctx), 0)

/** Groups entries by a key and sums the metric per group. */
function byKey<K>(m: Metric, ctx: Ctx, s: REntry[], key: (e: REntry) => K) {
  const out = new Map<K, { total: number; entries: REntry[] }>()
  for (const e of s) {
    const v = value(m, e, ctx)
    if (v <= 0) continue
    const k = key(e)
    const g = out.get(k) ?? { total: 0, entries: [] }
    g.total += v
    g.entries.push(e)
    out.set(k, g)
  }
  return out
}

/** Longest run of consecutive entries passing `hit`. */
function longestRun(s: REntry[], hit: (e: REntry) => boolean, ctx: Ctx, strict: boolean) {
  let best = { n: 0, a: s[0], b: s[0] }
  let n = 0
  let start = s[0]
  let prev: REntry | undefined
  for (const e of s) {
    const contiguous = !strict || !prev || ctx.nextRace(prev.race.i) === e.race.i
    if (!hit(e) || !contiguous) n = 0
    if (hit(e)) {
      if (n === 0) start = e
      n++
      if (n > best.n) best = { n, a: start, b: e }
    }
    prev = e
  }
  return best
}

const span = (a: REntry, b: REntry) => (a === b ? raceLabel(a.race) : `${raceLabel(a.race)} – ${raceLabel(b.race)}`)
const names = (list: string[], max = 4) => (list.length > max ? `${list.slice(0, max).join(', ')} +${list.length - max}` : list.join(', '))

export interface Measure {
  id: string
  label: string
  help: (m: Metric) => string
  asc?: boolean
  bars?: boolean
  perDriver?: boolean
  valueLabel?: string
  compute: (m: Metric, ctx: Ctx) => Row[]
}

export const MEASURES: Measure[] = [
  {
    id: 'total',
    label: 'By number',
    help: (m) => `Most ${m.noun}.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const hits = hitsOf(m, ctx, s)
        const total = sum(m, ctx, s)
        if (total <= 0) return []
        const chances = `${s.length} ${m.chances ?? 'starts'}`
        const detail = m.participation
          ? `${s[0].race.season}–${s.at(-1)!.race.season}`
          : m.weight
            ? `${chances} · ${fmtNum(Math.round((total / s.length) * 100) / 100)} per start`
            : `${chances} · ${fmtPct(hits.length / s.length)}`
        return [driverRow(ctx, d, total, fmtOf(m)(total), { t: mainTeam(hits), detail })]
      }),
  },
  {
    id: 'rate',
    label: 'Per start',
    help: (m) => (m.weight ? `Most ${m.noun} per start (minimum starts set in the panel settings).` : `Highest share of starts ending in ${m.noun} (minimum starts set in the panel settings).`),
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const total = sum(m, ctx, s)
        if (total <= 0 || s.length < ctx.minStarts) return []
        const r = total / s.length
        return [driverRow(ctx, d, r, m.weight ? fmtNum(Math.round(r * 100) / 100) : fmtPct(r), { t: mainTeam(s), detail: `${fmtOf(m)(total)} from ${s.length} ${m.chances ?? 'starts'}` })]
      }),
  },
  {
    id: 'youngest',
    label: 'Youngest',
    help: (m) => `Youngest drivers at their first of these (${m.noun}).`,
    asc: true,
    perDriver: true,
    valueLabel: 'Age',
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const dob = ctx.r.drivers[d].dob
        const e = s.find((x) => value(m, x, ctx) > 0)
        if (!dob || !e) return []
        return [driverRow(ctx, d, age(dob, e.race.date).total, fmtAge(dob, e.race.date), { t: e.t, detail: raceLabel(e.race), date: e.race.date })]
      }),
  },
  {
    id: 'oldest',
    label: 'Oldest',
    help: (m) => `Oldest drivers at their last of these (${m.noun}).`,
    perDriver: true,
    valueLabel: 'Age',
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const dob = ctx.r.drivers[d].dob
        const e = s.findLast((x) => value(m, x, ctx) > 0)
        if (!dob || !e) return []
        return [driverRow(ctx, d, age(dob, e.race.date).total, fmtAge(dob, e.race.date), { t: e.t, detail: raceLabel(e.race), date: e.race.date })]
      }),
  },
  {
    id: 'streak',
    label: 'Consecutive',
    help: (m) => `Longest unbroken run of ${m.sprint ? 'sprints' : 'races'} with ${m.noun}${m.strictStreak ? ', without missing a race' : ''}.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const run = longestRun(s, (e) => value(m, e, ctx) > 0, ctx, !!m.strictStreak)
        if (run.n < 2) return []
        return [driverRow(ctx, d, run.n, String(run.n), { t: run.a.t, detail: span(run.a, run.b), date: run.a.race.date })]
      }),
  },
  {
    id: 'opener',
    label: 'Consecutive from the season opener',
    help: (m) => `Longest run of ${m.noun} starting at the first round of a season.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        let best = { n: 0, e: s[0], last: s[0] }
        for (let k = 0; k < s.length; k++) {
          if (s[k].race.round !== 1) continue
          let n = 0
          while (k + n < s.length && s[k + n].race.season === s[k].race.season && value(m, s[k + n], ctx) > 0) n++
          if (n > best.n) best = { n, e: s[k], last: s[k + n - 1] }
        }
        if (best.n < 2) return []
        return [driverRow(ctx, d, best.n, String(best.n), { t: best.e.t, detail: span(best.e, best.last), date: best.e.race.date })]
      }),
  },
  {
    id: 'season',
    label: 'Most in a season',
    help: (m) => `Most ${m.noun} in a single season.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) =>
        [...byKey(m, ctx, s, (e) => e.race.season)].map(([season, g]) => {
          const inSeason = s.filter((e) => e.race.season === season).length
          return driverRow(ctx, d, g.total, fmtOf(m)(g.total), {
            key: `d${d}-${season}`,
            t: mainTeam(g.entries),
            detail: `${season}, ${teamName(ctx, mainTeam(g.entries)!)} · ${inSeason} ${m.chances ?? 'starts'}`,
            date: g.entries[0].race.date,
          })
        }),
      ),
  },
  {
    id: 'seasons',
    label: 'Seasons with one',
    help: (m) => `Most seasons with at least one of these (${m.noun}).`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const years = [...byKey(m, ctx, s, (e) => e.race.season).keys()]
        if (!years.length) return []
        return [driverRow(ctx, d, years.length, String(years.length), { t: mainTeam(hitsOf(m, ctx, s)), detail: yearList(years) })]
      }),
  },
  {
    id: 'consecSeasons',
    label: 'Consecutive seasons',
    help: (m) => `Most consecutive seasons with at least one of these (${m.noun}).`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const years = [...byKey(m, ctx, s, (e) => e.race.season).keys()].sort((a, b) => a - b)
        let best = { n: 0, from: 0 }
        let n = 0
        for (let k = 0; k < years.length; k++) {
          n = k > 0 && years[k] === years[k - 1] + 1 ? n + 1 : 1
          if (n > best.n) best = { n, from: years[k] - n + 1 }
        }
        if (best.n < 2) return []
        return [driverRow(ctx, d, best.n, String(best.n), { t: mainTeam(hitsOf(m, ctx, s)), detail: `${best.from}–${best.from + best.n - 1}` })]
      }),
  },
  {
    id: 'before',
    label: 'Starts before the first',
    help: (m) => `Most ${m.chances ?? 'starts'} before the first of these (${m.noun}).`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const k = s.findIndex((e) => value(m, e, ctx) > 0)
        if (k < 1) return []
        return [driverRow(ctx, d, k, String(k), { t: s[k].t, detail: `First: ${raceLabel(s[k].race)}` })]
      }),
  },
  {
    id: 'without',
    label: 'Starts without one',
    help: (m) => `Most ${m.chances ?? 'starts'} without ever scoring any ${m.noun}.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        if (sum(m, ctx, s) > 0) return []
        return [driverRow(ctx, d, s.length, String(s.length), { t: mainTeam(s), detail: `${s[0].race.season}–${s.at(-1)!.race.season}` })]
      }),
  },
  {
    id: 'gap',
    label: 'Longest gap between two',
    help: (m) => `Longest wait between two consecutive ${m.noun}.`,
    perDriver: true,
    valueLabel: 'Interval',
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const hits = hitsOf(m, ctx, s)
        let best: { n: number; a: REntry; b: REntry } | null = null
        for (let k = 1; k < hits.length; k++) {
          const n = daysBetween(hits[k - 1].race.date, hits[k].race.date)
          if (!best || n > best.n) best = { n, a: hits[k - 1], b: hits[k] }
        }
        if (!best) return []
        const between = s.filter((e) => e.race.i > best.a.race.i && e.race.i < best.b.race.i).length
        return [driverRow(ctx, d, best.n, fmtDays(best.n), { t: best.b.t, detail: m.participation ? span(best.a, best.b) : `${span(best.a, best.b)} · ${between} ${m.chances ?? 'starts'} between` })]
      }),
  },
  {
    id: 'span',
    label: 'First to last',
    help: (m) => `Longest time between a driver’s first and last ${m.noun}.`,
    perDriver: true,
    valueLabel: 'Interval',
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const hits = hitsOf(m, ctx, s)
        if (hits.length < 2) return []
        const n = daysBetween(hits[0].race.date, hits.at(-1)!.race.date)
        return [driverRow(ctx, d, n, fmtDays(n), { t: mainTeam(hits), detail: span(hits[0], hits.at(-1)!) })]
      }),
  },
  {
    id: 'team',
    label: 'With one constructor',
    help: (m) => `Most ${m.noun} with one constructor.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) =>
        [...byKey(m, ctx, s, (e) => e.t)].map(([t, g]) =>
          driverRow(ctx, d, g.total, fmtOf(m)(g.total), { key: `d${d}-t${t}`, t, detail: `${teamName(ctx, t)} · ${yearList(g.entries.map((e) => e.race.season))}` }),
        ),
      ),
  },
  {
    id: 'teams',
    label: 'Different constructors',
    help: (m) => `Most constructors a driver has scored ${m.noun} with.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const g = byKey(m, ctx, s, (e) => e.t)
        if (!g.size) return []
        return [driverRow(ctx, d, g.size, String(g.size), { t: mainTeam(hitsOf(m, ctx, s)), detail: names([...g.keys()].map((t) => teamName(ctx, t))) })]
      }),
  },
  {
    id: 'engine',
    label: 'With one engine maker',
    help: (m) => `Most ${m.noun} with one engine maker.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) =>
        [...byKey(m, ctx, s, (e) => e.e)].map(([en, g]) =>
          driverRow(ctx, d, g.total, fmtOf(m)(g.total), { key: `d${d}-e${en}`, t: mainTeam(g.entries), detail: `${ctx.r.engines[en]?.name} · ${yearList(g.entries.map((e) => e.race.season))}` }),
        ),
      ),
  },
  {
    id: 'engines',
    label: 'Different engine makers',
    help: (m) => `Most engine makers a driver has scored ${m.noun} with.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const g = byKey(m, ctx, s, (e) => e.e)
        if (!g.size) return []
        return [driverRow(ctx, d, g.size, String(g.size), { t: mainTeam(hitsOf(m, ctx, s)), detail: names([...g.keys()].map((en) => ctx.r.engines[en]?.name ?? '?')) })]
      }),
  },
  {
    id: 'gp',
    label: 'At one Grand Prix',
    help: (m) => `Most ${m.noun} at one Grand Prix.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) =>
        [...byKey(m, ctx, s, (e) => e.race.gp)].map(([gp, g]) =>
          driverRow(ctx, d, g.total, fmtOf(m)(g.total), { key: `d${d}-g${gp.i}`, t: mainTeam(g.entries), detail: `${gp.name} · ${yearList(g.entries.map((e) => e.race.season))}` }),
        ),
      ),
  },
  {
    id: 'gpStreak',
    label: 'Consecutive at one Grand Prix',
    help: (m) => `Longest run of ${m.noun} at one Grand Prix, in consecutive editions the driver started.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const gps = new Map<number, REntry[]>()
        for (const e of s) gps.set(e.race.gp.i, [...(gps.get(e.race.gp.i) ?? []), e])
        return [...gps.values()].flatMap((list) => {
          const run = longestRun(list, (e) => value(m, e, ctx) > 0, ctx, false)
          if (run.n < 2) return []
          return [driverRow(ctx, d, run.n, String(run.n), { key: `d${d}-g${list[0].race.gp.i}`, t: run.a.t, detail: `${list[0].race.gp.name} · ${run.a.race.season}–${run.b.race.season}` })]
        })
      }),
  },
  {
    id: 'gps',
    label: 'Different Grands Prix',
    help: (m) => `Most different Grands Prix a driver has scored ${m.noun} at.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const g = byKey(m, ctx, s, (e) => e.race.gp.i)
        if (!g.size) return []
        return [driverRow(ctx, d, g.size, String(g.size), { t: mainTeam(hitsOf(m, ctx, s)) })]
      }),
  },
  {
    id: 'circuit',
    label: 'At one circuit',
    help: (m) => `Most ${m.noun} at one circuit.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) =>
        [...byKey(m, ctx, s, (e) => e.race.circuit)].map(([c, g]) =>
          driverRow(ctx, d, g.total, fmtOf(m)(g.total), { key: `d${d}-c${c.i}`, t: mainTeam(g.entries), detail: `${c.name} · ${yearList(g.entries.map((e) => e.race.season))}` }),
        ),
      ),
  },
  {
    id: 'circuits',
    label: 'Different circuits',
    help: (m) => `Most different circuits a driver has scored ${m.noun} at.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const g = byKey(m, ctx, s, (e) => e.race.circuit.i)
        if (!g.size) return []
        return [driverRow(ctx, d, g.size, String(g.size), { t: mainTeam(hitsOf(m, ctx, s)) })]
      }),
  },
  {
    id: 'home',
    label: 'At their home Grand Prix',
    help: (m) => `Most ${m.noun} at the Grand Prix of the driver’s own country.`,
    perDriver: true,
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const nat = ctx.r.drivers[d].nat
        const home = s.filter((e) => nat && e.race.gp.country === nat)
        const total = sum(m, ctx, home)
        if (total <= 0) return []
        return [driverRow(ctx, d, total, fmtOf(m)(total), { t: mainTeam(hitsOf(m, ctx, home)), detail: `${home.length} home ${m.chances ?? 'starts'} · ${names([...new Set(home.map((e) => e.race.gp.name))], 2)}` })]
      }),
  },
  {
    id: 'first',
    label: 'Chronology of firsts',
    help: (m) => `Every driver’s first ${m.noun}, newest first.`,
    perDriver: true,
    bars: false,
    valueLabel: 'Date',
    compute: (m, ctx) => {
      const firsts = streams(m, ctx).flatMap(([d, s]) => {
        const e = s.find((x) => value(m, x, ctx) > 0)
        return e ? [{ d, e }] : []
      })
      firsts.sort((a, b) => a.e.race.i - b.e.race.i)
      return firsts.map(({ d, e }, k) => driverRow(ctx, d, e.race.i, fmtDate(e.race.date), { t: e.t, detail: `#${k + 1} · ${raceLabel(e.race)}` }))
    },
  },
  {
    id: 'last',
    label: 'Most recent',
    help: (m) => `Every driver’s most recent ${m.noun}, newest first.`,
    perDriver: true,
    bars: false,
    valueLabel: 'Date',
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const e = s.findLast((x) => value(m, x, ctx) > 0)
        return e ? [driverRow(ctx, d, e.race.i, fmtDate(e.race.date), { t: e.t, detail: raceLabel(e.race) })] : []
      }),
  },
  {
    id: 'record',
    label: 'Record progression',
    help: (m) => `Each time a new driver took the record for most ${m.noun}, newest first.`,
    bars: false,
    valueLabel: 'Date',
    compute: (m, ctx) => {
      const totals = new Map<number, number>()
      let best = 0
      let holder = -1
      const rows: Row[] = []
      const pool = m.pool ?? started
      for (const race of ctx.races) {
        for (const e of m.sprint ? race.sprint : race.results) {
          if (!pool(e)) continue
          const v = value(m, e, ctx)
          if (v > 0) totals.set(e.d, (totals.get(e.d) ?? 0) + v)
        }
        for (const [d, n] of totals) {
          if (n <= best) continue
          best = n
          if (d !== holder) {
            holder = d
            const e = (m.sprint ? race.sprint : race.results).find((x) => x.d === d)
            rows.push({ key: `r${race.i}-${d}`, d, t: e?.t, label: driverName(ctx, d), value: race.i, display: fmtDate(race.date), detail: `${raceLabel(race)} · took the record at ${fmtOf(m)(n)}` })
          }
        }
      }
      // The final tally of the current holder.
      if (rows.length) rows[rows.length - 1].detail += ` · now ${fmtOf(m)(totals.get(holder) ?? best)}`
      return rows
    },
  },
  {
    id: 'birthday',
    label: 'On their birthday',
    help: (m) => `${m.noun[0].toUpperCase()}${m.noun.slice(1)} scored on the driver’s birthday.`,
    perDriver: true,
    bars: false,
    valueLabel: 'Date',
    compute: (m, ctx) =>
      streams(m, ctx).flatMap(([d, s]) => {
        const dob = ctx.r.drivers[d].dob
        if (!dob) return []
        return hitsOf(m, ctx, s)
          .filter((e) => e.race.date.slice(5) === dob.slice(5))
          .map((e) => driverRow(ctx, d, e.race.i, fmtDate(e.race.date), { key: `d${d}-${e.race.i}`, t: e.t, detail: `${raceLabel(e.race)} · turned ${age(dob, e.race.date).years}` }))
      }),
  },
  {
    id: 'distinct',
    label: 'Different drivers per season',
    help: (m) => `Seasons with the most different drivers scoring ${m.noun}.`,
    compute: (m, ctx) => {
      const by = new Map<number, Set<number>>()
      for (const race of ctx.races)
        for (const e of m.sprint ? race.sprint : race.results)
          if ((m.pool ?? started)(e) && value(m, e, ctx) > 0) by.set(race.season, (by.get(race.season) ?? new Set()).add(e.d))
      return [...by].map(([season, ds]) => ({
        key: `s${season}`,
        label: String(season),
        value: ds.size,
        display: String(ds.size),
        detail: names([...ds].map((d) => driverName(ctx, d)), 6),
      }))
    },
  },
  {
    id: 'different',
    label: 'Consecutive different drivers',
    help: (m) => `Longest runs of ${m.sprint ? 'sprints' : 'races'} in which nobody repeated: each of ${m.noun} went to a different driver.`,
    compute: (m, ctx) => {
      const seq = ctx.races
        .map((race) => ({ race, ds: (m.sprint ? race.sprint : race.results).filter((e) => (m.pool ?? started)(e) && value(m, e, ctx) > 0).map((e) => e.d) }))
        .filter((x) => x.ds.length)
      const rows: Row[] = []
      let reach = -1
      for (let lo = 0; lo < seq.length; lo++) {
        const seen = new Set<number>()
        let hi = lo
        while (hi < seq.length && seq[hi].ds.every((d) => !seen.has(d))) {
          seq[hi].ds.forEach((d) => seen.add(d))
          hi++
        }
        const n = hi - lo
        if (hi - 1 > reach && n >= 2) {
          rows.push({ key: `w${lo}`, label: `${raceLabel(seq[lo].race)} – ${raceLabel(seq[hi - 1].race)}`, value: n, display: String(n), detail: names([...seen].map((d) => driverName(ctx, d)), 5), date: seq[lo].race.date })
        }
        reach = Math.max(reach, hi - 1)
      }
      return rows
    },
  },
]

/** The generic records that apply to a metric. */
export function measuresFor(m: Metric): RecordDef[] {
  return MEASURES.filter((x) => !m.skip?.includes(x.id) && (x.id !== 'different' || m.single)).map((x) => ({
    id: `${m.id}.${x.id}`,
    label: x.label,
    help: x.help(m),
    asc: x.asc,
    bars: x.bars,
    perDriver: x.perDriver,
    valueLabel: x.valueLabel,
    dataFrom: m.dataFrom,
    compute: (ctx) => x.compute(m, ctx),
  }))
}
