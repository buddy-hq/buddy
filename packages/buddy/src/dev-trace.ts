import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { DatabasePath } from "@buddy/opencode-adapter/storage-db"
import { z } from "zod"

export type SaveDevTraceInput = {
  trace: string
  sessionID?: string
  sessionTitle?: string
  directory?: string
  devInstanceName?: string
  devServer?: string
  worktree?: string
  branch?: string
  databasePath?: string
}

export type SaveDevTraceOutput = {
  success: boolean
  filePath: string
  relativeFilePath: string
  worktree: string
  worktreeName: string
  branch: string
  devServer: string
  devInstanceName: string
  databasePath?: string
  sessionID?: string
  sessionTitle?: string
  directory?: string
  byteCount: number
  tokenCount: number
  messageCount: number
  streamStatus?: string
  savedAt: string
}

const traceJsonSchema = z
  .object({
    directoryState: z
      .object({
        sessionTitle: z.string().optional(),
        messages: z.array(z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    sessionID: z.string().optional(),
    directory: z.string().optional(),
    streamStatus: z.string().optional(),
  })
  .passthrough()

function resolveDatabasePath(): string | undefined {
  try {
    return DatabasePath()
  } catch {
    return undefined
  }
}

function resolveWorktreeRoot(startDir: string): string {
  try {
    const output = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim()
    if (output) return output
  } catch {
    // fallback
  }
  return startDir
}

function resolveCurrentBranch(worktreeRoot: string, fallback?: string): string {
  try {
    const output = execFileSync("git", ["branch", "--show-current"], {
      cwd: worktreeRoot,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim()
    if (output) return output
  } catch {
    // fallback
  }
  return fallback || path.basename(worktreeRoot)
}

export function saveDevSessionTrace(input: SaveDevTraceInput): SaveDevTraceOutput {
  let fallbackBase = process.cwd()
  try {
    if (OpenCodeInstance.worktree) {
      fallbackBase = OpenCodeInstance.worktree
    }
  } catch {
    // noop
  }

  const baseDir = input.worktree || fallbackBase
  const worktree = resolveWorktreeRoot(baseDir)
  const worktreeName = path.basename(worktree)
  const branch = resolveCurrentBranch(worktree, input.branch || input.devInstanceName)
  const devInstanceName = input.devInstanceName?.trim() || branch || worktreeName
  const devServer = input.devServer?.trim() || "local dev server"
  const databasePath = input.databasePath || resolveDatabasePath()

  const tracesDir = path.join(worktree, ".traces")
  if (!existsSync(tracesDir)) {
    mkdirSync(tracesDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const sessionSlug = (input.sessionID || "session").replace(/[^a-zA-Z0-9_-]/g, "_")
  const filename = `session-${sessionSlug}-${timestamp}.log`
  const filePath = path.join(tracesDir, filename)
  const relativeFilePath = path.join(".traces", filename)

  let messageCount = 0
  let streamStatus = ""
  let contentToWrite = input.trace

  try {
    const parsedRaw = JSON.parse(input.trace)
    const parsed = traceJsonSchema.safeParse(parsedRaw)
    if (parsed.success) {
      messageCount = parsed.data.directoryState?.messages?.length ?? 0
      streamStatus = parsed.data.streamStatus ?? ""
      const traceMetadata = {
        savedAt: new Date().toISOString(),
        sessionID: input.sessionID ?? parsed.data.sessionID,
        sessionTitle: input.sessionTitle ?? parsed.data.directoryState?.sessionTitle,
        directory: input.directory ?? parsed.data.directory,
        databasePath,
        devServer,
        devInstanceName,
        worktree,
        branch,
        logFile: relativeFilePath,
      }
      contentToWrite = JSON.stringify(
        Object.assign({}, parsedRaw, { traceMetadata }),
        null,
        2,
      )
    }
  } catch {
    // if trace is not valid JSON, keep as is
  }

  writeFileSync(filePath, contentToWrite, "utf8")

  const byteCount = Buffer.byteLength(contentToWrite, "utf8")
  const tokenCount = Math.ceil(contentToWrite.length / 4)
  const savedAt = new Date().toISOString()

  return {
    success: true,
    filePath,
    relativeFilePath,
    worktree,
    worktreeName,
    branch,
    devServer,
    devInstanceName,
    databasePath,
    sessionID: input.sessionID,
    sessionTitle: input.sessionTitle,
    directory: input.directory,
    byteCount,
    tokenCount,
    messageCount,
    streamStatus,
    savedAt,
  }
}
