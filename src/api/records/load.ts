import { useQuery } from '@tanstack/react-query'
import { HOUR, jolpica } from '../jolpica/client'
import type { JResult } from '../jolpica/types'
import { jName } from '../jolpica/util'
import type { RDriver, REntry, RRace, RSeason, RTeam, RawEntry, RawRecords, Records } from './types'
import { Flag, Status } from './types'

const loadRaw = () => import('./records.json').then((m) => m.default as unknown as RawRecords)

export function decode(raw: RawRecords): Records {
  const drivers: RDriver[] = raw.drivers.map(([id, jid, name, dob, dod, nat, female], i) => ({ i, id, jid, name, dob, dod, nat, female: !!female }))
  const teams: RTeam[] = raw.teams.map(([id, jid, name], i) => ({ i, id, jid, name }))
  const engines = raw.engines.map(([id, name], i) => ({ i, id, name }))
  const gps = raw.gps.map(([id, name, country], i) => ({ i, id, name, country }))
  const circuits = raw.circuits.map(([id, name, country, jid], i) => ({ i, id, name, country, jid }))
  const races: RRace[] = raw.races.map(([season, round, date, gp, circuit, laps, km, leaders, results, sprint], i) => {
    const race: RRace = { i, season, round, date, gp: gps[gp], circuit: circuits[circuit], laps, km, leaders, results: [], sprint: [], live: false }
    const entry = (e: RawEntry, isSprint: boolean): REntry => ({
      race,
      sprint: isSprint,
      d: e[0],
      t: e[1],
      e: e[2],
      pos: e[3],
      status: e[4],
      grid: e[5],
      quali: e[6],
      pts: e[7],
      laps: e[8],
      flags: e[9],
      led: e[10] < 0 ? null : e[10],
    })
    race.results = results.map((e) => entry(e, false))
    race.sprint = sprint.map((e) => entry(e, true))
    return race
  })
  const seasons = new Map<number, RSeason>()
  for (const [y, s] of Object.entries(raw.seasons)) {
    const year = Number(y)
    seasons.set(year, {
      year,
      rounds: s.n,
      drivers: s.d.map(([d, pos, pts, c]) => ({ d, pos, pts, champion: !!c })),
      teams: s.t.map(([t, e, pos, pts, c]) => ({ t, e, pos, pts, champion: !!c })),
      over: false,
    })
  }
  return {
    source: raw.source,
    through: raw.through,
    drivers,
    teams,
    engines,
    gps,
    circuits,
    races,
    seasons,
    tests: raw.tests.map(([name, dob, nat]) => ({ name, dob, nat })),
    family: raw.family.map(([a, b, type]) => ({ a, b, type })),
  }
}

/** Marks finished seasons and, for any finished since the bake, crowns the leader. */
export function finalize(r: Records) {
  const run = new Map<number, number>()
  for (const race of r.races) run.set(race.season, (run.get(race.season) ?? 0) + 1)
  for (const s of r.seasons.values()) {
    s.over = (run.get(s.year) ?? 0) >= s.rounds
    if (s.over && s.drivers.length && !s.drivers.some((d) => d.champion)) for (const d of s.drivers) d.champion = d.pos === 1
  }
  return r
}

/* ---------- races since the bake, from the Jolpica API ---------- */

const STATUS_TEXT: Record<string, number> = { R: Status.DNF, D: Status.DSQ, E: Status.EX, W: Status.DNS, F: Status.DNQ, N: Status.NC }

/**
 * Appends rounds run after `records.through` (usually zero to a few), four requests each.
 * Lap-by-lap leaders aren't fetched, so those rounds have no laps-led data.
 */
