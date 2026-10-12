import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useLaps, usePositions, useResults } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { groupBy, maxLap } from '../../lib/derive'
import { lapTime } from '../../lib/format'
import { useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import { code, finishingOrder } from './common'

function LapHeatmap({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const laps = useLaps(sessionKey)
  const results = useResults(sessionKey)
  const positions = usePositions(sessionKey)
  const { map } = useDriverMap(sessionKey)

  const { option, rows, empty } = useMemo(() => {
    const byDriver = groupBy(
      (laps.data ?? []).filter((l) => l.lap_duration),
      (l) => l.driver_number,
    )
    const order = finishingOrder(results.data, positions.data)
    const drivers = [...byDriver.keys()]
      .filter(filter.visible)
      .sort((a, b) => {
        const ia = order.indexOf(a)
        const ib = order.indexOf(b)
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
      })
    const nLaps = maxLap(laps.data)
    const lapsAxis = Array.from({ length: nLaps }, (_, i) => String(i + 1))
    const sessionBest = Math.min(...(laps.data ?? []).filter((l) => l.lap_duration && !l.is_pit_out_lap).map((l) => l.lap_duration!))
    const cap = Number(opts.cap) || 5
    const data: [number, number, number, number][] = []
    const pitMarks: [number, number][] = []
    const rows: { driver: string; lap: number; time: number; delta: number }[] = []
    // y axis is top-to-bottom: reverse so the winner is at the top.
    const yDrivers = [...drivers].reverse()
    yDrivers.forEach((n, yi) => {
      const ls = byDriver.get(n)!
      const pb = Math.min(...ls.filter((l) => !l.is_pit_out_lap).map((l) => l.lap_duration!))
      const ref = opts.reference === 'session' ? sessionBest : pb
      for (const l of ls) {
        const delta = l.lap_duration! - ref
        data.push([l.lap_number - 1, yi, Math.min(delta, cap), l.lap_duration!])
        rows.push({ driver: code(map.get(n), n), lap: l.lap_number, time: l.lap_duration!, delta })
        if (l.is_pit_out_lap) pitMarks.push([l.lap_number - 1, yi])
      }
    })
    const yLabels = yDrivers.map((n) => code(map.get(n), n))
    const option: EChartsOption = {
      grid: { left: 44, right: 16, top: 8, bottom: 56 },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          if (p.seriesType !== 'heatmap') return 'Pit out lap'
          const [x, y, , time] = p.value
          const r = rows.find((row) => row.driver === yLabels[y] && row.lap === x + 1)
          return (
            tipTitle(`${yLabels[y]} · Lap ${x + 1}`) +
            tipRow(t.ink2, lapTime(time), 'Lap time') +
            tipRow(t.ink2, `+${(r?.delta ?? 0).toFixed(3)}`, opts.reference === 'session' ? 'To session best' : 'To personal best')
          )
        },
      },
      xAxis: { type: 'category', data: lapsAxis, splitArea: { show: false }, axisLabel: { interval: 'auto' as any, fontSize: 10 } },
      yAxis: { type: 'category', data: yLabels, axisLabel: { interval: 0, fontSize: 10 } },
      visualMap: {
        type: 'continuous',
        dimension: 2,
        min: 0,
        max: cap,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        itemHeight: 140,
        itemWidth: 10,
        text: [`+${cap}s or more lost`, 'No time lost'],
        inRange: { color: [t.seqLow, t.seqHigh] },
        calculable: false,
        seriesIndex: 0,
      },
      series: [
        {
          type: 'heatmap',
          data,
          itemStyle: { borderColor: t.panel, borderWidth: 1 },
          emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
        },
        {
          type: 'scatter',
          data: pitMarks,
          symbol: 'circle',
          symbolSize: 4,
          itemStyle: { color: t.mode === 'dark' ? '#ffffff' : '#10141b' },
          silent: false,
          z: 5,
        },
      ],
    }
    return { option, rows, empty: !data.length }
  }, [laps.data, results.data, positions.data, map, opts, filter, t])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  if (empty) return <Empty>No lap times recorded for this session yet.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'driver', label: 'Driver' },
          { key: 'lap', label: 'Lap', align: 'right' },
          { key: 'time', label: 'Time', align: 'right', render: (r: any) => lapTime(r.time) },
          { key: 'delta', label: 'Delta', align: 'right', render: (r: any) => `+${r.delta.toFixed(3)}` },
        ],
        rows,
      }}
    />
  )
}

export const lapHeatmap: WidgetDef = {
  type: 'lap-heatmap',
  name: 'Lap time heatmap',
  description: 'Driver by lap grid shaded by time lost to their best lap. Dots mark pit out laps.',
  category: 'Laps',
  minYear: 1996,
  defaultSize: { w: 24, h: 11 },
  usesDrivers: true,
  Component: LapHeatmap,
  options: [
    { key: 'reference', label: 'Compare each lap to', type: 'select', default: 'personal', choices: [{ value: 'personal', label: 'Driver’s best lap' }, { value: 'session', label: 'Fastest lap of the session' }] },
    { key: 'cap', label: 'Scale maximum (s)', type: 'number', default: 5, min: 0.5, max: 60, step: 0.5 },
  ],
}
