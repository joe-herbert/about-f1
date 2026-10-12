import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useJCircuitPoles, useJCircuitWinners } from '../../api/jolpica/hooks'
import type { JConstructor, JDriver } from '../../api/jolpica/types'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { DataTable, type Column } from '../../components/DataTable'
import { Empty, gate } from '../../components/ui'
import { jName, useConstructorColors, useHistTarget } from '../../lib/history'
import { useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import { ConstructorCell, TARGET_OPTIONS } from './race-common'

interface WinRow {
  season: number
  round: number
  raceName: string
  d: JDriver
  c: JConstructor
  time: string
}

function HistCircuit({ opts }: WidgetProps) {
  const t = useTokens()
  const target = useHistTarget(opts)
  const circuit = target.race?.Circuit
  const view = String(opts.view)
  const winners = useJCircuitWinners(circuit?.circuitId)
  const poles = useJCircuitPoles(view === 'poles' ? circuit?.circuitId : null)
  const colorOf = useConstructorColors()

  const wins = useMemo<WinRow[]>(
    () =>
      (winners.data?.races ?? [])
        .filter((r) => r.Results?.[0])
        .map((r) => ({
          season: Number(r.season),
          round: Number(r.round),
          raceName: r.raceName,
          d: r.Results![0].Driver,
          c: r.Results![0].Constructor,
          time: r.Results![0].Time?.time ?? r.Results![0].status,
        }))
        .sort((a, b) => b.season - a.season),
    [winners.data],
  )

  const poleRows = useMemo<WinRow[]>(
    () =>
      (poles.data?.races ?? [])
        .filter((r) => r.QualifyingResults?.[0])
        .map((r) => {
          const q = r.QualifyingResults![0]
          return { season: Number(r.season), round: Number(r.round), raceName: r.raceName, d: q.Driver, c: q.Constructor, time: q.Q3 || q.Q2 || q.Q1 || '' }
        })
        .sort((a, b) => b.season - a.season),
    [poles.data],
  )

  const tally = useMemo(() => {
    const by = view === 'constructors' ? (w: WinRow) => w.c.constructorId : (w: WinRow) => w.d.driverId
    const m = new Map<string, { w: WinRow; count: number; years: number[] }>()
    for (const w of wins) {
      const k = by(w)
      const e = m.get(k) ?? { w, count: 0, years: [] }
      e.count++
      e.years.push(w.season)
      m.set(k, e)
    }
    return [...m.values()].sort((a, b) => b.count - a.count || Math.max(...b.years) - Math.max(...a.years)).slice(0, Number(opts.topN) || 10)
  }, [wins, view, opts.topN])

  const option = useMemo<EChartsOption>(() => {
    const isTeam = view === 'constructors'
    return {
      grid: { left: 8, right: 32, top: 8, bottom: 24, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const e = tally[p.dataIndex]
          const name = isTeam ? e.w.c.name : jName(e.w.d)
          return tipTitle(name) + tipRow(p.color, `${e.count} win${e.count > 1 ? 's' : ''}`, [...e.years].sort().join(', '))
        },
      },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', inverse: true, data: tally.map((e) => (isTeam ? e.w.c.name : e.w.d.familyName)), axisLabel: { fontSize: 11, color: t.ink2 } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: tally.map((e) => ({ value: e.count, itemStyle: { color: colorOf(e.w.c), borderRadius: [0, 4, 4, 0] } })),
          label: { show: true, position: 'right', color: t.ink2, fontSize: 11 },
        },
      ],
    }
  }, [tally, view, colorOf, t])

  const columns = useMemo<Column<WinRow>[]>(
    () => [
      { key: 'season', label: 'Year', align: 'right', width: 48, render: (r) => <span className="tnum">{r.season}</span> },
      { key: 'driver', label: view === 'poles' ? 'Pole' : 'Winner', sort: (r) => r.d.familyName, render: (r) => <span className="hr-driver">{jName(r.d)}</span> },
      { key: 'team', label: 'Constructor', minor: true, sort: (r) => r.c.name, render: (r) => <ConstructorCell c={r.c} color={colorOf(r.c)} /> },
      { key: 'time', label: view === 'poles' ? 'Time' : 'Race time', align: 'right', minor: true, render: (r) => <span className="tnum hr-minor">{r.time}</span> },
    ],
    [view, colorOf],
  )

  const tallyTable = useMemo(
    () => ({
      columns: [
        { key: 'name', label: view === 'constructors' ? 'Constructor' : 'Driver' },
        { key: 'count', label: 'Wins', align: 'right' as const },
        { key: 'years', label: 'Years' },
      ],
      rows: tally.map((e) => ({ name: view === 'constructors' ? e.w.c.name : jName(e.w.d), count: e.count, years: [...e.years].sort().join(', ') })),
    }),
    [tally, view],
  )

  if (!target.round && !target.isLoading) return <Empty>No races found for {target.year}.</Empty>
  if (!circuit) return gate(winners) ?? <Empty>Loading the race…</Empty>
  const g = gate(winners, ...(view === 'poles' ? [poles] : []))
  if (g) return g

  const years = wins.map((w) => w.season)
  const first = years.length ? Math.min(...years) : null

  return (
    <div className="hr-root">
      <div className="hr-caption">
        <strong>{circuit.circuitName}</strong>
        {first && <span>First Grand Prix here in {first}</span>}
        <span>
          {wins.length} race{wins.length === 1 ? '' : 's'} held
        </span>
      </div>
      <div className="hr-fill">
        {view === 'drivers' || view === 'constructors' ? (
          <Chart option={option} table={tallyTable} />
        ) : view === 'poles' ? (
          poleRows.length ? (
            <DataTable columns={columns} rows={poleRows} rowKey={(r) => `${r.season}-${r.round}`} />
          ) : (
            <Empty>No pole records here. Qualifying results are available from 1994 onward.</Empty>
          )
        ) : (
          <DataTable columns={columns} rows={wins} rowKey={(r) => `${r.season}-${r.round}`} />
        )}
      </div>
    </div>
  )
}

export const histCircuit: WidgetDef = {
  type: 'hist-circuit',
  name: 'Circuit history',
  description: 'Every Grand Prix ever held at this race’s circuit: winners by year, the most successful drivers and constructors here, and pole sitters.',
  category: 'Records',
  sessionless: true,
  defaultSize: { w: 12, h: 14 },
  Component: HistCircuit,
  options: [
    ...TARGET_OPTIONS,
    {
      key: 'view',
      label: 'Show',
      type: 'select',
      default: 'table',
      choices: [
        { value: 'table', label: 'Winners by year' },
        { value: 'drivers', label: 'Most wins: drivers' },
        { value: 'constructors', label: 'Most wins: constructors' },
        { value: 'poles', label: 'Pole sitters' },
      ],
    },
    { key: 'topN', label: 'Bars to show', type: 'number', default: 10, min: 3, max: 40 },
  ],
}
