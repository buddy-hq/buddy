import "./test-timeout"
import { runtimeHost } from "../helpers/opencode"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Plugin, type AISDKHooks } from "@buddy/opencode-adapter/plugin"
import { app } from "../../src/app"
import { Config } from "../../src/config/config"
import { getAgentRuntime, closeAgentRuntime } from "../../src/runtime/agent-runtime"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { temporaryEnvironment } from "../helpers/temporary-environment"
import { writeProjectConfig } from "../helpers/project-config"

type LanguageModel = NonNullable<AISDKHooks["language"]["language"]>
type StreamPart =
  Awaited<ReturnType<LanguageModel["doStream"]>>["stream"] extends ReadableStream<infer Part>
    ? Part
    : never
type RecordedRequest = { system: string; prompt: string; tools: readonly string[] }
const jsonObject = z.record(z.string(), z.json())
type NotebookConfig = z.infer<typeof jsonObject>
type RequestOptions = { method?: string; body?: z.infer<ReturnType<typeof z.json>> }

export async function createConfigConformanceHarness() {
  const sandbox = process.env.BUDDY_TEST_XDG_ROOT
  if (!sandbox || !process.env.BUDDY_TEST_HOME)
    throw new Error("Run with the Buddy test preload and sandbox wrapper")
  const previous = await Config.getGlobal()
  const root = await temporaryDirectory({ parentDirectory: sandbox, prefix: "conformance-config-" })
  const environment = temporaryEnvironment({ BUDDY_ALLOWED_DIRECTORY_ROOTS: root.path })
  const requests: RecordedRequest[] = []
  try {
    await Config.replaceGlobal(
      Config.Info.parse({
        ...previous,
        compaction: { auto: false },
        learner_memory: { enabled: false },
      }),
    )
    const host = runtimeHost(await getAgentRuntime())
    await host.plugin(
      Plugin.define({
        id: "buddy.conformance.config-model",
        async setup(ctx) {
          await ctx.aisdk.hook(
            "language",
            (event) => {
              event.language = {
                specificationVersion: "v3",
                provider: "buddy-conformance",
                modelId: "chat",
                supportedUrls: {},
                async doGenerate() {
                  throw new Error("Unexpected non-streaming request")
                },
                async doStream(options) {
                  requests.push({
                    system: options.prompt
                      .flatMap((message) => (message.role === "system" ? [message.content] : []))
                      .join("\n"),
                    prompt: options.prompt
                      .map((message) =>
                        message.role === "system"
                          ? message.content
                          : JSON.stringify(message.content),
                      )
                      .join("\n"),
                    tools:
                      options.tools?.flatMap((tool) =>
                        tool.type === "function" ? [tool.name] : [],
                      ) ?? [],
                  })
                  const parts: StreamPart[] = [
                    { type: "text-start", id: "answer" },
                    { type: "text-delta", id: "answer", delta: "Conformance answer." },
                    { type: "text-end", id: "answer" },
                    {
                      type: "finish",
                      finishReason: { unified: "stop", raw: "stop" },
                      usage: {
                        inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
                        outputTokens: { total: 1, text: 1, reasoning: 0 },
                      },
                    },
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
          await ctx.session.hook("compaction", (event) => {
            event.result = { summary: "Conformance compacted history." }
          })
          await ctx.integration.transform((editor) =>
            editor.method.update({
              integrationID: "openai",
              method: {
                id: "conformance-code",
                type: "oauth",
                label: "Offline conformance authorization",
              },
              authorize: async () => ({
                mode: "code",
                url: "https://login.invalid/authorize",
                instructions: "Enter a fixture code",
                callback: async () => {
                  throw new Error("External token exchange is outside this fixture")
                },
              }),
            }),
          )
        },
      }),
    )

    async function notebook(name: string, config: NotebookConfig = {}) {
      await fs.mkdir(path.join(root.path, name), { recursive: true })
      const directory = await fs.realpath(path.join(root.path, name))
      writeProjectConfig(
        directory,
        JSON.stringify(
          Config.ProjectInfo.parse({
            model: "scripted/chat",
            small_model: "scripted/chat",
            provider: {
              scripted: {
                npm: "@ai-sdk/perplexity",
                options: { apiKey: "fixture-key", baseURL: "https://model.invalid/v1" },
                models: {
                  chat: {
                    name: "Conformance Chat",
                    tool_call: true,
                    modalities: { input: ["text", "image"], output: ["text"] },
                    limit: { context: 100_000, input: 90_000, output: 1_000 },
                    variants: { thoughtful: { reasoningEffort: "high" } },
                  },
                },
              },
            },
            ...config,
          }),
        ),
      )
      async function request(route: string, options: RequestOptions = {}) {
        return app.request(`/api${route}`, {
          method: options.method ?? (options.body === undefined ? "GET" : "POST"),
          headers: { "x-buddy-directory": directory, "content-type": "application/json" },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        })
      }
      return {
        directory,
        request,
        async json<T extends z.ZodType>(
          route: string,
          schema: T,
          options: RequestOptions = {},
        ): Promise<z.output<T>> {
          const response = await request(route, options)
          if (response.status !== 200)
            throw new Error(
              `${options.method ?? "HTTP"} ${route}: ${response.status} ${await response.text()}`,
            )
          return schema.parse(await response.json())
        },
      }
    }

    return {
      notebook,
      async patchGlobalConfig(config: NotebookConfig) {
        const controller = new AbortController()
        const updates = host.event
          .subscribe({ signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4_000)]) })
          [Symbol.asyncIterator]()
        try {
          const ready = await updates.next()
          if (ready.done || ready.value.type !== "server.connected")
            throw new Error("Could not observe configuration reload")
          const response = await app.request("/api/global/config", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(config),
          })
          if (response.status !== 200)
            throw new Error(`Global configuration: ${response.status} ${await response.text()}`)
          for (;;) {
            const update = await updates.next()
            if (update.done) throw new Error("Configuration reload observation ended")
            if (update.value.type === "config.updated")
              return jsonObject.parse(await response.json())
          }
        } finally {
          controller.abort()
          await updates.return?.()
        }
      },
      latestRequest(marker: string) {
        const request = requests.findLast((entry) => entry.prompt.includes(marker))
        if (!request) throw new Error(`The model did not receive ${marker}`)
        return request
      },
      async addCatalogFixtures(directory: string) {
        const skillRoot = path.join(directory, "fixture-skills")
        const skillFile = path.join(skillRoot, "conformance-review", "SKILL.md")
        await fs.mkdir(path.dirname(skillFile), { recursive: true })
        await fs.copyFile(path.join(import.meta.dir, "fixtures/config/SKILL.md"), skillFile)
        await fs.writeFile(
          path.join(directory, "opencode.json"),
          JSON.stringify({
            command: {
              "conformance-review": {
                template: "Review the conformance fixture $ARGUMENTS",
                description: "Review a fixture",
              },
            },
          }),
        )
        return skillRoot
      },
      async addReferenceFixture(directory: string) {
        const referencePath = path.join(directory, "shared-docs")
        await fs.mkdir(referencePath)
        await fs.writeFile(
          path.join(referencePath, "conformance-guide.md"),
          "Reference fixture for Buddy conformance.\n",
        )
        await fs.writeFile(
          path.join(directory, "opencode.json"),
          JSON.stringify({
            references: {
              docs: { path: referencePath, description: "Shared conformance documentation" },
            },
          }),
        )
        return referencePath
      },
      localMcpCommand: [
        process.execPath,
        path.join(import.meta.dir, "fixtures/config/mcp-server.ts"),
      ],
      async [Symbol.asyncDispose]() {
        try {
          await closeAgentRuntime()
        } finally {
          try {
            await Config.replaceGlobal(previous)
          } finally {
            environment[Symbol.dispose]()
            await root[Symbol.asyncDispose]()
          }
        }
      },
    }
  } catch (error) {
    try {
      await closeAgentRuntime()
      await Config.replaceGlobal(previous)
    } finally {
      environment[Symbol.dispose]()
      await root[Symbol.asyncDispose]()
    }
    throw error
  }
}

export type ConfigConformanceHarness = Awaited<ReturnType<typeof createConfigConformanceHarness>>
