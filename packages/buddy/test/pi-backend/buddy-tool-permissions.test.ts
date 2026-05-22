import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import z from "zod"
import { SessionManager } from "@earendil-works/pi-coding-agent"
import type { ExtensionContext } from "@earendil-works/pi-coding-agent"
import { createBuddyTool } from "../../src/learning/runtime/create-buddy-tool"
import { piRuntime } from "../../src/pi-backend/runtime"
import { piSessionDirectory } from "../../src/pi-backend/paths"
import {
  createBuddyPiUiContext,
  listPendingPermissionRequests,
  replyPendingPermissionRequest,
} from "../../src/pi-backend/ui-requests"
import { tmpdir } from "../helpers/tmpdir"

const PERMISSION_POLL_DELAY_MS = 10
const PERMISSION_POLL_ATTEMPTS = 100

function createExtensionContext(directory: string): ExtensionContext {
  const sessionManager = SessionManager.create(directory, piSessionDirectory(directory))
  return {
    ui: createBuddyPiUiContext({
      directory,
      sessionID: "ses_test_buddy_tool",
    }),
    hasUI: true,
    cwd: directory,
    sessionManager,
    modelRegistry: piRuntime.getModelRegistry(),
    model: undefined,
    isIdle() {
      return true
    },
    signal: undefined,
    abort() {},
    hasPendingMessages() {
      return false
    },
    shutdown() {},
    getContextUsage() {
      return undefined
    },
    compact() {},
    getSystemPrompt() {
      return ""
    },
  }
}

async function waitForPermissionRequest(directory: string) {
  for (let attempt = 0; attempt < PERMISSION_POLL_ATTEMPTS; attempt += 1) {
    const requests = listPendingPermissionRequests(directory)
    if (requests.length > 0) {
      return requests[0]!
    }
    await Bun.sleep(PERMISSION_POLL_DELAY_MS)
  }

  throw new Error("Timed out waiting for Buddy tool permission request.")
}

afterEach(() => {
  piRuntime.disposeAll()
})

describe("Buddy tool permission bridge", () => {
  test("prompts for Buddy-native tool permissions instead of bypassing ctx.ask", async () => {
    await using project = await tmpdir({
      git: true,
      config: {
        permission: {
          custom_permission: "ask",
        },
      },
    })

    const tool = createBuddyTool({
      id: "custom_prompt_tool",
      description: "Test Buddy permission prompts.",
      parameters: z.object({}),
      async execute(_args, ctx) {
        await ctx.ask({
          permission: "custom_permission",
          patterns: ["*"],
          always: ["*"],
          metadata: {
            kind: "custom-test",
          },
        })

        return {
          output: "prompt accepted",
        }
      },
    }).toPiTool(project.path)

    const execution = tool.execute(
      "call_custom_prompt",
      {},
      undefined,
      undefined,
      createExtensionContext(project.path),
    )

    const request = await waitForPermissionRequest(project.path)
    expect(request.permission).toBe("custom_permission")
    expect(replyPendingPermissionRequest(project.path, request.id, "once")).toBe(true)

    const result = await execution
    expect(result.content[0]).toEqual({
      type: "text",
      text: "prompt accepted",
    })
  })

  test("rejects Buddy-native tool execution when permission rules deny it", async () => {
    await using project = await tmpdir({
      git: true,
      config: {
        permission: {
          custom_permission: "deny",
        },
      },
    })

    const tool = createBuddyTool({
      id: "custom_deny_tool",
      description: "Test Buddy permission denial.",
      parameters: z.object({}),
      async execute(_args, ctx) {
        await ctx.ask({
          permission: "custom_permission",
          patterns: ["*"],
          always: ["*"],
          metadata: {},
        })

        return {
          output: "should not succeed",
        }
      },
    }).toPiTool(project.path)

    const execution = tool.execute(
      "call_custom_deny",
      {},
      undefined,
      undefined,
      createExtensionContext(project.path),
    )

    await expect(execution).rejects.toBeDefined()
    expect(listPendingPermissionRequests(project.path)).toHaveLength(0)
  })

  test("reuses always approvals across normalized directory spellings", async () => {
    await using project = await tmpdir({
      git: true,
      config: {
        permission: {
          custom_permission: "ask",
        },
      },
    })

    const tool = createBuddyTool({
      id: "custom_always_tool",
      description: "Test Buddy always approvals across directory variants.",
      parameters: z.object({}),
      async execute(_args, ctx) {
        await ctx.ask({
          permission: "custom_permission",
          patterns: ["*"],
          always: ["*"],
          metadata: {},
        })

        return {
          output: "approved",
        }
      },
    }).toPiTool(path.join(project.path, "."))

    const firstExecution = tool.execute(
      "call_custom_always_first",
      {},
      undefined,
      undefined,
      createExtensionContext(path.join(project.path, ".")),
    )

    const firstRequest = await waitForPermissionRequest(project.path)
    expect(firstRequest.permission).toBe("custom_permission")
    expect(replyPendingPermissionRequest(project.path, firstRequest.id, "always")).toBe(true)
    await firstExecution

    const secondTool = createBuddyTool({
      id: "custom_always_tool_repeat",
      description: "Test Buddy always approvals across directory variants.",
      parameters: z.object({}),
      async execute(_args, ctx) {
        await ctx.ask({
          permission: "custom_permission",
          patterns: ["*"],
          always: ["*"],
          metadata: {},
        })

        return {
          output: "approved again",
        }
      },
    }).toPiTool(project.path)

    const secondExecution = secondTool.execute(
      "call_custom_always_second",
      {},
      undefined,
      undefined,
      createExtensionContext(project.path),
    )

    await expect(secondExecution).resolves.toBeDefined()
    expect(listPendingPermissionRequests(project.path)).toHaveLength(0)
  })

  test("preserves runtime tool titles in updates and final results", async () => {
    await using project = await tmpdir({ git: true })

    const updates: unknown[] = []
    const tool = createBuddyTool({
      id: "custom_title_tool",
      description: "Test Buddy tool title propagation.",
      parameters: z.object({}),
      async execute(_args, ctx) {
        await ctx.metadata({
          title: "running title",
          metadata: {
            phase: "running",
          },
        })

        return {
          title: "final title",
          output: "done",
          metadata: {
            phase: "done",
          },
        }
      },
    }).toPiTool(project.path)

    const result = await tool.execute(
      "call_custom_title",
      {},
      undefined,
      (update) => {
        updates.push(update)
      },
      createExtensionContext(project.path),
    )

    expect(updates).toEqual([
      {
        content: [],
        details: {
          phase: "running",
          title: "running title",
        },
      },
    ])
    expect(result.details).toEqual({
      phase: "done",
      title: "final title",
    })
  })

  test("Pi Buddy tools accept stringified JSON arguments", async () => {
    await using project = await tmpdir({ git: true })

    const tool = createBuddyTool({
      id: "custom_stringified_args_tool",
      description: "Accepts JSON-stringified object args.",
      parameters: z.object({
        spec: z.object({
          label: z.string(),
          count: z.number(),
        }),
      }),
      async execute(args) {
        return {
          output: `${args.spec.label}:${args.spec.count}`,
        }
      },
    }).toPiTool(project.path)

    const result = await tool.execute(
      "call_custom_stringified_args",
      JSON.stringify({
        spec: {
          label: "triangle",
          count: 3,
        },
      }),
      undefined,
      undefined,
      createExtensionContext(project.path),
    )

    expect(result.content[0]).toEqual({
      type: "text",
      text: "triangle:3",
    })
  })
})
