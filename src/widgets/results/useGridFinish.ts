import { useMemo } from 'react'
import { useLaps, usePositions, useResults, useStartingGrid } from '../../api/hooks'
import { latestPositions, positionsByLap } from '../../lib/derive'
import { resultStatus } from './shared'

export interface GridFinish {
  n: number
  grid: number | null
  finish: number | null
  status: string | null
}

/** Grid slot and finishing position per driver. Grid falls back to the first published position. */
export function useGridFinish(sessionKey: number | null) {
  const grid = useStartingGrid(sessionKey)
  const results = useResults(sessionKey)
  // Lap data is only needed to infer the grid when no starting grid exists.
  const noGrid = grid.isSuccess && !grid.data?.length
  const laps = useLaps(noGrid ? sessionKey : null)
  const positions = usePositions(noGrid || (results.isSuccess && !results.data?.length) ? sessionKey : null)

  const rows = useMemo<GridFinish[]>(() => {
    const gridMap = new Map<number, number>()
    if (grid.data?.length) for (const g of grid.data) gridMap.set(g.driver_number, g.position)
    else for (const [n, arr] of positionsByLap(laps.data, positions.data)) if (arr[0]) gridMap.set(n, arr[0])
    const finish = new Map<number, { pos: number | null; status: string | null }>()
    if (results.data?.length) for (const r of results.data) finish.set(r.driver_number, { pos: r.position, status: resultStatus(r) })
    else for (const [n, p] of latestPositions(positions.data)) finish.set(n, { pos: p.position, status: null })
    const drivers = new Set([...gridMap.keys(), ...finish.keys()])
    return [...drivers].map((n) => ({ n, grid: gridMap.get(n) ?? null, finish: finish.get(n)?.pos ?? null, status: finish.get(n)?.status ?? null }))
  }, [grid.data, results.data, laps.data, positions.data])

  return { rows, queries: [grid, results, laps, positions] as const }
}
