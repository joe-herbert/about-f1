// Every driver record the Records panel offers, grouped the way statsf1.com groups them.

import type { REntry } from '../../api/records/types'
import { Flag, Status } from '../../api/records/types'
import { classified, fastest, fmtNum, pole, podium, started, win, type Ctx, type RecordDef } from './core'
import { measuresFor, type Metric } from './measures'
import * as S from './specials'

export interface Stat {
  id: string
  group: string
  title: string
  records: RecordDef[]
}

const led = (e: REntry) => e.led ?? 0
const hasLaps = (e: REntry) => started(e) && e.led !== null
const isChampion = (ctx: Ctx, e: REntry) => ctx.champion.get(e.race.season) === e.d
const km = (n: number) => fmtNum(Math.round(n))

/* Measures that only make sense for "things you can score" and not for plain participation. */
const PARTICIPATION = ['rate', 'before', 'without']

const METRICS: (Metric & { group: string; specials?: RecordDef[] })[] = [
  /* Wins */
  { group: 'Wins', id: 'wins', title: 'Wins', noun: 'wins', test: win, single: true, specials: S.winSpecials },
  { group: 'Wins', id: 'winsNoTitle', title: 'Wins in a year without the title', noun: 'wins in seasons they didn’t win the championship', test: (e, ctx) => win(e) && ctx.champion.has(e.race.season) && !isChampion(ctx, e) },
  { group: 'Wins', id: 'winsNoPole', title: 'Wins without pole position', noun: 'wins from off pole', test: (e) => win(e) && !pole(e) },
  { group: 'Wins', id: 'winFastest', title: 'Win and fastest lap', noun: 'wins with the fastest lap', test: (e) => win(e) && fastest(e) },

  /* Poles */
  { group: 'Pole positions', id: 'poles', title: 'Pole positions', noun: 'pole positions', test: pole, single: true, specials: S.poleSpecials },
  { group: 'Pole positions', id: 'poleWin', title: 'Pole position and win', noun: 'wins from pole', test: (e) => pole(e) && win(e) },
  { group: 'Pole positions', id: 'poleNoWin', title: 'Pole position without win', noun: 'poles not converted to a win', test: (e) => pole(e) && !win(e) },
  { group: 'Pole positions', id: 'frontRows', title: 'First row', noun: 'front-row starts', test: (e) => e.grid === 1 || e.grid === 2, specials: S.frontRowSpecials },

  /* Fastest laps */
  { group: 'Fastest laps', id: 'fastest', title: 'Fastest laps', noun: 'fastest laps', test: fastest, single: true },

  /* Points */
  { group: 'Points', id: 'points', title: 'Points', noun: 'points', weight: (e) => e.pts, specials: S.pointsSpecials },
  { group: 'Points', id: 'pointsFinishes', title: 'Points finishes', noun: 'points finishes', test: (e) => e.pts > 0 },

  /* Podiums */
  { group: 'Podiums', id: 'podiums', title: 'Podiums', noun: 'podiums', test: podium, specials: S.podiumSpecials },
  { group: 'Podiums', id: 'second', title: '2nd place', noun: 'second places', test: (e) => classified(e) && e.pos === 2, single: true },
  { group: 'Podiums', id: 'third', title: '3rd place', noun: 'third places', test: (e) => classified(e) && e.pos === 3, single: true },
  { group: 'Podiums', id: 'podiumNoWin', title: '2nd and 3rd places', noun: '2nd and 3rd places', test: (e) => classified(e) && (e.pos === 2 || e.pos === 3) },
  { group: 'Podiums', id: 'top6', title: 'Top-6 finishes', noun: 'top-6 finishes', test: (e) => classified(e) && e.pos <= 6 },
  { group: 'Podiums', id: 'top10', title: 'Top-10 finishes', noun: 'top-10 finishes', test: (e) => classified(e) && e.pos <= 10 },

  /* Lead */
  { group: 'Lead', id: 'lapsLed', title: 'Laps led', noun: 'laps led', weight: led, pool: hasLaps, dataFrom: 1996, specials: S.leadSpecials },
  { group: 'Lead', id: 'kmLed', title: 'Km led', noun: 'kilometres led', weight: (e) => led(e) * e.race.km, pool: hasLaps, dataFrom: 1996, fmt: km },
  { group: 'Lead', id: 'racesLed', title: 'Grands Prix led', noun: 'races led', test: (e) => led(e) > 0, pool: hasLaps, dataFrom: 1996 },
  { group: 'Lead', id: 'ledAll', title: 'From start to finish', noun: 'races led from start to finish', test: (e) => led(e) > 0 && led(e) >= e.race.laps, pool: hasLaps, dataFrom: 1996, single: true },

  /* Grands Prix */
  { group: 'Grands Prix', id: 'starts', title: 'Starts', noun: 'starts', weight: () => 1, participation: true, strictStreak: true, skip: PARTICIPATION, specials: S.startSpecials },
  { group: 'Grands Prix', id: 'entries', title: 'Entries', noun: 'entries', weight: () => 1, participation: true, pool: () => true, chances: 'entries', skip: PARTICIPATION },
  { group: 'Grands Prix', id: 'lapsRaced', title: 'Laps raced', noun: 'laps raced', weight: (e) => e.laps },
  { group: 'Grands Prix', id: 'kmRaced', title: 'Km raced', noun: 'kilometres raced', weight: (e) => e.laps * e.race.km, fmt: km },
  { group: 'Grands Prix', id: 'champLead', title: 'Leading the championship', noun: 'races leading the championship', test: (e) => e.race.leaders.includes(e.d), strictStreak: true },
  { group: 'Grands Prix', id: 'reigning', title: 'As reigning world champion', noun: 'starts as the reigning champion', test: (e, ctx) => ctx.champion.get(e.race.season - 1) === e.d },

  /* Misc */
  { group: 'Misc', id: 'hatTricks', title: 'Hat tricks', noun: 'hat tricks (pole, win and fastest lap)', test: (e) => pole(e) && win(e) && fastest(e), single: true },
  { group: 'Misc', id: 'slams', title: 'Grand slams', noun: 'grand slams (pole, win, fastest lap, led every lap)', test: (e) => (e.flags & Flag.Slam) !== 0, single: true },
  { group: 'Misc', id: 'finishes', title: 'Finished', noun: 'classified finishes', test: classified, specials: S.miscSpecials },
  { group: 'Misc', id: 'leadLap', title: 'In the winner’s lap', noun: 'finishes on the lead lap', test: (e) => (e.flags & Flag.LeadLap) !== 0 },
  { group: 'Misc', id: 'retirements', title: 'Retirement', noun: 'retirements', test: (e) => e.status === Status.DNF },
  { group: 'Misc', id: 'lap1', title: '1st lap retirement', noun: 'first-lap retirements', test: (e) => e.status === Status.DNF && e.laps === 0 },
  { group: 'Misc', id: 'dsq', title: 'Disqualified', noun: 'disqualifications', test: (e) => e.status === Status.DSQ || e.status === Status.EX },
  { group: 'Misc', id: 'dnq', title: 'Non-qualification', noun: 'failures to qualify or pre-qualify', test: (e) => e.status === Status.DNQ || e.status === Status.DNPQ, pool: () => true, chances: 'entries' },
  { group: 'Misc', id: 'dotd', title: 'Driver of the Day', noun: 'Driver of the Day awards', test: (e) => (e.flags & Flag.DriverOfTheDay) !== 0, dataFrom: 2016, single: true },

  /* Sprint */
  { group: 'Sprint', id: 'sWins', title: 'Sprint wins', noun: 'sprint wins', sprint: true, test: win, single: true, dataFrom: 2021, chances: 'sprints' },
  { group: 'Sprint', id: 'sPoles', title: 'Sprint pole positions', noun: 'sprint poles', sprint: true, test: (e) => e.grid === 1, single: true, dataFrom: 2021, chances: 'sprints' },
  { group: 'Sprint', id: 'sPoints', title: 'Sprint points', noun: 'sprint points', sprint: true, weight: (e) => e.pts, dataFrom: 2021, chances: 'sprints' },
  { group: 'Sprint', id: 'sPodiums', title: 'Sprint podiums', noun: 'sprint podiums', sprint: true, test: podium, dataFrom: 2021, chances: 'sprints' },
]

export const STATS: Stat[] = [
  { id: 'titles', group: 'World Champion titles', title: 'World Champion titles', records: S.titleRecords },
  ...METRICS.map((m) => ({ id: m.id, group: m.group, title: m.title, records: [...measuresFor(m), ...(m.specials ?? [])] })),
  { id: 'people', group: 'Misc', title: 'Drivers', records: S.peopleRecords },
]

export const GROUPS = [...new Set(STATS.map((s) => s.group))]

export const DEFAULT_RECORD = 'wins.total'

export function findRecord(id: string): { stat: Stat; record: RecordDef } {
  const statId = id.split('.')[0]
  const stat = STATS.find((s) => s.id === statId) ?? STATS.find((s) => s.id === 'wins')!
  const record = stat.records.find((r) => r.id === id) ?? stat.records[0]
  return { stat, record }
}

export const recordCount = STATS.reduce((a, s) => a + s.records.length, 0)
