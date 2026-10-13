import { Hono } from 'hono'
import { config } from './config.ts'
import { db } from './db.ts'
import { penaltyElement } from './fia/parse.ts'
import { scrapeQueued } from './fia/scrape.ts'

/** Power unit elements each driver has used, the changes at each event and the penalties, from the FIA's documents. */
export const powerUnits = new Hono()

/** Table order, and full names for tooltips */
const ELEMENTS: Record<string, string> = {
  ICE: 'Internal combustion engine',
  TC: 'Turbocharger',
  'MGU-H': 'Motor generator unit, heat',
  'MGU-K': 'Motor generator unit, kinetic',
  ES: 'Energy store',
  CE: 'Control electronics',
  EXH: 'Exhaust',
  ANC: 'Power unit ancillaries',
}

/**
 * Allowances checked against the documents' red (over the limit) figures. Seasons not listed
 * take theirs from the "New PU elements" reports, which state them.
 */
const ALLOWANCES: Record<number, Record<string, number>> = {
  2025: { ICE: 4, TC: 4, 'MGU-H': 4, 'MGU-K': 4, ES: 2, CE: 2, EXH: 8 },
  2026: { ICE: 4, TC: 4, EXH: 4, 'MGU-K': 3, ES: 3, CE: 3, ANC: 6 },
}

/** The FIA's documents site starts in 2019 (plus a few 2015 files). */
const FIRST_SEASON = 2019

/** Seasons being read because a request found nothing stored; a season is only tried once per process. */
const requested = new Set<number>()
const inFlight = new Set<number>()

powerUnits.get('/', async (c) => {
  const season = Number(c.req.query('season'))
  const now = new Date().getUTCFullYear()
  if (!Number.isInteger(season) || season < FIRST_SEASON || season > now) return c.json({ error: `Expected ?season= from ${FIRST_SEASON} to ${now}` }, 400)

  const [events, docs, usage, changes, penalties] = await Promise.all([
    db.selectFrom('fia_event').selectAll().where('season', '=', season).where('first_doc_at', 'is not', null).orderBy('first_doc_at').execute(),
    db.selectFrom('fia_document').select(['url', 'event_id', 'kind', 'doc_number', 'published_at', 'error']).where('season', '=', season).orderBy('published_at').execute(),
    db.selectFrom('pu_usage').innerJoin('fia_document as d', 'd.url', 'pu_usage.url').selectAll('pu_usage').where('d.season', '=', season).orderBy('position').execute(),
    db.selectFrom('pu_change').innerJoin('fia_document as d', 'd.url', 'pu_change.url').selectAll('pu_change').where('d.season', '=', season).orderBy('seq').execute(),
    db.selectFrom('pu_penalty').innerJoin('fia_document as d', 'd.url', 'pu_penalty.url').selectAll('pu_penalty').where('d.season', '=', season).execute(),
  ])

  // Nothing yet: fetch the season in the background and tell the panel to check back.
  if (!events.length && config.fiaScrape && !requested.has(season)) {
    requested.add(season)
    inFlight.add(season)
    scrapeQueued(season, { waitSeconds: 1800 })
      .catch((err) => console.warn(`[fia] ${season}: ${err instanceof Error ? err.message : err}`))
      .finally(() => inFlight.delete(season))
  }
  const scraping = inFlight.has(season)

  const doc = new Map(docs.map((d) => [d.url, d]))
  const at = (url: string) => doc.get(url)!

  // The latest name and car for each driver number
  const drivers = new Map<number, { number: number; name: string; car: string; seen: number }>()
  for (const r of [...usage, ...changes]) {
    const seen = at(r.url).published_at.getTime()
    const d = drivers.get(r.driver_number)
    if (!d || d.seen <= seen) drivers.set(r.driver_number, { number: r.driver_number, name: r.driver, car: r.car, seen })
  }

  // Only the newest usage table at each event counts (the FIA sometimes reissues one).
  const latestUsage = new Map<number, string>()
  for (const d of docs) if (d.kind === 'usage' && !d.error) latestUsage.set(d.event_id, d.url)
  const usageRows = usage.filter((r) => latestUsage.get(at(r.url).event_id) === r.url)

  const allowance: Record<string, number> = { ...ALLOWANCES[season] }
  for (const ch of changes) if (ch.allowance && !(ch.element in (ALLOWANCES[season] ?? {}))) allowance[ch.element] = Math.max(allowance[ch.element] ?? 0, ch.allowance)
  const present = new Set([...usageRows, ...changes].map((r) => r.element))
  const codes = [...Object.keys(ELEMENTS), ...[...present].filter((e) => !(e in ELEMENTS)).sort()].filter((e) => present.has(e))

  c.header('cache-control', 'public, max-age=300')
  return c.json({
    season,
    scraping,
    updatedAt: events.reduce<Date | null>((m, e) => (e.checked_at.getTime() && (!m || e.checked_at > m) ? e.checked_at : m), null),
    unreadDocuments: docs.filter((d) => d.error).length,
    elements: codes.map((code) => ({ code, name: ELEMENTS[code] ?? code, allowance: allowance[code] ?? null })),
    events: events.map((e) => ({ id: e.id, name: e.name, start: e.first_doc_at, end: e.last_doc_at })),
    drivers: [...drivers.values()].map((d) => ({ number: d.number, name: d.name, car: d.car })).sort((a, b) => a.number - b.number),
    tables: [...latestUsage].map(([event, url]) => {
      const used = new Map<number, Record<string, number>>()
      for (const r of usageRows) if (r.url === url) used.set(r.driver_number, { ...used.get(r.driver_number), [r.element]: r.used })
      return { event, at: at(url).published_at, rows: [...used].map(([number, used]) => ({ number, used })) }
    }),
    changes: [
      ...changes.map((r) => ({
        event: at(r.url).event_id,
        at: at(r.url).published_at,
        number: r.driver_number,
        element: r.element,
        nth: r.previous + 1,
        allowance: allowance[r.element] ?? r.allowance,
        source: 'technical' as const,
        url: r.url,
      })),
      // Elements changed in parc fermé appear only in the stewards' decision.
      ...penalties.flatMap((p) =>
        (JSON.parse(p.elements) as string[]).flatMap((s) => {
          const e = penaltyElement(s)
          if (!e) return []
          const d = at(p.url)
          return [{ event: d.event_id, at: d.published_at, number: p.driver_number, ...e, allowance: allowance[e.element] ?? null, source: 'stewards' as const, url: p.url }]
        }),
      ),
    ].sort((a, b) => a.at.getTime() - b.at.getTime()),
    penalties: penalties
      .map((p) => ({
        event: at(p.url).event_id,
        at: at(p.url).published_at,
        number: p.driver_number,
        driver: p.driver,
        elements: JSON.parse(p.elements) as string[],
        decision: p.decision,
        gridPlaces: p.grid_places,
        backOfGrid: !!p.back_of_grid,
        pitLane: !!p.pit_lane,
        url: p.url,
      }))
      .sort((a, b) => a.at.getTime() - b.at.getTime()),
  })
})
