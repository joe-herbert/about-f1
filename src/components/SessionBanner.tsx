import { useMemo } from 'react'
import { useLaps, useLocation, useMeetings, useSessions } from '../api/hooks'
import type { Session } from '../api/types'
import { fastestLap, lapWindow } from '../lib/derive'
import { isSynthetic, OPENF1_FIRST_YEAR } from '../api/synthetic'
import { trackClock } from '../lib/trackTime'
import { isUpcoming, useGlobalSession } from '../lib/session'
import { useStore } from '../store'

/** Circuit outline traced from one lap of car position data. */
function CircuitTrace({ sessionKey }: { sessionKey: number }) {
  const laps = useLaps(sessionKey)
  const lap = useMemo(() => fastestLap(laps.data), [laps.data])
  const win = lapWindow(lap)
  const loc = useLocation(sessionKey, lap?.driver_number ?? null, win?.[0], win?.[1])

  const path = useMemo(() => {
    const pts = (loc.data ?? []).filter((p) => p.x || p.y)
    if (pts.length < 20) return null
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const span = Math.max(maxX - minX, maxY - minY) || 1
    const sx = (x: number) => ((x - minX) / span) * 100
    const sy = (y: number) => 100 - ((y - minY) / span) * 100
    const w = ((maxX - minX) / span) * 100
    const h = ((maxY - minY) / span) * 100
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(2)} ${(sy(p.y) - (100 - h)).toFixed(2)}`).join(' ')
    return { d, w, h, start: [sx(pts[0].x), sy(pts[0].y) - (100 - h)] as const }
  }, [loc.data])

  if (!path) return <div className="circuit-trace placeholder" aria-hidden />
  return (
    <svg className="circuit-trace" viewBox={`-6 -6 ${path.w + 12} ${path.h + 12}`} role="img" aria-label="Circuit layout">
      <path d={path.d} className="circuit-under" />
      <path d={path.d} className="circuit-line" pathLength={1} />
      <circle cx={path.start[0]} cy={path.start[1]} r={2.4} className="circuit-start" />
    </svg>
  )
}

/** A session to trace the circuit from: this one, or for one that hasn't run, the latest finished session at the same circuit. */
function useTraceKey(session: Session | undefined, sessionKey: number | null) {
  const upcoming = isUpcoming(session)
  const year = session?.year ?? 0
  const thisYear = useSessions(upcoming ? year : 0)
  const lastYear = useSessions(upcoming && year - 1 >= OPENF1_FIRST_YEAR ? year - 1 : 0)
  return useMemo(() => {
    if (!upcoming) return sessionKey && !isSynthetic(sessionKey) ? sessionKey : null
    const now = Date.now()
    const past = [...(thisYear.data ?? []), ...(lastYear.data ?? [])]
      .filter((s) => s.circuit_key === session!.circuit_key && !s.is_cancelled && Date.parse(s.date_end) < now && !isSynthetic(s.session_key))
      .sort((a, b) => b.date_start.localeCompare(a.date_start))
    return past[0]?.session_key ?? null
  }, [upcoming, session, sessionKey, thisYear.data, lastYear.data])
}

export function SessionBanner() {
  const year = useStore((s) => s.year)
  const { session, sessionKey, isLoading } = useGlobalSession()
  const meetings = useMeetings(year)
  const traceKey = useTraceKey(session, sessionKey)

  const { meeting, round } = useMemo(() => {
    const ms = [...(meetings.data ?? [])].sort((a, b) => a.date_start.localeCompare(b.date_start))
    const rounds = ms.filter((m) => !/testing/i.test(m.meeting_name))
    const meeting = ms.find((m) => m.meeting_key === session?.meeting_key)
    const idx = rounds.findIndex((m) => m.meeting_key === meeting?.meeting_key)
    return { meeting, round: idx >= 0 ? idx + 1 : null }
  }, [meetings.data, session])

  if (!session) {
    return (
      <section className="banner">
        <div className="banner-text">
          <h1 className="banner-title">{isLoading ? 'Loading season…' : `No sessions found for ${year}`}</h1>
        </div>
      </section>
    )
  }

  const start = new Date(session.date_start)
  const track = trackClock(session)
  const live = Date.now() >= start.getTime() && Date.now() <= Date.parse(session.date_end)

  return (
    <section className="banner">
      <div className="banner-text">
        <div className="banner-kicker">
          {round && <span>Round {round}</span>}
          <span>{session.year}</span>
          {live && <span className="live-dot">Live</span>}
        </div>
        <h1 className="banner-title">{meeting?.meeting_name ?? session.country_name}</h1>
        <div className="banner-meta">
          <strong>{session.session_name}</strong>
          <span>{session.location === session.country_name ? session.circuit_short_name : session.location}, {session.country_name}</span>
          <span>{start.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'long' })}</span>
          {track && <span>{start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} your time</span>}
          {track && (
            <span title={track.zone}>
              {track.time}
              {track.day ? ` ${track.day}` : ''} track time <span className="banner-zone">{track.zone}</span>
            </span>
          )}
        </div>
      </div>
      {traceKey ? (
        <CircuitTrace key={traceKey} sessionKey={traceKey} />
      ) : (
        <div className="banner-year" aria-hidden>
          {session.year}
        </div>
      )}
    </section>
  )
}
