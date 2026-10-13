// One-off records that don't fit the generic metric × measure grid.

import type { REntry, RRace, RSeason } from '../../api/records/types'
import { Status } from '../../api/records/types'
import {
  type Ctx,
  type RecordDef,
  type Row,
  age,
  classified,
  driverName,
  driverRow,
  fastest,
  fmtAge,
  fmtDate,
  fmtNum,
  mainTeam,
  podium,
  pole,
  raceLabel,
  started,
  teamName,
  win,
  yearList,
} from './core'

/* ---------- helpers ---------- */

const ordinal = (n: number) => `P${n}`
const today = () => new Date().toISOString().slice(0, 10)

function seasonsInRange(ctx: Ctx): RSeason[] {
  return [...ctx.r.seasons.values()].filter((s) => s.year >= ctx.from && s.year <= ctx.to).sort((a, b) => a.year - b.year)
}

function lastRace(ctx: Ctx, year: number): RRace | undefined {
  return ctx.r.races.findLast((r) => r.season === year)
}

/** Every driver's starts in a season. */
function startsIn(ctx: Ctx, d: number, year: number) {
  return (ctx.gp.get(d) ?? []).filter((e) => e.race.season === year && started(e))
}

/** Titles in range: completed seasons with a champion. */
function titles(ctx: Ctx) {
  return seasonsInRange(ctx).flatMap((s) => {
    const c = s.drivers.find((x) => x.champion)
    return s.over && c ? [{ season: s, d: c.d, year: s.year, t: mainTeam(startsIn(ctx, c.d, s.year)) }] : []
  })
}

function titlesBy(ctx: Ctx) {
  const by = new Map<number, ReturnType<typeof titles>>()
  for (const t of titles(ctx)) by.set(t.d, [...(by.get(t.d) ?? []), t])
  return by
}

/** Counts how often the same group of drivers occurs, e.g. identical podiums. */
function groupCounts(ctx: Ctx, groups: (race: RRace) => number[][], ordered: boolean, joiner = ', '): Row[] {
  const by = new Map<string, { ds: number[]; races: RRace[] }>()
  for (const race of ctx.races) {
    for (const g of groups(race)) {
      const ds = ordered ? g : [...g].sort((a, b) => a - b)
      const key = ds.join('-')
      const e = by.get(key) ?? { ds, races: [] }
      e.races.push(race)
      by.set(key, e)
    }
  }
  return [...by.values()]
    .filter((e) => e.races.length > 1)
    .map((e) => ({
      key: e.ds.join('-'),
      label: (ordered ? g(e) : [...g(e)].sort()).join(joiner),
      value: e.races.length,
      display: String(e.races.length),
      detail: yearList(e.races.map((r) => r.season)),
      date: e.races[0].date,
    }))
  function g(e: { ds: number[] }) {
    return e.ds.map((d) => driverName(ctx, d))
  }
}

const pairs = (ds: number[]) => ds.flatMap((a, k) => ds.slice(k + 1).map((b) => [a, b]))

function averageAge(ctx: Ctx, entries: REntry[], date: string) {
  const ages = entries.map((e) => ctx.r.drivers[e.d].dob).filter((x): x is string => !!x).map((dob) => age(dob, date).total)
  return ages.length === entries.length && ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null
}

function fmtDaysAsAge(days: number) {
  const y = Math.floor(days / 365.25)
  return `${y}y ${Math.round(days - y * 365.25)}d`
}

/** Per-race records: one row per (driver, race) entry passing `test`. */
function entryRows(ctx: Ctx, test: (e: REntry) => boolean, show: (e: REntry) => { value: number; display: string; detail?: string }): Row[] {
  return ctx.races.flatMap((race) =>
    race.results.filter(test).map((e) => {
      const s = show(e)
      return driverRow(ctx, e.d, s.value, s.display, { key: `d${e.d}-${race.i}`, t: e.t, detail: s.detail ?? raceLabel(race), date: race.date })
    }),
  )
}

