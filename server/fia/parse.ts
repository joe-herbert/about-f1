// Parsers for the FIA's power unit documents. Each works from positioned text (see pdf.ts),
// so a table's columns are found by their headings rather than assumed.

import type { Line, Word } from './pdf.ts'

/**
 * Element codes as stored. The FIA's names vary by season (EX/EXH, CE/PU-CE), so they're
 * folded to one code each; anything unrecognised keeps its own name.
 */
export function elementCode(raw: string): string {
  const s = raw.toUpperCase().replace(/\s+/g, '').replace(/–/g, '-')
  if (s === 'EX' || s === 'EXH') return 'EXH'
  if (s === 'CE' || s === 'PU-CE' || s === 'PUCE') return 'CE'
  if (s === 'PU-ANC' || s === 'PUANC' || s === 'ANC') return 'ANC'
  if (s === 'MGUK') return 'MGU-K'
  if (s === 'MGUH') return 'MGU-H'
  return s
}

/** Every element code the FIA has used since 2014. A table heading outside these means the layout wasn't understood. */
export const KNOWN_ELEMENTS = ['ICE', 'TC', 'MGU-H', 'MGU-K', 'ES', 'CE', 'EXH', 'ANC']

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}

const isInt = (s: string) => /^\d{1,2}$/.test(s)

// ---------------------------------------------------------------------------
// "PU Elements used per Driver up to now": the season's totals before this event.

export interface UsageRow {
  number: number
  driver: string
  car: string
  /** Element code → elements used this season */
  used: Record<string, number>
}

interface Column {
  code: string
  cx: number
}

/** The table heading: the line with "Driver" and "ICE", plus split headings above and below it ("MGU" / "-K"). */
function tableHeading(lines: Line[], i: number): { columns: Column[]; driverX: number; carX: number } | null {
  const line = lines[i]
  const driver = line.words.find((w) => w.str === 'Driver')
  const car = line.words.find((w) => w.str === 'Car')
  if (!driver || !line.words.some((w) => w.str === 'ICE')) return null
  // Split headings sit up to ~12pt above or below; data rows (which start with a car number) can be closer still.
  const band = lines.filter((l) => l.page === line.page && Math.abs(l.y - line.y) <= 15 && (l === line || !isInt(l.words[0].str)))
  const parts = band.flatMap((l) => l.words.filter((w) => w.x > driver.x + 20).map((w) => ({ ...w, y: l.y })))
  // A heading split over lines is stacked: words a few points apart horizontally on different
  // lines are one heading, read top to bottom. Words on the same line are always separate
  // headings, however close ("PU-  PU-" over "CE  ANC").
  const groups: Word[][] = []
  for (const w of parts.sort((a, b) => a.cx - b.cx)) {
    const g = groups
      .filter((g) => !g.some((o) => o.y === w.y) && Math.abs(g[0].cx - w.cx) <= 14)
      .sort((a, b) => Math.abs(a[0].cx - w.cx) - Math.abs(b[0].cx - w.cx))[0]
    if (g) g.push(w)
    else groups.push([w])
  }
  const columns = groups.map((g) => {
    const words = g.sort((a, b) => b.y - a.y)
    return { code: elementCode(words.map((w) => w.str).join('')), cx: words.reduce((s, w) => s + w.cx, 0) / words.length }
  })
  return { columns, driverX: driver.x, carX: car?.x ?? 0 }
}

/** Split a run like "4 3 3" that pdf.js returned as one word into one word per value. */
function splitWord(w: Word): Word[] {
  const parts = w.str.split(/\s+/)
  if (parts.length === 1) return [w]
  const width = (w.cx - w.x) * 2
  return parts.map((str, i) => {
    const x = w.x + (width * i) / parts.length
    return { str, x, cx: x + width / parts.length / 2, y: w.y }
  })
}

