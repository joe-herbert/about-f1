import type { Session, SessionResult } from '../../api/types'
import type { DriverInfo } from '../../lib/drivers'
import { mix, type Tokens } from '../../lib/theme'

export type SessionKind = 'race' | 'quali' | 'practice'

export function sessionKind(s: Session | undefined): SessionKind {
  if (!s) return 'race'
  if (s.session_type === 'Race') return 'race'
  if (s.session_type === 'Qualifying' || /qualifying|shootout/i.test(s.session_name)) return 'quali'
  return 'practice'
}

export function resultStatus(r: SessionResult): string | null {
  if (r.dsq) return 'DSQ'
  if (r.dns) return 'DNS'
  if (r.dnf) return 'DNF'
  return null
}

/** Series colour for a driver, faded toward the panel when dimmed. */
export function driverColor(d: DriverInfo | undefined, dim: boolean, t: Tokens) {
  const c = d?.color ?? '#8a8f98'
  return dim ? mix(c, t.panel, 0.75) : c
}

/** Best qualifying time from a duration array. */
export function bestOf(v: SessionResult['duration']): number | null {
  if (Array.isArray(v)) {
    const xs = v.filter((x): x is number => typeof x === 'number')
    return xs.length ? Math.min(...xs) : null
  }
  return typeof v === 'number' ? v : null
}

export function sortResults(rs: SessionResult[] | undefined) {
  return [...(rs ?? [])].sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || (b.number_of_laps ?? 0) - (a.number_of_laps ?? 0))
}
