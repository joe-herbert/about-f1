import type { WidgetDef } from '../types'
import { histCircuit } from './race-Circuit'
import { histAllTime } from './season-AllTime'
import { histChampions } from './season-Champions'
import { histConstructorCareer } from './season-ConstructorCareer'
import { histDriverCareer } from './season-DriverCareer'
import { histSeasonSummary } from './season-Summary'
import { histTeammates } from './season-Teammates'

/** All-time and cross-season panels (titles, wins, careers, circuit history). */
export const historyWidgets: WidgetDef[] = [
  histSeasonSummary,
  histTeammates,
  histChampions,
  histAllTime,
  histDriverCareer,
  histConstructorCareer,
  histCircuit,
]
