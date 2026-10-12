import type { DriverInfo } from '../../lib/drivers'
import { mix, type Tokens } from '../../lib/theme'
import type { DriverFilter } from '../types'
import type { Position, SessionResult } from '../../api/types'
import { latestPositions } from '../../lib/derive'

/** Series colour for a driver, faded toward the panel when dimmed. */
export function seriesColor(d: DriverInfo | undefined, n: number, filter: DriverFilter, t: Tokens) {
  const base = d?.color ?? '#8a8f98'
  return filter.dimmed(n) ? mix(base, t.panel, 0.75) : base
}

export const code = (d: DriverInfo | undefined, n: number) => d?.name_acronym ?? `#${n}`

/** Finishing order: session_result when present, else last known position. */
export function finishingOrder(results: SessionResult[] | undefined, positions?: Position[] | undefined): number[] {
  if (results?.length) {
    return [...results]
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
      .map((r) => r.driver_number)
  }
  const latest = latestPositions(positions)
  return [...latest.values()].sort((a, b) => a.position - b.position).map((p) => p.driver_number)
}

export function lineType(d: DriverInfo | undefined): 'solid' | number[] {
  return d?.secondary ? [6, 3] : 'solid'
}
