import { useMemo, type ReactNode } from 'react'
import { useLaps, useOvertakes, usePits, useRaceControl, useResults, useWeather } from '../../api/hooks'
import type { SessionResult } from '../../api/types'
import { gate, NeedSession, TeamBar } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { cleanLaps, fastestLap, groupBy, mean } from '../../lib/derive'
import { lapTime, raceTime, temp } from '../../lib/format'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import './misc.css'

const METRICS = {
  winner: 'Winner',
  pole: 'Fastest in session',
  'fastest-lap': 'Fastest lap',
  'pit-stops': 'Pit stops',
  'fastest-pit': 'Fastest pit stop',
  overtakes: 'Overtakes',
  'safety-cars': 'Safety car periods',
  'red-flags': 'Red flags',
  laps: 'Laps completed',
  'track-temp': 'Peak track temperature',
  'air-temp': 'Air temperature',
  'leader-pace': 'Winner’s average lap',
  retirements: 'Retirements',
} as const
type Metric = keyof typeof METRICS

const NEEDS: Record<string, Metric[]> = {
  results: ['winner', 'pole', 'retirements', 'leader-pace'],
  laps: ['fastest-lap', 'laps', 'leader-pace'],
  pits: ['pit-stops', 'fastest-pit'],
  overtakes: ['overtakes'],
  rc: ['safety-cars', 'red-flags'],
  weather: ['track-temp', 'air-temp'],
}

function bestTime(r: SessionResult) {
  if (Array.isArray(r.duration)) return [...r.duration].reverse().find((x) => x != null) ?? null
  return r.duration
}

/** First season each figure was recorded in; earlier seasons show a dash, not zero. */
const RECORDED_FROM: Partial<Record<Metric, number>> = {
  'pit-stops': 2011,
  'fastest-pit': 2011,
  overtakes: 2023,
  'safety-cars': 2023,
  'red-flags': 2023,
  'track-temp': 2023,
  'air-temp': 2023,
}