export function parseUsage(lines: Line[]): UsageRow[] {
  const rows: UsageRow[] = []
  let heading: ReturnType<typeof tableHeading> = null
  for (let i = 0; i < lines.length; i++) {
    const h = tableHeading(lines, i)
    if (h) {
      const unknown = h.columns.filter((c) => !KNOWN_ELEMENTS.includes(c.code))
      if (unknown.length) throw new Error(`Unrecognised column ${unknown.map((c) => `"${c.code}"`).join(', ')}`)
      heading = h
      continue
    }
    if (!heading) continue
    const words = lines[i].words.flatMap(splitWord)
    if (!words.length || !isInt(words[0].str) || words[0].x > heading.carX) continue
    const firstValueX = Math.min(...heading.columns.map((c) => c.cx)) - 12
    const nameWords = words.slice(1).filter((w) => w.x < firstValueX)
    const values = words.slice(1).filter((w) => w.x >= firstValueX && isInt(w.str))
    if (values.length !== heading.columns.length) throw new Error(`Car ${words[0].str} has ${values.length} values for ${heading.columns.length} columns`)
    const used: Record<string, number> = {}
    for (const v of values) {
      const col = heading.columns.reduce((best, c) => (Math.abs(c.cx - v.cx) < Math.abs(best.cx - v.cx) ? c : best))
      if (col.code in used) throw new Error(`Car ${words[0].str} has two values under ${col.code}`)
      used[col.code] = Number(v.str)
    }
    rows.push({
      number: Number(words[0].str),
      car: nameWords.filter((w) => w.x < heading!.driverX - 2).map((w) => w.str).join(' '),
      driver: nameWords.filter((w) => w.x >= heading!.driverX - 2).map((w) => w.str).join(' '),
      used,
    })
  }
  return rows
}

/** For matching a driver across documents: "Nico Hülkenberg" and "Nico Hulkenberg" are the same person. */
export const nameKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()

/**
 * The FIA's tables occasionally give a driver the wrong car number (2025 China listed Hadjar as 30,
 * Lawson's number). Where a number appears twice, a row whose driver is known by another number
 * that season takes that number; anything still duplicated is dropped.
 */
export function fixNumbers(rows: UsageRow[], numberOf: Map<string, number>): { rows: UsageRow[]; dropped: UsageRow[] } {
  const count = new Map<number, number>()
  for (const r of rows) count.set(r.number, (count.get(r.number) ?? 0) + 1)
  const fixed = rows.map((r) => {
    const known = numberOf.get(nameKey(r.driver))
    return count.get(r.number)! > 1 && known != null && known !== r.number ? { ...r, number: known } : r
  })
  const seen = new Set<number>()
  const out: UsageRow[] = []
  const dropped: UsageRow[] = []
  for (const r of fixed) {
    if (seen.has(r.number)) dropped.push(r)
    else {
      seen.add(r.number)
      out.push(r)
    }
  }
  return { rows: out, dropped }
}

// ---------------------------------------------------------------------------
// "New PU elements for this Competition": who fitted what, and how many they'd used before.

export interface ChangeRow {
  number: number
  driver: string
  car: string
  element: string
  /** Elements of this kind used before this one; this one is previous + 1 */
  previous: number
  /** The season's allowance, as the document states it */
  allowance: number | null
}

/** Full text with each line's start offset, so table rows can be placed among the sentences around them. */
function joined(lines: Line[]) {
  let text = ''
  const at: number[] = []
  for (const l of lines) {
    at.push(text.length)
    text += l.text + '\n'
  }
  return { text, at }
}

