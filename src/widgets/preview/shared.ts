import { useMemo } from 'react'
import { useJCircuitWinners } from '../../api/jolpica/hooks'
import type { JRace } from '../../api/jolpica/types'
import { useHistoryRef } from '../../lib/history'
import './preview.css'

/** The header's race and every earlier Grand Prix at its circuit, newest first. */
export function useRacesHere() {
  const ref = useHistoryRef()
  const circuitId = ref.race?.Circuit.circuitId
  const winners = useJCircuitWinners(circuitId)
  const past = useMemo<JRace[]>(() => {
    const before = ref.race?.date ?? '9999'
    return (winners.data?.races ?? []).filter((r) => r.date < before && r.Results?.[0]).sort((a, b) => b.date.localeCompare(a.date))
  }, [winners.data, ref.race])
  return { ...ref, circuit: ref.race?.Circuit, winners, past }
}

/** Points on offer to one driver (or team, with both cars) in a weekend. */
export function weekendMax(year: number, sprint: boolean, teams: boolean) {
  const fastestLap = year >= 2019 && year <= 2024 ? 1 : 0
  const race = (teams ? 25 + 18 : 25) + fastestLap
  return race + (sprint ? (teams ? 8 + 7 : 8) : 0)
}
