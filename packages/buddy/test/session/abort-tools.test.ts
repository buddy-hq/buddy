import { describe, expect, test } from "bun:test"
import z from "zod"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { defineToolPresentation } from "@buddy/opencode-adapter/tool-presentation"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { createCompatiblePluginAskHandler } from "../../src/opencode-runtime/plugin-ask-compat"
import { buddyToolToPluginTool } from "../../src/opencode-runtime/buddy-tool-shim"
import { createBuddyTool } from "../../src/learning/runtime/create-buddy-tool"
import { tmpdir } from "../helpers/tmpdir"
import { requireToolObjectResult } from "../helpers/parse"
import type { ToolContext } from "@opencode-ai/plugin"

type TPluginAskInput = Parameters<ReturnType<typeof createCompatiblePluginAskHandler>>[0]
type TPluginMetadataUpdate = Parameters<ToolContext["metadata"]>[0]

const TEST_TOOL_PRESENTATION = defineToolPresentation({ archetype: "silent" })

const slowAbortTool = createBuddyTool({
  id: "slow_abort_test",
  description: "Slow tool used to verify abort propagation.",
  presentation: TEST_TOOL_PRESENTATION,
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
  presentation: TEST_TOOL_PRESENTATION,
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

describe("buddy tool abort handling", () => {
  test("rejects promptly when the tool context aborts", async () => {
    await using project = await tmpdir({ git: true })

    const pluginTool = buddyToolToPluginTool(slowAbortTool, project.path)
    const abortController = new AbortController()
    setTimeout(() => abortController.abort(), 25)

    const execution = pluginTool.execute(
      { value: "late result" },
      {
        sessionID: "ses_abort",
        messageID: "msg_abort",
        agent: "buddy",
        directory: project.path,
        worktree: project.path,
        abort: abortController.signal,
        metadata() {},
        ask: createCompatiblePluginAskHandler(),
      },
    )

    await expect(execution).rejects.toMatchObject({
      name: "AbortError",
    })
  })

  test("runs permission and metadata through the plugin tool path", async () => {
    await using project = await tmpdir({ git: true })
    await loadOpenCodeApp()

    const asks: TPluginAskInput[] = []
    const metadataUpdates: TPluginMetadataUpdate[] = []

    const pluginTool = buddyToolToPluginTool(permissionBridgeTool, project.path)

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      fn: async () => {
        return requireToolObjectResult(
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
                metadataUpdates.push(input)
              },
              ask: createCompatiblePluginAskHandler((input) => {
                asks.push(input)
              }),
            },
          ),
        )
      },
    })

    expect(result.output).toBe("ok")
    expect(asks).toHaveLength(1)
    expect(metadataUpdates).toEqual([{ title: "permission-bridge-test", metadata: {} }])
  })
})
