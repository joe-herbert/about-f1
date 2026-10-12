import type { ComponentType } from 'react'
import type { Session } from '../api/types'
import type { OptionValue, WidgetInstance } from '../store'

export type BuiltinCategory =
  | 'Results'
  | 'Race'
  | 'Laps'
  | 'Strategy'
  | 'Telemetry'
  | 'Championship'
  | 'Conditions'
  | 'Session'
  | 'Records'
  | 'Utility'

/** Plugins can use a built-in category or invent their own; new ones are listed after the built-ins. */
export type Category = BuiltinCategory | (string & {})

export interface Choice {
  value: string | number
  label: string
}

export type OptionSpec =
  | { key: string; label: string; type: 'select'; choices: Choice[]; default: string | number; help?: string }
  | { key: string; label: string; type: 'toggle'; default: boolean; help?: string }
  | { key: string; label: string; type: 'number'; default: number; min?: number; max?: number; step?: number; help?: string }
  | { key: string; label: string; type: 'text' | 'textarea'; default: string; help?: string }
  /** A season from 1950; 0 = follow the header */
  | { key: string; label: string; type: 'season'; default: number; help?: string }
  /** A Jolpica driverId (e.g. "senna"); '' = automatic */
  | { key: string; label: string; type: 'histDriver'; default: string; help?: string }
  /** A single driver from the widget's session; null = automatic */
  | { key: string; label: string; type: 'driver'; default: number | null; help?: string }
  /** Anything else: the widget supplies its own form control. The value must be JSON-serialisable. */
  | { key: string; label: string; type: 'custom'; default: OptionValue; Field: ComponentType<OptionFieldProps>; help?: string }

export interface OptionFieldProps {
  id: string
  label: string
  help?: string
  value: OptionValue
  onChange: (v: OptionValue) => void
  /** The session the panel is showing */
  sessionKey: number | null
}

export interface DriverFilter {
  selected: number[]
  mode: 'hide' | 'dim'
  /** false when the driver should be removed entirely */
  visible: (n: number) => boolean
  /** true when the driver should be drawn de-emphasised */
  dimmed: (n: number) => boolean
}

export interface WidgetProps {
  instance: WidgetInstance
  /** Options with defaults filled in */
  opts: Record<string, OptionValue>
  sessionKey: number | null
  session: Session | undefined
  year: number
  filter: DriverFilter
}

export interface WidgetDef {
  type: string
  name: string
  description: string
  category: Category
  defaultSize: { w: number; h: number }
  options: OptionSpec[]
  Component: ComponentType<WidgetProps>
  /** Uses the header driver filter (shows the per-widget driver override in settings) */
  usesDrivers?: boolean
  /** Earliest season with the data this panel needs (live timing 2023, lap timing 1996, pit stops 2011) */
  minYear?: number
  /** No title bar: the panel's own content carries its label; tools float on hover */
  bare?: boolean
  /** Works without a session (season-wide or static) */
  sessionless?: boolean
  /** Set by the registry: 'builtin', 'local' (src/widgets/custom) or the plugin URL it was loaded from */
  source?: string
}
