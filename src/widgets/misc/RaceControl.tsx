import { useEffect, useMemo } from 'react'
import { useRaceControl } from '../../api/hooks'
import type { RaceControl as RC } from '../../api/types'
import { DataTable } from '../../components/DataTable'
import { DriverTag, Empty, gate, NeedSession, Pill } from '../../components/ui'
import { useTableCapability, useViewMode } from '../../components/viewMode'
import { useDriverMap } from '../../lib/drivers'
import { clock } from '../../lib/format'
import { FLAG_COLORS, useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import './misc.css'

const isPenalty = (m: RC) => /PENALTY|INVESTIGATION|NOTED|REPRIMAND|DELETED/i.test(m.message)
const isSafety = (m: RC) => m.category === 'SafetyCar' || /SAFETY CAR|VSC/i.test(m.message)

const FILTERS: Record<string, (m: RC) => boolean> = {
  all: () => true,
  flags: (m) => m.category === 'Flag',
  penalties: isPenalty,
  safety: isSafety,
  drs: (m) => m.category === 'Drs' || /DRS/i.test(m.message),
}

function badge(m: RC, t: ReturnType<typeof useTokens>) {
  if (m.flag) return <Pill color={FLAG_COLORS[m.flag] ?? t.axis}>{m.flag.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Pill>
  if (isSafety(m)) return <Pill color="#f2c200">{/VIRTUAL|VSC/i.test(m.message) ? 'VSC' : 'Safety car'}</Pill>
  if (isPenalty(m)) return <Pill color={t.ink2}>Stewards</Pill>
  if (m.category === 'Drs') return <Pill color={t.axis}>DRS</Pill>
  return null
}

function RaceControl({ sessionKey, session, opts, filter }: WidgetProps) {
  const t = useTokens()
  const rc = useRaceControl(sessionKey)
  const { map } = useDriverMap(sessionKey)
  const mode = useViewMode()
  const setHasTable = useTableCapability()
  useEffect(() => {
    setHasTable(true)
    return () => setHasTable(false)
  }, [setHasTable])

  const rows = useMemo(() => {
    const f = FILTERS[String(opts.category)] ?? FILTERS.all
    const q = String(opts.search ?? '').trim().toLowerCase()
    const out = (rc.data ?? [])
      .filter(f)
      .filter((m) => !q || m.message.toLowerCase().includes(q))
      .filter((m) => !opts.onlyFiltered || !filter.selected.length || (m.driver_number != null && filter.selected.includes(m.driver_number)))
      .sort((a, b) => a.date.localeCompare(b.date))
    return opts.newestFirst ? out.reverse() : out
  }, [rc.data, opts.category, opts.search, opts.newestFirst, opts.onlyFiltered, filter.selected])

  if (!sessionKey) return <NeedSession />
  const g = gate(rc)
  if (g) return g
  if (!rows.length) return <Empty>No race control messages match this filter.</Empty>

  if (mode === 'table')
    return (
      <DataTable
        columns={[
          { key: 'date', label: 'Time', render: (m: RC) => clock(m.date, session?.gmt_offset) },
          { key: 'lap_number', label: 'Lap', align: 'right' },
          { key: 'category', label: 'Category' },
          { key: 'flag', label: 'Flag', render: (m: RC) => m.flag ?? '—' },
          { key: 'message', label: 'Message' },
        ]}
        rows={rows}
      />
    )

  return (
    <div className="mw-scroll">
      <ul className="mw-feed">
        {rows.map((m, i) => (
          <li key={`${m.date}-${i}`}>
            <span className="mw-meta">
              {m.lap_number ? `Lap ${m.lap_number}` : ''}
              <br />
              {clock(m.date, session?.gmt_offset).slice(0, 5)}
            </span>
            <span className="mw-msg">
              {badge(m, t)}
              {m.driver_number != null && <DriverTag d={map.get(m.driver_number)} n={m.driver_number} dim={filter.dimmed(m.driver_number)} />}
              <span>{m.message.charAt(0) + m.message.slice(1).toLowerCase()}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const raceControl: WidgetDef = {
  type: 'race-control',
  name: 'Race control',
  description: 'Flags, safety cars, penalties and other messages from race control, as a filterable feed.',
  category: 'Session',
  minYear: 2023,
  defaultSize: { w: 8, h: 10 },
  usesDrivers: true,
  Component: RaceControl,
  options: [
    {
      key: 'category',
      label: 'Show',
      type: 'select',
      default: 'all',
      choices: [
        { value: 'all', label: 'All messages' },
        { value: 'flags', label: 'Flags' },
        { value: 'penalties', label: 'Penalties and investigations' },
        { value: 'safety', label: 'Safety car and VSC' },
        { value: 'drs', label: 'DRS' },
      ],
    },
    { key: 'search', label: 'Only messages containing', type: 'text', default: '' },
    { key: 'newestFirst', label: 'Newest first', type: 'toggle', default: true },
    { key: 'onlyFiltered', label: 'Only messages about filtered drivers', type: 'toggle', default: false },
  ],
}