/** Sum of `v` over each driver's starts, for drivers whose starts never pass `never`. */
function totalsWithout(ctx: Ctx, v: (e: REntry) => number, never: (e: REntry) => boolean, fmt = fmtNum): Row[] {
  return [...ctx.gp].flatMap(([d, all]) => {
    const s = all.filter(started)
    if (!s.length || s.some(never)) return []
    const total = s.reduce((a, e) => a + v(e), 0)
    if (total <= 0) return []
    return [driverRow(ctx, d, total, fmt(total), { t: mainTeam(s), detail: `${s.length} starts · ${s[0].race.season}–${s.at(-1)!.race.season}` })]
  })
}

/* ---------- World Champion titles ---------- */

export const titleRecords: RecordDef[] = [
  {
    id: 'titles.total',
    label: 'By number',
    help: 'Most drivers’ world championships.',
    perDriver: true,
    compute: (ctx) =>
      [...titlesBy(ctx)].map(([d, ts]) => driverRow(ctx, d, ts.length, String(ts.length), { t: ts.at(-1)!.t, detail: yearList(ts.map((t) => t.year)), date: lastRace(ctx, ts[0].year)?.date })),
  },
  {
    id: 'titles.chrono',
    label: 'Chronology of firsts',
    help: 'Every champion in the order they first won the title, newest first.',
    perDriver: true,
    bars: false,
    valueLabel: 'First title',
    compute: (ctx) => {
      const firsts = [...titlesBy(ctx)].map(([d, ts]) => ({ d, t: ts[0] })).sort((a, b) => a.t.year - b.t.year)
      return firsts.map(({ d, t }, k) => driverRow(ctx, d, t.year, String(t.year), { t: t.t, detail: `#${k + 1} · ${t.t !== undefined ? teamName(ctx, t.t) : ''}` }))
    },
  },
  ...(['youngest', 'oldest'] as const).map(
    (which): RecordDef => ({
      id: `titles.${which}`,
      label: which === 'youngest' ? 'Youngest' : 'Oldest',
      help: which === 'youngest' ? 'Youngest drivers to win the championship, at the season’s final race.' : 'Oldest champions, at the final race of their last title season.',
      asc: which === 'youngest',
      perDriver: true,
      valueLabel: 'Age',
      compute: (ctx) =>
        [...titlesBy(ctx)].flatMap(([d, ts]) => {
          const t = which === 'youngest' ? ts[0] : ts.at(-1)!
          const dob = ctx.r.drivers[d].dob
          const date = lastRace(ctx, t.year)?.date
          if (!dob || !date) return []
          return [driverRow(ctx, d, age(dob, date).total, fmtAge(dob, date), { t: t.t, detail: String(t.year) })]
        }),
    }),
  ),
  {
    id: 'titles.streak',
    label: 'Consecutive',
    help: 'Most titles in a row.',
    perDriver: true,
    compute: (ctx) =>
      [...titlesBy(ctx)].flatMap(([d, ts]) => {
        let best = { n: 0, from: 0 }
        let n = 0
        ts.forEach((t, k) => {
          n = k > 0 && t.year === ts[k - 1].year + 1 ? n + 1 : 1
          if (n > best.n) best = { n, from: t.year - n + 1 }
        })
        return best.n > 1 ? [driverRow(ctx, d, best.n, String(best.n), { t: ts.at(-1)!.t, detail: `${best.from}–${best.from + best.n - 1}` })] : []
      }),
  },
  {
    id: 'titles.gap',
    label: 'Longest gap between two',
    help: 'Longest wait between two titles.',
    perDriver: true,
    valueLabel: 'Years',
    compute: (ctx) =>
      [...titlesBy(ctx)].flatMap(([d, ts]) => {
        let best = { n: 0, a: 0, b: 0 }
        for (let k = 1; k < ts.length; k++) if (ts[k].year - ts[k - 1].year > best.n) best = { n: ts[k].year - ts[k - 1].year, a: ts[k - 1].year, b: ts[k].year }
        return best.n ? [driverRow(ctx, d, best.n, `${best.n} years`, { t: ts.at(-1)!.t, detail: `${best.a} → ${best.b}` })] : []
      }),
  },
  {
    id: 'titles.startsBefore',
    label: 'Starts before the first',
    help: 'Most starts before the season of a driver’s first title.',
    perDriver: true,
    compute: (ctx) =>
      [...titlesBy(ctx)].flatMap(([d, ts]) => {
        const n = (ctx.gp.get(d) ?? []).filter((e) => started(e) && e.race.season < ts[0].year).length
        return [driverRow(ctx, d, n, String(n), { t: ts[0].t, detail: `Champion in ${ts[0].year}` })]
      }),
  },
  {
    id: 'titles.seasonsBefore',
    label: 'Seasons before the first',
    help: 'Most seasons raced before the first title.',
    perDriver: true,
    compute: (ctx) =>
      [...titlesBy(ctx)].flatMap(([d, ts]) => {
        const n = new Set((ctx.gp.get(d) ?? []).filter((e) => started(e) && e.race.season < ts[0].year).map((e) => e.race.season)).size
        return [driverRow(ctx, d, n, String(n), { t: ts[0].t, detail: `Champion in ${ts[0].year}` })]
      }),
  },
  ...(['most', 'fewest'] as const).map(
    (which): RecordDef => ({
      id: `titles.wins${which === 'most' ? '' : 'Fewest'}`,
      label: which === 'most' ? 'Wins in a title season' : 'Fewest wins in a title season',
      help: which === 'most' ? 'Champions who won the most races on the way to the title.' : 'Champions who won the fewest races on the way to the title.',
      asc: which === 'fewest',
      perDriver: true,
      compute: (ctx) =>
        titles(ctx).map((t) => {
          const s = startsIn(ctx, t.d, t.year)
          const w = s.filter(win).length
          return driverRow(ctx, t.d, w, String(w), { key: `d${t.d}-${t.year}`, t: t.t, detail: `${t.year} · ${s.length} starts` })
        }),
    }),
  ),
  ...(['largest', 'smallest'] as const).map(
    (which): RecordDef => ({
      id: `titles.margin${which === 'largest' ? '' : 'Smallest'}`,
      label: which === 'largest' ? 'Biggest margin' : 'Smallest margin',
      help: which === 'largest' ? 'Biggest points margin over the runner-up.' : 'Narrowest points margin over the runner-up.',
      asc: which === 'smallest',
      perDriver: true,
      valueLabel: 'Margin',
      compute: (ctx) =>
        titles(ctx).flatMap((t) => {
          const second = t.season.drivers.find((x) => x.pos === 2)
          const first = t.season.drivers.find((x) => x.d === t.d)
          if (!second || !first) return []
          const m = Math.round((first.pts - second.pts) * 100) / 100
          return [driverRow(ctx, t.d, m, `${fmtNum(m)} pts`, { key: `d${t.d}-${t.year}`, t: t.t, detail: `${t.year} · over ${driverName(ctx, second.d)}` })]
        }),
    }),
  ),
  {
    id: 'titles.teams',
    label: 'Different constructors',
    help: 'Champions with titles for the most different constructors.',
    perDriver: true,
    compute: (ctx) =>
      [...titlesBy(ctx)].map(([d, ts]) => {
        const teams = [...new Set(ts.map((t) => t.t).filter((t): t is number => t !== undefined))]
        return driverRow(ctx, d, teams.length, String(teams.length), { t: ts.at(-1)!.t, detail: teams.map((t) => teamName(ctx, t)).join(', ') })
      }),
  },
  {
    id: 'titles.constructors',
    label: 'Constructors’ titles',
    help: 'Seasons a driver raced for the constructors’ champion (their main team that year).',
    perDriver: true,
    compute: (ctx) => {
      const by = new Map<number, { years: number[]; t: number }>()
      for (const s of seasonsInRange(ctx)) {
        const champ = s.teams.find((x) => x.champion)
        if (!champ || !s.over) continue
        for (const [d] of ctx.gp) {
          const st = startsIn(ctx, d, s.year)
          if (st.length && mainTeam(st) === champ.t) {
            const e = by.get(d) ?? { years: [], t: champ.t }
            e.years.push(s.year)
            by.set(d, e)
          }
        }
      }
      return [...by].map(([d, e]) => driverRow(ctx, d, e.years.length, String(e.years.length), { t: e.t, detail: yearList(e.years) }))
    },
  },
  ...([2, 3] as const).map(
    (n): RecordDef => ({
      id: n === 2 ? 'titles.runnerUp' : 'titles.top3',
      label: n === 2 ? 'Runner-up' : 'Top three in the championship',
      help: n === 2 ? 'Most times runner-up in the championship.' : 'Most top-three finishes in the championship.',
      perDriver: true,
      compute: (ctx) => {
        const by = new Map<number, number[]>()
        for (const s of seasonsInRange(ctx)) {
          if (!s.over) continue
          for (const x of s.drivers) if (n === 2 ? x.pos === 2 : x.pos >= 1 && x.pos <= 3) by.set(x.d, [...(by.get(x.d) ?? []), s.year])
        }
        return [...by].map(([d, ys]) => driverRow(ctx, d, ys.length, String(ys.length), { t: mainTeam(startsIn(ctx, d, ys.at(-1)!)), detail: yearList(ys) }))
      },
    }),
  ),
  {
    id: 'titles.best',
    label: 'Best championship finish',
    help: 'Each driver’s best championship finish, and how often they achieved it.',
    asc: true,
    perDriver: true,
    valueLabel: 'Best',
    compute: (ctx) => {
      const by = new Map<number, { pos: number; years: number[] }>()
      for (const s of seasonsInRange(ctx)) {
        if (!s.over) continue
        for (const x of s.drivers) {
          if (!x.pos) continue
          const e = by.get(x.d)
          if (!e || x.pos < e.pos) by.set(x.d, { pos: x.pos, years: [s.year] })
          else if (x.pos === e.pos) e.years.push(s.year)
        }
      }
      return [...by].map(([d, e]) => driverRow(ctx, d, e.pos - e.years.length / 1000, `${ordinal(e.pos)}${e.years.length > 1 ? ` ×${e.years.length}` : ''}`, { t: mainTeam(startsIn(ctx, d, e.years[0])), detail: yearList(e.years) }))
    },
  },
]

