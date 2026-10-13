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
  /** An event on the FIA's documents site (server/fia/scrape.ts) */
  fia_event: {
    id: number
    season: number
    name: string
    /** First and last document published, which date and order the events */
    first_doc_at: Date | null
    last_doc_at: Date | null
    /** When its document list was last read */
    checked_at: Date
  }
  /** A power unit document that's been read, whatever came of it */
  fia_document: {
    url: string
    event_id: number
    season: number
    kind: 'usage' | 'changes' | 'penalty'
    doc_number: number | null
    title: string
    published_at: Date
    /** Bumped when the parsers change, so older reads are redone */
    parser_version: number
    /** Why it couldn't be read, or null */
    error: string | null
  }
  /** Rows of "PU Elements used per Driver up to now": the season's totals at the start of an event */
  pu_usage: {
    url: string
    /** Row in the FIA's table (team by team) */
    position: number
    driver_number: number
    driver: string
    car: string
    element: string
    used: number
  }
  /** Rows of "New PU elements for this Competition" */
  pu_change: {
    url: string
    seq: number
    driver_number: number
    driver: string
    car: string
    element: string
    previous: number
    allowance: number | null
  }
  /** Stewards' decisions on power unit elements */
  pu_penalty: {
    url: string
    driver_number: number
    driver: string
    /** JSON array of the elements as stated, e.g. "5th Engine (ICE)" */
    elements: string
    decision: string
    grid_places: number | null
    back_of_grid: number
    pit_lane: number
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
  await migratePowerUnitTables()
}

/** The FIA power unit documents and what was read from them (server/fia). Rows hang off their document's URL. */
export async function migratePowerUnitTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS fia_event (
      id INT NOT NULL PRIMARY KEY,
      season SMALLINT NOT NULL,
      name VARCHAR(255) NOT NULL,
      first_doc_at DATETIME NULL,
      last_doc_at DATETIME NULL,
      checked_at DATETIME NOT NULL,
      KEY fia_event_season (season)
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS fia_document (
      url VARCHAR(255) NOT NULL PRIMARY KEY,
      event_id INT NOT NULL,
      season SMALLINT NOT NULL,
      kind VARCHAR(16) NOT NULL,
      doc_number INT NULL,
      title VARCHAR(255) NOT NULL,
      published_at DATETIME NOT NULL,
      parser_version INT NOT NULL,
      error TEXT NULL,
      KEY fia_document_season (season),
      CONSTRAINT fia_document_event FOREIGN KEY (event_id) REFERENCES fia_event (id) ON DELETE CASCADE
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS pu_usage (
      url VARCHAR(255) NOT NULL,
      position TINYINT UNSIGNED NOT NULL,
      driver_number TINYINT UNSIGNED NOT NULL,
      driver VARCHAR(100) NOT NULL,
      car VARCHAR(100) NOT NULL,
      element VARCHAR(16) NOT NULL,
      used TINYINT UNSIGNED NOT NULL,
      PRIMARY KEY (url, driver_number, element),
      CONSTRAINT pu_usage_document FOREIGN KEY (url) REFERENCES fia_document (url) ON DELETE CASCADE
    )
  `.execute(db)
  await sql`ALTER TABLE pu_usage ADD COLUMN IF NOT EXISTS position TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER url`.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS pu_change (
      url VARCHAR(255) NOT NULL,
      seq SMALLINT UNSIGNED NOT NULL,
      driver_number TINYINT UNSIGNED NOT NULL,
      driver VARCHAR(100) NOT NULL,
      car VARCHAR(100) NOT NULL,
      element VARCHAR(16) NOT NULL,
      previous TINYINT UNSIGNED NOT NULL,
      allowance TINYINT UNSIGNED NULL,
      PRIMARY KEY (url, seq),
      CONSTRAINT pu_change_document FOREIGN KEY (url) REFERENCES fia_document (url) ON DELETE CASCADE
    )
  `.execute(db)
  await sql`
    CREATE TABLE IF NOT EXISTS pu_penalty (
      url VARCHAR(255) NOT NULL PRIMARY KEY,
      driver_number TINYINT UNSIGNED NOT NULL,
      driver VARCHAR(100) NOT NULL,
      elements TEXT NOT NULL,
      decision TEXT NOT NULL,
      grid_places SMALLINT NULL,
      back_of_grid TINYINT(1) NOT NULL,
      pit_lane TINYINT(1) NOT NULL,
      CONSTRAINT pu_penalty_document FOREIGN KEY (url) REFERENCES fia_document (url) ON DELETE CASCADE
    )
  `.execute(db)
}
