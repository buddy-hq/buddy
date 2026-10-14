import { describe, expect, test } from "bun:test"
import z from "zod"
import { createBuddyTool } from "../../src/learning/runtime/create-buddy-tool"
import { buddyToolToToolInfo } from "../../src/opencode-runtime/buddy-tool-shim"
import { interruptSession } from "@buddy/opencode-adapter/gateway/session"
import { promptSession } from "@buddy/opencode-adapter/gateway/write"
import { createWriteFixture } from "./v2-write-fixture"

describe("Buddy tool abort handling on v2", () => {
  test("interrupts a real tool turn and does not publish its late result", async () => {
    const started = Promise.withResolvers<void>()
    const aborted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const tool = createBuddyTool({
      id: "buddy_probe", description: "Wait for cancellation", presentation: { archetype: "silent" },
      parameters: z.object({ term: z.string() }),
      async execute(_input, ctx) {
        started.resolve()
        ctx.abort.addEventListener("abort", () => aborted.resolve(), { once: true })
        await release.promise
        return { title: "Late result", output: "This late result must be discarded", metadata: {} }
      },
    })
    await using fixture = await createWriteFixture({ loadTools: async (runtime) => [buddyToolToToolInfo(tool, runtime)] })
    const { host, directory } = fixture
    const session = await host.session.create({ location: { directory }, agent: "buddy" })
    const turn = promptSession(host, { sessionID: session.id, text: "run-probe" }, { directory }, AbortSignal.timeout(10_000))
    try {
      await started.promise
      expect(await interruptSession(host, session.id)).toBe(true)
      await aborted.promise
      release.resolve()
      await turn
      const messages = await host.message.list({ sessionID: session.id, order: "asc" })
      expect(JSON.stringify(messages.data)).not.toContain("This late result must be discarded")
      expect(await interruptSession(host, session.id)).toBe(false)
    } finally { release.resolve(); await turn }
  }, 15_000)
})
