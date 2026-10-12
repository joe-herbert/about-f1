// OpenF1 client: a polite request queue (the free tier rate-limits hard),
// retry on 429, and an IndexedDB cache for data that can no longer change.

const BASE = 'https://api.openf1.org/v1'
const MIN_GAP_MS = 380
const MAX_CONCURRENT = 2

export type Params = Record<string, string | number | boolean | null | undefined>

export function buildUrl(endpoint: string, params: Params = {}): string {
  const parts: string[] = []
  for (const [rawKey, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    // Keys may carry an operator suffix, e.g. "date>" or "lap_number<=".
    const m = rawKey.match(/^(.*?)(>=|<=|>|<)?$/)!
    const key = encodeURIComponent(m[1])
    const op = m[2] ?? '='
    parts.push(`${key}${encodeURIComponent(op).replace(/%3D/g, '=')}${encodeURIComponent(String(value))}`)
  }
  return `${BASE}/${endpoint}${parts.length ? `?${parts.join('&')}` : ''}`
}

/* ---------- queue ---------- */

type Job = { run: () => Promise<void> }
const queue: Job[] = []
let active = 0
let lastStart = 0
let timer: ReturnType<typeof setTimeout> | null = null

function pump() {
  if (timer || !queue.length || active >= MAX_CONCURRENT) return
  const wait = Math.max(0, lastStart + MIN_GAP_MS - Date.now())
  timer = setTimeout(() => {
    timer = null
    const job = queue.shift()
    if (!job) return
    active++
    lastStart = Date.now()
    job.run().finally(() => {
      active--
      pump()
    })
    pump()
  }, wait)
}

const listeners = new Set<(n: number) => void>()
export function onQueueChange(fn: (n: number) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
let inflight = 0
export function setInflight(d: number) {
  inflight += d
  listeners.forEach((l) => l(inflight))
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ run: () => fn().then(resolve, reject) })
    pump()
  })
}

/* ---------- IndexedDB cache ---------- */

const DB_NAME = 'f1-stats-cache'
const STORE = 'responses'
let dbPromise: Promise<IDBDatabase | null> | null = null

function db(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const d = await db()
  if (!d) return undefined
  return new Promise((resolve) => {
    const req = d.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => resolve(undefined)
  })
}

export async function cacheSet(key: string, value: unknown) {
  const d = await db()
  if (!d) return
  try {
    d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
  } catch {
    /* quota or clone errors are non-fatal */
  }
}

export async function clearCache() {
  const d = await db()
  if (!d) return
  await new Promise<void>((resolve) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/* ---------- fetch ---------- */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function fetchWithRetry(url: string, signal?: AbortSignal): Promise<unknown> {
  let delay = 1200
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, { signal })
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, delay))
      delay *= 2
      continue
    }
    if (res.status === 404) return []
    if (!res.ok) throw new ApiError(res.status, `OpenF1 returned ${res.status} for ${url}`)
    const body = await res.json()
    // OpenF1 answers "no data" with {detail: "No results found."}
    if (!Array.isArray(body)) return []
    return body
  }
  throw new ApiError(429, 'OpenF1 is rate-limiting requests. Wait a minute, then refresh.')
}

export interface GetOptions {
  /** Persist the response in IndexedDB (only for data that can't change). */
  persist?: boolean
  signal?: AbortSignal
}

export async function get<T>(endpoint: string, params: Params = {}, opts: GetOptions = {}): Promise<T[]> {
  const url = buildUrl(endpoint, params)
  if (opts.persist) {
    const hit = await cacheGet<T[]>(url)
    if (hit) return hit
  }
  setInflight(1)
  try {
    const data = (await enqueue(() => fetchWithRetry(url, opts.signal))) as T[]
    if (opts.persist && data.length) cacheSet(url, data)
    return data
  } finally {
    setInflight(-1)
  }
}
