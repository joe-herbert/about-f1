import { useEffect, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { useTokens, type Tokens } from '../lib/theme'
import { useStore } from '../store'
import { DataTable, type Column } from './DataTable'
import { useTableCapability, useViewMode } from './viewMode'

export const FONT = '"Barlow", system-ui, -apple-system, "Segoe UI", sans-serif'

const registered = new Set<string>()
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function registerTheme(t: Tokens) {
  const name = `f1-${t.mode}`
  if (registered.has(name)) return name
  registered.add(name)
  const axis = {
    axisLine: { show: true, lineStyle: { color: t.axis, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontFamily: FONT, fontSize: 11 },
    splitLine: { show: true, lineStyle: { color: t.hair, width: 1, type: 'solid' } },
    nameTextStyle: { color: t.muted, fontFamily: FONT, fontSize: 11 },
  }
  echarts.registerTheme(name, {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT, color: t.ink2 },
    legend: { textStyle: { color: t.ink2, fontFamily: FONT, fontSize: 11 }, icon: 'roundRect', itemWidth: 14, itemHeight: 3 },
    tooltip: {
      backgroundColor: t.panel,
      borderColor: t.hair,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: t.ink, fontFamily: FONT, fontSize: 12 },
      extraCssText: `box-shadow: 0 6px 24px rgba(0,0,0,${t.mode === 'dark' ? 0.5 : 0.12}); border-radius: 8px;`,
      axisPointer: { lineStyle: { color: t.axis }, crossStyle: { color: t.axis } },
    },
    categoryAxis: { ...axis, splitLine: { show: false } },
    valueAxis: { ...axis, axisLine: { show: false } },
    timeAxis: { ...axis, splitLine: { show: false } },
    logAxis: axis,
    dataZoom: { textStyle: { color: t.muted }, borderColor: t.hair, fillerColor: `${t.accent}22`, handleStyle: { color: t.panel, borderColor: t.axis } },
    visualMap: { textStyle: { color: t.muted, fontFamily: FONT } },
    line: { symbol: 'none', lineStyle: { width: 2, cap: 'round', join: 'round' }, smooth: false },
    bar: { itemStyle: { borderRadius: [4, 4, 0, 0] } },
  })
  return name
}

export interface TableSpec<T = Record<string, unknown>> {
  columns: Column<T>[]
  rows: T[]
}

interface Props {
  option: EChartsOption
  /** Rows backing the chart, shown when the widget is flipped to table view. */
  table?: TableSpec<any>
  onEvents?: Record<string, (p: any) => void>
  /** Replace instead of merge on update (needed when series sets change) */
  notMerge?: boolean
}

export function Chart({ option, table, onEvents, notMerge = true }: Props) {
  const t = useTokens()
  const animate = useStore((s) => s.prefs.animate)
  const mode = useViewMode()
  const setHasTable = useTableCapability()
  const hasTable = !!table
  useEffect(() => {
    setHasTable(hasTable)
    return () => setHasTable(false)
  }, [hasTable, setHasTable])
  const theme = registerTheme(t)
  const merged = useMemo<EChartsOption>(
    () => ({ animation: animate && !reducedMotion, animationDuration: 400, ...option }),
    [option, animate],
  )
  if (mode === 'table' && table) return <DataTable columns={table.columns} rows={table.rows} />
  return (
    <ReactECharts
      key={theme}
      echarts={echarts}
      option={merged}
      theme={theme}
      notMerge={notMerge}
      lazyUpdate
      onEvents={onEvents}
      style={{ width: '100%', height: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  )
}

/** Common tooltip row: short line-key, value first, label second. */
export function tipRow(color: string, value: string, name: string, dashed = false) {
  const key = dashed
    ? `<span style="display:inline-block;width:12px;height:0;border-top:2px dashed ${color};margin-right:8px;vertical-align:middle"></span>`
    : `<span style="display:inline-block;width:12px;height:2px;background:${color};border-radius:1px;margin-right:8px;vertical-align:middle"></span>`
  return `<div style="display:flex;align-items:center;gap:2px;line-height:1.6">${key}<b style="font-variant-numeric:tabular-nums;min-width:56px">${escapeHtml(value)}</b><span style="opacity:.7">${escapeHtml(name)}</span></div>`
}

export function tipTitle(s: string) {
  return `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(s)}</div>`
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
