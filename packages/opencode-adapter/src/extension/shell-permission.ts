import type { ToolApprovalRequest } from "@buddy/agent-runtime/extension"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import { statSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import z from "zod"
import type { OpenCodeHost } from "../host"
import { scanShellExternalDirectories } from "./shell-paths"

const shellInput = z.object({ command: z.string(), workdir: z.string().optional() })

type ShellInvocation = Pick<ToolContext, "sessionID" | "agent" | "messageID" | "id"> & {
  tool: string
  input: unknown
}

type ShellPermissionRuntime = {
  location: { directory: string; project: { directory: string } }
  getClient: () => Promise<Pick<OpenCodeHost, "event">>
  ask: (event: ShellInvocation, request: ToolApprovalRequest, signal: AbortSignal) => Promise<void>
}

async function askWithSessionSignal(
  runtime: ShellPermissionRuntime,
  event: ShellInvocation,
  request: ToolApprovalRequest,
) {
  const client = await runtime.getClient()
  const controller = new AbortController()
  const connected = Promise.withResolvers<void>()
  const observing = (async () => {
    try {
      for await (const update of client.event.subscribe({ signal: controller.signal })) {
        if (update.type === "server.connected") connected.resolve()
        if (
          "sessionID" in update.data &&
          update.data.sessionID === event.sessionID &&
          (update.type === "session.execution.interrupted" ||
            update.type === "session.execution.failed" ||
            update.type === "session.execution.succeeded" ||
            (update.type === "session.status" && update.data.status.type === "idle"))
        ) {
          controller.abort()
          return
        }
      }
      controller.abort()
    } catch (cause) {
      controller.abort(cause)
    } finally {
      connected.resolve()
    }
  })()
  try {
    await connected.promise
    controller.signal.throwIfAborted()
    await runtime.ask(event, request, controller.signal)
  } finally {
    controller.abort()
    await observing
  }
}

export function createShellPermissionHook(runtime: ShellPermissionRuntime) {
  return async (event: ShellInvocation) => {
    if (event.tool !== "shell") return
    const parsed = shellInput.safeParse(event.input)
    if (!parsed.success) return
    const directories = await scanShellExternalDirectories(
      { ...parsed.data, location: runtime.location },
      {
        platform: process.platform,
        path,
        home: os.homedir(),
        env: process.env,
        isDirectory: (file) => statSync(file, { throwIfNoEntry: false })?.isDirectory() ?? false,
      },
    )
    if (directories.length === 0) return
    const patterns = directories.map((directory) => path.join(directory, "*").replaceAll("\\", "/"))
    await askWithSessionSignal(runtime, event, {
      permission: "external_directory",
      patterns,
      always: patterns,
      metadata: { command: parsed.data.command, directories },
    })
  }
}