/* ---------- Wins ---------- */

export const winSpecials: RecordDef[] = [
  {
    id: 'wins.byGrid',
    label: 'By grid position',
    help: 'How many races have been won from each grid slot.',
    valueLabel: 'Wins',
    compute: (ctx) => {
      const by = new Map<number, REntry[]>()
      for (const race of ctx.races) for (const e of race.results) if (win(e) && e.grid > 0) by.set(e.grid, [...(by.get(e.grid) ?? []), e])
      return [...by].map(([g, es]) => ({
        key: `g${g}`,
        label: `From ${ordinal(g)}`,
        value: es.length,
        display: String(es.length),
        detail: `Latest: ${driverName(ctx, es.at(-1)!.d)}, ${raceLabel(es.at(-1)!.race)}`,
      }))
    },
  },
  {
    id: 'wins.lowestGrid',
    label: 'From furthest back',
    help: 'Wins from the lowest starting positions.',
    perDriver: true,
    valueLabel: 'Grid',
    compute: (ctx) => entryRows(ctx, (e) => win(e) && e.grid > 0, (e) => ({ value: e.grid, display: ordinal(e.grid) })),
  },
  {
    id: 'wins.gridSlots',
    label: 'Different grid positions',
    help: 'Most different grid slots a driver has won from.',
    perDriver: true,
    compute: (ctx) =>
      [...ctx.gp].flatMap(([d, s]) => {
        const slots = [...new Set(s.filter((e) => win(e) && e.grid > 0).map((e) => e.grid))].sort((a, b) => a - b)
        return slots.length ? [driverRow(ctx, d, slots.length, String(slots.length), { t: mainTeam(s.filter(win)), detail: slots.map(ordinal).join(', ') })] : []
      }),
  },
  {
    id: 'wins.lastLap',
    label: 'Took the lead on the last lap',
    help: 'Wins where the only lap the winner led was the last one.',
    perDriver: true,
    bars: false,
    dataFrom: 1996,
    valueLabel: 'Date',
    compute: (ctx) => entryRows(ctx, (e) => win(e) && e.led === 1 && e.race.laps > 1, (e) => ({ value: e.race.i, display: fmtDate(e.race.date) })),
  },
  {
    id: 'wins.noLead',
    label: 'Win without leading',
    help: 'Wins without leading a single lap on the road (the leader was penalised or disqualified).',
    perDriver: true,
    bars: false,
    dataFrom: 1996,
    valueLabel: 'Date',
    compute: (ctx) => entryRows(ctx, (e) => win(e) && e.led === 0, (e) => ({ value: e.race.i, display: fmtDate(e.race.date) })),
  },
]

