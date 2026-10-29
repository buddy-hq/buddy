import { describe, expect, test } from "bun:test"
import { app } from "../src/app"
import { createRuntimeHarness, scenario } from "./conformance/harness"
import { tmpdir } from "./helpers/tmpdir"

describe("question notebook isolation", () => {
  test.each(["reply", "reject"] as const)("%s cannot settle a question from another notebook", async (action) => {
    await using api = await createRuntimeHarness()
    await using other = await tmpdir()
    const session = await api.create()
    await using events = await api.events()
    await api.promptAsync(session.id, scenario({ kind: "question" }))
    await events.until((event) => event.payload.type === "question.asked" && event.payload.properties.sessionID === session.id)
    const pending = (await api.questions()).find((question) => question.sessionID === session.id)
    if (!pending) throw new Error("Missing question")
    const response = await app.request(`/api/question/${pending.id}/${action}`, {
      method: "POST", headers: { "x-buddy-directory": other.path, "content-type": "application/json" },
      body: JSON.stringify({ answers: [["PDF"], ["Notes", "Images"]] }),
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ code: "request.not_found", error: "Question not found" })
    expect((await api.questions()).map((question) => question.id)).toContain(pending.id)
    expect(await api.json(`/question/${pending.id}/${action}`, {
      method: "POST", body: action === "reply" ? JSON.stringify({ answers: [["PDF"], ["Notes", "Images"]] }) : undefined,
    })).toBe(true)
    await events.idle(session.id)
  })
})
