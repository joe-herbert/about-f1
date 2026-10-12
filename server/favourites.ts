import { Hono } from 'hono'
import { requireUser, type UserEnv } from './auth.ts'
import { db } from './db.ts'

/** Guide pages a signed-in person has starred, newest first. */
export const favourites = new Hono<UserEnv>()

favourites.use(requireUser)

const MAX = 500

interface Favourite {
  url: string
  title: string
  section: string
}

function parse(v: unknown): Favourite | null {
  const f = v as Partial<Favourite> | null
  const ok = (s: unknown) => typeof s === 'string' && s.length <= 255
  if (!f || !ok(f.url) || !ok(f.title) || !ok(f.section) || !f.url!.startsWith('/guide/')) return null
  return { url: f.url!, title: f.title!, section: f.section! }
}

const list = (userId: string) =>
  db.selectFrom('guide_favourite').select(['url', 'title', 'section']).where('user_id', '=', userId).orderBy('created_at', 'desc').execute()

favourites.get('/', async (c) => c.json({ favourites: await list(c.get('userId')) }))

/** Add one, or refresh its title and section if it's already there. */
favourites.post('/', async (c) => {
  const f = parse(await c.req.json().catch(() => null))
  if (!f) return c.json({ error: 'Expected { url: "/guide/…", title, section }' }, 400)
  const userId = c.get('userId')
  const { n } = await db.selectFrom('guide_favourite').select((e) => e.fn.countAll<number>().as('n')).where('user_id', '=', userId).executeTakeFirstOrThrow()
  if (Number(n) >= MAX) return c.json({ error: `At most ${MAX} favourites` }, 409)
  await db
    .insertInto('guide_favourite')
    .values({ user_id: userId, ...f })
    .onDuplicateKeyUpdate({ title: f.title, section: f.section })
    .execute()
  return c.body(null, 204)
})

favourites.delete('/', async (c) => {
  const url = c.req.query('url')
  if (!url) return c.json({ error: 'Expected ?url=' }, 400)
  await db.deleteFrom('guide_favourite').where('user_id', '=', c.get('userId')).where('url', '=', url).execute()
  return c.body(null, 204)
})

/** Replace the whole list (newest first): copies a browser's favourites to a new account. */
favourites.put('/', async (c) => {
  const body = await c.req.json().catch(() => null)
  const items = Array.isArray(body?.favourites) ? body.favourites.map(parse) : null
  if (!items || items.includes(null) || items.length > MAX) return c.json({ error: 'Expected { favourites: [{ url, title, section }] }' }, 400)
  const userId = c.get('userId')
  const now = Date.now()
  await db.transaction().execute(async (tx) => {
    await tx.deleteFrom('guide_favourite').where('user_id', '=', userId).execute()
    // De-duplicate by URL, keeping the first (newest); spread the timestamps to keep the order.
    const seen = new Set<string>()
    const rows = (items as Favourite[])
      .filter((f) => !seen.has(f.url) && seen.add(f.url))
      .map((f, i) => ({ user_id: userId, ...f, created_at: new Date(now - i) }))
    if (rows.length) await tx.insertInto('guide_favourite').values(rows).execute()
  })
  return c.body(null, 204)
})
