import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useLaps } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { cleanLaps, groupBy, median, quantile, stdev } from '../../lib/derive'
import { lapTime } from '../../lib/format'
import { useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import { code, seriesColor } from './common'

interface Row {
  n: number
  code: string
  color: string
  secondary: boolean
  value: number
  laps: number
  median: number
}

function Consistency({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const laps = useLaps(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const metric = String(opts.metric)

  const { option, rows } = useMemo(() => {
    const clean = cleanLaps(laps.data, { excludePitOut: true, excludeInLaps: true, excludeLap1: true, outlierPct: Number(opts.outlierPct) })
    const rows: Row[] = []
    for (const [n, ls] of groupBy(clean, (l) => l.driver_number)) {
      if (!filter.visible(n) || ls.length < 5) continue
      const times = ls.map((l) => l.lap_duration!).sort((a, b) => a - b)
      const value = metric === 'iqr' ? quantile(times, 0.75) - quantile(times, 0.25) : stdev(times)
      const d = map.get(n)
      rows.push({ n, code: code(d, n), color: seriesColor(d, n, filter, t), secondary: !!d?.secondary, value, laps: times.length, median: median(times) })
    }
    // Most consistent at the top (category axis draws bottom-up).
    rows.sort((a, b) => b.value - a.value)
    const label = metric === 'iqr' ? 'Interquartile range' : 'Standard deviation'
    const option: EChartsOption = {
      grid: { left: 44, right: 48, top: 8, bottom: 24 },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const r = rows[p.dataIndex]
          return tipTitle(`${r.code} · ${r.laps} clean laps`) + tipRow(r.color, `${r.value.toFixed(3)}s`, label) + tipRow(r.color, lapTime(r.median), 'Median lap')
        },
      },
      xAxis: { type: 'value', min: 0, axisLabel: { formatter: (v: number) => `${v}s` } },
      yAxis: { type: 'category', data: rows.map((r) => r.code), axisLabel: { interval: 0, fontSize: 10 } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 14,
          data: rows.map((r) => ({
            value: +r.value.toFixed(3),
            itemStyle: { color: r.secondary ? t.panel : r.color, borderColor: r.color, borderWidth: r.secondary ? 1.5 : 0, borderRadius: [0, 4, 4, 0] },
          })),
          label: { show: !!opts.labels, position: 'right', color: t.ink2, fontSize: 10, formatter: (p: any) => `${(+p.value).toFixed(2)}s` },
        },
      ],
    }
    return { option, rows }
  }, [laps.data, map, metric, opts.outlierPct, opts.labels, filter, t])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  if (!rows.length) return <Empty>Not enough clean laps to measure consistency.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'code', label: 'Driver' },
          { key: 'laps', label: 'Laps', align: 'right' },
          { key: 'value', label: metric === 'iqr' ? 'IQR (s)' : 'Std dev (s)', align: 'right', render: (r: Row) => r.value.toFixed(3) },
          { key: 'median', label: 'Median', align: 'right', render: (r: Row) => lapTime(r.median) },
        ],
        rows,
      }}
    />
  )
}

export const consistency: WidgetDef = {
  type: 'consistency',
  name: 'Consistency',
  description: 'How much each driver’s clean lap times vary. Shorter bars mean steadier laps.',
  category: 'Laps',
  minYear: 1996,
  defaultSize: { w: 8, h: 10 },
  usesDrivers: true,
  Component: Consistency,
  options: [
    { key: 'metric', label: 'Measure', type: 'select', default: 'stdev', choices: [{ value: 'stdev', label: 'Standard deviation' }, { value: 'iqr', label: 'Interquartile range' }] },
    { key: 'outlierPct', label: 'Hide laps slower than median by (%)', type: 'number', default: 5, min: 0, max: 50, step: 1 },
    { key: 'labels', label: 'Label bars', type: 'toggle', default: true },
  ],
}
