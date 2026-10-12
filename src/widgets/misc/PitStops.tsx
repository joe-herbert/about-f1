import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { usePits } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { DataTable } from '../../components/DataTable'
import { DriverTag, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { mix, useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'

interface Row {
  key: string
  n: number
  driver: string
  lap: number
  lane: number | null
  stop: number | null
  value: number | null
}

const fmt = (v: number | null | undefined) => (v != null ? v.toFixed(1) : '—')

function PitStops({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const pits = usePits(sessionKey)
  const { map } = useDriverMap(sessionKey)

  const rows = useMemo<Row[]>(() => {
    return (pits.data ?? [])
      .filter((p) => filter.visible(p.driver_number))
      .map((p) => {
        const lane = p.lane_duration ?? p.pit_duration ?? null
        const stop = p.stop_duration ?? null
        return {
          key: `${p.driver_number}:${p.lap_number}`,
          n: p.driver_number,
          driver: map.get(p.driver_number)?.name_acronym ?? `#${p.driver_number}`,
          lap: p.lap_number,
          lane,
          stop,
          value: opts.measure === 'stop' ? stop ?? lane : lane,
        }
      })
      .filter((r) => r.value != null && r.value > 0)
      .sort((a, b) => a.value! - b.value!)
  }, [pits.data, map, filter, opts.measure])

  const option = useMemo<EChartsOption>(() => {
    const top = rows.slice(0, Number(opts.limit) || rows.length)
    return {
      grid: { left: 76, right: 44, top: 8, bottom: 24 },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const r: Row = top[p.dataIndex]
          return tipTitle(`${r.driver}, lap ${r.lap}`) + tipRow(p.color, `${fmt(r.lane)} s`, 'pit lane') + (r.stop != null ? tipRow(p.color, `${fmt(r.stop)} s`, 'stationary') : '')
        },
      },
      xAxis: { type: 'value', scale: false, axisLabel: { formatter: (v: number) => `${v}s` } },
      yAxis: {
        type: 'category',
        inverse: true,
        data: top.map((r) => `${r.driver}  L${r.lap}`),
        axisLine: { show: false },
        axisLabel: { color: t.ink2 },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: t.ink2, fontSize: 11, formatter: (p: any) => fmt(p.value) },
          data: top.map((r) => {
            const d = map.get(r.n)
            const c = d?.color ?? '#888888'
            return {
              value: r.value,
              itemStyle: {
                color: filter.dimmed(r.n) ? mix(c, t.panel, 0.7) : d?.secondary ? mix(c, t.panel, 0.45) : c,
              },
            }
          }),
        },
      ],
    }
  }, [rows, map, filter, opts.limit, t])

  if (!sessionKey) return <NeedSession />
  const g = gate(pits)
  if (g) return g

  const columns = [
    { key: 'lap', label: 'Lap', align: 'right' as const },
    { key: 'driver', label: 'Driver', render: (r: Row) => <DriverTag d={map.get(r.n)} n={r.n} dim={filter.dimmed(r.n)} /> },
    { key: 'lane', label: 'Pit lane (s)', align: 'right' as const, render: (r: Row) => fmt(r.lane) },
    { key: 'stop', label: 'Stationary (s)', align: 'right' as const, render: (r: Row) => fmt(r.stop) },
  ]
  if (opts.view === 'table')
    return <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} initialSort={{ key: 'lap', dir: 1 }} empty="No pit stops in this session." />
  if (!rows.length) return <div className="state">No pit stops in this session.</div>
  return <Chart option={option} table={{ columns, rows }} />
}

export const pitStops: WidgetDef = {
  type: 'pit-stops',
  name: 'Pit stops',
  description: 'Every pit stop ranked by time in the pit lane or stationary time, as bars or a table.',
  category: 'Strategy',
  minYear: 2011,
  defaultSize: { w: 8, h: 10 },
  usesDrivers: true,
  Component: PitStops,
  options: [
    { key: 'view', label: 'View', type: 'select', default: 'chart', choices: [{ value: 'chart', label: 'Bar chart' }, { value: 'table', label: 'Table' }] },
    { key: 'measure', label: 'Measure', type: 'select', default: 'lane', choices: [{ value: 'lane', label: 'Pit-lane time' }, { value: 'stop', label: 'Stationary time (when available)' }] },
    { key: 'limit', label: 'Show fastest N stops (0 = all)', type: 'number', default: 0, min: 0, max: 100, step: 1 },
  ],
}
