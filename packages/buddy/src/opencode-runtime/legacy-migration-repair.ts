import { existsSync } from "node:fs"
import { Database } from "#sqlite"
import { DatabasePath as OpenCodeDatabasePath } from "@buddy/opencode-adapter/storage-db"

const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations" as const
const EVENTS_MIGRATION_NAME = "20260323234822_events" as const
const EVENTS_TABLE = "event" as const
const EVENT_SEQUENCE_TABLE = "event_sequence" as const

type MigrationJournalRow = {
  rowid: number
  id: number | null
  created_at: number | null
  name: string | null
  applied_at: string | null
}

type LegacyMigrationRepair = {
  migrationName: string
  requiredTables: readonly string[]
}

type SqliteStatement = {
  all: (...params: (number | string)[]) => unknown[]
  get: (...params: (number | string)[]) => unknown
  run: (...params: (number | string)[]) => unknown
}

type SqliteDatabase = {
  prepare: (sql: string) => SqliteStatement
}

const LEGACY_MIGRATION_REPAIRS: readonly LegacyMigrationRepair[] = [
  {
    migrationName: EVENTS_MIGRATION_NAME,
    requiredTables: [EVENT_SEQUENCE_TABLE, EVENTS_TABLE],
  },
]

function parseMigrationTimestamp(migrationName: string): number {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(migrationName)
  if (!match) return Number.NaN

  const [_fullMatch, year, month, day, hour, minute, second] = match

  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
}

function hasTable(db: SqliteDatabase, tableName: string): boolean {
  const row = db
    .prepare("select 1 as present from sqlite_master where type = 'table' and name = ? limit 1")
    .get(tableName)

  return !!row
}

function listTables(db: SqliteDatabase): Set<string> {
  const rows = db.prepare("select name from sqlite_master where type = 'table'").all() as Array<{
    name: string
  }>

  return new Set(rows.map((row) => row.name))
}

function findRepairForRow(
  row: MigrationJournalRow,
  existingTables: ReadonlySet<string>,
): LegacyMigrationRepair | undefined {
  if (row.created_at === null) {
    return undefined
  }

  return LEGACY_MIGRATION_REPAIRS.find((repair) => {
    if (parseMigrationTimestamp(repair.migrationName) !== row.created_at) {
      return false
    }

    return repair.requiredTables.every((tableName) => existingTables.has(tableName))
  })
}

export function repairLegacyMigrationJournal(db: SqliteDatabase): string[] {
  if (!hasTable(db, DRIZZLE_MIGRATIONS_TABLE)) {
    return []
  }

  const incompleteRows = db
    .prepare(
      `select rowid, id, created_at, name, applied_at
       from ${DRIZZLE_MIGRATIONS_TABLE}
      where name is null or applied_at is null
      order by created_at, rowid`,
    )
    .all() as MigrationJournalRow[]

  if (incompleteRows.length === 0) {
    return []
  }

  const existingTables = listTables(db)
  const repairedMigrations: string[] = []
  const updateRow = db.prepare(
    `update ${DRIZZLE_MIGRATIONS_TABLE}
        set name = coalesce(name, ?),
            applied_at = coalesce(applied_at, ?)
      where created_at = ?
        and (name is null or name = ?)
        and (applied_at is null or applied_at = ?)`,
  )

  for (const row of incompleteRows) {
    const repair = findRepairForRow(row, existingTables)
    if (!repair) {
      continue
    }

    const createdAt = row.created_at
    if (createdAt === null) {
      continue
    }

    const appliedAt = row.applied_at ?? new Date(createdAt).toISOString()
    updateRow.run(repair.migrationName, appliedAt, createdAt, repair.migrationName, appliedAt)
    repairedMigrations.push(repair.migrationName)
  }

  return repairedMigrations
}

export async function repairLegacyOpenCodeMigrations() {
  const databasePath = OpenCodeDatabasePath()
  if (databasePath === ":memory:" || !existsSync(databasePath)) {
    return []
  }

  const db = new Database(databasePath)
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    return repairLegacyMigrationJournal(db)
  } finally {
    db.close()
  }
}
