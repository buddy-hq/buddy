import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { SessionManager } from "@earendil-works/pi-coding-agent"
import type { ExtensionContext } from "@earendil-works/pi-coding-agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { buildOpenCodePiToolSet } from "../../src/pi-backend/opencode-tool-bridge"

import { piRuntime } from "../../src/pi-backend/runtime"
import { piSessionDirectory } from "../../src/pi-backend/paths"
import {
  createBuddyPiUiContext,
  listPendingPermissionRequests,
  replyPendingPermissionRequest,
} from "../../src/pi-backend/ui-requests"
import { tmpdir } from "../helpers/tmpdir"

const WRITE_TOOL_NAME = "write"
const READ_TOOL_NAME = "read"
const PERMISSION_POLL_DELAY_MS = 10
const PERMISSION_POLL_ATTEMPTS = 100

function createExtensionContext(directory: string): ExtensionContext {
  const sessionManager = SessionManager.create(directory, piSessionDirectory(directory))
  return {
    ui: createBuddyPiUiContext({
      directory,
      sessionID: "ses_test_bridge",
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

  throw new Error("Timed out waiting for bridged permission request.")
}

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

describe("OpenCode tool bridge", () => {
  test("builds the OpenCode-backed default tool set for Pi", async () => {
    await using project = await tmpdir({ git: true })

    const toolSet = await buildOpenCodePiToolSet(project.path)
    const toolNames = new Set(toolSet.tools.map((tool) => tool.name))

    expect(toolNames.has("bash")).toBe(true)
    expect(toolNames.has("read")).toBe(true)
    expect(toolNames.has("write")).toBe(true)
    expect(toolNames.has("edit")).toBe(true)
    expect(toolNames.has("grep")).toBe(true)
    expect(toolNames.has("glob")).toBe(true)
    expect(toolNames.has("apply_patch")).toBe(true)
    expect(toolNames.has("skill")).toBe(true)
    expect(toolNames.has("todowrite")).toBe(true)
    expect(toolNames.has("question")).toBe(false)
    expect(toolSet.defaultToolNames).not.toContain("find")
    expect(toolSet.defaultToolNames).not.toContain("ls")
    expect(toolSet.defaultToolNames).toEqual(expect.arrayContaining([...toolNames]))
  })

  test("preserves default OpenCode allow behavior for in-worktree writes", async () => {
    await using project = await tmpdir({ git: true })
    const toolSet = await buildOpenCodePiToolSet(project.path)
    const writeTool = toolSet.tools.find((tool) => tool.name === WRITE_TOOL_NAME)
    if (!writeTool) {
      throw new Error("Missing bridged write tool.")
    }

    const relativeTarget = "note.txt"
    const target = path.join(project.path, relativeTarget)
    const context = createExtensionContext(project.path)
    const result = await writeTool.execute(
      "call_write_once",
      {
        filePath: relativeTarget,
        content: "hello from bridge\n",
      },
      undefined,
      undefined,
      context,
    )

    expect(listPendingPermissionRequests(project.path)).toHaveLength(0)
    expect(await fs.readFile(target, "utf8")).toBe("hello from bridge\n")
    expect(result.content[0]).toEqual({
      type: "text",
      text: expect.stringContaining("Wrote file successfully."),
    })
  })

  test("bridged writes still prompt when Buddy config explicitly asks for edit permission", async () => {
    await using project = await tmpdir({
      git: true,
      config: {
        permission: {
          edit: "ask",
        },
      },
    })
    const toolSet = await buildOpenCodePiToolSet(project.path)
    const writeTool = toolSet.tools.find((tool) => tool.name === WRITE_TOOL_NAME)
    if (!writeTool) {
      throw new Error("Missing bridged write tool.")
    }

    const context = createExtensionContext(project.path)
    const firstRelativeTarget = "first.txt"
    const firstExecution = writeTool.execute(
      "call_write_always_first",
      {
        filePath: firstRelativeTarget,
        content: "first bridge write\n",
      },
      undefined,
      undefined,
      context,
    )

    const firstRequest = await waitForPermissionRequest(project.path)
    expect(firstRequest.permission).toBe("edit")
    expect(replyPendingPermissionRequest(project.path, firstRequest.id, "always")).toBe(true)
    await firstExecution

    const secondRelativeTarget = "second.txt"
    const secondTarget = path.join(project.path, secondRelativeTarget)
    const secondExecution = writeTool.execute(
      "call_write_always_second",
      {
        filePath: secondRelativeTarget,
        content: "second bridge write\n",
      },
      undefined,
      undefined,
      context,
    )

    await expect(secondExecution).resolves.toBeDefined()
    expect(listPendingPermissionRequests(project.path)).toHaveLength(0)
    expect(await fs.readFile(secondTarget, "utf8")).toBe("second bridge write\n")
  })

  test("preserves default OpenCode ask behavior for sensitive reads", async () => {
    await using project = await tmpdir({ git: true })
    const toolSet = await buildOpenCodePiToolSet(project.path)
    const readTool = toolSet.tools.find((tool) => tool.name === READ_TOOL_NAME)
    if (!readTool) {
      throw new Error("Missing bridged read tool.")
    }

    const relativeTarget = ".env"
    const target = path.join(project.path, relativeTarget)
    writeFileSync(target, "SECRET_KEY=test\n")

    const execution = readTool.execute(
      "call_read_env",
      {
        filePath: relativeTarget,
      },
      undefined,
      undefined,
      createExtensionContext(project.path),
    )

    const request = await waitForPermissionRequest(project.path)
    expect(request.permission).toBe("read")
    expect(request.patterns).toEqual([".env"])
    expect(replyPendingPermissionRequest(project.path, request.id, "once")).toBe(true)

    const result = await execution
    expect(result.content[0]).toEqual({
      type: "text",
      text: expect.stringContaining("SECRET_KEY=test"),
    })
  })

  test("rejects bridged writes when the user denies permission", async () => {
    await using project = await tmpdir({
      git: true,
      config: {
        permission: {
          edit: "ask",
        },
      },
    })
    const toolSet = await buildOpenCodePiToolSet(project.path)
    const writeTool = toolSet.tools.find((tool) => tool.name === WRITE_TOOL_NAME)
    if (!writeTool) {
      throw new Error("Missing bridged write tool.")
    }

    const relativeTarget = "denied.txt"
    const target = path.join(project.path, relativeTarget)
    const execution = writeTool.execute(
      "call_write_reject",
      {
        filePath: relativeTarget,
        content: "this should not land\n",
      },
      undefined,
      undefined,
      createExtensionContext(project.path),
    )

    const request = await waitForPermissionRequest(project.path)
    expect(replyPendingPermissionRequest(project.path, request.id, "reject")).toBe(true)

    await expect(execution).rejects.toBeDefined()
    await expect(fs.access(target)).rejects.toBeDefined()
  })
})
