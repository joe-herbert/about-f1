import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useChampionshipDrivers, useChampionshipTeams } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { teamColorMap, useDriverMapWithSeason } from '../../lib/drivers'
import { mix, useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { driverColor } from './shared'

interface Row {
  name: string
  color: string
  start: number
  current: number
  hollow: boolean
}

function PointsBar({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const teams = opts.kind === 'teams'
  const dq = useChampionshipDrivers(teams ? null : sessionKey)
  const tq = useChampionshipTeams(teams ? sessionKey : null)
  const { map } = useDriverMapWithSeason(sessionKey)

  const rows = useMemo<Row[]>(() => {
    let out: Row[]
    if (teams) {
      const colors = teamColorMap(map)
      out = (tq.data ?? []).map((r) => ({
        name: r.team_name,
        color: colors.get(r.team_name) ?? '#8a8f98',
        start: r.points_start ?? 0,
        current: r.points_current ?? 0,
        hollow: false,
      }))
    } else {
      out = (dq.data ?? [])
        .filter((r) => filter.visible(r.driver_number))
        .map((r) => {
          const d = map.get(r.driver_number)
          return {
            name: d?.name_acronym ?? `#${r.driver_number}`,
            color: driverColor(d, filter.dimmed(r.driver_number), t),
            start: r.points_start ?? 0,
            current: r.points_current ?? 0,
            hollow: !!d?.secondary,
          }
        })
    }
    out.sort((a, b) => b.current - a.current)
    const n = Number(opts.topN)
    return n > 0 ? out.slice(0, n) : out
  }, [teams, tq.data, dq.data, map, filter, t, opts.topN])

  const option = useMemo<EChartsOption>(() => {
    const split = !!opts.showGained
    const names = rows.map((r) => r.name).reverse()
    const rev = [...rows].reverse()
    const endRadius: [number, number, number, number] = [0, 4, 4, 0]
    const base = rev.map((r) => {
      const gained = r.current - r.start
      const isEnd = !split || gained <= 0
      return {
        value: split ? r.start : r.current,
        itemStyle: {
          color: r.hollow && !teams ? mix(r.color, t.panel, 0.25) : r.color,
          borderRadius: isEnd ? endRadius : 0,
          borderColor: t.panel,
          borderWidth: split && !isEnd ? 1 : 0,
        },
      }
    })
    const gainedData = rev.map((r) => ({
      value: Math.max(0, r.current - r.start),
      itemStyle: { color: mix(r.color, t.panel, 0.55), borderRadius: endRadius, borderColor: t.panel, borderWidth: 1 },
    }))
    return {
      grid: { left: 8, right: 44, top: split && showLegend ? 28 : 8, bottom: 8, containLabel: true },
      legend: split && showLegend ? { top: 0, data: [{ name: 'Before this round', icon: 'rect' }, { name: 'Scored this round', icon: 'rect' }], itemWidth: 10, itemHeight: 10 } : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: `${t.ink}0d` } },
        formatter: (ps: any) => {
          const arr = Array.isArray(ps) ? ps : [ps]
          const r = rev[arr[0].dataIndex]
          return tipTitle(r.name) + tipRow(r.color, String(r.current), 'Points') + (r.current - r.start ? tipRow(mix(r.color, t.panel, 0.55), `+${r.current - r.start}`, 'This round') : '')
        },
      },
      xAxis: { type: 'value', splitLine: { show: true } },
      yAxis: { type: 'category', data: names, axisLabel: { color: t.ink2, fontWeight: 600 } },
      series: [
        {
          type: 'bar',
          name: 'Before this round',
          stack: 'p',
          barMaxWidth: 18,
          data: base,
          itemStyle: { color: t.muted },
          label: split ? undefined : { show: true, position: 'right', color: t.ink2, fontSize: 11, formatter: (p: any) => String(p.value) },
        },
        ...(split
          ? [
              {
                type: 'bar' as const,
                name: 'Scored this round',
                stack: 'p',
                barMaxWidth: 18,
                data: gainedData,
                itemStyle: { color: mix(t.muted, t.panel, 0.55) },
                label: { show: true, position: 'right' as const, color: t.ink2, fontSize: 11, formatter: (p: any) => String(rev[p.dataIndex].current) },
              },
            ]
          : []),
      ],
    }
  }, [rows, opts.showGained, t, teams, showLegend])

  if (!sessionKey) return <NeedSession />
  const g = gate(teams ? tq : dq)
  if (g) return g
  if (!rows.length) return <Empty>Championship points are published after races and sprints. Pick a race session.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'name', label: teams ? 'Team' : 'Driver' },
          { key: 'current', label: 'Points', align: 'right' },
          { key: 'gained', label: 'This round', align: 'right', render: (r: Row) => `+${r.current - r.start}`, sort: (r: Row) => r.current - r.start },
        ],
        rows,
      }}
    />
  )
}

export const pointsBar: WidgetDef = {
  type: 'points-bar',
  name: 'Championship points',
  description: 'Horizontal bars of championship points, with the points scored this round split out.',
  category: 'Championship',
  defaultSize: { w: 8, h: 12 },
  usesDrivers: true,
  Component: PointsBar,
  options: [
    { key: 'kind', label: 'Championship', type: 'select', default: 'drivers', choices: [{ value: 'drivers', label: 'Drivers' }, { value: 'teams', label: 'Constructors' }] },
    { key: 'showGained', label: 'Split out this round’s points', type: 'toggle', default: true },
    { key: 'topN', label: 'Show top', type: 'number', default: 0, min: 0, max: 30, help: '0 shows everyone.' },
  ],
}
