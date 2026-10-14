import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Hono } from "hono"
import { createOpenCodeHost, type OpenCodeHost, type OpenCodeEvent } from "@buddy/opencode-adapter/host"
import { Plugin, type AISDKHooks } from "@buddy/opencode-adapter/plugin"
import { toBuddyQuestionEvent } from "@buddy/opencode-adapter/gateway/form"
import { GlobalRoutes } from "../src/routes/global"
import { createQuestionRoutes } from "../src/routes/question"
import { resolveOpenCodeEnvironmentPlan } from "../src/opencode-runtime/env"
import { temporaryDirectory, type TemporaryDirectory } from "./helpers/temporary-directory"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>
type StreamPart = Awaited<ReturnType<LanguageModel["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never
const questionInput = { questions: [
  { header: "Format", question: "Which format?", options: [{ label: "PDF", description: "Portable" }] },
  { header: "Extras", question: "Which extras?", options: [{ label: "Notes", description: "Add notes" }, { label: "Images", description: "Add images" }], multiple: true },
] }
const model = Plugin.define({ id: "buddy.test.questions", async setup(ctx) {
  await ctx.aisdk.hook("language", (event) => {
    event.language = {
      specificationVersion: "v3", provider: "question-test", modelId: "chat", supportedUrls: {},
      async doGenerate() { throw new Error("Unexpected generation") },
      async doStream(options) {
        const asked = options.prompt.some((message) => message.role === "tool")
        const parts: StreamPart[] = asked ? [{ type: "text-start", id: "answer" }, { type: "text-delta", id: "answer", delta: "Thanks" }, { type: "text-end", id: "answer" }]
          : [{ type: "tool-call", toolCallId: "ask-format", toolName: "question", input: JSON.stringify(questionInput) }]
        parts.push({ type: "finish", finishReason: { unified: asked ? "stop" : "tool-calls", raw: asked ? "stop" : "tool-calls" }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } } })
        return { stream: new ReadableStream<StreamPart>({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } }) }
      },
    }
  }, { providerID: "question-test" })
} })
let root: TemporaryDirectory
let host: OpenCodeHost
let directory: string
let otherDirectory: string
const app = new Hono().route("/question", createQuestionRoutes(async () => host)).route("/global", GlobalRoutes)
beforeAll(async () => {
  root = await temporaryDirectory({ prefix: "buddy-question-routes-" })
  directory = path.join(root.path, "notebook")
  otherDirectory = path.join(root.path, "other")
  await Promise.all([fs.mkdir(directory), fs.mkdir(otherDirectory)])
  directory = await fs.realpath(directory)
  otherDirectory = await fs.realpath(otherDirectory)
  const plan = resolveOpenCodeEnvironmentPlan({ environment: { BUDDY_RUNTIME_ROOT: root.path, BUDDY_GLOBAL_CONFIG_DIR: path.join(root.path, "config") }, homeDirectory: root.path, temporaryDirectory: root.path, workingDirectory: root.path })
  host = await createOpenCodeHost({ clientName: "question-test", paths: plan.openCode, databasePath: plan.openCode.database, fetchModels: false, fs: { filewatcher: false, fff: false }, config: { project: false, content: JSON.stringify({ model: "question-test/chat", providers: { "question-test": { package: "aisdk:@ai-sdk/perplexity", settings: { apiKey: "test" }, models: { chat: {} } } }, agents: { buddy: {} } }) }, plugins: [model], instances: { key: () => "question-runtime", configure: () => ({ plugins: [] }) } })
})
afterAll(async () => { await host?.close(); await root?.[Symbol.asyncDispose]() })
async function nextEvent(events: AsyncIterator<OpenCodeEvent>, matches: (event: OpenCodeEvent) => boolean) {
  while (true) {
    const event = await events.next()
    if (event.done) throw new Error("Event stream ended")
    if (event.value.type === "session.execution.failed") throw new Error(event.value.data.error.message)
    if (matches(event.value)) return event.value
  }
}
describe("question routes on native v2 forms", () => {
  test.each(["reply", "reject"] as const)("%s preserves question answers and isolates notebooks", async (action) => {
    const session = await host.session.create({ location: { directory }, agent: "buddy", model: { providerID: "question-test", id: "chat" }, permissions: [{ action: "*", resource: "*", effect: "allow" }] })
    const controller = new AbortController()
    const events = host.event.subscribe({ signal: controller.signal })[Symbol.asyncIterator]()
    const headers = { "x-buddy-directory": directory, "content-type": "application/json" }
    const body = JSON.stringify({ answers: [["PDF"], ["Notes", "Images"]] })
    try {
      await nextEvent(events, (event) => event.type === "server.connected")
      await host.session.prompt({ sessionID: session.id, text: "Ask the user" })
      const created = await nextEvent(events, (event) => event.type === "form.created" && event.data.form.sessionID === session.id)
      if (created.type !== "form.created") throw new Error("Expected question form")
      const form = created.data.form
      const listed = await app.request("/question", { headers })
      expect({ status: listed.status, body: await listed.clone().json() }).toMatchObject({ status: 200 })
      expect(await listed.json()).toMatchObject([{ id: form.id, sessionID: session.id, questions: [{ header: "Format", question: "Which format?", multiple: false, custom: true }, { header: "Extras", multiple: true }], tool: { callID: "ask-format" } }])
      expect(toBuddyQuestionEvent(created, directory)?.payload.type).toBe("question.asked")
      const refresh = await app.request("/global/dispose", { method: "POST" })
      expect(refresh.status).toBe(200)
      expect((await host.session.form.list({ sessionID: session.id })).map((entry) => entry.id)).toContain(form.id)
      const crossNotebook = await app.request(`/question/${form.id}/${action}`, { method: "POST", headers: { ...headers, "x-buddy-directory": otherDirectory }, body })
      expect(crossNotebook.status).toBe(404)
      if (action === "reply") {
        const malformed = await app.request(`/question/${form.id}/reply`, { method: "POST", headers, body: JSON.stringify({ answers: [["PDF", "Text"], []] }) })
        expect(malformed.status).toBe(400)
      }
      const response = await app.request(`/question/${form.id}/${action}`, { method: "POST", headers, body })
      expect(response.status).toBe(200)
      expect(await response.json()).toBe(true)
      const settled = await nextEvent(events, (event) => (event.type === "form.replied" || event.type === "form.cancelled") && event.data.id === form.id)
      expect(toBuddyQuestionEvent(settled, directory)?.payload).toMatchObject({ type: action === "reply" ? "question.replied" : "question.rejected", properties: { requestID: form.id, sessionID: session.id } })
      await host.session.wait({ sessionID: session.id })
      expect(await host.session.form.list({ sessionID: session.id })).toEqual([])
      expect((await host.session.form.get({ sessionID: session.id, formID: form.id })).state).toEqual(action === "reply" ? { status: "answered", answer: { q0: "PDF", q1: ["Notes", "Images"] } } : { status: "cancelled" })
    } finally { controller.abort(); await events.return?.() }
  })
})
