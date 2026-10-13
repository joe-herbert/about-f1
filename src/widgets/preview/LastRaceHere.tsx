import { useMemo } from 'react'
import { useJResults } from '../../api/jolpica/hooks'
import type { JResult } from '../../api/jolpica/types'
import { DataTable, type Column } from '../../components/DataTable'
import { Empty, gate, Loading } from '../../components/ui'
import { isFinish, jName, useConstructorColors, useFocusCodes } from '../../lib/history'
import type { WidgetDef, WidgetProps } from '../types'
import { buildStyles, ConstructorCell, JDriverTag } from '../history/race-common'
import { useRacesHere } from './shared'

function LastRaceHere({ opts }: WidgetProps) {
  const { circuit, winners, past, isLoading } = useRacesHere()
  const back = Math.max(1, Number(opts.back) || 1)
  const race = past[back - 1]
  const results = useJResults(race ? Number(race.season) : null, race ? Number(race.round) : null)
  const colorOf = useConstructorColors()
  const focus = useFocusCodes()

  const rows = useMemo(() => (results.data?.races[0]?.Results ?? []).filter((r) => focus.visible(r.Driver)), [results.data, focus])
  const styles = useMemo(() => buildStyles(rows, colorOf), [rows, colorOf])
  const all = results.data?.races[0]?.Results ?? []
  const pole = all.find((r) => r.grid === '1')
  const fastest = all.find((r) => r.FastestLap?.rank === '1')

  const columns = useMemo<Column<JResult>[]>(
    () => [
      { key: 'pos', label: 'Pos', align: 'right', width: 36, sort: (r) => Number(r.position), render: (r) => <b className="tnum">{r.positionText === 'R' ? 'Ret' : r.positionText}</b> },
      {
        key: 'driver',
        label: 'Driver',
        sort: (r) => r.Driver.familyName,
        render: (r) => (
          <span className="hr-driver">
            <JDriverTag d={r.Driver} style={styles.get(r.Driver.driverId)} dim={focus.dimmed(r.Driver)} />
            <span className="minor-text">{r.Driver.familyName}</span>
          </span>
        ),
      },
      { key: 'team', label: 'Team', minor: true, sort: (r) => r.Constructor.name, render: (r) => <ConstructorCell c={r.Constructor} color={colorOf(r.Constructor)} /> },
      {
        key: 'grid',
        label: 'Grid',
        align: 'right',
        sort: (r) => Number(r.grid) || 99,
        render: (r) => {
          const gained = Number(r.grid) && isFinish(r.status) ? Number(r.grid) - Number(r.position) : 0
          return (
            <span className="tnum">
              {Number(r.grid) ? r.grid : 'Pit'}
              {gained !== 0 && <span className={gained > 0 ? 'hr-up' : 'hr-down'}> {gained > 0 ? `+${gained}` : gained}</span>}
            </span>
          )
        },
      },
      { key: 'time', label: 'Time', align: 'right', minor: true, render: (r) => <span className={`tnum ${r.Time ? '' : 'hr-status'}`}>{r.Time?.time ?? r.status}</span> },
      { key: 'points', label: 'Pts', align: 'right', sort: (r) => Number(r.points), render: (r) => <span className="tnum">{Number(r.points) || ''}</span> },
    ],
    [styles, colorOf, focus],
  )

  if (!circuit) return isLoading ? <Loading /> : <Empty>No race found for this session.</Empty>
  const g = gate(winners)
  if (g) return g
  if (!race) return <Empty>{past.length ? `Only ${past.length} earlier Grand Prix here.` : `No earlier Grand Prix at ${circuit.circuitName}.`}</Empty>
  const g2 = gate(results)
  if (g2) return g2

  return (
    <div className="hr-root">
      <div className="hr-caption">
        <strong>
          {race.season} {race.raceName}
        </strong>
        {pole && <span>Pole: {jName(pole.Driver)}</span>}
        {fastest && (
          <span className="hr-fl">
            <span className="hr-fl-dot" />
            {fastest.Driver.familyName} {fastest.FastestLap?.Time?.time}
          </span>
        )}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.Driver.driverId} />
    </div>
  )
}

export const previewLastRace: WidgetDef = {
  type: 'preview-last-race',
  name: 'Last time here',
  description: 'The full result of the previous Grand Prix at this race’s circuit, with places gained from the grid, pole and fastest lap.',
  category: 'Preview',
  sessionless: true,
  usesDrivers: true,
  defaultSize: { w: 8, h: 12 },
  Component: LastRaceHere,
  options: [{ key: 'back', label: 'Race', type: 'number', default: 1, min: 1, max: 20, help: '1 = the most recent race here, 2 = the one before, and so on' }],
}