export function parseChanges(lines: Line[]): ChangeRow[] {
  const { text, at } = joined(lines)
  // "…will start the … Competition with a new internal combustion engine (ICE):"
  // "…is using a new exhaust system (EX) for the remainder of the Competition:"
  const sections = [...text.matchAll(/following drivers?\s[\s\S]*?\ba\s+new\s+[a-z\s-]+?\(([A-Za-z-]+)\)/g)].map((m) => ({
    start: m.index,
    element: elementCode(m[1]),
    allowance: null as number | null,
  }))
  // "…is the fifth (5th) of the four (4) new internal combustion engines allowed…"
  // "…is one (1) of the eight (8) new exhaust systems allowed…"
  for (const m of text.matchAll(/of\s+the\s+([a-z]+)\s*\((\d+)\)\s+new/gi)) {
    const s = sections.findLast((s) => s.start < m.index)
    if (s && s.allowance == null) s.allowance = Number(m[2]) || NUMBER_WORDS[m[1].toLowerCase()] || null
  }

  const out: ChangeRow[] = []
  let driverX = 0
  let carX = 0
  for (let i = 0; i < lines.length; i++) {
    const words = lines[i].words.flatMap(splitWord)
    const driver = words.find((w) => w.str === 'Driver')
    if (driver && words.some((w) => /^(Number|N°)$/.test(w.str))) {
      driverX = driver.x
      carX = words.find((w) => w.str === 'Car')?.x ?? 0
      continue
    }
    if (!driverX || words.length < 3 || !isInt(words[0].str) || !isInt(words.at(-1)!.str) || words[0].x > carX) continue
    const section = sections.findLast((s) => s.start < at[i])
    if (!section) continue
    const names = words.slice(1, -1)
    out.push({
      number: Number(words[0].str),
      car: names.filter((w) => w.x < driverX - 2).map((w) => w.str).join(' '),
      driver: names.filter((w) => w.x >= driverX - 2).map((w) => w.str).join(' '),
      element: section.element,
      previous: Number(words.at(-1)!.str),
      allowance: section.allowance,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Stewards' decisions on power unit elements: the grid penalty.

export interface Penalty {
  number: number
  driver: string
  /** As stated, e.g. ["5th Engine (ICE)", "4th MGU-K"] */
  elements: string[]
  decision: string
  /** Grid places dropped, when the decision gives a number */
  gridPlaces: number | null
  backOfGrid: boolean
  pitLane: boolean
}

export function parsePenalty(lines: Line[]): Penalty | null {
  const texts = lines.map((l) => l.text)
  const who = texts.map((t) => t.match(/^No\s*\/\s*Driver\s+(\d{1,2})\s*[-–]\s*(.+)$/)).find(Boolean)
  const d = texts.findIndex((t) => /^Decision\b/.test(t))
  if (!who || d < 0) return null

  // A labelled section runs until the next label at the left margin.
  const label = /^(No \/ Driver|Competitor|Time|Session|Fact|Infringement|Decision|Reason)\b/
  const section = (start: number, name: string) => {
    const parts = [texts[start].replace(name, '').trim()]
    for (let i = start + 1; i < texts.length && !label.test(texts[i]) && !texts[i].startsWith('Competitors are reminded'); i++) parts.push(texts[i])
    return parts.filter(Boolean)
  }
  const decision = section(d, 'Decision').join(' ').replace(/\s+/g, ' ').trim()
  const f = texts.findIndex((t) => /^Fact\b/.test(t))
  const elements = f < 0 ? [] : section(f, 'Fact').filter((t) => /^\d+(st|nd|rd|th)\b/.test(t))
  const places = decision.match(/(\d+)\s+grid\s+(?:positions?|places?)/i)
  return {
    number: Number(who[1]),
    driver: who[2].trim(),
    elements,
    decision,
    gridPlaces: places ? Number(places[1]) : null,
    backOfGrid: /back of the (?:starting )?grid/i.test(decision),
    pitLane: /pit\s?lane/i.test(decision),
  }
}

const ELEMENT_NAMES: [RegExp, string][] = [
  [/engine|combustion/i, 'ICE'],
  [/turbo/i, 'TC'],
  [/exhaust/i, 'EXH'],
  [/energy store/i, 'ES'],
  [/control electronics/i, 'CE'],
  [/ancillary/i, 'ANC'],
]

/**
 * An element as the stewards state it ("5th Engine (ICE)", "4th MGU-K", "4th Energy Store").
 * Parc fermé changes are only reported this way, not in "New PU elements".
 */
export function penaltyElement(s: string): { element: string; nth: number } | null {
  const m = s.match(/^(\d+)(?:st|nd|rd|th)\s+(.+)$/)
  if (!m) return null
  const code = m[2].match(/\(([A-Za-z-]+)\)/)?.[1]
  const element = code ? elementCode(code) : (ELEMENT_NAMES.find(([re]) => re.test(m[2]))?.[1] ?? elementCode(m[2].trim()))
  return KNOWN_ELEMENTS.includes(element) ? { element, nth: Number(m[1]) } : null
}
