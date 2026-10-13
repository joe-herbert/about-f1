import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { useIntervals, useLaps, useLocation, useLocationWindows, usePositions, useRaceControl } from '../../api/hooks'
import { DataTable } from '../../components/DataTable'
import { DriverTag, Empty, gate, NeedSession } from '../../components/ui'
import { useTableCapability, useViewMode } from '../../components/viewMode'
import { useDriverMap } from '../../lib/drivers'
import { fastestLap, groupBy, lapWindow, neutralPeriods, sampleAt, type NeutralKind } from '../../lib/derive'
import { gap } from '../../lib/format'
import { FLAG_COLORS, mix, useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import './race.css'

/** Location is fetched for every car a minute at a time (~5k rows), so windows cache and prefetch cleanly. */
const CHUNK_MS = 60_000
const SPEEDS = [1, 2, 5, 10, 20]

const NEUTRAL: Record<NeutralKind, { label: string; color: string }> = {
  SC: { label: 'Safety car', color: FLAG_COLORS.YELLOW },
  VSC: { label: 'Virtual safety car', color: FLAG_COLORS.YELLOW },
  RED: { label: 'Red flag', color: FLAG_COLORS.RED },
}

interface Sample {
  t: number
  x: number
  y: number
}

/** Position at t, interpolated between the samples either side; null when the car has no data near t. */
function locate(samples: Sample[], t: number): Sample | null {
  if (!samples.length) return null
  let lo = 0
  let hi = samples.length - 1
  if (t <= samples[0].t) return samples[0].t - t < 1000 ? samples[0] : null
  if (t >= samples[hi].t) return t - samples[hi].t < 1000 ? samples[hi] : null
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t <= t) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  if (b.t - a.t > 3000) return t - a.t < 1000 ? a : null
  const f = (t - a.t) / (b.t - a.t)
  return { t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
}

function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${m}:${ss}` : `${m}:${ss}`
}

function TrackReplay({ sessionKey, opts, filter }: WidgetProps) {
  const t = useTokens()
  const laps = useLaps(sessionKey)
  const positions = usePositions(sessionKey)
  const intervals = useIntervals(sessionKey)
  const raceControl = useRaceControl(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const mode = useViewMode()
  const setHasTable = useTableCapability()
  useEffect(() => {
    setHasTable(true)
    return () => setHasTable(false)
  }, [setHasTable])

  // The replay runs from the first lap starting to the last one finishing.
  const range = useMemo((): [number, number] | null => {
    let start = Infinity
    let end = -Infinity
    for (const l of laps.data ?? []) {
      if (!l.date_start) continue
      const s = Date.parse(l.date_start)
      start = Math.min(start, s)
      end = Math.max(end, s + (l.lap_duration ?? 0) * 1000)
    }
    return start < end ? [start - 5000, end + 20000] : null
  }, [laps.data])

  const [time, setTime] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  useEffect(() => {
    setTime(null)
    setPlaying(false)
  }, [sessionKey])
  const now = range ? Math.min(range[1], Math.max(range[0], time ?? range[0])) : 0

  // Load the minute being shown and the next one. While scrubbing, wait for the slider
  // to settle so dragging across the race doesn't queue a request per minute.
  const idx = Math.floor(now / CHUNK_MS)
  const [loadIdx, setLoadIdx] = useState(idx)
  useEffect(() => {
    const h = setTimeout(() => setLoadIdx(idx), playing ? 0 : 250)
    return () => clearTimeout(h)
  }, [idx, playing])
  const windows = useMemo(
    () => [loadIdx, loadIdx + 1].map((i): [string, string] => [new Date(i * CHUNK_MS).toISOString(), new Date((i + 1) * CHUNK_MS).toISOString()]),
    [loadIdx],
  )
  const chunks = useLocationWindows(range ? sessionKey : null, windows)
  const chunkKey = chunks.map((q) => q.dataUpdatedAt).join(',')
  const ready = loadIdx === idx && !!chunks[0]?.data

  const samples = useMemo(() => {
    const rows = chunks.flatMap((q) => q.data ?? []).filter((p) => p.x !== 0 || p.y !== 0)
    const out = new Map<number, Sample[]>()
    for (const [n, ps] of groupBy(rows, (p) => p.driver_number)) out.set(n, ps.map((p) => ({ t: Date.parse(p.date), x: p.x, y: p.y })).sort((a, b) => a.t - b.t))
    return out
  }, [chunkKey])

  // Playback pauses on a minute that hasn't loaded yet rather than running ahead of the data.
  const readyRef = useRef(ready)
  readyRef.current = ready
  useEffect(() => {
    if (!playing || !range) return
    let raf = 0
    let last = performance.now()
    const tick = (ts: number) => {
      const dt = ts - last
      last = ts
      if (readyRef.current) setTime((prev) => Math.min(range[1], (prev ?? range[0]) + dt * speed))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, range])
  useEffect(() => {
    if (range && now >= range[1]) setPlaying(false)
  }, [now, range])

  // Track outline: the session's fastest lap.
  const best = useMemo(() => fastestLap(laps.data), [laps.data])
  const bestWin = lapWindow(best)
  const outline = useLocation(sessionKey, best?.driver_number ?? null, bestWin?.[0], bestWin?.[1])

  const geo = useMemo(() => {
    const raw = (outline.data ?? []).filter((p) => p.x !== 0 || p.y !== 0).sort((a, b) => a.date.localeCompare(b.date))
    if (raw.length < 10) return null
    const rot = ((Number(opts.rotation) || 0) * Math.PI) / 180
    const cx = raw.reduce((a, p) => a + p.x, 0) / raw.length
    const cy = raw.reduce((a, p) => a + p.y, 0) / raw.length
    // Rotate about the centroid and flip y so north is up in SVG space.
    const project = (x: number, y: number) => {
      const dx = x - cx
      const dy = y - cy
      return { x: dx * Math.cos(rot) - dy * Math.sin(rot), y: -(dx * Math.sin(rot) + dy * Math.cos(rot)) }
    }
    const pts = raw.map((p) => project(p.x, p.y))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const w = Math.max(...xs) - minX
    const h = Math.max(...ys) - minY
    const unit = Math.max(w, h) / 100
    const pad = unit * 6
    return {
      project,
      unit,
      path: `M${pts.map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`).join('L')}Z`,
      viewBox: `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`,
    }
  }, [outline.data, opts.rotation])

  const periods = useMemo(() => neutralPeriods(raceControl.data), [raceControl.data])

  const series = useMemo(() => {
    const pos = new Map<number, { t: number; v: number }[]>()
    for (const [n, ps] of groupBy(positions.data, (p) => p.driver_number)) pos.set(n, ps.map((p) => ({ t: Date.parse(p.date), v: p.position })).sort((a, b) => a.t - b.t))
    const int = new Map<number, { t: number; v: number | string | null }[]>()
    for (const [n, is] of groupBy(intervals.data, (i) => i.driver_number)) int.set(n, is.map((i) => ({ t: Date.parse(i.date), v: i.interval })).sort((a, b) => a.t - b.t))
    // When each lap number was first started, by whoever was leading.
    const firstStart = new Map<number, number>()
    for (const l of laps.data ?? []) {
      if (!l.date_start) continue
      const s = Date.parse(l.date_start)
      if (s < (firstStart.get(l.lap_number) ?? Infinity)) firstStart.set(l.lap_number, s)
    }
    const lapStarts = [...firstStart].map(([v, t]) => ({ t, v })).sort((a, b) => a.t - b.t)
    const totalLaps = Math.max(0, ...firstStart.keys())
    return { pos, int, lapStarts, totalLaps }
  }, [positions.data, intervals.data, laps.data])

  const order = useMemo(() => {
    const drivers = new Set([...series.pos.keys(), ...samples.keys()])
    return [...drivers]
      .filter((n) => filter.visible(n))
      .map((n) => ({ n, pos: series.pos.has(n) ? sampleAt(series.pos.get(n)!, now) : null, interval: series.int.has(n) ? sampleAt(series.int.get(n)!, now) : null }))
      .sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99) || a.n - b.n)
  }, [series, samples, now, filter])

  if (!sessionKey) return <NeedSession />
  const g = gate(laps)
  if (g) return g
  if (!range || !best) return <Empty>No lap timing for this session yet.</Empty>
  const g2 = gate(outline)
  if (g2) return g2
  if (!geo) return <Empty>No position data published for this session.</Empty>

  const lap = sampleAt(series.lapStarts, now)
  const span = range[1] - range[0]
  const bands = periods
    .map((p) => ({ ...p, end: p.end ?? range[1] }))
    .filter((p) => p.end > range[0] && p.start < range[1])
    .map((p) => {
      const from = sampleAt(series.lapStarts, p.start)
      const to = sampleAt(series.lapStarts, p.end)
      const laps = from && to ? (from === to ? `lap ${from}` : `laps ${from}–${to}`) : ''
      return { ...p, title: `${NEUTRAL[p.kind].label}${laps ? `, ${laps}` : ''}` }
    })
  const active = bands.find((p) => now >= p.start && now < p.end)
  const activeColor = active && NEUTRAL[active.kind].color
  const loading = !ready || chunks.some((q) => q.isLoading)
  const showTower = opts.tower !== false

  if (mode === 'table')
    return (
      <DataTable
        columns={[
          { key: 'pos', label: 'Pos', align: 'right', render: (r) => r.pos ?? '—' },
          { key: 'n', label: 'Driver', render: (r) => <DriverTag d={map.get(r.n)} n={r.n} dim={filter.dimmed(r.n)} /> },
          { key: 'interval', label: 'Interval', align: 'right', render: (r) => (r.pos === 1 ? 'Leader' : gap(r.interval)) },
        ]}
        rows={order}
        rowKey={(r) => r.n}
      />
    )

  const R = geo.unit * 1.6
  const cars = [...order].reverse().flatMap(({ n }) => {
    const s = locate(samples.get(n) ?? [], now)
    if (!s) return []
    const d = map.get(n)
    const color = d?.color ?? t.muted
    const p = geo.project(s.x, s.y)
    return [
      <g key={n} transform={`translate(${p.x} ${p.y})`} opacity={filter.dimmed(n) ? 0.25 : 1}>
        <circle r={R} fill={d?.secondary ? t.panel : color} stroke={color} strokeWidth={R * 0.5} />
        {opts.labels !== false && (
          <text x={R * 1.7} y={R * 0.7} fontSize={R * 2.4} fontWeight={700} fill={t.ink} stroke={t.panel} strokeWidth={R * 0.6} paintOrder="stroke">
            {d?.name_acronym ?? n}
          </text>
        )}
      </g>,
    ]
  })

  return (
    <div className="replay">
      <div className="replay-main">
        {active && (
          <span className="replay-flag" style={{ background: activeColor, color: active.kind === 'RED' ? '#fff' : '#111' }}>
            {active.kind === 'VSC' ? 'VSC' : NEUTRAL[active.kind].label}
          </span>
        )}
        <svg className="replay-map" viewBox={geo.viewBox} role="img" aria-label={`Car positions at ${elapsed(now - range[0])}`}>
          <path d={geo.path} fill="none" stroke={activeColor ? mix(t.axis, activeColor, 0.6) : t.axis} strokeWidth={geo.unit * 2.2} strokeLinejoin="round" />
          {cars}
        </svg>
        {showTower && (
          <ol className="replay-tower">
            {order.map((r) => (
              <li key={r.n} style={{ opacity: filter.dimmed(r.n) ? 0.4 : 1 }}>
                <span className="replay-pos">{r.pos ?? '—'}</span>
                <DriverTag d={map.get(r.n)} n={r.n} />
                <span className="replay-gap">{r.pos === 1 ? '' : gap(r.interval, 1)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="replay-controls">
        <button className="icon-btn" onClick={() => {
            if (!playing && now >= range[1]) setTime(range[0])
            setPlaying(!playing)
          }} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <div className="replay-scrub">
          <input
            type="range"
            min={range[0]}
            max={range[1]}
            step={250}
            value={now}
            onChange={(e) => setTime(Number(e.target.value))}
            aria-label="Session time"
            aria-valuetext={`${elapsed(now - range[0])}${lap ? `, lap ${lap}` : ''}${active ? `, ${NEUTRAL[active.kind].label.toLowerCase()}` : ''}`}
          />
          <div className="replay-bands">
            {bands.map((p) => (
              <button
                key={p.start}
                className={`replay-band replay-band-${p.kind.toLowerCase()}`}
                style={{ left: `${((Math.max(p.start, range[0]) - range[0]) / span) * 100}%`, width: `${((Math.min(p.end, range[1]) - Math.max(p.start, range[0])) / span) * 100}%` }}
                title={p.title}
                aria-label={`Jump to ${p.title}`}
                onClick={() => setTime(p.start)}
              />
            ))}
          </div>
        </div>
        <span className="replay-time">
          {lap ? `Lap ${lap}/${series.totalLaps}` : 'Start'} · {elapsed(now - range[0])}
          {loading && <span className="replay-loading"> · loading</span>}
        </span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export const trackReplay: WidgetDef = {
  type: 'track-replay',
  name: 'Track replay',
  description: 'Where every car was on track at any moment. Drag the slider or press play to move through the session.',
  category: 'Race',
  minYear: 2023,
  defaultSize: { w: 10, h: 13 },
  usesDrivers: true,
  Component: TrackReplay,
  options: [
    { key: 'labels', label: 'Driver labels', type: 'toggle', default: true },
    { key: 'tower', label: 'Running order', type: 'toggle', default: true, help: 'Hidden automatically when the panel is narrow.' },
    { key: 'rotation', label: 'Rotation', type: 'select', default: 0, choices: [{ value: 0, label: '0°' }, { value: 90, label: '90°' }, { value: 180, label: '180°' }, { value: 270, label: '270°' }] },
  ],
}
