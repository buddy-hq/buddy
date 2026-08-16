import { existsSync } from "node:fs"
import { Database } from "#sqlite"
import { DatabasePath as OpenCodeDatabasePath } from "@buddy/opencode-adapter/storage-db"
import z from "zod"

const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations" as const
const EVENTS_MIGRATION_NAME = "20260323234822_events" as const
const EVENTS_TABLE = "event" as const
const EVENT_SEQUENCE_TABLE = "event_sequence" as const

type TMigrationJournalRow = {
  rowid?: number
  id: number | null
  created_at: number | null
  name: string | null
  applied_at: string | null
}

type TLegacyMigrationRepair = {
  migrationName: string
  requiredTables: readonly string[]
}

type TSqliteRunResult = {
  changes?: number
  lastInsertRowid?: number | bigint
}

type TSqliteRawRow = object | null | undefined

type TSqliteStatement = {
  all: (...params: (number | string)[]) => TSqliteRawRow[]
  get: (...params: (number | string)[]) => TSqliteRawRow
  run: (...params: (number | string)[]) => TSqliteRunResult | undefined
}

type TSqliteDatabase = {
  prepare: (sql: string) => TSqliteStatement
}

const LEGACY_MIGRATION_REPAIRS: readonly TLegacyMigrationRepair[] = [
  {
    migrationName: EVENTS_MIGRATION_NAME,
    requiredTables: [EVENT_SEQUENCE_TABLE, EVENTS_TABLE],
  },
]

const sqliteTableNameRowSchema = z.object({
  name: z.string(),
})

const migrationJournalRowSchema = z.object({
  rowid: z.number().optional(),
  id: z.number().nullable(),
  created_at: z.number().nullable(),
  name: z.string().nullable(),
  applied_at: z.string().nullable(),
})

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

function hasTable(db: TSqliteDatabase, tableName: string): boolean {
  const row = db
    .prepare("select 1 as present from sqlite_master where type = 'table' and name = ? limit 1")
    .get(tableName)

  return !!row
}

function listTables(db: TSqliteDatabase): Set<string> {
  const names = new Set<string>()
  for (const row of db.prepare("select name from sqlite_master where type = 'table'").all()) {
    const parsed = sqliteTableNameRowSchema.safeParse(row)
    if (parsed.success) names.add(parsed.data.name)
  }
  return names
}

function findRepairForRow(
  row: TMigrationJournalRow,
  existingTables: ReadonlySet<string>,
): TLegacyMigrationRepair | undefined {
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

export function repairLegacyMigrationJournal(db: TSqliteDatabase): string[] {
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
    .all()
    .flatMap((row) => {
      const parsed = migrationJournalRowSchema.safeParse(row)
      return parsed.success ? [parsed.data] : []
    })

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
