// Reads the FIA's published Formula 1 documents for power unit element usage and penalties.
// The site has no API: a season page lists its events, each event's documents come from a
// Drupal AJAX endpoint, and the documents themselves are PDFs. Requests go one at a time.

import { sql, type Kysely, type Transaction } from 'kysely'
import { db, type Database } from '../db.ts'
import { fixNumbers, nameKey, parseChanges, parsePenalty, parseUsage, penaltyElement } from './parse.ts'
import { pdfLines } from './pdf.ts'

const SITE = 'https://www.fia.com'
const DOCUMENTS = `${SITE}/documents/championships/fia-formula-one-world-championship-14`
const USER_AGENT = 'Mozilla/5.0 (compatible; AboutF1/1.0; +https://aboutf1.com)'
/** Pause between requests to fia.com */
const GAP_MS = 1000
/** Raise when the parsers change: documents read by an older version are read again. */
export const PARSER_VERSION = 5
/** An event whose last document is this much older than our last look at it is finished; its list isn't re-read. */
const SETTLED_MS = 10 * 24 * 3600_000

type Kind = 'usage' | 'changes' | 'penalty'

interface EventRef {
  id: number
  name: string
  /** The season page includes the latest event's documents, saving a request */
  html?: string
}

interface DocRef {
  url: string
  number: number | null
  title: string
  publishedAt: Date
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let lastRequest = 0

/** One request at a time, a second apart; network errors and 5xx are tried up to three times. */
async function get(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const wait = lastRequest + GAP_MS * attempt - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequest = Date.now()
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) })
      if (res.ok) return res
      if (res.status < 500 || attempt === 3) throw new Error(`fia.com returned ${res.status} for ${url}`, { cause: 'http' })
    } catch (err) {
      if ((err instanceof Error && err.cause === 'http') || attempt === 3) throw err
    }
  }
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Season → season page URL, from the season picker on the championship's documents page. */
async function seasonPages(): Promise<Map<number, string>> {
  const html = await (await get(DOCUMENTS)).text()
  const pages = new Map<number, string>()
  for (const m of html.matchAll(/<option value="([^"]*\/season\/season-(\d{4})-\d+)"/g)) pages.set(Number(m[2]), SITE + m[1])
  return pages
}

/** Events on a season page. The open (latest) one has its documents inline; the rest load on demand. */
function eventsOf(html: string): EventRef[] {
  const events: EventRef[] = []
  const open = html.match(/<div class="event-title active">([^<]+)<\/div>\s*<ul class="document-type-wrapper open data-id-(\d+)">/)
  if (open) {
    const start = open.index! + open[0].length
    const end = html.indexOf('<ul class="event-wrapper">', start)
    events.push({ id: Number(open[2]), name: decode(open[1]), html: html.slice(start, end < 0 ? undefined : end) })
  }
  for (const m of html.matchAll(/class="event-title data-id-(\d+)\s+use-ajax">([^<]+)</g)) events.push({ id: Number(m[1]), name: decode(m[2]) })
  return events
}

/** "11.10.26 17:55", published in CET */
function published(s: string): Date {
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/)
  if (!m) return new Date(NaN)
  return new Date(Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]) - 1, Number(m[5])))
}

function docsOf(html: string): DocRef[] {
  const docs: DocRef[] = []
  const row = /<a href="([^"]+\.pdf)"[^>]*>[\s\S]*?<div class="title">([\s\S]*?)<\/div>[\s\S]*?Published on <span[^>]*>([^<]+)<\/span>/g
  for (const m of html.matchAll(row)) {
    const title = decode(m[2])
    const n = title.match(/^Doc\s+(\d+)\s*-\s*/)
    docs.push({
      url: new URL(m[1], SITE).href,
      number: n ? Number(n[1]) : null,
      title: n ? title.slice(n[0].length) : title,
      publishedAt: published(m[3]),
    })
  }
  return docs
}

async function eventDocs(e: EventRef): Promise<DocRef[]> {
  if (e.html) return docsOf(e.html)
  const commands = (await (await get(`${SITE}/decision-document-list/ajax/${e.id}`)).json()) as { command: string; data?: string }[]
  return docsOf(commands.map((c) => (c.command === 'insert' ? (c.data ?? '') : '')).join(''))
}

