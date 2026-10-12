import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useJConstructorChampions, useJDriverChampions } from '../../api/jolpica/hooks'
import type { JConstructor } from '../../api/jolpica/types'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { DataTable } from '../../components/DataTable'
import { Empty, gate } from '../../components/ui'
import { jName, useConstructorColors } from '../../lib/history'
import type { WidgetDef, WidgetProps } from '../types'
import './history-season.css'

interface Row {
  season: number
  driver: string
  driverId: string
  constructor: JConstructor | undefined
  wins: number
  points: number
  team: JConstructor | undefined
  teamPoints: number | null
}

function Swatch({ color }: { color: string }) {
  return <span className="hs-swatch" style={{ background: color }} />
}

function Champions({ opts }: WidgetProps) {
  const drivers = useJDriverChampions()
  const teams = useJConstructorChampions()
  const colorOf = useConstructorColors()
  const view = String(opts.view)
  const topN = Math.max(3, Number(opts.topN) || 15)

  const rows = useMemo<Row[]>(() => {
    const teamBy = new Map(
      (teams.data?.standings ?? []).map((s) => [s.season, s.ConstructorStandings?.[0]]),
    )
    return (drivers.data?.standings ?? [])
      .map((s) => {
        const d = s.DriverStandings?.[0]
        const t = teamBy.get(s.season)
        return {
          season: Number(s.season),
          driver: d ? jName(d.Driver) : '—',
          driverId: d?.Driver.driverId ?? '',
          constructor: d?.Constructors.at(-1),
          wins: Number(d?.wins ?? 0),
          points: Number(d?.points ?? 0),
          team: t?.Constructor,
          teamPoints: t ? Number(t.points) : null,
        }
      })
      .filter((r) => r.driverId && r.season < new Date().getFullYear() + (isSeasonOver() ? 1 : 0))
      .sort((a, b) => b.season - a.season)
  }, [drivers.data, teams.data])

  const tally = useMemo(() => {
    const m = new Map<string, { name: string; seasons: number[]; byTeam: Map<string, { c: JConstructor; n: number }> }>()
    for (const r of rows) {
      const key = view === 'constructors' ? r.team?.constructorId : r.driverId
      const name = view === 'constructors' ? r.team?.name : r.driver
      const c = view === 'constructors' ? r.team : r.constructor
      if (!key || !name || !c) continue
      const e = m.get(key) ?? { name, seasons: [] as number[], byTeam: new Map<string, { c: JConstructor; n: number }>() }
      e.seasons.push(r.season)
      const bt = e.byTeam.get(c.constructorId) ?? { c, n: 0 }
      bt.n++
      e.byTeam.set(c.constructorId, bt)
      m.set(key, e)
    }
    return [...m.values()]
      .map((e) => ({ ...e, main: [...e.byTeam.values()].sort((a, b) => b.n - a.n)[0].c }))
      .sort((a, b) => b.seasons.length - a.seasons.length || Math.min(...a.seasons) - Math.min(...b.seasons))
      .slice(0, topN)
  }, [rows, view, topN])

  const option = useMemo<EChartsOption>(() => {
    const list = [...tally].reverse()
    return {
      grid: { left: 8, right: 36, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const e = list[p.dataIndex]
          return tipTitle(e.name) + tipRow(colorOf(e.main), `${e.seasons.length} titles`, e.seasons.sort((a, b) => a - b).join(', '))
        },
      },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: list.map((e) => e.name), axisLabel: { fontSize: 11 } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: list.map((e) => ({ value: e.seasons.length, itemStyle: { color: colorOf(e.main), borderRadius: [0, 4, 4, 0] } })),
          label: { show: true, position: 'right', fontSize: 11 },
        },
      ],
    }
  }, [tally, colorOf])

  const g = gate(drivers, teams)
  if (g) return g
  if (!rows.length) return <Empty>No championship data available.</Empty>

  if (view === 'table') {
    return (
      <DataTable
        rows={rows}
        rowKey={(r) => r.season}
        columns={[
          { key: 'season', label: 'Season', align: 'right' },
          { key: 'driver', label: 'Drivers’ champion', render: (r) => <span className="hs-cell"><Swatch color={colorOf(r.constructor)} />{r.driver}</span> },
          { key: 'constructor', label: 'Car', minor: true, sort: (r) => r.constructor?.name, render: (r) => r.constructor?.name ?? '—' },
          { key: 'wins', label: 'Wins', align: 'right' },
          { key: 'points', label: 'Points', align: 'right' },
          { key: 'team', label: 'Constructors’ champion', sort: (r) => r.team?.name, render: (r) => (r.team ? <span className="hs-cell"><Swatch color={colorOf(r.team)} />{r.team.name}</span> : <span className="minor-text">Not awarded</span>) },
        ]}
      />
    )
  }

  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'name', label: view === 'constructors' ? 'Constructor' : 'Driver' },
          { key: 'titles', label: 'Titles', align: 'right' },
          { key: 'seasons', label: 'Seasons' },
        ],
        rows: tally.map((e) => ({ name: e.name, titles: e.seasons.length, seasons: [...e.seasons].sort((a, b) => a - b).join(', ') })),
      }}
    />
  )
}

/** The current season's standings leader isn't champion until the season is done. */
function isSeasonOver() {
  const now = new Date()
  return now.getMonth() === 11 && now.getDate() > 10
}

export const histChampions: WidgetDef = {
  type: 'hist-champions',
  name: 'World champions',
  description: 'Every drivers’ and constructors’ champion since 1950, as a table or as title counts.',
  category: 'Records',
  sessionless: true,
  defaultSize: { w: 12, h: 14 },
  Component: Champions,
  options: [
    {
      key: 'view',
      label: 'View',
      type: 'select',
      default: 'table',
      choices: [
        { value: 'table', label: 'Champions by season' },
        { value: 'titles', label: 'Titles per driver' },
        { value: 'constructors', label: 'Titles per constructor' },
      ],
    },
    { key: 'topN', label: 'Show top (title counts)', type: 'number', default: 15, min: 3, max: 40 },
  ],
}
