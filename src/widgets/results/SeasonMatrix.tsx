import { useMemo } from 'react'
import type { EChartsOption } from 'echarts'
import { useSeasonResults, useSessions } from '../../api/hooks'
import type { SessionResult } from '../../api/types'
import { Chart, tipRow, tipTitle } from '../../components/Chart'
import { Empty, gate } from '../../components/ui'
import { useSeasonDriverMap } from '../../lib/drivers'
import { inkOn, mix, useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import { resultStatus } from './shared'

type CellText = 'position' | 'points' | 'none'

/** What to print inside a cell: DNF/DNS/DSQ always win, then the chosen measure. */
function cellText(r: SessionResult, mode: CellText): string {
  if (mode === 'none') return ''
  const st = resultStatus(r)
  if (mode === 'points') return r.points ? String(r.points) : st ?? ''
  return st ?? (r.position ? String(r.position) : '')
}

function SeasonMatrix({ year, opts, filter }: WidgetProps) {
  const t = useTokens()
  const sessions = useSessions(year)
  const results = useSeasonResults(year)
  const { map } = useSeasonDriverMap(year)
  const kind = String(opts.session)
  // `labels` was a boolean toggle before `cellText` existed; honour a saved "off".
  const textMode = (opts.cellText ?? (opts.labels === false ? 'none' : 'position')) as CellText

  const model = useMemo(() => {
    const sess = (sessions.data ?? [])
      .filter((s) => s.session_name === kind)
      .sort((a, b) => a.date_start.localeCompare(b.date_start))
    const idx = new Map(sess.map((s, i) => [s.session_key, i]))
    const byDriver = new Map<number, (SessionResult | null)[]>()
    for (const r of results.data ?? []) {
      const i = idx.get(r.session_key)
      if (i === undefined || !filter.visible(r.driver_number)) continue
      if (!byDriver.has(r.driver_number)) byDriver.set(r.driver_number, Array(sess.length).fill(null))
      byDriver.get(r.driver_number)![i] = r
    }
    // Keep only rounds that have results
    const used = sess.map((_, i) => [...byDriver.values()].some((a) => a[i]))
    const cols = sess.filter((_, i) => used[i])
    const colIdx = sess.map((_, i) => i).filter((i) => used[i])
    const score = (arr: (SessionResult | null)[]) => {
      if (opts.sort === 'number') return 0
      const ps = arr.filter((r) => r?.position).map((r) => r!.position!)
      if (opts.sort === 'points') return -arr.reduce((a, r) => a + (r?.points ?? 0), 0)
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 99
    }
    const drivers = [...byDriver.entries()]
      .sort((a, b) => score(a[1]) - score(b[1]) || a[0] - b[0])
      .map(([n]) => n)
    return { cols, colIdx, drivers, byDriver }
  }, [sessions.data, results.data, kind, filter, opts.sort])

  const option = useMemo<EChartsOption>(() => {
    const { cols, colIdx, drivers, byDriver } = model
    const rows = [...drivers].reverse()
    const max = 22
    const data: any[] = []
    rows.forEach((n, y) => {
      colIdx.forEach((ci, x) => {
        const r = byDriver.get(n)![ci]
        if (!r) return
        const st = resultStatus(r)
        const pos = r.position
        const dim = filter.dimmed(n)
        let color = t.panel2
        if (pos) color = mix(t.seqLow, t.seqHigh, Math.pow((max - Math.min(pos, max)) / (max - 1), 1.3))
        if (dim) color = mix(color, t.panel, 0.6)
        data.push({
          value: [x, y, pos ?? -1],
          status: st,
          points: r.points ?? 0,
          text: cellText(r, textMode),
          itemStyle: { color, borderColor: t.panel, borderWidth: 2, borderRadius: 3 },
          label: { color: pos ? inkOn(color) : t.muted },
        })
      })
    })
    return {
      grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const s = cols[p.value[0]]
          const n = rows[p.value[1]]
          const d = map.get(n)
          const v = p.data.status ?? (p.value[2] > 0 ? `P${p.value[2]}` : '—')
          const pts = p.data.points ? ` · ${p.data.points} pts` : ''
          return tipTitle(`${s?.country_name ?? ''} ${s?.session_name ?? ''}`) + tipRow(d?.color ?? '#888', v + pts, d?.full_name ?? `#${n}`)
        },
      },
      xAxis: { type: 'category', data: cols.map((s) => s.country_code), position: 'top', splitLine: { show: false }, axisLine: { show: false }, axisLabel: { interval: 0, fontSize: 10 } },
      yAxis: {
        type: 'category',
        data: rows.map((n) => map.get(n)?.name_acronym ?? `#${n}`),
        axisLine: { show: false },
        axisLabel: { color: t.ink2, fontWeight: 600, interval: 0, fontSize: 11 },
      },
      series: [
        {
          // Colours are precomputed per cell, so draw rects directly (heatmap would require a visualMap).
          type: 'custom',
          data,
          encode: { x: 0, y: 1 },
          renderItem: ((params: any, api: any) => {
            const [cx, cy] = api.coord([api.value(0), api.value(1)])
            const [w, h] = api.size([1, 1])
            const item = data[params.dataIndex]
            const text: string = item.text
            const showText = !!text && w >= 18 && h >= 14
            return {
              type: 'rect',
              shape: { x: cx - w / 2 + 1, y: cy - h / 2 + 1, width: w - 2, height: h - 2, r: 3 },
              style: { fill: item.itemStyle.color },
              // Always return textContent: custom series diff elements on update, so omitting it would keep the old label.
              textContent: {
                ignore: !showText,
                style: { text: showText ? text : '', fill: item.label.color, font: `600 ${Math.min(11, Math.floor(h * 0.6))}px Barlow, system-ui, sans-serif` },
              },
              textConfig: { position: 'inside' },
              emphasis: { style: { stroke: t.ink, lineWidth: 1 } },
            }
          }) as any,
        },
      ],
    }
  }, [model, t, map, filter, textMode])

  const g = gate(sessions, results)
  if (g) return g
  if (!model.cols.length) return <Empty>No {kind.toLowerCase()} results for {year} yet.</Empty>
  const tableRows = model.drivers.map((n) => ({
    driver: map.get(n)?.name_acronym ?? `#${n}`,
    ...Object.fromEntries(model.colIdx.map((ci, x) => {
      const r = model.byDriver.get(n)![ci]
      if (!r) return [`c${x}`, '']
      return [`c${x}`, textMode === 'points' ? resultStatus(r) ?? r.points ?? 0 : resultStatus(r) ?? r.position ?? '—']
    })),
  }))
  return (
    <Chart
      option={option}
      table={{
        columns: [{ key: 'driver', label: 'Driver' }, ...model.cols.map((s, x) => ({ key: `c${x}`, label: s.country_code, align: 'right' as const }))],
        rows: tableRows,
      }}
    />
  )
}

export const seasonMatrix: WidgetDef = {
  type: 'season-matrix',
  name: 'Season results grid',
  description: 'Every driver’s finishing position at every round, shaded from P1 (darkest) down.',
  category: 'Championship',
  defaultSize: { w: 14, h: 14 },
  usesDrivers: true,
  sessionless: true,
  Component: SeasonMatrix,
  options: [
    { key: 'session', label: 'Session', type: 'select', default: 'Race', choices: [{ value: 'Race', label: 'Grand Prix' }, { value: 'Sprint', label: 'Sprint' }, { value: 'Qualifying', label: 'Qualifying' }] },
    { key: 'sort', label: 'Sort drivers by', type: 'select', default: 'points', choices: [{ value: 'points', label: 'Points scored' }, { value: 'avg', label: 'Average finish' }, { value: 'number', label: 'Car number' }] },
    { key: 'cellText', label: 'Show in cells', type: 'select', default: 'position', choices: [{ value: 'position', label: 'Finishing position' }, { value: 'points', label: 'Points scored' }, { value: 'none', label: 'Nothing' }] },
  ],
}
