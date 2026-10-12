import { useMemo } from 'react'
import { useMeetings, useSessions } from '../api/hooks'
import { FIRST_SEASON } from '../api/jolpica/hooks'
import type { Session } from '../api/types'
import { pickLatest } from '../lib/session'

export function yearChoices(first: number) {
  const now = new Date().getFullYear()
  return Array.from({ length: now - first + 1 }, (_, i) => now - i)
}

interface Props {
  year: number
  sessionKey: number | null
  onYear: (y: number) => void
  onSession: (k: number | null) => void
  /** Offer "Latest session" as the first choice */
  allowLatest?: boolean
  compact?: boolean
}

/** Year → Grand Prix → session, three linked selects. */
export function SessionPicker({ year, sessionKey, onYear, onSession, allowLatest = true, compact }: Props) {
  const meetings = useMeetings(year)
  const sessions = useSessions(year)

  const effective = useMemo<Session | undefined>(() => {
    if (sessionKey) return sessions.data?.find((s) => s.session_key === sessionKey)
    return pickLatest(sessions.data)
  }, [sessionKey, sessions.data])

  const meetingKey = effective?.meeting_key
  const meetingSessions = useMemo(
    () => (sessions.data ?? []).filter((s) => s.meeting_key === meetingKey).sort((a, b) => a.date_start.localeCompare(b.date_start)),
    [sessions.data, meetingKey],
  )
  const sortedMeetings = useMemo(
    () => [...(meetings.data ?? [])].sort((a, b) => a.date_start.localeCompare(b.date_start)),
    [meetings.data],
  )

  const pickMeeting = (mk: number) => {
    const ss = (sessions.data ?? []).filter((s) => s.meeting_key === mk && !s.is_cancelled)
    const now = Date.now()
    const started = ss.filter((s) => Date.parse(s.date_start) <= now)
    const pool = started.length ? started : ss
    // Prefer the race, then the latest session that has run.
    const race = pool.find((s) => s.session_name === 'Race')
    const pick = race ?? [...pool].sort((a, b) => b.date_start.localeCompare(a.date_start))[0]
    if (pick) onSession(pick.session_key)
  }

  return (
    <div className={`session-picker${compact ? ' compact' : ''}`}>
      <label className="select">
        <span className="sr-only">Season</span>
        <select value={year} onChange={(e) => onYear(Number(e.target.value))}>
          {yearChoices(FIRST_SEASON).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className="select grow">
        <span className="sr-only">Grand Prix</span>
        <select value={meetingKey ?? ''} onChange={(e) => pickMeeting(Number(e.target.value))} disabled={!sortedMeetings.length}>
          {!sortedMeetings.length && <option value="">{meetings.isLoading ? 'Loading…' : 'No events'}</option>}
          {sortedMeetings.map((m) => (
            <option key={m.meeting_key} value={m.meeting_key}>
              {m.meeting_name}
            </option>
          ))}
        </select>
      </label>
      <label className="select">
        <span className="sr-only">Session</span>
        <select
          value={sessionKey ?? 'latest'}
          onChange={(e) => onSession(e.target.value === 'latest' ? null : Number(e.target.value))}
          disabled={!meetingSessions.length}
        >
          {allowLatest && <option value="latest">Latest{!sessionKey && effective ? ` (${effective.session_name})` : ''}</option>}
          {meetingSessions.map((s) => (
            <option key={s.session_key} value={s.session_key} disabled={s.is_cancelled}>
              {s.session_name}
              {s.is_cancelled ? ' (cancelled)' : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
