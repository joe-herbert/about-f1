import { create } from 'zustand'
import { createJSONStorage, type PersistStorage, type StorageValue } from 'zustand/middleware'
import { createAuthClient } from 'better-auth/client'
import { emailOTPClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'
import { loadInstalledPlugins } from '../widgets/plugins'
import { useStore, type PersistedState } from './index'

// Signed out, dashboards and preferences live in localStorage as before. Signed in,
// the store persists to the account instead (/api/settings), so the same setup
// follows you to any browser. Signing out goes back to this browser's own setup.

export const authClient = createAuthClient({ plugins: [emailOTPClient(), passkeyClient()] })

export interface AccountUser {
  id: string
  email: string
}

/** idle: signed out. saving/saved/error: state of the last write to the account. */
export type SyncState = 'idle' | 'saving' | 'saved' | 'error'

export const useAccount = create<{ user: AccountUser | null; sync: SyncState }>(() => ({ user: null, sync: 'idle' }))

/** Tells the guide pages there's an account to load favourites and the theme from, so signed-out visits make no API calls. */
const ACCOUNT_HINT_KEY = 'f1-account'
useAccount.subscribe((s, prev) => {
  if (!!s.user === !!prev.user) return
  try {
    if (s.user) localStorage.setItem(ACCOUNT_HINT_KEY, '1')
    else localStorage.removeItem(ACCOUNT_HINT_KEY)
  } catch {
    // Storage blocked: the guide stays signed out.
  }
})

type Saved = StorageValue<PersistedState>

const API = '/api/settings'
const GUIDE_FAVOURITES_KEY = 'guide-favourites'
const SAVE_DELAY = 1000
const RETRY_DELAY = 10_000

const browserStorage = createJSONStorage<PersistedState>(() => localStorage)!

/** Latest unsaved value. Store changes come in bursts (dragging a panel), so writes are debounced. */
let pending: Saved | null = null
let timer: ReturnType<typeof setTimeout> | undefined
/** Writes run one at a time so an older one can't land after a newer one. */
let queue: Promise<void> = Promise.resolve()
/** The account's settings as last read or written, to tell when another device changed them. */
let lastSynced = ''
/** A fetched value for the next rehydrate to use rather than fetching again. */
let prefetched: Saved | null = null

async function fetchSaved(): Promise<Saved | null> {
  const r = await fetch(API, { cache: 'no-store' })
  if (!r.ok) throw new Error(`Couldn’t load your saved settings (${r.status})`)
  const { settings } = (await r.json()) as { settings: Saved | null }
  lastSynced = settings ? JSON.stringify(settings) : ''
  return settings
}

function put(value: Saved, keepalive = false) {
  const body = JSON.stringify(value)
  return fetch(API, { method: 'PUT', headers: { 'content-type': 'application/json' }, body, keepalive }).then((r) => {
    if (!r.ok) throw new Error(`Couldn’t save your settings (${r.status})`)
    lastSynced = body
  })
}

function save(): Promise<void> {
  clearTimeout(timer)
  queue = queue.then(async () => {
    const value = pending
    if (!value) return
    pending = null
    useAccount.setState({ sync: 'saving' })
    try {
      await put(value)
      if (!pending) useAccount.setState({ sync: 'saved' })
    } catch (e) {
      console.error('[account]', e)
      pending ??= value
      useAccount.setState({ sync: 'error' })
      timer = setTimeout(() => void save(), RETRY_DELAY)
    }
  })
  return queue
}

const accountStorage: PersistStorage<PersistedState> = {
  getItem: () => {
    const value = prefetched
    prefetched = null
    return value ?? fetchSaved()
  },
  setItem: (_name, value) => {
    pending = value
    clearTimeout(timer)
    timer = setTimeout(() => void save(), SAVE_DELAY)
  },
  removeItem: async () => {
    pending = null
    await fetch(API, { method: 'DELETE' })
  },
}

function currentSaved(): Saved {
  const { partialize, version = 0 } = useStore.persist.getOptions()
  return { state: partialize!(useStore.getState()) as PersistedState, version }
}

async function switchToAccount(user: AccountUser) {
  const saved = await fetchSaved()
  useStore.persist.setOptions({ storage: accountStorage })
  if (saved) {
    prefetched = saved
    await useStore.persist.rehydrate()
  } else {
    // First sign-in: what's set up in this browser becomes the account's.
    pending = currentSaved()
    await save()
    await copyGuideFavourites()
  }
  useAccount.setState({ user, sync: 'saved' })
}

/** The guide's favourites (see plugins/guide/client/guide.js) go along with the first sign-in too. */
async function copyGuideFavourites() {
  try {
    const local = JSON.parse(localStorage.getItem(GUIDE_FAVOURITES_KEY) || '[]') as { u: string; t: string; s: string }[]
    if (!Array.isArray(local) || !local.length) return
    const favourites = local.map((f) => ({ url: f.u, title: f.t, section: f.s }))
    const r = await fetch('/api/favourites', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ favourites }) })
    if (!r.ok) throw new Error(`Couldn’t copy guide favourites (${r.status})`)
  } catch (e) {
    console.error('[account]', e)
  }
}

async function switchToBrowser() {
  useStore.persist.setOptions({ storage: browserStorage })
  if (localStorage.getItem(useStore.persist.getOptions().name!)) await useStore.persist.rehydrate()
  // Never used signed out in this browser: start from the starter dashboards, not the account's.
  else useStore.setState(useStore.getInitialState(), true)
  lastSynced = ''
  useAccount.setState({ user: null, sync: 'idle' })
}

/** Before first render: if there's a session, load the account's settings. */
export async function initAccount() {
  try {
    const { data } = await authClient.getSession()
    if (data) await switchToAccount(data.user)
    else localStorage.removeItem(ACCOUNT_HINT_KEY)
  } catch (e) {
    // No API (or it's down): carry on with this browser's settings.
    console.error('[account]', e)
  }
}

/** After a successful sign-in. */
export async function signedIn(user: AccountUser) {
  await switchToAccount(user)
  loadInstalledPlugins()
}

export async function signOut() {
  await save()
  await authClient.signOut()
  await switchToBrowser()
  loadInstalledPlugins()
}

/**
 * Deletes the account and everything saved to it, then goes back to this browser's
 * own setup. Needs a sign-in from the last day: otherwise the error code is
 * `SESSION_EXPIRED`, and signing in again (same email) makes it work.
 */
export async function deleteAccount(): Promise<{ code?: string; message?: string } | null> {
  await save()
  const { error } = await authClient.deleteUser()
  if (error) return error
  pending = null
  clearTimeout(timer)
  await switchToBrowser()
  loadInstalledPlugins()
  return null
}

// Don't lose the last change when the tab closes or goes to the background.
document.addEventListener('visibilitychange', () => {
  if (!useAccount.getState().user) return
  if (document.visibilityState === 'hidden') {
    const value = pending
    if (!value) return
    clearTimeout(timer)
    pending = null
    void put(value, true).catch(() => void (pending ??= value))
  } else if (!pending) {
    // Coming back: pick up changes made on another device or tab meanwhile.
    void fetchSavedIfChanged()
  }
})

async function fetchSavedIfChanged() {
  const before = lastSynced
  try {
    const saved = await fetchSaved()
    if (!saved || lastSynced === before || pending) return
    prefetched = saved
    await useStore.persist.rehydrate()
    loadInstalledPlugins()
  } catch (e) {
    console.error('[account]', e)
  }
}
