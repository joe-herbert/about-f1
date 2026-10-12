import { useMemo } from 'react'
import { useJSeasonQualifying, useJSeasonResults, useJSeasonSprints } from '../../api/jolpica/hooks'
import type { JConstructor, JDriver } from '../../api/jolpica/types'
import { Empty, gate } from '../../components/ui'
import { jCode, jName, useConstructorColors, useHistTarget } from '../../lib/history'
import type { WidgetDef, WidgetProps } from '../types'
import { SEASON_OPTION } from './season-shared'
import './history-season.css'

interface Pair {
  team: JConstructor
  a: JDriver
  b: JDriver
  race: [number, number]
  quali: [number, number]
  points: [number, number]
  shared: number
}

const rank = (positionText: string, position: string) => (/^\d+$/.test(positionText) ? Number(position) : 999)

function Teammates({ opts }: WidgetProps) {
  const { year } = useHistTarget(opts)
  const results = useJSeasonResults(year)
  const sprints = useJSeasonSprints(year)
  const quali = useJSeasonQualifying(year >= 1994 ? year : null)
  const colorOf = useConstructorColors()

  const pairs = useMemo<Pair[]>(() => {
    const qBy = new Map<string, Map<string, number>>()
    for (const r of quali.data?.races ?? []) qBy.set(r.round, new Map((r.QualifyingResults ?? []).map((q) => [q.Driver.driverId, Number(q.position)])))
    const sprintPts = new Map<string, number>()
    for (const r of sprints.data?.races ?? []) for (const s of r.SprintResults ?? []) sprintPts.set(`${r.round}:${s.Driver.driverId}`, Number(s.points) || 0)

    const map = new Map<string, Pair>()
    for (const r of results.data?.races ?? []) {
      const byTeam = new Map<string, typeof r.Results>()
      for (const res of r.Results ?? []) byTeam.set(res.Constructor.constructorId, [...(byTeam.get(res.Constructor.constructorId) ?? []), res])
      for (const [teamId, list] of byTeam) {
        if (!list || list.length < 2) continue
        const [x, y] = [...list].sort((p, q) => p.Driver.driverId.localeCompare(q.Driver.driverId))
        const key = `${teamId}:${x.Driver.driverId}:${y.Driver.driverId}`
        const p = map.get(key) ?? { team: x.Constructor, a: x.Driver, b: y.Driver, race: [0, 0], quali: [0, 0], points: [0, 0], shared: 0 }
        p.shared++
        const rx = rank(x.positionText, x.position)
        const ry = rank(y.positionText, y.position)
        if (rx !== ry && !(rx === 999 && ry === 999)) p.race[rx < ry ? 0 : 1]++
        const q = qBy.get(r.round)
        const qx = q?.get(x.Driver.driverId) ?? (Number(x.grid) || 999)
        const qy = q?.get(y.Driver.driverId) ?? (Number(y.grid) || 999)
        if (qx !== qy) p.quali[qx < qy ? 0 : 1]++
        p.points[0] += (Number(x.points) || 0) + (sprintPts.get(`${r.round}:${x.Driver.driverId}`) ?? 0)
        p.points[1] += (Number(y.points) || 0) + (sprintPts.get(`${r.round}:${y.Driver.driverId}`) ?? 0)
        map.set(key, p)
      }
    }
    // One pairing per team: the one that raced together most often. Lead with the higher scorer.
    const best = new Map<string, Pair>()
    for (const p of map.values()) {
      const cur = best.get(p.team.constructorId)
      if (!cur || p.shared > cur.shared) best.set(p.team.constructorId, p)
    }
    return [...best.values()]
      .map((p) =>
        p.points[1] > p.points[0]
          ? { ...p, a: p.b, b: p.a, race: [p.race[1], p.race[0]], quali: [p.quali[1], p.quali[0]], points: [p.points[1], p.points[0]] }
          : p,
      )
      .filter((p) => p.shared >= Number(opts.minRaces ?? 3))
      .sort((p, q) => q.points[0] + q.points[1] - (p.points[0] + p.points[1])) as Pair[]
  }, [results.data, sprints.data, quali.data, opts.minRaces])

  const g = gate(results, sprints, quali)
  if (g) return g
  if (!pairs.length) return <Empty>No teammate pairings with enough shared races in {year}.</Empty>

  const bar = (label: string, [l, r]: [number, number], color: string, fmt = (v: number) => String(v)) => {
    const total = l + r || 1
    return (
      <div className="hs-h2h-row">
        <span className="hs-h2h-val tnum">{fmt(l)}</span>
        <div className="hs-h2h-track" title={`${label}: ${fmt(l)} – ${fmt(r)}`}>
          <span className="hs-h2h-left" style={{ width: `${(l / total) * 50}%`, background: color }} />
          <span className="hs-h2h-mid" />
          <span className="hs-h2h-right" style={{ width: `${(r / total) * 50}%`, borderColor: color }} />
        </div>
        <span className="hs-h2h-val right tnum">{fmt(r)}</span>
        <span className="hs-h2h-label">{label}</span>
      </div>
    )
  }

  return (
    <div className="hs-teammates">
      {pairs.map((p) => {
        const color = colorOf(p.team)
        return (
          <section key={p.team.constructorId} className="hs-pair">
            <header className="hs-pair-head">
              <span className="hs-cell" title={jName(p.a)}>
                <span className="hs-swatch" style={{ background: color }} />
                <b>{jCode(p.a)}</b>
              </span>
              <span className="hs-pair-team">
                {p.team.name}, {p.shared} races together
              </span>
              <span className="hs-cell" title={jName(p.b)}>
                <b>{jCode(p.b)}</b>
                <span className="hs-swatch hollow" style={{ borderColor: color }} />
              </span>
            </header>
            {bar('Race', p.race, color)}
            {bar(year >= 1994 ? 'Qualifying' : 'Grid', p.quali, color)}
            {bar('Points', p.points, color, (v) => String(Math.round(v * 10) / 10))}
          </section>
        )
      })}
    </div>
  )
}

export const histTeammates: WidgetDef = {
  type: 'hist-teammates',
  name: 'Teammate battles',
  description: 'Who beat whom inside each team in any season: race finishes ahead, qualifying (or grid, before 1994) ahead, and points.',
  category: 'Championship',
  sessionless: true,
  defaultSize: { w: 12, h: 16 },
  Component: Teammates,
  options: [SEASON_OPTION, { key: 'minRaces', label: 'Minimum races together', type: 'number', default: 3, min: 1, max: 20 }],
}
