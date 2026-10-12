// Bakes src/api/records/records.json: every championship Grand Prix and sprint since 1950,
// in the compact shape described in src/api/records/types.ts.
//
//   npm run bake:records
//
// Sources: f1db (https://github.com/f1db/f1db, CC BY 4.0) for results, poles, fastest laps,
// engines, standings and driver details; the Jolpica database dump for lap-by-lap positions
// (laps led, 1996 on) and Jolpica ids, so records link up with the rest of the app.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = new URL('../src/api/records/records.json', import.meta.url)
const F1DB_RELEASE = 'https://api.github.com/repos/f1db/f1db/releases/latest'
const JOLPICA_DUMP = 'https://api.jolpi.ca/data/dumps/download/delayed/?dump_type=csv'

/* ---------- download + unzip ---------- */

const work = mkdtempSync(join(tmpdir(), 'bake-records-'))

async function download(url: string, name: string) {
  const res = await fetch(url, { headers: { 'user-agent': 'f1-stats bake-records' } })
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  const file = join(work, name)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  const dir = join(work, name.replace(/\.zip$/, ''))
  execFileSync('unzip', ['-oq', file, '-d', dir])
  return dir
}

/* ---------- CSV ---------- */

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [head, ...body] = rows
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

const readCsv = (dir: string, name: string) => parseCsv(readFileSync(join(dir, name), 'utf8'))

/* ---------- index tables ---------- */

/** Assigns compact indexes in first-seen order. */
class Index<T> {
  ids = new Map<string, number>()
  rows: T[] = []
  add(id: string, row: () => T) {
    let i = this.ids.get(id)
    if (i === undefined) {
      i = this.rows.push(row()) - 1
      this.ids.set(id, i)
    }
    return i
  }
  get(id: string) {
    return this.ids.get(id)
  }
}

const STATUS: Record<string, number> = { DNF: 1, DNS: 2, DNQ: 3, DNPQ: 4, NC: 5, DSQ: 6, EX: 7, DNP: 8 }
const F_POLE = 1
const F_FASTEST = 2
const F_SLAM = 4
const F_SHARED = 8
const F_LEAD_LAP = 16
const F_DOTD = 32

