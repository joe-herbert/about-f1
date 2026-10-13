// Read power unit usage and penalties from the FIA's documents into the database.
// `npm run scrape:pu -- 2025 2026` (no seasons = the current one). Safe to re-run: documents already read are skipped.

import { migratePowerUnitTables, pool } from '../server/db.ts'
import { scrapeQueued } from '../server/fia/scrape.ts'

const seasons = process.argv.slice(2).map(Number)
if (seasons.some((s) => !Number.isInteger(s))) {
  console.error('Usage: npm run scrape:pu -- [season…]')
  process.exit(1)
}

await migratePowerUnitTables()
let failed = false
for (const season of seasons.length ? seasons : [new Date().getUTCFullYear()]) {
  try {
    // Waits for a scrape the server is running to finish first.
    const r = await scrapeQueued(season, { waitSeconds: 3600, log: (s) => console.log(`  ${s}`) })
    if (!r) throw new Error('Another scrape held the lock for an hour')
    console.log(
      `${season}: checked ${r.events} events, read ${r.documents} documents` +
        (r.errors ? `, ${r.errors} unreadable (see warnings)` : '') +
        (r.failed ? `, ${r.failed} not downloaded (run again to retry)` : ''),
    )
    if (r.failed) failed = true
  } catch (err) {
    failed = true
    console.error(`${season}: ${err instanceof Error ? err.message : err}`)
  }
}
pool.end()
process.exit(failed ? 1 : 0)
