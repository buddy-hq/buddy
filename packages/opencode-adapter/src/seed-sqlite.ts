import { createRequire } from "node:module"
import { Worker } from "node:worker_threads"
import z from "zod"

export type SeedSqliteParameter = string | number | null

export type SeedSqlite = {
  readonly exec: (sql: string) => Promise<void>
  readonly all: <TRow>(schema: z.ZodType<TRow>, sql: string, parameters?: readonly SeedSqliteParameter[]) => Promise<readonly TRow[]>
  readonly run: (sql: string, parameters?: readonly SeedSqliteParameter[]) => Promise<number>
  readonly copyTo: (target: string) => Promise<void>
  readonly close: () => Promise<void>
}

const require = createRequire(import.meta.url)
const BUN_SQLITE_MODULE = "bun:sqlite"
const BUSY_TIMEOUT_MS = 5_000

const NODE_SQLITE_WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads")
const sqlite = require("node:sqlite")
const describe = (error) => ({
  message: error instanceof Error ? error.message : String(error),
  code: error && error.errstr ? String(error.errstr) : error && error.code ? String(error.code) : undefined,
})
let db
try {
  db = new sqlite.DatabaseSync(workerData.file, { readOnly: workerData.readOnly, timeout: workerData.timeout })
  parentPort.postMessage({ id: 0, result: null })
} catch (error) {
  parentPort.postMessage({ id: 0, error: describe(error) })
}
parentPort.on("message", async (request) => {
  try {
    let result = null
    if (request.op === "exec") db.exec(request.sql)
    else if (request.op === "all") result = db.prepare(request.sql).all(...request.parameters).map((row) => ({ ...row }))
    else if (request.op === "run") result = Number(db.prepare(request.sql).run(...request.parameters).changes)
    else if (request.op === "copy") {
      const wake = setInterval(() => {}, 20)
      try {
        await sqlite.backup(db, request.target, { rate: 2147483647 })
      } finally {
        clearInterval(wake)
      }
    }
    else if (request.op === "close") db.close()
    parentPort.postMessage({ id: request.id, result })
  } catch (error) {
    parentPort.postMessage({ id: request.id, error: describe(error) })
  }
})
`

const workerReplySchema = z.object({
  id: z.number(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string(), code: z.string().optional() }).optional(),
})

const changesSchema = z.number()

export class SeedSqliteError extends Error {
  readonly code: string | undefined

  constructor(message: string, code: string | undefined) {
    super(code && !message.includes(code) ? `${message} (${code})` : message)
    this.name = "SeedSqliteError"
    this.code = code
  }
}

type WorkerRequest =
  | { readonly op: "exec"; readonly sql: string }
  | { readonly op: "all" | "run"; readonly sql: string; readonly parameters: readonly SeedSqliteParameter[] }
  | { readonly op: "copy"; readonly target: string }
  | { readonly op: "close" }

type Pending = {
  readonly resolve: (value: z.infer<typeof workerReplySchema>["result"]) => void
  readonly reject: (error: Error) => void
}

async function openNodeSeedSqlite(file: string, readOnly: boolean): Promise<SeedSqlite> {
  const worker = new Worker(NODE_SQLITE_WORKER_SOURCE, {
    eval: true,
    workerData: { file, readOnly, timeout: BUSY_TIMEOUT_MS },
  })
  const pending = new Map<number, Pending>()
  let nextID = 1
  let failure: Error | undefined
  const failAll = (error: Error) => {
    failure ??= error
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
  }
  worker.on("message", (raw) => {
    const reply = workerReplySchema.safeParse(raw)
    if (!reply.success) {
      failAll(new Error("SQLite worker sent an unreadable reply"))
      return
    }
    const entry = pending.get(reply.data.id)
    if (!entry) return
    pending.delete(reply.data.id)
    if (reply.data.error) entry.reject(new SeedSqliteError(reply.data.error.message, reply.data.error.code))
    else entry.resolve(reply.data.result)
  })
  worker.on("error", (error) => failAll(error))
  worker.on("exit", (code) => failAll(new Error(`SQLite worker exited with code ${code}`)))

  const send = (request: WorkerRequest) => {
    if (failure) return Promise.reject(failure)
    const id = nextID
    nextID += 1
    return new Promise<z.infer<typeof workerReplySchema>["result"]>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, ...request }, [])
    })
  }
  const opened = new Promise<void>((resolve, reject) => {
    pending.set(0, { resolve: () => resolve(), reject })
  })
  try {
    await opened
  } catch (error) {
    await worker.terminate()
    throw error
  }
  let closed = false
  return {
    async exec(sql) {
      await send({ op: "exec", sql })
    },
    async all(schema, sql, parameters = []) {
      return z.array(schema).parse(await send({ op: "all", sql, parameters }))
    },
    async run(sql, parameters = []) {
      return changesSchema.parse(await send({ op: "run", sql, parameters }))
    },
    async copyTo(target) {
      await send({ op: "copy", target })
    },
    async close() {
      if (closed) return
      closed = true
      try {
        await send({ op: "close" })
      } finally {
        await worker.terminate()
      }
    },
  }
}

function openBunSeedSqlite(file: string, readOnly: boolean): SeedSqlite {
  const { Database }: typeof import("bun:sqlite") = require(BUN_SQLITE_MODULE)
  const db = readOnly ? new Database(file, { readonly: true }) : new Database(file, { create: false, readwrite: true })
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`)
  const attempt = async <TResult>(run: () => TResult): Promise<TResult> => {
    try {
      return run()
    } catch (error) {
      if (error instanceof Error) throw new SeedSqliteError(error.message, codeOf(error))
      throw error
    }
  }
  let closed = false
  return {
    exec: (sql) => attempt(() => { db.exec(sql) }),
    all: (schema, sql, parameters = []) => attempt(() => z.array(schema).parse(db.query(sql).all(...parameters))),
    run: (sql, parameters = []) => attempt(() => db.query(sql).run(...parameters).changes),
    copyTo: (target) => attempt(() => { db.query("VACUUM INTO ?").run(target) }),
    close: () => attempt(() => {
      if (closed) return
      closed = true
      db.close(false)
    }),
  }
}

const errorCodeSchema = z.object({ code: z.string() })

function codeOf(error: Error): string | undefined {
  const parsed = errorCodeSchema.safeParse(error)
  return parsed.success ? parsed.data.code : undefined
}

export async function openSeedSqlite(file: string, options: { readonly readOnly: boolean }): Promise<SeedSqlite> {
  if (process.versions.bun) return openBunSeedSqlite(file, options.readOnly)
  return openNodeSeedSqlite(file, options.readOnly)
}
