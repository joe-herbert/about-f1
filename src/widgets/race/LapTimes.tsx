import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useLaps, usePits } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { cleanLaps, groupBy } from '../../lib/derive'
import { lapTime } from '../../lib/format'
import { mix, useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'

function LapTimes({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const laps = useLaps(sessionKey)
  const pits = usePits(sessionKey)
  const { map } = useDriverMap(sessionKey)

  const { option, rows } = useMemo(() => {
    const clean = cleanLaps(laps.data, {
      excludePitOut: !!opts.hidePitOut,
      excludeInLaps: !!opts.hidePitOut,
      excludeLap1: !!opts.hideLap1,
      outlierPct: Number(opts.outlierPct),
    })
    const byDriver = groupBy(clean, (l) => l.driver_number)
    const pitLaps = new Set((pits.data ?? []).map((p) => `${p.driver_number}:${p.lap_number}`))
    const series: EChartsOption['series'] = []
    const rows: { driver: string; lap: number; time: number }[] = []
    const drivers = [...byDriver.keys()].filter(filter.visible).sort((a, b) => a - b)
    for (const n of drivers) {
      const d = map.get(n)
      const dim = filter.dimmed(n)
      const color = dim ? mix(d?.color ?? '#888888', t.panel, 0.75) : d?.color ?? '#888'
      const ls = byDriver.get(n)!.sort((a, b) => a.lap_number - b.lap_number)
      const data = ls.map((l) => [l.lap_number, opts.delta === 'best' ? l.lap_duration! - Math.min(...ls.map((x) => x.lap_duration!)) : l.lap_duration])
      ls.forEach((l) => rows.push({ driver: d?.name_acronym ?? `#${n}`, lap: l.lap_number, time: l.lap_duration! }))
      series.push({
        type: 'line',
        name: d?.name_acronym ?? `#${n}`,
        data,
        z: dim ? 1 : 3,
        showSymbol: !!opts.markers,
        symbolSize: 6,
        connectNulls: false,
        lineStyle: { color, width: dim ? 1 : 2, type: d?.secondary ? [6, 3] : 'solid' },
        itemStyle: { color, borderColor: t.panel, borderWidth: 2 },
        emphasis: { focus: 'series', lineStyle: { width: 3 } },
        markPoint: opts.markPits
          ? {
              symbol: 'circle',
              symbolSize: 8,
              itemStyle: { color, borderColor: t.panel, borderWidth: 2 },
              label: { show: false },
              data: ls.filter((l) => pitLaps.has(`${n}:${l.lap_number}`)).map((l) => ({ coord: [l.lap_number, l.lap_duration!], name: 'Pit' })),
            }
          : undefined,
      })
    }
    const isDelta = opts.delta === 'best'
    const option: EChartsOption = {
      grid: { left: 52, right: 16, top: showLegend ? 36 : 12, bottom: opts.zoom ? 56 : 28 },
      legend: showLegend ? { type: 'scroll', top: 0 } : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        formatter: (ps: any) => {
          const arr = (Array.isArray(ps) ? ps : [ps]).filter((p: any) => p.value?.[1] != null)
          arr.sort((a: any, b: any) => a.value[1] - b.value[1])
          return (
            tipTitle(`Lap ${arr[0]?.value[0] ?? ''}`) +
            arr
              .slice(0, 12)
              .map((p: any) => tipRow(p.color, isDelta ? `+${p.value[1].toFixed(3)}` : lapTime(p.value[1]), p.seriesName))
              .join('') +
            (arr.length > 12 ? `<div style="opacity:.6">+${arr.length - 12} more</div>` : '')
          )
        },
      },
      xAxis: { type: 'value', name: 'Lap', nameLocation: 'middle', nameGap: 22, minInterval: 1, min: 'dataMin', max: 'dataMax' },
      yAxis: {
        type: 'value',
        scale: true,
        inverse: !!opts.invert,
        axisLabel: { formatter: (v: number) => (isDelta ? `+${v.toFixed(1)}` : lapTime(v, 1)) },
      },
      dataZoom: opts.zoom ? [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8 }] : [{ type: 'inside' }],
      series,
    }
    return { option, rows }
  }, [laps.data, pits.data, map, opts, filter, t, showLegend])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps, pits)
  if (g) return g
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'driver', label: 'Driver' },
          { key: 'lap', label: 'Lap', align: 'right' },
          { key: 'time', label: 'Time', align: 'right', render: (r: any) => lapTime(r.time) },
        ],
        rows,
      }}
    />
  )
}

export const lapTimes: WidgetDef = {
  type: 'lap-times',
  name: 'Lap times',
  description: 'Every lap for every driver as lines. Filter out pit and outlier laps, or show delta to each driver’s best.',
  category: 'Laps',
  minYear: 1996,
  defaultSize: { w: 12, h: 10 },
  usesDrivers: true,
  Component: LapTimes,
  options: [
    { key: 'delta', label: 'Values', type: 'select', default: 'raw', choices: [{ value: 'raw', label: 'Lap time' }, { value: 'best', label: 'Delta to personal best' }] },
    { key: 'hidePitOut', label: 'Hide pit in/out laps', type: 'toggle', default: true },
    { key: 'hideLap1', label: 'Hide lap 1', type: 'toggle', default: true },
    { key: 'outlierPct', label: 'Hide laps slower than median by (%)', type: 'number', default: 7, min: 0, max: 100, step: 1, help: '0 keeps every lap (safety car laps included).' },
    { key: 'markPits', label: 'Mark pit stops', type: 'toggle', default: false },
    { key: 'markers', label: 'Show lap markers', type: 'toggle', default: false },
    { key: 'invert', label: 'Faster laps at top', type: 'toggle', default: false },
    { key: 'zoom', label: 'Zoom slider', type: 'toggle', default: false },
  ],
}
