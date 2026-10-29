import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import z from "zod"
import { isVisibleToUserTextPartInfo } from "@buddy/transcript-contract/message-visibility"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { createRuntimeHarness, scenario } from "../conformance/harness"
import { createConfigConformanceHarness } from "../conformance/harness-config"

const sessionSchema = z.object({ id: z.string() })

describe("prompt write path", () => {
  test("preserves chip metadata, model-only context and file mention ranges across compaction", async () => {
    await using harness = await createConfigConformanceHarness()
    const notebook = await harness.notebook("prompt-presentation")
    await fs.writeFile(
      path.join(notebook.directory, "opencode.json"),
      JSON.stringify({ command: { explain: { template: "Continue: $ARGUMENTS" } } }),
    )
    const session = await notebook.json("/session", sessionSchema, { body: {} })
    const runtime = await getAgentRuntime()
    const directory = notebook.directory
    await fs.writeFile(path.join(directory, "note.md"), "Fixture note")
    const prelude = "Private prelude.\n"
    const pointer = "\nRead this note with the note tool."
    const text = `${prelude}Read @note.md and notes/outline.md${pointer}Display only`
    const noteStart = prelude.length + "Read @note.md and ".length
    const noteEnd = noteStart + "notes/outline.md".length
    const result = await runtime.execution.prompt(
      {
        sessionID: session.id,
        messageID: "msg_chips",
        text,
        files: [
          {
            uri: pathToFileURL(path.join(directory, "note.md")).href,
            name: "note.md",
            mention: { text: "@note.md", start: prelude.length + 5, end: prelude.length + 13 },
          },
        ],
        metadata: {
          buddy: {
            prompt: {
              system: "Buddy compiled context.",
              segments: [
                { start: 0, end: prelude.length, synthetic: true },
                { start: prelude.length, end: noteStart },
                {
                  start: noteStart,
                  end: noteEnd,
                  metadata: {
                    buddyPromptPart: {
                      type: "notebook-reference",
                      text: "notes/outline.md",
                      title: "Outline",
                      kind: "note",
                    },
                  },
                },
                { start: noteEnd, end: noteEnd + pointer.length, synthetic: true },
                { start: noteEnd + pointer.length, end: text.length, ignored: true },
              ],
            },
          },
        },
      },
      { directory },
    )
    expect(result).toMatchObject({
      ok: true,
      value: { info: { role: "assistant", parentID: "msg_chips", finish: "stop" } },
    })
    const history = await runtime.conversations.history({ directory, sessionID: session.id })
    const user = history.items.find((message) => message.info.id === "msg_chips")
    expect(
      user?.parts
        .filter(isVisibleToUserTextPartInfo)
        .map((part) => (part.type === "text" ? part.text : ""))
        .join(""),
    ).toBe("Read @note.md and notes/outline.mdDisplay only")
    expect(user?.parts.find((part) => part.type === "file")).toMatchObject({
      source: { text: { value: "@note.md", start: 5, end: 13 } },
    })
    expect(user?.parts).toContainEqual(
      expect.objectContaining({
        type: "text",
        metadata: {
          buddyPromptPart: {
            type: "notebook-reference",
            text: "notes/outline.md",
            title: "Outline",
            kind: "note",
          },
        },
      }),
    )
    const request = harness.latestRequest("Buddy compiled context.")
    expect(request.prompt).toContain("Read this note with the note tool.")
    expect(request.prompt).not.toContain("Display only")
    expect(await runtime.execution.compact({ sessionID: session.id })).toEqual({
      ok: true,
      value: true,
    })
    expect(
      (
        await runtime.execution.command(
          { sessionID: session.id, name: "explain", arguments: "prompt-context-after-compaction" },
          { directory },
        )
      ).ok,
    ).toBe(true)
    expect(harness.latestRequest("prompt-context-after-compaction").prompt).toContain(
      "Buddy compiled context.",
    )
  })

  test("preserves a repair ID and returns the same held admission on retry without execution", async () => {
    await using api = await createRuntimeHarness()
    const runtime = await getAgentRuntime()
    const session = await api.create()
    const messageID =
      "msg_buddy_svg_auto_repair_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const input = {
      sessionID: session.id,
      messageID,
      text: "Repair",
      delivery: "queue" as const,
      noReply: true,
    }
    expect(await runtime.execution.admit(input)).toEqual({ ok: true, value: { messageID } })
    for (const attempt of [1, 2]) {
      const result = await runtime.execution.prompt(input, { directory: api.directory })
      expect(result, `held attempt ${attempt}`).toMatchObject({
        ok: true,
        value: { info: { id: messageID, role: "user" } },
      })
    }
    expect((await runtime.execution.statuses())[session.id]).toBeUndefined()
    expect(
      (await api.messages(session.id)).some((message) => message.info.role === "assistant"),
    ).toBe(false)
  })

  test("rejects retries of a delivered prompt during and after execution without duplicating history", async () => {
    await using api = await createRuntimeHarness()
    const runtime = await getAgentRuntime()
    const session = await api.create()
    const gate = api.gate()
    const input = {
      sessionID: session.id,
      messageID: "msg_running_retry",
      text: scenario({ kind: "pause", key: gate.key, text: "Original answer" }),
    }
    const original = runtime.execution.prompt(input, {
      directory: api.directory,
      signal: AbortSignal.timeout(10_000),
    })
    try {
      await gate.entered
      expect(await runtime.execution.prompt(input, { directory: api.directory })).toMatchObject({
        ok: false,
        error: { kind: "conflict" },
      })
      gate.release()
      expect(await original).toMatchObject({
        ok: true,
        value: { info: { role: "assistant", parentID: input.messageID } },
      })
      expect(await runtime.execution.prompt(input, { directory: api.directory })).toMatchObject({
        ok: false,
        error: { kind: "conflict" },
      })
      expect(
        (await api.messages(session.id))
          .filter((message) => message.info.role === "user")
          .map((message) => message.info.id),
      ).toEqual([input.messageID])
    } finally {
      gate.release()
      await original
    }
  })
})
