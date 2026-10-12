import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { DriverInfo } from '../lib/drivers'
import { COMPOUNDS, compoundColor, inkOn, useTokens } from '../lib/theme'

export function Loading({ label = 'Loading data' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}…</span>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>
}

export function ErrorState({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : 'Request failed.'
  return <div className="state state-error">{msg}</div>
}

/**
 * Returns a placeholder while any query is loading or failed, else null.
 * Usage: `const g = gate(a, b); if (g) return g`
 */
export function gate(...qs: Pick<UseQueryResult, 'isLoading' | 'error' | 'isPending' | 'fetchStatus'>[]): ReactNode | null {
  const err = qs.find((q) => q.error)
  if (err) return <ErrorState error={err.error} />
  if (qs.some((q) => q.isLoading || (q.isPending && q.fetchStatus !== 'idle'))) return <Loading />
  return null
}

export function NeedSession() {
  return <Empty>Pick a session in the header to load this panel.</Empty>
}

export function DriverTag({ d, n, dim }: { d?: DriverInfo; n: number; dim?: boolean }) {
  return (
    <span className="driver-tag" style={{ opacity: dim ? 0.4 : 1 }}>
      <span
        className="driver-swatch"
        style={{
          background: d?.secondary ? 'transparent' : d?.color ?? '#888',
          boxShadow: `inset 0 0 0 2px ${d?.color ?? '#888'}`,
        }}
      />
      <span className="driver-code">{d?.name_acronym ?? `#${n}`}</span>
    </span>
  )
}

export function TeamBar({ color }: { color: string }) {
  return <span className="team-bar" style={{ background: color }} />
}

export function Compound({ c, age }: { c: string; age?: number }) {
  const t = useTokens()
  const k = COMPOUNDS[c?.toUpperCase()] ?? COMPOUNDS.UNKNOWN
  const color = compoundColor(c, t)
  return (
    <span className="compound" title={`${k.label}${age !== undefined ? `, ${age} laps old` : ''}`}>
      <span className="compound-dot" style={{ borderColor: color, color: t.ink }}>
        {k.short}
      </span>
      {age !== undefined && <span className="compound-age">{age}</span>}
    </span>
  )
}

export function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="pill" style={{ background: color, color: inkOn(color) }}>
      {children}
    </span>
  )
}

export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean; rect?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label} className="legend-item">
          <span
            className={it.rect ? 'legend-rect' : 'legend-line'}
            style={it.rect ? { background: it.color } : { borderTop: `2px ${it.dashed ? 'dashed' : 'solid'} ${it.color}` }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}
