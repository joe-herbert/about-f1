import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useWeather } from '../../api/hooks'
import type { Weather as W } from '../../api/types'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { gate, NeedSession } from '../../components/ui'
import { clock, tempValue } from '../../lib/format'
import { useTokens, type Tokens } from '../../lib/theme'
import { useStore, type Prefs } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { alpha } from './helpers'

export type Metric = 'air_temperature' | 'track_temperature' | 'humidity' | 'pressure' | 'wind_speed' | 'rainfall'

export const METRICS: Record<Metric, { label: string; unit: (p: Prefs) => string; digits: number }> = {
  air_temperature: { label: 'Air temperature', unit: (p) => `°${p.tempUnit}`, digits: 1 },
  track_temperature: { label: 'Track temperature', unit: (p) => `°${p.tempUnit}`, digits: 1 },
  humidity: { label: 'Humidity', unit: () => '%', digits: 0 },
  pressure: { label: 'Pressure', unit: () => 'mbar', digits: 1 },
  wind_speed: { label: 'Wind speed', unit: () => 'm/s', digits: 1 },
  rainfall: { label: 'Rainfall', unit: () => '', digits: 0 },
}

export function metricValue(w: W, m: Metric, prefs: Prefs) {
  const v = w[m]
  return m === 'air_temperature' || m === 'track_temperature' ? tempValue(v, prefs) : v
}

/** Categorical slots 1 and 2 of the reference palette, stepped per mode. */
export const seriesColor = (t: Tokens, i: number) => (i === 0 ? (t.mode === 'dark' ? '#3987e5' : '#2a78d6') : t.mode === 'dark' ? '#d95926' : '#eb6834')

function Weather({ sessionKey, session, opts }: WidgetProps) {
  const t = useTokens()
  const prefs = useStore((s) => s.prefs)
  const weather = useWeather(sessionKey)
  const metric = (String(opts.metric) in METRICS ? opts.metric : 'track_temperature') as Metric
  const both = !!opts.stack && (metric === 'air_temperature' || metric === 'track_temperature')
  const metrics: Metric[] = both ? ['track_temperature', 'air_temperature'] : [metric]

  const { option, rows } = useMemo(() => {
    const data = [...(weather.data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
    const unit = METRICS[metrics[0]].unit(prefs)
    const option: EChartsOption = {
      grid: { left: 48, right: 16, top: both && prefs.showLegends ? 30 : 14, bottom: 26 },
      legend: both && prefs.showLegends ? { top: 0, data: metrics.map((m) => METRICS[m].label) } : undefined,
      tooltip: {
        trigger: 'axis',
        formatter: (ps: any) => {
          const arr = Array.isArray(ps) ? ps : [ps]
          if (!arr.length) return ''
          return (
            tipTitle(clock(new Date(arr[0].value[0]).toISOString(), session?.gmt_offset)) +
            arr
              .map((p: any) => {
                const m = metrics[p.seriesIndex]
                const v = metric === 'rainfall' ? (p.value[1] ? 'Rain' : 'Dry') : `${p.value[1].toFixed(METRICS[m].digits)} ${METRICS[m].unit(prefs)}`
                return tipRow(p.color, v, METRICS[m].label)
              })
              .join('')
          )
        },
      },
      xAxis: { type: 'time', axisLabel: { formatter: (v: number) => clock(new Date(v).toISOString(), session?.gmt_offset).slice(0, 5) } },
      yAxis: {
        type: 'value',
        scale: metric !== 'rainfall',
        name: unit,
        nameGap: 6,
        nameTextStyle: { align: 'right' },
        min: metric === 'rainfall' ? 0 : undefined,
        max: metric === 'rainfall' ? 1 : undefined,
        axisLabel: metric === 'rainfall' ? { formatter: (v: number) => (v ? 'Rain' : 'Dry') } : undefined,
      },
      series: metrics.map((m, i) => {
        const color = seriesColor(t, i)
        return {
          type: 'line' as const,
          name: METRICS[m].label,
          step: m === 'rainfall' ? ('end' as const) : undefined,
          showSymbol: false,
          lineStyle: { color, width: 2 },
          itemStyle: { color },
          areaStyle: both ? undefined : { color: alpha(color, 0.1) },
          data: data.map((w) => [Date.parse(w.date), metricValue(w, m, prefs)]),
        }
      }),
    }
    const rows = data.map((w) => ({
      time: clock(w.date, session?.gmt_offset),
      air: tempValue(w.air_temperature, prefs).toFixed(1),
      track: tempValue(w.track_temperature, prefs).toFixed(1),
      humidity: w.humidity,
      pressure: w.pressure,
      wind: w.wind_speed,
      dir: w.wind_direction,
      rain: w.rainfall ? 'Yes' : 'No',
    }))
    return { option, rows }
  }, [weather.data, metric, both, prefs, t, session?.gmt_offset])

  if (!sessionKey) return <NeedSession />
  const g = gate(weather)
  if (g) return g
  return (
    <Chart
      option={option}
      table={{
        columns: [
          { key: 'time', label: 'Local time' },
          { key: 'air', label: `Air °${prefs.tempUnit}`, align: 'right' },
          { key: 'track', label: `Track °${prefs.tempUnit}`, align: 'right' },
          { key: 'humidity', label: 'Humidity %', align: 'right' },
          { key: 'pressure', label: 'Pressure', align: 'right', minor: true },
          { key: 'wind', label: 'Wind m/s', align: 'right' },
          { key: 'dir', label: 'Wind dir °', align: 'right', minor: true },
          { key: 'rain', label: 'Rain' },
        ],
        rows,
      }}
    />
  )
}

export const weather: WidgetDef = {
  type: 'weather',
  name: 'Weather over time',
  description: 'Track and air temperature, humidity, pressure, wind or rain across the session.',
  category: 'Conditions',
  minYear: 2023,
  defaultSize: { w: 8, h: 8 },
  Component: Weather,
  options: [
    { key: 'metric', label: 'Measure', type: 'select', default: 'track_temperature', choices: Object.entries(METRICS).map(([value, m]) => ({ value, label: m.label })) },
    { key: 'stack', label: 'Show air and track temperature together', type: 'toggle', default: false, help: 'Applies when a temperature is selected.' },
  ],
}
