import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRuntimeHarness, messageText, scenario } from "./harness"

let api: Awaited<ReturnType<typeof createRuntimeHarness>>
beforeAll(async () => {
  api = await createRuntimeHarness()
})
afterAll(async () => {
  await api?.[Symbol.asyncDispose]()
})
const ask = scenario({ kind: "question" })

describe("Forms port", () => {
  test("pending questions are listed after reconnect and answers reach the assistant", async () => {
    const session = await api.create()
    {
      await using initial = await api.events()
      await api.promptAsync(session.id, ask)
      await initial.until(
        (event) =>
          event.payload.type === "question.asked" &&
          event.payload.properties.sessionID === session.id,
      )
    }
    await using reconnected = await api.events()
    const pending = (await api.questions()).find((item) => item.sessionID === session.id)
    expect(pending?.questions).toMatchObject([
      { header: "Format", multiple: false, custom: true },
      { header: "Extras", multiple: true },
    ])
    if (!pending) throw new Error("Missing pending question after reconnect")
    expect(
      await api.json(`/question/${pending.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ answers: [["PDF"], ["Notes", "Images"]] }),
      }),
    ).toBe(true)
    await reconnected.until(
      (event) =>
        event.payload.type === "question.replied" &&
        event.payload.properties.requestID === pending.id,
    )
    await reconnected.idle(session.id)
    expect((await api.questions()).filter((item) => item.sessionID === session.id)).toEqual([])
    const answer = (await api.messages(session.id)).at(-1)
    expect(answer?.info).toMatchObject({ role: "assistant", finish: "stop" })
    expect(answer && messageText(answer)).toContain("PDF")
    expect(answer && messageText(answer)).toContain("Notes")
    expect(answer && messageText(answer)).toContain("Images")
  })

  test("cancelling a question after reconnect clears it and returns the conversation to idle", async () => {
    const session = await api.create()
    {
      await using initial = await api.events()
      await api.promptAsync(session.id, ask)
      await initial.until(
        (event) =>
          event.payload.type === "question.asked" &&
          event.payload.properties.sessionID === session.id,
      )
    }
    await using reconnected = await api.events()
    const pending = (await api.questions()).find((item) => item.sessionID === session.id)
    if (!pending) throw new Error("Missing pending question")
    expect(await api.json(`/question/${pending.id}/reject`, { method: "POST" })).toBe(true)
    await reconnected.until(
      (event) =>
        event.payload.type === "question.rejected" &&
        event.payload.properties.requestID === pending.id,
    )
    await reconnected.idle(session.id)
    expect((await api.questions()).filter((item) => item.sessionID === session.id)).toEqual([])
    expect((await api.messages(session.id)).at(-1)?.info).toMatchObject({
      role: "assistant",
      time: { completed: expect.any(Number) },
    })
    expect((await api.statuses())[session.id]).toBeUndefined()
    const resumed = await api.prompt(
      session.id,
      scenario({ kind: "reply", text: "Continue after cancellation" }),
    )
    expect(resumed.status).toBe(200)
  })

  test("invalid single-choice answers leave the request available for a corrected answer", async () => {
    const session = await api.create()
    await using events = await api.events()
    await api.promptAsync(session.id, ask)
    await events.until(
      (event) =>
        event.payload.type === "question.asked" &&
        event.payload.properties.sessionID === session.id,
    )
    const pending = (await api.questions()).find((item) => item.sessionID === session.id)
    if (!pending) throw new Error("Missing pending question")
    const invalid = await api.request(`/question/${pending.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ answers: [["PDF", "Text"], []] }),
    })
    expect(invalid.status).toBe(400)
    expect((await api.questions()).map((item) => item.id)).toContain(pending.id)
    await api.json(`/question/${pending.id}/reply`, {
      method: "POST",
      body: JSON.stringify({ answers: [["Text"], []] }),
    })
    await events.idle(session.id)
    const answer = (await api.messages(session.id)).at(-1)
    expect(answer && messageText(answer)).toContain("Text")
  })
})
