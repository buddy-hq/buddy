import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

function openDatabase(filename: string) {
  const moduleName = process.versions.bun ? "bun:sqlite" : "node:sqlite"
  if (process.versions.bun) {
    const { Database }: typeof import("bun:sqlite") = require(moduleName)
    const native = new Database(filename)
    return {
      close: () => native.close(false),
      exec: (sql: string) => native.exec(sql),
      prepare: (sql: string) => native.query<object, (number | string)[]>(sql),
    }
  }

  const { DatabaseSync }: typeof import("node:sqlite") = require(moduleName)
  const native = new DatabaseSync(filename, {
    open: true,
    readOnly: false,
    timeout: 5_000,
    enableForeignKeyConstraints: true,
  })
  return {
    close: () => native.close(),
    exec: (sql: string) => native.exec(sql),
    prepare: (sql: string) => {
      const statement = native.prepare(sql)
      return {
        all: (...params: (number | string)[]) => statement.all(...params),
        get: (...params: (number | string)[]) => statement.get(...params) ?? null,
        run: (...params: (number | string)[]) => {
          const result = statement.run(...params)
          return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid }
        },
      }
    },
  }
}

export class Database {
  private readonly native: ReturnType<typeof openDatabase>

  constructor(filename: string) {
    this.native = openDatabase(filename)
  }

  close(): void {
    this.native.close()
  }

  exec(sql: string): void {
    this.native.exec(sql)
  }

  prepare(sql: string) {
    return this.native.prepare(sql)
  }
}
