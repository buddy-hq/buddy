# Driving OpenCode v2 with a simulated model for Buddy tests

Research target: vendored OpenCode v2.0.24 and its in-process SDK host.

## Findings

### What `simulation` does

`simulation` is a top-level optional boolean in `ServerOptions`; the exact shape is `{ simulation: true }`, not a nested model fixture. (`vendor/opencode/packages/server/src/options.ts:6-19`)

When enabled, server route construction dynamically imports `@opencode/simulation/backend` and adds its replacements to the application graph. (`vendor/opencode/packages/server/src/routes.ts:142-159`)

The backend replaces outbound HTTP with an in-memory route table. Without `OPENCODE_DRIVE`, it installs only a fixed empty ModelsDev catalog; unknown destinations fail, so no model answer is produced. (`vendor/opencode/packages/simulation/src/backend/index.ts:12-32`; `vendor/opencode/packages/simulation/src/backend/network.ts:7-16,52-79`)

With `OPENCODE_DRIVE`, it reads a Drive manifest, opens its control WebSocket, and adds a simulated OpenAI Chat endpoint. The attached Drive controller receives requests and streams chunks/finish; tool registration and execution also go through it. (`vendor/opencode/packages/simulation/src/backend/index.ts:31-57`; `vendor/opencode/packages/simulation/src/backend/simulated-provider.ts:181-194,227-244,320-353,538-576`)

That endpoint encodes driver output as OpenAI Chat SSE and sends it through the real parser and session runner. This is Drive-driven simulation, not an in-process scripted response API. (`vendor/opencode/packages/simulation/src/backend/openai.ts:8-16,84-129`)

### Enabling it from the SDK

Yes: `EmbeddedHost.CreateOptions` inherits `ServerOptions` except network binding fields, and Promise SDK `CreateOptions` inherits those host options. So `OpenCode.create({ simulation: true })` is accepted. (`vendor/opencode/packages/sdk/src/internal/host.ts:17-21`; `vendor/opencode/packages/sdk/src/promise.ts:20-23`; `vendor/opencode/packages/sdk/src/opencode.ts:5-10`)

The Promise SDK's public wrapper accepts only the options argument. Its internal `PromiseSdk.create` has an embed argument, but `OpenCode.create` does not expose it; the Effect SDK does. Upstream uses the Effect SDK embed override to replace `LLMClient` with `TestLLM`. (`vendor/opencode/packages/sdk/src/opencode.ts:10`; `vendor/opencode/packages/sdk/src/promise.ts:33-52`; `vendor/opencode/packages/sdk/src/effect/opencode.ts:14-16,36-42`; `vendor/opencode/packages/sdk/test/embedded.test.ts:37-65`)

For a scripted Promise SDK turn, register a plugin in `plugins` and set `ctx.aisdk.hook("language", ...)` to supply a `LanguageModelV3`. Core resolves the SDK, runs language hooks, then prefers `event.language` over `sdk.languageModel(...)`; with a configured model this avoids provider requests. (`vendor/opencode/packages/plugin/src/promise/plugin.ts:26-60`; `vendor/opencode/packages/plugin/src/promise/aisdk.ts:1-22`; `vendor/opencode/packages/core/src/plugin/host.ts:157-185`; `vendor/opencode/packages/core/src/aisdk.ts:334-359`)

`ctx.provider.transform` can add a test provider/model, but `config.content` suffices for a one-off model declaration. No `simulation` references were found in the core/server/SDK test trees. The searched tests contain no `MockLanguageModel` abstraction: core defines a small `LanguageModelV3` fake and `TestLLM` is a higher-level `LLMClient` fake. (`vendor/opencode/packages/core/test/model-plugins.test.ts:31-60`; `vendor/opencode/packages/sdk/test/embedded.test.ts:44-61`; `vendor/opencode/packages/core/test/aisdk.test.ts:43-63,821-850`; `vendor/opencode/packages/ai/src/testing.ts:23-48,69-107,223-229`)

`@opencode/http-recorder` records real HTTP/WebSocket traffic and replays JSON cassettes; a missing cassette is recorded from the upstream service. It helps test provider transport, not provide a zero-network scripted model. (`vendor/opencode/packages/http-recorder/README.md:3-7,59-79`)

## Minimal Promise SDK example

This mock answers no-tool requests (such as title generation) with text, emits text plus one `lookup` call on the first request advertising that tool, then returns final text on the follow-up request.

