import z from "zod"
import { Plugin, type AISDKHooks } from "@buddy/opencode-adapter/plugin"
import { scriptedModelPlugin } from "./scripted-model"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>
export type ModelRequest = Parameters<LanguageModel["doStream"]>[0]
type StreamPart =
  Awaited<ReturnType<LanguageModel["doStream"]>>["stream"] extends ReadableStream<infer Part>
    ? Part
    : never
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

export function subagentScriptedModel(input: {
  requests: ModelRequest[]
  hold?: (request: ModelRequest) => Promise<void>
}): Plugin.Plugin {
  const base = scriptedModelPlugin(input.requests)
  return Plugin.define({
    id: base.id,
    async setup(ctx) {
      await base.setup(ctx)
      await ctx.aisdk.hook(
        "language",
        (event) => {
          event.language = {
            specificationVersion: "v3",
            provider: "buddy-test",
            modelId: "chat",
            supportedUrls: {},
            async doGenerate() {
              throw new Error("Unexpected generation")
            },
            async doStream(request) {
              input.requests.push(request)
              await input.hold?.(request)
              const userIndex = request.prompt.findLastIndex((message) => message.role === "user")
              const user = request.prompt[userIndex]
              const text =
                user?.role === "user"
                  ? user.content
                      .flatMap((part) => (part.type === "text" ? [part.text] : []))
                      .join("\n")
                  : ""
              const alreadyCalled = request.prompt
                .slice(userIndex + 1)
                .some((message) => message.role === "tool")
              let tool: { name: string; input: string } | undefined
              const delegateAt = text.indexOf("fixture-delegate:")
              if (delegateAt >= 0 && !alreadyCalled)
                tool = {
                  name: "subagent",
                  input: text.slice(delegateAt + "fixture-delegate:".length),
                }
              if (
                delegateAt < 0 &&
                !text.startsWith("fixture-parallel:") &&
                text.includes("fixture-child:flashcard") &&
                !alreadyCalled
              )
                tool = {
                  name: "save_flashcard_deck",
                  input: JSON.stringify({
                    title: "Delegated deck",
                    notes: [
                      { type: "basic", fields: { front: "Capital of France?", back: "Paris" } },
                    ],
                  }),
                }
              if (
                delegateAt < 0 &&
                !text.startsWith("fixture-parallel:") &&
                text.includes("fixture-child:question") &&
                !alreadyCalled
              )
                tool = {
                  name: "save_question_set",
                  input: JSON.stringify({
                    title: "Delegated quiz",
                    questions: [
                      {
                        id: "q1",
                        type: "mcq",
                        prompt: "Capital of France?",
                        goalIds: ["goal-1"],
                        payload: {
                          multipleSelect: false,
                          choices: [
                            { id: "a", content: "Paris", correct: true },
                            { id: "b", content: "London", correct: false },
                          ],
                        },
                      },
                    ],
                  }),
                }
              const parallel =
                text.startsWith("fixture-parallel:") && !alreadyCalled
                  ? z
                      .array(z.string())
                      .parse(JSON.parse(text.slice("fixture-parallel:".length)))
                      .map((input) => ({ name: "subagent", input }))
                  : []
              const calls = tool ? [tool] : parallel
              const parts: StreamPart[] =
                calls.length > 0
                  ? [
                      ...calls.flatMap((call, index): StreamPart[] => [
                        {
                          type: "tool-input-start",
                          id: `fixture-call-${index}`,
                          toolName: call.name,
                        },
                        {
                          type: "tool-input-delta",
                          id: `fixture-call-${index}`,
                          delta: call.input,
                        },
                        { type: "tool-input-end", id: `fixture-call-${index}` },
                        {
                          type: "tool-call",
                          toolCallId: `fixture-call-${index}`,
                          toolName: call.name,
                          input: call.input,
                        },
                      ]),
                      {
                        type: "finish",
                        finishReason: { unified: "tool-calls", raw: "tool-calls" },
                        usage,
                      },
                    ]
                  : [
                      { type: "text-start", id: "answer" },
                      { type: "text-delta", id: "answer", delta: "Worker complete." },
                      { type: "text-end", id: "answer" },
                      { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
                    ]
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
