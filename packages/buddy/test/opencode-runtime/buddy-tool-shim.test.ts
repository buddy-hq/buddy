import { afterEach, describe, expect, test } from "bun:test"
import type { ToolContext, ToolResult } from "@opencode-ai/plugin"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { MessageV2 } from "@buddy/opencode-adapter/message"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import z from "zod"
import { createBuddyTool, type BuddyTool } from "../../src/learning/runtime/create-buddy-tool"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { defineToolPresentation } from "@buddy/opencode-adapter/tool-presentation"
import {
  buddyToolToPluginTool,
  registerBuddyToolPresentationCatalog,
} from "../../src/opencode-runtime/buddy-tool-shim"
import { createCompatiblePluginAskHandler } from "../../src/opencode-runtime/plugin-ask-compat"
import { getDynamicToolSearchTools } from "../../src/learning/runtime/dynamic-tool-discovery"
import { allBuddyTools } from "../../src/learning/runtime/feature-registry"
import { tmpdir } from "../helpers/tmpdir"
import {
  parseJsonObject,
  requireString,
  requireToolObjectResult,
  type TJsonObject,
} from "../helpers/parse"

const TEST_TOOL_PRESENTATION = defineToolPresentation({ archetype: "silent" })

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

function expectToolObject(result: ToolResult) {
  return requireToolObjectResult(result, "tool result object")
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

function createPluginExecuteContext(input: {
  directory: string
  messages?: MessageV2.WithParts[]
  extra?: TJsonObject
}): ToolContext & {
  messages: MessageV2.WithParts[]
  extra?: TJsonObject
} {
  return Object.assign(
    {
      sessionID: "ses_test",
      messageID: "msg_test",
      agent: "buddy",
      directory: input.directory,
      worktree: input.directory,
      abort: new AbortController().signal,
      metadata() {},
      ask: createCompatiblePluginAskHandler(),
      messages: input.messages ?? [],
    },
    input.extra ? { extra: input.extra } : undefined,
  )
}

describe("buddyToolToPluginTool shim", () => {
  test("registers every Buddy tool presentation in the session catalog", async () => {
    await using project = await tmpdir({ git: true })

    await registerBuddyToolPresentationCatalog(project.path)

    const memorySearch = allBuddyTools().find((tool) => tool.id === "learner_memory_search")
    expect(memorySearch?.presentation.archetype).toBe("activity")

    expect(
      ToolRegistry.getToolPresentationDescriptor("learner_memory_search", project.path),
    ).toEqual(memorySearch?.presentation)

    const dynamicSearch = getDynamicToolSearchTools().find(
      (tool) => tool.id === "learning_tool_search",
    )
    expect(
      ToolRegistry.getToolPresentationDescriptor("learning_tool_search", project.path),
    ).toEqual(dynamicSearch?.presentation)
  })

  test("extracts Zod object shape from Buddy tool parameters", () => {
    const tool = createBuddyTool({
      id: "test_tool",
      description: "A test tool",
      presentation: TEST_TOOL_PRESENTATION,
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
    expect(pluginTool.execute).toBeInstanceOf(Function)
  })

  test("converts non-object Zod schemas to { input: schema } shape", () => {
    const parameters = z.string()
    const tool: BuddyTool = {
      id: "string_tool",
      description: "Takes a string",
      presentation: TEST_TOOL_PRESENTATION,
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
      presentation: TEST_TOOL_PRESENTATION,
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
    expect(requireString(result.title, "title").length).toBeGreaterThan(0)
  })

  test("keeps optional tool args when a sibling field is undefined", async () => {
    await using project = await tmpdir({ git: true })

    const tool = createBuddyTool({
      id: "optional_exec_test",
      description: "Optional field execution test",
      presentation: TEST_TOOL_PRESENTATION,
      parameters: z.object({
        name: z.string(),
        count: z.number().optional(),
      }),
      async execute(args, _ctx) {
        return {
          title: "optional_exec_test",
          output: args.name,
          metadata: {},
        }
      },
    })

    const pluginTool = buddyToolToPluginTool(tool, project.path)
    const result = expectToolObject(
      await pluginTool.execute(
        { name: "keep", count: undefined },
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

    expect(result.output).toBe("keep")
  })

  test("metadata updates are forwarded through the shim", async () => {
    await using project = await tmpdir({ git: true })
    const updates: Array<{ title?: string; metadata?: TJsonObject }> = []

    const tool = createBuddyTool({
      id: "meta_test",
      description: "Metadata test",
      presentation: TEST_TOOL_PRESENTATION,
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
      presentation: TEST_TOOL_PRESENTATION,
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
      presentation: TEST_TOOL_PRESENTATION,
      parameters: z.object({}),
      async execute(_args, ctx) {
        if (ctx.messages.length === 0) {
          throw new Error("Could not resolve the active model for full-text ingestion.")
        }
        return {
          title: "messages_forward_test",
          output: `messages=${ctx.messages.length}`,
          metadata: {
            hasExtraModel:
              parseJsonObject(ctx.extra) !== undefined &&
              parseJsonObject(parseJsonObject(ctx.extra)?.model) !== undefined,
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