async function topUp(r: Records) {
  const today = new Date().toISOString().slice(0, 10)
  const firstYear = Number(r.through.slice(0, 4))
  const byJid = new Map(r.drivers.filter((d) => d.jid).map((d) => [d.jid!, d.i]))
  const teamByJid = new Map(r.teams.filter((t) => t.jid).map((t) => [t.jid!, t.i]))
  const lastEngine = new Map<number, number>()
  for (const race of r.races) for (const e of race.results) lastEngine.set(e.t, e.e)
  const gpByName = new Map(r.gps.map((g) => [g.name, g]))
  const circuitById = new Map(r.circuits.map((c) => [c.jid || c.id, c]))

  const driver = (res: JResult) => {
    let i = byJid.get(res.Driver.driverId)
    if (i === undefined) {
      i = r.drivers.length
      r.drivers.push({ i, id: res.Driver.driverId, jid: res.Driver.driverId, name: jName(res.Driver), dob: res.Driver.dateOfBirth ?? null, dod: null, nat: null, female: false })
      byJid.set(res.Driver.driverId, i)
    }
    return i
  }
  const team = (res: JResult) => {
    let i = teamByJid.get(res.Constructor.constructorId)
    if (i === undefined) {
      i = r.teams.length
      r.teams.push({ i, id: res.Constructor.constructorId, jid: res.Constructor.constructorId, name: res.Constructor.name })
      teamByJid.set(res.Constructor.constructorId, i)
    }
    return i
  }
  const engine = (t: number, name: string) => {
    let e = lastEngine.get(t)
    if (e === undefined) {
      e = r.engines.length
      r.engines.push({ i: e, id: name, name })
      lastEngine.set(t, e)
    }
    return e
  }

  for (let year = firstYear; year <= Number(today.slice(0, 4)); year++) {
    const schedule = (await jolpica(`${year}/races`, HOUR)).races
    if (!r.seasons.has(year)) r.seasons.set(year, { year, rounds: schedule.length, drivers: [], teams: [], over: false })
    for (const sr of schedule) {
      if (sr.date <= r.through || sr.date >= today) continue
      const results = (await jolpica(`${year}/${sr.round}/results`, HOUR)).races[0]
      if (!results?.Results?.length) break
      const [sprint, quali, standings] = await Promise.all([
        sr.Sprint ? jolpica(`${year}/${sr.round}/sprint`, HOUR) : null,
        jolpica(`${year}/${sr.round}/qualifying`, HOUR),
        jolpica(`${year}/${sr.round}/driverstandings`, HOUR),
      ])
      const poleId = quali.races[0]?.QualifyingResults?.find((q) => q.position === '1')?.Driver.driverId
      const qualiPos = new Map((quali.races[0]?.QualifyingResults ?? []).map((q) => [q.Driver.driverId, Number(q.position)]))
      // Names can carry a suffix ("Bahrain Grand Prix in Malaysia").
      const gp = gpByName.get(sr.raceName) ?? r.gps.find((g) => sr.raceName.startsWith(g.name)) ?? { i: r.gps.length, id: sr.raceName, name: sr.raceName, country: '' }
      if (gp.i === r.gps.length) r.gps.push(gp)
      gpByName.set(sr.raceName, gp)
      const circuit = circuitById.get(sr.Circuit.circuitId) ?? { i: r.circuits.length, id: sr.Circuit.circuitId, name: sr.Circuit.circuitName, country: '', jid: sr.Circuit.circuitId }
      if (circuit.i === r.circuits.length) r.circuits.push(circuit)
      circuitById.set(sr.Circuit.circuitId, circuit)
      const winnerLaps = Number(results.Results[0].laps) || 0
      const race: RRace = {
        i: r.races.length,
        season: year,
        round: Number(sr.round),
        date: sr.date,
        gp,
        circuit,
        laps: winnerLaps,
        km: r.races.findLast((x) => x.circuit === circuit)?.km ?? 0,
        leaders: [],
        results: [],
        sprint: [],
        live: true,
      }
      const entry = (res: JResult, isSprint: boolean): REntry => {
        const t = team(res)
        const status = /^\d+$/.test(res.positionText) ? Status.Classified : (STATUS_TEXT[res.positionText] ?? Status.DNF)
        let flags = 0
        if (!isSprint && (poleId ? res.Driver.driverId === poleId : res.grid === '1')) flags |= Flag.Pole
        if (res.FastestLap?.rank === '1') flags |= Flag.Fastest
        if (status === Status.Classified && res.status === 'Finished') flags |= Flag.LeadLap
        return {
          race,
          sprint: isSprint,
          d: driver(res),
          t,
          e: engine(t, res.Constructor.name),
          pos: Number(res.position) || 0,
          status,
          grid: Number(res.grid) || 0,
          quali: isSprint ? 0 : (qualiPos.get(res.Driver.driverId) ?? 0),
          pts: Number(res.points) || 0,
          laps: Number(res.laps) || 0,
          flags,
          led: null,
        }
      }
      race.results = results.Results.map((x) => entry(x, false))
      race.sprint = (sprint?.races[0]?.SprintResults ?? []).map((x) => entry(x, true))
      const table = standings.standings[0]?.DriverStandings ?? []
      race.leaders = table.filter((s) => s.position === '1').map((s) => byJid.get(s.Driver.driverId)).filter((x): x is number => x !== undefined)
      r.races.push(race)
      r.through = sr.date
      const season = r.seasons.get(year)!
      season.drivers = table.map((s) => ({ d: byJid.get(s.Driver.driverId) ?? -1, pos: Number(s.position) || 0, pts: Number(s.points) || 0, champion: false })).filter((s) => s.d >= 0)
    }
  }
}

async function loadRecords(): Promise<Records & { liveError: string | null }> {
  const r = decode(await loadRaw())
  let liveError: string | null = null
  try {
    await topUp(r)
  } catch (e) {
    liveError = e instanceof Error ? e.message : 'Could not load the latest races.'
  }
  finalize(r)
  return { ...r, liveError }
}

export const useRecords = () =>
  useQuery({ queryKey: ['records'], queryFn: loadRecords, staleTime: 10 * 60 * 1000, retry: 0 })

/** Every baked driver with a Jolpica id, for driver searches (no Jolpica requests). */
export const useDriverIndex = () =>
  useQuery({
    queryKey: ['records', 'drivers'],
    queryFn: () => loadRaw().then((r) => r.drivers.flatMap(([, jid, name]) => (jid ? [{ id: jid, name }] : []))),
    staleTime: Infinity,
  })
