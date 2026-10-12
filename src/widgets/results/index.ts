import type { WidgetDef } from '../types'
import { driverCard } from './DriverCard'
import { gridVsFinish } from './GridVsFinish'
import { headToHead } from './HeadToHead'
import { pointsBar } from './PointsBar'
import { positionsGained } from './PositionsGained'
import { resultsTable } from './ResultsTable'
import { seasonMatrix } from './SeasonMatrix'
import { seasonProgression } from './SeasonProgression'
import { driverStandings, teamStandings } from './Standings'

export const resultsWidgets: WidgetDef[] = [
  resultsTable,
  driverCard,
  headToHead,
  driverStandings,
  teamStandings,
  pointsBar,
  seasonProgression,
  seasonMatrix,
  positionsGained,
  gridVsFinish,
]
