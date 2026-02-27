import path from "node:path"
import { AsyncLocalStorage } from "node:async_hooks"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { Database as BunDatabase } from "bun:sqlite"
import { drizzle, type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { type SQLiteTransaction } from "drizzle-orm/sqlite-core"
import { Global } from "./global.js"
import * as schema from "./schema.js"

export * from "drizzle-orm"

declare const BUDDY_MIGRATIONS: { sql: string; timestamp: number }[] | undefined

type Schema = typeof schema
type Client = SQLiteBunDatabase<Schema>
type Tx = SQLiteTransaction<"sync", void, Schema>
type Effect = () => void | Promise<void>

type Journal = {
  sql: string
  timestamp: number
}[]

type TxOrDb = Tx | Client

function getRuntimeEnv(name: string) {
  return process.env[name]
}

function parseMigrationTime(tag: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(tag)
  if (!match) return 0
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}

function readMigrations(dir: string): Journal {
  if (!existsSync(dir)) {
    return []
  }

  const directories = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const entries = directories
    .map((name) => {
      const file = path.join(dir, name, "migration.sql")
      if (!existsSync(file)) return
      return {
        sql: readFileSync(file, "utf-8"),
        timestamp: parseMigrationTime(name),
      }
    })
    .filter(Boolean) as Journal

  return entries.sort((a, b) => a.timestamp - b.timestamp)
}

const context = new AsyncLocalStorage<{
  tx: TxOrDb
  effects: Effect[]
}>()

let client: Client | undefined

function openClient() {
  const sqlite = new BunDatabase(Database.Path, { create: true })
  sqlite.run("PRAGMA journal_mode = WAL")
  sqlite.run("PRAGMA synchronous = NORMAL")
  sqlite.run("PRAGMA busy_timeout = 5000")
  sqlite.run("PRAGMA cache_size = -64000")
  sqlite.run("PRAGMA foreign_keys = ON")
  sqlite.run("PRAGMA wal_checkpoint(PASSIVE)")

  const db = drizzle({ client: sqlite, schema })
  const migrationDir = getRuntimeEnv("BUDDY_MIGRATION_DIR")
  const entries =
    typeof BUDDY_MIGRATIONS !== "undefined"
      ? BUDDY_MIGRATIONS
      : readMigrations(migrationDir || path.join(import.meta.dirname, "../../migration"))
  if (entries.length > 0) {
    migrate(db, entries)
  }
  return db
}

function runEffects(effects: Effect[]) {
  for (const effect of effects) {
    const result = effect()
    if (result && typeof (result as Promise<void>).then === "function") {
      void result
    }
  }
}

export namespace Database {
  export const Path = path.join(Global.Path.data, "buddy.db")
  export type Transaction = Tx
  export type TxOrDb = Transaction | Client

  export function Client() {
    if (!client) {
      client = openClient()
    }
    return client
  }

  export function use<T>(callback: (tx: TxOrDb) => T): T {
    const existing = context.getStore()
    if (existing) {
      return callback(existing.tx)
    }

    const effects: Effect[] = []
    const value = context.run(
      {
        tx: Client(),
        effects,
      },
      () => callback(Client()),
    )
    runEffects(effects)
    return value
  }

  export function effect(effect: Effect) {
    const existing = context.getStore()
    if (!existing) {
      const result = effect()
      if (result && typeof (result as Promise<void>).then === "function") {
        void result
      }
      return
    }
    existing.effects.push(effect)
  }

  export function transaction<T>(callback: (tx: TxOrDb) => T): T {
    const existing = context.getStore()
    if (existing) {
      return callback(existing.tx)
    }

    const effects: Effect[] = []
    const value = Client().transaction((tx) =>
      context.run(
        {
          tx,
          effects,
        },
        () => callback(tx),
      ),
    )
    runEffects(effects)
    return value
  }
}
