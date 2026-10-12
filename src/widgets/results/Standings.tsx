import { useMemo } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { useChampionshipDrivers, useChampionshipTeams } from '../../api/hooks'
import { DataTable, type Column } from '../../components/DataTable'
import { DriverTag, Empty, gate, NeedSession, TeamBar } from '../../components/ui'
import { teamColorMap, useDriverMap, useDriverMapWithSeason, type DriverInfo } from '../../lib/drivers'
import type { WidgetDef, WidgetProps } from '../types'
import './results.css'

function Change({ from, to }: { from: number | null; to: number | null }) {
  if (!from || !to || from === to)
    return (
      <span className="std-change">
        <Minus size={11} aria-label="No change" />
      </span>
    )
  const up = to < from
  return (
    <span className={`std-change ${up ? 'up' : 'down'}`} title={`P${from} → P${to}`}>
      {up ? <ArrowUp size={12} aria-label="Up" /> : <ArrowDown size={12} aria-label="Down" />}
      {Math.abs(from - to)}
    </span>
  )
}

const pts = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10))

const notRace = <Empty>Championship standings are published after races and sprints. Pick a race session.</Empty>

/* ---------- drivers ---------- */

interface DRow {
  n: number
  d?: DriverInfo
  pos: number | null
  start: number | null
  points: number
  gained: number
  gap: number
  dim: boolean
}

function DriverStandings({ sessionKey, opts, filter }: WidgetProps) {
  const q = useChampionshipDrivers(sessionKey)
  const { map } = useDriverMapWithSeason(sessionKey)
  const rows = useMemo<DRow[]>(() => {
    const data = [...(q.data ?? [])].sort((a, b) => (a.position_current ?? 999) - (b.position_current ?? 999))
    const leader = data[0]?.points_current ?? 0
    return data
      .filter((r) => filter.visible(r.driver_number))
      .slice(0, Number(opts.topN) || undefined)
      .map((r) => ({
        n: r.driver_number,
        d: map.get(r.driver_number) ?? (r.driver ? { ...r.driver, color: r.driver.team_colour ? `#${r.driver.team_colour}` : '#8a8f98', secondary: false } : undefined),
        pos: r.position_current,
        start: r.position_start,
        points: r.points_current ?? 0,
        gained: (r.points_current ?? 0) - (r.points_start ?? 0),
        gap: leader - (r.points_current ?? 0),
        dim: filter.dimmed(r.driver_number),
      }))
  }, [q.data, map, filter, opts.topN])

  const columns = useMemo<Column<DRow>[]>(() => {
    const c: Column<DRow>[] = [
      { key: 'pos', label: 'Pos', align: 'right', width: 36, render: (r) => <b className="tnum">{r.pos ?? '—'}</b> },
      { key: 'chg', label: '', width: 36, sort: (r) => (r.start ?? 0) - (r.pos ?? 0), render: (r) => <Change from={r.start} to={r.pos} /> },
      {
        key: 'driver',
        label: 'Driver',
        sort: (r) => r.d?.last_name ?? r.n,
        render: (r) => (
          <span className="res-driver">
            <DriverTag d={r.d} n={r.n} dim={r.dim} />
            <span className="minor-text">{r.d?.last_name ?? ''}</span>
          </span>
        ),
      },
    ]
    if (opts.showTeam) c.push({ key: 'team', label: 'Team', minor: true, sort: (r) => r.d?.team_name ?? '', render: (r) => r.d?.team_name ?? '—' })
    c.push({ key: 'points', label: 'Pts', align: 'right', sort: (r) => -r.points, render: (r) => <b className="tnum">{pts(r.points)}</b> })
    c.push({ key: 'gained', label: 'This round', align: 'right', minor: true, sort: (r) => -r.gained, render: (r) => <span className="tnum minor-text">{r.gained ? `+${pts(r.gained)}` : ''}</span> })
    if (opts.showGap) c.push({ key: 'gap', label: 'Gap', align: 'right', minor: true, sort: (r) => r.gap, render: (r) => <span className="tnum">{r.gap ? `−${pts(r.gap)}` : ''}</span> })
    return c
  }, [opts.showTeam, opts.showGap])

  if (!sessionKey) return <NeedSession />
  const g = gate(q)
  if (g) return g
  if (!q.data?.length) return notRace
  return (
    <div className="res-root">
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.n} rowClassName={(r) => (r.dim ? 'row-dim' : undefined)} />
    </div>
  )
}

