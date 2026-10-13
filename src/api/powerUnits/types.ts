/** GET /api/power-units?season= (server/powerUnits.ts), read from the FIA's published documents. */
export interface PowerUnitSeason {
  season: number
  /** Nothing was stored for this season, so the server has started reading it; ask again in a few minutes */
  scraping: boolean
  /** When the FIA site was last checked */
  updatedAt: string | null
  /** Documents that couldn't be read */
  unreadDocuments: number
  elements: { code: string; name: string; allowance: number | null }[]
  /** In the order they happened */
  events: { id: number; name: string; start: string; end: string }[]
  drivers: { number: number; name: string; car: string }[]
  /** "PU Elements used per Driver up to now": totals at the start of an event, rows in the FIA's (team by team) order */
  tables: { event: number; at: string; rows: { number: number; used: Record<string, number> }[] }[]
  /**
   * One per new element fitted: this was the driver's nth of the kind this season. From the technical
   * delegate's "New PU elements" reports, or a stewards' decision (parc fermé changes appear only there,
   * and the stewards repeat elements the technical delegate reported, so the same element can appear twice).
   */
  changes: { event: number; at: string; number: number; element: string; nth: number; allowance: number | null; source: 'technical' | 'stewards'; url: string }[]
  penalties: {
    event: number
    at: string
    number: number
    driver: string
    /** As the stewards wrote them, e.g. "5th Engine (ICE)" */
    elements: string[]
    decision: string
    gridPlaces: number | null
    backOfGrid: boolean
    pitLane: boolean
    url: string
  }[]
}
