import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import { driverColor } from './shared'
import { useGridFinish } from './useGridFinish'

function GridVsFinish({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const { map } = useDriverMap(sessionKey)
  const { rows, queries } = useGridFinish(sessionKey)

  const data = useMemo(() => rows.filter((r) => r.grid && filter.visible(r.n)), [rows, filter])

  const option = useMemo<EChartsOption>(() => {
    const field = Math.max(rows.length, ...rows.map((r) => r.grid ?? 0))
    // Retirements stack below the field, one slot each, so their labels don't collide
    const dnfSlots = new Map(data.filter((r) => !r.finish).map((r, k) => [r.n, field + 1 + k]))
    const maxSlot = Math.max(field, ...dnfSlots.values())
    return {
      grid: { left: 56, right: 56, top: 16, bottom: 24 },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const r = data[p.seriesIndex]
          const d = map.get(r.n)
          return tipTitle(d?.full_name ?? `#${r.n}`) + tipRow(d?.color ?? '#888', `P${r.grid}`, 'Grid') + tipRow(d?.color ?? '#888', r.finish ? `P${r.finish}` : r.status ?? '—', 'Finish')
        },
      },
      xAxis: { type: 'category', data: ['Grid', 'Finish'], boundaryGap: false, axisLine: { show: false }, axisLabel: { color: t.ink2, fontWeight: 600 }, position: 'bottom' },
      yAxis: { type: 'value', inverse: true, min: 1, max: maxSlot, show: false },
      series: data.map((r) => {
        const d = map.get(r.n)
        const dim = filter.dimmed(r.n)
        const color = driverColor(d, dim, t)
        const code = d?.name_acronym ?? `#${r.n}`
        const gained = r.finish ? r.grid! - r.finish : null
        const emph = opts.highlight === 'movers' && gained !== null && Math.abs(gained) >= 3
        const width = opts.highlight === 'movers' ? (emph ? 2.5 : 1.5) : 2
        return {
          type: 'line' as const,
          name: code,
          z: dim ? 1 : emph ? 4 : 3,
          data: [
            { value: r.grid, label: { position: 'left' as const } },
            { value: r.finish ?? dnfSlots.get(r.n), label: { position: 'right' as const } },
          ],
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { color, width, type: d?.secondary ? [6, 3] : r.finish ? 'solid' : [2, 3], opacity: opts.highlight === 'movers' && !emph ? 0.45 : 1 },
          itemStyle: { color: d?.secondary ? t.panel : color, borderColor: d?.secondary ? color : t.panel, borderWidth: 2 },
          emphasis: { focus: 'series' as const, lineStyle: { width: 3 } },
          label: {
            show: true,
            fontSize: 11,
            color: t.ink2,
            formatter: (p: any) => (p.dataIndex === 0 ? `${r.grid}  ${code}` : `${code}  ${r.finish ?? r.status ?? 'DNF'}`),
          },
        }
      }),
    }
  }, [data, rows, map, filter, t, opts.highlight])

  if (!sessionKey) return <NeedSession />
  const g = gate(...queries)
  if (g) return g
  if (!data.length) return <Empty>Grid and finishing positions aren’t available for this session.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'code', label: 'Driver', render: (r: any) => map.get(r.n)?.name_acronym ?? `#${r.n}`, sort: (r: any) => map.get(r.n)?.name_acronym ?? '' },
          { key: 'grid', label: 'Grid', align: 'right' },
          { key: 'finish', label: 'Finish', align: 'right', render: (r: any) => r.finish ?? r.status ?? '—' },
        ],
        rows: data,
      }}
    />
  )
}

export const gridVsFinish: WidgetDef = {
  type: 'grid-vs-finish',
  name: 'Grid to finish',
  description: 'Slope chart joining each driver’s grid slot to where they finished. Retirements drop to the bottom, dotted.',
  category: 'Race',
  defaultSize: { w: 6, h: 14 },
  usesDrivers: true,
  Component: GridVsFinish,
  options: [
    { key: 'highlight', label: 'Emphasis', type: 'select', default: 'none', choices: [{ value: 'none', label: 'All drivers equal' }, { value: 'movers', label: 'Big movers (3+ places)' }] },
  ],
}
