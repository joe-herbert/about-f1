import { useEffect, useMemo, useRef } from 'react'
import { useMeetings, useSessions } from '../../api/hooks'
import { Empty, gate } from '../../components/ui'
import { dateShort } from '../../lib/format'
import { groupBy } from '../../lib/derive'
import { useGlobalSession } from '../../lib/session'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import './misc.css'

const SHORT: Record<string, string> = {
  'Practice 1': 'FP1',
  'Practice 2': 'FP2',
  'Practice 3': 'FP3',
  Qualifying: 'Quali',
  'Sprint Qualifying': 'Sprint quali',
  'Sprint Shootout': 'Shootout',
  Sprint: 'Sprint',
  Race: 'Race',
}

function Calendar({ year, opts }: WidgetProps) {
  const meetings = useMeetings(year)
  const sessions = useSessions(year)
  const current = useGlobalSession()
  const listRef = useRef<HTMLUListElement>(null)

  const { items, nextKey } = useMemo(() => {
    const now = Date.now()
    const byMeeting = groupBy(sessions.data, (s) => s.meeting_key)
    const all = [...(meetings.data ?? [])]
      .filter((m) => opts.testing || !/testing/i.test(m.meeting_name))
      .sort((a, b) => a.date_start.localeCompare(b.date_start))
      .map((m) => ({ m, sessions: (byMeeting.get(m.meeting_key) ?? []).sort((a, b) => a.date_start.localeCompare(b.date_start)) }))
    const next = (sessions.data ?? []).filter((s) => Date.parse(s.date_start) > now && !s.is_cancelled).sort((a, b) => a.date_start.localeCompare(b.date_start))[0]
    return { items: all, nextKey: next?.session_key }
  }, [meetings.data, sessions.data, opts.testing])

  // Bring the selected meeting into view once.
  useEffect(() => {
    listRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'center' })
  }, [items.length])

  const g = gate(meetings, sessions)
  if (g) return g
  if (!items.length) return <Empty>No meetings published for {year} yet.</Empty>

  const select = (key: number) => useStore.getState().setSession(key)
  const now = Date.now()

  return (
    <div className="mw-scroll">
      <ul className="mw-cal" ref={listRef}>
        {items.map(({ m, sessions }) => {
          const end = m.date_end ?? sessions[sessions.length - 1]?.date_end ?? m.date_start
          const isCurrent = sessions.some((s) => s.session_key === current.sessionKey)
          return (
            <li key={m.meeting_key} className={Date.parse(end) < now && !isCurrent ? 'mw-past' : undefined} data-current={isCurrent}>
              {m.country_flag ? <img src={m.country_flag} alt="" loading="lazy" /> : <span />}
              <div>
                <div className="mw-cal-name">{m.meeting_name}</div>
                <div className="mw-cal-sub">
                  {m.circuit_short_name}, {m.country_name}, {dateShort(m.date_start)}
                  {end && dateShort(end) !== dateShort(m.date_start) ? `–${dateShort(end)}` : ''}
                </div>
                <div className="mw-chips">
                  {sessions.map((s) => {
                    const on = s.session_key === current.sessionKey
                    const cls = ['mw-chip', on ? 'mw-on' : '', s.session_key === nextKey ? 'mw-next' : ''].join(' ').trim()
                    return (
                      <button
                        key={s.session_key}
                        type="button"
                        className={cls}
                        disabled={!!s.is_cancelled}
                        aria-pressed={on}
                        title={`${s.session_name}, ${new Date(s.date_start).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${s.session_key === nextKey ? ' (next up)' : ''}`}
                        onClick={() => select(s.session_key)}
                      >
                        {SHORT[s.session_name] ?? s.session_name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export const calendar: WidgetDef = {
  type: 'calendar',
  name: 'Season calendar',
  description: 'Every meeting of the selected season. Click a session to load it across the dashboard.',
  category: 'Session',
  defaultSize: { w: 6, h: 12 },
  sessionless: true,
  Component: Calendar,
  options: [{ key: 'testing', label: 'Include testing', type: 'toggle', default: false }],
}
