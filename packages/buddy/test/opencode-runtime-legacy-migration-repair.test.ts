import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { repairLegacyMigrationJournal } from "../src/opencode-runtime/legacy-migration-repair"

const EVENTS_MIGRATION_NAME = "20260323234822_events" as const
const EVENTS_MIGRATION_CREATED_AT = Date.UTC(2026, 2, 23, 23, 48, 22)

function createMigrationFixture() {
  const db = new Database(":memory:")

  db.run(`
    create table "__drizzle_migrations" (
      id integer primary key,
      hash text not null,
      created_at numeric,
      name text,
      applied_at text
    )
  `)

  return db
}

describe("legacy OpenCode migration repair", () => {
  test("backfills the events migration journal row when the tables already exist", () => {
    const db = createMigrationFixture()

    db.run(`
      create table "event_sequence" (
        aggregate_id text primary key,
        seq integer not null
      )
    `)
    db.run(`
      create table "event" (
        id text primary key,
        aggregate_id text not null,
        seq integer not null,
        type text not null,
        data text not null
      )
    `)
    db.query(
      `insert into "__drizzle_migrations" (id, hash, created_at, name, applied_at)
       values (?, ?, ?, ?, ?)`,
    ).run(10, "", EVENTS_MIGRATION_CREATED_AT, null, null)

    const repaired = repairLegacyMigrationJournal(db)

    expect(repaired).toEqual([EVENTS_MIGRATION_NAME])

    const row = db
      .query(
        `select rowid as journal_rowid, name, applied_at
           from "__drizzle_migrations"
          where created_at = ?`,
      )
      .get(EVENTS_MIGRATION_CREATED_AT) as {
        journal_rowid: number
        name: string
        applied_at: string
      }

    expect(row.journal_rowid).toBeGreaterThan(0)
    expect(row.name).toBe(EVENTS_MIGRATION_NAME)
    expect(row.applied_at).toBe(new Date(EVENTS_MIGRATION_CREATED_AT).toISOString())
  })

  test("leaves incomplete rows untouched when the migration tables do not exist", () => {
    const db = createMigrationFixture()

    db.query(
      `insert into "__drizzle_migrations" (id, hash, created_at, name, applied_at)
       values (?, ?, ?, ?, ?)`,
    ).run(10, "", EVENTS_MIGRATION_CREATED_AT, null, null)

    const repaired = repairLegacyMigrationJournal(db)

    expect(repaired).toEqual([])

    const row = db
      .query(
        `select rowid as journal_rowid, name, applied_at
           from "__drizzle_migrations"
          where created_at = ?`,
      )
      .get(EVENTS_MIGRATION_CREATED_AT) as {
        journal_rowid: number
        name: string | null
        applied_at: string | null
      }

    expect(row.journal_rowid).toBeGreaterThan(0)
    expect(row.name).toBeNull()
    expect(row.applied_at).toBeNull()
  })
})
