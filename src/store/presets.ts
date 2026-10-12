import type { Layout } from 'react-grid-layout'
import type { Dashboard, OptionValue, WidgetInstance } from './index'

type Item = [type: string, x: number, y: number, w: number, h: number, options?: Record<string, OptionValue>, title?: string]

const rid = () => Math.random().toString(36).slice(2, 10)

function build(name: string, items: Item[]): Dashboard {
  const widgets: Record<string, WidgetInstance> = {}
  const lg: Layout[] = []
  for (const [type, x, y, w, h, options = {}, title] of items) {
    const id = rid()
    widgets[id] = { id, type, options, title }
    lg.push({ i: id, x, y, w, h, minW: 2, minH: 3 })
  }
  return { id: rid(), name, layouts: { lg }, widgets }
}

/** All-time records: titles, wins, careers and circuit history (1950 onward). */
export function recordsDashboard(): Dashboard {
  return build('Records', [
    ['hist-circuit', 0, 0, 12, 14],
    ['hist-season-summary', 12, 0, 12, 14],
    ['hist-champions', 0, 14, 12, 14],
    ['hist-all-time', 12, 14, 12, 14],
    ['hist-driver-career', 0, 28, 24, 14],
    ['hist-teammates', 0, 42, 12, 14],
    ['hist-constructor-career', 12, 42, 12, 14],
  ])
}

/** A driver card for each of the session's drivers (22), four per row, in championship order at the selected session. */
export function driversDashboard(): Dashboard {
  return build(
    'Drivers',
    Array.from({ length: 22 }, (_, i): Item => ['driver-card', (i % 4) * 6, Math.floor(i / 4) * 12, 6, 12, { rank: i + 1, showPhoto: true }]),
  )
}

export function defaultDashboards(): Dashboard[] {
  return [
    build('Race overview', [
      ['stat-tile', 0, 0, 4, 4, { metric: 'winner' }],
      ['stat-tile', 4, 0, 4, 4, { metric: 'fastest-lap' }],
      ['stat-tile', 8, 0, 4, 4, { metric: 'overtakes' }],
      ['stat-tile', 12, 0, 4, 4, { metric: 'pit-stops' }],
      ['stat-tile', 16, 0, 4, 4, { metric: 'safety-cars' }],
      ['stat-tile', 20, 0, 4, 4, { metric: 'track-temp' }],
      ['timing-tower', 0, 4, 8, 20],
      ['position-chart', 8, 4, 16, 12],
      ['tyre-strategy', 8, 16, 16, 12],
      ['gap-chart', 0, 28, 12, 11],
      ['race-control', 12, 28, 12, 11],
      ['positions-gained', 0, 39, 8, 12],
      ['pit-stops', 8, 39, 8, 12],
      ['overtakes', 16, 39, 8, 12],
    ]),
    build('Lap analysis', [
      ['lap-times', 0, 0, 16, 12],
      ['fastest-laps', 16, 0, 8, 12],
      ['lap-distribution', 0, 12, 12, 11],
      ['race-trace', 12, 12, 12, 11],
      ['lap-heatmap', 0, 23, 24, 12],
      ['sector-comparison', 0, 35, 12, 10],
      ['consistency', 12, 35, 6, 10],
      ['tyre-degradation', 18, 35, 6, 10],
    ]),
    build('Telemetry', [
      ['telemetry', 0, 0, 16, 18],
      ['track-map', 16, 0, 8, 10, { color: 'speed' }],
      ['track-map', 16, 10, 8, 8, { color: 'dominance' }, 'Track dominance'],
      ['head-to-head', 0, 18, 12, 14],
      ['speed-trap', 12, 18, 6, 14],
      ['driver-card', 18, 18, 6, 14],
    ]),
    build('Championship', [
      ['driver-standings', 0, 0, 8, 16],
      ['season-progression', 8, 0, 16, 16],
      ['team-standings', 0, 16, 8, 11],
      ['points-bar', 8, 16, 16, 11, { kind: 'teams' }],
      ['season-matrix', 0, 27, 24, 14],
    ]),
    build('Conditions', [
      ['weather-now', 0, 0, 24, 5],
      ['weather', 0, 5, 12, 10, { metric: 'track_temperature' }],
      ['weather', 12, 5, 12, 10, { metric: 'humidity' }],
      ['wind-rose', 0, 15, 8, 12],
      ['team-radio', 8, 15, 8, 12],
      ['calendar', 16, 15, 8, 12],
    ]),
    driversDashboard(),
    recordsDashboard(),
  ]
}