/* ---------- Poles and front rows ---------- */

export const poleSpecials: RecordDef[] = [
  {
    id: 'poles.dns',
    label: 'Pole but did not start',
    help: 'Pole sitters who didn’t start the race.',
    perDriver: true,
    bars: false,
    valueLabel: 'Date',
    compute: (ctx) => ctx.races.flatMap((race) => race.results.filter((e) => pole(e) && !started(e)).map((e) => driverRow(ctx, e.d, race.i, fmtDate(race.date), { key: `d${e.d}-${race.i}`, t: e.t, detail: raceLabel(race) }))),
  },
]

export const frontRowSpecials: RecordDef[] = [
  {
    id: 'frontRows.duo',
    label: 'Front-row pairings',
    help: 'Pairs of drivers who shared the front row most often.',
    compute: (ctx) =>
      groupCounts(
        ctx,
        (race) => {
          const fr = race.results.filter((e) => e.grid === 1 || e.grid === 2).map((e) => e.d)
          return fr.length === 2 ? [fr] : []
        },
        false,
        ' & ',
      ),
  },
]

/* ---------- Points ---------- */

export const pointsSpecials: RecordDef[] = [
  {
    id: 'points.retained',
    label: 'Most in a season (counted)',
    help: 'Most championship points in a season, after dropped scores (the official tally).',
    perDriver: true,
    compute: (ctx) =>
      seasonsInRange(ctx).flatMap((s) =>
        s.drivers.filter((x) => x.pts > 0).map((x) => driverRow(ctx, x.d, x.pts, fmtNum(x.pts), { key: `d${x.d}-${s.year}`, t: mainTeam(startsIn(ctx, x.d, s.year)), detail: `${s.year} · ${ordinal(x.pos)}${s.over ? '' : ' so far'}` })),
      ),
  },
  {
    id: 'points.perSeason',
    label: 'Average per season',
    help: 'Most points per season raced (at least three seasons).',
    perDriver: true,
    compute: (ctx) =>
      [...ctx.gp].flatMap(([d, all]) => {
        const s = all.filter(started)
        const seasons = new Set(s.map((e) => e.race.season)).size
        const pts = s.reduce((a, e) => a + e.pts, 0)
        if (seasons < 3 || pts <= 0) return []
        const avg = Math.round((pts / seasons) * 10) / 10
        return [driverRow(ctx, d, avg, fmtNum(avg), { t: mainTeam(s), detail: `${fmtNum(pts)} points in ${seasons} seasons` })]
      }),
  },
  {
    id: 'points.noWin',
    label: 'Without a win',
    help: 'Most points by drivers who never won a race.',
    perDriver: true,
    compute: (ctx) => totalsWithout(ctx, (e) => e.pts, win),
  },
  {
    id: 'points.noPodium',
    label: 'Without a podium',
    help: 'Most points by drivers who never finished on the podium.',
    perDriver: true,
    compute: (ctx) => totalsWithout(ctx, (e) => e.pts, podium),
  },
]

