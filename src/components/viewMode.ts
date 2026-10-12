import { createContext, useContext } from 'react'

export type ViewMode = 'chart' | 'table'
export const ViewModeContext = createContext<ViewMode>('chart')
export const useViewMode = () => useContext(ViewModeContext)

/** Lets a chart tell its panel frame that a table view is available. */
export const TableCapabilityContext = createContext<(has: boolean) => void>(() => {})
export const useTableCapability = () => useContext(TableCapabilityContext)
