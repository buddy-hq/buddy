import { afterAll, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { getOpenCodeClient } from "../../src/opencode-runtime/client"
import { closeOpenCodeHost } from "../../src/opencode-runtime/runtime"
import { SessionRoutes } from "../../src/routes/session"
import { tmpdir } from "../helpers/tmpdir"
import { scriptedModelPlugin } from "../opencode-runtime/scripted-model"

afterAll(closeOpenCodeHost)

describe("v2 Buddy transcript route", () => {
  test("reads a synthetic completion from the real host through Buddy's session route", async () => {
    await using notebook = await tmpdir({ config: {
      model: "scripted/chat",
      provider: { scripted: { npm: "@ai-sdk/perplexity", options: { apiKey: "test" }, models: { chat: {} } } },
    } })
    const directory = notebook.path
    const host = await getOpenCodeClient()
    await host.plugin(scriptedModelPlugin([]))
    await syncOpenCodeProjectConfig(directory)
    const session = await host.sessions.create({ location: { directory }, title: "Transcript route" })
    await host.sessions.synthetic({ sessionID: session.id, text: "Completed", description: "Sandbox shell", metadata: { source: "shell", state: "completed" } })
    await host.sessions.wait({ sessionID: session.id }, { signal: AbortSignal.timeout(10_000) })
    const app = new Hono().route("/session", SessionRoutes)
    const response = await app.request(`/session/${session.id}/message`, { headers: { "x-buddy-directory": directory } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject([
      { info: { sessionID: session.id, kind: "synthetic" }, parts: [{ type: "notice", source: "shell", text: "Shell completed: Sandbox shell" }] },
      { info: { sessionID: session.id, role: "assistant", providerID: "scripted", finish: "stop" }, parts: [{ type: "text", text: "Scripted title." }] },
    ])
  }, 15_000)
})
