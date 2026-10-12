import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useLaps } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { groupBy } from '../../lib/derive'
import { speedValue } from '../../lib/format'
import { mix, useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'

const TRAPS = { st_speed: 'Speed trap', i1_speed: 'Intermediate 1', i2_speed: 'Intermediate 2 (finish line)' } as const
type Trap = keyof typeof TRAPS

function SpeedTrap({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const prefs = useStore((s) => s.prefs)
  const laps = useLaps(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const trap = (String(opts.trap) in TRAPS ? opts.trap : 'st_speed') as Trap
  const unit = prefs.speedUnit === 'mph' ? 'mph' : 'km/h'

  const { option, rows } = useMemo(() => {
    const rows = [...groupBy(laps.data, (l) => l.driver_number)]
      .filter(([n]) => filter.visible(n))
      .map(([n, ls]) => {
        const best = (k: Trap) => Math.max(0, ...ls.map((l) => l[k] ?? 0))
        return { n, driver: map.get(n)?.name_acronym ?? `#${n}`, st: best('st_speed'), i1: best('i1_speed'), i2: best('i2_speed'), value: best(trap) }
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
    const vals = rows.map((r) => speedValue(r.value, prefs))
    const option: EChartsOption = {
      grid: { left: 48, right: 52, top: 8, bottom: 24 },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const r = rows[p.dataIndex]
          return (
            tipTitle(r.driver) +
            (['st', 'i1', 'i2'] as const)
              .map((k) => tipRow(p.color, `${Math.round(speedValue(r[k], prefs))} ${unit}`, k === 'st' ? 'speed trap' : k === 'i1' ? 'intermediate 1' : 'intermediate 2'))
              .join('')
          )
        },
      },
      xAxis: { type: 'value', min: Math.floor(Math.min(...vals) * 0.97), max: Math.ceil(Math.max(...vals)), axisLabel: { formatter: (v: number) => String(v) } },
      yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.driver), axisLine: { show: false }, axisLabel: { color: t.ink2 } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', color: t.ink2, fontSize: 11, formatter: (p: any) => String(Math.round(p.value)) },
          data: rows.map((r) => {
            const d = map.get(r.n)
            const c = d?.color ?? '#888888'
            return {
              value: speedValue(r.value, prefs),
              itemStyle: { color: filter.dimmed(r.n) ? mix(c, t.panel, 0.7) : d?.secondary ? mix(c, t.panel, 0.4) : c },
            }
          }),
        },
      ],
    }
    return { option, rows }
  }, [laps.data, map, filter, trap, prefs, t, unit])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  const fmt = (v: number) => (v ? Math.round(speedValue(v, prefs)) : '—')
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'driver', label: 'Driver' },
          { key: 'st', label: `Speed trap (${unit})`, align: 'right', render: (r: any) => fmt(r.st) },
          { key: 'i1', label: `I1 (${unit})`, align: 'right', render: (r: any) => fmt(r.i1) },
          { key: 'i2', label: `I2 (${unit})`, align: 'right', render: (r: any) => fmt(r.i2) },
        ],
        rows,
      }}
    />
  )
}

export const speedTrap: WidgetDef = {
  type: 'speed-trap',
  name: 'Speed traps',
  description: 'Each driver’s highest recorded speed through the speed trap or either intermediate.',
  category: 'Telemetry',
  minYear: 2023,
  defaultSize: { w: 6, h: 10 },
  usesDrivers: true,
  Component: SpeedTrap,
  options: [
    { key: 'trap', label: 'Measurement point', type: 'select', default: 'st_speed', choices: Object.entries(TRAPS).map(([value, label]) => ({ value, label })) },
  ],
}
