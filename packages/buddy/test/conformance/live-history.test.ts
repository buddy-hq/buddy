import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { createRuntimeHarness, liveTranscript, patchModel, scenario } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => {
  api = await createRuntimeHarness({ permission: { bash: "allow" } })
  await fs.writeFile(path.join(api.directory, "notes.md"), "Rain falls.\nClouds form.\n")
})
afterAll(async () => { await api?.[Symbol.asyncDispose]() })

const ask = scenario({ kind: "question" })

function withoutUserSourceText(messages: readonly (typeof MessageWithParts.Type)[]) {
  return messages.map((message) => message.info.role === "user" ? { ...message, info: { ...message.info, sourceText: undefined } } : message)
}

describe("Live and history transcripts", () => {
  test("every message and part a client builds from the live stream matches history", async () => {
    const session = await api.create()
    await using events = await api.events()
    const turns: [string, { model?: typeof patchModel }][] = [
      [scenario({ kind: "reply", text: "Plain answer" }), {}],
      [scenario({ kind: "read", path: "notes.md" }), {}],
      [scenario({ kind: "tool", name: "write", arguments: { path: "rain.md", content: "One\nTwo\nThree\n" } }), {}],
      [scenario({ kind: "tool", name: "edit", arguments: { path: "notes.md", oldString: "Rain falls.", newString: "Rain falls softly." } }), {}],
      [scenario({ kind: "tool", name: "patch", arguments: { patchText: "*** Begin Patch\n*** Update File: rain.md\n@@\n-Two\n+Two and a half\n*** End Patch" } }), { model: patchModel }],
      [scenario({ kind: "tool", name: "shell", arguments: { command: "echo parity" } }), {}],
      [scenario({ kind: "tool", name: "glob", arguments: { pattern: "*.md" } }), {}],
      [ask, {}],
    ]
    for (const [content, options] of turns) {
      await api.promptAsync(session.id, content, options)
      if (content === ask) {
        await events.until((event) => event.payload.type === "question.asked" && event.payload.properties.sessionID === session.id)
        const pending = (await api.questions()).find((item) => item.sessionID === session.id)
        if (!pending) throw new Error("Missing pending question")
        expect(await api.json(`/question/${pending.id}/reply`, { method: "POST", body: JSON.stringify({ answers: [["PDF"], ["Notes"]] }) })).toBe(true)
      }
      await events.idle(session.id)
    }
    const history = await api.messages(session.id)
    expect(history.filter((message) => message.info.role === "user")).toHaveLength(turns.length)
    expect(history.flatMap((message) => message.parts).filter((part) => part.type === "tool").map((part) => [part.tool, part.state.status])).toEqual([
      ["read", "completed"], ["write", "completed"], ["edit", "completed"], ["patch", "completed"], ["shell", "completed"], ["glob", "completed"], ["question", "completed"],
    ])
    expect(liveTranscript(events.seen, session.id)).toEqual(withoutUserSourceText(history))
  })

  test("a client that loads history during a busy turn and then follows the stream ends with history", async () => {
    const session = await api.create()
    expect((await api.prompt(session.id, scenario({ kind: "reply", text: "Earlier answer" }))).status).toBe(200)
    const gate = api.gate()
    try {
      await api.promptAsync(session.id, scenario({ kind: "pause", key: gate.key, text: "Joined answer" }))
      await gate.entered
      await using events = await api.events()
      const loaded = await api.messages(session.id)
      gate.release()
      await events.idle(session.id)
      const history = await api.messages(session.id)
      expect(history.length).toBeGreaterThan(loaded.length)
      expect(withoutUserSourceText(liveTranscript(events.seen, session.id, loaded))).toEqual(withoutUserSourceText(history))
    } finally { gate.release() }
  })

  test("a subagent's parent and child match their history", async () => {
    const parent = await api.create({ agent: "buddy" })
    await using events = await api.events()
    await api.promptAsync(parent.id, scenario({ kind: "delegate", role: "flashcard-author", prompt: scenario({ kind: "reply", text: "Child answer" }) }), { agent: "buddy" })
    await events.idle(parent.id)
    const [child] = await api.children(parent.id)
    if (!child) throw new Error("Missing child conversation")
    expect(liveTranscript(events.seen, parent.id)).toEqual(withoutUserSourceText(await api.messages(parent.id)))
    expect(liveTranscript(events.seen, child.id)).toEqual(withoutUserSourceText(await api.messages(child.id)))
  })
})