```ts
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LanguageModelV3, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { OpenCode } from "@opencode/sdk"
import { Plugin } from "@opencode/plugin"

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } as const
const finish = (reason: "stop" | "tool-calls") => ({ type: "finish", finishReason: { unified: reason, raw: reason === "tool-calls" ? "tool_calls" : "stop" }, usage }) satisfies LanguageModelV3StreamPart
const textReply = (text: string): LanguageModelV3StreamPart[] => [{ type: "text-start", id: "answer" }, { type: "text-delta", id: "answer", delta: text }, { type: "text-end", id: "answer" }, finish("stop")]
const readable = (parts: LanguageModelV3StreamPart[]) => new ReadableStream<LanguageModelV3StreamPart>({ start(c) { for (const part of parts) c.enqueue(part); c.close() } })

let sentLookup = false
const scripted: LanguageModelV3 = {
  specificationVersion: "v3", provider: "buddy-test", modelId: "scripted-chat", supportedUrls: {},
  doGenerate: async () => { throw new Error("Unexpected non-streaming call") },
  doStream: async (options) => {
    const canLookup = options.tools?.some((tool) => tool.type === "function" && tool.name === "lookup") ?? false
    if (canLookup && !sentLookup) {
      sentLookup = true
      const parts: LanguageModelV3StreamPart[] = [
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: "Checking " },
        { type: "text-delta", id: "answer", delta: "the result." },
        { type: "text-end", id: "answer" },
        { type: "tool-input-start", id: "call-1", toolName: "lookup" },
        { type: "tool-input-delta", id: "call-1", delta: '{"query":"weather"}' },
        { type: "tool-input-end", id: "call-1" },
        { type: "tool-call", toolCallId: "call-1", toolName: "lookup", input: '{"query":"weather"}' },
        finish("tool-calls"),
      ]
      return { stream: readable(parts) }
    }
    return { stream: readable(textReply(canLookup ? "Lookup complete." : "Scripted title.")) }
  },
}

let executed = 0
const scriptedPlugin = Plugin.define({
  id: "buddy-scripted-model",
  async setup(ctx) {
    await ctx.tool.transform((editor) => editor.add({
      name: "lookup", description: "Return the fixture result for a query.",
      input: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
      options: { codemode: false },
      execute: async (input) => { executed++; return { content: `fixture:${(input as { query: string }).query}` } },
    }))
    await ctx.aisdk.hook("language", (event) => { event.language = scripted }, { providerID: "scripted" })
  },
})

const root = await mkdtemp(join(tmpdir(), "buddy-opencode-scripted-"))
const opencode = await OpenCode.create({
  database: { path: join(root, "opencode.sqlite") },
  config: { directory: root, project: false, content: JSON.stringify({
    model: "scripted/scripted-chat",
    providers: { scripted: { package: "aisdk:@ai-sdk/openai-compatible", settings: { apiKey: "test", baseURL: "https://unused.invalid/v1" }, models: { "scripted-chat": {} } } },
  }) },
  models: { fetch: false }, fs: { filewatcher: false }, plugins: [scriptedPlugin],
})

try {
  const session = await opencode.sessions.create({ location: { directory: root }, agent: "build", model: { providerID: "scripted", id: "scripted-chat" } })
  let sawTextDelta = false, sawToolCall = false, sawToolResult = false, sawStepEnd = false
  const observeTurn = (async () => {
    for await (const event of opencode.events.subscribe()) {
      if (event.type === "session.text.delta" && event.data.sessionID === session.id) sawTextDelta = true
      if (event.type === "session.tool.called" && event.data.sessionID === session.id) sawToolCall = true
      if (event.type === "session.tool.success" && event.data.sessionID === session.id) sawToolResult = true
      if (event.type === "session.step.ended" && event.data.sessionID === session.id) sawStepEnd = true
      if (event.type === "session.execution.succeeded" && event.data.sessionID === session.id) return
    }
  })()
  await opencode.sessions.prompt({ sessionID: session.id, text: "Look up the weather." })
  await observeTurn
  if (!sawTextDelta || !sawToolCall || !sawToolResult || !sawStepEnd || executed !== 1) throw new Error("Expected streamed text, one lookup result, and a completed step")
} finally {
  await opencode.close()
  await rm(root, { recursive: true, force: true })
}
```

The stream parts match the core AI SDK fake. The runner executes local `tool-call` events, joins the tool fiber, and publishes step completion; the second response closes the turn. (`vendor/opencode/packages/core/test/aisdk.test.ts:43-58,821-850`; `vendor/opencode/packages/core/src/session/runner/step.ts:103-145,219-245`)

## Caveats for Buddy tests

- Branch on tool availability or request content, not wall-clock time. A session may make a no-tool title request; the example handles it separately. (`vendor/opencode/packages/core/src/session/title.ts:48-98,100-135`)
- Wait for `session.execution.succeeded` or `sessions.wait()`, not a fixed delay. Tool calls run in fibers and are joined before step end. (`vendor/opencode/packages/core/src/session/runner/step.ts:103-145`; `vendor/opencode/packages/core/src/session/execution.ts:111-135`)
- Text delta events are ephemeral and batched at 100 ms, then flushed at block end. Assert text presence or assembled content, not exact delta counts/boundaries. (`vendor/opencode/packages/schema/src/session-event.ts:391-426`; `vendor/opencode/packages/core/src/session/runner/publish-llm-event.ts:79,145-185,207-228`)
- Expect `session.text.*`, `session.tool.called`, `session.tool.success` (or `.failed`), and `session.step.ended`; a tool cycle can end more than one model step before `session.execution.succeeded`. (`vendor/opencode/packages/schema/src/session-event.ts:328-370,391-426,468-565,652-702`)
- `simulation: true` instead requires provisioning the Drive control server/manifest; without `OPENCODE_DRIVE`, only the catalog route is installed. Keep the DB, config, and any Drive registry in temporary roots. (`vendor/opencode/packages/simulation/src/backend/index.ts:28-57`; `vendor/opencode/packages/simulation/src/manifest.ts:69-108`)
