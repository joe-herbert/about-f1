import type { JConstructor, JDriver } from '../../api/jolpica/types'
import { jCode } from '../../lib/history'
import { mix, type Tokens } from '../../lib/theme'
import type { OptionSpec } from '../types'
import './history-race.css'

/** Season + round options every race-level History panel starts with. */
export const TARGET_OPTIONS: OptionSpec[] = [
  { key: 'season', type: 'season', default: 0, label: 'Season' },
  { key: 'round', type: 'number', default: 0, min: 0, max: 30, label: 'Round', help: '0 = latest completed (or the header’s race)' },
]

export interface JStyle {
  color: string
  /** Second driver of a constructor (by order of appearance): dashed / hollow */
  secondary: boolean
}

/** Colour + teammate flag per driverId, from (driver, constructor) pairs in display order. */
export function buildStyles(
  pairs: { Driver: JDriver; Constructor?: JConstructor; Constructors?: JConstructor[] }[],
  colorOf: (c: JConstructor | string | undefined) => string,
): Map<string, JStyle> {
  const out = new Map<string, JStyle>()
  const seen = new Set<string>()
  for (const p of pairs) {
    if (out.has(p.Driver.driverId)) continue
    const c = p.Constructor ?? p.Constructors?.[p.Constructors.length - 1]
    const cid = c?.constructorId ?? '?'
    out.set(p.Driver.driverId, { color: colorOf(c), secondary: seen.has(cid) })
    seen.add(cid)
  }
  return out
}

export function fade(color: string, dim: boolean, t: Tokens) {
  return dim ? mix(color, t.panel, 0.75) : color
}

/** Driver label: coloured key + code, in ink. */
export function JDriverTag({ d, style, dim }: { d: JDriver; style?: JStyle; dim?: boolean }) {
  const c = style?.color ?? '#8a8f98'
  return (
    <span className="driver-tag" style={{ opacity: dim ? 0.4 : 1 }}>
      <span className="driver-swatch" style={{ background: style?.secondary ? 'transparent' : c, boxShadow: `inset 0 0 0 2px ${c}` }} />
      <span className="driver-code">{jCode(d)}</span>
    </span>
  )
}

export function ConstructorCell({ c, color }: { c: JConstructor; color: string }) {
  return (
    <span className="hr-team">
      <span className="team-bar" style={{ background: color }} />
      {c.name}
    </span>
  )
}

export const fmtPts = (s: string | number | null | undefined) => {
  if (s === null || s === undefined || s === '') return '—'
  const n = Number(s)
  return String(Math.round(n * 10) / 10)
}
