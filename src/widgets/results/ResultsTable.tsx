import { useMemo } from 'react'
import { useLaps, useResults } from '../../api/hooks'
import type { SessionResult } from '../../api/types'
import { DataTable, type Column } from '../../components/DataTable'
import { DriverTag, Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap, type DriverInfo } from '../../lib/drivers'
import { fastestLap } from '../../lib/derive'
import { gap, lapTime, raceTime } from '../../lib/format'
import type { WidgetDef, WidgetProps } from '../types'
import { bestOf, resultStatus, sessionKind, sortResults } from './shared'
import './results.css'

interface Row {
  r: SessionResult
  d?: DriverInfo
  best: number | null
  gapBest: number | null
  dim: boolean
}

function ResultsTable({ sessionKey, session, opts, filter }: WidgetProps) {
  const results = useResults(sessionKey)
  const laps = useLaps(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const kind = sessionKind(session)

  const rows = useMemo<Row[]>(() => {
    const sorted = sortResults(results.data).filter((r) => filter.visible(r.driver_number))
    const bests = sorted.map((r) => bestOf(r.duration) ?? fastestLap(laps.data, r.driver_number)?.lap_duration ?? null)
    const top = Math.min(...bests.filter((b): b is number => b !== null))
    return sorted.map((r, i) => ({
      r,
      d: map.get(r.driver_number),
      best: kind === 'race' ? fastestLap(laps.data, r.driver_number)?.lap_duration ?? null : bests[i],
      gapBest: bests[i] !== null && isFinite(top) ? bests[i]! - top : null,
      dim: filter.dimmed(r.driver_number),
    }))
  }, [results.data, laps.data, map, filter, kind])

  const columns = useMemo<Column<Row>[]>(() => {
    const cols: Column<Row>[] = [
      { key: 'pos', label: 'Pos', align: 'right', width: 36, sort: (x) => x.r.position ?? 999, render: (x) => <b className="tnum">{x.r.position ?? resultStatus(x.r) ?? '—'}</b> },
      {
        key: 'driver',
        label: 'Driver',
        sort: (x) => x.d?.last_name ?? x.r.driver_number,
        render: (x) => (
          <span className="res-driver">
            {opts.showHeadshots && x.d?.headshot_url && <img className="res-headshot" src={x.d.headshot_url} alt="" loading="lazy" />}
            <DriverTag d={x.d} n={x.r.driver_number} dim={x.dim} />
            <span className="res-name minor-text">{x.d ? `${x.d.first_name} ${x.d.last_name}` : ''}</span>
          </span>
        ),
      },
    ]
    if (opts.showTeam) cols.push({ key: 'team', label: 'Team', minor: true, sort: (x) => x.d?.team_name ?? '', render: (x) => x.d?.team_name ?? '—' })
    cols.push({ key: 'laps', label: 'Laps', align: 'right', minor: true, sort: (x) => x.r.number_of_laps, render: (x) => <span className="tnum">{x.r.number_of_laps ?? '—'}</span> })

    if (kind === 'race') {
      cols.push({
        key: 'time',
        label: 'Time / gap',
        align: 'right',
        sort: (x) => (x.r.position ?? 999) as number,
        render: (x) => {
          const st = resultStatus(x.r)
          if (st) return <span className="res-status">{st}</span>
          if (x.r.position === 1 && typeof x.r.duration === 'number') return <span className="tnum">{raceTime(x.r.duration)}</span>
          return <span className="tnum">{gap(x.r.gap_to_leader as number | string | null)}</span>
        },
      })
      cols.push({ key: 'best', label: 'Best lap', align: 'right', minor: true, sort: (x) => x.best, render: (x) => <span className="tnum">{lapTime(x.best)}</span> })
      if (opts.showPoints) cols.push({ key: 'pts', label: 'Pts', align: 'right', sort: (x) => -(x.r.points ?? 0), render: (x) => <b className="tnum">{x.r.points ? x.r.points : ''}</b> })
    } else if (kind === 'quali') {
      for (const q of [0, 1, 2]) {
        cols.push({
          key: `q${q + 1}`,
          label: `Q${q + 1}`,
          align: 'right',
          sort: (x) => (Array.isArray(x.r.duration) ? x.r.duration[q] : null),
          render: (x) => <span className="tnum">{lapTime(Array.isArray(x.r.duration) ? x.r.duration[q] : null)}</span>,
        })
      }
      cols.push({ key: 'gap', label: 'Gap', align: 'right', sort: (x) => x.gapBest, render: (x) => <span className="tnum">{x.gapBest ? `+${x.gapBest.toFixed(3)}` : x.gapBest === 0 ? '' : '—'}</span> })
    } else {
      cols.push({ key: 'best', label: 'Best lap', align: 'right', sort: (x) => x.best, render: (x) => <span className="tnum">{lapTime(x.best)}</span> })
      cols.push({ key: 'gap', label: 'Gap', align: 'right', sort: (x) => x.gapBest, render: (x) => <span className="tnum">{x.gapBest ? `+${x.gapBest.toFixed(3)}` : x.gapBest === 0 ? '' : '—'}</span> })
    }
    return cols
  }, [opts, kind])

  if (!sessionKey) return <NeedSession />
  const g = gate(results)
  if (g) return g
  if (!rows.length) return <Empty>No classification published for this session yet.</Empty>
  return (
    <div className={`res-root ${opts.compact ? 'res-compact' : ''}`}>
      <DataTable columns={columns} rows={rows} rowKey={(x) => x.r.driver_number} rowClassName={(x) => (x.dim ? 'row-dim' : undefined)} />
    </div>
  )
}

export const resultsTable: WidgetDef = {
  type: 'results-table',
  name: 'Session classification',
  description: 'Final order for any session: race times and gaps, Q1–Q3 for qualifying, best laps for practice.',
  category: 'Results',
  defaultSize: { w: 8, h: 14 },
  usesDrivers: true,
  Component: ResultsTable,
  options: [
    { key: 'showTeam', label: 'Show team column', type: 'toggle', default: true },
    { key: 'showHeadshots', label: 'Show headshots', type: 'toggle', default: false },
    { key: 'showPoints', label: 'Show points', type: 'toggle', default: true },
    { key: 'compact', label: 'Compact rows', type: 'toggle', default: false },
  ],
}
