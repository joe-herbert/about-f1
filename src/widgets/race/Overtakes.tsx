import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useOvertakes } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { DriverTag, Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { clock, ordinal } from '../../lib/format'
import { mix, useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import { code, seriesColor } from './common'
import './race.css'

interface Row {
  n: number
  code: string
  color: string
  made: number
  suffered: number
}

function Overtakes({ sessionKey, session, opts, filter }: WidgetProps) {
  const t = useTokens()
  const overtakes = useOvertakes(sessionKey)
  const { map } = useDriverMap(sessionKey)

  const { option, rows } = useMemo(() => {
    const counts = new Map<number, Row>()
    const get = (n: number) => {
      let r = counts.get(n)
      if (!r) {
        const d = map.get(n)
        r = { n, code: code(d, n), color: seriesColor(d, n, filter, t), made: 0, suffered: 0 }
        counts.set(n, r)
      }
      return r
    }
    for (const o of overtakes.data ?? []) {
      get(o.overtaking_driver_number).made++
      get(o.overtaken_driver_number).suffered++
    }
    const rows = [...counts.values()].filter((r) => filter.visible(r.n))
    const sortBy = String(opts.sort)
    rows.sort((a, b) => (sortBy === 'net' ? a.made - a.suffered - (b.made - b.suffered) : a.made - b.made))
    const max = Math.max(1, ...rows.map((r) => Math.max(r.made, r.suffered)))
    const option: EChartsOption = {
      grid: { left: 44, right: 24, top: 24, bottom: 24 },
      graphic: [
        { type: 'text', left: '28%', top: 4, style: { text: 'Lost places', fill: t.muted, fontSize: 11 } },
        { type: 'text', right: '20%', top: 4, style: { text: 'Overtakes made', fill: t.muted, fontSize: 11 } },
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps: any) => {
          const r = rows[(Array.isArray(ps) ? ps[0] : ps).dataIndex]
          return tipTitle(r.code) + tipRow(r.color, String(r.made), 'Overtakes made') + tipRow(mix(r.color, t.panel, 0.55), String(r.suffered), 'Times overtaken') + tipRow(t.ink2, `${r.made - r.suffered >= 0 ? '+' : ''}${r.made - r.suffered}`, 'Net')
        },
      },
      xAxis: { type: 'value', min: -max, max, axisLabel: { formatter: (v: number) => String(Math.abs(v)) } },
      yAxis: { type: 'category', data: rows.map((r) => r.code), axisLabel: { interval: 0, fontSize: 10 }, axisLine: { show: true } },
      series: [
        {
          type: 'bar',
          name: 'Overtaken',
          stack: 'x',
          barMaxWidth: 14,
          data: rows.map((r) => ({ value: -r.suffered, itemStyle: { color: mix(r.color, t.panel, 0.55), borderRadius: [4, 0, 0, 4] } })),
        },
        {
          type: 'bar',
          name: 'Made',
          stack: 'x',
          barMaxWidth: 14,
          data: rows.map((r) => ({ value: r.made, itemStyle: { color: r.color, borderRadius: [0, 4, 4, 0] } })),
        },
      ],
    }
    return { option, rows }
  }, [overtakes.data, map, opts.sort, filter, t])

  const feed = useMemo(
    () =>
      [...(overtakes.data ?? [])]
        .filter((o) => filter.visible(o.overtaking_driver_number) || filter.visible(o.overtaken_driver_number))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [overtakes.data, filter],
  )

  if (!sessionKey) return <NeedSession />
  const g = gate(overtakes)
  if (g) return g
  if (!overtakes.data?.length) return <Empty>No overtakes recorded for this session. They’re published for races and sprints.</Empty>

  if (opts.view === 'list') {
    return (
      <ul className="race-feed">
        {feed.map((o, i) => (
          <li key={i}>
            <span className="feed-time">{clock(o.date, session?.gmt_offset)}</span>
            <span className="feed-what">
              <DriverTag d={map.get(o.overtaking_driver_number)} n={o.overtaking_driver_number} dim={filter.dimmed(o.overtaking_driver_number)} />
              passed
              <DriverTag d={map.get(o.overtaken_driver_number)} n={o.overtaken_driver_number} dim={filter.dimmed(o.overtaken_driver_number)} />
            </span>
            <span className="feed-pos">for {ordinal(o.position)}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'code', label: 'Driver' },
          { key: 'made', label: 'Made', align: 'right' },
          { key: 'suffered', label: 'Overtaken', align: 'right' },
          { key: 'net', label: 'Net', align: 'right', sort: (r: Row) => r.made - r.suffered, render: (r: Row) => `${r.made - r.suffered >= 0 ? '+' : ''}${r.made - r.suffered}` },
        ],
        rows,
      }}
    />
  )
}

export const overtakes: WidgetDef = {
  type: 'overtakes',
  name: 'Overtakes',
  description: 'Overtakes made and places lost per driver, or a running feed of every pass.',
  category: 'Race',
  minYear: 2023,
  defaultSize: { w: 8, h: 11 },
  usesDrivers: true,
  Component: Overtakes,
  options: [
    { key: 'view', label: 'View', type: 'select', default: 'chart', choices: [{ value: 'chart', label: 'Chart' }, { value: 'list', label: 'Feed of passes' }] },
    { key: 'sort', label: 'Order chart by', type: 'select', default: 'made', choices: [{ value: 'made', label: 'Overtakes made' }, { value: 'net', label: 'Net places' }] },
  ],
}
