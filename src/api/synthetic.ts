// Sessions OpenF1 doesn't cover (before 2023) are represented with negative
// session keys that encode the Jolpica season, round and session kind. Everything
// downstream keeps using numeric session keys and OpenF1-shaped records.

export const OPENF1_FIRST_YEAR = 2023

export type JKind = 'qualifying' | 'sprint' | 'race'
const KIND_CODE: Record<JKind, number> = { qualifying: 1, sprint: 2, race: 3 }
const CODE_KIND: Record<number, JKind> = { 1: 'qualifying', 2: 'sprint', 3: 'race' }

export const SESSION_NAME: Record<JKind, string> = { qualifying: 'Qualifying', sprint: 'Sprint', race: 'Race' }

export function synthSessionKey(year: number, round: number, kind: JKind) {
  return -(year * 1000 + round * 10 + KIND_CODE[kind])
}

export function synthMeetingKey(year: number, round: number) {
  return -(year * 100 + round)
}

export const isSynthetic = (key: number | null | undefined) => typeof key === 'number' && key < 0

export function decodeSessionKey(key: number): { year: number; round: number; kind: JKind } | null {
  if (key >= 0) return null
  const v = -key
  const kind = CODE_KIND[v % 10]
  if (!kind) return null
  return { year: Math.floor(v / 1000), round: Math.floor(v / 10) % 100, kind }
}

/** OpenF1 session name → the Jolpica data that can stand in for it. */
export function kindFromSessionName(name: string | undefined): JKind | null {
  if (name === 'Race') return 'race'
  if (name === 'Sprint') return 'sprint'
  if (name === 'Qualifying') return 'qualifying'
  return null
}
