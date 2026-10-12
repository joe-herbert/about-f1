import { useMemo } from 'react'
import { useLaps } from '../../api/hooks'
import type { Lap } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable'
import { DriverTag, Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { groupBy } from '../../lib/derive'
import { lapTime, speed } from '../../lib/format'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import './race.css'

export const PURPLE = '#a335ee'
export const GREEN = '#1fa34a'

interface Row {
  pos: number
  n: number
  lap: Lap
  gap: number
  s: (number | null)[]
  /** per sector: 'overall' | 'personal' | null */
  marks: ('overall' | 'personal' | null)[]
  ideal: number | null
  trap: number | null
}

export function SectorCell({ v, mark }: { v: number | null; mark: 'overall' | 'personal' | null }) {
  return (
    <span className="sector-cell">
      {mark && (
        <span
          className="sector-dot"
          style={{ background: mark === 'overall' ? PURPLE : GREEN }}
          title={mark === 'overall' ? 'Fastest of the session' : 'Personal best'}
        />
      )}
      {v != null ? v.toFixed(3) : '—'}
    </span>
  )
}

function FastestLaps({ sessionKey, opts, filter }: WidgetProps) {
  const laps = useLaps(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const prefs = useStore((s) => s.prefs)

  const rows = useMemo(() => {
    const valid = (laps.data ?? []).filter((l) => !l.is_pit_out_lap)
    const keys = ['duration_sector_1', 'duration_sector_2', 'duration_sector_3'] as const
    const overallBest = keys.map((k) => Math.min(...valid.map((l) => l[k] ?? Infinity)))
    const out: Row[] = []
    for (const [n, ls] of groupBy(valid, (l) => l.driver_number)) {
      if (!filter.visible(n)) continue
      const timed = ls.filter((l) => l.lap_duration)
      if (!timed.length) continue
      const best = timed.reduce((a, b) => (b.lap_duration! < a.lap_duration! ? b : a))
      const pbs = keys.map((k) => Math.min(...ls.map((l) => l[k] ?? Infinity)))
      const s = keys.map((k) => best[k])
      const marks = s.map((v, i) => (v == null ? null : v <= overallBest[i] ? 'overall' : v <= pbs[i] ? 'personal' : null))
      const ideal = pbs.every(isFinite) ? pbs.reduce((a, b) => a + b, 0) : null
      const trap = Math.max(...ls.map((l) => l.st_speed ?? 0)) || null
      out.push({ pos: 0, n, lap: best, gap: 0, s, marks, ideal, trap })
    }
    out.sort((a, b) => a.lap.lap_duration! - b.lap.lap_duration!)
    const top = out[0]?.lap.lap_duration ?? 0
    out.forEach((r, i) => {
      r.pos = i + 1
      r.gap = r.lap.lap_duration! - top
    })
    return out
  }, [laps.data, filter])

  const columns = useMemo(() => {
    const cols: Column<Row>[] = [
      { key: 'pos', label: 'Pos', align: 'right', width: 36 },
      { key: 'driver', label: 'Driver', sort: (r) => map.get(r.n)?.name_acronym, render: (r) => <DriverTag d={map.get(r.n)} n={r.n} dim={filter.dimmed(r.n)} /> },
      { key: 'time', label: 'Time', align: 'right', sort: (r) => r.lap.lap_duration, render: (r) => <b>{lapTime(r.lap.lap_duration)}</b> },
      { key: 'gap', label: 'Gap', align: 'right', render: (r) => (r.gap ? `+${r.gap.toFixed(3)}` : '—') },
      { key: 'lapNo', label: 'Lap', align: 'right', minor: true, sort: (r) => r.lap.lap_number, render: (r) => r.lap.lap_number },
    ]
    // Sector splits only exist in live timing (2023 onward).
    const hasSectors = rows.some((r) => r.s.some((v) => v !== null && v !== undefined))
    if (opts.showSectors && hasSectors) {
      for (let i = 0; i < 3; i++) {
        cols.push({ key: `s${i}`, label: `S${i + 1}`, align: 'right', minor: true, sort: (r) => r.s[i], render: (r) => <SectorCell v={r.s[i]} mark={r.marks[i]} /> })
      }
    }
    if (opts.showIdeal && hasSectors) cols.push({ key: 'ideal', label: 'Ideal lap', align: 'right', minor: true, render: (r) => lapTime(r.ideal) })
    if (opts.showTrap && rows.some((r) => r.trap)) cols.push({ key: 'trap', label: 'Top speed', align: 'right', minor: true, render: (r) => speed(r.trap, prefs) })
    return cols
  }, [map, opts, prefs, filter, rows])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  if (!rows.length) return <Empty>No timed laps in this session yet.</Empty>
  return (
    <div className="race-fill">
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.n} />
      {opts.showSectors && (
        <div className="race-key">
          <span><span className="sector-dot" style={{ background: PURPLE }} /> Fastest of the session</span>
          <span><span className="sector-dot" style={{ background: GREEN }} /> Personal best</span>
        </div>
      )}
    </div>
  )
}

export const fastestLaps: WidgetDef = {
  type: 'fastest-laps',
  name: 'Fastest laps',
  description: 'Each driver’s quickest lap with sectors, gap to the fastest, ideal lap and top speed.',
  category: 'Laps',
  minYear: 1996,
  defaultSize: { w: 12, h: 11 },
  usesDrivers: true,
  Component: FastestLaps,
  options: [
    { key: 'showSectors', label: 'Show sector times', type: 'toggle', default: true },
    { key: 'showIdeal', label: 'Show ideal lap (best sectors combined)', type: 'toggle', default: true },
    { key: 'showTrap', label: 'Show top speed', type: 'toggle', default: false },
  ],
}
