import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { usePits, useStints } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Compound, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { COMPOUNDS, compoundColor, inkOn, mix, useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { byRank, useFinishOrder } from './helpers'

interface Row {
  driver: string
  n: number
  stint: number
  compound: string
  from: number
  to: number
  age: number
  pit: number | null
}

function TyreStrategy({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const stints = useStints(sessionKey)
  const pits = usePits(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const { rank } = useFinishOrder(sessionKey)

  const { option, rows } = useMemo(() => {
    const drivers = [...new Set((stints.data ?? []).map((s) => s.driver_number))].filter(filter.visible)
    drivers.sort(opts.sort === 'number' ? (a, b) => a - b : byRank(rank))
    const cats = drivers.map((n) => map.get(n)?.name_acronym ?? `#${n}`)
    const pitByLap = new Map((pits.data ?? []).map((p) => [`${p.driver_number}:${p.lap_number}`, p]))
    const rows: Row[] = []
    for (const s of stints.data ?? []) {
      if (!drivers.includes(s.driver_number)) continue
      const p = pitByLap.get(`${s.driver_number}:${s.lap_start}`) ?? pitByLap.get(`${s.driver_number}:${s.lap_start - 1}`)
      rows.push({
        driver: map.get(s.driver_number)?.name_acronym ?? `#${s.driver_number}`,
        n: s.driver_number,
        stint: s.stint_number,
        compound: s.compound ?? 'UNKNOWN',
        from: s.lap_start,
        to: s.lap_end,
        age: s.tyre_age_at_start,
        pit: s.stint_number > 1 ? p?.stop_duration ?? p?.pit_duration ?? null : null,
      })
    }
    const data = rows.map((r) => ({
      value: [drivers.indexOf(r.n), r.from - 1, r.to, r.stint],
      row: r,
      dim: filter.dimmed(r.n),
    }))
    const used = [...new Set(rows.map((r) => r.compound.toUpperCase()))]
    const option: EChartsOption = {
      grid: { left: 48, right: 16, top: showLegend ? 30 : 8, bottom: 28 },
      legend: showLegend
        ? {
            top: 0,
            data: used.map((c) => ({ name: COMPOUNDS[c]?.label ?? c, itemStyle: { color: compoundColor(c, t) } })),
            icon: 'roundRect',
            itemWidth: 12,
            itemHeight: 8,
            selectedMode: false,
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const r: Row = p.data.row
          const k = COMPOUNDS[r.compound.toUpperCase()]
          return (
            tipTitle(`${r.driver}, stint ${r.stint}`) +
            tipRow(compoundColor(r.compound, t), k?.label ?? r.compound, 'compound') +
            tipRow(t.axis, `${r.from}–${r.to}`, `laps (${r.to - r.from + 1})`) +
            tipRow(t.axis, String(r.age), 'tyre age at start') +
            (r.pit != null ? tipRow(t.axis, `${r.pit.toFixed(1)} s`, 'pit stop before stint') : '')
          )
        },
      },
      xAxis: { type: 'value', name: 'Lap', nameLocation: 'middle', nameGap: 20, min: 0, max: 'dataMax', minInterval: 1, splitLine: { show: true } },
      yAxis: { type: 'category', data: cats, inverse: true, axisLine: { show: false }, axisLabel: { color: t.ink2 } },
      series: [
        // Empty series so the legend has entries
        ...used.map((c) => ({ type: 'bar' as const, name: COMPOUNDS[c]?.label ?? c, data: [] })),
        {
          type: 'custom',
          name: 'stints',
          encode: { x: [1, 2], y: 0 },
          data,
          renderItem: (params: any, api: any) => {
            const item = data[params.dataIndex]
            const y = api.value(0)
            const start = api.coord([api.value(1), y])
            const end = api.coord([api.value(2), y])
            const band = api.size([0, 1])[1]
            const h = Math.min(18, band * 0.62)
            const x = start[0] + 1
            const w = Math.max(1, end[0] - start[0] - 2)
            let fill = compoundColor(item.row.compound, t)
            if (item.dim) fill = mix(fill, t.panel, 0.7)
            const label = (COMPOUNDS[item.row.compound.toUpperCase()]?.short ?? '?') + (item.row.age > 0 ? '*' : '')
            const children: any[] = [
              { type: 'rect', shape: { x, y: start[1] - h / 2, width: w, height: h, r: 3 }, style: { fill } },
            ]
            if (w > 22 && h >= 12)
              children.push({
                type: 'text',
                style: { text: label, x: x + w / 2, y: start[1], align: 'center', verticalAlign: 'middle', fill: inkOn(fill), fontSize: 10, fontWeight: 600, fontFamily: 'Barlow' },
              })
            if (opts.showPits && item.row.pit != null && h >= 10)
              children.push({
                type: 'text',
                style: { text: item.row.pit.toFixed(1), x: x - 1, y: start[1] - h / 2 - 1, align: 'center', verticalAlign: 'bottom', fill: t.muted, fontSize: 9, fontFamily: 'Barlow' },
              })
            return { type: 'group', children }
          },
        } as any,
      ],
    }
    return { option, rows }
  }, [stints.data, pits.data, map, rank, opts, filter, t, showLegend])

  if (!sessionKey) return <NeedSession />
  const g = gate(stints)
  if (g) return g
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'driver', label: 'Driver' },
          { key: 'stint', label: 'Stint', align: 'right' },
          { key: 'compound', label: 'Tyre', render: (r: Row) => <Compound c={r.compound} age={r.age} /> },
          { key: 'from', label: 'From lap', align: 'right' },
          { key: 'to', label: 'To lap', align: 'right' },
          { key: 'laps', label: 'Laps', align: 'right', render: (r: Row) => r.to - r.from + 1, sort: (r: Row) => r.to - r.from },
          { key: 'pit', label: 'Stop (s)', align: 'right', render: (r: Row) => (r.pit != null ? r.pit.toFixed(1) : '—') },
        ],
        rows,
      }}
    />
  )
}

export const tyreStrategy: WidgetDef = {
  type: 'tyre-strategy',
  name: 'Tyre strategy',
  description: 'Every stint per driver, coloured by compound. Used tyres are marked with an asterisk.',
  category: 'Strategy',
  minYear: 2023,
  defaultSize: { w: 12, h: 11 },
  usesDrivers: true,
  Component: TyreStrategy,
  options: [
    { key: 'sort', label: 'Order', type: 'select', default: 'finish', choices: [{ value: 'finish', label: 'Finishing order' }, { value: 'number', label: 'Car number' }] },
    { key: 'showPits', label: 'Show pit-stop times', type: 'toggle', default: false },
  ],
}
