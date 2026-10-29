import { afterEach, describe, expect, test } from "bun:test"
import { Database as BunDatabase } from "bun:sqlite"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import z from "zod"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { startV1ImportLaunch } from "../src/host"
import { Database } from "../src/legacy-migration-database"
import { v2DatabaseLock } from "../src/seed-v2-database"
import {
  isUncountedV1ImportFailure,
  prepareV1ImportAttempt,
  readV1ImportPosition,
  readV1ImportRecord,
  recordV1ImportOutcome,
  releaseV1ImportAttempt,
  skipV1ImportCandidate,
  type V1ImportAttempt,
} from "../src/v1-import-guard"

const SESSIONS = ["ses_d", "ses_c", "ses_b", "ses_a"] as const
const KEY = "migration.v1-v2"
let counter = 0
const opened: Database[] = []

function createDatabase(
  state: { readonly phase: string; readonly cursor?: string } | undefined,
  options: { readonly kv?: boolean } = {},
) {
  counter += 1
  const directory = path.join(TEST_SANDBOX.root, "v1-import-guard")
  fs.mkdirSync(directory, { recursive: true })
  const file = path.join(directory, `guard-${counter}.db`)
  const seed = new BunDatabase(file)
  seed.exec("CREATE TABLE session (id TEXT PRIMARY KEY)")
  for (const id of SESSIONS) seed.query("INSERT INTO session (id) VALUES (?)").run(id)
  if (options.kv !== false) {
    seed.exec(
      "CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, time_created INTEGER, time_updated INTEGER)",
    )
    if (state)
      seed.query("INSERT INTO kv (key, value) VALUES (?, ?)").run(KEY, JSON.stringify(state))
  }
  seed.close(false)
  return file
}

function open(file: string) {
  const db = new Database(file)
  opened.push(db)
  return db
}

function stateText(file: string) {
  const db = new BunDatabase(file, { readonly: true })
  try {
    return z
      .object({ value: z.string() })
      .parse(db.query("SELECT value FROM kv WHERE key = ?").get(KEY)).value
  } finally {
    db.close(false)
  }
}

function attemptOf(file: string): V1ImportAttempt | undefined {
  const db = new BunDatabase(file, { readonly: true })
  try {
    const table = db.query("SELECT name FROM sqlite_master WHERE name = '_buddy_v1_import'").get()
    if (!table) return undefined
    const row = z
      .object({ value: z.string() })
      .safeParse(db.query("SELECT value FROM _buddy_v1_import WHERE key = 'attempt'").get())
    if (!row.success) return undefined
    return z
      .object({
        cursor: z.string().nullable(),
        candidate: z.string(),
        running: z.boolean(),
        failures: z.number(),
        interruptions: z.number(),
        lastError: z.string().nullable(),
      })
      .parse(JSON.parse(row.data.value))
  } finally {
    db.close(false)
  }
}

function start(file: string) {
  const db = open(file)
  return prepareV1ImportAttempt(db)
}

function fail(file: string, error: string) {
  recordV1ImportOutcome(open(file), { status: "error", error })
}

function advance(file: string, cursor: string) {
  const db = new BunDatabase(file)
  db.query("UPDATE kv SET value = ? WHERE key = ?").run(
    JSON.stringify({ phase: "sessions", cursor }),
    KEY,
  )
  db.close(false)
}

function writeAttempt(file: string, attempt: V1ImportAttempt) {
  const db = new BunDatabase(file)
  db.exec("CREATE TABLE IF NOT EXISTS _buddy_v1_import (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
  db.query("INSERT OR REPLACE INTO _buddy_v1_import (key, value) VALUES ('attempt', ?)").run(
    JSON.stringify(attempt),
  )
  db.close(false)
}

function complete(file: string) {
  const db = new BunDatabase(file)
  db.query("UPDATE kv SET value = ? WHERE key = ?").run(JSON.stringify({ phase: "completed" }), KEY)
  db.close(false)
}

async function writeImportOwner(file: string, pid: number) {
  const lock = await v2DatabaseLock(file, "buddy-v1-chat-import")
  const recordPath = path.join(
    lock.dir,
    `buddy-v1-import-owner-${createHash("sha256").update(lock.key).digest("hex").slice(0, 16)}.json`,
  )
  fs.mkdirSync(lock.dir, { recursive: true })
  fs.writeFileSync(
    recordPath,
    JSON.stringify({ pid, hostname: os.hostname(), token: randomUUID() }),
  )
  return recordPath
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close()
})

