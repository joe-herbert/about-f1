import { useEffect, useMemo } from 'react'
import { useWeather } from '../../api/hooks'
import { Empty, gate, NeedSession } from '../../components/ui'
import { DataTable } from '../../components/DataTable'
import { useViewMode, useTableCapability } from '../../components/viewMode'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { METRICS, metricValue, type Metric } from './Weather'
import './misc.css'

function Spark({ values, color, accent }: { values: number[]; color: string; accent: string }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const w = 100
  const h = 26
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)])
  const last = pts[pts.length - 1]
  return (
    <svg className="mw-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={accent} />
    </svg>
  )
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

function WeatherNow({ sessionKey }: WidgetProps) {
  const t = useTokens()
  const prefs = useStore((s) => s.prefs)
  const weather = useWeather(sessionKey)
  const mode = useViewMode()
  const setHasTable = useTableCapability()
  useEffect(() => {
    setHasTable(true)
    return () => setHasTable(false)
  }, [setHasTable])

  const tiles = useMemo(() => {
    const data = [...(weather.data ?? [])].sort((a, b) => a.date.localeCompare(b.date))
    if (!data.length) return []
    const last = data[data.length - 1]
    const step = Math.max(1, Math.floor(data.length / 12))
    const sample = data.filter((_, i) => i % step === 0).slice(-12)
    const tile = (m: Metric) => ({
      key: m,
      label: METRICS[m].label,
      value: `${metricValue(last, m, prefs).toFixed(METRICS[m].digits)}${METRICS[m].unit(prefs) === '%' ? '%' : ` ${METRICS[m].unit(prefs)}`}`,
      spark: sample.map((w) => metricValue(w, m, prefs)),
      extra: null as null | number,
    })
    return [
      tile('track_temperature'),
      tile('air_temperature'),
      tile('humidity'),
      { ...tile('wind_speed'), value: `${last.wind_speed.toFixed(1)} m/s ${COMPASS[Math.round(last.wind_direction / 22.5) % 16]}`, extra: last.wind_direction },
      tile('pressure'),
      { key: 'rainfall', label: 'Rain', value: last.rainfall ? 'Raining' : 'Dry', spark: sample.map((w) => w.rainfall), extra: null },
    ]
  }, [weather.data, prefs])

  if (!sessionKey) return <NeedSession />
  const g = gate(weather)
  if (g) return g
  if (!tiles.length) return <Empty>No weather readings for this session.</Empty>
  if (mode === 'table')
    return <DataTable columns={[{ key: 'label', label: 'Measure' }, { key: 'value', label: 'Latest', align: 'right' }]} rows={tiles} rowKey={(r) => r.key} />

  const sparkColor = t.mode === 'dark' ? '#5a6476' : '#aab3c0'
  return (
    <div className="mw-tiles">
      {tiles.map((x) => (
        <div className="mw-tile" key={x.key}>
          <span className="mw-tile-label">{x.label}</span>
          <span className="mw-tile-value">
            {x.extra !== null && (
              <svg width="16" height="16" viewBox="0 0 16 16" style={{ transform: `rotate(${x.extra + 180}deg)` }} aria-label={`Wind from ${Math.round(x.extra)}°`}>
                <path d="M8 1 L12 13 L8 10 L4 13 Z" fill={t.ink2} />
              </svg>
            )}
            {x.value}
          </span>
          <Spark values={x.spark} color={sparkColor} accent={t.accent} />
        </div>
      ))}
    </div>
  )
}

export const weatherNow: WidgetDef = {
  type: 'weather-now',
  name: 'Current conditions',
  description: 'Latest track and air temperature, humidity, wind, pressure and rain, each with a recent trend.',
  category: 'Conditions',
  minYear: 2023,
  defaultSize: { w: 8, h: 6 },
  Component: WeatherNow,
  options: [],
}
