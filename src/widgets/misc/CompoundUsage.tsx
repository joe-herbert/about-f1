import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useStints } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { COMPOUNDS, compoundColor, mix, useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { byRank, useFinishOrder } from './helpers'

function CompoundUsage({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const stints = useStints(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const { rank } = useFinishOrder(sessionKey)

  const { option, rows } = useMemo(() => {
    const per = new Map<number, Map<string, number>>()
    for (const s of stints.data ?? []) {
      if (!filter.visible(s.driver_number)) continue
      const c = (s.compound ?? 'UNKNOWN').toUpperCase()
      const m = per.get(s.driver_number) ?? new Map<string, number>()
      m.set(c, (m.get(c) ?? 0) + (s.lap_end - s.lap_start + 1))
      per.set(s.driver_number, m)
    }
    const order = Object.keys(COMPOUNDS)
    const compounds = [...new Set([...per.values()].flatMap((m) => [...m.keys()]))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    const drivers = [...per.keys()].sort(byRank(rank))
    const rows = drivers.map((n) => {
      const r: Record<string, string | number> = { driver: map.get(n)?.name_acronym ?? `#${n}` }
      for (const c of compounds) r[c] = per.get(n)!.get(c) ?? 0
      return r
    })

    let option: EChartsOption
    if (opts.view === 'donut') {
      const totals = compounds.map((c) => ({ c, v: rows.reduce((a, r) => a + (r[c] as number), 0) }))
      const sum = totals.reduce((a, x) => a + x.v, 0)
      option = {
        tooltip: {
          trigger: 'item',
          formatter: (p: any) => tipTitle(p.name) + tipRow(p.color, `${p.value} laps`, `${((p.value / sum) * 100).toFixed(1)}% of all laps`),
        },
        legend: showLegend ? { bottom: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8 } : undefined,
        series: [
          {
            type: 'pie',
            radius: ['52%', '78%'],
            center: ['50%', showLegend ? '46%' : '50%'],
            padAngle: 1,
            itemStyle: { borderColor: t.panel, borderWidth: 2, borderRadius: 4 },
            label: { color: t.ink2, formatter: (p: any) => `${p.percent.toFixed(0)}%`, fontSize: 12 },
            labelLine: { lineStyle: { color: t.axis } },
            data: totals.map(({ c, v }) => ({ name: COMPOUNDS[c]?.label ?? c, value: v, itemStyle: { color: compoundColor(c, t) } })),
          },
        ],
      }
    } else {
      option = {
        grid: { left: 48, right: 16, top: showLegend ? 30 : 8, bottom: 24 },
        legend: showLegend ? { top: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 8 } : undefined,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (ps: any) => {
            const arr = (Array.isArray(ps) ? ps : [ps]).filter((p: any) => p.value > 0)
            return tipTitle(arr[0]?.name ?? '') + arr.map((p: any) => tipRow(p.color, `${p.value} laps`, p.seriesName)).join('')
          },
        },
        xAxis: { type: 'value', name: 'Laps', nameLocation: 'middle', nameGap: 20 },
        yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.driver as string), axisLine: { show: false }, axisLabel: { color: t.ink2 } },
        series: compounds.map((c, i) => ({
          type: 'bar' as const,
          name: COMPOUNDS[c]?.label ?? c,
          stack: 'laps',
          barMaxWidth: 16,
          itemStyle: {
            borderColor: t.panel,
            borderWidth: 1,
            borderRadius: i === compounds.length - 1 ? [0, 4, 4, 0] : 0,
          },
          data: drivers.map((n) => {
            const v = per.get(n)!.get(c) ?? 0
            const col = compoundColor(c, t)
            return { value: v, itemStyle: { color: filter.dimmed(n) ? mix(col, t.panel, 0.7) : col } }
          }),
        })),
      }
    }
    return { option, rows, compounds }
  }, [stints.data, map, rank, opts.view, filter, t, showLegend])

  if (!sessionKey) return <NeedSession />
  const g = gate(stints)
  if (g) return g
  const compounds = Object.keys(rows[0] ?? {}).filter((k) => k !== 'driver')
  return (
    <Chart
      option={option}
      table={{
        columns: [{ key: 'driver', label: 'Driver' }, ...compounds.map((c) => ({ key: c, label: COMPOUNDS[c]?.label ?? c, align: 'right' as const }))],
        rows,
      }}
    />
  )
}

export const compoundUsage: WidgetDef = {
  type: 'compound-usage',
  name: 'Compound usage',
  description: 'Laps run on each tyre compound, per driver or as a session total.',
  category: 'Strategy',
  minYear: 2023,
  defaultSize: { w: 8, h: 10 },
  usesDrivers: true,
  Component: CompoundUsage,
  options: [
    { key: 'view', label: 'View', type: 'select', default: 'drivers', choices: [{ value: 'drivers', label: 'Per driver (stacked bars)' }, { value: 'donut', label: 'Session total (donut)' }] },
  ],
}
