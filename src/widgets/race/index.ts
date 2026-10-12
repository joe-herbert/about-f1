import type { WidgetDef } from '../types'
import { consistency } from './Consistency'
import { fastestLaps } from './FastestLaps'
import { gapChart } from './GapChart'
import { lapChartTable } from './LapChartTable'
import { lapDistribution } from './LapDistribution'
import { lapHeatmap } from './LapHeatmap'
import { lapTimes } from './LapTimes'
import { overtakes } from './Overtakes'
import { positionChart } from './PositionChart'
import { raceTrace } from './RaceTrace'
import { sectorComparison } from './SectorComparison'
import { timingTower } from './TimingTower'

export const raceWidgets: WidgetDef[] = [
  lapTimes,
  timingTower,
  positionChart,
  gapChart,
  raceTrace,
  overtakes,
  lapDistribution,
  lapHeatmap,
  fastestLaps,
  sectorComparison,
  consistency,
  lapChartTable,
]