/** Which power unit document this is, by its title; null for everything else. */
export function kindOf(title: string): Kind | null {
  const t = title.toLowerCase()
  if (/(pu|power unit) elements? used per driver/.test(t)) return 'usage'
  if (/new (pu|power unit) elements?/.test(t)) return 'changes'
  // Stewards' decisions ("Infringement - Car 63 - Changes to PU elements"), not summonses or race director notes
  if (/(pu|power unit) elements?/.test(t) && !/summons|hearing|technical delegate|race director|communication|sealing/.test(t)) return 'penalty'
  // Elements changed in parc fermé come under "Infringement - Car 6 - Changes made during Parc Ferme",
  // which can equally be a setup change; readDocument keeps only those listing PU elements.
  if (/^(infringement|decision|corrected)\b/.test(t) && /parc ferm/.test(t)) return 'penalty'
  return null
}

type Insert = (tx: Transaction<Database> | Kysely<Database>) => Promise<unknown>

/** Each driver's usual number this season, by name, from what's been read so far. */
async function numbersByName(season: number): Promise<Map<string, number>> {
  const rows = await db
    .selectFrom('pu_change as c')
    .innerJoin('fia_document as d', 'd.url', 'c.url')
    .select(['c.driver', 'c.driver_number'])
    .where('d.season', '=', season)
    .execute()
  const tally = new Map<string, Map<number, number>>()
  for (const r of rows) {
    const m = tally.get(nameKey(r.driver)) ?? new Map<number, number>()
    m.set(r.driver_number, (m.get(r.driver_number) ?? 0) + 1)
    tally.set(nameKey(r.driver), m)
  }
  return new Map([...tally].map(([name, m]) => [name, [...m].sort((a, b) => b[1] - a[1])[0][0]]))
}

