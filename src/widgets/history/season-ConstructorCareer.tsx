import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useJConstructorSeasons, useJResults } from '../../api/jolpica/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate } from '../../components/ui'
import { useConstructorColors, useHistoryRef } from '../../lib/history'
import { useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import './history-season.css'

function ConstructorCareer({ opts }: WidgetProps) {
  const t = useTokens()
  const ref = useHistoryRef()
  const own = String(opts.constructor || '').trim()
  const headerRace = useJResults(own ? null : ref.year, own ? null : ref.round)
  const constructorId = own || headerRace.data?.races[0]?.Results?.[0]?.Constructor.constructorId || null
  const seasons = useJConstructorSeasons(constructorId)
  const colorOf = useConstructorColors()
  const metric = String(opts.metric)

  const model = useMemo(() => {
    const rows = (seasons.data?.standings ?? [])
      .map((s) => {
        const c = s.ConstructorStandings?.[0]
        return { season: Number(s.season), position: c?.position ? Number(c.position) : null, points: Number(c?.points ?? 0), wins: Number(c?.wins ?? 0), name: c?.Constructor.name ?? '' }
      })
      .sort((a, b) => a.season - b.season)
    const thisYear = new Date().getFullYear()
    return {
      rows,
      name: rows.at(-1)?.name ?? constructorId ?? '',
      titles: rows.filter((r) => r.position === 1 && r.season < thisYear).map((r) => r.season),
      wins: rows.reduce((a, r) => a + r.wins, 0),
      best: Math.min(...rows.map((r) => r.position ?? Infinity)),
    }
  }, [seasons.data, constructorId])

  const color = colorOf(constructorId ?? undefined)
  const option = useMemo<EChartsOption>(() => {
    const { rows } = model
    const tooltip = {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      formatter: (ps: any) => {
        const r = rows[(Array.isArray(ps) ? ps[0] : ps).dataIndex]
        return tipTitle(String(r.season)) + tipRow(color, r.position ? `P${r.position}` : '—', 'Constructors’ championship') + tipRow(color, String(r.points), 'Points') + tipRow(color, String(r.wins), 'Wins')
      },
    }
    const xAxis = { type: 'category' as const, data: rows.map((r) => String(r.season)) }
    if (metric === 'position') {
      return {
        grid: { left: 40, right: 12, top: 14, bottom: 24 },
        tooltip,
        xAxis,
        yAxis: { type: 'value', inverse: true, min: 1, minInterval: 1, axisLabel: { formatter: (v: number) => `P${v}` } },
        series: [{ type: 'line', data: rows.map((r) => r.position), symbol: 'circle', symbolSize: 8, lineStyle: { color, width: 2 }, itemStyle: { color, borderColor: t.panel, borderWidth: 2 } }],
      }
    }
    return {
      grid: { left: 44, right: 12, top: 14, bottom: 24 },
      tooltip,
      xAxis,
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          type: 'bar',
          barMaxWidth: 22,
          data: rows.map((r) => ({ value: metric === 'wins' ? r.wins : r.points, itemStyle: { color: r.position === 1 ? color : `${color}99`, borderRadius: [4, 4, 0, 0] } })),
        },
      ],
    }
  }, [model, metric, color, t])

  const g = gate(headerRace, seasons)
  if (g) return g
  if (!constructorId) return <Empty>Enter a constructor id in this panel’s settings, e.g. ferrari or williams.</Empty>
  if (!model.rows.length) return <Empty>No championship seasons found for “{constructorId}”. The constructors’ title began in 1958.</Empty>

  return (
    <div className="hs-career">
      <div className="hs-career-head">
        <span className="hs-team-bar" style={{ background: color }} />
        <div>
          <div className="hs-career-name">{model.name}</div>
          <div className="hs-career-meta">
            <span>
              {model.rows[0].season}–{model.rows.at(-1)!.season}
            </span>
          </div>
        </div>
      </div>
      <div className="hs-stats">
        <div className="hs-stat">
          <span className="hs-stat-label">Titles</span>
          <span className="hs-stat-value">{model.titles.length}</span>
        </div>
        <div className="hs-stat">
          <span className="hs-stat-label">Seasons</span>
          <span className="hs-stat-value">{model.rows.length}</span>
        </div>
        <div className="hs-stat">
          <span className="hs-stat-label">Wins</span>
          <span className="hs-stat-value">{model.wins}</span>
        </div>
        <div className="hs-stat">
          <span className="hs-stat-label">Best finish</span>
          <span className="hs-stat-value">{isFinite(model.best) ? `P${model.best}` : '—'}</span>
        </div>
      </div>
      <div className="hs-career-chart">
        <Chart
          option={option}
          table={{
            columns: [
              { key: 'season', label: 'Season', align: 'right' },
              { key: 'position', label: 'Pos', align: 'right', render: (r: any) => (r.position ? `P${r.position}` : '—') },
              { key: 'points', label: 'Points', align: 'right' },
              { key: 'wins', label: 'Wins', align: 'right' },
            ],
            rows: model.rows,
          }}
        />
      </div>
    </div>
  )
}

export const histConstructorCareer: WidgetDef = {
  type: 'hist-constructor-career',
  name: 'Constructor history',
  description: 'A team’s constructors’ championship finishes, points and wins for every season since 1958. Title years are drawn at full strength.',
  category: 'Records',
  sessionless: true,
  defaultSize: { w: 12, h: 12 },
  Component: ConstructorCareer,
  options: [
    { key: 'constructor', label: 'Constructor id', type: 'text', default: '', help: 'Lower-case Jolpica id such as ferrari, mclaren, williams, red_bull. Leave empty for the header race winner’s team.' },
    { key: 'metric', label: 'Chart', type: 'select', default: 'position', choices: [{ value: 'position', label: 'Championship position' }, { value: 'points', label: 'Points' }, { value: 'wins', label: 'Wins' }] },
  ],
}
