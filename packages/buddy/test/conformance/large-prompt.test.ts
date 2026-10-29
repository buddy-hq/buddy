import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRuntimeHarness, liveTranscript, messageText, scenario } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => {
  api = await createRuntimeHarness()
})
afterAll(async () => {
  await api?.[Symbol.asyncDispose]()
})

describe("Large prompts", () => {
  test("a 200 KB prompt appears once in history and the live client and completes on the same stream", async () => {
    const session = await api.create()
    const answer = "Roughly 36,000 words."
    const content = `${"water cycle ".repeat(18_000)}\n${scenario({ kind: "reply", text: answer })}`
    await using events = await api.events()
    expect((await api.promptAsync(session.id, content)).status).toBe(204)
    await events.idle(session.id)

    for (const messages of [
      await api.messages(session.id),
      liveTranscript(events.seen, session.id),
    ]) {
      expect(messages.filter((message) => message.info.role === "user").map(messageText)).toEqual([
        content,
      ])
      expect(
        messages.filter((message) => message.info.role === "assistant").map(messageText),
      ).toEqual([answer])
      expect(messages.at(-1)?.info).toMatchObject({
        role: "assistant",
        finish: "stop",
        time: { completed: expect.any(Number) },
      })
    }
  })
})
