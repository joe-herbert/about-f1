import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useJDriverCareer, useJDriverSeasons, useJResults } from '../../api/jolpica/hooks'
import type { JConstructor } from '../../api/jolpica/types'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate } from '../../components/ui'
import { isFinish, jName, useConstructorColors, useHistoryRef } from '../../lib/history'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import './history-season.css'

interface SeasonRow {
  season: number
  position: number | null
  points: number
  wins: number
  podiums: number
  starts: number
  constructor: JConstructor | undefined
}

function DriverCareer({ opts }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const ref = useHistoryRef()
  const headerRace = useJResults(opts.driver ? null : ref.year, opts.driver ? null : ref.round)
  const driverId = String(opts.driver || '') || headerRace.data?.races[0]?.Results?.[0]?.Driver.driverId || null
  const career = useJDriverCareer(driverId)
  const seasons = useJDriverSeasons(driverId)
  const colorOf = useConstructorColors()
  const chart = String(opts.chart)

  const model = useMemo(() => {
    const races = career.data?.races ?? []
    const results = races.flatMap((r) => (r.Results ?? []).map((res) => ({ res, season: Number(r.season), race: r })))
    const driver = results[0]?.res.Driver
    const bySeason = new Map<number, SeasonRow>()
    for (const s of seasons.data?.standings ?? []) {
      const d = s.DriverStandings?.[0]
      bySeason.set(Number(s.season), {
        season: Number(s.season),
        position: d?.position ? Number(d.position) : null,
        points: Number(d?.points ?? 0),
        wins: Number(d?.wins ?? 0),
        podiums: 0,
        starts: 0,
        constructor: d?.Constructors.at(-1),
      })
    }
    let wins = 0
    let podiums = 0
    let poles = 0
    let points = 0
    let dnfs = 0
    let best = Infinity
    for (const { res, season } of results) {
      const p = Number(res.position)
      const classified = /^\d+$/.test(res.positionText)
      if (classified && p === 1) wins++
      if (classified && p <= 3) podiums++
      if (res.grid === '1') poles++
      if (classified) best = Math.min(best, p)
      if (!isFinish(res.status) && !classified) dnfs++
      points += Number(res.points) || 0
      const row = bySeason.get(season) ?? { season, position: null, points: 0, wins: 0, podiums: 0, starts: 0, constructor: res.Constructor }
      row.starts++
      if (classified && p <= 3) row.podiums++
      row.constructor ??= res.Constructor
      bySeason.set(season, row)
    }
    const rows = [...bySeason.values()].sort((a, b) => a.season - b.season)
    const titles = rows.filter((r) => r.position === 1 && r.season < new Date().getFullYear()).map((r) => r.season)
    const teams = [...new Map(results.map(({ res }) => [res.Constructor.constructorId, res.Constructor])).values()]
    return {
      driver,
      rows,
      teams,
      stats: { starts: results.length, wins, podiums, poles, points, titles, best: isFinite(best) ? best : null, dnfs },
      span: rows.length ? `${rows[0].season}–${rows.at(-1)!.season}` : '',
    }
  }, [career.data, seasons.data])

  const option = useMemo<EChartsOption>(() => {
    const { rows } = model
    const years = rows.map((r) => String(r.season))
    const tip = {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      formatter: (ps: any) => {
        const arr = Array.isArray(ps) ? ps : [ps]
        const r = rows[arr[0].dataIndex]
        return (
          tipTitle(`${r.season}${r.constructor ? `, ${r.constructor.name}` : ''}`) +
          tipRow(colorOf(r.constructor), r.position ? `P${r.position}` : '—', 'Championship') +
          tipRow(colorOf(r.constructor), String(r.points), 'Points') +
          tipRow(colorOf(r.constructor), `${r.wins} / ${r.podiums}`, 'Wins / podiums') +
          tipRow(colorOf(r.constructor), String(r.starts), 'Starts')
        )
      },
    }
    const base = { grid: { left: 40, right: 12, top: chart === 'wins' && showLegend ? 30 : 26, bottom: 24 }, tooltip: tip, xAxis: { type: 'category' as const, data: years } }
    if (chart === 'wins') {
      return {
        ...base,
        legend: showLegend ? { top: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10 } : undefined,
        yAxis: { type: 'value', minInterval: 1 },
        series: [
          { type: 'bar', name: 'Wins', barMaxWidth: 14, barGap: '15%', data: rows.map((r) => r.wins), itemStyle: { color: t.divNeg, borderRadius: [4, 4, 0, 0] } },
          { type: 'bar', name: 'Podiums', barMaxWidth: 14, data: rows.map((r) => r.podiums), itemStyle: { color: t.seqLow, borderRadius: [4, 4, 0, 0] } },
        ],
      }
    }
    if (chart === 'points') {
      return {
        ...base,
        yAxis: { type: 'value' },
        series: [{ type: 'bar', barMaxWidth: 22, data: rows.map((r) => ({ value: r.points, itemStyle: { color: colorOf(r.constructor), borderRadius: [4, 4, 0, 0] } })) }],
      }
    }
    const worst = Math.max(...rows.map((r) => r.position ?? 0), 3)
    return {
      ...base,
      yAxis: { type: 'value', inverse: true, min: 1, max: worst, minInterval: 1, axisLabel: { formatter: (v: number) => `P${v}` } },
      series: [
        {
          type: 'line',
          data: rows.map((r) => ({ value: r.position, itemStyle: { color: colorOf(r.constructor) } })),
          connectNulls: false,
          lineStyle: { color: t.axis, width: 2 },
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 10,
          itemStyle: { borderColor: t.panel, borderWidth: 2 },
          label: { show: rows.length <= 20, position: 'top', fontSize: 10, color: t.ink2, formatter: (p: any) => (p.value === 1 ? 'Champion' : '') },
        },
      ],
    }
  }, [model, chart, colorOf, t, showLegend])

  const g = gate(headerRace, career, seasons)
  if (g) return g
  if (!driverId) return <Empty>Choose a driver in this panel’s settings.</Empty>
  if (!model.driver) return <Empty>No races found for “{driverId}”. Pick a driver from the list in settings.</Empty>

  const d = model.driver
  const s = model.stats
  const stat = (label: string, value: string | number) => (
    <div className="hs-stat">
      <span className="hs-stat-label">{label}</span>
      <span className="hs-stat-value">{value}</span>
    </div>
  )
  return (
    <div className="hs-career">
      <div className="hs-career-head">
        <div>
          <div className="hs-career-name">{jName(d)}</div>
          <div className="hs-career-meta">
            <span>{d.nationality}</span>
            {d.dateOfBirth && <span>Born {new Date(d.dateOfBirth).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}</span>}
            <span>{model.span}</span>
            <span className="hs-teams">
              {model.teams.map((c) => (
                <span key={c.constructorId} className="hs-cell">
                  <span className="hs-swatch" style={{ background: colorOf(c) }} />
                  {c.name}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
      <div className="hs-stats">
        {stat('Titles', s.titles.length)}
        {stat('Starts', s.starts)}
        {stat('Wins', s.wins)}
        {stat('Podiums', s.podiums)}
        {stat('Poles', s.poles)}
        {stat('Points', Math.round(s.points * 10) / 10)}
        {stat('Best finish', s.best ? `P${s.best}` : '—')}
        {stat('Retirements', s.dnfs)}
      </div>
      <div className="hs-career-chart">
        <Chart
          option={option}
          table={{
            columns: [
              { key: 'season', label: 'Season', align: 'right' },
              { key: 'team', label: 'Team' },
              { key: 'position', label: 'Pos', align: 'right', render: (r: any) => (r.position ? `P${r.position}` : '—') },
              { key: 'points', label: 'Points', align: 'right' },
              { key: 'wins', label: 'Wins', align: 'right' },
              { key: 'podiums', label: 'Podiums', align: 'right' },
              { key: 'starts', label: 'Starts', align: 'right' },
            ],
            rows: model.rows.map((r) => ({ ...r, team: r.constructor?.name ?? '—' })),
          }}
        />
      </div>
    </div>
  )
}

export const histDriverCareer: WidgetDef = {
  type: 'hist-driver-career',
  name: 'Driver career',
  description: 'Any driver since 1950: titles, wins, podiums, poles and points, with championship finishes season by season.',
  category: 'Records',
  sessionless: true,
  defaultSize: { w: 24, h: 14 },
  Component: DriverCareer,
  options: [
    { key: 'driver', label: 'Driver', type: 'histDriver', default: '' },
    {
      key: 'chart',
      label: 'Chart',
      type: 'select',
      default: 'position',
      choices: [
        { value: 'position', label: 'Championship position' },
        { value: 'wins', label: 'Wins and podiums' },
        { value: 'points', label: 'Points' },
      ],
    },
  ],
}
