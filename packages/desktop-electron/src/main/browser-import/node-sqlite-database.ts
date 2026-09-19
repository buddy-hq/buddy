import { DatabaseSync } from "node:sqlite"
import type { ReadOnlyDatabase } from "./cookie-database"

export function openNodeSqliteDatabase(path: string): ReadOnlyDatabase {
  const database = new DatabaseSync(path, { readOnly: true })
  return {
    all: (sql, parameters) => database.prepare(sql).all(...parameters),
    close: () => database.close(),
  }
}
