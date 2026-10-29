import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { runtimeHost } from "../helpers/opencode"
import { tmpdir } from "../helpers/tmpdir"
import { createRuntimeHarness, scenario } from "./harness"

const UNDO_REFUSED = "Undo isn't available for turns brought over from the previous version."
const assistantRowSchema = z.object({ id: z.string(), data: z.string() })
const snapshotSchema = z
  .object({
    snapshot: z
      .object({
        start: z.string().optional(),
        end: z.string().optional(),
        files: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough()

let notebook: Awaited<ReturnType<typeof tmpdir>>
let api: Awaited<ReturnType<typeof createRuntimeHarness>>

function v2Database() {
  const dataHome = process.env.XDG_DATA_HOME
  if (!dataHome) throw new Error("The undo proof requires the isolated Buddy preload")
  return path.join(dataHome, "buddy", "opencode", "opencode-v2.db")
}

function makeTurnsLookImported(sessionID: string, worktree: string) {
  const db = new Database(v2Database())
  try {
    const rows = z
      .array(assistantRowSchema)
      .parse(
        db
          .query("SELECT id, data FROM session_message WHERE session_id = ? AND type = 'assistant'")
          .all(sessionID),
      )
    let rewritten = 0
    for (const row of rows) {
      const data = snapshotSchema.parse(JSON.parse(row.data))
      const files = data.snapshot?.files
      if (!files?.length) continue
      const absolute = files.map((file) => path.join(worktree, file).replaceAll("\\", "/"))
      db.query("UPDATE session_message SET data = ? WHERE id = ?").run(
        JSON.stringify({ ...data, snapshot: { ...data.snapshot, files: absolute } }),
        row.id,
      )
      rewritten += 1
    }
    return rewritten
  } finally {
    db.close(false)
  }
}

async function exists(file: string) {
  return fs.stat(file).then(
    () => true,
    () => false,
  )
}

async function codeEditingSession(title: string) {
  const session = await api.create({ title })
  expect(
    (
      await api.prompt(
        session.id,
        scenario({
          kind: "tool",
          name: "write",
          arguments: { path: "edited.md", content: "after\n" },
        }),
      )
    ).status,
  ).toBe(200)
  expect(
    (
      await api.prompt(
        session.id,
        scenario({
          kind: "tool",
          name: "write",
          arguments: { path: "created.md", content: "new\n" },
        }),
      )
    ).status,
  ).toBe(200)
  const history = await api.messages(session.id)
  const firstUser = history.find((message) => message.info.role === "user")
  if (!firstUser) throw new Error("Missing the first user message")
  return { sessionID: session.id, boundary: firstUser.info.id }
}

async function resetFiles() {
  await fs.writeFile(path.join(notebook.path, "edited.md"), "before\n")
  await fs.rm(path.join(notebook.path, "created.md"), { force: true })
}

beforeAll(async () => {
  notebook = await tmpdir({ git: true })
  await fs.writeFile(path.join(notebook.path, "edited.md"), "before\n")
  await fs.writeFile(path.join(notebook.path, "outside-sentinel.md"), "untouched\n")
  api = await createRuntimeHarness({ directory: notebook.path })
})

afterAll(async () => {
  await api?.[Symbol.asyncDispose]()
  await notebook?.[Symbol.asyncDispose]()
})

describe("undo on chats brought over from v1", () => {
  test("a v2 turn with relative snapshot paths still undoes through Buddy", async () => {
    await resetFiles()
    const turn = await codeEditingSession("v2 turn")
    expect(await fs.readFile(path.join(notebook.path, "edited.md"), "utf8")).toBe("after\n")
    expect(await exists(path.join(notebook.path, "created.md"))).toBe(true)
    const response = await api.request(`/session/${turn.sessionID}/revert`, {
      method: "POST",
      body: JSON.stringify({ messageID: turn.boundary }),
    })
    expect(response.status).toBe(200)
    expect(await fs.readFile(path.join(notebook.path, "edited.md"), "utf8")).toBe("before\n")
    expect(await exists(path.join(notebook.path, "created.md"))).toBe(false)
    await api.request(`/session/${turn.sessionID}/unrevert`, { method: "POST" })
  }, 120_000)

  test("OpenCode's undo of an imported turn with absolute v1 snapshot paths does not restore the right files", async () => {
    await resetFiles()
    const turn = await codeEditingSession("imported turn, raw undo")
    const worktree = await fs.realpath(notebook.path)
    await api.restart()
    expect(makeTurnsLookImported(turn.sessionID, worktree)).toBeGreaterThan(0)
    await api.restart()
    const host = runtimeHost(await getAgentRuntime())
    const outcome = await host.session.revert
      .stage({ sessionID: turn.sessionID, messageID: turn.boundary })
      .then(
        () => "staged",
        (cause: unknown) => `failed: ${String(cause)}`,
      )
    const edited = await fs.readFile(path.join(notebook.path, "edited.md"), "utf8")
    const created = await exists(path.join(notebook.path, "created.md"))
    console.log("Raw OpenCode undo of an imported turn:", {
      outcome,
      edited,
      createdStillPresent: created,
    })
    expect(edited === "before\n" && !created).toBe(false)
    expect(await fs.readFile(path.join(notebook.path, "outside-sentinel.md"), "utf8")).toBe(
      "untouched\n",
    )
    await host.session.revert.clear({ sessionID: turn.sessionID }).catch(() => undefined)
  }, 120_000)

  test("Buddy refuses undo across an imported turn and touches no file", async () => {
    await resetFiles()
    const turn = await codeEditingSession("imported turn, Buddy undo")
    const worktree = await fs.realpath(notebook.path)
    await api.restart()
    expect(makeTurnsLookImported(turn.sessionID, worktree)).toBeGreaterThan(0)
    await api.restart()
    const before = {
      edited: await fs.readFile(path.join(notebook.path, "edited.md"), "utf8"),
      created: await fs.readFile(path.join(notebook.path, "created.md"), "utf8"),
      sentinel: await fs.readFile(path.join(notebook.path, "outside-sentinel.md"), "utf8"),
    }
    const response = await api.request(`/session/${turn.sessionID}/revert`, {
      method: "POST",
      body: JSON.stringify({ messageID: turn.boundary }),
    })
    expect(response.status).toBe(409)
    expect(await response.text()).toContain(UNDO_REFUSED)
    expect({
      edited: await fs.readFile(path.join(notebook.path, "edited.md"), "utf8"),
      created: await fs.readFile(path.join(notebook.path, "created.md"), "utf8"),
      sentinel: await fs.readFile(path.join(notebook.path, "outside-sentinel.md"), "utf8"),
    }).toEqual(before)
    expect((await api.session(turn.sessionID)).revert).toBeUndefined()
    const later = await api.messages(turn.sessionID)
    const lastUser = later.findLast((message) => message.info.role === "user")
    if (!lastUser) throw new Error("Missing the last user message")
    const afterLast = await api.request(`/session/${turn.sessionID}/revert`, {
      method: "POST",
      body: JSON.stringify({ messageID: later.at(-1)?.info.id ?? lastUser.info.id }),
    })
    expect(afterLast.status).toBe(200)
  }, 120_000)
})
