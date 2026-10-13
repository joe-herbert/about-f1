// Settings from the environment (.env in development; see .env.example).

const env = process.env

export const production = env.NODE_ENV === 'production'

function required(name: string, fallback?: string): string {
  const v = env[name] || fallback
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`)
  return v
}

export const config = {
  port: Number(env.PORT || 3000),
  databaseUrl: required('DATABASE_URL', production ? undefined : 'mysql://f1stats:f1stats@localhost:3307/f1stats'),
  /** Origin people open the app at. Auth callbacks and passkeys are bound to it. */
  appUrl: required('APP_URL', production ? undefined : 'http://localhost:5173').replace(/\/$/, ''),
  secret: required('BETTER_AUTH_SECRET', production ? undefined : 'dev-only-secret-change-me-dev-only-secret'),
  /** Behind a reverse proxy: take the client IP from the last X-Forwarded-For hop. */
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
  smtpUrl: env.SMTP_URL || '',
  mailFrom: env.MAIL_FROM || 'About F1 <no-reply@aboutf1.com>',
  /** Read power unit usage from the FIA's documents (server/fia). 0 turns it off. */
  fiaScrape: env.FIA_SCRAPE !== '0' && env.FIA_SCRAPE !== 'false',
  /** Minutes between checks of the current season */
  fiaScrapeMinutes: Math.max(5, Number(env.FIA_SCRAPE_MINUTES || 30)),
}

if (production && !config.smtpUrl) throw new Error('SMTP_URL is not set, so sign-in codes could not be emailed.')