/** Parse and store one downloaded document, replacing whatever was read from it before. Returns the parse error, if any. */
async function readDocument(doc: DocRef, pdf: Uint8Array, kind: Kind, eventId: number, season: number): Promise<string | null> {
  let error: string | null = null
  let rows: Insert = async () => {}
  try {
    const lines = await pdfLines(pdf)
    if (kind === 'usage') {
      const parsed = parseUsage(lines)
      if (!parsed.length) throw new Error('No table rows found')
      const { rows: usage, dropped } = fixNumbers(parsed, await numbersByName(season))
      for (const r of dropped) console.warn(`[fia] ${doc.url}: dropped ${r.driver}, listed under car ${r.number} twice`)
      const values = usage.flatMap((r, position) =>
        Object.entries(r.used).map(([element, used]) => ({ url: doc.url, position, driver_number: r.number, driver: r.driver, car: r.car, element, used })),
      )
      rows = (tx) => tx.insertInto('pu_usage').values(values).execute()
    } else if (kind === 'changes') {
      const changes = parseChanges(lines)
      // The season opener's report just says everyone starts on new elements.
      if (!changes.length && !lines.some((l) => /^All drivers will start/i.test(l.text))) throw new Error('No new elements found')
      const values = changes.map((c, seq) => ({
        url: doc.url, seq, driver_number: c.number, driver: c.driver, car: c.car, element: c.element, previous: c.previous, allowance: c.allowance,
      }))
      if (values.length) rows = (tx) => tx.insertInto('pu_change').values(values).execute()
    } else {
      const p = parsePenalty(lines)
      const aboutPU = /(pu|power unit) element/i.test(doc.title)
      if (!p && aboutPU) throw new Error('No driver or decision found')
      // A parc fermé decision about anything but the power unit is recorded without rows, so it isn't read again.
      if (p && (aboutPU || p.elements.some((e) => penaltyElement(e)))) {
        const value = {
          url: doc.url, driver_number: p.number, driver: p.driver, elements: JSON.stringify(p.elements), decision: p.decision,
          grid_places: p.gridPlaces, back_of_grid: Number(p.backOfGrid), pit_lane: Number(p.pitLane),
        }
        rows = (tx) => tx.insertInto('pu_penalty').values(value).execute()
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    console.warn(`[fia] ${doc.title} (${doc.url}): ${error}`)
  }
  await db.transaction().execute(async (tx) => {
    // Deleting the document drops its rows (ON DELETE CASCADE).
    await tx.deleteFrom('fia_document').where('url', '=', doc.url).execute()
    await tx
      .insertInto('fia_document')
      .values({
        url: doc.url, event_id: eventId, season, kind, doc_number: doc.number, title: doc.title.slice(0, 255),
        published_at: doc.publishedAt, parser_version: PARSER_VERSION, error,
      })
      .execute()
    // A document that couldn't be read is still recorded, so it isn't fetched again until the parsers change.
    if (!error) await rows(tx)
  })
  return error
}

export interface ScrapeResult {
  season: number
  events: number
  /** Documents read, whether or not they could be parsed */
  documents: number
  /** Read but unparseable (recorded, not retried until the parsers change) */
  errors: number
  /** Not downloaded (not recorded, retried next run) */
  failed: number
}

/** Bring one season's power unit data up to date. Finished events are skipped once read. */
export async function scrapeSeason(season: number, log: (s: string) => void = () => {}): Promise<ScrapeResult> {
  const page = (await seasonPages()).get(season)
  if (!page) throw new Error(`The FIA has no documents page for ${season}`)
  const events = eventsOf(await (await get(page)).text())
  const known = new Map((await db.selectFrom('fia_event').selectAll().where('season', '=', season).execute()).map((e) => [e.id, e]))
  const stored = await db.selectFrom('fia_document').select(['url', 'title', 'parser_version']).where('season', '=', season).execute()
  // Forget documents an older version took for power unit ones.
  const unwanted = stored.filter((d) => !kindOf(d.title)).map((d) => d.url)
  if (unwanted.length) await db.deleteFrom('fia_document').where('url', 'in', unwanted).execute()
  const read = new Map(stored.filter((d) => kindOf(d.title)).map((d) => [d.url, d.parser_version]))
  const stale = [...read.values()].some((v) => v < PARSER_VERSION)
  const result: ScrapeResult = { season, events: 0, documents: 0, errors: 0, failed: 0 }

  for (const e of events) {
    const k = known.get(e.id)
    const settled = k?.last_doc_at && k.checked_at.getTime() - k.last_doc_at.getTime() > SETTLED_MS
    if (settled && !e.html && !stale) continue
    const docs = await eventDocs(e)
    result.events++
    const times = docs.map((d) => d.publishedAt.getTime()).filter((t) => !Number.isNaN(t))
    const row = {
      season,
      name: e.name,
      first_doc_at: times.length ? new Date(Math.min(...times)) : null,
      last_doc_at: times.length ? new Date(Math.max(...times)) : null,
    }
    // A new event counts as never checked until its documents are all in (below).
    await db.insertInto('fia_event').values({ id: e.id, ...row, checked_at: new Date(0) }).onDuplicateKeyUpdate(row).execute()

    const failedBefore = result.failed
    for (const d of docs) {
      const kind = kindOf(d.title)
      if (!kind || (read.get(d.url) ?? 0) >= PARSER_VERSION) continue
      log(`${e.name}: ${d.title}`)
      const why = (err: unknown) => (err instanceof Error ? err.message : String(err))
      let pdf: Uint8Array
      try {
        pdf = new Uint8Array(await (await get(d.url)).arrayBuffer())
      } catch (err) {
        result.failed++
        console.warn(`[fia] Couldn't download ${d.url}, will try again next time: ${why(err)}`)
        continue
      }
      try {
        const error = await readDocument(d, pdf, kind, e.id, season)
        result.documents++
        if (error) result.errors++
      } catch (err) {
        result.failed++
        console.warn(`[fia] Couldn't store ${d.url}, will try again next time: ${why(err)}`)
      }
    }
    // Only an event read in full can settle; otherwise its list is read again next time.
    if (result.failed === failedBefore) await db.updateTable('fia_event').set({ checked_at: new Date() }).where('id', '=', e.id).execute()
  }
  return result
}

let running: Promise<unknown> = Promise.resolve()

/**
 * Scrape a season once no other scrape is running: queued within this process, and across processes
 * sharing the database (the server's schedule, `npm run scrape:pu`) by a MariaDB named lock.
 * Resolves to null if another process still holds the lock after `waitSeconds`.
 */
export function scrapeQueued(season: number, { waitSeconds = 0, log }: { waitSeconds?: number; log?: (s: string) => void } = {}): Promise<ScrapeResult | null> {
  const next = running.then(() =>
    db.connection().execute(async (conn) => {
      const { rows } = await sql<{ got: number | null }>`SELECT GET_LOCK('f1stats.fia_scrape', ${waitSeconds}) AS got`.execute(conn)
      if (rows[0]?.got !== 1) return null
      try {
        return await scrapeSeason(season, log)
      } finally {
        await sql`SELECT RELEASE_LOCK('f1stats.fia_scrape')`.execute(conn)
      }
    }),
  )
  running = next.catch(() => {})
  return next
}
