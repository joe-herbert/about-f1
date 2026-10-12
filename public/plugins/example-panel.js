// An example plugin panel: plain JavaScript, no build step. Add it from "Add panel → Plugins"
// with the URL /plugins/example-panel.js, or copy it somewhere and edit. See WIDGETS.md.
import { createElement as h, useMemo } from 'react'
import { hooks, lib, ui } from 'aboutf1'

function LapSpread({ sessionKey, opts, filter }) {
  const laps = hooks.useLaps(sessionKey)
  const { map } = hooks.useDriverMap(sessionKey)

  const rows = useMemo(() => {
    const clean = lib.derive.cleanLaps(laps.data, { excludeLap1: true, excludePitOut: true, excludeInLaps: true, outlierPct: opts.outlierPct })
    const out = []
    for (const [n, ls] of lib.derive.groupBy(clean, (l) => l.driver_number)) {
      if (!filter.visible(n) || ls.length < 3) continue
      const times = ls.map((l) => l.lap_duration)
      out.push({ n, code: map.get(n)?.name_acronym ?? `#${n}`, color: map.get(n)?.color ?? '#888', best: Math.min(...times), spread: lib.derive.stdev(times), laps: ls.length })
    }
    return out.sort((a, b) => a.spread - b.spread)
  }, [laps.data, map, filter, opts.outlierPct])

  if (!sessionKey) return h(ui.NeedSession)
  const g = ui.gate(laps)
  if (g) return g
  if (!rows.length) return h(ui.Empty, null, 'Not enough clean laps yet.')

  return h(ui.Chart, {
    option: {
      grid: { left: 48, right: 16, top: 8, bottom: 28 },
      xAxis: { type: 'value', name: 'Std dev (s)', nameLocation: 'middle', nameGap: 22 },
      yAxis: { type: 'category', inverse: true, data: rows.map((r) => r.code) },
      tooltip: { trigger: 'item', formatter: (p) => ui.tipRow(rows[p.dataIndex].color, `${p.value.toFixed(3)} s`, `${rows[p.dataIndex].laps} laps`) },
      series: [
        {
          type: 'bar',
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          data: rows.map((r) => ({ value: r.spread, itemStyle: { color: r.color, opacity: filter.dimmed(r.n) ? 0.25 : 1 } })),
        },
      ],
    },
    table: {
      rows,
      columns: [
        { key: 'code', label: 'Driver' },
        { key: 'spread', label: 'Std dev', align: 'right', render: (r) => `${r.spread.toFixed(3)} s` },
        { key: 'best', label: 'Best lap', align: 'right', render: (r) => lib.format.lapTime(r.best) },
        { key: 'laps', label: 'Laps', align: 'right' },
      ],
    },
  })
}

export default {
  type: 'example:lap-spread',
  name: 'Lap spread (example plugin)',
  description: 'How consistent each driver’s clean laps were, as the standard deviation of their lap times. Lower is steadier.',
  category: 'Laps',
  defaultSize: { w: 8, h: 10 },
  usesDrivers: true,
  minYear: 1996,
  Component: LapSpread,
  options: [{ key: 'outlierPct', label: 'Ignore laps slower than median by (%)', type: 'number', default: 7, min: 0, max: 50 }],
}
