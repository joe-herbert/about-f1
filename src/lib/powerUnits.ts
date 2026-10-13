// Power unit element counts at any point in a season, from the FIA's documents (src/api/powerUnits).

import type { PowerUnitSeason } from '../api/powerUnits/types'

export type Counts = Map<number, Record<string, number>>

/**
 * Each driver's elements used, as of the end of the event at `index` in `data.events`:
 * the latest "used per driver" table up to then, plus the new elements reported after it.
 *
 * Tables are the FIA's own running totals, so they win over anything worked out before them.
 * That matters when drivers swap seats: the counts follow the car, and a table is the only
 * record of where they ended up.
 */
export function countsAt(data: PowerUnitSeason, index: number): Counts {
  const order = new Map(data.events.map((e, i) => [e.id, i]))
  const upTo = (event: number) => (order.get(event) ?? Infinity) <= index
  const table = data.tables.filter((t) => upTo(t.event)).sort((a, b) => a.at.localeCompare(b.at)).at(-1)
  const counts: Counts = new Map(table?.rows.map((r) => [r.number, { ...r.used }]))
  const changes = data.changes.filter((c) => upTo(c.event) && (!table || c.at > table.at)).sort((a, b) => a.at.localeCompare(b.at))
  for (const c of changes) {
    const row = counts.get(c.number) ?? {}
    row[c.element] = Math.max(row[c.element] ?? 0, c.nth)
    counts.set(c.number, row)
  }
  return counts
}

export type Risk = 'ok' | 'last' | 'over'

/** 'last': the next new one brings a penalty. 'over': already past the allowance. */
export function risk(used: number | undefined, allowance: number | null): Risk {
  if (used == null || allowance == null) return 'ok'
  if (used > allowance) return 'over'
  if (used === allowance) return 'last'
  return 'ok'
}

/** Index in `data.events` of the FIA event matching a session date: the one whose documents span it, or the nearest. */
export function eventIndexFor(data: PowerUnitSeason, date: string | undefined): number {
  if (!data.events.length) return -1
  if (!date) return data.events.length - 1
  const t = new Date(date).getTime()
  const DAY = 24 * 3600_000
  let best = -1
  let bestGap = Infinity
  data.events.forEach((e, i) => {
    const start = new Date(e.start).getTime() - 2 * DAY
    const end = new Date(e.end).getTime() + DAY
    const gap = t < start ? start - t : t > end ? t - end : 0
    if (gap < bestGap) {
      best = i
      bestGap = gap
    }
  })
  // A session more than a week from any event's documents (say, testing) has no event of its own.
  if (bestGap > 7 * DAY) return t < new Date(data.events[0].start).getTime() ? -1 : data.events.findLastIndex((e) => new Date(e.end).getTime() < t)
  return best
}
