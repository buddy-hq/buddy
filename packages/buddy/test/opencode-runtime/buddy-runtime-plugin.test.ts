import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { createOpenCodeHost, type OpenCodeHost, type OpenCodeEvent, type PermissionReply } from "@buddy/opencode-adapter/host"
import { Plugin, ToolError, type PluginContext, type AISDKHooks, type SessionContext } from "@buddy/opencode-adapter/plugin"
import { createBuddyTool } from "../../src/learning/runtime/create-buddy-tool"
import { createBuddyRuntimePlugin } from "../../src/opencode-runtime/plugins/buddy-runtime-plugin"
import { buddyToolToToolInfo } from "../../src/opencode-runtime/buddy-tool-shim"
import { getBuddyToolPresentationDescriptor, registerBuddyToolPresentationCatalog } from "../../src/opencode-runtime/buddy-tool-presentation-catalog"
import { withBuddyToolPermissionReplies, askBuddyToolPermission } from "../../src/opencode-runtime/tool-permission"
import { withBuddyCommandDisplay } from "../../src/opencode-runtime/command-display"
import { resolveOpenCodeEnvironmentPlan } from "../../src/opencode-runtime/env"
import { readCapturedSessionSystemPrompt } from "../../src/opencode-runtime/system-prompt-capture"
import { writeTeachingSessionState, clearAllTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { temporaryDirectory, type TemporaryDirectory } from "../helpers/temporary-directory"
import { scriptedModelPlugin } from "./scripted-model"
import { writeTemporaryBenchCapture, cleanupBenchCapturesForSession } from "../../src/learning/features/bench/captures"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>
const requests: Parameters<LanguageModel["doStream"]>[0][] = []
const contexts = new Map<string, PluginContext>()
const observations = new Map<string, { text: string; metadata: string }>()
const contextOptions = new Map<string, SessionContext["options"]>()
const source = [
  "System preamble.", "- Keep answers concise unless you're asked for depth.",
  "Instructions from: /fixture/AGENTS.md", "Keep agents instructions.",
  "Instructions from: /fixture/CLAUDE.md", "Discard claude instructions.",
  "Instructions from: C:\\fixture\\context.md", "Discard context instructions.",
].join("\n")
const probeTool = createBuddyTool({
  id: "buddy_probe", description: "Ask before returning a fixture.",
  presentation: { archetype: "silent" }, parameters: z.object({ query: z.string() }),
  normalizeInput<TRaw>(raw: TRaw) {
    const parsed = z.object({ term: z.string() }).safeParse(raw)
    return parsed.success ? { query: parsed.data.term } : raw
  },
  async execute(input, ctx) {
    await ctx.metadata({ title: "Waiting", metadata: { phase: "permission" } })
    await ctx.ask({ permission: "buddy_probe", patterns: [`fixture:${input.query}`], always: ["fixture:*"], metadata: { operation: "fixture lookup" } })
    return {
      title: "Probe result", output: "Weather fixture.",
      metadata: { historyCount: ctx.messages.length, privatePresentation: "MODEL_MUST_NOT_SEE", discarded: undefined },
      attachments: [{ type: "file", mime: "text/plain", url: "data:text/plain;base64,Zml4dHVyZQ==", filename: "fixture.txt" }],
    }
  },
})
let root: TemporaryDirectory
let host: OpenCodeHost
let directory: string

beforeAll(async () => {
  root = await temporaryDirectory({ prefix: "buddy-v2-host-" })
  directory = path.join(root.path, "notebook")
  await fs.mkdir(directory)
  directory = await fs.realpath(directory)
  const plan = resolveOpenCodeEnvironmentPlan({
    environment: { BUDDY_RUNTIME_ROOT: root.path, BUDDY_GLOBAL_CONFIG_DIR: path.join(root.path, "config") },
    homeDirectory: root.path, temporaryDirectory: root.path, workingDirectory: root.path,
  })
  const config = {
    model: "scripted/chat",
    providers: { scripted: { package: "aisdk:@ai-sdk/perplexity", settings: { apiKey: "test" }, models: { chat: {} } } },
    agents: { buddy: { system: source } },
    commands: { explain: { template: "Full command template: $ARGUMENTS" } },
  }
  const created = await createOpenCodeHost({
    clientName: "buddy", paths: plan.openCode, databasePath: plan.openCode.database,
    fetchModels: false, fs: { filewatcher: false, fff: false },
    config: { project: false, content: JSON.stringify(config) },
    plugins: [
      scriptedModelPlugin(requests),
      createBuddyRuntimePlugin({
        getClient: async () => host,
        async loadTools(runtime) {
          registerBuddyToolPresentationCatalog(runtime.directory, [probeTool])
          return [buddyToolToToolInfo(probeTool, runtime)]
        },
      }),
      Plugin.define({ id: "buddy.test.observe", async setup(ctx) {
        contexts.set(ctx.location.directory, ctx)
        await ctx.session.hook("prompt", (event) => {
          observations.set(event.sessionID, { text: event.prompt.text, metadata: JSON.stringify(event.metadata) })
        })
        await ctx.session.hook("context", (event) => {
          contextOptions.set(event.sessionID, { ...event.options })
        })
      } }),
    ],
  })
  host = withBuddyToolPermissionReplies(withBuddyCommandDisplay(created))
  await host.location.get({ location: { directory } })
  const ready = await newSession()
  await host.session.prompt({ sessionID: ready.id, text: "Ready the fixture." })
  await host.session.wait({ sessionID: ready.id })
})

afterAll(async () => {
  await host?.close()
  clearAllTeachingSessionState()
  await root?.[Symbol.asyncDispose]()
})

async function newSession(options: { baseConciseResponses: boolean } = { baseConciseResponses: false }) {
  const session = await host.session.create({
    location: { directory }, agent: "buddy", model: { providerID: "scripted", id: "chat" },
    permissions: [{ action: "buddy_probe", resource: "*", effect: "ask" }],
  })
  writeTeachingSessionState(directory, {
    sessionId: session.id, persona: "buddy", currentSurface: "curriculum", teachingWorkspaceState: "inactive",
    baseConciseResponses: options.baseConciseResponses, conciseResponses: false, focusGoalIds: [],
  })
  return session
}

async function nextEvent(iterator: AsyncIterator<OpenCodeEvent>, matches: (event: OpenCodeEvent) => boolean) {
  while (true) {
    const item = await iterator.next()
    if (item.done) throw new Error("Event stream closed")
    if (item.value.type === "session.execution.failed") throw new Error(item.value.data.error.message)
    if (matches(item.value)) return item.value
  }
}

describe("Buddy plugin on the v2 host", () => {
  test("uses sandbox paths, registers ordinary tools and hides built-in skills", async () => {
    const info = await host.server.info()
    for (const [name, value] of Object.entries(info.paths)) {
      if (name === "home") continue
      expect(path.relative(await fs.realpath(root.path), await fs.realpath(value)).startsWith("..")).toBe(false)
    }
    expect(info.paths.tmp).toBe(await fs.realpath(path.join(root.path, "tmp", "buddy", "opencode")))
    expect(await fs.stat(path.join(root.path, "data", "buddy", "opencode", "opencode.db")).then((stat) => stat.isFile())).toBe(true)
    const tools = await contexts.get(directory)?.tool.list()
    expect(tools?.find((tool) => tool.name === "buddy_probe")?.options?.codemode).toBe(false)
    const skills = await host.skill.list({ location: { directory } })
    expect(skills.data.some((skill) => skill.id === "opencode" || skill.id === "report")).toBe(false)
    expect(getBuddyToolPresentationDescriptor(directory, "buddy_probe")).toEqual({ archetype: "silent" })
  })

  test.each([
    { decision: "once", message: undefined },
    { decision: "reject", message: undefined },
    { decision: "reject", message: "Use the local notes instead." },
  ] satisfies { decision: PermissionReply; message: string | undefined }[])("settles a real tool ask with $decision and $message", async ({ decision, message }) => {
    const session = await newSession()
    const controller = new AbortController()
    const events = host.event.subscribe({ signal: controller.signal })[Symbol.asyncIterator]()
    try {
      await nextEvent(events, (event) => event.type === "server.connected")
      await host.session.prompt({ sessionID: session.id, text: "run-probe" })
      const progress = await nextEvent(events, (event) => event.type === "session.tool.progress" && event.data.sessionID === session.id)
      if (progress.type !== "session.tool.progress") throw new Error("Expected tool progress")
      expect(progress.data.metadata).toEqual({ phase: "permission", buddy: { title: "Waiting" } })
      const asked = await nextEvent(events, (event) => event.type === "permission.asked" && event.data.sessionID === session.id)
      if (asked.type !== "permission.asked") throw new Error("Expected permission request")
      expect(asked.data).toMatchObject({ action: "buddy_probe", resources: ["fixture:weather"], save: ["fixture:*"], metadata: { operation: "fixture lookup" }, source: { type: "tool", id: "call-buddy-probe" } })
      expect(asked.data.source?.messageID.startsWith("msg_")).toBe(true)
      const pending = await host.permission.list({ sessionID: session.id })
      expect(pending.map((request) => request.id)).toContain(asked.data.id)
      await host.permission.reply({ sessionID: session.id, requestID: asked.data.id, decision, message })
      await host.session.wait({ sessionID: session.id })
      const page = await host.message.list({ sessionID: session.id, order: "asc" })
      const tools = page.data.flatMap((entry) => entry.type === "assistant" ? entry.content.filter((part) => part.type === "tool") : [])
      expect(tools).toHaveLength(1)
      const tool = tools[0]
      if (!tool) throw new Error("Missing tool")
      expect(tool.state.status).toBe(decision === "once" ? "completed" : "error")
      if (message && tool.state.status === "error") {
        expect(tool.state.error.message).toBe(message)
        expect(JSON.stringify(requests.map((request) => request.prompt))).toContain(message)
      }
      if (decision === "once" && tool.state.status === "completed") {
        expect(tool.state.content).toEqual([
          { type: "text", text: "Weather fixture." },
          { type: "file", mime: "text/plain", uri: "data:text/plain;base64,Zml4dHVyZQ==", name: "fixture.txt" },
        ])
        expect(tool.state.metadata).not.toHaveProperty("discarded")
        expect(tool.state.metadata?.historyCount).toBeGreaterThan(0)
        expect(tool.state.metadata?.buddy).toEqual({ title: "Probe result" })
        expect(JSON.stringify(requests.map((request) => request.prompt))).not.toContain("MODEL_MUST_NOT_SEE")
      }
      expect(await host.permission.list({ sessionID: session.id })).toEqual([])
      const captured = await readCapturedSessionSystemPrompt({ directory, sessionID: session.id })
      expect(captured).toContain("Keep agents instructions.")
      expect(captured).not.toContain("Discard claude")
      expect(captured).not.toContain("Discard context")
      expect(captured).not.toContain("Keep answers concise")
      expect(contextOptions.get(session.id)?.textVerbosity).toBe("medium")
    } finally {
      controller.abort()
      await events.return?.()
    }
  })

  test("preserves expanded command text and records compact transcript display", async () => {
    const session = await newSession()
    await host.session.command({ sessionID: session.id, name: "explain", text: "  topic  " })
    await host.session.wait({ sessionID: session.id })
    expect(observations.get(session.id)).toEqual({ text: "Full command template:   topic", metadata: JSON.stringify({ buddy: { command: { name: "explain", arguments: "topic", display: "/explain topic" } } }) })
    const page = await host.message.list({ sessionID: session.id })
    const message = page.data.find((entry) => entry.type === "user")
    expect(message?.metadata?.buddy).toEqual({ command: { name: "explain", arguments: "topic", display: "/explain topic" } })
  })

  test("preserves a chat's original concise system prompt when its applied preference changes", async () => {
    const session = await newSession({ baseConciseResponses: true })
    await host.session.prompt({ sessionID: session.id, text: "Answer with detail." })
    await host.session.wait({ sessionID: session.id })
    expect(await readCapturedSessionSystemPrompt({ directory, sessionID: session.id })).toContain("Keep answers concise")
    expect(contextOptions.get(session.id)?.textVerbosity).toBe("medium")
  })

  test("keeps concurrent ordinary prompts separate from command display metadata", async () => {
    const session = await newSession()
    await Promise.all([
      host.session.command({ sessionID: session.id, name: "explain", text: "first" }),
      host.session.prompt({ sessionID: session.id, text: "Ordinary prompt." }),
    ])
    await host.session.wait({ sessionID: session.id })
    const page = await host.message.list({ sessionID: session.id })
    const ordinary = page.data.find((entry) => entry.type === "user" && entry.text === "Ordinary prompt.")
    const command = page.data.find((entry) => entry.type === "user" && entry.text === "Full command template: first")
    expect(ordinary?.metadata?.buddy).toBeUndefined()
    expect(command?.metadata?.buddy).toEqual({ command: { name: "explain", arguments: "first", display: "/explain first" } })
  })

  test("clears a tool's pending permission when the turn is interrupted", async () => {
    const session = await newSession()
    const controller = new AbortController()
    const events = host.event.subscribe({ signal: controller.signal })[Symbol.asyncIterator]()
    try {
      await nextEvent(events, (event) => event.type === "server.connected")
      await host.session.prompt({ sessionID: session.id, text: "run-probe" })
      const asked = await nextEvent(events, (event) => event.type === "permission.asked" && event.data.sessionID === session.id)
      if (asked.type !== "permission.asked") throw new Error("Expected permission request")
      await host.session.interrupt({ sessionID: session.id })
      await nextEvent(events, (event) => event.type === "permission.replied" && event.data.requestID === asked.data.id)
      await host.session.wait({ sessionID: session.id })
      expect(await host.permission.list({ sessionID: session.id })).toEqual([])
    } finally {
      controller.abort()
      await events.return?.()
    }
  })

  test("carries rejection feedback to sibling Buddy asks in the same session", async () => {
    const session = await newSession()
    const controller = new AbortController()
    const events = host.event.subscribe({ signal: controller.signal })[Symbol.asyncIterator]()
    const tasks: Promise<void | ToolError>[] = []
    try {
      await nextEvent(events, (event) => event.type === "server.connected")
      for (const callID of ["first", "second"]) {
        tasks.push(askBuddyToolPermission(host, {
          sessionID: session.id, agent: "buddy", messageID: "msg_probe", callID,
          request: { permission: "buddy_probe", patterns: [callID], always: [], metadata: {} },
          signal: controller.signal,
        }).catch((cause) => {
          if (cause instanceof ToolError) return cause
          throw cause
        }))
      }
      const first = await nextEvent(events, (event) => event.type === "permission.asked" && event.data.sessionID === session.id)
      await nextEvent(events, (event) => event.type === "permission.asked" && event.data.sessionID === session.id)
      if (first.type !== "permission.asked") throw new Error("Expected permission request")
      await host.permission.reply({ sessionID: session.id, requestID: first.data.id, decision: "reject", message: "Use cached results." })
      const results = await Promise.all(tasks)
      expect(results.map((result) => result?.message)).toEqual(["Use cached results.", "Use cached results."])
      expect(await host.permission.list({ sessionID: session.id })).toEqual([])
    } finally {
      controller.abort()
      await events.return?.()
      await Promise.allSettled(tasks)
    }
  })

  test.each(["allow", "deny"] satisfies ("allow" | "deny")[])("evaluates $label rules before creating a pending ask", async (effect) => {
    const session = await newSession()
    await host.session.update({ sessionID: session.id, permissions: [{ action: "buddy_probe", resource: "*", effect }] })
    const result = askBuddyToolPermission(host, {
      sessionID: session.id, agent: "buddy", messageID: "msg_probe", callID: "policy",
      request: { permission: "buddy_probe", patterns: ["fixture:weather"], always: [], metadata: {} },
      signal: new AbortController().signal,
    })
    if (effect === "allow") await result
    else await expect(result).rejects.toMatchObject({ _tag: "Tool.Error", message: "Permission denied: buddy_probe" })
    expect(await host.permission.list({ sessionID: session.id })).toEqual([])
  })

  test("removes Bench captures after a successful execution event", async () => {
    const session = await newSession()
    const file = await writeTemporaryBenchCapture({
      sessionID: session.id, messageID: "msg_capture",
      pngBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    })
    const controller = new AbortController()
    const watch = fs.watch(path.dirname(path.dirname(file)), { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) })
    const removed = (async () => {
      for await (const event of watch) {
        if (event.eventType === "rename" && !(await fs.stat(file).then(() => true, () => false))) return
      }
      throw new Error("Capture watcher ended before cleanup")
    })()
    try {
      await host.session.prompt({ sessionID: session.id, text: "Complete this turn." })
      await host.session.wait({ sessionID: session.id })
      await removed
      await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      controller.abort()
      await removed.catch(() => undefined)
      await cleanupBenchCapturesForSession(session.id)
    }
  })
})
