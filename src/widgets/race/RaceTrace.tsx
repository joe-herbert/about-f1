import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useLaps, usePositions, useResults } from '../../api/hooks'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { cleanLaps, groupBy, median } from '../../lib/derive'
import { lapTime } from '../../lib/format'
import { useTokens } from '../../lib/theme'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import { code, finishingOrder, lineType, seriesColor } from './common'

function RaceTrace({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const showLegend = useStore((s) => s.prefs.showLegends)
  const laps = useLaps(sessionKey)
  const results = useResults(sessionKey)
  const positions = usePositions(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const refMode = String(opts.reference)
  const refDriver = opts.refDriver as number | null

  const { option, rows, refPace, refLabel } = useMemo(() => {
    const byDriver = groupBy(laps.data, (l) => l.driver_number)
    // Cumulative time per lap; stops at the first missing lap time.
    const cum = new Map<number, number[]>()
    for (const [n, ls] of byDriver) {
      const sorted = [...ls].sort((a, b) => a.lap_number - b.lap_number)
      const arr: number[] = [0]
      let total = 0
      for (const l of sorted) {
        if (l.lap_number !== arr.length || !l.lap_duration) break
        total += l.lap_duration
        arr.push(total)
      }
      cum.set(n, arr)
    }
    let refPace = NaN
    let refLabel = ''
    const pick = (n: number | undefined) => {
      const arr = n !== undefined ? cum.get(n) : undefined
      if (arr && arr.length > 1) refPace = arr[arr.length - 1] / (arr.length - 1)
    }
    if (refMode === 'median') {
      refPace = median(cleanLaps(laps.data, { excludePitOut: true, excludeInLaps: true, excludeLap1: true, outlierPct: 7 }).map((l) => l.lap_duration!))
      refLabel = 'median clean lap'
    } else if (refMode === 'driver' && refDriver) {
      pick(refDriver)
      refLabel = `${code(map.get(refDriver), refDriver)} average`
    } else {
      const winner = finishingOrder(results.data, positions.data)[0]
      pick(winner)
      refLabel = `${code(map.get(winner), winner)} average`
    }

    const rows: { driver: string; lap: number; delta: number }[] = []
    const drivers = [...cum.keys()].filter(filter.visible).sort((a, b) => a - b)
    const series: EChartsOption['series'] = drivers.map((n) => {
      const d = map.get(n)
      const color = seriesColor(d, n, filter, t)
      const arr = cum.get(n)!
      const data = arr.map((c, lap) => {
        const v = c - refPace * lap
        if (lap > 0) rows.push({ driver: code(d, n), lap, delta: v })
        return [lap, isFinite(v) ? +v.toFixed(3) : null]
      })
      return {
        type: 'line',
        name: code(d, n),
        data,
        z: filter.dimmed(n) ? 1 : 3,
        lineStyle: { color, width: filter.dimmed(n) ? 1 : 2, type: lineType(d) },
        itemStyle: { color },
        emphasis: { focus: 'series', lineStyle: { width: 3 } },
      }
    })
    const option: EChartsOption = {
      grid: { left: 52, right: 16, top: showLegend ? 36 : 12, bottom: 28 },
      legend: showLegend ? { type: 'scroll', top: 0 } : undefined,
      tooltip: {
        trigger: 'axis',
        formatter: (ps: any) => {
          const arr = (Array.isArray(ps) ? ps : [ps]).filter((p: any) => p.value?.[1] != null)
          arr.sort((a: any, b: any) => a.value[1] - b.value[1])
          return (
            tipTitle(`Lap ${arr[0]?.value[0] ?? ''}`) +
            arr
              .slice(0, 14)
              .map((p: any) => tipRow(p.color, `${p.value[1] > 0 ? '+' : p.value[1] < 0 ? '−' : ''}${Math.abs(p.value[1]).toFixed(1)}s`, p.seriesName))
              .join('')
          )
        },
      },
      xAxis: { type: 'value', name: 'Lap', nameLocation: 'middle', nameGap: 22, minInterval: 1, min: 0, max: 'dataMax' },
      yAxis: {
        type: 'value',
        inverse: true,
        min: Number(opts.cap) ? -Number(opts.cap) / 4 : undefined,
        max: Number(opts.cap) || undefined,
        axisLabel: { formatter: (v: number) => `${v > 0 ? '+' : ''}${v}s` },
      },
      dataZoom: [{ type: 'inside' }],
      series,
    }
    return { option, rows, refPace, refLabel }
  }, [laps.data, results.data, positions.data, map, refMode, refDriver, opts.cap, filter, t, showLegend])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps, results)
  if (g) return g
  if (!isFinite(refPace)) return <Empty>Not enough lap data to build a race trace for this session.</Empty>
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="race-note">
        Seconds behind a reference pace of {lapTime(refPace)} per lap ({refLabel}). Lines going up are gaining.
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Chart
          option={option}
          table={{
            columns: [
              { key: 'driver', label: 'Driver' },
              { key: 'lap', label: 'Lap', align: 'right' },
              { key: 'delta', label: 'Behind reference (s)', align: 'right', render: (r: any) => r.delta.toFixed(3) },
            ],
            rows,
          }}
        />
      </div>
    </div>
  )
}

export const raceTrace: WidgetDef = {
  type: 'race-trace',
  name: 'Race trace',
  description: 'Cumulative race time against a steady reference pace. Shows pit cycles, undercuts and safety car bunching.',
  category: 'Race',
  minYear: 1996,
  defaultSize: { w: 12, h: 10 },
  usesDrivers: true,
  Component: RaceTrace,
  options: [
    {
      key: 'reference',
      label: 'Reference pace',
      type: 'select',
      default: 'winner',
      choices: [
        { value: 'winner', label: 'Winner’s average lap' },
        { value: 'median', label: 'Median clean lap' },
        { value: 'driver', label: 'Chosen driver’s average' },
      ],
    },
    { key: 'refDriver', label: 'Reference driver', type: 'driver', default: null },
    { key: 'cap', label: 'Clamp axis at (s behind)', type: 'number', default: 0, min: 0, max: 600, step: 10, help: '0 fits every line.' },
  ],
}
