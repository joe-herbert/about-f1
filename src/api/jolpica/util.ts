import type { JDriver } from './types'

export const num = (s: string | undefined | null) => (s === undefined || s === null || s === '' ? null : Number(s))

/** "1:23.456" or "83.456" -> seconds */
export function parseLapTime(s: string | undefined | null): number | null {
  if (!s) return null
  const parts = s.split(':').map(Number)
  if (parts.some((p) => !isFinite(p))) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

export const jName = (d: JDriver) => `${d.givenName} ${d.familyName}`
export const jCode = (d: JDriver) => d.code ?? d.familyName.replace(/[^A-Za-zÀ-ž]/g, '').slice(0, 3).toUpperCase()

/** Statuses that count as classified finishes (Ergast lists laps-down as "+1 Lap"). */
export const isFinish = (status: string) => status === 'Finished' || /^\+\d+ Laps?$/.test(status)
