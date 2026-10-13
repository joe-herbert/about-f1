import { useMemo, type ReactNode } from 'react'
import { useJConstructorStandings, useJDriverStandings, useJSchedule } from '../../api/jolpica/hooks'
import { DataTable, type Column } from '../../components/DataTable'
import { Empty, gate } from '../../components/ui'
import { useConstructorColors, useHistoryRef } from '../../lib/history'
import type { WidgetDef, WidgetProps } from '../types'
import { buildStyles, ConstructorCell, fmtPts, JDriverTag } from '../history/race-common'
import { weekendMax } from './shared'

interface Row {
  id: string
  pos: number
  points: number
  gap: number
  alive: boolean
  cell: ReactNode
}

function TitleFight({ opts }: WidgetProps) {
  const teams = opts.kind === 'teams'
  const ref = useHistoryRef()
  const schedule = useJSchedule(ref.year)
  const drivers = useJDriverStandings(teams ? null : ref.year)
  const constructors = useJConstructorStandings(teams ? ref.year : null)
  const q = teams ? constructors : drivers
  const colorOf = useConstructorColors()

  const table = q.data?.standings[0]
  const done = table ? Number(table.round) : 0

  const outlook = useMemo(() => {
    const left = (schedule.data?.races ?? []).filter((r) => Number(r.round) > done)
    const per = left.map((r) => ({ race: r, max: weekendMax(ref.year, !!r.Sprint, teams) }))
    const total = per.reduce((s, p) => s + p.max, 0)
    return { left, per, total, sprints: left.filter((r) => r.Sprint).length }
  }, [schedule.data, done, ref.year, teams])

  const rows = useMemo<Row[]>(() => {
    if (!table) return []
    const list = teams ? table.ConstructorStandings ?? [] : table.DriverStandings ?? []
    const leader = Number(list[0]?.points ?? 0)
    const styles = teams ? null : buildStyles(table.DriverStandings ?? [], colorOf)
    return list.slice(0, Number(opts.topN) || undefined).map((s, i) => {
      const points = Number(s.points)
      const gap = leader - points
      const ds = 'Driver' in s ? s : null
      const cs = 'Constructor' in s ? s : null
      return {
        id: ds?.Driver.driverId ?? cs!.Constructor.constructorId,
        pos: Number(s.position ?? i + 1),
        points,
        gap,
        alive: gap <= outlook.total,
        cell: ds ? (
          <span className="hr-driver">
            <JDriverTag d={ds.Driver} style={styles!.get(ds.Driver.driverId)} />
            <span className="minor-text">{ds.Driver.familyName}</span>
          </span>
        ) : (
          <ConstructorCell c={cs!.Constructor} color={colorOf(cs!.Constructor)} />
        ),
      }
    })
  }, [table, teams, colorOf, opts.topN, outlook.total])

  // Earliest race the leader could seal it: they take the maximum each weekend, P2 scores nothing.
  const clinched = rows.length > 1 && rows[0].points - rows[1].points > outlook.total
  const decider = useMemo(() => {
    if (rows.length < 2) return null
    let lead = rows[0].points - rows[1].points
    let rest = outlook.total
    if (lead > rest) return null
    for (const p of outlook.per) {
      lead += p.max
      rest -= p.max
      if (lead > rest) return p.race
    }
    return null
  }, [rows, outlook])

  const columns = useMemo<Column<Row>[]>(
    () => [
      { key: 'pos', label: 'Pos', align: 'right', width: 36, render: (r) => <b className="tnum">{r.pos}</b> },
      { key: 'name', label: teams ? 'Constructor' : 'Driver', render: (r) => r.cell },
      { key: 'points', label: 'Pts', align: 'right', render: (r) => <span className="tnum">{fmtPts(r.points)}</span> },
      { key: 'gap', label: 'Gap', align: 'right', render: (r) => <span className="tnum hr-minor">{r.gap ? `−${fmtPts(r.gap)}` : 'Leader'}</span> },
      {
        key: 'alive',
        label: 'In contention',
        align: 'right',
        sort: (r) => (r.alive ? 0 : 1),
        render: (r) => (r.alive ? <span className="hr-up">Yes</span> : <span className="hr-status">Out</span>),
      },
    ],
    [teams],
  )

  const g = gate(schedule, q)
  if (g) return g
  if (!table) return <Empty>No championship standings for {ref.year} yet. They appear after the first race.</Empty>

  const left = outlook.left.length
  return (
    <div className="hr-root">
      <div className="hr-caption">
        <strong>
          After round {done} of {done + left}
        </strong>
        <span>
          {left} race{left === 1 ? '' : 's'}
          {outlook.sprints ? ` and ${outlook.sprints} sprint${outlook.sprints === 1 ? '' : 's'}` : ''} left, {outlook.total} points on offer{teams ? ' per team' : ''}
        </span>
        {decider && (
          <span>
            Earliest it can be decided: <strong>{decider.raceName}</strong>
          </span>
        )}
        {clinched && <span>The title is decided.</span>}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowClassName={(r) => (r.alive ? undefined : 'hr-dim')} />
    </div>
  )
}

export const previewTitleFight: WidgetDef = {
  type: 'preview-title-fight',
  name: 'Title fight',
  description: 'The championship going into the race: points still on offer, who can still win the title, and the earliest race it could be decided.',
  category: 'Preview',
  sessionless: true,
  defaultSize: { w: 8, h: 12 },
  Component: TitleFight,
  options: [
    {
      key: 'kind',
      label: 'Championship',
      type: 'select',
      default: 'drivers',
      choices: [
        { value: 'drivers', label: 'Drivers' },
        { value: 'teams', label: 'Constructors' },
      ],
    },
    { key: 'topN', label: 'Rows', type: 'number', default: 10, min: 2, max: 30 },
  ],
}
