import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useLaps, usePositions } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { positionsByLap } from '../../lib/derive'
import { ordinal } from '../../lib/format'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { code, lineType, seriesColor } from './common'

function PositionChart({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const laps = useLaps(sessionKey)
  const positions = usePositions(sessionKey)
  const { map } = useDriverMap(sessionKey)

  const { option, rows } = useMemo(() => {
    const byLap = positionsByLap(laps.data, positions.data)
    const startLap = opts.showStart ? 0 : 1
    let maxPos = 1
    let maxL = 0
    const rows: { driver: string; lap: number; position: number }[] = []
    const drivers = [...byLap.keys()].filter(filter.visible).sort((a, b) => a - b)
    const series: EChartsOption['series'] = drivers.map((n) => {
      const d = map.get(n)
      const color = seriesColor(d, n, filter, t)
      const arr = byLap.get(n)!
      const data: [number, number][] = []
      for (let i = startLap; i < arr.length; i++) {
        const p = arr[i]
        if (p == null) continue
        data.push([i, p])
        rows.push({ driver: code(d, n), lap: i, position: p })
        maxPos = Math.max(maxPos, p)
        maxL = Math.max(maxL, i)
      }
      const last = data[data.length - 1]
      return {
        type: 'line',
        name: code(d, n),
        data,
        z: filter.dimmed(n) ? 1 : 3,
        symbol: 'circle',
        showSymbol: false,
        symbolSize: 8,
        lineStyle: { color, width: filter.dimmed(n) ? 1 : 2, type: lineType(d) },
        itemStyle: { color, borderColor: t.panel, borderWidth: 2 },
        emphasis: { focus: 'series', lineStyle: { width: 3 } },
        endLabel: opts.labelEnds
          ? { show: true, formatter: code(d, n), color: t.ink2, fontSize: 11, fontWeight: 600, distance: 6 }
          : undefined,
        markPoint: last
          ? { symbol: 'circle', symbolSize: 8, itemStyle: { color, borderColor: t.panel, borderWidth: 2 }, label: { show: false }, data: [{ coord: last, name: 'Last' }] }
          : undefined,
      }
    })
    const option: EChartsOption = {
      grid: { left: 36, right: opts.labelEnds ? 48 : 16, top: showLegend ? 36 : 12, bottom: 28 },
      legend: showLegend ? { type: 'scroll', top: 0 } : undefined,
      tooltip: {
        trigger: 'axis',
        formatter: (ps: any) => {
          const arr = (Array.isArray(ps) ? ps : [ps]).filter((p: any) => p.value?.[1] != null)
          arr.sort((a: any, b: any) => a.value[1] - b.value[1])
          const lap = arr[0]?.value[0]
          return (
            tipTitle(lap === 0 ? 'Grid' : `Lap ${lap ?? ''}`) +
            arr.map((p: any) => tipRow(p.color, ordinal(p.value[1]), p.seriesName)).join('')
          )
        },
      },
      xAxis: { type: 'value', name: 'Lap', nameLocation: 'middle', nameGap: 22, min: startLap, max: maxL || undefined, minInterval: 1 },
      yAxis: { type: 'value', inverse: true, min: 1, max: maxPos, interval: 1, axisLabel: { formatter: (v: number) => String(v) } },
      dataZoom: [{ type: 'inside' }],
      series,
    }
    return { option, rows }
  }, [laps.data, positions.data, map, opts, filter, t, showLegend])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps, positions)
  if (g) return g
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'driver', label: 'Driver' },
          { key: 'lap', label: 'Lap', align: 'right' },
          { key: 'position', label: 'Position', align: 'right' },
        ],
        rows,
      }}
    />
  )
}

export const positionChart: WidgetDef = {
  type: 'position-chart',
  name: 'Position chart',
  description: 'Each driver’s position at the end of every lap, so you can follow every overtake and pit cycle.',
  category: 'Race',
  minYear: 1996,
  defaultSize: { w: 12, h: 11 },
  usesDrivers: true,
  Component: PositionChart,
  options: [
    { key: 'showStart', label: 'Include grid position (lap 0)', type: 'toggle', default: true },
    { key: 'labelEnds', label: 'Label line ends', type: 'toggle', default: true },
  ],
}
