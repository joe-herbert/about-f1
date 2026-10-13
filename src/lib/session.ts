import { useMemo } from 'react'
import { useSessionByKey, useSessions } from '../api/hooks'
import type { Session } from '../api/types'
import { useStore } from '../store'

/** Most recent session that has started, else the first of the year. */
export function pickLatest(sessions: Session[] | undefined): Session | undefined {
  if (!sessions?.length) return undefined
  const now = Date.now()
  const started = sessions.filter((s) => Date.parse(s.date_start) <= now && !s.is_cancelled)
  const pool = started.length ? started : sessions
  return [...pool].sort((a, b) => b.date_start.localeCompare(a.date_start))[0]
}

/** The header's session (explicit pick, or latest of the selected year). */
export function useGlobalSession(): { sessionKey: number | null; session: Session | undefined; isLoading: boolean } {
  const year = useStore((s) => s.year)
  const picked = useStore((s) => s.sessionKey)
  const sessions = useSessions(year)
  return useMemo(() => {
    if (picked) {
      const s = sessions.data?.find((x) => x.session_key === picked)
      return { sessionKey: picked, session: s, isLoading: sessions.isLoading }
    }
    const s = pickLatest(sessions.data)
    return { sessionKey: s?.session_key ?? null, session: s, isLoading: sessions.isLoading }
  }, [picked, sessions.data, sessions.isLoading])
}

/** A widget's session: its own pin, or the header's. */
export function useWidgetSession(pinned: number | null | undefined) {
  const global = useGlobalSession()
  const own = useSessionByKey(pinned && pinned !== global.sessionKey ? pinned : null)
  if (pinned && pinned !== global.sessionKey) return { sessionKey: pinned, session: own.data?.[0] }
  return { sessionKey: global.sessionKey, session: global.session }
}

/** True when the session hasn't started yet. */
export const isUpcoming = (s: Session | undefined, now = Date.now()) => !!s && !s.is_cancelled && Date.parse(s.date_start) > now

/** Whether the header's session is still to come; null until the season's sessions load. */
export function useHeaderUpcoming(): boolean | null {
  const { session, isLoading } = useGlobalSession()
  if (!session) return isLoading ? null : false
  return isUpcoming(session)
}
