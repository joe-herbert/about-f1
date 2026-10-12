import { Kysely, MysqlDialect, sql, type Generated } from 'kysely'
import { createPool } from 'mysql2'
import { config } from './config.ts'

/** Tables this app owns. Better Auth manages its own (user, session, account, verification, passkey). */
export interface Database {
  user_settings: {
    user_id: string
    /** The persisted dashboard store: `{ state, version }` */
    data: string
    updated_at: Generated<Date>
  }
  guide_favourite: {
    user_id: string
    /** Guide page path, e.g. /guide/flags/blue-flags/ */
    url: string
    title: string
    section: string
    created_at: Generated<Date>
  }
}

export const pool = createPool({ uri: config.databaseUrl, connectionLimit: 10, timezone: 'Z' })

export const db = new Kysely<Database>({ dialect: new MysqlDialect({ pool }) })

/** Create this app's tables (deleting a user deletes their rows). Runs after Better Auth's migrations, as it references `user`. */
export async function migrateAppTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id VARCHAR(36) NOT NULL PRIMARY KEY,
      data JSON NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT user_settings_user FOREIGN KEY (user_id) REFERENCES \`user\` (id) ON DELETE CASCADE
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS guide_favourite (
      user_id VARCHAR(36) NOT NULL,
      url VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      section VARCHAR(255) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id, url),
      CONSTRAINT guide_favourite_user FOREIGN KEY (user_id) REFERENCES \`user\` (id) ON DELETE CASCADE
    )
  `.execute(db)
}
