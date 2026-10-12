import { useMemo } from 'react'
import { useTeamRadio } from '../../api/hooks'
import { DriverTag, Empty, gate, NeedSession } from '../../components/ui'
import { useDriverMap } from '../../lib/drivers'
import { clock } from '../../lib/format'
import type { WidgetDef, WidgetProps } from '../types'
import './misc.css'

function TeamRadio({ sessionKey, session, opts, filter }: WidgetProps) {
  const radio = useTeamRadio(sessionKey)
  const { map } = useDriverMap(sessionKey)

  const rows = useMemo(() => {
    const out = (radio.data ?? []).filter((r) => filter.visible(r.driver_number)).sort((a, b) => a.date.localeCompare(b.date))
    return opts.newestFirst ? out.reverse() : out
  }, [radio.data, filter, opts.newestFirst])

  if (!sessionKey) return <NeedSession />
  const g = gate(radio)
  if (g) return g
  if (!rows.length) return <Empty>No team radio published for these drivers.</Empty>

  return (
    <div className="mw-scroll">
      <ul className="mw-feed">
        {rows.map((r) => (
          <li key={r.recording_url} style={{ opacity: filter.dimmed(r.driver_number) ? 0.45 : 1 }}>
            <span className="mw-meta">{clock(r.date, session?.gmt_offset).slice(0, 5)}</span>
            <span>
              <DriverTag d={map.get(r.driver_number)} n={r.driver_number} />
              <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 6 }}>{map.get(r.driver_number)?.team_name}</span>
              <audio controls preload="none" src={r.recording_url} aria-label={`Team radio, ${map.get(r.driver_number)?.full_name ?? r.driver_number}`} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const teamRadio: WidgetDef = {
  type: 'team-radio',
  name: 'Team radio',
  description: 'Listen to the radio clips published for the session, filtered by driver.',
  category: 'Session',
  minYear: 2023,
  defaultSize: { w: 6, h: 10 },
  usesDrivers: true,
  Component: TeamRadio,
  options: [{ key: 'newestFirst', label: 'Newest first', type: 'toggle', default: true }],
}
