import { useMemo, type ReactNode } from 'react'
import type { JRace } from '../../api/jolpica/types'
import { Empty, gate, Loading } from '../../components/ui'
import { jName } from '../../lib/history'
import type { WidgetDef } from '../types'
import { useRacesHere } from './shared'

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mw-tile">
      <span className="mw-tile-label">{label}</span>
      <span className="mw-tile-value">{value}</span>
      {sub && <span className="mw-stat-sub">{sub}</span>}
    </div>
  )
}

function mostWins(races: JRace[], key: (r: JRace) => string) {
  const m = new Map<string, { race: JRace; n: number }>()
  for (const r of races) {
    const k = key(r)
    const e = m.get(k) ?? { race: r, n: 0 }
    e.n++
    m.set(k, e)
  }
  const top = [...m.values()].sort((a, b) => b.n - a.n)
  return top.filter((e) => e.n === top[0]?.n)
}

function CircuitFacts() {
  const { circuit, winners, past, isLoading } = useRacesHere()

  const facts = useMemo(() => {
    if (!past.length) return null
    const first = past[past.length - 1]
    const last = past[0]
    const drivers = mostWins(past, (r) => r.Results![0].Driver.driverId)
    const teams = mostWins(past, (r) => r.Results![0].Constructor.constructorId)
    const gridded = past.filter((r) => Number(r.Results![0].grid) > 0)
    const fromPole = gridded.filter((r) => r.Results![0].grid === '1').length
    const deepest = [...gridded].sort((a, b) => Number(b.Results![0].grid) - Number(a.Results![0].grid) || b.date.localeCompare(a.date))[0]
    const recent = past.slice(0, 10)
    const distinct = new Set(recent.map((r) => r.Results![0].Driver.driverId)).size
    return { first, last, drivers, teams, gridded, fromPole, deepest, recent, distinct }
  }, [past])

  if (!circuit) return isLoading ? <Loading /> : <Empty>No race found for this session.</Empty>
  const g = gate(winners)
  if (g) return g
  if (!facts) return <Empty>{circuit.circuitName} hasn’t held a Grand Prix before. This will be the first.</Empty>

  const lw = facts.last.Results![0]
  const names = (es: { race: JRace }[], f: (r: JRace) => string) => es.map((e) => f(e.race)).join(', ')

  return (
    <div className="mw-tiles pv-facts">
      <Tile label="Grands Prix here" value={past.length} sub={`First in ${facts.first.season}`} />
      <Tile label="Last winner" value={lw.Driver.familyName} sub={`${facts.last.season}, ${lw.Constructor.name}`} />
      <Tile
        label="Most wins"
        value={names(facts.drivers, (r) => r.Results![0].Driver.familyName)}
        sub={`${facts.drivers[0].n} win${facts.drivers[0].n > 1 ? 's' : ''}${facts.drivers.length > 1 ? ' each' : ''}`}
      />
      <Tile
        label="Most wins, constructor"
        value={names(facts.teams, (r) => r.Results![0].Constructor.name)}
        sub={`${facts.teams[0].n} win${facts.teams[0].n > 1 ? 's' : ''}${facts.teams.length > 1 ? ' each' : ''}`}
      />
      {facts.gridded.length > 0 && (
        <Tile label="Won from pole" value={`${Math.round((facts.fromPole / facts.gridded.length) * 100)}%`} sub={`${facts.fromPole} of ${facts.gridded.length} races`} />
      )}
      {facts.deepest && (
        <Tile
          label="Furthest back to win"
          value={`P${facts.deepest.Results![0].grid}`}
          sub={`${jName(facts.deepest.Results![0].Driver)}, ${facts.deepest.season}`}
        />
      )}
      {facts.recent.length > 1 && (
        <Tile label={`Winners in the last ${facts.recent.length}`} value={facts.distinct} sub={facts.distinct === 1 ? 'The same driver every time' : 'different drivers'} />
      )}
    </div>
  )
}

export const previewCircuitFacts: WidgetDef = {
  type: 'preview-circuit-facts',
  name: 'Circuit facts',
  description: 'Headline numbers for the race’s circuit: Grands Prix held, the last and most frequent winners, how often pole converts, and the furthest back anyone has won from.',
  category: 'Preview',
  sessionless: true,
  defaultSize: { w: 16, h: 5 },
  Component: CircuitFacts,
  options: [],
}
