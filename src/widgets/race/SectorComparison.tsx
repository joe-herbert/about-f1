import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useLaps } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { cleanLaps, groupBy, mean } from '../../lib/derive'
import { useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import { code, seriesColor } from './common'

const KEYS = ['duration_sector_1', 'duration_sector_2', 'duration_sector_3'] as const

interface Row {
  n: number
  code: string
  color: string
  secondary: boolean
  s: number[]
  d: number[]
}

function SectorComparison({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const laps = useLaps(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const metric = String(opts.metric)

  const { option, rows } = useMemo(() => {
    const src = metric === 'average'
      ? cleanLaps(laps.data, { excludePitOut: true, excludeInLaps: true, excludeLap1: true, outlierPct: 5 })
      : (laps.data ?? []).filter((l) => !l.is_pit_out_lap)
    const rows: Row[] = []
    for (const [n, ls] of groupBy(src, (l) => l.driver_number)) {
      if (!filter.visible(n)) continue
      const s = KEYS.map((k) => {
        const vals = ls.map((l) => l[k]).filter((v): v is number => v != null && v > 0)
        return metric === 'average' ? mean(vals) : vals.length ? Math.min(...vals) : NaN
      })
      if (s.some((v) => !isFinite(v))) continue
      const d = map.get(n)
      rows.push({ n, code: code(d, n), color: seriesColor(d, n, filter, t), secondary: !!d?.secondary, s, d: [] })
    }
    const best = [0, 1, 2].map((i) => Math.min(...rows.map((r) => r.s[i])))
    rows.forEach((r) => (r.d = r.s.map((v, i) => v - best[i])))
    // Order by total: fastest at the top.
    rows.sort((a, b) => b.s.reduce((x, y) => x + y, 0) - a.s.reduce((x, y) => x + y, 0))
    const cats = rows.map((r) => r.code)
    const gap = 3
    const w = (100 - gap * 2 - 6) / 3
    const grids = [0, 1, 2].map((i) => ({ left: `${6 + i * (w + gap)}%`, width: `${w}%`, top: 28, bottom: 24, containLabel: false }))
    const option: EChartsOption = {
      title: [0, 1, 2].map((i) => ({
        text: `Sector ${i + 1}`,
        subtext: `${metric === 'average' ? 'Avg' : 'Best'} ${best[i].toFixed(3)}s`,
        left: `${6 + i * (w + gap)}%`,
        top: 0,
        itemGap: 2,
        textStyle: { fontSize: 12, fontWeight: 600, color: t.ink },
        subtextStyle: { fontSize: 10, color: t.muted },
      })),
      grid: grids,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const r = rows[p.dataIndex]
          const i = p.seriesIndex
          return tipTitle(`${r.code} · Sector ${i + 1}`) + tipRow(r.color, `${r.s[i].toFixed(3)}s`, 'Time') + tipRow(r.color, `+${r.d[i].toFixed(3)}s`, 'To fastest')
        },
      },
      xAxis: [0, 1, 2].map((i) => ({
        type: 'value' as const,
        gridIndex: i,
        min: 0,
        splitNumber: 2,
        axisLabel: { formatter: (v: number) => `+${v}`, fontSize: 10 },
      })),
      yAxis: [0, 1, 2].map((i) => ({
        type: 'category' as const,
        gridIndex: i,
        data: cats,
        axisLabel: { show: i === 0, interval: 0, fontSize: 10 },
        axisLine: { show: true },
      })),
      series: [0, 1, 2].map((i) => ({
        type: 'bar' as const,
        xAxisIndex: i,
        yAxisIndex: i,
        barMaxWidth: 14,
        data: rows.map((r) => ({
          value: +r.d[i].toFixed(3),
          itemStyle: {
            color: r.secondary ? t.panel : r.color,
            borderColor: r.color,
            borderWidth: r.secondary ? 1.5 : 0,
            borderRadius: [0, 4, 4, 0],
          },
        })),
      })),
    }
    return { option, rows }
  }, [laps.data, map, metric, filter, t])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  if (!rows.length) return <Empty>No sector times recorded for this session yet.</Empty>
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'code', label: 'Driver' },
          ...[0, 1, 2].map((i) => ({ key: `s${i}`, label: `S${i + 1}`, align: 'right' as const, sort: (r: Row) => r.s[i], render: (r: Row) => r.s[i].toFixed(3) })),
          ...[0, 1, 2].map((i) => ({ key: `d${i}`, label: `S${i + 1} gap`, align: 'right' as const, sort: (r: Row) => r.d[i], render: (r: Row) => `+${r.d[i].toFixed(3)}` })),
        ],
        rows,
      }}
    />
  )
}

export const sectorComparison: WidgetDef = {
  type: 'sector-comparison',
  name: 'Sector comparison',
  description: 'Time lost to the fastest driver in each of the three sectors, side by side.',
  category: 'Laps',
  minYear: 2023,
  defaultSize: { w: 12, h: 11 },
  usesDrivers: true,
  Component: SectorComparison,
  options: [
    { key: 'metric', label: 'Sector time', type: 'select', default: 'best', choices: [{ value: 'best', label: 'Best' }, { value: 'average', label: 'Average of clean laps' }] },
  ],
}
