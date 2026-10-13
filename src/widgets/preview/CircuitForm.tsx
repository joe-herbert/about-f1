import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { FOREVER, HOUR, jolpica } from '../../api/jolpica/client'
import { useJDriverStandings } from '../../api/jolpica/hooks'
import type { JDriver, JResult } from '../../api/jolpica/types'
import { DataTable, type Column } from '../../components/DataTable'
import { Empty, gate, Loading } from '../../components/ui'
import { useConstructorColors, useFocusCodes } from '../../lib/history'
import type { WidgetDef, WidgetProps } from '../types'
import { buildStyles, JDriverTag } from '../history/race-common'
import { useRacesHere } from './shared'

interface Row {
  d: JDriver
  team: string
  /** Result per past race (newest first); undefined = didn't race */
  results: (JResult | undefined)[]
  best: number | null
  wins: number
  podiums: number
}

function Cell({ r }: { r: JResult | undefined }) {
  if (!r) return <span className="pv-cell pv-absent">·</span>
  const pos = Number(r.positionText)
  const cls = !pos ? 'pv-out' : pos === 1 ? 'pv-win' : pos <= 3 ? 'pv-podium' : pos <= 10 ? 'pv-points' : ''
  return (
    <span className={`pv-cell ${cls}`} title={`${pos ? `P${pos}` : 'Not classified'} from ${Number(r.grid) ? `P${r.grid}` : 'the pit lane'}, ${r.status}`}>
      {pos || (r.positionText === 'R' ? 'Ret' : r.positionText)}
    </span>
  )
}

function CircuitForm({ year, opts }: WidgetProps) {
  const { circuit, winners, past, isLoading, year: raceYear } = useRacesHere()
  const season = raceYear ?? year
  const standings = useJDriverStandings(season)
  // Before a season's first race there are no standings yet: use last season's drivers.
  const lastYear = useJDriverStandings(standings.isSuccess && !standings.data.standings.length ? season - 1 : null)
  const colorOf = useConstructorColors()
  const focus = useFocusCodes()
  const n = Math.max(1, Number(opts.races) || 5)
  const recent = useMemo(() => past.slice(0, n), [past, n])
  const thisYear = new Date().getFullYear()

  const results = useQueries({
    queries: recent.map((r) => {
      const path = `${r.season}/${r.round}/results`
      const ttl = Number(r.season) < thisYear ? FOREVER : HOUR
      return { queryKey: ['jolpica', path], queryFn: () => jolpica(path, ttl), staleTime: ttl === FOREVER ? Infinity : 10 * 60 * 1000, retry: 0 }
    }),
  })

  const fromLastYear = standings.isSuccess && !standings.data.standings.length
  const list = (fromLastYear ? lastYear : standings).data?.standings[0]?.DriverStandings ?? []

  const rows = ((): Row[] => {
    if (!results.every((q) => q.data)) return []
    const byRace = results.map((q) => new Map((q.data?.races[0]?.Results ?? []).map((r) => [r.Driver.driverId, r])))
    const allWins = new Map<string, number>()
    for (const r of past) {
      const id = r.Results![0].Driver.driverId
      allWins.set(id, (allWins.get(id) ?? 0) + 1)
    }
    return list
      .filter((s) => focus.visible(s.Driver))
      .map((s) => {
        const res = byRace.map((m) => m.get(s.Driver.driverId))
        const finishes = res.map((r) => Number(r?.positionText)).filter((p) => p > 0)
        return {
          d: s.Driver,
          team: s.Constructors[s.Constructors.length - 1]?.constructorId ?? '',
          results: res,
          best: finishes.length ? Math.min(...finishes) : null,
          wins: allWins.get(s.Driver.driverId) ?? 0,
          podiums: finishes.filter((p) => p <= 3).length,
        }
      })
  })()

  const styles = useMemo(() => buildStyles(list.map((s) => ({ Driver: s.Driver, Constructors: s.Constructors })), colorOf), [list, colorOf])

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: 'driver',
        label: 'Driver',
        sort: (r) => r.d.familyName,
        render: (r) => (
          <span className="hr-driver">
            <JDriverTag d={r.d} style={styles.get(r.d.driverId)} dim={focus.dimmed(r.d)} />
            <span className="minor-text">{r.d.familyName}</span>
          </span>
        ),
      },
      ...recent.map(
        (race, i): Column<Row> => ({
          key: `r${i}`,
          label: race.season,
          align: 'center',
          sort: (r) => Number(r.results[i]?.positionText) || 99,
          render: (r) => <Cell r={r.results[i]} />,
        }),
      ),
      { key: 'best', label: 'Best', align: 'right', sort: (r) => r.best ?? 99, render: (r) => <span className="tnum">{r.best ? `P${r.best}` : '—'}</span> },
      { key: 'podiums', label: 'Podiums', align: 'right', minor: true, render: (r) => <span className="tnum">{r.podiums || '—'}</span> },
      { key: 'wins', label: 'Wins here', align: 'right', render: (r) => <b className="tnum">{r.wins || '—'}</b> },
    ],
    [recent, styles, focus],
  )

  if (!circuit) return isLoading ? <Loading /> : <Empty>No race found for this session.</Empty>
  const g = gate(winners, standings)
  if (g) return g
  if (!recent.length) return <Empty>No earlier Grand Prix at {circuit.circuitName} to compare.</Empty>
  const g2 = gate(...results, lastYear)
  if (g2) return g2
  if (!list.length) return <Empty>No drivers entered for {season} yet.</Empty>

  return (
    <div className="hr-root">
      <div className="hr-caption">
        <strong>{circuit.circuitName}</strong>
        <span>
          {fromLastYear ? season - 1 : season} drivers in the last {recent.length} race{recent.length > 1 ? 's' : ''} here
        </span>
        <span>Wins count every race at this circuit</span>
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.d.driverId} />
    </div>
  )
}

export const previewCircuitForm: WidgetDef = {
  type: 'preview-circuit-form',
  name: 'Form at this circuit',
  description: 'How each driver in this season’s championship finished in the last few races at this circuit, with their best result, podiums and wins here.',
  category: 'Preview',
  sessionless: true,
  usesDrivers: true,
  defaultSize: { w: 16, h: 13 },
  Component: CircuitForm,
  options: [{ key: 'races', label: 'Past races', type: 'number', default: 5, min: 1, max: 10, help: 'Each race is one request to the history source the first time' }],
}
