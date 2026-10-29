import { Database } from "bun:sqlite"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import z from "zod"

const FIXTURE = path.resolve(import.meta.dir, "../../buddy/test/fixtures/v1-upgrade/opencode.db")
const ENTRY = path.resolve(import.meta.dir, "fixtures/seed-node-entry.ts")
const DESKTOP_PACKAGE = path.resolve(import.meta.dir, "../../desktop-electron")
const SESSIONS = 400
const EVENT_ROW_BYTES = 2048
const PART_ROW_BYTES = 4096

const rowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]))

function sampleRow(db: Database, sql: string) {
  return rowSchema.parse(db.query(sql).get())
}

function insertStatement(db: Database, table: string, columns: readonly string[]) {
  return db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`)
}

function generate(target: string, eventMegabytes: number, chatMegabytes: number) {
  fs.copyFileSync(FIXTURE, target)
  const db = new Database(target)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA synchronous = OFF")
  const session = sampleRow(db, "SELECT * FROM session LIMIT 1")
  const message = sampleRow(db, "SELECT * FROM message LIMIT 1")
  const part = sampleRow(db, "SELECT * FROM part WHERE json_extract(data, '$.type') = 'text' LIMIT 1")
  const event = sampleRow(db, "SELECT * FROM event LIMIT 1")
  const eventColumns = Object.keys(event)
  const insertEvent = insertStatement(db, "event", eventColumns)
  const filler = JSON.stringify({ filler: "x".repeat(EVENT_ROW_BYTES - 148) })
  const eventCount = Math.round((eventMegabytes * 1024 * 1024) / EVENT_ROW_BYTES)
  db.transaction(() => {
    for (let index = 0; index < eventCount; index += 1) {
      insertEvent.run(...eventColumns.map((key) => {
        if (key === "id") return `evt_large_${index.toString().padStart(9, "0")}`
        if (key === "seq") return index + 1_000
        if (key === "data") return filler
        return event[key] ?? null
      }))
    }
  })()
  const partsPerSession = Math.round((chatMegabytes * 1024 * 1024) / PART_ROW_BYTES / SESSIONS)
  const sessionColumns = Object.keys(session)
  const messageColumns = Object.keys(message)
  const partColumns = Object.keys(part)
  const insertSession = insertStatement(db, "session", sessionColumns)
  const insertMessage = insertStatement(db, "message", messageColumns)
  const insertPart = insertStatement(db, "part", partColumns)
  const partData = JSON.stringify({ ...z.record(z.string(), z.unknown()).parse(JSON.parse(String(part.data))), text: "y".repeat(PART_ROW_BYTES - 300) })
  db.transaction(() => {
    for (let s = 0; s < SESSIONS; s += 1) {
      const sessionID = `ses_large${s.toString().padStart(6, "0")}aaaaaaaaaaaa`
      insertSession.run(...sessionColumns.map((key) => (key === "id" ? sessionID : key === "slug" ? `large-${s}` : session[key] ?? null)))
      for (let p = 0; p < partsPerSession; p += 1) {
        const suffix = `${s.toString().padStart(6, "0")}${p.toString().padStart(6, "0")}`
        const messageID = `msg_large${suffix}`
        insertMessage.run(...messageColumns.map((key) => {
          if (key === "id") return messageID
          if (key === "session_id") return sessionID
          if (key === "time_created" || key === "time_updated") return 1_700_000_000_000 + p
          return message[key] ?? null
        }))
        insertPart.run(...partColumns.map((key) => {
          if (key === "id") return `prt_large${suffix}`
          if (key === "message_id") return messageID
          if (key === "session_id") return sessionID
          if (key === "data") return partData
          return part[key] ?? null
        }))
      }
    }
  })()
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  db.close(false)
  return { eventCount, partsPerSession }
}

function runtimes() {
  const found: { readonly name: string; readonly command: readonly string[]; readonly env: Readonly<Record<string, string>> }[] = []
  try {
    const manifest = createRequire(import.meta.url).resolve("electron/package.json", { paths: [DESKTOP_PACKAGE] })
    const dist = path.join(path.dirname(manifest), "dist")
    const binary = process.platform === "darwin"
      ? path.join(dist, "Electron.app", "Contents", "MacOS", "Electron")
      : path.join(dist, process.platform === "win32" ? "electron.exe" : "electron")
    if (fs.existsSync(binary)) found.push({ name: "electron", command: [binary], env: { ELECTRON_RUN_AS_NODE: "1" } })
  } catch {
    found.length = 0
  }
  const node = Bun.which("node")
  if (node) found.push({ name: "node", command: [node], env: {} })
  return found
}

const [eventArgument = "1000", chatArgument = "200"] = process.argv.slice(2)
const root = fs.mkdtempSync(path.join(os.tmpdir(), "buddy-v2-seed-measure-"))
try {
  const built = await Bun.build({ entrypoints: [ENTRY], outdir: path.join(root, "bundle"), target: "node", format: "esm", conditions: ["node"] })
  const bundle = built.outputs.find((artifact) => artifact.kind === "entry-point")?.path
  if (!built.success || !bundle) throw new Error(built.logs.map((log) => log.message).join("\n"))
  const source = path.join(root, "source.db")
  const generatedAt = performance.now()
  const generatedCounts = generate(source, Number(eventArgument), Number(chatArgument))
  console.log(JSON.stringify({ generated: { ...generatedCounts, bytes: fs.statSync(source).size, ms: Math.round(performance.now() - generatedAt) } }))
  for (const runtime of runtimes()) {
    const place = path.join(root, runtime.name)
    const data = path.join(place, "data")
    const state = path.join(place, "state")
    fs.mkdirSync(data, { recursive: true })
    fs.mkdirSync(state, { recursive: true })
    fs.copyFileSync(source, path.join(data, "opencode.db"))
    const child = Bun.spawn([...runtime.command, bundle, state, path.join(data, "opencode.db"), path.join(data, "opencode-v2.db")], {
      env: { ...process.env, ...runtime.env },
      stdout: "pipe",
      stderr: "inherit",
    })
    const output = (await new Response(child.stdout).text()).trim()
    await child.exited
    console.log(JSON.stringify({ runtime: runtime.name, platform: `${process.platform}-${process.arch}`, cpus: os.cpus()[0]?.model, output: JSON.parse(output) }))
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
