import { useEffect, useMemo, useState } from 'react'
import { useIntervals, useLaps, usePits, usePositions, useResults, useStints } from '../../api/hooks'
import { Compound, Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { groupBy, latestBy, positionsByLap } from '../../lib/derive'
import { lapTime } from '../../lib/format'
import type { WidgetDef, WidgetProps } from '../types'
import { PURPLE } from './FastestLaps'
import './race.css'

function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w] as const
}

function fmtGap(v: number | string | null | undefined, isLeader: boolean) {
  if (isLeader) return 'Leader'
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  return `+${v.toFixed(3)}`
}

function lastOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) {
    for (let i = v.length - 1; i >= 0; i--) if (v[i] != null) return v[i]
    return null
  }
  return v ?? null
}

interface Row {
  n: number
  pos: number | null
  gap: string
  last: number | null
  best: number | null
  compound: string | null
  tyreAge: number | undefined
  pits: number
  delta: number | null
  status: string | null
}

function TimingTower({ sessionKey, session, opts, filter }: WidgetProps) {
  // Pit stop timing exists from 2011; earlier seasons show a dash rather than zero.
  const pitsKnown = !session || session.year >= 2011
  const [ref, width] = useWidth<HTMLDivElement>()
  const positions = usePositions(sessionKey)
  const intervals = useIntervals(sessionKey)
  const laps = useLaps(sessionKey)
  const stints = useStints(sessionKey)
  const pits = usePits(sessionKey)
  const results = useResults(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const gapMode = String(opts.gap)

  const { rows, fastest } = useMemo(() => {
    const latestPos = latestBy(positions.data)
    const latestInt = latestBy(intervals.data)
    const lapsBy = groupBy(laps.data, (l) => l.driver_number)
    const stintsBy = groupBy(stints.data, (s) => s.driver_number)
    const pitsBy = groupBy(pits.data, (p) => p.driver_number)
    const resultBy = new Map((results.data ?? []).map((r) => [r.driver_number, r]))
    const grid = positionsByLap(laps.data, positions.data)
    const drivers = new Set<number>([...latestPos.keys(), ...resultBy.keys(), ...map.keys()])
    let fastest = Infinity
    const rows: Row[] = []
    for (const n of drivers) {
      if (!filter.visible(n)) continue
      const res = resultBy.get(n)
      const ls = (lapsBy.get(n) ?? []).sort((a, b) => a.lap_number - b.lap_number)
      const timed = ls.filter((l) => l.lap_duration)
      const last = timed[timed.length - 1]?.lap_duration ?? null
      const best = timed.filter((l) => !l.is_pit_out_lap).reduce<number | null>((m, l) => (m === null || l.lap_duration! < m ? l.lap_duration! : m), null)
      if (best !== null) fastest = Math.min(fastest, best)
      const st = (stintsBy.get(n) ?? []).sort((a, b) => b.stint_number - a.stint_number)[0]
      const lastLapNo = ls[ls.length - 1]?.lap_number ?? st?.lap_start ?? 0
      const pos = res?.position ?? latestPos.get(n)?.position ?? null
      const start = grid.get(n)?.[0] ?? null
      const int = latestInt.get(n)
      const resGap = lastOf(res?.gap_to_leader as any)
      const raw = int ? (gapMode === 'interval' ? int.interval : int.gap_to_leader) : resGap
      const status = res?.dsq ? 'DSQ' : res?.dns ? 'DNS' : res?.dnf ? 'DNF' : null
      rows.push({
        n,
        pos,
        gap: status ?? fmtGap(raw as any, pos === 1),
        last,
        best,
        compound: st?.compound ?? null,
        tyreAge: st ? st.tyre_age_at_start + Math.max(0, lastLapNo - st.lap_start) : undefined,
        pits: pitsBy.get(n)?.length ?? 0,
        delta: pos && start ? start - pos : null,
        status,
      })
    }
    rows.sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999) || a.n - b.n)
    return { rows, fastest }
  }, [positions.data, intervals.data, laps.data, stints.data, pits.data, results.data, map, gapMode, filter])

  if (!sessionKey) return <NeedSession />
  const g = gate(positions, laps, results)
  if (g) return g
  if (!rows.length) return <Empty>No timing data for this session yet.</Empty>
  const narrow = width < 440
  return (
    <div ref={ref} className={`tower${narrow ? ' tower-narrow' : ''}`} role="table" aria-label="Timing tower">
      <div className="tower-head" role="row">
        <span className="tower-pos">P</span>
        <span />
        <span>Driver</span>
        <span className="tower-num">{gapMode === 'interval' ? 'Interval' : 'Gap'}</span>
        <span className="tower-num wide">Last lap</span>
        <span className="tower-num wide">Best lap</span>
        <span className="wide" style={{ textAlign: 'center' }}>Tyre</span>
        <span className="tower-num wide">Pits</span>
        <span className="tower-delta">+/−</span>
      </div>
      {rows.map((r) => {
        const d = map.get(r.n)
        const isFastest = r.best !== null && r.best === fastest
        return (
          <div key={r.n} role="row" className={`tower-row${filter.dimmed(r.n) ? ' dim' : ''}${r.status ? ' out' : ''}`}>
            <span className="tower-pos">{r.pos ?? '—'}</span>
            <span className="tower-bar" style={{ background: d?.color ?? '#888' }} />
            <span className="tower-code">
              {d?.name_acronym ?? `#${r.n}`}
              {!narrow && opts.showTeam ? <small>{d?.team_name}</small> : null}
            </span>
            <span className="tower-num">{r.gap}</span>
            <span className="tower-num wide">{lapTime(r.last)}</span>
            <span className={`tower-num wide best${isFastest ? ' fastest' : ''}`}>
              {isFastest && <span className="sector-dot" style={{ background: PURPLE }} title="Fastest lap" />}
              {lapTime(r.best)}
            </span>
            <span className="wide" style={{ justifySelf: 'center' }}>
              {r.compound ? <Compound c={r.compound} age={r.tyreAge} /> : '—'}
            </span>
            <span className="tower-num wide">{pitsKnown ? r.pits : '—'}</span>
            <span className={`tower-delta ${r.delta === null ? 'same' : r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : 'same'}`}>
              {r.delta === null ? '' : r.delta > 0 ? `▲${r.delta}` : r.delta < 0 ? `▼${-r.delta}` : '–'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export const timingTower: WidgetDef = {
  type: 'timing-tower',
  name: 'Timing tower',
  description: 'Live-timing leaderboard with gaps, last and best laps, current tyre, stops and places gained.',
  category: 'Race',
  defaultSize: { w: 8, h: 18 },
  usesDrivers: true,
  Component: TimingTower,
  options: [
    { key: 'gap', label: 'Gap column', type: 'select', default: 'leader', choices: [{ value: 'leader', label: 'Gap to leader' }, { value: 'interval', label: 'Interval to car ahead' }] },
    { key: 'showTeam', label: 'Show team names', type: 'toggle', default: false },
  ],
}