/* ---------- Podiums ---------- */

const podiumOf = (race: RRace) => {
  const p = [1, 2, 3].map((n) => race.results.filter((e) => classified(e) && e.pos === n))
  return p.every((x) => x.length === 1) ? p.map((x) => x[0]) : null
}

export const podiumSpecials: RecordDef[] = [
  {
    id: 'podiums.identical',
    label: 'Identical podiums',
    help: 'The same three drivers in the same order.',
    compute: (ctx) => groupCounts(ctx, (race) => (podiumOf(race) ? [podiumOf(race)!.map((e) => e.d)] : []), true),
  },
  {
    id: 'podiums.trio',
    label: 'Trios most often together',
    help: 'The same three drivers on the podium, in any order.',
    compute: (ctx) => groupCounts(ctx, (race) => (podiumOf(race) ? [podiumOf(race)!.map((e) => e.d)] : []), false),
  },
  {
    id: 'podiums.duo',
    label: 'Pairs most often together',
    help: 'Pairs of drivers who shared the podium most often.',
    compute: (ctx) => groupCounts(ctx, (race) => pairs(race.results.filter(podium).map((e) => e.d)), false, ' & '),
  },
  {
    id: 'podiums.oneTwo',
    label: '1st and 2nd most often together',
    help: 'Pairs of drivers who finished first and second most often, either way round.',
    compute: (ctx) =>
      groupCounts(
        ctx,
        (race) => {
          const p = podiumOf(race)
          return p ? [[p[0].d, p[1].d]] : []
        },
        false,
        ' & ',
      ),
  },
  ...(['youngest', 'oldest'] as const).map(
    (which): RecordDef => ({
      id: `podiums.${which}Avg`,
      label: which === 'youngest' ? 'Youngest by average age' : 'Oldest by average age',
      help: `Podiums with the ${which} average age.`,
      asc: which === 'youngest',
      valueLabel: 'Average age',
      compute: (ctx) =>
        ctx.races.flatMap((race) => {
          const p = podiumOf(race)
          const avg = p && averageAge(ctx, p, race.date)
          return avg ? [{ key: `r${race.i}`, label: raceLabel(race), value: avg, display: fmtDaysAsAge(avg), detail: p!.map((e) => driverName(ctx, e.d)).join(', '), t: p![0].t }] : []
        }),
    }),
  ),
  {
    id: 'podiums.beforeWin',
    label: 'Before the first win',
    help: 'Most podiums before a first win.',
    perDriver: true,
    compute: (ctx) =>
      [...ctx.gp].flatMap(([d, s]) => {
        const k = s.findIndex(win)
        if (k < 0) return []
        const n = s.slice(0, k).filter(podium).length
        return n ? [driverRow(ctx, d, n, String(n), { t: s[k].t, detail: `First win: ${raceLabel(s[k].race)}` })] : []
      }),
  },
  {
    id: 'podiums.noWin',
    label: 'Without a win',
    help: 'Most podiums by drivers who never won a race.',
    perDriver: true,
    compute: (ctx) => totalsWithout(ctx, (e) => (podium(e) ? 1 : 0), win),
  },
]

