import type { JConstructor, JDriver, JRace, JResult } from '../../api/jolpica/types'
import { mix, type Tokens } from '../../lib/theme'
import type { OptionSpec } from '../types'

export const SEASON_OPTION: OptionSpec = { key: 'season', type: 'season', default: 0, label: 'Season' }

export interface SeasonDriver {
  driver: JDriver
  constructor: JConstructor
  /** Lower-scoring driver of the constructor that season: dashed / hollow */
  secondary: boolean
}

/** Driver → their most frequent constructor that season; teammates ordered by season points (championship order). */
export function seasonDrivers(races: JRace[]): Map<string, SeasonDriver> {
  const counts = new Map<string, Map<string, { c: JConstructor; n: number }>>()
  const drivers = new Map<string, JDriver>()
  const points = new Map<string, number>()
  const appearance: string[] = []
  for (const r of races) {
    for (const res of [...(r.Results ?? []), ...(r.SprintResults ?? [])]) {
      const id = res.Driver.driverId
      if (!drivers.has(id)) {
        drivers.set(id, res.Driver)
        appearance.push(id)
      }
      points.set(id, (points.get(id) ?? 0) + Number(res.points))
      const m = counts.get(id) ?? new Map()
      const e = m.get(res.Constructor.constructorId) ?? { c: res.Constructor, n: 0 }
      e.n++
      m.set(res.Constructor.constructorId, e)
      counts.set(id, m)
    }
  }
  const order = [...appearance].sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0))
  const out = new Map<string, SeasonDriver>()
  const seenTeam = new Set<string>()
  for (const id of order) {
    const best = [...counts.get(id)!.values()].sort((a, b) => b.n - a.n)[0]
    const secondary = seenTeam.has(best.c.constructorId)
    seenTeam.add(best.c.constructorId)
    out.set(id, { driver: drivers.get(id)!, constructor: best.c, secondary })
  }
  return out
}

/** Merge race and sprint results into one list of races, sorted by round. */
export function withSprints(races: JRace[] | undefined, sprints: JRace[] | undefined): JRace[] {
  const map = new Map<string, JRace>()
  for (const r of races ?? []) map.set(r.round, { ...r })
  for (const s of sprints ?? []) {
    const r = map.get(s.round)
    if (r) r.SprintResults = s.SprintResults
    else map.set(s.round, { ...s })
  }
  return [...map.values()].sort((a, b) => Number(a.round) - Number(b.round))
}

export const pts = (r: JResult) => Number(r.points) || 0

export function fade(color: string, dim: boolean, t: Tokens) {
  return dim ? mix(color, t.panel, 0.72) : color
}

/** Short round label, e.g. "Monaco" from "Monaco Grand Prix". */
export const shortRace = (name: string) => name.replace(/ Grand Prix$/, '').replace(/^Grand Prix of /, '')

/** Short status label for non-classified finishes. */
export function statusAbbr(status: string) {
  if (/disqualif/i.test(status)) return 'DQ'
  if (/did not start|withdrew/i.test(status)) return 'DNS'
  if (/did not qualify|not classified/i.test(status)) return status.startsWith('Did not') ? 'DNQ' : 'NC'
  return 'R'
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