/* ---------- teams ---------- */

interface TRow {
  team: string
  color: string
  pos: number | null
  start: number | null
  points: number
  gained: number
  gap: number
}

function TeamStandings({ sessionKey, opts }: WidgetProps) {
  const q = useChampionshipTeams(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const rows = useMemo<TRow[]>(() => {
    const colors = teamColorMap(map)
    const data = [...(q.data ?? [])].sort((a, b) => (a.position_current ?? 999) - (b.position_current ?? 999))
    const leader = data[0]?.points_current ?? 0
    return data.map((r) => ({
      team: r.team_name,
      color: colors.get(r.team_name) ?? '#8a8f98',
      pos: r.position_current,
      start: r.position_start,
      points: r.points_current ?? 0,
      gained: (r.points_current ?? 0) - (r.points_start ?? 0),
      gap: leader - (r.points_current ?? 0),
    }))
  }, [q.data, map])

  const columns = useMemo<Column<TRow>[]>(() => {
    const c: Column<TRow>[] = [
      { key: 'pos', label: 'Pos', align: 'right', width: 36, render: (r) => <b className="tnum">{r.pos ?? '—'}</b> },
      { key: 'chg', label: '', width: 36, sort: (r) => (r.start ?? 0) - (r.pos ?? 0), render: (r) => <Change from={r.start} to={r.pos} /> },
      {
        key: 'team',
        label: 'Team',
        render: (r) => (
          <span className="std-team">
            <TeamBar color={r.color} />
            {r.team}
          </span>
        ),
      },
      { key: 'points', label: 'Pts', align: 'right', sort: (r) => -r.points, render: (r) => <b className="tnum">{pts(r.points)}</b> },
      { key: 'gained', label: 'This round', align: 'right', minor: true, sort: (r) => -r.gained, render: (r) => <span className="tnum minor-text">{r.gained ? `+${pts(r.gained)}` : ''}</span> },
    ]
    if (opts.showGap) c.push({ key: 'gap', label: 'Gap', align: 'right', minor: true, sort: (r) => r.gap, render: (r) => <span className="tnum">{r.gap ? `−${pts(r.gap)}` : ''}</span> })
    return c
  }, [opts.showGap])

  if (!sessionKey) return <NeedSession />
  const g = gate(q)
  if (g) return g
  if (!q.data?.length) return notRace
  return (
    <div className="res-root">
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.team} />
    </div>
  )
}

export const driverStandings: WidgetDef = {
  type: 'driver-standings',
  name: 'Drivers’ championship',
  description: 'Championship table after the selected race, with places moved and points scored this round.',
  category: 'Championship',
  defaultSize: { w: 7, h: 14 },
  usesDrivers: true,
  Component: DriverStandings,
  options: [
    { key: 'showTeam', label: 'Show team column', type: 'toggle', default: false },
    { key: 'showGap', label: 'Show gap to leader', type: 'toggle', default: true },
    { key: 'topN', label: 'Rows to show', type: 'number', default: 0, min: 0, max: 30, help: '0 shows everyone.' },
  ],
}

export const teamStandings: WidgetDef = {
  type: 'team-standings',
  name: 'Constructors’ championship',
  description: 'Team standings after the selected race, with places moved and points scored this round.',
  category: 'Championship',
  defaultSize: { w: 7, h: 10 },
  Component: TeamStandings,
  options: [{ key: 'showGap', label: 'Show gap to leader', type: 'toggle', default: true }],
}
