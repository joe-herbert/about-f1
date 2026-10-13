import { useEffect, useMemo, useState } from 'react'
import { useSessions } from '../../api/hooks'
import { Empty, gate, NeedSession } from '../../components/ui'
import { trackClock } from '../../lib/trackTime'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import './preview.css'

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const parts: [number, string][] = [
    [Math.floor(s / 86400), 'days'],
    [Math.floor(s / 3600) % 24, 'hrs'],
    [Math.floor(s / 60) % 60, 'min'],
    [s % 60, 'sec'],
  ]
  return parts
}

function Weekend({ sessionKey, session, year }: WidgetProps) {
  const sessions = useSessions(session?.year ?? year)
  const now = useNow(1000)

  const weekend = useMemo(
    () => (sessions.data ?? []).filter((s) => s.meeting_key === session?.meeting_key).sort((a, b) => a.date_start.localeCompare(b.date_start)),
    [sessions.data, session?.meeting_key],
  )

  if (!sessionKey) return <NeedSession />
  const g = gate(sessions)
  if (g) return g
  if (!session || !weekend.length) return <Empty>No schedule published for this weekend yet.</Empty>

  const start = Date.parse(session.date_start)
  const end = Date.parse(session.date_end)
  const state = now < start ? 'ahead' : now <= end ? 'live' : 'done'
  const next = weekend.find((s) => !s.is_cancelled && Date.parse(s.date_start) > now)

  return (
    <div className="pv-weekend">
      <div className="pv-count" role="timer" aria-live="off">
        <div className="pv-count-label">{state === 'ahead' ? `${session.session_name} starts in` : state === 'live' ? `${session.session_name} is under way` : `${session.session_name} has finished`}</div>
        {state === 'ahead' && (
          <div className="pv-count-digits">
            {countdown(start - now).map(([v, unit], i) =>
              i === 0 && v === 0 ? null : (
                <span key={unit}>
                  <b className="tnum">{i === 0 ? v : String(v).padStart(2, '0')}</b>
                  <small>{unit}</small>
                </span>
              ),
            )}
          </div>
        )}
      </div>
      <ol className="pv-sessions">
        {weekend.map((s) => {
          const t = new Date(s.date_start)
          const track = trackClock(s)
          const done = Date.parse(s.date_end) < now
          const live = !done && Date.parse(s.date_start) <= now
          const cls = [s.session_key === sessionKey && 'pv-on', done && 'pv-done', s === next && 'pv-next'].filter(Boolean).join(' ')
          return (
            <li key={s.session_key} className={cls || undefined}>
              <button type="button" onClick={() => useStore.getState().setSession(s.session_key)} disabled={!!s.is_cancelled} aria-pressed={s.session_key === sessionKey}>
                <span className="pv-s-name">
                  {s.session_name}
                  {s.is_cancelled ? ' (cancelled)' : live ? <span className="live-dot">Live</span> : s === next ? <span className="pv-tag">Next</span> : null}
                </span>
                <span className="pv-s-when tnum">
                  {t.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, {t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {track && (
                  <span className="pv-s-track tnum" title={track.zone}>
                    {track.time}
                    {track.day ? ` ${track.day}` : ''} track
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export const previewWeekend: WidgetDef = {
  type: 'preview-weekend',
  name: 'Weekend schedule',
  description: 'A countdown to the selected session and every session of its weekend in your time and track time. Click a session to load it.',
  category: 'Preview',
  defaultSize: { w: 8, h: 17 },
  Component: Weekend,
  options: [],
}
