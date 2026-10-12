import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { sql } from 'kysely'
import { requireUser, type UserEnv } from './auth.ts'
import { db } from './db.ts'

const THEMES = ['system', 'light', 'dark']

/** The driver returns JSON columns as text (MariaDB stores them as LONGTEXT) but JSON expressions parsed. */
const fromJson = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)

/** A signed-in person's dashboards and preferences, stored as the client's persisted store. */
export const settings = new Hono<UserEnv>()

settings.use(requireUser)

settings.get('/', async (c) => {
  const row = await db.selectFrom('user_settings').select(['data', 'updated_at']).where('user_id', '=', c.get('userId')).executeTakeFirst()
  if (!row) return c.json({ settings: null })
  return c.json({ settings: fromJson(row.data), updatedAt: row.updated_at })
})

settings.put('/', bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: 'Settings are too large' }, 413) }), async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object' || typeof body.state !== 'object' || body.state === null || typeof body.version !== 'number') {
    return c.json({ error: 'Expected { state, version }' }, 400)
  }
  const data = JSON.stringify({ state: body.state, version: body.version })
  await db
    .insertInto('user_settings')
    .values({ user_id: c.get('userId'), data })
    .onDuplicateKeyUpdate({ data })
    .execute()
  return c.body(null, 204)
})

settings.delete('/', async (c) => {
  await db.deleteFrom('user_settings').where('user_id', '=', c.get('userId')).execute()
  return c.body(null, 204)
})

/** Just the preferences, for the guide pages (which don't load the dashboards). */
settings.get('/prefs', async (c) => {
  const row = await db
    .selectFrom('user_settings')
    .select(sql<unknown>`JSON_EXTRACT(data, '$.state.prefs')`.as('prefs'))
    .where('user_id', '=', c.get('userId'))
    .executeTakeFirst()
  return c.json({ prefs: fromJson(row?.prefs ?? null) })
})

/** Change preferences in place, so the guide doesn't have to rewrite the whole store. Only the theme for now. */
settings.patch('/prefs', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!THEMES.includes(body?.theme)) return c.json({ error: `Expected { theme: ${THEMES.join(' | ')} }` }, 400)
  const res = await db
    .updateTable('user_settings')
    .set({ data: sql`JSON_SET(data, '$.state.prefs.theme', ${body.theme})` })
    .where('user_id', '=', c.get('userId'))
    .executeTakeFirst()
  if (!res.numUpdatedRows) return c.json({ error: 'No saved settings yet' }, 404)
  return c.body(null, 204)
})
