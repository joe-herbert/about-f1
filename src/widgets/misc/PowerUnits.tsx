import { useMemo } from 'react'
import { usePowerUnits } from '../../api/powerUnits/hooks'
import type { PowerUnitSeason } from '../../api/powerUnits/types'
import { DataTable } from '../../components/DataTable'
import { DriverTag, Empty, gate, Pill } from '../../components/ui'
import { useSeasonDriverMap } from '../../lib/drivers'
import { countsAt, eventIndexFor, risk, type Risk } from '../../lib/powerUnits'
import { useTokens } from '../../lib/theme'
import type { WidgetDef, WidgetProps } from '../types'
import './misc.css'

type Change = PowerUnitSeason['changes'][number]

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

/** The technical delegate's report and the stewards' decision often list the same element; keep one. */
function dedupe(changes: Change[]): Change[] {
  const seen = new Map<string, Change>()
  for (const c of changes) {
    const k = `${c.number}/${c.element}/${c.nth}`
    const prev = seen.get(k)
    if (!prev || (prev.source === 'stewards' && c.source === 'technical')) seen.set(k, c)
  }
  return [...seen.values()].sort((a, b) => a.at.localeCompare(b.at))
}

interface Row {
  number: number
  name: string
  car: string
  used: Record<string, number>
  /** Elements new at the event shown */
  fresh: Set<string>
  worst: number
  status: string
}

