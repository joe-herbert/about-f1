import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useJConstructorStandings, useJDriverStandings, useJSchedule, useJSeasonResults } from '../../api/jolpica/hooks'
import type { JConstructor } from '../../api/jolpica/types'
import { Chart, tipRow } from '../../components/Chart'
import { Empty, gate } from '../../components/ui'
import { jCode, jName, useConstructorColors, useHistTarget } from '../../lib/history'
import type { WidgetDef, WidgetProps } from '../types'
import { SEASON_OPTION } from './season-shared'
import './history-season.css'

function SeasonSummary({ opts }: WidgetProps) {
  const { year } = useHistTarget(opts)
  const results = useJSeasonResults(year)
  const schedule = useJSchedule(year)
  const dStand = useJDriverStandings(year)
  const cStand = useJConstructorStandings(year >= 1958 ? year : null)
  const colorOf = useConstructorColors()

  const m = useMemo(() => {
    const races = (results.data?.races ?? []).filter((r) => r.Results?.length)
    const wins = new Map<string, { name: string; code: string; n: number; c: JConstructor }>()
    const poles = new Map<string, { name: string; n: number }>()
    for (const r of races) {
      const w = r.Results!.find((x) => x.position === '1')
      if (w) {
        const e = wins.get(w.Driver.driverId) ?? { name: jName(w.Driver), code: jCode(w.Driver), n: 0, c: w.Constructor }
        e.n++
        wins.set(w.Driver.driverId, e)
      }
      const p = r.Results!.find((x) => x.grid === '1')
      if (p) {
        const e = poles.get(p.Driver.driverId) ?? { name: jName(p.Driver), n: 0 }
        e.n++
        poles.set(p.Driver.driverId, e)
      }
    }
    const winList = [...wins.values()].sort((a, b) => b.n - a.n)
    const poleList = [...poles.values()].sort((a, b) => b.n - a.n)
    const leader = dStand.data?.standings.at(-1)?.DriverStandings?.[0]
    const team = cStand.data?.standings.at(-1)?.ConstructorStandings?.[0]
    const scheduled = schedule.data?.races.length ?? races.length
    return { races: races.length, scheduled, winList, poleList, leader, team, done: races.length >= scheduled }
  }, [results.data, schedule.data, dStand.data, cStand.data])

  const option = useMemo<EChartsOption>(() => {
    const list = m.winList.slice(0, 10).reverse()
    return {
      grid: { left: 8, right: 28, top: 4, bottom: 4, containLabel: true },
      tooltip: { trigger: 'item', formatter: (p: any) => tipRow(colorOf(list[p.dataIndex].c), `${list[p.dataIndex].n} wins`, list[p.dataIndex].name) },
      xAxis: { type: 'value', show: false },
      yAxis: { type: 'category', data: list.map((w) => w.code), axisLine: { show: false }, axisLabel: { fontSize: 11 } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 14,
          data: list.map((w) => ({ value: w.n, itemStyle: { color: colorOf(w.c), borderRadius: [0, 4, 4, 0] } })),
          label: { show: true, position: 'right', fontSize: 11 },
        },
      ],
    }
  }, [m.winList, colorOf])

  const g = gate(results, schedule, dStand, cStand)
  if (g) return g
  if (!m.races) return <Empty>No races have been run in {year} yet.</Empty>
  const tile = (label: string, value: string, sub?: string, color?: string) => (
    <div className="hs-tile">
      <span className="hs-stat-label">{label}</span>
      <span className="hs-tile-value">
        {color && <span className="hs-team-bar" style={{ background: color }} />}
        {value}
      </span>
      {sub && <span className="hs-tile-sub">{sub}</span>}
    </div>
  )
  const top = m.winList[0]
  const pole = m.poleList[0]
  return (
    <div className="hs-summary">
      <div className="hs-tiles">
        {m.leader &&
          tile(
            m.done ? 'Drivers’ champion' : 'Championship leader',
            m.leader.Driver.familyName,
            `${m.leader.Constructors.at(-1)?.name ?? ''}, ${m.leader.points} pts`,
            colorOf(m.leader.Constructors.at(-1)),
          )}
        {m.team && tile(m.done ? 'Constructors’ champion' : 'Leading constructor', m.team.Constructor.name, `${m.team.points} pts`, colorOf(m.team.Constructor))}
        {tile('Races', m.done ? String(m.races) : `${m.races} of ${m.scheduled}`)}
        {tile('Different winners', String(m.winList.length))}
        {top && tile('Most wins', String(top.n), top.name)}
        {pole && tile('Most pole starts', String(pole.n), pole.name)}
      </div>
      <div className="hs-summary-chart">
        <span className="hs-stat-label">Wins by driver</span>
        <div className="hs-summary-plot">
          <Chart
            option={option}
            table={{
              columns: [
                { key: 'name', label: 'Driver' },
                { key: 'n', label: 'Wins', align: 'right' },
              ],
              rows: m.winList,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export const histSeasonSummary: WidgetDef = {
  type: 'hist-season-summary',
  name: 'Season at a glance',
  description: 'Champion, constructors’ champion, races, number of different winners, most wins and most pole starts for any season.',
  category: 'Championship',
  sessionless: true,
  defaultSize: { w: 12, h: 12 },
  Component: SeasonSummary,
  options: [SEASON_OPTION],
}
