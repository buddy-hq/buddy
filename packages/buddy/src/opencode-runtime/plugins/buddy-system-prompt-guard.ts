import os from "node:os"
import path from "node:path"
import { captureSessionSystemPrompt } from "../system-prompt-capture"

type SystemTransformInput = {
  sessionID?: string
}

type SystemTransformOutput = {
  system: string[]
}

type PluginInput = {
  directory: string
  worktree: string
}

type PluginHooks = {
  "experimental.chat.system.transform"?: (
    input: SystemTransformInput,
    output: SystemTransformOutput,
  ) => Promise<void>
}

type FilterContext = {
  buddyGlobalAgentsPath: string
  projectDirectory?: string
  projectWorktree?: string
}

function decodeAndResolvePath(value: string) {
  try {
    return path.resolve(decodeURIComponent(value))
  } catch {
    return path.resolve(value)
  }
}

function normalizeForComparison(value: string) {
  const normalized = path.normalize(value)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function normalizeOptionalDirectory(directory: string | undefined) {
  if (!directory || !directory.trim() || directory === "/") return undefined
  const normalized = normalizeForComparison(decodeAndResolvePath(directory))
  const root = normalizeForComparison(path.parse(normalized).root)
  if (normalized === root) return undefined
  return normalized
}

function resolveBuddyGlobalAgentsPath() {
  const configured = process.env.BUDDY_GLOBAL_CONFIG_DIR?.trim()
  const home = process.env.BUDDY_TEST_HOME?.trim() || os.homedir()
  const configRoot =
    configured && configured !== "undefined"
      ? decodeAndResolvePath(configured)
      : path.join(home, ".buddy")
  return normalizeForComparison(path.join(configRoot, "AGENTS.md"))
}

function normalizeInstructionSourcePath(source: string) {
  const value = source.trim()
  if (!value) return undefined
  if (value.startsWith("http://") || value.startsWith("https://")) return undefined
  if (value.includes("://")) return undefined
  if (!path.isAbsolute(value)) return undefined
  return normalizeForComparison(path.resolve(value))
}

function isWithinDirectory(root: string | undefined, target: string) {
  if (!root) return false
  if (target === root) return true
  const relative = path.relative(root, target)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function shouldKeepInstructionSource(source: string, context: FilterContext) {
  const sourcePath = normalizeInstructionSourcePath(source)
  if (!sourcePath) return true

  const filename = path.basename(sourcePath).toLowerCase()
  if (filename === "claude.md" || filename === "context.md") {
    return false
  }
  if (filename !== "agents.md") {
    return true
  }

  if (sourcePath === context.buddyGlobalAgentsPath) {
    return true
  }

  if (isWithinDirectory(context.projectDirectory, sourcePath)) {
    return true
  }

  if (isWithinDirectory(context.projectWorktree, sourcePath)) {
    return true
  }

  return false
}

function filterInstructionBlocks(input: string, context: FilterContext) {
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
    if (shouldKeepInstructionSource(source, context)) {
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

async function BuddySystemPromptGuardPlugin(input: PluginInput): Promise<PluginHooks> {
  const context: FilterContext = {
    buddyGlobalAgentsPath: resolveBuddyGlobalAgentsPath(),
    projectDirectory: normalizeOptionalDirectory(input.directory),
    projectWorktree: normalizeOptionalDirectory(input.worktree),
  }

  return {
    "experimental.chat.system.transform": async (hookInput, output) => {
      const filtered = normalizeSystemSegments(
        output.system.map((segment) => filterInstructionBlocks(segment, context)),
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

export default BuddySystemPromptGuardPlugin