async function main() {
  const release = (await (await fetch(F1DB_RELEASE, { headers: { 'user-agent': 'f1-stats bake-records' } })).json()) as {
    tag_name: string
    assets: { name: string; browser_download_url: string }[]
  }
  const asset = release.assets.find((a) => a.name === 'f1db-csv.zip')
  if (!asset) throw new Error('f1db release has no f1db-csv.zip')
  console.log(`f1db ${release.tag_name}`)
  const f1 = await download(asset.browser_download_url, 'f1db.zip')
  console.log('Jolpica dump')
  const jo = await download(JOLPICA_DUMP, 'jolpica.zip')
  const f = (name: string) => readCsv(f1, `f1db-${name}.csv`)
  const j = (name: string) => readCsv(jo, `formula_one_${name}.csv`)

  /* reference tables */
  const countries = new Map(f('countries').map((c) => [c.id, c.alpha3Code]))
  const f1Drivers = new Map(f('drivers').map((d) => [d.id, d]))
  const f1Teams = new Map(f('constructors').map((c) => [c.id, c]))
  const f1Engines = new Map(f('engine-manufacturers').map((e) => [e.id, e]))
  const f1Gps = new Map(f('grands-prix').map((g) => [g.id, g]))
  const f1Circuits = new Map(f('circuits').map((c) => [c.id, c]))

  /* Jolpica: ids and lap leaders, keyed by race date and car number */
  const jRound = new Map(j('round').map((r) => [r.id, r]))
  const jCircuitRef = new Map(j('circuit').map((c) => [c.id, c.reference]))
  const jCircuitByDate = new Map([...jRound.values()].map((r) => [r.date, jCircuitRef.get(r.circuit_id) ?? '']))
  const jSession = new Map(j('session').map((s) => [s.id, s]))
  const jDriver = new Map(j('driver').map((d) => [d.id, d]))
  const jTeam = new Map(j('team').map((t) => [t.id, t]))
  const jTeamDriver = new Map(j('teamdriver').map((t) => [t.id, t]))
  const jRoundEntry = new Map(j('roundentry').map((e) => [e.id, e]))
  const jEntry = new Map<string, { date: string; type: string; car: string; driver: string; team: string }>()
  for (const e of j('sessionentry')) {
    const s = jSession.get(e.session_id)
    if (!s || (s.type !== 'R' && s.type !== 'SR')) continue
    const re = jRoundEntry.get(e.round_entry_id)!
    const td = jTeamDriver.get(re.team_driver_id)!
    const date = jRound.get(s.round_id)!.date
    jEntry.set(e.id, { date, type: s.type, car: re.car_number, driver: jDriver.get(td.driver_id)!.reference, team: jTeam.get(td.team_id)!.reference })
  }
  // key: `${date}|${type}|${car}` -> laps led; plus which races have lap data at all
  const led = new Map<string, number>()
  const lapRaces = new Set<string>()
  for (const l of j('lap')) {
    if (!l.number || !l.position) continue
    const e = jEntry.get(l.session_entry_id)
    if (!e) continue
    lapRaces.add(`${e.date}|${e.type}`)
    if (l.position === '1') led.set(`${e.date}|${e.type}|${e.car}`, (led.get(`${e.date}|${e.type}|${e.car}`) ?? 0) + 1)
  }
  // f1db id -> Jolpica id, by majority over shared (date, car number) entries
  const votes = { d: new Map<string, Map<string, number>>(), t: new Map<string, Map<string, number>>() }
  const byCar = new Map<string, { driver: string; team: string }>()
  for (const e of jEntry.values()) if (e.type === 'R') byCar.set(`${e.date}|${e.car}`, e)
  const vote = (m: Map<string, Map<string, number>>, k: string, v: string) => {
    const inner = m.get(k) ?? new Map<string, number>()
    inner.set(v, (inner.get(v) ?? 0) + 1)
    m.set(k, inner)
  }
  const winner = (m: Map<string, number> | undefined) => (m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : null)

  /* races */
  const f1Races = f('races').sort((a, b) => a.date.localeCompare(b.date))
  const raceById = new Map(f1Races.map((r) => [r.id, r]))
  const resultsBy = (rows: Record<string, string>[]) => {
    const m = new Map<string, Record<string, string>[]>()
    for (const r of rows) m.set(r.raceId, [...(m.get(r.raceId) ?? []), r])
    return m
  }
  const raceResults = resultsBy(f('races-race-results'))
  const sprintResults = resultsBy(f('races-sprint-race-results'))
  const dotd = new Set(f('races-driver-of-the-day-results').filter((r) => r.positionNumber === '1').map((r) => `${r.raceId}|${r.driverId}`))
  const standingsBy = resultsBy(f('races-driver-standings'))

  for (const [raceId, rows] of raceResults) {
    const date = raceById.get(raceId)!.date
    for (const r of rows) {
      const jr = byCar.get(`${date}|${r.driverNumber}`)
      if (!jr) continue
      vote(votes.d, r.driverId, jr.driver)
      vote(votes.t, r.constructorId, jr.team)
    }
  }

  const drivers = new Index<(string | number | null)[]>()
  const teams = new Index<(string | null)[]>()
  const engines = new Index<string[]>()
  const gps = new Index<string[]>()
  const circuits = new Index<string[]>()
  const addDriver = (id: string) =>
    drivers.add(id, () => {
      const d = f1Drivers.get(id)!
      return [id, winner(votes.d.get(id)), d.name, d.dateOfBirth || null, d.dateOfDeath || null, countries.get(d.nationalityCountryId) ?? null, d.gender === 'FEMALE' ? 1 : 0]
    })
  const addTeam = (id: string) => teams.add(id, () => [id, winner(votes.t.get(id)), f1Teams.get(id)?.name ?? id])
  const addEngine = (id: string) => engines.add(id, () => [id, f1Engines.get(id)?.name ?? id])

  const entry = (r: Record<string, string>, raceId: string, date: string, type: 'R' | 'SR') => {
    const status = STATUS[r.positionText] ?? 0
    let flags = 0
    if (r.polePosition === 'true') flags |= F_POLE
    if (r.fastestLap === 'true') flags |= F_FASTEST
    if (r.grandSlam === 'true') flags |= F_SLAM
    if (r.sharedCar === 'true') flags |= F_SHARED
    if (status === 0 && /^\d+$/.test(r.positionText) && !r.gapLaps && !r.reasonRetired) flags |= F_LEAD_LAP
    if (dotd.has(`${raceId}|${r.driverId}`)) flags |= F_DOTD
    const hasLaps = lapRaces.has(`${date}|${type}`)
    return [
      addDriver(r.driverId),
      addTeam(r.constructorId),
      addEngine(r.engineManufacturerId),
      Number(r.positionNumber) || 0,
      status,
      Number(r.gridPositionNumber) || 0,
      Number(r.qualificationPositionNumber) || 0,
      Number(r.points) || 0,
      Number(r.laps) || 0,
      flags,
      hasLaps ? (led.get(`${date}|${type}|${r.driverNumber}`) ?? 0) : -1,
    ]
  }

  const races: unknown[] = []
  let through = ''
  for (const race of f1Races) {
    const rows = raceResults.get(race.id)
    if (!rows?.length) continue
    through = race.date
    const gp = f1Gps.get(race.grandPrixId)!
    const ci = f1Circuits.get(race.circuitId)!
    const sorted = (xs: Record<string, string>[]) => [...xs].sort((a, b) => Number(a.positionDisplayOrder) - Number(b.positionDisplayOrder))
    const leaders = (standingsBy.get(race.id) ?? []).filter((s) => s.positionNumber === '1').map((s) => addDriver(s.driverId))
    races.push([
      Number(race.year),
      Number(race.round),
      race.date,
      gps.add(gp.id, () => [gp.id, gp.fullName, countries.get(gp.countryId) ?? '']),
      circuits.add(ci.id, () => [ci.id, ci.fullName, countries.get(ci.countryId) ?? '', jCircuitByDate.get(race.date) ?? '']),
      Number(race.laps) || 0,
      Number(race.courseLength) || 0,
      leaders,
      sorted(rows).map((r) => entry(r, race.id, race.date, 'R')),
      sorted(sprintResults.get(race.id) ?? []).map((r) => entry(r, race.id, race.date, 'SR')),
    ])
  }

  /* seasons */
  const seasons: Record<number, unknown> = {}
  const scheduled = new Map<number, number>()
  for (const r of f1Races) scheduled.set(Number(r.year), (scheduled.get(Number(r.year)) ?? 0) + 1)
  for (const y of scheduled.keys()) seasons[y] = { n: scheduled.get(y), d: [] as unknown[], t: [] as unknown[] }
  for (const s of f('seasons-driver-standings')) {
    if (!f1Drivers.has(s.driverId) || !drivers.ids.has(s.driverId)) continue
    ;(seasons[Number(s.year)] as { d: unknown[] }).d.push([addDriver(s.driverId), Number(s.positionNumber) || 0, Number(s.points) || 0, s.championshipWon === 'true' ? 1 : 0])
  }
  for (const s of f('seasons-constructor-standings')) {
    ;(seasons[Number(s.year)] as { t: unknown[] }).t.push([addTeam(s.constructorId), addEngine(s.engineManufacturerId), Number(s.positionNumber) || 0, Number(s.points) || 0, s.championshipWon === 'true' ? 1 : 0])
  }

  /* extras: test-driver-only entrants and family ties */
  const testOnly = new Set<string>()
  for (const e of f('seasons-entrants-drivers')) if (e.testDriver === 'true' && !drivers.ids.has(e.driverId)) testOnly.add(e.driverId)
  const tests = [...testOnly].map((id) => {
    const d = f1Drivers.get(id)!
    return [d.name, d.dateOfBirth || null, countries.get(d.nationalityCountryId) ?? null]
  })
  const family = f('drivers-family-relationships')
    .filter((r) => drivers.ids.has(r.parentDriverId) && drivers.ids.has(r.driverId) && r.parentDriverId < r.driverId)
    .map((r) => [drivers.get(r.parentDriverId), drivers.get(r.driverId), r.type])

  const out = {
    source: `f1db ${release.tag_name}; Jolpica lap data`,
    through,
    drivers: drivers.rows,
    teams: teams.rows,
    engines: engines.rows,
    gps: gps.rows,
    circuits: circuits.rows,
    seasons,
    races,
    tests,
    family,
  }
  writeFileSync(OUT, JSON.stringify(out))
  const unmatched = drivers.rows.filter((d) => !d[1]).length
  console.log(`${races.length} races through ${through}, ${drivers.rows.length} drivers (${unmatched} without a Jolpica id), ${teams.rows.length} constructors`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => rmSync(work, { recursive: true, force: true }))
