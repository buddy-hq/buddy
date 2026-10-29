import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import z from "zod"
import {
  restoreV1UpgradeFixture,
  V1_UPGRADE_FIXTURE,
  type RestoredV1UpgradeFixture,
} from "../../script/v1-upgrade-fixture"
import { app } from "../../src/app"
import { Schema } from "effect"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { Session } from "@buddy/transcript-contract/session"
import { Config } from "../../src/config/config"
import { closeAgentRuntime, getAgentRuntime } from "../../src/runtime/agent-runtime"
import { Global } from "../../src/storage/global"
import fixtureReport from "../fixtures/v1-upgrade/report.json"
import { runtimeHost } from "../helpers/opencode"

const importReportSchema = z.object({
  upgrade: z.object({ state: z.string(), error: z.string().optional() }),
  import: z.object({ status: z.string(), error: z.string().optional() }).nullable(),
  skipped: z.array(z.object({ id: z.string(), at: z.number(), error: z.string() })),
  content: z.array(
    z.object({
      sessionID: z.string(),
      subtaskPrompts: z.number(),
      subtaskResults: z.number(),
      assistantFiles: z.number(),
    }),
  ),
})

let fixture: RestoredV1UpgradeFixture
let dataDirectory: string
let v1Before: Readonly<Record<string, string>>
let fixtureRoot: string | undefined
let previousConfig: Config.Info | undefined

function directoryHeader(directory: string) {
  return [...directory].some((character) => (character.codePointAt(0) ?? 0) > 0x7f)
    ? encodeURIComponent(directory)
    : directory
}

