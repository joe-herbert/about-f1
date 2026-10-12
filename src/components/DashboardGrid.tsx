import { useMemo } from 'react'
import { Responsive, WidthProvider, type Layouts } from 'react-grid-layout'
import { LayoutGrid } from 'lucide-react'
import { COLS, useActiveDashboard, useStore } from '../store'
import { WidgetFrame } from './WidgetFrame'

const Grid = WidthProvider(Responsive)
const BREAKPOINTS = { lg: 1180, md: 720, sm: 0 }

interface Props {
  onSettings: (id: string) => void
  onMaximize: (id: string) => void
  onAdd: () => void
}

export function DashboardGrid({ onSettings, onMaximize, onAdd }: Props) {
  const dash = useActiveDashboard()
  const locked = useStore((s) => s.locked)
  const setLayouts = useStore((s) => s.setLayouts)
  const compact = useStore((s) => s.prefs.density === 'compact')
  const ids = useMemo(() => Object.keys(dash.widgets), [dash.widgets])

  if (!ids.length) {
    return (
      <div className="empty-dash">
        <LayoutGrid size={28} strokeWidth={1.5} />
        <p>This dashboard is empty. Add panels to build it, then drag and resize them however you like.</p>
        <button type="button" className="btn primary" onClick={onAdd}>
          Add a panel
        </button>
      </div>
    )
  }

  return (
    <Grid
      key={dash.id}
      className="grid"
      layouts={dash.layouts}
      breakpoints={BREAKPOINTS}
      cols={COLS}
      rowHeight={compact ? 24 : 30}
      margin={compact ? [8, 8] : [12, 12]}
      containerPadding={[0, 0]}
      draggableHandle=".drag-handle"
      isDraggable={!locked}
      isResizable={!locked}
      resizeHandles={['se']}
      onLayoutChange={(_current, all: Layouts) => setLayouts(all)}
      useCSSTransforms
    >
      {ids.map((id) => (
        <div key={id}>
          <WidgetFrame instance={dash.widgets[id]} onSettings={() => onSettings(id)} onMaximize={() => onMaximize(id)} />
        </div>
      ))}
    </Grid>
  )
}
