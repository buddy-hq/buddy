import { afterEach, describe, expect, test } from "bun:test"
import type { ToolContext, ToolResult } from "@opencode-ai/plugin"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import z from "zod"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { createBuddyTool, type BuddyTool } from "../../src/learning/runtime/create-buddy-tool"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import {
  allBuddyPluginTools,
  buddyToolToPluginTool,
  registerBuddyToolUiCatalog,
} from "../../src/opencode-runtime/buddy-tool-shim"
import { createCompatiblePluginAskHandler } from "../../src/opencode-runtime/plugin-ask-compat"
import { getDynamicToolSearchTools } from "../../src/learning/runtime/dynamic-tool-discovery"
import { allBuddyTools } from "../../src/learning/runtime/feature-registry"
import { tmpdir } from "../helpers/tmpdir"

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

function expectToolObject(result: ToolResult) {
  expect(typeof result).toBe("object")
  if (typeof result === "string") {
    throw new Error("Expected tool result object")
  }
  return result
}

function createUserMessageHistory(sessionID: string): MessageV2.WithParts[] {
  return [
    {
      info: {
        id: MessageID.make("msg_user"),
        sessionID: SessionID.make(sessionID),
        role: "user",
        time: { created: Date.now() },
        agent: "buddy",
        model: {
          providerID: ProviderID.opencode,
          modelID: ModelID.make("claude-sonnet"),
        },
      },
      parts: [],
    },
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function createPluginExecuteContext(input: {
  directory: string
  messages?: MessageV2.WithParts[]
  extra?: Record<string, unknown>
}): ToolContext & {
  messages: MessageV2.WithParts[]
  extra?: Record<string, unknown>
} {
  return {
    sessionID: "ses_test",
    messageID: "msg_test",
    agent: "buddy",
    directory: input.directory,
    worktree: input.directory,
    abort: new AbortController().signal,
    metadata() {},
    ask: createCompatiblePluginAskHandler(),
    messages: input.messages ?? [],
    ...(input.extra ? { extra: input.extra } : {}),
  }
}

describe("buddyToolToPluginTool shim", () => {
  test("allBuddyPluginTools exports every Buddy tool without feature or config filtering", async () => {
    await using project = await tmpdir({ git: true })

    const toolMap = await allBuddyPluginTools(project.path)

    expect(toolMap.search_standards).toBeDefined()
    expect(toolMap.get_standard).toBeDefined()
    expect(toolMap.learning_tool_search).toBeDefined()
    expect(toolMap.learning_tool_load).toBeDefined()
    expect(toolMap.save_flashcard_deck).toBeDefined()
  })

  test("registerBuddyToolUiCatalog restores session tool UI metadata lookup", async () => {
    await using project = await tmpdir({ git: true })

    await registerBuddyToolUiCatalog(project.path)

    const memorySearch = allBuddyTools().find((tool) => tool.id === "learner_memory_search")
    expect(memorySearch?.ui?.presentation).toBe("hidden-summary")

    expect(ToolRegistry.getToolUiMetadata("learner_memory_search", project.path)).toEqual(
      memorySearch?.ui,
    )

    const dynamicSearch = getDynamicToolSearchTools().find(
      (tool) => tool.id === "learning_tool_search",
    )
    expect(ToolRegistry.getToolUiMetadata("learning_tool_search", project.path)?.presentation).toBe(
      "hidden-summary",
    )
    expect(ToolRegistry.getToolUiMetadata("learning_tool_search", project.path)?.labels?.idle).toBe(
      dynamicSearch?.ui?.labels?.idle,
    )
  })

  test("extracts Zod object shape from Buddy tool parameters", () => {
    const tool = createBuddyTool({
      id: "test_tool",
      description: "A test tool",
      parameters: z.object({
        input: z.string(),
        count: z.number(),
      }),
      async execute(args, _ctx) {
        return {
          title: "test_tool",
          output: `${args.input}:${args.count}`,
          metadata: {},
        }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, "/tmp/test")

    expect(pluginTool.description).toBe("A test tool")
    expect(pluginTool.args).toHaveProperty("input")
    expect(pluginTool.args).toHaveProperty("count")
    expect(typeof pluginTool.execute).toBe("function")
  })

  test("converts non-object Zod schemas to { input: schema } shape", () => {
    const parameters = z.string()
    const tool: BuddyTool = {
      id: "string_tool",
      description: "Takes a string",
      parameters,
      async run(rawArgs) {
        const parsed = parameters.safeParse(rawArgs)
        if (!parsed.success) {
          throw new Error("invalid args")
        }
        return {
          title: "string_tool",
          output: parsed.data,
          metadata: {},
        }
      },
      toTool() {
        throw new Error("unused in this test")
      },
    }

    const pluginTool = buddyToolToPluginTool(tool, "/tmp/test")
    expect(pluginTool.args).toHaveProperty("input")
  })

  test("executes a Buddy tool through the plugin interface", async () => {
    await using project = await tmpdir({ git: true })

    const tool = createBuddyTool({
      id: "exec_test",
      description: "Execution test",
      parameters: z.object({ name: z.string() }),
      async execute(args, _ctx) {
        return {
          title: "exec_test",
          output: `hello ${args.name}`,
          metadata: {},
        }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, project.path)
    const result = expectToolObject(
      await pluginTool.execute(
        { name: "world" },
        {
          sessionID: "ses_test",
          messageID: "msg_test",
          agent: "buddy",
          directory: project.path,
          worktree: project.path,
          abort: new AbortController().signal,
          metadata() {},
          ask: createCompatiblePluginAskHandler(),
        },
      ),
    )

    expect(result.output).toBe("hello world")
    expect(typeof result.title).toBe("string")
  })

  test("forwards ctx.ask through the plugin shim without InstanceRef errors", async () => {
    await using project = await tmpdir({ git: true })
    await loadOpenCodeApp()

    const asks: Array<Record<string, unknown>> = []
    const tool = createBuddyTool({
      id: "ask_test",
      description: "Ask test",
      parameters: z.object({}),
      async execute(_args, ctx) {
        await ctx.ask({
          permission: "ask_test",
          patterns: ["*"],
          always: ["*"],
          metadata: { phase: "before" },
        })
        return { title: "ask_test", output: "ok", metadata: {} }
      },
    })

    await OpenCodeInstance.provide({
      directory: project.path,
      fn: async () => {
        const pluginTool = buddyToolToPluginTool(tool, project.path)
        const result = expectToolObject(
          await pluginTool.execute(
            {},
            {
              sessionID: "ses_test",
              messageID: "msg_test",
              agent: "buddy",
              directory: project.path,
              worktree: project.path,
              abort: new AbortController().signal,
              metadata() {},
              ask: createCompatiblePluginAskHandler((input) => {
                asks.push(input)
              }),
            },
          ),
        )

        expect(result.output).toBe("ok")
        expect(asks).toHaveLength(1)
      },
    })
  })

  test("metadata updates are forwarded through the shim", async () => {
    await using project = await tmpdir({ git: true })
    const updates: Array<{ title?: string; metadata?: Record<string, unknown> }> = []

    const tool = createBuddyTool({
      id: "meta_test",
      description: "Metadata test",
      parameters: z.object({}),
      async execute(_args, ctx) {
        await ctx.metadata({ title: "working", metadata: { phase: 1 } })
        return { title: "done", output: "ok", metadata: { phase: 2 } }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, project.path)
    const result = expectToolObject(
      await pluginTool.execute(
        {},
        {
          sessionID: "ses_test",
          messageID: "msg_test",
          agent: "buddy",
          directory: project.path,
          worktree: project.path,
          abort: new AbortController().signal,
          metadata(input) {
            updates.push(input)
          },
          ask: createCompatiblePluginAskHandler(),
        },
      ),
    )

    expect(updates).toEqual([{ title: "working", metadata: { phase: 1 } }])
    expect(result.metadata).toMatchObject({ phase: 2 })
  })

  test("preserves tool result attachments through the plugin shim", async () => {
    await using project = await tmpdir({ git: true })

    const tool = createBuddyTool({
      id: "attachment_test",
      description: "Attachment passthrough test",
      parameters: z.object({}),
      async execute() {
        return {
          title: "attachment_test",
          output: "attached",
          metadata: { kind: "image" },
          attachments: [
            {
              type: "file",
              mime: "image/png",
              filename: "plot.png",
              url: "data:image/png;base64,AAAA",
            },
          ],
        }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, project.path)
    const result = expectToolObject(
      await pluginTool.execute(
        {},
        {
          sessionID: "ses_test",
          messageID: "msg_test",
          agent: "buddy",
          directory: project.path,
          worktree: project.path,
          abort: new AbortController().signal,
          metadata() {},
          ask: createCompatiblePluginAskHandler(),
        },
      ),
    )

    expect(result.attachments).toEqual([
      {
        type: "file",
        mime: "image/png",
        filename: "plot.png",
        url: "data:image/png;base64,AAAA",
      },
    ])
  })

  test("forwards session messages and extra from the runtime plugin context", async () => {
    await using project = await tmpdir({ git: true })

    const messages = createUserMessageHistory("ses_forward")
    const tool = createBuddyTool({
      id: "messages_forward_test",
      description: "Verifies plugin shim forwards session history",
      parameters: z.object({}),
      async execute(_args, ctx) {
        if (ctx.messages.length === 0) {
          throw new Error("Could not resolve the active model for full-text ingestion.")
        }
        return {
          title: "messages_forward_test",
          output: `messages=${ctx.messages.length}`,
          metadata: {
            hasExtraModel: isRecord(ctx.extra) && isRecord(ctx.extra.model),
          },
        }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, project.path)
    const result = expectToolObject(
      await pluginTool.execute(
        {},
        createPluginExecuteContext({
          directory: project.path,
          messages,
          extra: {
            model: {
              providerID: ProviderID.opencode,
              id: "claude-sonnet",
              limit: { context: 200_000, input: 200_000, output: 8_192 },
            },
          },
        }),
      ),
    )

    expect(result.output).toBe("messages=1")
    expect(result.metadata).toMatchObject({ hasExtraModel: true })
  })
})
