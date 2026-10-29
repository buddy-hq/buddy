import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { createRuntimeHarness, liveTranscript, messageText, scenario, transcript } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => { api = await createRuntimeHarness() })
afterAll(async () => { await api?.[Symbol.asyncDispose]() })

async function databaseFiles(root: string) {
  const found: string[] = []
  for (const entry of await fs.readdir(root, { recursive: true })) {
    const file = path.join(root, entry)
    if (!(await fs.stat(file).catch(() => undefined))?.isFile()) continue
    const header = Buffer.from(await Bun.file(file).slice(0, 16).arrayBuffer()).toString("latin1")
    if (header.startsWith("SQLite format 3") || /\.(db|sqlite)(-wal|-shm|-journal)?$/u.test(entry)) found.push(file)
  }
  return found
}

async function lastAnswer(sessionID: string) {
  const last = (await api.messages(sessionID)).at(-1)
  return last ? messageText(last) : undefined
}

describe("Runtime storage", () => {
  test("conversations are stored in the database at Buddy's established path and nowhere else", async () => {
    const runRoot = process.env.BUDDY_TEST_XDG_ROOT
    const dataHome = process.env.XDG_DATA_HOME
    if (!runRoot || !dataHome) throw new Error("Storage tests require the isolated Buddy preload")
    const session = await api.create()
    expect((await api.prompt(session.id, scenario({ kind: "reply", text: "Stored answer" }))).status).toBe(200)
    const database = path.join(dataHome, "buddy", "opencode", "opencode-v2.db")
    expect(await Bun.file(database).exists()).toBe(true)
    const found = [...await databaseFiles(runRoot), ...await databaseFiles(api.directory)]
    expect(found).toContain(database)
    expect(found.filter((file) => path.dirname(file) !== path.dirname(database))).toEqual([])
  })

  test("conversations, tool results and subagent rows are unchanged after the runtime restarts", async () => {
    const session = await api.create({ title: "Kept conversation" })
    expect((await api.prompt(session.id, scenario({ kind: "reply", text: "Kept answer" }))).status).toBe(200)
    expect((await api.prompt(session.id, scenario({ kind: "tool", name: "write", arguments: { path: "kept.md", content: "Kept\n" } }))).status).toBe(200)
    const parent = await api.create({ agent: "buddy", title: "Kept family" })
    {
      await using events = await api.events()
      expect((await api.prompt(parent.id, scenario({ kind: "delegate", role: "flashcard-author", prompt: scenario({ kind: "reply", text: "Kept child answer" }), background: true }), { agent: "buddy" })).status).toBe(200)
      await events.until((event) => event.payload.type === "message.part.updated" && JSON.stringify(event.payload.properties).includes('"outcome":"completed"'))
      await events.idle(parent.id)
    }
    const [child] = await api.children(parent.id)
    if (!child) throw new Error("Missing background child")
    const before = {
      sessions: await api.sessions(), conversation: await api.messages(session.id),
      parent: await api.messages(parent.id), child: await api.messages(child.id), children: await api.children(parent.id),
    }
    expect(before.parent.flatMap((message) => message.parts).some((part) => part.type === "notice" && part.completion?.outcome === "completed")).toBe(true)
    await api.restart()
    expect({
      sessions: await api.sessions(), conversation: await api.messages(session.id),
      parent: await api.messages(parent.id), child: await api.messages(child.id), children: await api.children(parent.id),
    }).toEqual(before)
    expect((await api.prompt(session.id, scenario({ kind: "reply", text: "Answer after restart" }))).status).toBe(200)
    expect(await lastAnswer(session.id)).toBe("Answer after restart")
  })

  test("text still streaming when the runtime closes survives a restart", async () => {
    const session = await api.create()
    const gate = api.gate()
    const partial = "Partial reply visible before quitting."
    let messageID: string
    try {
      {
        await using events = await api.events()
        await api.promptAsync(session.id, scenario({ kind: "stream", key: gate.key, text: partial }))
        await gate.entered
        const delta = transcript(await events.until((event) => event.payload.type === "message.part.delta" && event.payload.properties.sessionID === session.id && event.payload.properties.delta === partial))
        if (delta.type !== "message.part.delta") throw new Error("Missing partial reply delta")
        messageID = delta.properties.messageID
        const visible = liveTranscript(events.seen, session.id).find((message) => message.info.id === messageID)
        expect(visible ? messageText(visible) : undefined).toBe(partial)
      }
      await api.restart()
    } finally { gate.release() }
    const restored = (await api.messages(session.id)).find((message) => message.info.id === messageID)
    expect(restored ? messageText(restored) : undefined).toBe(partial)
  })

  test("a reply cut off by a runtime restart is kept and the conversation keeps working", async () => {
    const session = await api.create()
    const gate = api.gate()
    try {
      await api.promptAsync(session.id, scenario({ kind: "pause", key: gate.key, text: "Never finished" }))
      await gate.entered
      await api.restart()
    } finally { gate.release() }
    await using events = await api.events()
    if ((await api.statuses())[session.id]) await events.idle(session.id)
    const history = await api.messages(session.id)
    expect(history.filter((message) => message.info.role === "assistant" && message.info.time.completed === undefined)).toEqual([])
    const cut = history.find((message) => message.parts.some((part) => part.type === "tool" && part.tool === "conformance_pause"))
    expect(cut?.info).toMatchObject({ role: "assistant", finish: "error" })
    expect(cut ? messageText(cut) : undefined).toBe("Working on the request.")
    expect(cut?.parts.find((part) => part.type === "tool")).toMatchObject({ state: { status: "error", outcome: { type: "interrupted" } } })
    expect((await api.prompt(session.id, scenario({ kind: "reply", text: "Answer after the cut" }))).status).toBe(200)
    expect(await lastAnswer(session.id)).toBe("Answer after the cut")
  })
})