/* ---------- Lead ---------- */

export const leadSpecials: RecordDef[] = [
  {
    id: 'lapsLed.noWin',
    label: 'Without a win',
    help: 'Most laps led by drivers who never won a race.',
    perDriver: true,
    dataFrom: 1996,
    compute: (ctx) => totalsWithout(ctx, (e) => e.led ?? 0, win),
  },
  {
    id: 'lapsLed.race',
    label: 'In one race',
    help: 'Most laps led in a single Grand Prix, as a share of the race.',
    perDriver: true,
    dataFrom: 1996,
    compute: (ctx) => entryRows(ctx, (e) => (e.led ?? 0) > 0, (e) => ({ value: e.led!, display: String(e.led), detail: `${raceLabel(e.race)} · ${Math.round((e.led! / Math.max(1, e.race.laps)) * 100)}% of the race` })),
  },
]

/* ---------- Grands Prix ---------- */

export const startSpecials: RecordDef[] = [
  {
    id: 'starts.teammates',
    label: 'With the same teammate',
    help: 'Teammates who started the most races together.',
    compute: (ctx) => {
      const rows = groupCounts(
        ctx,
        (race) => {
          const by = new Map<number, number[]>()
          for (const e of race.results) if (started(e)) by.set(e.t, [...(by.get(e.t) ?? []), e.d])
          return [...by.values()].flatMap(pairs)
        },
        false,
        ' & ',
      )
      return rows
    },
  },
  ...(['youngest', 'oldest'] as const).map(
    (which): RecordDef => ({
      id: `starts.${which}Field`,
      label: which === 'youngest' ? 'Youngest field' : 'Oldest field',
      help: `Grands Prix with the ${which} average age of the starting field.`,
      asc: which === 'youngest',
      valueLabel: 'Average age',
      compute: (ctx) =>
        ctx.races.flatMap((race) => {
          const s = race.results.filter(started)
          const avg = averageAge(ctx, s, race.date)
          return avg ? [{ key: `r${race.i}`, label: raceLabel(race), value: avg, display: fmtDaysAsAge(avg), detail: `${s.length} starters` }] : []
        }),
    }),
  ),
  {
    id: 'starts.field',
    label: 'Largest fields',
    help: 'Grands Prix with the most starters.',
    compute: (ctx) =>
      ctx.races.map((race) => {
        const n = race.results.filter(started).length
        return { key: `r${race.i}`, label: raceLabel(race), value: n, display: String(n), detail: `${race.results.length} entries` }
      }),
  },
  {
    id: 'starts.noWinPoleFl',
    label: 'Without win, pole and fastest lap',
    help: 'Most starts by drivers who never won, took pole or set a fastest lap.',
    perDriver: true,
    compute: (ctx) => totalsWithout(ctx, () => 1, (e) => win(e) || pole(e) || fastest(e)),
  },
  {
    id: 'starts.noLead',
    label: 'Never led a lap',
    help: 'Most starts (with lap-by-lap data) by drivers who never led a lap.',
    perDriver: true,
    dataFrom: 1996,
    compute: (ctx) => totalsWithout(ctx, (e) => (e.led === null ? 0 : 1), (e) => (e.led ?? 0) > 0),
  },
]

