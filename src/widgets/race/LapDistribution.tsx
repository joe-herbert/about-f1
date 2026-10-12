import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useLaps, usePositions, useResults } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { cleanLaps, groupBy, quantile } from '../../lib/derive'
import { lapTime } from '../../lib/format'
import { mix, useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import { code, finishingOrder, seriesColor } from './common'

interface Box {
  n: number
  code: string
  color: string
  secondary: boolean
  min: number
  q1: number
  med: number
  q3: number
  max: number
  count: number
  times: number[]
}

function LapDistribution({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const laps = useLaps(sessionKey)
  const results = useResults(sessionKey)
  const positions = usePositions(sessionKey)
  const { map } = useDriverMap(sessionKey)

  const { option, boxes } = useMemo(() => {
    const clean = cleanLaps(laps.data, { excludePitOut: true, excludeInLaps: true, excludeLap1: true, outlierPct: Number(opts.outlierPct) })
    const byDriver = groupBy(clean, (l) => l.driver_number)
    let boxes: Box[] = []
    for (const [n, ls] of byDriver) {
      if (!filter.visible(n) || ls.length < 3) continue
      const times = ls.map((l) => l.lap_duration!).sort((a, b) => a - b)
      const q1 = quantile(times, 0.25)
      const q3 = quantile(times, 0.75)
      const iqr = q3 - q1
      const d = map.get(n)
      boxes.push({
        n,
        code: code(d, n),
        color: seriesColor(d, n, filter, t),
        secondary: !!d?.secondary,
        min: Math.max(times[0], q1 - 1.5 * iqr),
        q1,
        med: quantile(times, 0.5),
        q3,
        max: Math.min(times[times.length - 1], q3 + 1.5 * iqr),
        count: times.length,
        times,
      })
    }
    if (opts.sort === 'finish') {
      const order = finishingOrder(results.data, positions.data)
      const idx = (n: number) => {
        const i = order.indexOf(n)
        return i < 0 ? 999 : i
      }
      boxes.sort((a, b) => idx(a.n) - idx(b.n))
    } else boxes = boxes.sort((a, b) => a.med - b.med)

    const cats = boxes.map((b) => b.code)
    const series: EChartsOption['series'] = [
      {
        type: 'boxplot',
        name: 'Lap times',
        boxWidth: [6, 22],
        data: boxes.map((b) => ({
          value: [b.min, b.q1, b.med, b.q3, b.max],
          itemStyle: {
            color: b.secondary ? t.panel : mix(b.color, t.panel, 0.65),
            borderColor: b.color,
            borderWidth: 1.5,
          },
        })),
        tooltip: {
          formatter: (p: any) => {
            const b = boxes[p.dataIndex]
            return (
              tipTitle(`${b.code} · ${b.count} clean laps`) +
              tipRow(b.color, lapTime(b.med), 'Median') +
              tipRow(b.color, lapTime(b.q1), 'Lower quartile') +
              tipRow(b.color, lapTime(b.q3), 'Upper quartile') +
              tipRow(b.color, lapTime(b.times[0]), 'Fastest')
            )
          },
        },
      },
    ]
    if (opts.showLaps) {
      // Deterministic jitter so the scatter doesn't jump between renders.
      const jitter = (i: number) => (((i * 9301 + 49297) % 233280) / 233280 - 0.5) * 0.5
      series.push({
        type: 'scatter',
        name: 'Laps',
        xAxisIndex: 1,
        symbolSize: 4,
        z: 4,
        data: boxes.flatMap((b, bi) =>
          b.times.map((v, i) => ({ value: [bi + jitter(i + bi * 31), v], itemStyle: { color: b.color, opacity: 0.55 } })),
        ),
        tooltip: {
          formatter: (p: any) => {
            const b = boxes[Math.round(p.value[0])]
            return tipRow(b?.color ?? t.ink, lapTime(p.value[1]), b?.code ?? '')
          },
        },
      })
    }
    const option: EChartsOption = {
      grid: { left: 56, right: 12, top: 12, bottom: 28 },
      tooltip: { trigger: 'item' },
      xAxis: [
        { type: 'category', data: cats, axisLabel: { interval: 0, fontSize: 10 } },
        { type: 'value', min: -0.5, max: cats.length - 0.5, show: false },
      ],
      yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v: number) => lapTime(v, 1) } },
      series,
    }
    return { option, boxes }
  }, [laps.data, results.data, positions.data, map, opts, filter, t])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  if (!boxes.length) return <Empty>Not enough clean laps to plot a distribution.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'code', label: 'Driver' },
          { key: 'count', label: 'Laps', align: 'right' },
          { key: 'fastest', label: 'Fastest', align: 'right', sort: (r: Box) => r.times[0], render: (r: Box) => lapTime(r.times[0]) },
          { key: 'q1', label: 'Q1', align: 'right', render: (r: Box) => lapTime(r.q1) },
          { key: 'med', label: 'Median', align: 'right', render: (r: Box) => lapTime(r.med) },
          { key: 'q3', label: 'Q3', align: 'right', render: (r: Box) => lapTime(r.q3) },
        ],
        rows: boxes,
      }}
    />
  )
}

export const lapDistribution: WidgetDef = {
  type: 'lap-distribution',
  name: 'Lap time distribution',
  description: 'Box plot of each driver’s clean laps: median pace, spread and outliers at a glance.',
  category: 'Laps',
  minYear: 1996,
  defaultSize: { w: 12, h: 10 },
  usesDrivers: true,
  Component: LapDistribution,
  options: [
    { key: 'sort', label: 'Order', type: 'select', default: 'median', choices: [{ value: 'median', label: 'Fastest median first' }, { value: 'finish', label: 'Finishing order' }] },
    { key: 'showLaps', label: 'Show individual laps', type: 'toggle', default: true },
    { key: 'outlierPct', label: 'Hide laps slower than median by (%)', type: 'number', default: 5, min: 0, max: 50, step: 1 },
  ],
}
