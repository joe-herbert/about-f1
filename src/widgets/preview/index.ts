import type { WidgetDef } from '../types'
import { previewCircuitFacts } from './CircuitFacts'
import { previewCircuitForm } from './CircuitForm'
import { previewLastRace } from './LastRaceHere'
import { previewTitleFight } from './TitleFight'
import { previewWeekend } from './Weekend'

/** Panels for a race that hasn't happened yet: the weekend ahead and what happened at the circuit before. */
export const previewWidgets: WidgetDef[] = [previewWeekend, previewCircuitFacts, previewLastRace, previewCircuitForm, previewTitleFight]
