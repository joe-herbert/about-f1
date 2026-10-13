import { AsyncLocalStorage } from 'node:async_hooks'
import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { createMiddleware } from 'hono/factory'
import { emailOTP } from 'better-auth/plugins'
import { config } from './config.ts'
import { db } from './db.ts'
import { sendSignInCode } from './mail.ts'

/** Set by the server from the connection (see index.ts), for rate limiting per client. */
export const CLIENT_IP_HEADER = 'x-f1-client-ip'

/**
 * Better Auth logs and swallows errors from sendVerificationOTP, answering as if
 * the code went out. The request notes a failed send here so handleAuth can say so.
 */
const mailStatus = new AsyncLocalStorage<{ failed: boolean }>()

// No passwords: people sign in with a code emailed to them (which also creates the
// account), then can add passkeys for quicker sign-ins.
export const auth = betterAuth({
  appName: 'About F1',
  baseURL: config.appUrl,
  basePath: '/api/auth',
  secret: config.secret,
  database: { db, type: 'mysql' },
  trustedOrigins: [config.appUrl],
  advanced: {
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
  },
  // Deleting needs a session from the last day (session.freshAge); the app asks
  // for a fresh emailed code first if it's older.
  user: { deleteUser: { enabled: true } },
  session: {
    expiresIn: 60 * 60 * 24 * 60,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 5 * 60,
      allowedAttempts: 5,
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== 'sign-in') return
        try {
          await sendSignInCode(email, otp)
        } catch (err) {
          console.error(`Couldn't email a code to ${email}:`, err)
          const status = mailStatus.getStore()
          if (status) status.failed = true
        }
      },
    }),
    passkey({
      rpID: new URL(config.appUrl).hostname,
      rpName: 'About F1',
      origin: config.appUrl,
    }),
  ],
})

/** Better Auth's handler, but a sign-in code that couldn't be emailed is an error. */
export async function handleAuth(req: Request): Promise<Response> {
  const status = { failed: false }
  const res = await mailStatus.run(status, () => auth.handler(req))
  if (!status.failed) return res
  return Response.json(
    { code: 'EMAIL_NOT_SENT', message: 'We couldn’t send the email. Try again in a minute.' },
    { status: 502 },
  )
}

export type UserEnv = { Variables: { userId: string } }

/** Rejects requests without a session; sets `userId` for the route. */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Not signed in' }, 401)
  c.set('userId', session.user.id)
  await next()
})
