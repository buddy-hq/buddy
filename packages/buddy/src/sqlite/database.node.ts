import { createRequire } from "node:module"
import type { DatabaseOptions, RunResult, SQLInputValue, Statement } from "./shared"

type NativeStatement = {
  all: (...params: SQLInputValue[]) => unknown[]
  get: (...params: SQLInputValue[]) => unknown
  run: (...params: SQLInputValue[]) => RunResult
}

type NativeDatabase = {
  close: () => void
  exec: (sql: string) => void
  prepare: (sql: string) => NativeStatement
}

type NativeSqliteModule = {
  DatabaseSync: new (filename: string, options: NativeDatabaseOptions) => NativeDatabase
}

type NativeDatabaseOptions = {
  open: true
  readOnly: boolean
  timeout: number
  enableForeignKeyConstraints: true
}

const DEFAULT_BUSY_TIMEOUT_MS = 5_000
const require = createRequire(import.meta.url)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function loadNativeSqlite(): NativeSqliteModule {
  const loaded: unknown = require("node:sqlite")
  if (!isRecord(loaded) || typeof loaded.DatabaseSync !== "function") {
    throw new Error("node:sqlite DatabaseSync is unavailable.")
  }
  return loaded as NativeSqliteModule
}

function normalizeRow<TRow>(row: unknown): TRow | null {
  if (row === undefined || row === null) return null
  if (!isRecord(row)) {
    throw new Error("SQLite query returned a non-object row.")
  }
  return Object.fromEntries(Object.entries(row)) as TRow
}

function normalizeRows<TRow>(rows: unknown[]): TRow[] {
  return rows.map((row) => {
    const normalized = normalizeRow<TRow>(row)
    if (normalized === null) {
      throw new Error("SQLite query returned an empty row.")
    }
    return normalized
  })
}

class NodeStatement<TRow> implements Statement<TRow> {
  constructor(private readonly statement: NativeStatement) {}

  all(...params: SQLInputValue[]): TRow[] {
    return normalizeRows<TRow>(this.statement.all(...params))
  }

  get(...params: SQLInputValue[]): TRow | null {
    return normalizeRow<TRow>(this.statement.get(...params))
  }

  run(...params: SQLInputValue[]): RunResult {
    return this.statement.run(...params)
  }
}

export class Database {
  private readonly native: NativeDatabase

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

  prepare<TRow = Record<string, unknown>>(sql: string): Statement<TRow> {
    return new NodeStatement<TRow>(this.native.prepare(sql))
  }
}