function StatTile({ sessionKey, session, opts }: WidgetProps) {
  const prefs = useStore((s) => s.prefs)
  const metric = (String(opts.metric) in METRICS ? opts.metric : 'winner') as Metric
  const need = (k: keyof typeof NEEDS) => (NEEDS[k].includes(metric) ? sessionKey : null)
  const results = useResults(need('results'))
  const laps = useLaps(need('laps'))
  const pits = usePits(need('pits'))
  const overtakes = useOvertakes(need('overtakes'))
  const rc = useRaceControl(need('rc'))
  const weather = useWeather(need('weather'))
  const { map } = useDriverMap(sessionKey)

  const view = useMemo((): { value: ReactNode; sub?: ReactNode; color?: string } => {
    const name = (n: number) => map.get(n)?.full_name ?? `#${n}`
    const code = (n: number) => map.get(n)?.name_acronym ?? `#${n}`
    const from = RECORDED_FROM[metric]
    if (from && session && session.year < from) return { value: '—', sub: `Not recorded before ${from}` }
    switch (metric) {
      case 'winner':
      case 'pole': {
        const p1 = results.data?.find((r) => r.position === 1)
        if (!p1) return { value: '—', sub: 'No classification yet' }
        const time = bestTime(p1)
        const d = map.get(p1.driver_number)
        return {
          value: d?.last_name ? d.last_name[0] + d.last_name.slice(1).toLowerCase() : name(p1.driver_number),
          color: map.get(p1.driver_number)?.color,
          sub: `${map.get(p1.driver_number)?.team_name ?? ''}${time ? `, ${metric === 'winner' && typeof p1.duration === 'number' ? raceTime(time) : lapTime(time)}` : ''}`,
        }
      }
      case 'fastest-lap': {
        const l = fastestLap(laps.data)
        if (!l) return { value: '—' }
        return { value: lapTime(l.lap_duration), color: map.get(l.driver_number)?.color, sub: `${name(l.driver_number)}, lap ${l.lap_number}` }
      }
      case 'pit-stops': {
        const n = pits.data?.length ?? 0
        const drivers = new Set(pits.data?.map((p) => p.driver_number)).size
        return { value: n, sub: `${drivers} drivers stopped` }
      }
      case 'fastest-pit': {
        const best = [...(pits.data ?? [])].filter((p) => (p.stop_duration ?? p.pit_duration) != null).sort((a, b) => (a.stop_duration ?? a.pit_duration)! - (b.stop_duration ?? b.pit_duration)!)[0]
        if (!best) return { value: '—', sub: 'No pit stops' }
        const v = best.stop_duration ?? best.pit_duration!
        return { value: `${v.toFixed(1)} s`, color: map.get(best.driver_number)?.color, sub: `${name(best.driver_number)}, lap ${best.lap_number}${best.stop_duration ? ' (stationary)' : ' (pit lane)'}` }
      }
      case 'overtakes': {
        const per = groupBy(overtakes.data, (o) => o.overtaking_driver_number)
        const top = [...per].sort((a, b) => b[1].length - a[1].length)[0]
        return { value: overtakes.data?.length ?? 0, sub: top ? `Most by ${code(top[0])} (${top[1].length})` : undefined }
      }
      case 'safety-cars': {
        const msgs = rc.data ?? []
        const sc = msgs.filter((m) => /^SAFETY CAR DEPLOYED/i.test(m.message)).length
        const vsc = msgs.filter((m) => /^(VIRTUAL SAFETY CAR|VSC) DEPLOYED/i.test(m.message)).length
        return { value: sc + vsc, sub: `${sc} safety car, ${vsc} virtual` }
      }
      case 'red-flags': {
        const reds = (rc.data ?? []).filter((m) => m.flag === 'RED')
        return { value: reds.length, sub: reds[0]?.lap_number ? `First on lap ${reds[0].lap_number}` : 'None shown' }
      }
      case 'laps': {
        const max = (laps.data ?? []).reduce((m, l) => Math.max(m, l.lap_number), 0)
        return { value: max, sub: `${laps.data?.length ?? 0} laps across all drivers` }
      }
      case 'track-temp': {
        const ts = (weather.data ?? []).map((w) => w.track_temperature)
        if (!ts.length) return { value: '—' }
        return { value: temp(Math.max(...ts), prefs), sub: `Low of ${temp(Math.min(...ts), prefs)}` }
      }
      case 'air-temp': {
        const last = [...(weather.data ?? [])].sort((a, b) => a.date.localeCompare(b.date)).pop()
        if (!last) return { value: '—' }
        return { value: temp(last.air_temperature, prefs), sub: `Humidity ${Math.round(last.humidity)}%` }
      }
      case 'leader-pace': {
        const p1 = results.data?.find((r) => r.position === 1)
        if (!p1) return { value: '—' }
        const ls = cleanLaps(laps.data, { excludeLap1: true }).filter((l) => l.driver_number === p1.driver_number)
        return { value: lapTime(mean(ls.map((l) => l.lap_duration!))), color: map.get(p1.driver_number)?.color, sub: `${name(p1.driver_number)}, ${ls.length} laps` }
      }
      case 'retirements': {
        const out = (results.data ?? []).filter((r) => r.dnf || r.dns || r.dsq)
        return { value: out.length, sub: out.length ? out.map((r) => code(r.driver_number)).join(', ') : 'Everyone finished' }
      }
    }
  }, [metric, results.data, laps.data, pits.data, overtakes.data, rc.data, weather.data, map, prefs, session])

  if (!sessionKey) return <NeedSession />
  const g = gate(results, laps, pits, overtakes, rc, weather)
  if (g) return g
  return (
    <div className="mw-stat">
      <span className="mw-stat-label">{METRICS[metric]}</span>
      <span className="mw-stat-value">
        {view.color && <TeamBar color={view.color} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{view.value}</span>
      </span>
      {view.sub && <span className="mw-stat-sub">{view.sub}</span>}
    </div>
  )
}

export const statTile: WidgetDef = {
  type: 'stat-tile',
  name: 'Headline figure',
  description: 'One number that matters: the winner, fastest lap, pit stops, overtakes, safety cars, temperature and more.',
  category: 'Session',
  defaultSize: { w: 4, h: 4 },
  Component: StatTile,
  bare: true,
  options: [{ key: 'metric', label: 'Figure', type: 'select', default: 'winner', choices: Object.entries(METRICS).map(([value, label]) => ({ value, label })) }],
}
