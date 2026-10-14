import { Plugin, type AISDKHooks } from "@buddy/opencode-adapter/plugin"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>
type StreamPart = Awaited<ReturnType<LanguageModel["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

function finish(reason: "stop" | "tool-calls"): StreamPart {
  return { type: "finish", finishReason: { unified: reason, raw: reason }, usage }
}

export function scriptedModelPlugin(requests: Parameters<LanguageModel["doStream"]>[0][]): Plugin.Plugin {
  return Plugin.define({
    id: "buddy.test.scripted",
    async setup(ctx) {
      await ctx.session.hook("context", (event) => { event.options.textVerbosity = "low" })
      await ctx.aisdk.hook("language", (event) => {
        event.language = {
          specificationVersion: "v3", provider: "buddy-test", modelId: "chat", supportedUrls: {},
          async doGenerate() { throw new Error("Unexpected non-streaming request") },
          async doStream(options) {
            requests.push(options)
            const hasTool = options.tools?.some((tool) => tool.type === "function" && tool.name === "buddy_probe")
            const alreadyCalled = options.prompt.some((message) => message.role === "tool")
            const requested = JSON.stringify(options.prompt).includes("run-probe")
            const parts: StreamPart[] = hasTool && requested && !alreadyCalled ? [
              { type: "tool-input-start", id: "call-buddy-probe", toolName: "buddy_probe" },
              { type: "tool-input-delta", id: "call-buddy-probe", delta: '{"term":"weather"}' },
              { type: "tool-input-end", id: "call-buddy-probe" },
              { type: "tool-call", toolCallId: "call-buddy-probe", toolName: "buddy_probe", input: '{"term":"weather"}' },
              finish("tool-calls"),
            ] : [
              { type: "text-start", id: "answer" },
              { type: "text-delta", id: "answer", delta: hasTool ? "Probe complete." : "Scripted title." },
              { type: "text-end", id: "answer" }, finish("stop"),
            ]
            return { stream: new ReadableStream<StreamPart>({ start(controller) {
              for (const part of parts) controller.enqueue(part)
              controller.close()
            } }) }
          },
        }
      }, { providerID: "scripted" })
    },
  })
}
