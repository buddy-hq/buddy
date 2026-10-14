import { expect, test } from "bun:test"
import { Plugin, type AISDKHooks } from "@buddy/opencode-adapter/plugin"
import { createNotebookTestHost } from "../helpers/opencode"
import { createGitRepo } from "../helpers/repo"
import { writeProjectConfig } from "../helpers/project-config"
import { canonicalizeRuntimeConfigDirectory } from "../../src/config/store/directories"
import { syncNotebookRuntimeConfig } from "../../src/config/runtime/opencode-sync"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>
type StreamPart = Awaited<ReturnType<LanguageModel["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } }

const skillModel = Plugin.define({ id: "buddy.test.skill-model", async setup(ctx) {
  await ctx.aisdk.hook("language", (event) => {
    event.language = { specificationVersion: "v3", provider: "buddy-test", modelId: "chat", supportedUrls: {},
      async doGenerate() { throw new Error("Unexpected non-streaming request") },
      async doStream(options) {
        const called = options.prompt.some((message) => message.role === "tool")
        const parts: StreamPart[] = called ? [
          { type: "text-start", id: "answer" }, { type: "text-delta", id: "answer", delta: "Skill loaded." }, { type: "text-end", id: "answer" },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ] : [
          { type: "tool-call", toolCallId: "load-teaching", toolName: "skill", input: '{"id":"teaching-models"}' },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage },
        ]
        return { stream: new ReadableStream<StreamPart>({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } }) }
      },
    }
  }, { providerID: "scripted" })
} })

test("loads a Buddy teaching skill through the v2 skill tool and notebook permissions", async () => {
  await using repo = await createGitRepo("skill-tool-runtime")
  const directory = canonicalizeRuntimeConfigDirectory(repo.path)
  writeProjectConfig(repo.path, JSON.stringify({ model: "scripted/chat", provider: { scripted: {
    npm: "@ai-sdk/perplexity", options: { apiKey: "test-key" }, models: { chat: {} },
  } } }))
  await using runtime = await createNotebookTestHost({ plugins: [skillModel] })
  await syncNotebookRuntimeConfig(runtime.host, directory)
  const session = await runtime.host.session.create({ location: { directory }, agent: "buddy", model: { providerID: "scripted", id: "chat" } })
  await runtime.host.session.prompt({ sessionID: session.id, text: "Load teaching-models" })
  await runtime.host.session.wait({ sessionID: session.id })
  const history = await runtime.host.message.list({ sessionID: session.id })
  const tools = history.data.flatMap((message) => message.type === "assistant" ? message.content.filter((part) => part.type === "tool") : [])
  expect(tools.find((tool) => tool.name === "skill")?.state).toMatchObject({ status: "completed" })
  const loaded = tools.find((tool) => tool.name === "skill")
  expect(loaded?.state.status === "completed" ? loaded.state.content.filter((part) => part.type === "text").map((part) => part.text).join("\n") : undefined).toContain("<skill_content name=\"teaching-models\">")
})
