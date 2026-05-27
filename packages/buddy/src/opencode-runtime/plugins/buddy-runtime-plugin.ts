import path from "node:path"
import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { createOpenAICodexAuthHook } from "./openai-codex-auth"
import { stripToolUiFromMessages } from "../tool-ui-strip"
import { captureSessionSystemPrompt } from "../system-prompt-capture"
import { preloadBuddyBootstrapGraph } from "../../learning/runtime/bootstrap-preload"

type SystemTransformInput = {
  sessionID?: string
}

type SystemTransformOutput = {
  system: string[]
}

function normalizeForComparison(value: string) {
  const normalized = path.normalize(value)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function normalizeInstructionSourcePath(source: string) {
  const value = source.trim()
  if (!value) return undefined
  if (value.startsWith("http://") || value.startsWith("https://")) return undefined
  if (value.includes("://")) return undefined
  if (!path.isAbsolute(value)) return undefined
  return normalizeForComparison(path.resolve(value))
}

function shouldKeepInstructionSource(source: string) {
  const sourcePath = normalizeInstructionSourcePath(source)
  if (!sourcePath) return true

  const filename = path.basename(sourcePath).toLowerCase()
  if (filename === "claude.md" || filename === "context.md") {
    return false
  }
  return true
}

function filterInstructionBlocks(input: string) {
  const headerPattern = /^Instructions from:\s+(.+)$/gm
  const headers = Array.from(input.matchAll(headerPattern))
  if (headers.length === 0) {
    return input
  }

  let output = ""
  let cursor = 0

  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index]
    if (!header) continue

    const blockStart = header.index ?? 0
    const blockEnd = headers[index + 1]?.index ?? input.length
    const source = (header[1] ?? "").trim()

    output += input.slice(cursor, blockStart)
    if (shouldKeepInstructionSource(source)) {
      output += input.slice(blockStart, blockEnd)
    }
    cursor = blockEnd
  }

  output += input.slice(cursor)

  return output
    .split("\n")
    .reduce<string[]>((lines, line) => {
      const previous = lines[lines.length - 1]
      if (line.trim().length === 0 && previous?.trim().length === 0) {
        return lines
      }
      lines.push(line)
      return lines
    }, [])
    .join("\n")
    .trim()
}

function normalizeSystemSegments(segments: string[]) {
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0)
}

const stripToolUiFromChatMessages: NonNullable<
  Hooks["experimental.chat.messages.transform"]
> = async (_hookInput, output) => {
  stripToolUiFromMessages(output.messages)
}

function createSystemPromptGuard(input: { directory: string }) {
  return {
    "experimental.chat.messages.transform": stripToolUiFromChatMessages,
    "experimental.chat.system.transform": async (
      hookInput: SystemTransformInput,
      output: SystemTransformOutput,
    ) => {
      const filtered = normalizeSystemSegments(
        output.system.map((segment) => filterInstructionBlocks(segment)),
      )
      output.system.length = 0
      output.system.push(...filtered)

      if (!hookInput.sessionID) {
        return
      }

      const fullSystemPrompt = filtered.join("\n\n").trim()
      if (!fullSystemPrompt) {
        return
      }

      await captureSessionSystemPrompt({
        directory: input.directory,
        sessionID: hookInput.sessionID,
        fullSystemPrompt,
      })
    },
  }
}

export async function createBuddyRuntimeHooks(input: { directory: string; worktree: string }) {
  await preloadBuddyBootstrapGraph()
  const { allBuddyPluginTools, registerBuddyToolUiCatalog } = await import("../buddy-tool-shim")
  const toolMap = await allBuddyPluginTools(input.directory)
  await registerBuddyToolUiCatalog(input.directory)

  return {
    tool: toolMap,
    auth: createOpenAICodexAuthHook(),
    ...createSystemPromptGuard({ directory: input.directory }),
  }
}

const plugin: Plugin = async (input) =>
  createBuddyRuntimeHooks({
    directory: input.directory,
    worktree: input.worktree,
  })

export default plugin
