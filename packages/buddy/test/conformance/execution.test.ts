import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { MessageWithParts } from "@buddy/transcript-contract/message"
import { createRuntimeHarness, messageText, scenario } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => {
  api = await createRuntimeHarness()
})
afterAll(async () => {
  await api?.[Symbol.asyncDispose]()
})

describe("Execution port", () => {
  test("async prompts acknowledge admission while busy and later finish with a complete assistant", async () => {
    const session = await api.create()
    const gate = api.gate()
    await using events = await api.events()
    try {
      expect(
        (
          await api.promptAsync(
            session.id,
            scenario({ kind: "pause", key: gate.key, text: "Async complete" }),
          )
        ).status,
      ).toBe(204)
      await gate.entered
      expect((await api.statuses())[session.id]?.type).toBe("busy")
      expect(
        (await api.messages(session.id)).some(
          (message) => messageText(message) === "Async complete",
        ),
      ).toBe(false)
      gate.release()
      await events.idle(session.id)
      const final = (await api.messages(session.id)).at(-1)
      expect(final?.info).toMatchObject({
        role: "assistant",
        finish: "stop",
        time: { completed: expect.any(Number) },
      })
      expect(final && messageText(final)).toBe("Async complete")
      expect((await api.statuses())[session.id]).toBeUndefined()
    } finally {
      gate.release()
    }
  })

  test("sync prompts wait for completion and return the final assistant message", async () => {
    const session = await api.create()
    const gate = api.gate()
    let returned = false
    const completion = api
      .prompt(session.id, scenario({ kind: "pause", key: gate.key, text: "Synchronous complete" }))
      .then((response) => {
        returned = true
        return response
      })
    try {
      await gate.entered
      expect(returned).toBe(false)
      gate.release()
      const response = await completion
      expect(response.status).toBe(200)
      const message = Schema.decodeUnknownSync(MessageWithParts)(await response.json())
      expect(message.info).toMatchObject({
        role: "assistant",
        finish: "stop",
        time: { completed: expect.any(Number) },
      })
      expect(messageText(message)).toBe("Synchronous complete")
    } finally {
      gate.release()
      await completion
    }
  })

  test.each(["queue", "steer"] as const)(
    "%s prompts admitted while busy are delivered and complete",
    async (delivery) => {
      const session = await api.create()
      const gate = api.gate()
      await using events = await api.events()
      try {
        await api.promptAsync(
          session.id,
          scenario({ kind: "pause", key: gate.key, text: "Initial turn" }),
        )
        await gate.entered
        const followup = scenario({ kind: "reply", text: `${delivery} answer` })
        await api.promptAsync(session.id, followup, { delivery })
        gate.release()
        await events.until(
          (event) =>
            event.payload.type === "message.part.updated" &&
            JSON.stringify(event.payload.properties).includes(`${delivery} answer`),
        )
        await events.idle(session.id)
        const history = await api.messages(session.id)
        expect(history.filter((message) => message.info.role === "user").map(messageText)).toEqual([
          scenario({ kind: "pause", key: gate.key, text: "Initial turn" }),
          followup,
        ])
        expect(
          history.some(
            (message) =>
              message.info.role === "assistant" &&
              messageText(message) === `${delivery} answer` &&
              message.info.time.completed !== undefined,
          ),
        ).toBe(true)
        expect(
          history.some(
            (message) =>
              message.info.role === "assistant" && messageText(message) === "Initial turn",
          ),
        ).toBe(delivery === "queue")
      } finally {
        gate.release()
      }
    },
  )

  test("abort returns a busy conversation to idle and allows a new prompt", async () => {
    const session = await api.create()
    const gate = api.gate()
    await using events = await api.events()
    try {
      await api.promptAsync(
        session.id,
        scenario({ kind: "pause", key: gate.key, text: "Cancelled work" }),
      )
      await gate.entered
      expect(await api.json(`/session/${session.id}/abort`, { method: "POST" })).toBe(true)
      await events.idle(session.id)
      expect((await api.statuses())[session.id]).toBeUndefined()
      const response = await api.prompt(
        session.id,
        scenario({ kind: "reply", text: "Recovered after abort" }),
      )
      expect(response.status).toBe(200)
      expect(messageText(Schema.decodeUnknownSync(MessageWithParts)(await response.json()))).toBe(
        "Recovered after abort",
      )
    } finally {
      gate.release()
    }
  })

  test("commands execute their expanded prompt and preserve the visible slash command", async () => {
    const session = await api.create()
    const response = await api.request(`/session/${session.id}/command`, {
      method: "POST",
      body: JSON.stringify({
        command: "conformance",
        arguments: scenario({ kind: "command", text: "Command complete" }),
        agent: "conformance-runner",
      }),
    })
    if (response.status !== 200)
      throw new Error(`Command failed: ${response.status} ${await response.text()}`)
    expect(messageText(Schema.decodeUnknownSync(MessageWithParts)(await response.json()))).toBe(
      "Command complete",
    )
    expect(
      (await api.messages(session.id))
        .filter((message) => message.info.role === "user")
        .map(messageText)
        .join("\n"),
    ).toContain("/conformance")
  })

  test("no-reply prompts acknowledge the user input without starting a turn", async () => {
    const session = await api.create()
    const content = scenario({ kind: "reply", text: "Held input" })
    const response = await api.prompt(session.id, content, { noReply: true })
    expect(response.status).toBe(200)
    const admitted = Schema.decodeUnknownSync(MessageWithParts)(await response.json())
    expect(admitted.info.role).toBe("user")
    expect(messageText(admitted)).toBe(content)
    expect((await api.statuses())[session.id]).toBeUndefined()
    expect(
      (await api.messages(session.id)).some((message) => message.info.role === "assistant"),
    ).toBe(false)
  })
})
