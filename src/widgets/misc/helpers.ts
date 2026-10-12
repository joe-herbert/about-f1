import { useMemo } from 'react'
import { usePositions, useResults } from '../../api/hooks'
import { latestPositions } from '../../lib/derive'

/** Driver numbers in finishing order: session_result if published, else last known position. */
export function useFinishOrder(sessionKey: number | null) {
  const results = useResults(sessionKey)
  const positions = usePositions(sessionKey)
  const order = useMemo(() => {
    const rank = new Map<number, number>()
    for (const r of results.data ?? []) if (r.position) rank.set(r.driver_number, r.position)
    if (!rank.size) for (const [n, p] of latestPositions(positions.data)) rank.set(n, p.position)
    return rank
  }, [results.data, positions.data])
  return { rank: order, isLoading: results.isLoading || positions.isLoading }
}

export function byRank(rank: Map<number, number>) {
  return (a: number, b: number) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99) || a - b
}

/** Hex + alpha (0..1) -> rgba() */
export function alpha(hex: string, a: number) {
  const p = parseInt(hex.slice(1), 16)
  return `rgba(${(p >> 16) & 255},${(p >> 8) & 255},${p & 255},${a})`
}