/* ---------- Drivers (misc) ---------- */

export const miscSpecials: RecordDef[] = [
  ...(['grid', 'finish'] as const).map(
    (which): RecordDef => ({
      id: `finishes.avg${which === 'grid' ? 'Grid' : 'Finish'}`,
      label: which === 'grid' ? 'Average position on the grid' : 'Average finishing position',
      help: which === 'grid' ? 'Best average starting position (minimum starts set in the panel settings).' : 'Best average finishing position over classified finishes (minimum starts set in the panel settings).',
      asc: true,
      perDriver: true,
      valueLabel: 'Average',
      compute: (ctx) =>
        [...ctx.gp].flatMap(([d, all]) => {
          const s = all.filter(started)
          const pool = which === 'grid' ? s.filter((e) => e.grid > 0).map((e) => e.grid) : s.filter(classified).map((e) => e.pos)
          if (s.length < ctx.minStarts || !pool.length) return []
          const avg = pool.reduce((a, b) => a + b, 0) / pool.length
          return [driverRow(ctx, d, avg, avg.toFixed(2), { t: mainTeam(s), detail: `${pool.length} ${which === 'grid' ? 'starts' : 'finishes'}` })]
        }),
    }),
  ),
  {
    id: 'finishes.gain',
    label: 'Most places gained',
    help: 'Most places gained from the grid in one race.',
    perDriver: true,
    compute: (ctx) => entryRows(ctx, (e) => classified(e) && e.grid > 0 && e.grid > e.pos, (e) => ({ value: e.grid - e.pos, display: `+${e.grid - e.pos}`, detail: `${raceLabel(e.race)} · ${ordinal(e.grid)} → ${ordinal(e.pos)}` })),
  },
]

/** f1db relation types: what the second driver is to the first. */
const RELATION: Record<string, string> = {
  CHILD: 'Child',
  PARENT: 'Parent',
  SIBLING: 'Sibling',
  HALF_SIBLING: 'Half-sibling',
  GRANDCHILD: 'Grandchild',
  SIBLINGS_CHILD: 'Nephew or niece',
  PARENTS_SIBLING: 'Uncle or aunt',
  PARENTS_SIBLINGS_CHILD: 'Cousin',
  GRANDPARENTS_SIBLING: 'Great-uncle or aunt',
  CHILD_IN_LAW: 'Child-in-law',
  SIBLING_IN_LAW: 'Sibling-in-law',
}

