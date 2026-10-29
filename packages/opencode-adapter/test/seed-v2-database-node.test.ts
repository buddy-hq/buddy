import { beforeAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import z from "zod"
import { TEST_SANDBOX } from "../../../script/test-preload"

const FIXTURE = path.resolve(import.meta.dir, "../../buddy/test/fixtures/v1-upgrade/opencode.db")
const ENTRY = path.resolve(import.meta.dir, "fixtures/seed-node-entry.ts")
const DESKTOP_PACKAGE = path.resolve(import.meta.dir, "../../desktop-electron")

const outputSchema = z.union([
  z.object({
    result: z.object({ kind: z.string(), source: z.string().optional() }),
    longestPauseMs: z.number(),
    elapsedMs: z.number(),
    node: z.string(),
  }),
  z.object({ error: z.string(), node: z.string() }),
])

type Runtime = { readonly name: string; readonly command: readonly string[]; readonly env: Readonly<Record<string, string>> }

function electronBinary() {
  try {
    const manifest = createRequire(import.meta.url).resolve("electron/package.json", { paths: [DESKTOP_PACKAGE] })
    const dist = path.join(path.dirname(manifest), "dist")
    const candidate = process.platform === "darwin"
      ? path.join(dist, "Electron.app", "Contents", "MacOS", "Electron")
      : path.join(dist, process.platform === "win32" ? "electron.exe" : "electron")
    return fs.existsSync(candidate) ? candidate : undefined
  } catch {
    return undefined
  }
}

function runtimes(): Runtime[] {
  const found: Runtime[] = []
  const electron = electronBinary()
  if (electron) found.push({ name: "electron", command: [electron], env: { ELECTRON_RUN_AS_NODE: "1" } })
  const node = Bun.which("node")
  if (node) found.push({ name: "node", command: [node], env: {} })
  return found
}

let bundle: string
let counter = 0

beforeAll(async () => {
  const outdir = path.join(TEST_SANDBOX.root, "seed-node-bundle")
  const built = await Bun.build({ entrypoints: [ENTRY], outdir, target: "node", format: "esm", conditions: ["node"] })
  if (!built.success) throw new Error(built.logs.map((log) => log.message).join("\n"))
  const output = built.outputs.find((artifact) => artifact.kind === "entry-point")
  if (!output) throw new Error("The Node seed entry was not built")
  bundle = output.path
})

function place(name: string) {
  counter += 1
  const root = path.join(TEST_SANDBOX.root, "seed-node", `${counter}-${name} l'été`)
  const data = path.join(root, "data")
  const state = path.join(root, "state")
  fs.mkdirSync(data, { recursive: true })
  fs.mkdirSync(state, { recursive: true })
  return { root, data, state, v1Database: path.join(data, "opencode.db"), v2Database: path.join(data, "opencode-v2.db") }
}

async function seed(runtime: Runtime, target: ReturnType<typeof place>, pauseMs = 0) {
  const child = Bun.spawn([...runtime.command, bundle, target.state, target.v1Database, target.v2Database, String(pauseMs)], {
    env: { ...process.env, ...runtime.env },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (code !== 0) throw new Error(`${runtime.name} exited with ${code}: ${stderr}`)
  return outputSchema.parse(JSON.parse(stdout.trim().split("\n").at(-1) ?? ""))
}

function temporaryEntries(directory: string) {
  return fs.readdirSync(directory).filter((entry) => entry.includes(".tmp"))
}

function count(file: string, sql: string) {
  const db = new Database(file, { readonly: true })
  try {
    return z.object({ value: z.number() }).parse(db.query(sql).get()).value
  } finally {
    db.close(false)
  }
}

function digestTables(file: string, skip: string) {
  const db = new Database(file, { readonly: true })
  try {
    const names = z.array(z.object({ name: z.string() })).parse(
      db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name != ? ORDER BY name").all(skip),
    ).map((row) => row.name)
    return Object.fromEntries(names.map((name) => [name, createHash("sha256").update(JSON.stringify(db.query(`SELECT * FROM "${name}" ORDER BY rowid`).all())).digest("hex")]))
  } finally {
    db.close(false)
  }
}

describe("seeding the v2 database on Node", () => {
  test("Electron's Node or a system Node is available", () => {
    expect(runtimes().length).toBeGreaterThan(0)
  })

  for (const runtime of runtimes()) {
    test(`${runtime.name}: committed WAL rows are included in the seeded copy`, async () => {
      const target = place(`${runtime.name}-committed-wal`)
      fs.copyFileSync(FIXTURE, target.v1Database)
      const source = new Database(target.v1Database)
      try {
        source.exec("PRAGMA journal_mode = WAL")
        source.exec("PRAGMA wal_autocheckpoint = 0")
        source.exec("CREATE TABLE IF NOT EXISTS writer_probe (id INTEGER PRIMARY KEY, value TEXT)")
        const rows = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, value: `committed-${index + 1}` }))
        source.transaction(() => {
          const insert = source.query("INSERT INTO writer_probe (id, value) VALUES (?, ?)")
          for (const row of rows) insert.run(row.id, row.value)
        })()
        expect(fs.existsSync(`${target.v1Database}-wal`)).toBe(true)
        expect(fs.statSync(`${target.v1Database}-wal`).size).toBeGreaterThan(0)

        expect(await seed(runtime, target)).toMatchObject({ result: { kind: "seeded", source: "v1" } })

        const copy = new Database(target.v2Database, { readonly: true })
        try {
          expect(copy.query("SELECT id, value FROM writer_probe ORDER BY id").all()).toEqual(rows)
        } finally {
          copy.close(false)
        }
      } finally {
        source.close(false)
      }
    }, 60_000)

    test(`${runtime.name}: a steady v1 writer does not stop the online backup, and the v1 file holds only the writer's changes`, async () => {
      const target = place(`${runtime.name}-writer`)
      fs.copyFileSync(FIXTURE, target.v1Database)
      const prepare = new Database(target.v1Database)
      prepare.exec("PRAGMA journal_mode = WAL")
      prepare.exec("CREATE TABLE writer_probe (id INTEGER PRIMARY KEY, value TEXT)")
      prepare.close(false)
      const before = digestTables(target.v1Database, "writer_probe")
      const stop = path.join(target.root, "stop")
      const writerScript = path.join(target.root, "writer.ts")
      fs.writeFileSync(writerScript, [
        'import { Database } from "bun:sqlite"',
        'import { existsSync } from "node:fs"',
        `const db = new Database(${JSON.stringify(target.v1Database)})`,
        'db.exec("PRAGMA busy_timeout = 5000")',
        "let rows = 0",
        `while (!existsSync(${JSON.stringify(stop)})) { db.query("INSERT INTO writer_probe (value) VALUES (?)").run("x".repeat(512)); rows += 1 }`,
        "db.close(false)",
        "console.log(rows)",
      ].join("\n"))
      const writer = Bun.spawn([process.execPath, writerScript], { stdout: "pipe", stderr: "pipe" })
      await Bun.sleep(200)
      let output: z.infer<typeof outputSchema>
      let committedRows = 0
      try {
        committedRows = count(target.v1Database, "SELECT COUNT(*) AS value FROM writer_probe")
        output = await seed(runtime, target)
      } finally {
        fs.writeFileSync(stop, "")
      }
      const rows = Number((await new Response(writer.stdout).text()).trim())
      expect(await writer.exited).toBe(0)
      expect(output).toMatchObject({ result: { kind: "seeded", source: "v1" } })
      expect("elapsedMs" in output ? output.elapsedMs : Number.POSITIVE_INFINITY).toBeLessThan(10_000)
      expect(rows).toBeGreaterThan(0)
      const check = new Database(target.v2Database, { readonly: true })
      expect(check.query("PRAGMA quick_check").all()).toEqual([{ quick_check: "ok" }])
      expect(check.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "delete" })
      check.close(false)
      expect(count(target.v2Database, "SELECT COUNT(*) AS value FROM session")).toBe(3)
      expect(count(target.v2Database, "SELECT COUNT(*) AS value FROM event")).toBe(0)
      expect(count(target.v1Database, "SELECT COUNT(*) AS value FROM writer_probe")).toBe(rows)
      expect(count(target.v2Database, "SELECT COUNT(*) AS value FROM writer_probe")).toBeGreaterThanOrEqual(committedRows)
      expect(digestTables(target.v1Database, "writer_probe")).toEqual(before)
      expect(temporaryEntries(target.data)).toEqual([])
      if (process.platform !== "win32") expect(fs.statSync(target.v2Database).mode & 0o777).toBe(0o600)
    }, 60_000)

    test(`${runtime.name}: two seeders make one copy and leave no temporary file`, async () => {
      const target = place(`${runtime.name}-two`)
      fs.copyFileSync(FIXTURE, target.v1Database)
      const outputs = await Promise.all([seed(runtime, target, 500), seed(runtime, target, 500)])
      expect(outputs.map((output) => ("result" in output ? output.result.kind : output.error)).toSorted()).toEqual(["published-elsewhere", "seeded"])
      expect(temporaryEntries(target.data)).toEqual([])
      expect(count(target.v2Database, "SELECT COUNT(*) AS value FROM session")).toBe(3)
    }, 60_000)

    test(`${runtime.name}: a stale temporary copy is removed and a copy that fails its checks is never published`, async () => {
      const stale = place(`${runtime.name}-stale`)
      fs.copyFileSync(FIXTURE, stale.v1Database)
      for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.writeFileSync(`${stale.v2Database}.4242.tmp${suffix}`, "stale")
      expect(await seed(runtime, stale)).toMatchObject({ result: { kind: "seeded" } })
      expect(temporaryEntries(stale.data)).toEqual([])

      const corrupt = place(`${runtime.name}-corrupt`)
      fs.copyFileSync(FIXTURE, corrupt.v1Database)
      const handle = fs.openSync(corrupt.v1Database, "r+")
      fs.writeSync(handle, Buffer.alloc(4096 * 20, 0x5a), 0, 4096 * 20, 4096 * 40)
      fs.closeSync(handle)
      const failed = await seed(runtime, corrupt)
      expect("error" in failed ? failed.error : "").toContain("Could not copy your chats")
      expect(fs.existsSync(corrupt.v2Database)).toBe(false)
      expect(temporaryEntries(corrupt.data)).toEqual([])
    }, 60_000)
  }
})
