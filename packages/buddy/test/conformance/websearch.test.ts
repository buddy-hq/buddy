import { expect, test } from "bun:test"
import { getAgentRuntime } from "../../src/runtime/agent-runtime"
import { runtimeHost } from "../helpers/opencode"
import { createRuntimeHarness, scenario } from "./harness"

test("web search reaches Exa without a provider-consent form and settles offline", async () => {
  await using api = await createRuntimeHarness()
  const host = runtimeHost(await getAgentRuntime())
  const session = await api.create()
  const abort = new AbortController()
  const updates = host.event
    .subscribe({ signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4_000)]) })
    [Symbol.asyncIterator]()
  const providers: unknown[] = []
  const formKinds: unknown[] = []
  try {
    expect((await updates.next()).value?.type).toBe("server.connected")
    await api.promptAsync(
      session.id,
      scenario({
        kind: "tool",
        name: "websearch",
        arguments: { query: "offline web search provider probe" },
      }),
    )
    while (true) {
      const update = await updates.next()
      if (update.done) throw new Error("Native stream ended before web search settled")
      const event = update.value
      if (event.type === "form.created" && event.data.form.sessionID === session.id)
        formKinds.push(event.data.form.metadata?.kind)
      if (event.type === "session.tool.progress" && event.data.sessionID === session.id)
        providers.push(event.data.metadata.provider)
      if (
        (event.type === "session.execution.succeeded" ||
          event.type === "session.execution.failed" ||
          event.type === "session.execution.interrupted") &&
        event.data.sessionID === session.id
      )
        break
    }
    expect(formKinds).not.toContain("websearch.provider")
    const part = (await api.messages(session.id))
      .flatMap((message) => message.parts)
      .find((part) => part.type === "tool" && part.tool === "websearch")
    expect(part?.type === "tool" ? part.state.status : undefined).toBe("error")
    if (part?.type !== "tool" || part.state.status !== "error")
      throw new Error("Expected guarded web-search failure")
    expect(part.state.error).not.toContain("Web search cancelled")
    expect({ providers, error: part.state.error }).toMatchObject({
      providers: expect.arrayContaining(["exa"]),
    })
  } finally {
    abort.abort()
    await updates.return?.()
  }
}, 10_000)