function PowerUnits({ year: headerYear, session, opts, filter }: WidgetProps) {
  const t = useTokens()
  const year = Number(opts.season) || headerYear
  const q = usePowerUnits(year)
  const { map } = useSeasonDriverMap(year)
  const data = q.data

  // The event shown: the header's Grand Prix when it's in this season, else the latest.
  const index = useMemo(() => {
    if (!data?.events.length) return -1
    if (opts.asOf === 'latest' || session?.year !== year) return data.events.length - 1
    return eventIndexFor(data, session?.date_start)
  }, [data, opts.asOf, session, year])
  const event = data && index >= 0 ? data.events[index] : undefined

  const changes = useMemo(() => (data ? dedupe(data.changes) : []), [data])
  const names = useMemo(() => new Map(data?.drivers.map((d) => [d.number, d])), [data])
  const order = useMemo(() => new Map(data?.events.map((e, i) => [e.id, i])), [data])

  const rows = useMemo<Row[]>(() => {
    if (!data || index < 0) return []
    const counts = countsAt(data, index)
    // Table order (team by team) from the latest table up to this event
    const table = data.tables.filter((tb) => (order.get(tb.event) ?? Infinity) <= index).at(-1)
    const numbers = [...new Set([...(table?.rows.map((r) => r.number) ?? []), ...counts.keys()])]
    return numbers
      .filter((n) => filter.visible(n))
      .map((n) => {
        const used = counts.get(n) ?? {}
        const fresh = new Set(changes.filter((c) => c.number === n && order.get(c.event) === index).map((c) => c.element))
        const over: string[] = []
        const last: string[] = []
        let worst = 0
        for (const el of data.elements) {
          const r = risk(used[el.code], el.allowance)
          if (r === 'over') over.push(`${el.code} +${used[el.code] - el.allowance!}`)
          if (r === 'last') last.push(el.code)
          worst = Math.max(worst, r === 'over' ? 2 : r === 'last' ? 1 : 0)
        }
        const status = [over.length ? `Over: ${over.join(', ')}` : '', last.length ? `Next ${last.join(', ')} = penalty` : ''].filter(Boolean).join(' · ')
        return { number: n, name: names.get(n)?.name ?? `#${n}`, car: names.get(n)?.car ?? '', used, fresh, worst, status }
      })
  }, [data, index, order, changes, names, filter])

  // This season's driver from the timing data where there is one, else the name the FIA gives.
  const who = (n: number, name?: string, car?: string) => {
    const d = map.get(n)
    const dim = filter.dimmed(n)
    return (
      <span title={[name ?? d?.full_name, car].filter(Boolean).join(', ')}>
        {d ? <DriverTag d={d} n={n} dim={dim} /> : <span style={{ opacity: dim ? 0.4 : 1 }}>{name ? `${name} (${n})` : `#${n}`}</span>}
      </span>
    )
  }

  if (year < 2019) return <Empty>The FIA's published documents start in 2019.</Empty>
  const g = gate(q)
  if (g) return g
  if (!data) return null
  if (!data.events.length) {
    return (
      <Empty>
        {data.scraping || q.isFetching
          ? `Reading ${year}'s power unit documents from the FIA. This takes a few minutes the first time.`
          : `No power unit documents for ${year} yet.`}
      </Empty>
    )
  }

  const footer = (
    <div className="pu-foot">
      {event ? `After the ${event.name}` : 'Before the first event'} · from FIA documents, checked {shortDate(data.updatedAt)}
      {data.unreadDocuments ? ` · ${data.unreadDocuments} unreadable` : ''}
      {data.scraping ? ' · still reading the rest of the season' : ''}
    </div>
  )

  if (opts.view === 'changes') {
    const shown = changes
      .filter((c) => (order.get(c.event) ?? Infinity) <= index && filter.visible(c.number))
      .filter((c) => opts.allEvents || order.get(c.event) === index)
      .reverse()
    const allowance = new Map(data.elements.map((e) => [e.code, e.allowance]))
    const color: Record<Risk, string> = { ok: t.axis, last: t.warn, over: t.bad }
    return (
      <div className="mw-col">
        <div className="mw-scroll mw-grow">
          {!shown.length ? (
            <Empty>No new power unit elements {opts.allEvents ? 'so far' : `at the ${event?.name ?? 'event'}`}.</Empty>
          ) : (
            <ul className="mw-feed">
              {shown.map((c, i) => {
                const a = allowance.get(c.element) ?? c.allowance
                return (
                  <li key={`${c.url}-${c.number}-${c.element}-${i}`}>
                    <span className="mw-meta">{opts.allEvents ? data.events[order.get(c.event)!]?.name.replace(/ Grand Prix$/, '') : shortDate(c.at)}</span>
                    <span className="mw-msg">
                      {who(c.number, names.get(c.number)?.name)}
                      <span>
                        {ordinal(c.nth)} {c.element}
                        {a ? ` of ${a}` : ''}
                      </span>
                      {risk(c.nth, a) !== 'ok' && <Pill color={color[risk(c.nth, a)]}>{c.nth > (a ?? Infinity) ? 'Over the limit' : 'Last one allowed'}</Pill>}
                      {c.source === 'stewards' && <span className="pu-note">from the stewards' decision</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        {footer}
      </div>
    )
  }

  if (opts.view === 'penalties') {
    const shown = data.penalties
      .filter((p) => (order.get(p.event) ?? Infinity) <= index && filter.visible(p.number))
      .filter((p) => opts.allEvents || order.get(p.event) === index)
      .reverse()
    return (
      <div className="mw-col">
        <div className="mw-scroll mw-grow">
          {!shown.length ? (
            <Empty>No power unit penalties {opts.allEvents ? 'so far' : `at the ${event?.name ?? 'event'}`}.</Empty>
          ) : (
            <ul className="mw-feed">
              {shown.map((p) => (
                <li key={p.url}>
                  <span className="mw-meta">{data.events[order.get(p.event)!]?.name.replace(/ Grand Prix$/, '')}</span>
                  <span className="mw-msg">
                    {who(p.number, p.driver)}
                    <Pill color={t.bad}>{p.pitLane ? 'Pit lane start' : p.backOfGrid ? 'Back of the grid' : p.gridPlaces ? `${p.gridPlaces} places` : 'Penalty'}</Pill>
                    <span>{p.decision}</span>
                    {!!p.elements.length && <span className="pu-note">{p.elements.join(', ')}</span>}
                    <a className="pu-note" href={p.url} target="_blank" rel="noreferrer">
                      Decision
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {footer}
      </div>
    )
  }

  const columns = [
    {
      key: 'number',
      label: 'Driver',
      sort: (r: Row) => r.name,
      render: (r: Row) => who(r.number, r.name, r.car),
    },
    ...data.elements.map((el) => ({
      key: el.code,
      label: el.allowance ? `${el.code} /${el.allowance}` : el.code,
      align: 'center' as const,
      sort: (r: Row) => r.used[el.code] ?? -1,
      render: (r: Row) => {
        const n = r.used[el.code]
        if (n == null) return <span className="pu-cell">—</span>
        return (
          <span
            className={`pu-cell pu-${risk(n, el.allowance)}${r.fresh.has(el.code) ? ' pu-fresh' : ''}`}
            title={`${el.name}: ${ordinal(n)}${el.allowance ? ` of ${el.allowance} allowed` : ''}${r.fresh.has(el.code) ? ', new at this event' : ''}`}
          >
            {n}
          </span>
        )
      },
    })),
    { key: 'status', label: 'Status', sort: (r: Row) => -r.worst, minor: true, render: (r: Row) => <span className="pu-note">{r.status || '—'}</span> },
  ]

  return (
    <div className="mw-col">
      <div className="mw-grow">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.number} initialSort={opts.sort === 'risk' ? { key: 'status', dir: 1 } : undefined} empty="No drivers." />
      </div>
      {footer}
    </div>
  )
}

export const powerUnits: WidgetDef = {
  type: 'power-units',
  name: 'Power unit elements',
  description:
    "Each driver's engines, turbos, energy stores and other power unit elements used against the season's allowance, who's one change from a grid penalty, the new elements fitted at each Grand Prix, and the penalties. From the FIA's published documents, 2019 onward.",
  category: 'Championship',
  minYear: 2019,
  defaultSize: { w: 12, h: 14 },
  usesDrivers: true,
  sessionless: true,
  Component: PowerUnits,
  options: [
    {
      key: 'view',
      label: 'Show',
      type: 'select',
      default: 'usage',
      choices: [
        { value: 'usage', label: 'Elements used against the allowance' },
        { value: 'changes', label: 'New elements fitted' },
        { value: 'penalties', label: 'Power unit penalties' },
      ],
    },
    { key: 'season', type: 'season', default: 0, label: 'Season' },
    {
      key: 'asOf',
      label: 'As of',
      type: 'select',
      default: 'header',
      choices: [
        { value: 'header', label: "The header's Grand Prix" },
        { value: 'latest', label: 'The latest Grand Prix' },
      ],
      help: 'Counts after that weekend. Pick an earlier race in the header to see where things stood then.',
    },
    {
      key: 'sort',
      label: 'Order (usage)',
      type: 'select',
      default: 'team',
      choices: [
        { value: 'team', label: 'Team by team, as the FIA lists them' },
        { value: 'risk', label: 'Closest to a penalty first' },
      ],
    },
    { key: 'allEvents', label: 'New elements and penalties: the whole season so far, not just that weekend', type: 'toggle', default: false },
  ],
}
