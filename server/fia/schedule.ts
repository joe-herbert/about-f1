import { config } from '../config.ts'
import { scrapeQueued } from './scrape.ts'

/** Keep the current season's power unit data fresh: once shortly after start, then on an interval. */
export function startPowerUnitSync() {
  if (!config.fiaScrape) return
  const run = async () => {
    const season = new Date().getUTCFullYear()
    try {
      // If a backfill from the command line is running, skip this round rather than queue behind it.
      const r = await scrapeQueued(season)
      if (r?.documents) console.log(`[fia] ${season}: read ${r.documents} new document${r.documents === 1 ? '' : 's'}${r.errors ? `, ${r.errors} unreadable` : ''}`)
      if (r?.failed) console.warn(`[fia] ${season}: ${r.failed} document${r.failed === 1 ? '' : 's'} not downloaded, will retry`)
    } catch (err) {
      console.warn(`[fia] ${season}: ${err instanceof Error ? err.message : err}`)
    }
  }
  setTimeout(run, 5_000).unref()
  setInterval(run, config.fiaScrapeMinutes * 60_000).unref()
}
