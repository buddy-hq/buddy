import { Database as BunSqliteDatabase } from "bun:sqlite"
import type { DatabaseOptions, SQLInputValue, Statement, TSqliteRow } from "./shared"

type BunStatement<TRow> = {
  all(...params: SQLInputValue[]): TRow[]
  get(...params: SQLInputValue[]): TRow | null
  run(...params: SQLInputValue[]): {
    changes: number
    lastInsertRowid: number | bigint
  }
}

function createStatement<TRow>(statement: BunStatement<TRow>): Statement<TRow> {
  return {
    all(...params) {
      return statement.all(...params)
    },
    get(...params) {
      return statement.get(...params)
    },
    run(...params) {
      return statement.run(...params)
    },
  }
}

export class Database {
  private readonly native: BunSqliteDatabase

  constructor(filename: string, options?: DatabaseOptions) {
    this.native = options
      ? new BunSqliteDatabase(filename, options)
      : new BunSqliteDatabase(filename)
  }

  close(): void {
    this.native.close(false)
  }

  exec(sql: string): void {
    this.native.exec(sql)
  }

  prepare<TRow = TSqliteRow>(sql: string): Statement<TRow> {
    return createStatement(this.native.query<TRow, SQLInputValue[]>(sql))
  }
}
