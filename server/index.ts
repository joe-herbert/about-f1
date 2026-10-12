import { readFile } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { serveStatic } from '@hono/node-server/serve-static'
import { getMigrations } from 'better-auth/db/migration'
import { Hono, type Context } from 'hono'
import { logger } from 'hono/logger'
import { auth, CLIENT_IP_HEADER } from './auth.ts'
import { config, production } from './config.ts'
import { migrateAppTables } from './db.ts'
import { favourites } from './favourites.ts'
import { settings } from './settings.ts'

// Bring the schema up to date: Better Auth's tables, then ours.
const { runMigrations } = await getMigrations(auth.options)
await runMigrations()
await migrateAppTables()

function clientIp(c: Context): string {
  const forwarded = config.trustProxy ? c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() : undefined
  return forwarded || getConnInfo(c).remote.address || ''
}

const app = new Hono()
app.use('/api/*', logger())

app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  // Overwrites anything the client sent under this name.
  c.req.raw.headers.set(CLIENT_IP_HEADER, clientIp(c))
  return auth.handler(c.req.raw)
})
app.route('/api/settings', settings)
app.route('/api/favourites', favourites)
app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

// In production this server also serves the built site (`npm run build`).
// In development Vite serves it and proxies /api here.
if (production) {
  const dist = new URL('../dist/', import.meta.url).pathname
  app.use('/*', serveStatic({ root: dist }))
  app.get('/guide/*', async (c) => c.html(await readFile(`${dist}guide/404.html`, 'utf8'), 404))
  app.get('*', async (c) => c.html(await readFile(`${dist}index.html`, 'utf8')))
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}${production ? '' : ` (open ${config.appUrl})`}`)
})
