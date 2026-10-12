import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { createMiddleware } from 'hono/factory'
import { emailOTP } from 'better-auth/plugins'
import { config } from './config.ts'
import { db } from './db.ts'
import { sendSignInCode } from './mail.ts'

/** Set by the server from the connection (see index.ts), for rate limiting per client. */
export const CLIENT_IP_HEADER = 'x-f1-client-ip'

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
        if (type === 'sign-in') await sendSignInCode(email, otp)
      },
    }),
    passkey({
      rpID: new URL(config.appUrl).hostname,
      rpName: 'About F1',
      origin: config.appUrl,
    }),
  ],
})

export type UserEnv = { Variables: { userId: string } }

/** Rejects requests without a session; sets `userId` for the route. */
export const requireUser = createMiddleware<UserEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Not signed in' }, 401)
  c.set('userId', session.user.id)
  await next()
})
