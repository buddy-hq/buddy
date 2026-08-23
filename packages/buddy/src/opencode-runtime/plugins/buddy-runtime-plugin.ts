import path from "node:path"
import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { PRODUCTION_PERSONAS } from "@buddy/backend/learning/shared/teaching-vocabulary"
import { MessageID, PartID } from "@buddy/opencode-adapter/id"
import { createOpenAICodexAuthHook } from "./openai-codex-auth"
import { createOpenAICodexProviderHook } from "./openai-codex-provider"
import { stripToolPresentationFromMessages } from "../tool-presentation-strip"
import { captureSessionSystemPrompt } from "../system-prompt-capture"
import { preloadBuddyBootstrapGraph } from "../../learning/runtime/bootstrap-preload"
import {
  formatCommandInvocationDisplay,
  withCommandInvocationDisplayParts,
} from "../../session/orchestration/command-transcript"
import { cleanupBenchCapturesForSession } from "../../learning/features/bench/captures"
import { readTeachingSessionState } from "../../learning/agent-execution/state/session-state"
import { resolveConciseResponses } from "../../learning/shared/concise-responses"
import { stripConciseResponseInstructions } from "../../learning/personas/prompts/concise-response-control"

type SystemTransformInput = {
  sessionID?: string
}

type SystemTransformOutput = {
  system: string[]
}

const PRODUCTION_PERSONA_IDS = new Set<string>(PRODUCTION_PERSONAS)
const LOW_TEXT_VERBOSITY = "low"
const MEDIUM_TEXT_VERBOSITY = "medium"

type TextVerbosityOptions = {
  textVerbosity?: unknown
}

export function applyConciseResponseTextVerbosity(input: {
  agent: string
  conciseResponses: boolean
  options: TextVerbosityOptions
}): void {
  if (!PRODUCTION_PERSONA_IDS.has(input.agent)) return
  if (input.conciseResponses) return
  if (input.options.textVerbosity !== LOW_TEXT_VERBOSITY) return

  input.options.textVerbosity = MEDIUM_TEXT_VERBOSITY
}

function createTextVerbosityHook(input: {
  directory: string
}): NonNullable<Hooks["chat.params"]> {
  return async (hookInput, output) => {
    if (!PRODUCTION_PERSONA_IDS.has(hookInput.agent)) return

    const sessionState = readTeachingSessionState(input.directory, hookInput.sessionID)
    const conciseResponses =
      sessionState?.conciseResponses ??
      resolveConciseResponses(await readProjectConfig(input.directory))
    applyConciseResponseTextVerbosity({
      agent: hookInput.agent,
      conciseResponses,
      options: output.options,
    })
  }
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

const stripToolPresentationFromChatMessages: NonNullable<
  Hooks["experimental.chat.messages.transform"]
> = async (_hookInput, output) => {
  stripToolPresentationFromMessages(output.messages)
}

type CommandExecuteBeforeHook = NonNullable<Hooks["command.execute.before"]>
type EventHook = NonNullable<Hooks["event"]>
type CommandExecuteBeforeInput = Parameters<CommandExecuteBeforeHook>[0]
type CommandExecuteBeforeOutput = Parameters<CommandExecuteBeforeHook>[1]
type CommandExecuteBeforePart = CommandExecuteBeforeOutput["parts"][number]

function createCommandDisplayHookPart(input: {
  hookInput: CommandExecuteBeforeInput
  displayText: string
}): CommandExecuteBeforePart {
  return {
    id: PartID.ascending(),
    sessionID: input.hookInput.sessionID,
    messageID: MessageID.ascending(),
    type: "text",
    text: input.displayText,
    ignored: true,
  }
}

export const compactCommandInvocationBeforeExecute: CommandExecuteBeforeHook = async (
  hookInput,
  output,
) => {
  const displayText = formatCommandInvocationDisplay({
    command: hookInput.command,
    argumentsText: hookInput.arguments,
  })
  const parts = withCommandInvocationDisplayParts({
    parts: output.parts,
    displayText,
    createDisplayPart: () => createCommandDisplayHookPart({ hookInput, displayText }),
    cloneAsDisplayPart: (part) => ({
      ...part,
      ignored: true,
      text: displayText,
    }),
    cloneAsContextPart: (part) => ({
      ...part,
      id: PartID.ascending(),
      synthetic: true,
    }),
  })

  output.parts.length = 0
  output.parts.push(...parts)
}

const cleanupBenchCapturesOnIdle: EventHook = async ({ event }) => {
  if (event.type === "session.idle") {
    await cleanupBenchCapturesForSession(event.properties.sessionID)
  }
}

function createBuddyRuntimeBehaviorHooks(input: { directory: string }) {
  return {
    "command.execute.before": compactCommandInvocationBeforeExecute,
    "chat.params": createTextVerbosityHook(input),
    "experimental.chat.messages.transform": stripToolPresentationFromChatMessages,
    "experimental.chat.system.transform": async (
      hookInput: SystemTransformInput,
      output: SystemTransformOutput,
    ) => {
      let filtered = normalizeSystemSegments(
        output.system.map((segment) => filterInstructionBlocks(segment)),
      )
      const sessionState = hookInput.sessionID
        ? readTeachingSessionState(input.directory, hookInput.sessionID)
        : undefined
      const baseConciseResponses =
        sessionState?.baseConciseResponses ?? sessionState?.conciseResponses ?? true
      if (sessionState && !baseConciseResponses) {
        filtered = normalizeSystemSegments(
          filtered.map((segment) =>
            stripConciseResponseInstructions({
              persona: sessionState.persona,
              systemPrompt: segment,
            }),
          ),
        )
      }
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
  const { allBuddyPluginTools, registerBuddyToolPresentationCatalog } =
    await import("../buddy-tool-shim")
  const toolMap = await allBuddyPluginTools(input.directory)
  await registerBuddyToolPresentationCatalog(input.directory)

  return {
    tool: toolMap,
    auth: createOpenAICodexAuthHook(),
    provider: createOpenAICodexProviderHook({ directory: input.directory }),
    event: cleanupBenchCapturesOnIdle,
    ...createBuddyRuntimeBehaviorHooks({ directory: input.directory }),
  }
}

const plugin: Plugin = async (input) =>
  createBuddyRuntimeHooks({
    directory: input.directory,
    worktree: input.worktree,
  })

export default plugin