export const peopleRecords: RecordDef[] = [
  ...(['grid', 'result', 'last'] as const).map(
    (which): RecordDef => ({
      id: `people.${which === 'grid' ? 'debutGrid' : which === 'result' ? 'debutResult' : 'lastResult'}`,
      label: which === 'grid' ? 'Grid position for the first Grand Prix' : which === 'result' ? 'Ranking for the first Grand Prix' : 'Ranking for the last Grand Prix',
      help:
        which === 'grid'
          ? 'Best starting positions on debut.'
          : which === 'result'
            ? 'Best finishes on debut.'
            : 'Best finishes in a driver’s final Grand Prix (drivers not racing this season).',
      asc: true,
      perDriver: true,
      valueLabel: which === 'grid' ? 'Grid' : 'Result',
      compute: (ctx) => {
        const active = new Set(ctx.r.races.filter((r) => r.season === ctx.latestSeason).flatMap((r) => r.results.map((e) => e.d)))
        return [...ctx.gp].flatMap(([d, all]) => {
          const s = all.filter(started)
          const e = which === 'last' ? s.at(-1) : s[0]
          if (!e || (which === 'last' && active.has(d))) return []
          const v = which === 'grid' ? e.grid : classified(e) ? e.pos : 0
          return v > 0 ? [driverRow(ctx, d, v, ordinal(v), { t: e.t, detail: raceLabel(e.race), date: e.race.date })] : []
        })
      },
    }),
  ),
  {
    id: 'people.neverStarted',
    label: 'Never started',
    help: 'Drivers who entered Grands Prix but never started one.',
    perDriver: true,
    valueLabel: 'Entries',
    compute: (ctx) =>
      [...ctx.gp].flatMap(([d, s]) => (s.some(started) ? [] : [driverRow(ctx, d, s.length, String(s.length), { t: mainTeam(s), detail: `${yearList(s.map((e) => e.race.season))} · ${s.filter((e) => e.status === Status.DNQ || e.status === Status.DNPQ).length} DNQ/DNPQ` })])),
  },
  {
    id: 'people.women',
    label: 'Women',
    help: 'Every woman entered in a championship Grand Prix.',
    perDriver: true,
    valueLabel: 'Starts',
    compute: (ctx) =>
      [...ctx.gp].flatMap(([d, s]) => {
        if (!ctx.r.drivers[d].female) return []
        const st = s.filter(started)
        const pts = st.reduce((a, e) => a + e.pts, 0)
        return [driverRow(ctx, d, st.length, String(st.length), { t: mainTeam(s), detail: `${s.length} entries · ${yearList(s.map((e) => e.race.season))}${pts ? ` · ${fmtNum(pts)} pts` : ''}` })]
      }),
  },
  {
    id: 'people.family',
    label: 'Family relationships',
    help: 'Grand Prix drivers related to another Grand Prix driver.',
    bars: false,
    valueLabel: 'Relation',
    compute: (ctx) =>
      ctx.r.family.map((f, k) => ({
        key: `f${k}`,
        d: f.b,
        label: driverName(ctx, f.b),
        value: k,
        display: RELATION[f.type] ?? f.type.toLowerCase().replace(/_/g, ' '),
        detail: `of ${driverName(ctx, f.a)}`,
      })),
  },
  {
    id: 'people.testOnly',
    label: 'Third driver only',
    help: 'Drivers entered as test or third drivers who never took part in a Grand Prix.',
    bars: false,
    valueLabel: 'Born',
    compute: (ctx) => ctx.r.tests.map((t, k) => ({ key: `x${k}`, label: t.name, value: k, display: t.dob ? fmtDate(t.dob) : '—', detail: t.nat ?? '' })),
  },
  {
    id: 'people.oldestLiving',
    label: 'Oldest living',
    help: 'The oldest living Grand Prix drivers.',
    perDriver: true,
    valueLabel: 'Age',
    compute: (ctx) =>
      [...ctx.gp].flatMap(([d, s]) => {
        const dr = ctx.r.drivers[d]
        if (!dr.dob || dr.dod || !s.some(started)) return []
        return [driverRow(ctx, d, age(dr.dob, today()).total, fmtAge(dr.dob, today()), { t: mainTeam(s), detail: `Born ${fmtDate(dr.dob)} · raced ${yearList(s.map((e) => e.race.season))}` })]
      }),
  },
  {
    id: 'people.longestLived',
    label: 'Longest lived',
    help: 'Grand Prix drivers who lived the longest.',
    perDriver: true,
    valueLabel: 'Age',
    compute: (ctx) =>
      [...ctx.gp].flatMap(([d, s]) => {
        const dr = ctx.r.drivers[d]
        if (!dr.dob || !dr.dod || !s.some(started)) return []
        return [driverRow(ctx, d, age(dr.dob, dr.dod).total, fmtAge(dr.dob, dr.dod), { t: mainTeam(s), detail: `${fmtDate(dr.dob)} – ${fmtDate(dr.dod)}` })]
      }),
  },
]
