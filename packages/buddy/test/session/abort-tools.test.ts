import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import z from "zod"
import { MessageID, SessionID } from "@buddy/opencode-adapter/id"
import { Tool } from "@buddy/opencode-adapter/tool"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { createBuddyTool } from "../../src/learning/tools/create-buddy-tool"
import { registerBuddyTools } from "../../src/learning/tools/register-buddy-tools"
import { tmpdir } from "../helpers/tmpdir"
import { requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

const slowAbortTool = createBuddyTool({
  id: "slow_abort_test",
  description: "Slow tool used to verify abort propagation.",
  parameters: z.object({
    value: z.string(),
  }),
  async execute(args) {
    await Bun.sleep(250)
    return {
      title: "slow",
      output: args.value,
      metadata: {},
    }
  },
})

const permissionBridgeTool = createBuddyTool({
  id: "permission_bridge_test",
  description: "Tool used to verify permission effects execute.",
  parameters: z.object({}),
  async execute(_args, ctx) {
    await ctx.ask({
      permission: "read",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })
    await ctx.metadata({
      title: "permission-bridge-test",
      metadata: {},
    })
    return {
      title: "permission-bridge",
      output: "ok",
      metadata: {},
    }
  },
})

function createEffectContext(input: {
  ask: Tool.Context["ask"]
  metadata: Tool.Context["metadata"]
}): Tool.Context {
  return {
    sessionID: SessionID.make("ses_test"),
    messageID: MessageID.make("msg_test"),
    agent: "math-buddy",
    abort: new AbortController().signal,
    messages: [],
    ask: input.ask,
    metadata: input.metadata,
  }
}

describe("buddy tool abort handling", () => {
  test("rejects promptly when the tool context aborts", async () => {
    await using project = await tmpdir({ git: true })

    const execution = OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await registerBuddyTools(project.path, [slowAbortTool])

        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const slowTool = requireTool(tools, "slow_abort_test")
        const abortController = new AbortController()
        setTimeout(() => abortController.abort(), 25)

        return slowTool.execute(
          { value: "late result" },
          {
            sessionID: SessionID.make("ses_abort"),
            messageID: MessageID.make("msg_abort"),
            agent: "math-buddy",
            abort: abortController.signal,
            messages: [],
            metadata() {
              return Effect.void
            },
            ask() {
              return Effect.void
            },
          },
        )
      },
    })

    await expect(execution).rejects.toMatchObject({
      name: "AbortError",
    })
  })

  test("runs permission and metadata effects through the Buddy tool bridge", async () => {
    await using project = await tmpdir({ git: true })

    let permissionCalls = 0
    let metadataCalls = 0

    const execution = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await registerBuddyTools(project.path, [permissionBridgeTool])

        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const tool = requireTool(tools, "permission_bridge_test")

        return tool.execute(
          {},
          createEffectContext({
            ask() {
              return Effect.sync(() => {
                permissionCalls += 1
              })
            },
            metadata() {
              return Effect.sync(() => {
                metadataCalls += 1
              })
            },
          }),
        )
      },
    })

    expect(execution.output).toBe("ok")
    expect(permissionCalls).toBe(1)
    expect(metadataCalls).toBe(1)
  })
})
