import { afterEach, describe, expect, test } from "bun:test"
import { getAgentRuntime, closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { app } from "../../src/app"
import { tmpdir } from "../helpers/tmpdir"
import { createRuntimeHarness, scenario } from "../conformance/harness"

afterEach(closeAgentRuntime)

describe("session message route", () => {
  test("returns the persisted transcript after runtime restart", async () => {
    await using api = await createRuntimeHarness()
    const session = await api.create()
    expect(
      (await api.prompt(session.id, scenario({ kind: "reply", text: "Persisted answer" }))).status,
    ).toBe(200)
    const before = await api.messages(session.id)
    await closeAgentRuntime()
    const after = await api.messages(session.id)
    expect(after.map((message) => message.info.id)).toEqual(
      before.map((message) => message.info.id),
    )
    expect(
      after
        .flatMap((message) => message.parts)
        .filter((part) => part.type === "text")
        .map((part) => part.text),
    ).toEqual(
      before
        .flatMap((message) => message.parts)
        .filter((part) => part.type === "text")
        .map((part) => part.text),
    )
  })

  test("returns Buddy tool presentation after runtime restart", async () => {
    await using api = await createRuntimeHarness()
    const session = await api.create({ agent: "buddy" })
    const response = await api.prompt(
      session.id,
      scenario({
        kind: "tool",
        name: "learning_tool_search",
        arguments: { query: "render diagram" },
      }),
      { agent: "buddy" },
    )
    expect(response.status).toBe(200)
    await closeAgentRuntime()
    const tools = (await api.messages(session.id))
      .flatMap((message) => message.parts)
      .filter((part) => part.type === "tool")
    expect(tools).toContainEqual(
      expect.objectContaining({
        tool: "learning_tool_search",
        metadata: expect.objectContaining({
          buddy: expect.objectContaining({
            presentation: expect.objectContaining({ action: "Searched learning tools" }),
          }),
        }),
      }),
    )
  })

  test("returns a client error for malformed cursors on an existing session", async () => {
    await using project = await tmpdir({ git: true })
    const session = await (await getAgentRuntime()).conversations.create(project.path)
    const response = await app.request(
      `/api/session/${session.id}/message?before=malformed-cursor`,
      { headers: { "x-buddy-directory": project.path } },
    )
    expect(response.status).toBe(400)
  })

  test("returns not found for paginated transcript reads on missing sessions", async () => {
    await using project = await tmpdir({ git: true })
    const response = await app.request("/api/session/ses_missing_message_route/message?limit=2", {
      headers: { "x-buddy-directory": project.path },
    })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      code: "session.not_found",
      error: "Session not found",
    })
  })
})
