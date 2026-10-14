import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import z from "zod"
import { promptSession, admitSessionPrompt, commandSession, compactSession } from "@buddy/opencode-adapter/gateway/write"
import { listMessages } from "@buddy/opencode-adapter/gateway/message"
import { isVisibleToUserTextPartInfo } from "@buddy/transcript-contract/message-visibility"
import { createWriteFixture } from "./v2-write-fixture"
import { readConciseResponseChatState, persistConciseResponseChatState } from "../../src/learning/agent-execution/transforms/concise-response-chat-state"
import { createBuddyTool } from "../../src/learning/runtime/create-buddy-tool"
import { buddyToolToToolInfo } from "../../src/opencode-runtime/buddy-tool-shim"

describe("v2 prompt write path", () => {
  test("preserves legacy chat style for synthetic history and persists changes without dropping session metadata", async () => {
    await using fixture = await createWriteFixture()
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, metadata: { retained: true } })
    expect(await readConciseResponseChatState({ directory, sessionID: session.id, configured: false }, host)).toEqual({ base: false, applied: false })
    await host.session.remove({ sessionID: session.id })
    await host.session.import({ location: { directory }, info: session, messages: [{ id: "msg_legacy_notice", type: "synthetic", text: "Earlier result", time: { created: 1 } }] })
    expect(await readConciseResponseChatState({ directory, sessionID: session.id, configured: false }, host)).toEqual({ base: true, applied: true })
    await persistConciseResponseChatState({ directory, sessionID: session.id, base: false, applied: false }, host)
    expect(await readConciseResponseChatState({ directory, sessionID: session.id, configured: true }, host)).toEqual({ base: false, applied: false })
    expect((await host.session.get({ sessionID: session.id })).metadata?.retained).toBe(true)
  })

  test("returns the completed assistant and preserves chip metadata, model-only context and file mention ranges", async () => {
    await using fixture = await createWriteFixture({ compactionSummary: "Previous conversation." })
    const { host, directory, requests } = fixture
    await fs.writeFile(path.join(directory, "note.md"), "Fixture note")
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    const prelude = "Private prelude.\n"
    const pointer = "\nRead this note with the note tool."
    const text = `${prelude}Read @note.md and notes/outline.md${pointer}Display only`
    const noteStart = prelude.length + "Read @note.md and ".length
    const noteEnd = noteStart + "notes/outline.md".length
    let accepted = false
    const result = await promptSession(host, {
      sessionID: session.id, id: "msg_chips", text,
      files: [{ uri: pathToFileURL(path.join(directory, "note.md")).href, name: "note.md", mention: { text: "@note.md", start: prelude.length + 5, end: prelude.length + 13 } }],
      metadata: { buddy: { prompt: { system: "Buddy compiled context.", segments: [
        { start: 0, end: prelude.length, synthetic: true },
        { start: prelude.length, end: noteStart },
        { start: noteStart, end: noteEnd, metadata: { buddyPromptPart: { type: "notebook-reference", text: "notes/outline.md", title: "Outline", kind: "note" } } },
        { start: noteEnd, end: noteEnd + pointer.length, synthetic: true },
        { start: noteEnd + pointer.length, end: text.length, ignored: true },
      ] } } },
    }, { directory }, AbortSignal.timeout(10_000), async () => { accepted = true })
    expect(accepted).toBe(true)
    expect(result).toMatchObject({ ok: true, value: { info: { role: "assistant", parentID: "msg_chips", finish: "stop" }, parts: [{ type: "text", text: "Scripted title." }] } })
    const history = await listMessages(host, { directory, sessionID: session.id })
    const user = history.items.find((message) => message.info.id === "msg_chips")
    expect(user?.parts.filter(isVisibleToUserTextPartInfo).map((part) => part.type === "text" ? part.text : "").join("")).toBe("Read @note.md and notes/outline.mdDisplay only")
    expect(user?.parts.find((part) => part.type === "file")).toMatchObject({ source: { text: { value: "@note.md", start: 5, end: 13 } } })
    expect(user?.parts).toContainEqual(expect.objectContaining({ type: "text", metadata: { buddyPromptPart: { type: "notebook-reference", text: "notes/outline.md", title: "Outline", kind: "note" } } }))
    expect(requests.some((request) => JSON.stringify(request.prompt).includes("Buddy compiled context."))).toBe(true)
    expect(requests.some((request) => JSON.stringify(request.prompt).includes("Read this note with the note tool."))).toBe(true)
    const primaryRequests = requests.filter((request) => JSON.stringify(request.prompt).includes("Buddy compiled context."))
    expect(primaryRequests.every((request) => !JSON.stringify(request.prompt).includes("Display only"))).toBe(true)
    expect(await compactSession(host, { sessionID: session.id }, AbortSignal.timeout(10_000))).toEqual({ ok: true, value: true })
    expect((await host.session.context({ sessionID: session.id })).some((message) => message.type === "user")).toBe(false)
    const before = requests.length
    expect((await commandSession(host, { sessionID: session.id, name: "explain", text: "Continue" }, { directory }, AbortSignal.timeout(10_000))).ok).toBe(true)
    expect(requests.slice(before).some((request) => JSON.stringify(request.prompt).includes("Buddy compiled context."))).toBe(true)
  }, 15_000)

  test("preserves msg_ repair IDs and queue admission without executing a held prompt", async () => {
    await using fixture = await createWriteFixture()
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    const id = "msg_buddy_svg_auto_repair_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const result = await admitSessionPrompt(host, { sessionID: session.id, id, text: "Repair", delivery: "queue", resume: false })
    expect(result).toMatchObject({ ok: true, value: { id, delivery: "queue", type: "user", payload: { text: "Repair" } } })
    expect(await host.session.inbox.list({ sessionID: session.id })).toMatchObject([{ id, delivery: "queue" }])
    expect(await host.session.active()).toEqual({})
  })

  test("rejects a synchronous retry of a delivered prompt ID promptly instead of waiting for a second delivery", async () => {
    await using fixture = await createWriteFixture()
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    const first = await promptSession(host, { sessionID: session.id, id: "msg_repeat", text: "One prompt" }, { directory }, AbortSignal.timeout(10_000))
    expect(first).toMatchObject({ ok: true, value: { info: { role: "assistant", parentID: "msg_repeat" } } })
    let accepted = false
    const started = performance.now()
    const retry = await promptSession(host, { sessionID: session.id, id: "msg_repeat", text: "One prompt" }, { directory }, AbortSignal.timeout(10_000), async () => { accepted = true })
    expect(performance.now() - started).toBeLessThan(5_000)
    expect(retry).toMatchObject({ ok: false, error: { status: 409, message: "Prompt has already been delivered" } })
    expect(accepted).toBe(false)
    const users = (await host.message.list({ sessionID: session.id, type: "user", order: "asc" })).data
    expect(users.map((message) => message.id)).toEqual(["msg_repeat"])
  }, 15_000)

  test("rejects a synchronous retry while the delivered prompt is still executing and lets the original finish", async () => {
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const tool = createBuddyTool({
      id: "buddy_probe", description: "Hold the turn open", presentation: { archetype: "silent" },
      parameters: z.object({ term: z.string() }),
      async execute() {
        started.resolve()
        await release.promise
        return { title: "Probe", output: "Probe output", metadata: {} }
      },
    })
    await using fixture = await createWriteFixture({ loadTools: async (runtime) => [buddyToolToToolInfo(tool, runtime)] })
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    const original = promptSession(host, { sessionID: session.id, id: "msg_running_retry", text: "run-probe" }, { directory }, AbortSignal.timeout(10_000))
    try {
      await started.promise
      const retry = await promptSession(host, { sessionID: session.id, id: "msg_running_retry", text: "run-probe" }, { directory }, AbortSignal.timeout(5_000))
      expect(retry).toMatchObject({ ok: false, error: { status: 409, message: "Prompt has already been delivered" } })
      release.resolve()
      expect(await original).toMatchObject({ ok: true, value: { info: { role: "assistant", parentID: "msg_running_retry" } } })
    } finally { release.resolve(); await original }
  }, 15_000)

  test("returns the existing pending admission for a held prompt retried without execution", async () => {
    await using fixture = await createWriteFixture()
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    const input = { sessionID: session.id, id: "msg_held_retry", text: "Held", delivery: "queue" as const, resume: false }
    const first = await promptSession(host, input, { directory }, AbortSignal.timeout(10_000))
    const retry = await promptSession(host, input, { directory }, AbortSignal.timeout(10_000))
    expect(first).toMatchObject({ ok: true, value: { info: { id: "msg_held_retry", role: "user" } } })
    expect(retry).toMatchObject({ ok: true, value: { info: { id: "msg_held_retry", role: "user" } } })
    expect(await host.session.inbox.list({ sessionID: session.id })).toMatchObject([{ id: "msg_held_retry" }])
  })
})
