import { Plugin, type AISDKHooks } from "@buddy/opencode-adapter/plugin"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>
type StreamPart =
  Awaited<ReturnType<LanguageModel["doStream"]>>["stream"] extends ReadableStream<infer Part>
    ? Part
    : never

export function scriptedToolModel(input: { name: string; arguments: object }) {
  return Plugin.define({
    id: "buddy.test.feature-tool-model",
    async setup(ctx) {
      await ctx.aisdk.hook(
        "language",
        (event) => {
          event.language = {
            specificationVersion: "v3",
            provider: "buddy-test",
            modelId: "chat",
            supportedUrls: {},
            async doGenerate() {
              throw new Error("Unexpected non-streaming request")
            },
            async doStream(options) {
              const called = options.prompt.some((message) => message.role === "tool")
              const available = options.tools?.some(
                (tool) => tool.type === "function" && tool.name === input.name,
              )
              const reason = called || !available ? "stop" : "tool-calls"
              const parts: StreamPart[] =
                reason === "tool-calls"
                  ? [
                      {
                        type: "tool-call",
                        toolCallId: "call-feature-tool",
                        toolName: input.name,
                        input: JSON.stringify(input.arguments),
                      },
                    ]
                  : [
                      { type: "text-start", id: "answer" },
                      { type: "text-delta", id: "answer", delta: "Feature tool completed." },
                      { type: "text-end", id: "answer" },
                    ]
              parts.push({
                type: "finish",
                finishReason: { unified: reason, raw: reason },
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
              })
              return {
                stream: new ReadableStream<StreamPart>({
                  start(controller) {
                    for (const part of parts) controller.enqueue(part)
                    controller.close()
                  },
                }),
              }
            },
          }
        },
        { providerID: "scripted" },
      )
    },
  })
}
