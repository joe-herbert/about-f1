import { useQuery } from '@tanstack/react-query'
import type { PowerUnitSeason } from './types'

async function fetchSeason(season: number): Promise<PowerUnitSeason> {
  const res = await fetch(`/api/power-units?season=${season}`)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `The server returned ${res.status}`)
  return body
}

/** A season's power unit usage. While the server is still reading a season from the FIA, it asks again every 20 seconds. */
export function usePowerUnits(season: number | null | undefined) {
  return useQuery({
    queryKey: ['power-units', season],
    queryFn: () => fetchSeason(season!),
    enabled: !!season,
    staleTime: 5 * 60_000,
    refetchInterval: (q) => (q.state.data?.scraping || (q.state.data && !q.state.data.events.length) ? 20_000 : 10 * 60_000),
    retry: 1,
  })
}
