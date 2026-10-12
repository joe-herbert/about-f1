import { useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'
import { authClient, deleteAccount, signedIn, signOut, useAccount, type SyncState } from '../store/account'
import { Drawer } from './Drawer'

type Passkey = { id: string; name?: string | null; createdAt: string | Date }

/** The browser closing its own passkey prompt isn't worth an error message. */
const CANCELLED = new Set(['AUTH_CANCELLED', 'ERROR_CEREMONY_ABORTED'])

const SYNC_LABEL: Record<SyncState, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'All changes saved.',
  error: 'Couldn’t save your latest changes. Retrying shortly; check you’re still signed in.',
}

function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Passkey'
}

/** Runs an async action with a busy flag; a returned string or a thrown error becomes `error`. */
function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setError('')
    try {
      const msg = await fn()
      if (msg) setError(msg)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>Code</span>
      <input
        type="text"
        className="otp-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
    </label>
  )
}

function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const { busy, error, setError, run } = useAction()

  // Offer saved passkeys in the email field's autofill.
  useEffect(() => {
    let live = true
    void (async () => {
      if (!(await window.PublicKeyCredential?.isConditionalMediationAvailable?.())) return
      const res = await authClient.signIn.passkey({ autoFill: true })
      if (live && res.data) await signedIn(res.data.user)
    })()
    return () => void (live = false)
  }, [])

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault()
    return run(async () => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'sign-in' })
      if (error) return error.message ?? 'Couldn’t send a code to that address.'
      setCode('')
      setStep('code')
    })
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    return run(async () => {
      const { data, error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() })
      if (!data) return error?.message ?? 'That code didn’t work.'
      await signedIn(data.user)
    })
  }

  const passkey = () =>
    run(async () => {
      const res = await authClient.signIn.passkey()
      if (res.data) return void (await signedIn(res.data.user))
      const err = res.error as { code?: string; message?: string }
      if (!CANCELLED.has(err.code ?? '')) return err.message ?? 'Couldn’t sign in with that passkey.'
    })

  if (step === 'code') {
    return (
      <form className="settings" onSubmit={verify}>
        <p className="settings-desc">
          We sent a 6-digit code to <strong>{email.trim()}</strong>. It expires in 5 minutes.
        </p>
        <CodeInput value={code} onChange={setCode} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary" disabled={busy || code.length !== 6}>
          Sign in
        </button>
        <div className="account-links">
          <button type="button" className="link-btn" disabled={busy} onClick={() => sendCode()}>
            Send a new code
          </button>
          <button type="button" className="link-btn" onClick={() => (setStep('email'), setError(''))}>
            Use a different email
          </button>
        </div>
      </form>
    )
  }

  return (
    <div className="settings">
      <p className="settings-desc">
        Sign in to save your dashboards and preferences to an account, so they follow you to any browser. There’s no password: we email you a code, or you use a passkey.
      </p>
      <form className="settings" onSubmit={sendCode}>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username webauthn" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          Email me a code
        </button>
      </form>
      <div className="account-or">or</div>
      <button type="button" className="btn" disabled={busy} onClick={passkey}>
        <KeyRound size={15} />
        Sign in with a passkey
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}

