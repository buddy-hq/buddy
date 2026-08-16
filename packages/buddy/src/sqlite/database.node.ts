import { createRequire } from "node:module"
import z from "zod"
import type {
  DatabaseOptions,
  RunResult,
  SQLInputValue,
  Statement,
  TSqliteCell,
  TSqliteRow,
} from "./shared"

const OBJECT_FUNCTION_TAG = "[object Function]"
const OBJECT_ASYNC_FUNCTION_TAG = "[object AsyncFunction]"
const OBJECT_GENERATOR_FUNCTION_TAG = "[object GeneratorFunction]"
const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const require = createRequire(import.meta.url)

const sqliteCellSchema: z.ZodType<TSqliteCell> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.bigint(),
  z.instanceof(Uint8Array),
])
const sqliteRowSchema: z.ZodType<TSqliteRow> = z.record(z.string(), sqliteCellSchema)

type TNativeStatement<TRow = TSqliteRow> = {
  all: (...params: SQLInputValue[]) => readonly TRow[]
  get: (...params: SQLInputValue[]) => TRow | null | undefined
  run: (...params: SQLInputValue[]) => RunResult
}

type TNativeDatabase = {
  close: () => void
  exec: (sql: string) => void
  prepare: <TRow = TSqliteRow>(sql: string) => TNativeStatement<TRow>
}

type TNativeSqliteConstructor = new (
  filename: string,
  options: TNativeDatabaseOptions,
) => TNativeDatabase

type TNativeSqliteModule = {
  DatabaseSync: TNativeSqliteConstructor
}

type TNativeDatabaseOptions = {
  open: true
  readOnly: boolean
  timeout: number
  enableForeignKeyConstraints: true
}

function objectTag<TValue>(value: TValue): string {
  return Object.prototype.toString.call(value)
}

function isFunctionValue<TValue>(value: TValue): boolean {
  const tag = objectTag(value)
  return (
    tag === OBJECT_FUNCTION_TAG ||
    tag === OBJECT_ASYNC_FUNCTION_TAG ||
    tag === OBJECT_GENERATOR_FUNCTION_TAG
  )
}

function isNativeSqliteModule<TValue>(value: TValue): value is TValue & TNativeSqliteModule {
  if (value === null || value === undefined) return false
  const record = Object(value)
  if (!("DatabaseSync" in record)) return false
  return isFunctionValue(record.DatabaseSync)
}

function loadNativeSqlite(): TNativeSqliteModule {
  const loaded = require("node:sqlite")
  if (!isNativeSqliteModule(loaded)) {
    throw new Error("node:sqlite DatabaseSync is unavailable.")
  }
  return loaded
}

function parsePreparedRow<TRow>(row: TRow): TRow {
  const parsed = sqliteRowSchema.safeParse(row)
  if (!parsed.success) {
    throw new Error("SQLite query returned a non-object row.")
  }
  return row
}

function normalizeRow<TRow>(row: TRow | null | undefined): TRow | null {
  if (row === undefined || row === null) return null
  return parsePreparedRow(row)
}

function normalizeRows<TRow>(rows: readonly TRow[]): TRow[] {
  return rows.map((row) => parsePreparedRow(row))
}

class NodeStatement<TRow> implements Statement<TRow> {
  constructor(private readonly statement: TNativeStatement<TRow>) {}

  all(...params: SQLInputValue[]): TRow[] {
    return normalizeRows(this.statement.all(...params))
  }

  get(...params: SQLInputValue[]): TRow | null {
    return normalizeRow(this.statement.get(...params))
  }

  run(...params: SQLInputValue[]): RunResult {
    return this.statement.run(...params)
  }
}

export class Database {
  private readonly native: TNativeDatabase

  constructor(filename: string, options: DatabaseOptions = {}) {
    const { DatabaseSync } = loadNativeSqlite()
    this.native = new DatabaseSync(filename, {
      open: true,
      readOnly: options.readonly === true,
      timeout: DEFAULT_BUSY_TIMEOUT_MS,
      enableForeignKeyConstraints: true,
    })
  }

  close(): void {
    this.native.close()
  }

  exec(sql: string): void {
    this.native.exec(sql)
  }

  prepare<TRow = TSqliteRow>(sql: string): Statement<TRow> {
    return new NodeStatement<TRow>(this.native.prepare<TRow>(sql))
  }
}