async function request(route: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("x-buddy-directory", directoryHeader(fixture.notebook))
  if (init.body !== undefined) headers.set("content-type", "application/json")
  return app.request(`/api${route}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  })
}

async function json(route: string, init: RequestInit = {}) {
  const response = await request(route, init)
  if (!response.ok)
    throw new Error(`${init.method ?? "GET"} ${route}: ${response.status} ${await response.text()}`)
  const data: unknown = await response.json()
  return data
}

const api = {
  json,
  async sessions() {
    return Schema.decodeUnknownSync(Schema.Array(Session))(
      await json(`/session?roots=true&directory=${encodeURIComponent(fixture.notebook)}`),
    )
  },
  async session(sessionID: string) {
    return Schema.decodeUnknownSync(Session)(await json(`/session/${sessionID}`))
  },
  async children(sessionID: string) {
    return Schema.decodeUnknownSync(Schema.Array(Session))(
      await json(`/session/${sessionID}/children`),
    )
  },
  async messages(sessionID: string) {
    return Schema.decodeUnknownSync(Schema.Array(MessageWithParts))(
      await json(`/session/${sessionID}/message`),
    )
  },
  async prompt(sessionID: string, content: string) {
    return request(`/session/${sessionID}/message`, {
      method: "POST",
      body: JSON.stringify({ content, noReply: true }),
    })
  },
  async restart() {
    await closeAgentRuntime()
    await getAgentRuntime()
  },
}

const rowSchema = z.object({ id: z.string(), sessionID: z.string(), type: z.string().optional() })

function readRows(file: string, sql: string) {
  const db = new Database(file, { readonly: true })
  try {
    return z.array(rowSchema).parse(db.query(sql).all())
  } finally {
    db.close(false)
  }
}

const DUMMY_SESSION_ID = "ses_000000000000zzzzzzzzzzzzzz"
const MIGRATION_STATE_KEY = "migration.v1-v2"
const SESSION_IDS = [
  V1_UPGRADE_FIXTURE.parentSessionID,
  V1_UPGRADE_FIXTURE.childSessionID,
  V1_UPGRADE_FIXTURE.separateSessionID,
] as const

function v2Path() {
  return path.join(dataDirectory, "opencode-v2.db")
}

function editV2(run: (db: Database) => void) {
  const db = new Database(v2Path())
  try {
    db.exec("PRAGMA foreign_keys = ON")
    db.transaction(() => run(db))()
  } finally {
    db.close(false)
  }
}

function removeImported(db: Database, sessionIDs: readonly string[]) {
  for (const sessionID of sessionIDs) {
    db.query("DELETE FROM session_v2 WHERE id = ?").run(sessionID)
    db.query("DELETE FROM event_sequence WHERE aggregate_id = ?").run(sessionID)
  }
}

function setImportState(
  db: Database,
  state: { readonly phase: "sessions"; readonly cursor?: string },
) {
  db.query("UPDATE kv SET value = ? WHERE key = ?").run(JSON.stringify(state), MIGRATION_STATE_KEY)
}

function clearGuard(db: Database) {
  db.exec("DELETE FROM _buddy_v1_import WHERE key IN ('attempt', 'skipped')")
}

function copyDummySession(db: Database) {
  db.query("DELETE FROM session_v2 WHERE id = ?").run(DUMMY_SESSION_ID)
  db.exec("DROP TABLE IF EXISTS temp.dummy_row")
  db.query("CREATE TEMP TABLE dummy_row AS SELECT * FROM session_v2 WHERE id = ?").run(
    V1_UPGRADE_FIXTURE.separateSessionID,
  )
  db.query("UPDATE dummy_row SET id = ?, title = 'Blocking session'").run(DUMMY_SESSION_ID)
}

function blockImportOf(db: Database, messageID: string) {
  db.exec("INSERT INTO session_v2 SELECT * FROM dummy_row")
  db.query(
    "INSERT INTO session_message (id, session_id, type, seq, time_created, time_updated, data) VALUES (?, ?, 'synthetic', 0, 1, 1, ?)",
  ).run(
    messageID,
    DUMMY_SESSION_ID,
    JSON.stringify({ text: "Blocks the import of one chat", time: { created: 1 } }),
  )
}

function readState() {
  const db = new Database(v2Path(), { readonly: true })
  try {
    const row = z
      .object({ value: z.string() })
      .parse(db.query("SELECT value FROM kv WHERE key = ?").get(MIGRATION_STATE_KEY))
    return z
      .object({ phase: z.string(), cursor: z.string().optional() })
      .parse(JSON.parse(row.value))
  } finally {
    db.close(false)
  }
}

function readAttempt() {
  const db = new Database(v2Path(), { readonly: true })
  try {
    const row = z
      .object({ value: z.string() })
      .parse(db.query("SELECT value FROM _buddy_v1_import WHERE key = 'attempt'").get())
    const parsed: unknown = JSON.parse(row.value)
    return parsed
  } finally {
    db.close(false)
  }
}

function importedSessionIDs() {
  const db = new Database(v2Path(), { readonly: true })
  try {
    return z
      .array(z.object({ id: z.string() }))
      .parse(db.query("SELECT id FROM session_v2 WHERE id != ? ORDER BY id").all(DUMMY_SESSION_ID))
      .map((row) => row.id)
  } finally {
    db.close(false)
  }
}

async function digest(file: string) {
  return createHash("sha256")
    .update(await fs.readFile(file))
    .digest("hex")
}

async function v1Files() {
  const entries: Record<string, string> = {}
  for (const suffix of ["", "-wal"]) {
    const file = `${fixture.v1Database}${suffix}`
    const stat = await fs.stat(file).catch(() => undefined)
    if (stat && stat.size > 0) entries[suffix || "main"] = await digest(file)
  }
  return entries
}

async function importReport() {
  const response = await app.request("/api/runtime/v1-import")
  expect(response.status).toBe(200)
  return importReportSchema.parse(await response.json())
}

async function waitForImport(expected: "completed" | "error") {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const report = await importReport()
    if (report.import?.status === expected) return report
    if (report.import?.status === "error" && expected !== "error")
      throw new Error(`Import failed: ${report.import.error}`)
    await Bun.sleep(100)
  }
  throw new Error(`Import did not reach ${expected}`)
}

async function removeSandboxDatabases(files: readonly string[]) {
  for (const file of files) {
    for (const suffix of ["", "-wal", "-shm", "-journal"])
      await fs.rm(path.join(dataDirectory, `${file}${suffix}`), { force: true })
  }
}

beforeAll(async () => {
  const runRoot = process.env.BUDDY_TEST_XDG_ROOT
  const dataHome = process.env.XDG_DATA_HOME
  if (!runRoot || !dataHome)
    throw new Error("The v1 import proof requires the isolated Buddy preload")
  dataDirectory = path.join(dataHome, "buddy", "opencode")
  await closeAgentRuntime()
  await removeSandboxDatabases(["opencode-v2.db"])
  fixtureRoot = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "v1 upgrade's fixture é ")),
  )
  const root = fixtureRoot
  fixture = restoreV1UpgradeFixture({
    root,
    openCodeDataDirectory: dataDirectory,
    stateDirectory: Global.Path.state,
  })
  previousConfig = await Config.getGlobal()
  await Config.replaceGlobal({
    ...previousConfig,
    notebook_home: fixture.buddyHome,
    notes_directory: fixture.notesDirectory,
  })
  v1Before = await v1Files()
})

afterAll(async () => {
  await closeAgentRuntime()
  if (previousConfig) await Config.replaceGlobal(previousConfig)
  if (dataDirectory) {
    await removeSandboxDatabases(["opencode-v2.db", "opencode.db"])
    await fs.rm(path.join(dataDirectory, "auth.json"), { force: true })
  }
  if (fixtureRoot) await fs.rm(fixtureRoot, { recursive: true, force: true })
})

describe("v1 chat import on Bun", () => {
  test("a fresh upgrade copies the v1 database, imports every chat and leaves the v1 file untouched", async () => {
    const health = await app.request("/api/health", { signal: AbortSignal.timeout(3_000) })
    expect(health.status).toBe(200)
    await getAgentRuntime()
    const report = await waitForImport("completed")
    expect(report.upgrade.state).toBe("ready")
    expect(report.skipped).toEqual([])

    const v2 = path.join(dataDirectory, "opencode-v2.db")
    const stat = await fs.stat(v2)
    if (process.platform !== "win32") expect(stat.mode & 0o777).toBe(0o600)
    expect(await v1Files()).toEqual(v1Before)
    expect((await fs.readdir(dataDirectory)).filter((entry) => entry.includes(".tmp"))).toEqual([])

    const roots = await api.sessions()
    expect(roots.map((session) => session.id).toSorted()).toEqual(
      [V1_UPGRADE_FIXTURE.parentSessionID, V1_UPGRADE_FIXTURE.separateSessionID].toSorted(),
    )
    for (const session of roots) expect(session.directory).toBe(fixture.notebook)
    const [child] = await api.children(V1_UPGRADE_FIXTURE.parentSessionID)
    expect(child?.id).toBe(V1_UPGRADE_FIXTURE.childSessionID)
    expect(child?.parentID).toBe(V1_UPGRADE_FIXTURE.parentSessionID)
    expect((await api.session(V1_UPGRADE_FIXTURE.parentSessionID)).title).toBe(
      V1_UPGRADE_FIXTURE.parentTitle,
    )
    expect((await api.session(V1_UPGRADE_FIXTURE.separateSessionID)).title).toBe(
      V1_UPGRADE_FIXTURE.separateTitle,
    )

    const parent = await api.messages(V1_UPGRADE_FIXTURE.parentSessionID)
    const texts = parent.map((message) =>
      message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"),
    )
    expect(parent.map((message) => message.info.id)).toContain(V1_UPGRADE_FIXTURE.citedMessageID)
    expect(texts.some((text) => text.includes("What is photosynthesis?"))).toBe(true)
    expect(texts.some((text) => text.includes("```mermaid"))).toBe(true)
    expect(
      parent
        .flatMap((message) => message.parts)
        .some((part) => part.type === "tool" && part.tool === "read"),
    ).toBe(true)
    expect(
      parent
        .flatMap((message) => message.parts)
        .some((part) => part.type === "file" && part.mime === "image/png"),
    ).toBe(true)
    expect(
      texts.some((text) =>
        text.includes("[Attachment unavailable after migration: reading-list.txt (text/plain)]"),
      ),
    ).toBe(true)
    const v1Rows = readRows(fixture.v1Database, "SELECT id, session_id AS sessionID FROM message")
    const v2Rows = readRows(v2, "SELECT id, session_id AS sessionID, type FROM session_message")
    expect(v1Rows).toHaveLength(V1_UPGRADE_FIXTURE.messages)
    for (const row of v1Rows) {
      if (row.id === V1_UPGRADE_FIXTURE.compactionSummaryMessageID) continue
      expect(v2Rows.find((entry) => entry.id === row.id)?.sessionID).toBe(row.sessionID)
    }
    expect(v2Rows.some((entry) => entry.id === V1_UPGRADE_FIXTURE.compactionSummaryMessageID)).toBe(
      false,
    )
    for (const sessionID of [
      V1_UPGRADE_FIXTURE.parentSessionID,
      V1_UPGRADE_FIXTURE.childSessionID,
      V1_UPGRADE_FIXTURE.separateSessionID,
    ]) {
      const listed = new Set((await api.messages(sessionID)).map((message) => message.info.id))
      for (const row of v2Rows.filter(
        (entry) =>
          entry.sessionID === sessionID && (entry.type === "user" || entry.type === "assistant"),
      )) {
        expect(listed.has(row.id)).toBe(true)
      }
    }

    const mermaid = z
      .object({
        status: z.literal("ready"),
        manifest: z
          .object({
            origin: z
              .object({ sessionID: z.string(), messageID: z.string(), partID: z.string() })
              .passthrough(),
          })
          .passthrough(),
      })
      .parse(await api.json(`/objects/mermaid/${V1_UPGRADE_FIXTURE.mermaidObjectID}`)).manifest
    expect(mermaid.origin.sessionID).toBe(V1_UPGRADE_FIXTURE.parentSessionID)
    const origin = z
      .object({
        info: z.object({ id: z.string() }),
        parts: z.array(z.object({ id: z.string(), type: z.string(), text: z.string().optional() })),
      })
      .parse(
        await api.json(`/session/${mermaid.origin.sessionID}/message/${mermaid.origin.messageID}`),
      )
    expect(origin.parts.some((part) => part.text?.includes("```mermaid"))).toBe(true)
    const diagramPart = origin.parts.find(
      (part) => part.type === "text" && part.text?.includes("```mermaid"),
    )
    if (!diagramPart?.text) throw new Error("Expected the imported Mermaid text part")
    expect(diagramPart.id).not.toBe(mermaid.origin.partID)
    const source = z
      .string()
      .parse(diagramPart.text.match(/(?:^|\n)```mermaid\n([\s\S]*?)\n```(?:\n|$)/u)?.[1])
    const inline = z.object({ objectID: z.string() }).parse(
      await api.json("/objects/mermaid/inline", {
        method: "POST",
        body: JSON.stringify({
          sessionID: mermaid.origin.sessionID,
          messageID: mermaid.origin.messageID,
          partID: diagramPart.id,
          segmentIndex: 0,
          source,
        }),
      }),
    )
    expect(inline.objectID).toBe(V1_UPGRADE_FIXTURE.mermaidObjectID)

    const sessionNote = z.object({
      id: z.string(),
      title: z.string(),
      relativePath: z.string(),
      notebookID: z.string(),
      notebook: z.string(),
      notebookAvailable: z.boolean(),
      sessionID: z.string(),
    })
    const library = z
      .object({ activeNotebookID: z.string(), notes: z.array(sessionNote) })
      .parse(await api.json("/notes"))
    const expectedNote = fixtureReport.annotation.result.note
    expect(library.activeNotebookID).toBe(expectedNote.notebookID)
    expect(library.notes).toContainEqual({
      id: expectedNote.id,
      title: "Photosynthesis basics",
      relativePath: expectedNote.relativePath,
      notebookID: expectedNote.notebookID,
      notebook: expectedNote.notebook,
      notebookAvailable: true,
      sessionID: fixtureReport.parentSessionID,
    })
    const found = z
      .object({ note: sessionNote })
      .parse(await api.json(`/notes/session/${fixtureReport.parentSessionID}`)).note
    expect(found.id).toBe(expectedNote.id)
    const document = z
      .object({ content: z.string(), sourceDirectory: z.string() })
      .parse(
        await api.json(
          `/notes/document?${new URLSearchParams({ path: found.relativePath, id: found.id })}`,
        ),
      )
    expect(document.sourceDirectory).toBe(fixture.notebook)
    const citation = new URL(
      z.string().parse(document.content.match(/\[Open message\]\((buddy:\/\/chat\/[^)]+)\)/u)?.[1]),
    )
    const sessionID = citation.pathname.slice(1)
    const messageID = z.string().parse(citation.searchParams.get("message"))
    expect(sessionID).toBe(fixtureReport.parentSessionID)
    expect(messageID).toBe(fixtureReport.annotation.messageID)
    const cited = Schema.decodeUnknownSync(MessageWithParts)(
      await api.json(`/session/${sessionID}/message/${messageID}`),
    )
    expect(cited.info.id).toBe(fixtureReport.annotation.messageID)
    expect(cited.info.sessionID).toBe(fixtureReport.parentSessionID)

    const providers = z
      .object({ connected: z.array(z.string()) })
      .parse(await api.json("/provider"))
    expect(providers.connected).toContain("openai")
  }, 120_000)

  test("restarting twice makes no second copy, keeps the same chats and keeps a message added after the import", async () => {
    const v2 = path.join(dataDirectory, "opencode-v2.db")
    const inode = (await fs.stat(v2)).ino
    const added = await api.prompt(
      V1_UPGRADE_FIXTURE.separateSessionID,
      "A message added after the upgrade",
    )
    expect(added.status).toBe(200)
    const addedID = Schema.decodeUnknownSync(MessageWithParts)(await added.json()).info.id
    const before = {
      roots: (await api.sessions()).map((session) => session.id).toSorted(),
      parent: (await api.messages(V1_UPGRADE_FIXTURE.parentSessionID)).map(
        (message) => message.info.id,
      ),
      separate: (await api.messages(V1_UPGRADE_FIXTURE.separateSessionID)).map(
        (message) => message.info.id,
      ),
    }
    expect(before.separate).toHaveLength(2)
    for (const _ of [1, 2]) {
      await api.restart()
      expect((await waitForImport("completed")).skipped).toEqual([])
      expect((await fs.stat(v2)).ino).toBe(inode)
      expect({
        roots: (await api.sessions()).map((session) => session.id).toSorted(),
        parent: (await api.messages(V1_UPGRADE_FIXTURE.parentSessionID)).map(
          (message) => message.info.id,
        ),
        separate: (await api.messages(V1_UPGRADE_FIXTURE.separateSessionID)).map(
          (message) => message.info.id,
        ),
      }).toEqual(before)
      const host = runtimeHost(await getAgentRuntime())
      const inbox = await host.session.inbox.list({
        sessionID: V1_UPGRADE_FIXTURE.separateSessionID,
      })
      expect(inbox).toHaveLength(1)
      expect(inbox[0]).toMatchObject({
        id: addedID,
        type: "user",
        payload: { text: expect.stringContaining("A message added after the upgrade") },
      })
    }
    expect(await v1Files()).toEqual(v1Before)
    expect((await fs.readdir(dataDirectory)).filter((entry) => entry.includes(".tmp"))).toEqual([])
  }, 120_000)

  test("an interrupted import resumes at its cursor and imports exactly the chats after it", async () => {
    const marker = await api.prompt(
      V1_UPGRADE_FIXTURE.parentSessionID,
      "Kept only if this chat is not imported again",
    )
    expect(marker.status).toBe(200)
    const parentBefore = (await api.messages(V1_UPGRADE_FIXTURE.parentSessionID)).map(
      (message) => message.info.id,
    )
    const childBefore = (await api.messages(V1_UPGRADE_FIXTURE.childSessionID)).map(
      (message) => message.info.id,
    )
    await closeAgentRuntime()
    editV2((db) => {
      removeImported(db, [V1_UPGRADE_FIXTURE.separateSessionID])
      setImportState(db, { phase: "sessions", cursor: V1_UPGRADE_FIXTURE.childSessionID })
    })
    expect(importedSessionIDs()).toEqual(
      [V1_UPGRADE_FIXTURE.childSessionID, V1_UPGRADE_FIXTURE.parentSessionID].toSorted(),
    )
    await getAgentRuntime()
    await waitForImport("completed")
    expect(importedSessionIDs()).toEqual([...SESSION_IDS].toSorted())
    expect(
      (await api.messages(V1_UPGRADE_FIXTURE.parentSessionID)).map((message) => message.info.id),
    ).toEqual(parentBefore)
    expect(
      (await api.messages(V1_UPGRADE_FIXTURE.childSessionID)).map((message) => message.info.id),
    ).toEqual(childBefore)
    const separate = (await api.messages(V1_UPGRADE_FIXTURE.separateSessionID)).map(
      (message) => message.info.id,
    )
    for (const row of readRows(
      fixture.v1Database,
      "SELECT id, session_id AS sessionID FROM message",
    ).filter((entry) => entry.sessionID === V1_UPGRADE_FIXTURE.separateSessionID)) {
      expect(separate).toContain(row.id)
    }
  }, 120_000)

  for (const scenario of [
    {
      name: "in the middle of the walk",
      target: V1_UPGRADE_FIXTURE.childSessionID,
      message: V1_UPGRADE_FIXTURE.childFirstMessageID,
      cursor: V1_UPGRADE_FIXTURE.parentSessionID,
    },
    {
      name: "first in the walk",
      target: V1_UPGRADE_FIXTURE.parentSessionID,
      message: V1_UPGRADE_FIXTURE.parentFirstMessageID,
      cursor: undefined,
    },
  ] as const) {
    test(`a chat that fails to import ${scenario.name} is skipped on the third start and the rest import`, async () => {
      await closeAgentRuntime()
      editV2((db) => {
        copyDummySession(db)
        removeImported(db, SESSION_IDS)
        blockImportOf(db, scenario.message)
        setImportState(db, { phase: "sessions" })
        clearGuard(db)
      })
      for (const start of [1, 2]) {
        await getAgentRuntime()
        const failed = await waitForImport("error")
        expect(failed.skipped).toEqual([])
        expect(failed.import?.error).toContain("UNIQUE")
        const state = readState()
        expect(state.cursor).toBe(scenario.cursor)
        expect(readAttempt()).toMatchObject({
          cursor: scenario.cursor ?? null,
          candidate: scenario.target,
          failures: start,
          running: false,
        })
        await closeAgentRuntime()
      }
      await getAgentRuntime()
      const report = await waitForImport("completed")
      expect(report.skipped.map((entry) => entry.id)).toEqual([scenario.target])
      expect(report.skipped[0]?.error).toContain("UNIQUE")
      expect(importedSessionIDs()).toEqual(
        SESSION_IDS.filter((id) => id !== scenario.target).toSorted(),
      )
    }, 180_000)
  }
})
