import { describe, expect, setSystemTime, test } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import z from "zod"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { configureOpenCodeGlobalPaths, createOpenCodeHost } from "../src/host"
import { ensureV2DatabaseSeeded, seedV2Database, type V2DatabaseSeedResult } from "../src/seed-v2-database"
import { listMessages } from "../src/gateway/message"
import { readV1ImportCommandDisplays, readV1ImportRecord } from "../src/v1-import-guard"

const FIXTURE = path.resolve(import.meta.dir, "../../buddy/test/fixtures/v1-upgrade/opencode.db")
const SEED_MODULE = path.resolve(import.meta.dir, "../src/seed-v2-database.ts")
const FLOCK_MODULE = path.resolve(import.meta.dir, "../../../vendor/opencode/packages/util/src/flock.ts")
let counter = 0

function workspace(name: string) {
  counter += 1
  const root = path.join(TEST_SANDBOX.root, "seed-v2", `${counter}-${name} l'été`)
  const paths = {
    data: path.join(root, "data"),
    cache: path.join(root, "cache"),
    config: path.join(root, "config"),
    state: path.join(root, "state"),
    tmp: path.join(root, "tmp"),
  }
  for (const directory of Object.values(paths)) fs.mkdirSync(directory, { recursive: true })
  configureOpenCodeGlobalPaths(paths)
  return {
    root,
    paths,
    v1Database: path.join(paths.data, "opencode.db"),
    v2Database: path.join(paths.data, "opencode-v2.db"),
  }
}

function sha(file: string) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

function count(file: string, sql: string) {
  const db = new Database(file, { readonly: true })
  try {
    return z.object({ value: z.number() }).parse(db.query(sql).get()).value
  } finally {
    db.close(false)
  }
}

function tables(file: string) {
  const db = new Database(file, { readonly: true })
  try {
    return z.array(z.object({ name: z.string() })).parse(db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all()).map((row) => row.name)
  } finally {
    db.close(false)
  }
}

function temporaryEntries(directory: string) {
  return fs.readdirSync(directory).filter((entry) => entry.includes(".tmp"))
}

function privateCopyModes(directory: string) {
  return temporaryEntries(directory).map((entry) => {
    const stat = fs.statSync(path.join(directory, entry))
    return { directory: stat.isDirectory(), mode: stat.mode & 0o777 }
  })
}

function corruptPages(file: string) {
  const handle = fs.openSync(file, "r+")
  const page = 4096
  fs.writeSync(handle, Buffer.alloc(page * 20, 0x5a), 0, page * 20, page * 40)
  fs.closeSync(handle)
}

function expectSeeded(result: V2DatabaseSeedResult, source: "v1" | "v2") {
  expect(result.kind).toBe("seeded")
  if (result.kind === "seeded") expect(result.source).toBe(source)
}

