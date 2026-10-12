import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useLaps, useStints } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { cleanLaps, groupBy, linreg } from '../../lib/derive'
import { lapTime } from '../../lib/format'
import { COMPOUNDS, compoundColor, useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'

interface Pt {
  driver: string
  lap: number
  age: number
  time: number
  compound: string
}

function TyreDegradation({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const laps = useLaps(sessionKey)
  const stints = useStints(sessionKey)
  const { map } = useDriverMap(sessionKey)

  const { option, rows } = useMemo(() => {
    const clean = cleanLaps(laps.data, { excludePitOut: true, excludeInLaps: true, excludeLap1: true, outlierPct: Number(opts.outlierPct) })
    const stintsBy = groupBy(stints.data, (s) => s.driver_number)
    const rows: Pt[] = []
    for (const l of clean) {
      if (!filter.visible(l.driver_number)) continue
      if (opts.dimmedOut && filter.selected.length && !filter.selected.includes(l.driver_number)) continue
      const s = stintsBy.get(l.driver_number)?.find((s) => l.lap_number >= s.lap_start && l.lap_number <= s.lap_end)
      if (!s) continue
      rows.push({
        driver: map.get(l.driver_number)?.name_acronym ?? `#${l.driver_number}`,
        lap: l.lap_number,
        age: s.tyre_age_at_start + (l.lap_number - s.lap_start),
        time: l.lap_duration!,
        compound: (s.compound ?? 'UNKNOWN').toUpperCase(),
      })
    }
    const byCompound = groupBy(rows, (r) => r.compound)
    const order = Object.keys(COMPOUNDS)
    const compounds = [...byCompound.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    const fits = new Map<string, { slope: number; intercept: number } | null>()
    const series: any[] = []
    for (const c of compounds) {
      const pts = byCompound.get(c)!
      const color = compoundColor(c, t)
      const name = COMPOUNDS[c]?.label ?? c
      const fit = linreg(pts.map((p) => [p.age, p.time]))
      fits.set(c, fit)
      series.push({
        type: 'scatter',
        name,
        symbolSize: 6,
        itemStyle: { color, opacity: 0.55, borderColor: t.panel, borderWidth: 1 },
        emphasis: { itemStyle: { opacity: 1 } },
        data: pts.map((p) => ({ value: [p.age, p.time], pt: p })),
      })
      if (fit && opts.trend) {
        const xs = pts.map((p) => p.age)
        const x0 = Math.min(...xs)
        const x1 = Math.max(...xs)
        series.push({
          type: 'line',
          name,
          silent: true,
          symbol: 'none',
          lineStyle: { color, width: 2 },
          data: [
            [x0, fit.intercept + fit.slope * x0],
            [x1, fit.intercept + fit.slope * x1],
          ],
          tooltip: { show: false },
        })
      }
    }
    const option: EChartsOption = {
      grid: { left: 56, right: 16, top: showLegend ? 32 : 10, bottom: 34 },
      legend: showLegend
        ? {
            top: 0,
            data: compounds.map((c) => COMPOUNDS[c]?.label ?? c),
            icon: 'circle',
            itemWidth: 8,
            itemHeight: 8,
            formatter: (name: string) => {
              const c = compounds.find((k) => (COMPOUNDS[k]?.label ?? k) === name)
              const f = c ? fits.get(c) : null
              return f ? `${name}  ${f.slope >= 0 ? '+' : '−'}${Math.abs(f.slope).toFixed(3)} s/lap` : name
            },
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const pt: Pt | undefined = p.data?.pt
          if (!pt) return ''
          const f = fits.get(pt.compound)
          return (
            tipTitle(`${pt.driver}, lap ${pt.lap}`) +
            tipRow(p.color, lapTime(pt.time), 'lap time') +
            tipRow(p.color, `${pt.age} laps`, `${COMPOUNDS[pt.compound]?.label ?? pt.compound} age`) +
            (f ? tipRow(p.color, `${f.slope >= 0 ? '+' : '−'}${Math.abs(f.slope).toFixed(3)} s/lap`, 'compound trend') : '')
          )
        },
      },
      xAxis: { type: 'value', name: 'Tyre age (laps)', nameLocation: 'middle', nameGap: 22, minInterval: 1, splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, axisLabel: { formatter: (v: number) => lapTime(v, 1) } },
      series,
    }
    return { option, rows }
  }, [laps.data, stints.data, map, opts, filter, t, showLegend])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps, stints)
  if (g) return g
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'driver', label: 'Driver' },
          { key: 'lap', label: 'Lap', align: 'right' },
          { key: 'compound', label: 'Tyre', render: (r: Pt) => COMPOUNDS[r.compound]?.label ?? r.compound },
          { key: 'age', label: 'Age', align: 'right' },
          { key: 'time', label: 'Time', align: 'right', render: (r: Pt) => lapTime(r.time) },
        ],
        rows,
      }}
    />
  )
}

export const tyreDegradation: WidgetDef = {
  type: 'tyre-degradation',
  name: 'Tyre degradation',
  description: 'Lap time against tyre age for each compound, with a fitted trend showing seconds lost per lap.',
  category: 'Strategy',
  minYear: 2023,
  defaultSize: { w: 10, h: 10 },
  usesDrivers: true,
  Component: TyreDegradation,
  options: [
    { key: 'outlierPct', label: 'Hide laps slower than median by (%)', type: 'number', default: 5, min: 0, max: 50, step: 1 },
    { key: 'trend', label: 'Show trend lines', type: 'toggle', default: true },
    { key: 'dimmedOut', label: 'Only use filtered drivers', type: 'toggle', default: true, help: 'When the driver filter is set, ignore other drivers instead of including them.' },
  ],
}