describe("v1 import guard", () => {
  test("does nothing without the importer's state, without a kv table, or once the import is completed", () => {
    for (const file of [
      createDatabase(undefined),
      createDatabase(undefined, { kv: false }),
      createDatabase({ phase: "completed" }),
    ]) {
      expect(start(file)).toBeUndefined()
      fail(file, "UNIQUE constraint failed: session_message.id")
      fail(file, "UNIQUE constraint failed: session_message.id")
      expect(start(file)).toBeUndefined()
      expect(attemptOf(file)).toBeUndefined()
      expect(readV1ImportRecord(file).skipped).toEqual([])
    }
    const completed = createDatabase({ phase: "completed" })
    expect(stateText(completed)).toBe(JSON.stringify({ phase: "completed" }))
  })

  test("the candidate is the importer's own next session: the newest ID below the cursor, or the newest without one", () => {
    expect(readV1ImportPosition(open(createDatabase({ phase: "sessions" })))?.candidate).toBe(
      "ses_d",
    )
    expect(
      readV1ImportPosition(open(createDatabase({ phase: "sessions", cursor: "ses_c" })))?.candidate,
    ).toBe("ses_b")
    expect(
      readV1ImportPosition(open(createDatabase({ phase: "sessions", cursor: "ses_a" }))),
    ).toBeUndefined()
  })

  test("two non-transient failures at the same cursor skip that session by moving the cursor to it", () => {
    const file = createDatabase({ phase: "sessions", cursor: "ses_c" })
    start(file)
    fail(file, "UNIQUE constraint failed: session_message.id")
    expect(attemptOf(file)).toMatchObject({
      cursor: "ses_c",
      candidate: "ses_b",
      failures: 1,
      running: false,
    })
    start(file)
    fail(file, "UNIQUE constraint failed: session_message.id")
    expect(attemptOf(file)).toMatchObject({ failures: 2 })
    expect(stateText(file)).toBe(JSON.stringify({ phase: "sessions", cursor: "ses_c" }))
    const marked = start(file)
    expect(stateText(file)).toBe(JSON.stringify({ phase: "sessions", cursor: "ses_b" }))
    expect(readV1ImportRecord(file).skipped).toMatchObject([
      { id: "ses_b", error: "UNIQUE constraint failed: session_message.id" },
    ])
    expect(marked).toMatchObject({
      cursor: "ses_b",
      candidate: "ses_a",
      running: true,
      failures: 0,
      interruptions: 0,
    })
  })

  test("a failure is attributed to the session the importer stopped at, not the one it started from", () => {
    const file = createDatabase({ phase: "sessions" })
    start(file)
    advance(file, "ses_c")
    fail(file, "Failed to copy V1 session ses_b")
    expect(attemptOf(file)).toMatchObject({ cursor: "ses_c", candidate: "ses_b", failures: 1 })
  })

  test("no backwards move: a skip whose stored state has moved on or completed changes nothing", () => {
    const moved = createDatabase({ phase: "sessions", cursor: "ses_c" })
    const db = open(moved)
    const position = readV1ImportPosition(db)
    if (!position) throw new Error("Expected an import position")
    const attempt = {
      ...position,
      running: false,
      failures: 2,
      interruptions: 0,
      lastError: "boom",
    }
    advance(moved, "ses_b")
    skipV1ImportCandidate(db, position, attempt, [])
    expect(stateText(moved)).toBe(JSON.stringify({ phase: "sessions", cursor: "ses_b" }))
    expect(readV1ImportRecord(moved).skipped).toEqual([])

    const completed = createDatabase({ phase: "sessions", cursor: "ses_c" })
    const completedDb = open(completed)
    const before = readV1ImportPosition(completedDb)
    if (!before) throw new Error("Expected an import position")
    const writer = new BunDatabase(completed)
    writer
      .query("UPDATE kv SET value = ? WHERE key = ?")
      .run(JSON.stringify({ phase: "completed" }), KEY)
    writer.close(false)
    skipV1ImportCandidate(
      completedDb,
      before,
      { ...before, running: false, failures: 2, interruptions: 0, lastError: "boom" },
      [],
    )
    expect(stateText(completed)).toBe(JSON.stringify({ phase: "completed" }))
    expect(readV1ImportRecord(completed).skipped).toEqual([])
    expect(start(completed)).toBeUndefined()
    expect(stateText(completed)).toBe(JSON.stringify({ phase: "completed" }))

    const stale = createDatabase({ phase: "sessions", cursor: "ses_c" })
    start(stale)
    fail(stale, "boom")
    start(stale)
    fail(stale, "boom")
    advance(stale, "ses_b")
    expect(start(stale)).toMatchObject({ cursor: "ses_b", candidate: "ses_a", failures: 0 })
    expect(stateText(stale)).toBe(JSON.stringify({ phase: "sessions", cursor: "ses_b" }))
    expect(readV1ImportRecord(stale).skipped).toEqual([])
  })

  test("transient SQLite failures never count toward a skip", () => {
    const file = createDatabase({ phase: "sessions", cursor: "ses_c" })
    for (const error of [
      "database is locked",
      "SqlError: Failed to execute statement\nCaused by: SQLITE_BUSY: database is locked",
      "database or disk is full",
      "disk I/O error",
      "SQLITE_IOERR_WRITE",
      "SQLITE_INTERRUPT",
      "out of memory",
      "database disk image is malformed",
    ]) {
      expect(isUncountedV1ImportFailure(error)).toBe(true)
      start(file)
      fail(file, error)
      expect(attemptOf(file)).toMatchObject({ failures: 0, running: false })
    }
    start(file)
    expect(stateText(file)).toBe(JSON.stringify({ phase: "sessions", cursor: "ses_c" }))
    expect(readV1ImportRecord(file).skipped).toEqual([])
    expect(isUncountedV1ImportFailure("UNIQUE constraint failed: session_message.id")).toBe(false)
  })

  test("a failed insert counts by its SQLite cause, not by words in the chat content it carried", () => {
    const query =
      'Failed query: insert into "session_message" ("data") values (?)\nparams: {"error":{"type":"tool.interrupted","message":"Tool execution was interrupted before V2 migration","detail":"out of memory, database is locked"}}'
    expect(
      isUncountedV1ImportFailure(
        `${query}\nCaused by: UNIQUE constraint failed: session_message.id`,
      ),
    ).toBe(false)
    expect(isUncountedV1ImportFailure(`${query}\nCaused by: SQLITE_BUSY: database is locked`)).toBe(
      true,
    )
  })

  test("three starts that end without an outcome at the same cursor skip that session; a graceful close never counts", () => {
    const file = createDatabase({ phase: "sessions", cursor: "ses_d" })
    expect(start(file)).toMatchObject({ candidate: "ses_c", interruptions: 0, running: true })
    releaseV1ImportAttempt(open(file))
    expect(start(file)).toMatchObject({ interruptions: 0, running: true })
    expect(start(file)).toMatchObject({ interruptions: 1 })
    expect(start(file)).toMatchObject({ interruptions: 2 })
    expect(stateText(file)).toBe(JSON.stringify({ phase: "sessions", cursor: "ses_d" }))
    expect(start(file)).toMatchObject({ cursor: "ses_c", candidate: "ses_b", interruptions: 0 })
    expect(stateText(file)).toBe(JSON.stringify({ phase: "sessions", cursor: "ses_c" }))
    expect(readV1ImportRecord(file).skipped.map((entry) => entry.id)).toEqual(["ses_c"])
  })

  test("after three skips a fourth failing session is reported but never skipped", () => {
    const file = createDatabase({ phase: "sessions" })
    const extra = new BunDatabase(file)
    for (const id of ["ses_0", "ses_1"]) extra.query("INSERT INTO session (id) VALUES (?)").run(id)
    extra.close(false)
    for (const _ of [1, 2, 3]) {
      start(file)
      fail(file, "boom")
      start(file)
      fail(file, "boom")
    }
    start(file)
    expect(readV1ImportRecord(file).skipped.map((entry) => entry.id)).toEqual([
      "ses_d",
      "ses_c",
      "ses_b",
    ])
    const capped = stateText(file)
    expect(capped).toBe(JSON.stringify({ phase: "sessions", cursor: "ses_b" }))
    for (const _ of [1, 2, 3, 4]) {
      fail(file, "boom")
      start(file)
    }
    expect(stateText(file)).toBe(capped)
    expect(readV1ImportRecord(file).skipped).toHaveLength(3)
    expect(attemptOf(file)).toMatchObject({ candidate: "ses_a", failures: 4 })
  })

  test("one launch imports at a time: the next waits as migrating, a stale running mark counts once, and a completed import is not started again", async () => {
    const file = createDatabase({ phase: "sessions", cursor: "ses_d" })
    writeAttempt(file, {
      cursor: "ses_d",
      candidate: "ses_c",
      running: true,
      failures: 0,
      interruptions: 0,
      lastError: null,
    })
    const unexpectedWaits: string[] = []
    const first = await startV1ImportLaunch(file, { onWait: () => unexpectedWaits.push("first") })
    expect(first.importRan).toBe(true)
    expect(attemptOf(file)).toMatchObject({ running: true, interruptions: 1 })

    const secondWaiting = Promise.withResolvers<void>()
    let secondStarted = false
    const second = startV1ImportLaunch(file, { onWait: () => secondWaiting.resolve() }).then(
      (guard) => {
        secondStarted = true
        return guard
      },
    )
    await secondWaiting.promise
    expect(secondStarted).toBe(false)
    expect(attemptOf(file)).toMatchObject({ interruptions: 1 })
    await first.close()
    const secondGuard = await second
    expect(secondGuard.importRan).toBe(true)
    expect(attemptOf(file)).toMatchObject({ running: true, interruptions: 1 })

    const thirdWaiting = Promise.withResolvers<void>()
    const third = startV1ImportLaunch(file, { onWait: () => thirdWaiting.resolve() })
    await thirdWaiting.promise
    complete(file)
    secondGuard.watch({ status: () => Promise.resolve({ status: "completed" }) })
    const thirdGuard = await third
    expect(thirdGuard.importRan).toBe(false)
    expect(stateText(file)).toBe(JSON.stringify({ phase: "completed" }))
    expect(attemptOf(file)).toBeUndefined()
    expect(unexpectedWaits).toEqual([])
    await Promise.all([secondGuard.close(), thirdGuard.close()])
  })

  test("a stalled but live owner keeps its import lease until it closes", async () => {
    const file = createDatabase({ phase: "sessions", cursor: "ses_d" })
    const first = await startV1ImportLaunch(file, { onWait: () => undefined })
    let second: ReturnType<typeof startV1ImportLaunch> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const lock = await v2DatabaseLock(file, "buddy-v1-chat-import")
      const directory = fs
        .readdirSync(lock.dir, { withFileTypes: true })
        .find((entry) => entry.isDirectory() && entry.name.endsWith(".lock"))
      if (!directory) throw new Error("Expected the first launch's Flock directory")
      const lockDirectory = path.join(lock.dir, directory.name)
      const stalledAt = new Date(Date.now() - 2 * 60_000)
      for (const name of fs.readdirSync(lockDirectory))
        fs.utimesSync(path.join(lockDirectory, name), stalledAt, stalledAt)
      fs.utimesSync(lockDirectory, stalledAt, stalledAt)

      const secondWaiting = Promise.withResolvers<void>()
      timer = setTimeout(
        () => secondWaiting.reject(new Error("The second launch did not wait within 1.5 seconds")),
        1_500,
      )
      let secondStarted = false
      second = startV1ImportLaunch(file, { onWait: () => secondWaiting.resolve() }).then(
        (guard) => {
          secondStarted = true
          return guard
        },
      )
      const outcome = await Promise.race([
        secondWaiting.promise.then(() => "waiting"),
        second.then(() => "started"),
      ])
      expect(outcome).toBe("waiting")
      expect(secondStarted).toBe(false)
      await first.close()
      expect((await second).importRan).toBe(true)
    } finally {
      clearTimeout(timer)
      await first.close()
      if (second) await (await second).close()
    }
  })

  test("a dead owner record does not delay the next import launch", async () => {
    const file = createDatabase({ phase: "sessions", cursor: "ses_d" })
    const child = Bun.spawn([process.execPath, "-e", ""], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    })
    expect(await child.exited).toBe(0)
    await writeImportOwner(file, child.pid)
    const waits: string[] = []
    const guard = await startV1ImportLaunch(file, { onWait: () => waits.push("waiting") })
    try {
      expect(guard.importRan).toBe(true)
      expect(waits).toEqual([])
    } finally {
      await guard.close()
    }
  })

  test("an owner record older than ten minutes does not delay the next import launch", async () => {
    const file = createDatabase({ phase: "sessions", cursor: "ses_d" })
    const recordPath = await writeImportOwner(file, process.pid)
    const old = new Date(Date.now() - 11 * 60_000)
    fs.utimesSync(recordPath, old, old)
    const waits: string[] = []
    const guard = await startV1ImportLaunch(file, { onWait: () => waits.push("waiting") })
    try {
      expect(guard.importRan).toBe(true)
      expect(waits).toEqual([])
    } finally {
      await guard.close()
    }
  })

  test("a brand-new database is locked until its first import run settles, without creating the file", async () => {
    counter += 1
    const directory = path.join(TEST_SANDBOX.root, "v1-import-guard")
    fs.mkdirSync(directory, { recursive: true })
    const file = path.join(directory, `fresh-${counter}.db`)
    const first = await startV1ImportLaunch(file, { onWait: () => undefined })
    expect(first.importRan).toBe(false)
    expect(fs.existsSync(file)).toBe(false)
    const secondWaiting = Promise.withResolvers<void>()
    let secondStarted = false
    const second = startV1ImportLaunch(file, { onWait: () => secondWaiting.resolve() }).then(
      (guard) => {
        secondStarted = true
        return guard
      },
    )
    await secondWaiting.promise
    expect(secondStarted).toBe(false)
    first.watch({ status: () => Promise.resolve({ status: "completed" }) })
    const secondGuard = await second
    await Promise.all([first.close(), secondGuard.close()])
  })

  test("an existing empty database is locked like a missing one", async () => {
    counter += 1
    const directory = path.join(TEST_SANDBOX.root, "v1-import-guard")
    fs.mkdirSync(directory, { recursive: true })
    const file = path.join(directory, `empty-${counter}.db`)
    fs.writeFileSync(file, "")
    const first = await startV1ImportLaunch(file, { onWait: () => undefined })
    const secondWaiting = Promise.withResolvers<void>()
    let secondStarted = false
    const second = startV1ImportLaunch(file, { onWait: () => secondWaiting.resolve() }).then(
      (guard) => {
        secondStarted = true
        return guard
      },
    )
    await secondWaiting.promise
    expect(secondStarted).toBe(false)
    first.watch({ status: () => Promise.resolve({ status: "completed" }) })
    await Promise.all([first.close(), (await second).close()])
  })

  test("a window whose import failed reports completion once another window finishes the import", async () => {
    const file = createDatabase({ phase: "sessions", cursor: "ses_c" })
    const guard = await startV1ImportLaunch(file, { onWait: () => undefined })
    guard.watch({ status: () => Promise.resolve({ status: "error", error: "disk I/O error" }) })
    while (guard.status() === undefined) await Promise.resolve()
    expect(guard.status()).toMatchObject({ status: "error" })
    complete(file)
    expect(guard.status()).toEqual({ status: "completed" })
    await guard.close()
  })

  test("a completed import clears the attempt", () => {
    const file = createDatabase({ phase: "sessions", cursor: "ses_c" })
    start(file)
    recordV1ImportOutcome(open(file), { status: "completed" })
    expect(attemptOf(file)).toBeUndefined()
  })
})
