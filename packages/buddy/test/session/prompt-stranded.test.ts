import { expect, test } from "bun:test"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { createRuntimeHarness } from "../conformance/harness"
import { runtimeHost } from "../helpers/opencode"

test("returns a preparation failure and removes the stranded prompt from the inbox", async () => {
  await using api = await createRuntimeHarness()
  const session = await api.create()
  const runtime = await getAgentRuntime()
  const messageID = `msg_${crypto.randomUUID()}`
  const controller = new AbortController()
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(
    () => timeout.reject(new Error("Prompt did not settle within 5 seconds")),
    5_000,
  )
  try {
    const result = await Promise.race([
      runtime.execution.prompt(
        {
          sessionID: session.id,
          messageID,
          text: "This prompt must not be delivered later.",
          agent: "missing-agent",
        },
        { directory: api.directory, signal: controller.signal },
      ),
      timeout.promise,
    ])
    expect(result).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("Agent not found") },
    })
    const pending = await runtimeHost(runtime).session.inbox.list({ sessionID: session.id })
    expect(pending.map((item) => item.id)).not.toContain(messageID)
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}, 15_000)
