import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useIntervals, useLaps } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { gapsByLap } from '../../lib/derive'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { code, lineType, seriesColor } from './common'

function GapChart({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const laps = useLaps(sessionKey)
  const intervals = useIntervals(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const mode = String(opts.mode)
  const ref = opts.refDriver as number | null

  const { option, rows, hasData } = useMemo(() => {
    const gaps = gapsByLap(laps.data, intervals.data, mode === 'interval' ? 'interval' : 'gap_to_leader')
    const refArr = mode === 'driver' && ref ? gaps.get(ref) : undefined
    const cap = Number(opts.cap) || 0
    const rows: { driver: string; lap: number; gap: number }[] = []
    const drivers = [...gaps.keys()].filter(filter.visible).sort((a, b) => a - b)
    const series: EChartsOption['series'] = []
    for (const n of drivers) {
      const d = map.get(n)
      const color = seriesColor(d, n, filter, t)
      const arr = gaps.get(n)!
      const data: [number, number | null][] = []
      arr.forEach((v, lap) => {
        if (lap === undefined) return
        let val: number | null = v
        if (mode === 'driver') {
          const r = refArr?.[lap]
          val = v != null && r != null ? v - r : null
        }
        if (val != null && cap && Math.abs(val) > cap) val = null
        data.push([lap, val])
        if (val != null) rows.push({ driver: code(d, n), lap, gap: val })
      })
      series.push({
        type: 'line',
        name: code(d, n),
        data,
        connectNulls: false,
        z: filter.dimmed(n) ? 1 : 3,
        lineStyle: { color, width: filter.dimmed(n) ? 1 : 2, type: lineType(d) },
        itemStyle: { color },
        emphasis: { focus: 'series', lineStyle: { width: 3 } },
      })
    }
    const label = mode === 'interval' ? 'Interval to car ahead' : mode === 'driver' ? `Gap to ${code(map.get(ref ?? 0), ref ?? 0)}` : 'Gap to leader'
    const option: EChartsOption = {
      grid: { left: 52, right: 16, top: showLegend ? 36 : 12, bottom: 28 },
      legend: showLegend ? { type: 'scroll', top: 0 } : undefined,
      tooltip: {
        trigger: 'axis',
        formatter: (ps: any) => {
          const arr = (Array.isArray(ps) ? ps : [ps]).filter((p: any) => p.value?.[1] != null)
          arr.sort((a: any, b: any) => a.value[1] - b.value[1])
          return (
            tipTitle(`Lap ${arr[0]?.value[0] ?? ''} · ${label}`) +
            arr
              .slice(0, 14)
              .map((p: any) => tipRow(p.color, `${p.value[1] >= 0 ? '+' : '−'}${Math.abs(p.value[1]).toFixed(3)}s`, p.seriesName))
              .join('')
          )
        },
      },
      xAxis: { type: 'value', name: 'Lap', nameLocation: 'middle', nameGap: 22, minInterval: 1, min: 'dataMin', max: 'dataMax' },
      yAxis: { type: 'value', inverse: !!opts.invert, axisLabel: { formatter: (v: number) => `${v}s` } },
      dataZoom: [{ type: 'inside' }],
      series,
    }
    return { option, rows, hasData: rows.length > 0 }
  }, [laps.data, intervals.data, map, mode, ref, opts, filter, t, showLegend])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps, intervals)
  if (g) return g
  if (mode === 'driver' && !ref) return <Empty>Choose a reference driver in this panel’s settings.</Empty>
  if (!hasData) return <Empty>No gap data for this session. Gaps are published for races and sprints.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'driver', label: 'Driver' },
          { key: 'lap', label: 'Lap', align: 'right' },
          { key: 'gap', label: 'Gap (s)', align: 'right', render: (r: any) => r.gap.toFixed(3) },
        ],
        rows,
      }}
    />
  )
}

export const gapChart: WidgetDef = {
  type: 'gap-chart',
  name: 'Gap chart',
  description: 'Gap to the leader, the car ahead, or a driver you choose, at the end of each lap.',
  category: 'Race',
  minYear: 1996,
  defaultSize: { w: 12, h: 10 },
  usesDrivers: true,
  Component: GapChart,
  options: [
    {
      key: 'mode',
      label: 'Gap to',
      type: 'select',
      default: 'leader',
      choices: [
        { value: 'leader', label: 'Leader' },
        { value: 'interval', label: 'Car ahead' },
        { value: 'driver', label: 'Reference driver' },
      ],
    },
    { key: 'refDriver', label: 'Reference driver', type: 'driver', default: null, help: 'Used when “Gap to” is Reference driver.' },
    { key: 'cap', label: 'Hide gaps larger than (s)', type: 'number', default: 0, min: 0, max: 300, step: 5, help: '0 shows everything.' },
    { key: 'invert', label: 'Leader at top', type: 'toggle', default: true },
  ],
}