function Passkeys() {
  const [list, setList] = useState<Passkey[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const { data } = await authClient.passkey.listUserPasskeys()
    setList((data as Passkey[] | null) ?? [])
  }
  useEffect(() => void load(), [])

  const add = async () => {
    setBusy(true)
    setError('')
    const res = await authClient.passkey.addPasskey({ name: deviceName() })
    const err = res.error as { code?: string; message?: string } | null
    if (err && !CANCELLED.has(err.code ?? '')) setError(err.message ?? 'Couldn’t add the passkey.')
    await load()
    setBusy(false)
  }

  const remove = async (p: Passkey) => {
    if (!confirm(`Remove the passkey “${p.name || 'Passkey'}”? You can still sign in with an email code.`)) return
    await authClient.passkey.deletePasskey({ id: p.id })
    await load()
  }

  return (
    <fieldset className="fieldset">
      <legend>Passkeys</legend>
      <p className="settings-desc">
        Sign in with your fingerprint, face or device PIN instead of waiting for an email.
      </p>
      {list && list.length > 0 && (
        <ul className="passkey-list">
          {list.map((p) => (
            <li key={p.id}>
              <KeyRound size={15} aria-hidden />
              <span>
                {p.name || 'Passkey'}
                <small>Added {new Date(p.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small>
              </span>
              <button type="button" className="icon-btn danger" aria-label={`Remove ${p.name || 'passkey'}`} title="Remove" onClick={() => remove(p)}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" className="btn" disabled={busy || !list} onClick={add}>
        <KeyRound size={15} />
        {list?.length ? 'Add another passkey' : 'Add a passkey'}
      </button>
    </fieldset>
  )
}

function DeleteAccount({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'code'>('idle')
  const [code, setCode] = useState('')
  const { busy, error, setError, run } = useAction()

  const remove = () =>
    run(async () => {
      const err = await deleteAccount()
      if (!err) return onDeleted()
      if (err.code !== 'SESSION_EXPIRED') return err.message ?? 'Couldn’t delete your account.'
      // Signed in over a day ago: confirm it's them with a fresh code first.
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
      if (error) return error.message ?? 'Couldn’t send a code.'
      setCode('')
      setStep('code')
    })

  const confirmCode = (e: FormEvent) => {
    e.preventDefault()
    return run(async () => {
      const { data, error } = await authClient.signIn.emailOtp({ email, otp: code })
      if (!data) return error?.message ?? 'That code didn’t work.'
      const err = await deleteAccount()
      if (err) return err.message ?? 'Couldn’t delete your account.'
      onDeleted()
    })
  }

  const cancel = () => {
    setStep('idle')
    setError('')
  }

  return (
    <fieldset className="fieldset">
      <legend>Delete account</legend>
      {step === 'idle' && (
        <>
          <p className="settings-desc">Permanently delete your account and everything saved to it.</p>
          <button type="button" className="btn danger" onClick={() => setStep('confirm')}>
            Delete account…
          </button>
        </>
      )}
      {step === 'confirm' && (
        <>
          <p className="settings-desc">
            This deletes your account, your saved dashboards and preferences, your guide favourites and your passkeys. It can’t be undone. This browser goes back to the setup it had before you signed in.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="account-actions">
            <button type="button" className="btn danger" disabled={busy} onClick={remove}>
              Delete my account
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={cancel}>
              Cancel
            </button>
          </div>
        </>
      )}
      {step === 'code' && (
        <form className="settings" onSubmit={confirmCode}>
          <p className="settings-desc">
            To confirm it’s you, enter the code we just sent to <strong>{email}</strong>.
          </p>
          <CodeInput value={code} onChange={setCode} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="account-actions">
            <button type="submit" className="btn danger" disabled={busy || code.length !== 6}>
              Delete my account
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={cancel}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </fieldset>
  )
}

export function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAccount((s) => s.user)
  const sync = useAccount((s) => s.sync)
  const [leaving, setLeaving] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const close = () => {
    setDeleted(false)
    onClose()
  }

  return (
    <Drawer open={open} title={user ? 'Account' : 'Sign in'} onClose={close}>
      {user ? (
        <div className="settings">
          <p className="settings-desc">
            Signed in as <strong>{user.email}</strong>. Your dashboards and preferences are saved to your account.{' '}
            <span className={sync === 'error' ? 'form-error' : undefined} role="status">
              {SYNC_LABEL[sync]}
            </span>
          </p>
          <Passkeys />
          <fieldset className="fieldset">
            <legend>Sign out</legend>
            <p className="settings-desc">This browser goes back to the dashboards it had before you signed in.</p>
            <button
              type="button"
              className="btn"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true)
                try {
                  await signOut()
                } finally {
                  setLeaving(false)
                }
              }}
            >
              Sign out
            </button>
          </fieldset>
          <DeleteAccount email={user.email} onDeleted={() => setDeleted(true)} />
        </div>
      ) : (
        <>
          {deleted && (
            <p className="account-notice" role="status">
              Your account has been deleted.
            </p>
          )}
          <SignIn />
        </>
      )}
    </Drawer>
  )
}
