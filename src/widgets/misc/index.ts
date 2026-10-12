import type { WidgetDef } from '../types'
import { calendar } from './Calendar'
import { compoundUsage } from './CompoundUsage'
import { notes } from './Notes'
import { pitStops } from './PitStops'
import { raceControl } from './RaceControl'
import { speedTrap } from './SpeedTrap'
import { statTile } from './StatTile'
import { teamRadio } from './TeamRadio'
import { telemetry } from './Telemetry'
import { trackMap } from './TrackMap'
import { tyreDegradation } from './TyreDegradation'
import { tyreStrategy } from './TyreStrategy'
import { weather } from './Weather'
import { weatherNow } from './WeatherNow'
import { windRose } from './WindRose'
import './misc.css'

export const miscWidgets: WidgetDef[] = [
  tyreStrategy,
  pitStops,
  tyreDegradation,
  compoundUsage,
  telemetry,
  trackMap,
  speedTrap,
  weather,
  weatherNow,
  windRose,
  raceControl,
  teamRadio,
  statTile,
  calendar,
  notes,
]
