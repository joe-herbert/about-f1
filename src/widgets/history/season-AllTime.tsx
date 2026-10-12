import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useJAllWinners } from '../../api/jolpica/hooks'
import type { JConstructor } from '../../api/jolpica/types'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate } from '../../components/ui'
import { jName, useConstructorColors } from '../../lib/history'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'

interface Leader {
  id: string
  name: string
  wins: number
  main: JConstructor
  byDecade: Map<number, number>
  first: number
  last: number
}

function AllTime({ opts }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const winners = useJAllWinners()
  const colorOf = useConstructorColors()
  const kind = opts.kind === 'constructors' ? 'constructors' : 'drivers'
  const since = Number(opts.since) || 1950
  const topN = Math.max(3, Number(opts.topN) || 15)
  const view = String(opts.view)

  const leaders = useMemo<Leader[]>(() => {
    const m = new Map<string, Leader & { teams: Map<string, { c: JConstructor; n: number }> }>()
    for (const r of winners.data?.races ?? []) {
      const season = Number(r.season)
      if (season < since) continue
      const res = r.Results?.[0]
      if (!res) continue
      const id = kind === 'drivers' ? res.Driver.driverId : res.Constructor.constructorId
      const name = kind === 'drivers' ? jName(res.Driver) : res.Constructor.name
      const e = m.get(id) ?? { id, name, wins: 0, main: res.Constructor, byDecade: new Map(), first: season, last: season, teams: new Map() }
      e.wins++
      const dec = Math.floor(season / 10) * 10
      e.byDecade.set(dec, (e.byDecade.get(dec) ?? 0) + 1)
      e.first = Math.min(e.first, season)
      e.last = Math.max(e.last, season)
      const tc = e.teams.get(res.Constructor.constructorId) ?? { c: res.Constructor, n: 0 }
      tc.n++
      e.teams.set(res.Constructor.constructorId, tc)
      m.set(id, e)
    }
    return [...m.values()]
      .map((e) => ({ ...e, main: [...e.teams.values()].sort((a, b) => b.n - a.n)[0].c }))
      .sort((a, b) => b.wins - a.wins || a.first - b.first)
  }, [winners.data, kind, since])

  const option = useMemo<EChartsOption>(() => {
    if (view === 'decade') {
      const top = leaders.slice(0, 8)
      const decades = [...new Set(leaders.flatMap((l) => [...l.byDecade.keys()]))].sort((a, b) => a - b)
      const others = decades.map((d) => leaders.slice(8).reduce((a, l) => a + (l.byDecade.get(d) ?? 0), 0))
      const series: any[] = top.map((l, i) => ({
        type: 'bar',
        name: l.name,
        stack: 'wins',
        barMaxWidth: 24,
        data: decades.map((d) => l.byDecade.get(d) ?? 0),
        // Several leaders can share a constructor colour; alternate texture by outline.
        itemStyle: {
          color: colorOf(kind === 'drivers' ? l.main : l.id),
          borderColor: t.panel,
          borderWidth: 1,
          decal: i > 0 && top.slice(0, i).some((p) => colorOf(p.main) === colorOf(l.main)) ? { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 3], rotation: Math.PI / 4, color: 'rgba(255,255,255,0.45)' } : undefined,
        },
      }))
      series.push({ type: 'bar', name: 'Everyone else', stack: 'wins', barMaxWidth: 24, data: others, itemStyle: { color: t.axis, borderColor: t.panel, borderWidth: 1, borderRadius: [4, 4, 0, 0] } })
      return {
        grid: { left: 36, right: 12, top: showLegend ? 40 : 12, bottom: 24 },
        legend: showLegend ? { type: 'scroll', top: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10 } : undefined,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (ps: any) => {
            const arr = (Array.isArray(ps) ? ps : [ps]).filter((p: any) => p.value > 0).sort((a: any, b: any) => b.value - a.value)
            return tipTitle(`${arr[0]?.name ?? ''}s`) + arr.map((p: any) => tipRow(p.color, `${p.value} wins`, p.seriesName)).join('')
          },
        },
        xAxis: { type: 'category', data: decades.map((d) => `${d}`) },
        yAxis: { type: 'value', minInterval: 1 },
        series,
      }
    }
    const list = leaders.slice(0, topN).reverse()
    return {
      grid: { left: 8, right: 36, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const l = list[p.dataIndex]
          return tipTitle(l.name) + tipRow(colorOf(kind === 'drivers' ? l.main : l.id), `${l.wins} wins`, l.first === l.last ? `${l.first}` : `${l.first}–${l.last}`)
        },
      },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: { type: 'category', data: list.map((l) => l.name), axisLabel: { fontSize: 11 } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: list.map((l) => ({ value: l.wins, itemStyle: { color: colorOf(kind === 'drivers' ? l.main : l.id), borderRadius: [0, 4, 4, 0] } })),
          label: { show: true, position: 'right', fontSize: 11 },
        },
      ],
    }
  }, [leaders, view, topN, colorOf, kind, t, showLegend])

  const g = gate(winners)
  if (g) return g
  if (!leaders.length) return <Empty>No wins recorded since {since}.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'rank', label: '#', align: 'right' },
          { key: 'name', label: kind === 'drivers' ? 'Driver' : 'Constructor' },
          { key: 'wins', label: 'Wins', align: 'right' },
          { key: 'span', label: 'First–last win' },
        ],
        rows: leaders.map((l, i) => ({ rank: i + 1, name: l.name, wins: l.wins, span: `${l.first}–${l.last}` })),
      }}
    />
  )
}

export const histAllTime: WidgetDef = {
  type: 'hist-all-time',
  name: 'All-time win leaders',
  description: 'Most Grand Prix wins by driver or constructor since 1950 (or a year you choose), overall or decade by decade.',
  category: 'Records',
  sessionless: true,
  defaultSize: { w: 12, h: 14 },
  Component: AllTime,
  options: [
    { key: 'kind', label: 'Show', type: 'select', default: 'drivers', choices: [{ value: 'drivers', label: 'Drivers' }, { value: 'constructors', label: 'Constructors' }] },
    { key: 'view', label: 'View', type: 'select', default: 'total', choices: [{ value: 'total', label: 'Total wins' }, { value: 'decade', label: 'Wins by decade (top 8)' }] },
    { key: 'topN', label: 'Show top', type: 'number', default: 15, min: 3, max: 50 },
    { key: 'since', label: 'Count wins from', type: 'number', default: 1950, min: 1950, max: new Date().getFullYear(), help: 'Only wins from this season onward.' },
  ],
}