describe("seeding the v2 database", () => {
  test("a v1 source is copied, its events cleared, its file left unchanged and the copy published with owner-only access", async () => {
    const place = workspace("v1")
    fs.copyFileSync(FIXTURE, place.v1Database)
    const before = sha(place.v1Database)
    const reported: string[] = []
    let duringPreparation: ReturnType<typeof privateCopyModes> = []
    const result = await seedV2Database(place, {
      onUpgrade: () => reported.push("upgrade"),
      beforePrepare: async () => {
        duringPreparation = privateCopyModes(place.paths.data)
      },
    })
    expectSeeded(result, "v1")
    expect(reported).toEqual(["upgrade"])
    expect(duringPreparation.map((entry) => entry.directory)).toEqual([true])
    if (process.platform !== "win32") expect(duringPreparation.map((entry) => entry.mode)).toEqual([0o700])
    expect(sha(place.v1Database)).toBe(before)
    expect(count(place.v2Database, "SELECT COUNT(*) AS value FROM event")).toBe(0)
    expect(count(place.v2Database, "SELECT COUNT(*) AS value FROM session")).toBe(3)
    expect(count(place.v2Database, "SELECT COUNT(*) AS value FROM message")).toBe(22)
    expect(count(place.v2Database, "SELECT COUNT(*) AS value FROM part")).toBe(52)
    expect(count(place.v1Database, "SELECT COUNT(*) AS value FROM event")).toBe(180)
    expect(tables(place.v2Database)).toContain("_buddy_v1_import")
    if (process.platform !== "win32") expect(fs.statSync(place.v2Database).mode & 0o777).toBe(0o600)
    expect(temporaryEntries(place.paths.data)).toEqual([])
    expect(fs.statSync(place.v2Database).size).toBeLessThan(fs.statSync(place.v1Database).size)
    expect(await seedV2Database(place)).toEqual({ kind: "present" })
  })

  test("a stale temporary copy, its side files and a stale private copy folder are removed and the copy is redone", async () => {
    const place = workspace("stale")
    fs.copyFileSync(FIXTURE, place.v1Database)
    for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.writeFileSync(`${place.v2Database}.4242.tmp${suffix}`, "stale")
    fs.mkdirSync(`${place.v2Database}.4343.tmp`)
    fs.writeFileSync(path.join(`${place.v2Database}.4343.tmp`, "opencode-v2.db"), "stale")
    fs.writeFileSync(path.join(place.paths.data, "unrelated.tmp"), "kept")
    expectSeeded(await seedV2Database(place), "v1")
    expect(temporaryEntries(place.paths.data)).toEqual(["unrelated.tmp"])
    expect(count(place.v2Database, "SELECT COUNT(*) AS value FROM session")).toBe(3)
  })

  test("a copy that fails its checks never produces the v2 database", async () => {
    const place = workspace("corrupt")
    fs.copyFileSync(FIXTURE, place.v1Database)
    corruptPages(place.v1Database)
    await expect(seedV2Database(place)).rejects.toThrow()
    expect(fs.existsSync(place.v2Database)).toBe(false)
    expect(temporaryEntries(place.paths.data)).toEqual([])
  })

  test("a cleanup failure after publishing leaves the published copy as the seed result", async () => {
    const place = workspace("cleanup-failure")
    fs.copyFileSync(FIXTURE, place.v1Database)
    const locked: string[] = []
    const result = await seedV2Database(place, {
      beforePrepare: async () => {
        for (const entry of temporaryEntries(place.paths.data)) {
          const folder = path.join(place.paths.data, entry, "held")
          fs.mkdirSync(folder)
          fs.writeFileSync(path.join(folder, "scanner-lock"), "held")
          fs.chmodSync(folder, 0o500)
          locked.push(folder)
        }
      },
    })
    for (const folder of locked) if (fs.existsSync(folder)) fs.chmodSync(folder, 0o700)
    expect(locked).toHaveLength(1)
    expectSeeded(result, "v1")
    expect(count(place.v2Database, "SELECT COUNT(*) AS value FROM session")).toBe(3)
  })

  test("a start with nothing to copy is tried again at the next start, a failed copy only after a delay, but a finished copy is never repeated in the same process", async () => {
    const missing = workspace("memo-missing")
    expect(await ensureV2DatabaseSeeded(missing)).toEqual({ kind: "no-source" })
    fs.copyFileSync(FIXTURE, missing.v1Database)
    const first = await ensureV2DatabaseSeeded(missing)
    expectSeeded(first, "v1")
    fs.rmSync(missing.v2Database)
    expect(await ensureV2DatabaseSeeded(missing)).toBe(first)
    expect(fs.existsSync(missing.v2Database)).toBe(false)

    const present = workspace("memo-present")
    fs.copyFileSync(FIXTURE, present.v1Database)
    expectSeeded(await seedV2Database(present), "v1")
    expect(await ensureV2DatabaseSeeded(present)).toEqual({ kind: "present" })
    fs.rmSync(present.v2Database)
    expectSeeded(await ensureV2DatabaseSeeded(present), "v1")

    const failing = workspace("memo-failure")
    fs.copyFileSync(FIXTURE, failing.v1Database)
    corruptPages(failing.v1Database)
    const failed = ensureV2DatabaseSeeded(failing)
    await expect(failed).rejects.toThrow()
    expect(fs.existsSync(failing.v2Database)).toBe(false)
    fs.copyFileSync(FIXTURE, failing.v1Database)
    expect(ensureV2DatabaseSeeded(failing)).toBe(failed)
    try {
      setSystemTime(new Date(Date.now() + 61_000))
      expectSeeded(await ensureV2DatabaseSeeded(failing), "v1")
    } finally {
      setSystemTime()
    }
    expect(count(failing.v2Database, "SELECT COUNT(*) AS value FROM session")).toBe(3)
  })

  test("a zero-length v2 file left by an interrupted start is replaced by the copy", async () => {
    const place = workspace("zero")
    fs.copyFileSync(FIXTURE, place.v1Database)
    fs.writeFileSync(place.v2Database, "")
    expectSeeded(await seedV2Database(place), "v1")
    expect(count(place.v2Database, "SELECT COUNT(*) AS value FROM session")).toBe(3)
  })

  test("source legacyMessages: no source, an empty source, a v2 source with events and a v1 source without events", async () => {
    const missing = workspace("missing")
    expect(await seedV2Database(missing)).toEqual({ kind: "no-source" })
    expect(fs.existsSync(missing.v2Database)).toBe(false)

    const empty = workspace("empty")
    new Database(empty.v1Database).close(false)
    expect(await seedV2Database(empty)).toEqual({ kind: "empty-source" })
    expect(fs.existsSync(empty.v2Database)).toBe(false)

    const v2 = workspace("v2-source")
    const source = new Database(v2.v1Database)
    source.exec("CREATE TABLE session_v2 (id TEXT PRIMARY KEY)")
    source.exec("CREATE TABLE event (id TEXT PRIMARY KEY, data TEXT)")
    source.exec("INSERT INTO session_v2 VALUES ('ses_kept')")
    source.exec("INSERT INTO event VALUES ('evt_1', '{}'), ('evt_2', '{}')")
    source.close(false)
    expectSeeded(await seedV2Database(v2), "v2")
    expect(count(v2.v2Database, "SELECT COUNT(*) AS value FROM event")).toBe(2)
    expect(tables(v2.v2Database)).not.toContain("_buddy_v1_import")

    const noEvents = workspace("no-events")
    fs.copyFileSync(FIXTURE, noEvents.v1Database)
    const edit = new Database(noEvents.v1Database)
    edit.exec("DROP TABLE event")
    edit.exec("DROP TABLE event_sequence")
    edit.exec("DELETE FROM migration WHERE id IN ('20260323234822_events', '20260504145000_add_sync_owner')")
    edit.close(false)
    expect(tables(noEvents.v1Database)).not.toContain("event")
    expectSeeded(await seedV2Database(noEvents), "v1")
    await using host = await createOpenCodeHost({
      clientName: "buddy-seed-test",
      paths: noEvents.paths,
      databasePath: noEvents.v2Database,
      fetchModels: false,
      fs: { filewatcher: false, fff: false },
      config: { project: false },
    })
    const deadline = Date.now() + 30_000
    let status = await host.migration.v1.status()
    while (status.status !== "completed" && Date.now() < deadline) {
      if (status.status === "error") throw new Error(status.error)
      await Bun.sleep(50)
      status = await host.migration.v1.status()
    }
    expect(status.status).toBe("completed")
    expect(count(noEvents.v2Database, "SELECT COUNT(*) AS value FROM session_v2")).toBe(3)
  })

  test("content the importer drops is counted for that chat", async () => {
    const place = workspace("content")
    fs.copyFileSync(FIXTURE, place.v1Database)
    const db = new Database(place.v1Database)
    const sessionID = "ses_e9bc34367ffeUhIRiVk04oUEhK"
    const base = { sessionID, time: { created: 1_790_000_000_000 } }
    const user = { ...base, id: "msg_1643cbd00001aaaaaaaaaaaaaa", role: "user", agent: "buddy", model: { providerID: "test", modelID: "test-model" } }
    const assistant = {
      ...base,
      id: "msg_1643cbd00002aaaaaaaaaaaaaa",
      role: "assistant",
      parentID: user.id,
      modelID: "test-model",
      providerID: "test",
      mode: "buddy",
      agent: "buddy",
      path: { cwd: "/", root: "/" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    }
    const insertMessage = db.query("INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)")
    const insertPart = db.query("INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)")
    insertMessage.run(user.id, sessionID, 1_790_000_000_000, 1_790_000_000_000, JSON.stringify(user))
    insertMessage.run(assistant.id, sessionID, 1_790_000_000_001, 1_790_000_000_001, JSON.stringify(assistant))
    insertPart.run("prt_1643cbd00001aaaaaaaaaaaaaa", user.id, sessionID, 1, 1, JSON.stringify({
      type: "subtask", prompt: "Summarise the lesson", description: "Summary", agent: "general", command: "summarise",
    }))
    insertPart.run("prt_1643cbd00002aaaaaaaaaaaaaa", assistant.id, sessionID, 1, 1, JSON.stringify({
      type: "tool", callID: "call_1", tool: "task",
      state: { status: "completed", input: {}, output: "Done", title: "Summary", metadata: {}, time: { start: 1, end: 2 } },
    }))
    insertPart.run("prt_1643cbd00003aaaaaaaaaaaaaa", assistant.id, sessionID, 1, 1, JSON.stringify({
      type: "file", mime: "text/plain", filename: "notes.txt", url: "data:text/plain;base64,aGk=",
    }))
    insertPart.run("prt_1643cbd00004aaaaaaaaaaaaaa", "msg_1643cbcd1001lwyv8oVoYEm23s", sessionID, 1, 1, JSON.stringify({
      type: "file", mime: "image/png", filename: "chart.png", url: "data:image/png;base64,aGk=",
    }))
    db.close(false)
    expectSeeded(await seedV2Database(place), "v1")
    expect(readV1ImportRecord(place.v2Database).content).toEqual([
      { sessionID, subtaskPrompts: 1, subtaskResults: 1, assistantFiles: 2 },
    ])
  })

  test("a v1 command keeps the text the learner typed after the import", async () => {
    const place = workspace("commands")
    fs.copyFileSync(FIXTURE, place.v1Database)
    const db = new Database(place.v1Database)
    const sessionID = "ses_e9bc34367ffeUhIRiVk04oUEhK"
    const user = (id: string, created: number) => ({ id, sessionID, role: "user", agent: "buddy", model: { providerID: "test", modelID: "test-model" }, time: { created } })
    const command = user("msg_1643cbd00011aaaaaaaaaaaaaa", 1_790_000_000_000)
    const typed = user("msg_1643cbd00012aaaaaaaaaaaaaa", 1_790_000_000_001)
    const insertMessage = db.query("INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)")
    const insertPart = db.query("INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?, ?)")
    insertMessage.run(command.id, sessionID, command.time.created, command.time.created, JSON.stringify(command))
    insertMessage.run(typed.id, sessionID, typed.time.created, typed.time.created, JSON.stringify(typed))
    insertPart.run("prt_1643cbd00011aaaaaaaaaaaaaa", command.id, sessionID, 1, 1, JSON.stringify({ type: "text", text: "/quiz photosynthesis", ignored: true }))
    insertPart.run("prt_1643cbd00012aaaaaaaaaaaaaa", command.id, sessionID, 1, 1, JSON.stringify({ type: "text", text: "Quiz the learner on photosynthesis.", synthetic: true }))
    insertPart.run("prt_1643cbd00013aaaaaaaaaaaaaa", typed.id, sessionID, 1, 1, JSON.stringify({ type: "text", text: "/note remember this", ignored: true }))
    insertPart.run("prt_1643cbd00014aaaaaaaaaaaaaa", typed.id, sessionID, 1, 1, JSON.stringify({ type: "text", text: "What is chlorophyll?" }))
    const expansion = JSON.stringify({ type: "text", text: "Expanded command instructions.", synthetic: true })
    const legacyMessages = [
      { id: "msg_1643cbd00021aaaaaaaaaaaaaa", parts: [{ type: "text", text: 123, ignored: true }, { type: "text", text: "Number display", synthetic: true }] },
      { id: "msg_1643cbd00022aaaaaaaaaaaaaa", parts: [{ type: "text", text: "/summarise lesson", ignored: true }, { type: "subtask", prompt: "Summarise", description: "Summary", agent: "general" }] },
      { id: "msg_1643cbd00023aaaaaaaaaaaaaa", parts: [{ type: "text", text: "/recap", ignored: true }, { type: "text" }] },
      { id: "msg_1643cbd00024aaaaaaaaaaaaaa", parts: [{ type: "text", text: "Not a command", ignored: 1 }] },
    ]
    for (const [index, legacy] of legacyMessages.entries()) {
      const message = user(legacy.id, 1_790_000_000_002 + index)
      insertMessage.run(message.id, sessionID, message.time.created, message.time.created, JSON.stringify(message))
      for (const [partIndex, part] of legacy.parts.entries()) insertPart.run(`prt_1643cbd0002${index}${partIndex}aaaaaaaaaaaaa`, message.id, sessionID, 1, 1, JSON.stringify(part))
      insertPart.run(`prt_1643cbd0002${index}9aaaaaaaaaaaaa`, message.id, sessionID, 1, 1, expansion)
    }
    db.close(false)
    expectSeeded(await seedV2Database(place), "v1")
    const displays = readV1ImportCommandDisplays(place.v2Database)
    expect(Object.fromEntries(displays)).toEqual({
      [command.id]: "/quiz photosynthesis",
      [legacyMessages[1]!.id]: "/summarise lesson",
      [legacyMessages[2]!.id]: "/recap",
    })
    await using host = await createOpenCodeHost({
      clientName: "buddy-seed-test",
      paths: place.paths,
      databasePath: place.v2Database,
      fetchModels: false,
      fs: { filewatcher: false, fff: false },
      config: { project: false },
    })
    const deadline = Date.now() + 30_000
    let status = await host.migration.v1.status()
    while (status.status !== "completed" && Date.now() < deadline) {
      if (status.status === "error") throw new Error(status.error)
      await Bun.sleep(50)
      status = await host.migration.v1.status()
    }
    expect(status.status).toBe("completed")
    const context = { sessionID, directory: place.root }
    expect((await listMessages(host, context)).items.map((message) => message.info.id)).not.toContain(command.id)
    const listed = (await listMessages(host, { ...context, importedCommandDisplay: (messageID: string) => displays.get(messageID) })).items
    const row = listed.find((message) => message.info.id === command.id)
    expect(row?.info.role).toBe("user")
    expect(row?.parts.map((part) => part.type === "text" ? part.text : undefined)).toEqual(["/quiz photosynthesis"])
    expect(listed.find((message) => message.info.id === typed.id)?.parts.map((part) => part.type === "text" ? part.text : undefined)).toEqual(["What is chlorophyll?"])
  })

  test("two processes seeding at once make one copy and leave no temporary file", async () => {
    const place = workspace("two-seeders")
    fs.copyFileSync(FIXTURE, place.v1Database)
    const script = path.join(place.root, "seed.ts")
    fs.writeFileSync(script, [
      `import { Flock } from ${JSON.stringify(FLOCK_MODULE)}`,
      `import { seedV2Database } from ${JSON.stringify(SEED_MODULE)}`,
      `Flock.setGlobal({ state: ${JSON.stringify(place.paths.state)} })`,
      `const result = await seedV2Database(${JSON.stringify({ v1Database: place.v1Database, v2Database: place.v2Database })}, { beforePrepare: () => Bun.sleep(500) })`,
      "console.log(JSON.stringify(result.kind))",
    ].join("\n"))
    const run = () => Bun.spawn([process.execPath, script], { stdout: "pipe", stderr: "pipe" })
    const children = [run(), run()]
    const outputs = await Promise.all(children.map(async (child) => {
      const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      if (code !== 0) throw new Error(stderr)
      return z.string().parse(JSON.parse(stdout.trim()))
    }))
    expect(outputs.toSorted()).toEqual(["published-elsewhere", "seeded"])
    expect(temporaryEntries(place.paths.data)).toEqual([])
    expect(count(place.v2Database, "SELECT COUNT(*) AS value FROM session")).toBe(3)
  })

  test("committed WAL rows are included in the seeded copy", async () => {
    const place = workspace("committed-wal")
    fs.copyFileSync(FIXTURE, place.v1Database)
    const source = new Database(place.v1Database)
    try {
      source.exec("PRAGMA journal_mode = WAL")
      source.exec("PRAGMA wal_autocheckpoint = 0")
      source.exec("CREATE TABLE IF NOT EXISTS writer_probe (id INTEGER PRIMARY KEY, value TEXT)")
      const rows = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, value: `committed-${index + 1}` }))
      source.transaction(() => {
        const insert = source.query("INSERT INTO writer_probe (id, value) VALUES (?, ?)")
        for (const row of rows) insert.run(row.id, row.value)
      })()
      expect(fs.existsSync(`${place.v1Database}-wal`)).toBe(true)
      expect(fs.statSync(`${place.v1Database}-wal`).size).toBeGreaterThan(0)

      expectSeeded(await seedV2Database(place), "v1")

      const copy = new Database(place.v2Database, { readonly: true })
      try {
        expect(copy.query("SELECT id, value FROM writer_probe ORDER BY id").all()).toEqual(rows)
      } finally {
        copy.close(false)
      }
    } finally {
      source.close(false)
    }
  })

  test("a v1 writer during the copy: the copy finishes and passes its checks, and the v1 file holds only the writer's changes", async () => {
    const place = workspace("writer")
    fs.copyFileSync(FIXTURE, place.v1Database)
    const prepare = new Database(place.v1Database)
    prepare.exec("PRAGMA journal_mode = WAL")
    prepare.exec("CREATE TABLE writer_probe (id INTEGER PRIMARY KEY, value TEXT)")
    prepare.close(false)
    const tablesBefore = digestTables(place.v1Database)
    const stop = path.join(place.root, "stop")
    const writerScript = path.join(place.root, "writer.ts")
    fs.writeFileSync(writerScript, [
      'import { Database } from "bun:sqlite"',
      'import { existsSync } from "node:fs"',
      `const db = new Database(${JSON.stringify(place.v1Database)})`,
      'db.exec("PRAGMA busy_timeout = 5000")',
      "let rows = 0",
      `while (!existsSync(${JSON.stringify(stop)})) { db.query("INSERT INTO writer_probe (value) VALUES (?)").run("x".repeat(512)); rows += 1 }`,
      "db.close(false)",
      "console.log(rows)",
    ].join("\n"))
    const writer = Bun.spawn([process.execPath, writerScript], { stdout: "pipe", stderr: "pipe" })
    await Bun.sleep(200)
    let committedRows = 0
    try {
      committedRows = count(place.v1Database, "SELECT COUNT(*) AS value FROM writer_probe")
      expectSeeded(await seedV2Database(place), "v1")
    } finally {
      fs.writeFileSync(stop, "")
    }
    const rows = Number((await new Response(writer.stdout).text()).trim())
    expect(await writer.exited).toBe(0)
    expect(rows).toBeGreaterThan(0)
    const check = new Database(place.v2Database, { readonly: true })
    expect(check.query("PRAGMA quick_check").all()).toEqual([{ quick_check: "ok" }])
    check.close(false)
    expect(count(place.v1Database, "SELECT COUNT(*) AS value FROM writer_probe")).toBe(rows)
    expect(count(place.v2Database, "SELECT COUNT(*) AS value FROM writer_probe")).toBeGreaterThanOrEqual(committedRows)
    expect(digestTables(place.v1Database)).toEqual(tablesBefore)
  })
})

function digestTables(file: string) {
  const db = new Database(file, { readonly: true })
  try {
    const names = z.array(z.object({ name: z.string() })).parse(
      db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'writer_probe' ORDER BY name").all(),
    ).map((row) => row.name)
    return Object.fromEntries(names.map((name) => [name, createHash("sha256").update(JSON.stringify(db.query(`SELECT * FROM "${name}" ORDER BY rowid`).all())).digest("hex")]))
  } finally {
    db.close(false)
  }
}
