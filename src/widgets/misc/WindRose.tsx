import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useWeather } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'

const SECTORS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
const BINS = [
  { max: 1, label: '< 1 m/s' },
  { max: 2, label: '1–2 m/s' },
  { max: 3, label: '2–3 m/s' },
  { max: Infinity, label: '3+ m/s' },
]
// Ordinal steps of the sequential blue ramp, chosen per surface.
const RAMP = { light: ['#86b6ef', '#3987e5', '#1c5cab', '#0d366b'], dark: ['#184f95', '#2a78d6', '#5598e7', '#9ec5f4'] }

function WindRose({ sessionKey }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const weather = useWeather(sessionKey)

  const { option, rows, n } = useMemo(() => {
    const counts = BINS.map(() => SECTORS.map(() => 0))
    const data = weather.data ?? []
    for (const w of data) {
      const s = Math.round(((w.wind_direction % 360) + 360) / 22.5) % 16
      const b = BINS.findIndex((x) => w.wind_speed < x.max)
      counts[b][s]++
    }
    const total = data.length || 1
    const pct = counts.map((row) => row.map((c) => +((c / total) * 100).toFixed(1)))
    const ramp = RAMP[t.mode]
    const option: EChartsOption = {
      legend: showLegend ? { bottom: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8 } : undefined,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => tipTitle(`From ${p.name}`) + tipRow(p.color, `${p.value}%`, p.seriesName),
      },
      polar: { radius: showLegend ? ['6%', '74%'] : ['6%', '82%'], center: ['50%', showLegend ? '46%' : '50%'] },
      angleAxis: {
        type: 'category',
        data: SECTORS,
        startAngle: 90 + 11.25,
        axisLine: { lineStyle: { color: t.axis } },
        axisLabel: { color: t.muted, fontSize: 10, interval: 1 },
        splitLine: { show: true, lineStyle: { color: t.hair } },
      },
      radiusAxis: { axisLabel: { show: false }, axisLine: { show: false }, splitLine: { lineStyle: { color: t.hair } } },
      series: BINS.map((b, i) => ({
        type: 'bar' as const,
        coordinateSystem: 'polar' as const,
        name: b.label,
        stack: 'wind',
        itemStyle: { color: ramp[i], borderColor: t.panel, borderWidth: 1 },
        data: pct[i],
      })),
    }
    const rows = SECTORS.map((s, si) => ({ dir: s, ...Object.fromEntries(BINS.map((b, bi) => [b.label, pct[bi][si]])), total: +pct.reduce((a, r) => a + r[si], 0).toFixed(1) }))
    return { option, rows, n: data.length }
  }, [weather.data, t, showLegend])

  if (!sessionKey) return <NeedSession />
  const g = gate(weather)
  if (g) return g
  if (!n) return <Empty>No wind readings for this session.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'dir', label: 'From' },
          ...BINS.map((b) => ({ key: b.label, label: b.label, align: 'right' as const, render: (r: any) => `${r[b.label]}%` })),
          { key: 'total', label: 'Total', align: 'right', render: (r: any) => `${r.total}%` },
        ],
        rows,
      }}
    />
  )
}

export const windRose: WidgetDef = {
  type: 'wind-rose',
  name: 'Wind rose',
  description: 'How often the wind blew from each direction during the session, split by strength.',
  category: 'Conditions',
  minYear: 2023,
  defaultSize: { w: 6, h: 9 },
  Component: WindRose,
  options: [],
}
