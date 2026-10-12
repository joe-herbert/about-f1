import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useSeasonChampionshipDrivers, useSeasonChampionshipTeams, useSessions } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate } from '../../components/ui'
import { teamColorMap, useSeasonDriverMap } from '../../lib/drivers'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { driverColor } from './shared'

interface Line {
  name: string
  color: string
  dashed: boolean
  values: (number | null)[]
}

function SeasonProgression({ year, opts, filter }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const teams = opts.kind === 'teams'
  const sessions = useSessions(year)
  const dq = useSeasonChampionshipDrivers(year)
  const tq = useSeasonChampionshipTeams(year)
  const { map } = useSeasonDriverMap(year)
  const mode = String(opts.mode)

  const { rounds, lines } = useMemo(() => {
    const rows: { key: string; session_key: number; pos: number | null; pts: number }[] = teams
      ? (tq.data ?? []).map((r) => ({ key: r.team_name, session_key: r.session_key, pos: r.position_current, pts: r.points_current ?? 0 }))
      : (dq.data ?? [])
          .filter((r) => filter.visible(r.driver_number))
          .map((r) => ({ key: String(r.driver_number), session_key: r.session_key, pos: r.position_current, pts: r.points_current ?? 0 }))
    const keys = new Set((teams ? tq.data : dq.data)?.map((r) => r.session_key))
    const sess = (sessions.data ?? []).filter((s) => keys.has(s.session_key)).sort((a, b) => a.date_start.localeCompare(b.date_start))
    const idx = new Map(sess.map((s, i) => [s.session_key, i]))
    const rounds = sess.map((s) => ({ label: `${s.country_code}${s.session_name === 'Sprint' ? ' S' : ''}`, full: `${s.country_name} ${s.session_name}` }))

    const by = new Map<string, (number | null)[]>()
    const posBy = new Map<string, (number | null)[]>()
    for (const r of rows) {
      const i = idx.get(r.session_key)
      if (i === undefined) continue
      if (!by.has(r.key)) {
        by.set(r.key, Array(sess.length).fill(null))
        posBy.set(r.key, Array(sess.length).fill(null))
      }
      by.get(r.key)![i] = r.pts
      posBy.get(r.key)![i] = r.pos
    }
    // leader per round (across everyone, not just filtered)
    const allRows = teams ? (tq.data ?? []).map((r) => ({ s: r.session_key, p: r.points_current ?? 0 })) : (dq.data ?? []).map((r) => ({ s: r.session_key, p: r.points_current ?? 0 }))
    const leader = Array(sess.length).fill(0)
    for (const r of allRows) {
      const i = idx.get(r.s)
      if (i !== undefined) leader[i] = Math.max(leader[i], r.p)
    }

    const teamColors = teamColorMap(map)
    let lines: Line[] = [...by.entries()].map(([key, pts]) => {
      let values = pts
      if (mode === 'gap') values = pts.map((v, i) => (v === null ? null : leader[i] - v))
      if (mode === 'position') values = posBy.get(key)!
      if (teams) return { name: key, color: teamColors.get(key) ?? '#8a8f98', dashed: false, values, last: pts.filter((v) => v !== null).at(-1) ?? 0 }
      const n = Number(key)
      const d = map.get(n)
      return { name: d?.name_acronym ?? `#${n}`, color: driverColor(d, filter.dimmed(n), t), dashed: !!d?.secondary, values, last: pts.filter((v) => v !== null).at(-1) ?? 0 }
    })
    lines.sort((a: any, b: any) => b.last - a.last)
    const n = Number(opts.topN)
    if (n > 0) lines = lines.slice(0, n)
    return { rounds, lines }
  }, [teams, tq.data, dq.data, sessions.data, map, filter, t, mode, opts.topN])

  const option = useMemo<EChartsOption>(() => {
    const isPos = mode === 'position'
    return {
      grid: { left: 44, right: 48, top: showLegend ? 36 : 12, bottom: 28 },
      legend: showLegend ? { type: 'scroll', top: 0 } : undefined,
      tooltip: {
        trigger: 'axis',
        formatter: (ps: any) => {
          const arr = (Array.isArray(ps) ? ps : [ps]).filter((p: any) => p.value != null)
          arr.sort((a: any, b: any) => (isPos || mode === 'gap' ? a.value - b.value : b.value - a.value))
          const r = rounds[arr[0]?.dataIndex]
          return (
            tipTitle(r?.full ?? '') +
            arr
              .slice(0, 12)
              .map((p: any) => tipRow(p.color, isPos ? `P${p.value}` : mode === 'gap' ? (p.value ? `−${p.value}` : 'Leader') : String(p.value), p.seriesName, lines[p.seriesIndex]?.dashed))
              .join('')
          )
        },
      },
      xAxis: { type: 'category', data: rounds.map((r) => r.label), boundaryGap: false, axisLabel: { interval: 'auto' } },
      yAxis: isPos
        ? { type: 'value', inverse: true, min: 1, minInterval: 1, name: 'Position' }
        : { type: 'value', inverse: mode === 'gap', name: mode === 'gap' ? 'Points behind' : 'Points', nameTextStyle: { align: 'left' } },
      series: lines.map((l) => ({
        type: 'line',
        name: l.name,
        data: l.values,
        connectNulls: true,
        lineStyle: { color: l.color, width: 2, type: l.dashed ? [6, 3] : 'solid' },
        itemStyle: { color: l.color },
        emphasis: { focus: 'series' },
        endLabel: lines.length <= 4 ? { show: true, color: t.ink2, fontSize: 11, formatter: '{a}' } : undefined,
      })),
    }
  }, [rounds, lines, mode, showLegend, t])

  const g = gate(sessions, teams ? tq : dq)
  if (g) return g
  if (!rounds.length) return <Empty>No championship data for {year} yet.</Empty>
  const tableRows = lines.map((l) => ({ name: l.name, ...Object.fromEntries(l.values.map((v, i) => [`r${i}`, v])) }))
  return (
    <Chart
      option={option}
      table={{
        columns: [{ key: 'name', label: teams ? 'Team' : 'Driver' }, ...rounds.map((r, i) => ({ key: `r${i}`, label: r.label, align: 'right' as const }))],
        rows: tableRows,
      }}
    />
  )
}

export const seasonProgression: WidgetDef = {
  type: 'season-progression',
  name: 'Season points progression',
  description: 'How the championship developed race by race: points, gap to the leader, or position.',
  category: 'Championship',
  defaultSize: { w: 12, h: 11 },
  usesDrivers: true,
  sessionless: true,
  Component: SeasonProgression,
  options: [
    { key: 'kind', label: 'Championship', type: 'select', default: 'drivers', choices: [{ value: 'drivers', label: 'Drivers' }, { value: 'teams', label: 'Constructors' }] },
    {
      key: 'mode',
      label: 'Plot',
      type: 'select',
      default: 'points',
      choices: [
        { value: 'points', label: 'Cumulative points' },
        { value: 'gap', label: 'Gap to leader' },
        { value: 'position', label: 'Championship position' },
      ],
    },
    { key: 'topN', label: 'Show top', type: 'number', default: 10, min: 0, max: 30, help: '0 shows everyone.' },
  ],
}
