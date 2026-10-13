// Jolpica F1 client. Limits are strict (4 req/s burst, 500 req/hour), so every
// response is cached in IndexedDB with a TTL chosen by the caller, requests go
// through a single slow queue, and an hourly budget is tracked across reloads.

import { cacheGet, cacheSet, setInflight } from '../client'
import type { JData, JRace, JStandingsList } from './types'

const BASE = 'https://api.jolpi.ca/ergast/f1'
const PAGE = 100
const MIN_GAP_MS = 500 // 320ms put 4 requests in under a second, right on the burst limit
const HOURLY_BUDGET = 470 // leave headroom under the 500/hour limit
const BUDGET_KEY = 'f1-stats:jolpica-requests'

export const HOUR = 60 * 60 * 1000
export const FOREVER = Infinity

export class JolpicaError extends Error {}

/* ---------- hourly budget ---------- */

function recentRequests(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BUDGET_KEY) ?? '[]') as number[]
    const cutoff = Date.now() - HOUR
    return raw.filter((t) => t > cutoff)
  } catch {
    return []
  }
}

function spendBudget() {
  const list = recentRequests()
  if (list.length >= HOURLY_BUDGET) {
    const mins = Math.ceil((list[0] + HOUR - Date.now()) / 60000)
    throw new JolpicaError(`Jolpica’s hourly request limit is used up. Cached history still works; new data loads again in about ${mins} min.`)
  }
  list.push(Date.now())
  localStorage.setItem(BUDGET_KEY, JSON.stringify(list))
}

export function budgetRemaining() {
  return HOURLY_BUDGET - recentRequests().length
}

/* ---------- queue ---------- */

let chain: Promise<unknown> = Promise.resolve()
let last = 0

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, last + MIN_GAP_MS - Date.now())
    if (wait) await new Promise((r) => setTimeout(r, wait))
    last = Date.now()
    return fn()
  })
  chain = run.catch(() => {})
  return run
}

async function fetchPage(path: string, offset: number): Promise<any> {
  setInflight(1)
  return enqueue(async () => {
    let delay = 2000
    for (let attempt = 0; attempt < 4; attempt++) {
      spendBudget()
      const sep = path.includes('?') ? '&' : '?'
      let res: Response
      try {
        res = await fetch(`${BASE}/${path}.json${sep}limit=${PAGE}&offset=${offset}`)
      } catch {
        // Throttled responses can arrive without CORS headers and surface as network errors.
        await new Promise((r) => setTimeout(r, delay))
        delay *= 2
        continue
      }
      if (res.status === 404) return { MRData: { total: '0' } }
      if (res.ok) return res.json()
      if (res.status === 429 || res.status === 400 || res.status >= 500) {
        const retry = Number(res.headers.get('retry-after'))
        await new Promise((r) => setTimeout(r, retry ? retry * 1000 : delay))
        delay *= 2
        continue
      }
      throw new JolpicaError(`Jolpica returned ${res.status} for ${path}`)
    }
    throw new JolpicaError('Jolpica is rate-limiting requests. Wait a minute, then refresh.')
  }).finally(() => setInflight(-1))
}

/* ---------- merging pages ---------- */

const RACE_ARRAYS = ['Results', 'SprintResults', 'QualifyingResults', 'PitStops'] as const

function mergeRaces(into: JRace[], incoming: JRace[]) {
  for (const r of incoming) {
    const existing = into.find((x) => x.season === r.season && x.round === r.round)
    if (!existing) {
      into.push(r)
      continue
    }
    for (const k of RACE_ARRAYS) if (r[k]) existing[k] = [...((existing[k] as any[]) ?? []), ...(r[k] as any[])] as any
    if (r.Laps) {
      existing.Laps ??= []
      for (const lap of r.Laps) {
        const same = existing.Laps.find((l) => l.number === lap.number)
        if (same) same.Timings.push(...lap.Timings)
        else existing.Laps.push(lap)
      }
    }
  }
}

function mergeStandings(into: JStandingsList[], incoming: JStandingsList[]) {
  for (const s of incoming) {
    const existing = into.find((x) => x.season === s.season && x.round === s.round)
    if (!existing) into.push(s)
    else {
      if (s.DriverStandings) existing.DriverStandings = [...(existing.DriverStandings ?? []), ...s.DriverStandings]
      if (s.ConstructorStandings) existing.ConstructorStandings = [...(existing.ConstructorStandings ?? []), ...s.ConstructorStandings]
    }
  }
}

function absorb(out: JData, mr: any) {
  if (mr.RaceTable?.Races) mergeRaces(out.races, mr.RaceTable.Races)
  if (mr.StandingsTable?.StandingsLists) mergeStandings(out.standings, mr.StandingsTable.StandingsLists)
  if (mr.DriverTable?.Drivers) out.drivers.push(...mr.DriverTable.Drivers)
  if (mr.ConstructorTable?.Constructors) out.constructors.push(...mr.ConstructorTable.Constructors)
  if (mr.CircuitTable?.Circuits) out.circuits.push(...mr.CircuitTable.Circuits)
  if (mr.SeasonTable?.Seasons) out.seasons.push(...mr.SeasonTable.Seasons)
}

const inflight = new Map<string, Promise<JData>>()

/**
 * Fetch every page of an Ergast-style path, e.g. "2005/1/laps" or "circuits/monaco/results/1".
 * `ttl` is how long the merged result may be served from IndexedDB.
 */
export function jolpica(path: string, ttl: number): Promise<JData> {
  const key = `j:${path}`
  const pending = inflight.get(key)
  if (pending) return pending
  const p = (async () => {
    const hit = await cacheGet<{ t: number; data: JData }>(key)
    if (hit && Date.now() - hit.t < ttl) return hit.data
    try {
      const out: JData = { total: 0, races: [], standings: [], drivers: [], constructors: [], circuits: [], seasons: [] }
      const first = (await fetchPage(path, 0)).MRData
      out.total = Number(first.total ?? 0)
      absorb(out, first)
      for (let offset = PAGE; offset < out.total; offset += PAGE) absorb(out, (await fetchPage(path, offset)).MRData)
      cacheSet(key, { t: Date.now(), data: out })
      return out
    } catch (e) {
      // Stale beats nothing when the budget runs out.
      if (hit) return hit.data
      throw e
    }
  })().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}
