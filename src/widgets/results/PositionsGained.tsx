import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { mix, useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import { useGridFinish } from './useGridFinish'

function PositionsGained({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const { map } = useDriverMap(sessionKey)
  const { rows, queries } = useGridFinish(sessionKey)

  const data = useMemo(() => {
    const out = rows
      .filter((r) => r.grid && filter.visible(r.n) && (r.finish || opts.includeDnf))
      .map((r) => ({
        ...r,
        code: map.get(r.n)?.name_acronym ?? `#${r.n}`,
        // A retirement counts as finishing last of the field for "places lost"
        delta: r.finish ? r.grid! - r.finish : r.grid! - rows.length,
        dim: filter.dimmed(r.n),
      }))
    if (opts.sort === 'finish') out.sort((a, b) => (a.finish ?? 99) - (b.finish ?? 99))
    else out.sort((a, b) => b.delta - a.delta)
    return out
  }, [rows, map, filter, opts.sort, opts.includeDnf])

  const option = useMemo<EChartsOption>(() => {
    const rev = [...data].reverse()
    return {
      grid: { left: 8, right: 30, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const r = rev[p.dataIndex]
          const d = map.get(r.n)
          return (
            tipTitle(d?.full_name ?? r.code) +
            tipRow(d?.color ?? '#888', r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? `−${-r.delta}` : '0', 'Places') +
            tipRow(t.axis, `P${r.grid}`, 'Grid') +
            tipRow(t.axis, r.finish ? `P${r.finish}` : r.status ?? '—', 'Finish')
          )
        },
      },
      xAxis: { type: 'value', minInterval: 1, splitLine: { show: true } },
      yAxis: { type: 'category', data: rev.map((r) => r.code), axisLine: { show: false }, axisLabel: { color: t.ink2, fontWeight: 600 } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 16,
          data: rev.map((r) => {
            const base = r.delta >= 0 ? t.divNeg : t.divPos
            return {
              value: r.delta,
              itemStyle: {
                color: r.dim ? mix(base, t.panel, 0.7) : base,
                borderRadius: r.delta >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
              },
              label: {
                show: true,
                position: r.delta >= 0 ? 'right' : 'left',
                color: t.ink2,
                fontSize: 11,
                formatter: () => (r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? `−${-r.delta}` : '0') + (r.finish ? '' : ` ${r.status ?? ''}`),
              },
            }
          }),
          markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: t.axis, type: 'solid', width: 1 }, data: [{ xAxis: 0 }] },
        },
      ],
    }
  }, [data, t, map])

  if (!sessionKey) return <NeedSession />
  const g = gate(...queries)
  if (g) return g
  if (!data.length) return <Empty>Grid and finishing positions aren’t available for this session.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'code', label: 'Driver' },
          { key: 'grid', label: 'Grid', align: 'right' },
          { key: 'finish', label: 'Finish', align: 'right', render: (r: any) => r.finish ?? r.status ?? '—' },
          { key: 'delta', label: 'Places', align: 'right', render: (r: any) => (r.delta > 0 ? `+${r.delta}` : String(r.delta)) },
        ],
        rows: data,
      }}
    />
  )
}

export const positionsGained: WidgetDef = {
  type: 'positions-gained',
  name: 'Places gained and lost',
  description: 'Grid slot versus finishing position for each driver: blue bars gained places, red bars lost them.',
  category: 'Race',
  defaultSize: { w: 7, h: 12 },
  usesDrivers: true,
  Component: PositionsGained,
  options: [
    { key: 'sort', label: 'Sort by', type: 'select', default: 'delta', choices: [{ value: 'delta', label: 'Places gained' }, { value: 'finish', label: 'Finishing order' }] },
    { key: 'includeDnf', label: 'Include retirements', type: 'toggle', default: false, help: 'Retirements count as finishing at the back.' },
  ],
}
