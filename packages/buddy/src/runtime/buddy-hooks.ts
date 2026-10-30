import type {
  ExtensionHooks,
  ExtensionLocation,
  ModelContext,
  SessionAccess,
  TextVerbosity,
} from "@buddy/agent-runtime/extension"
import { chatAccessHookEffect } from "../learning/agent-execution/permissions/access-mode"
import { PRODUCTION_PERSONAS } from "../learning/shared/teaching-vocabulary"
import { captureSessionSystemPrompt } from "./system-prompt-capture"
import { readTeachingSessionState } from "../learning/agent-execution/state/session-state"
import { resolveConciseResponses } from "../learning/shared/concise-responses"
import { stripConciseResponseInstructions } from "../learning/personas/prompts/concise-response-control"
import { createBuddySubagentHooks } from "./buddy-subagents"
import { imagePlanGate } from "../learning/features/image-generation/service/plan-gate"

const PRODUCTION_PERSONA_IDS = new Set<string>(PRODUCTION_PERSONAS)

type TextVerbosityOptions = { textVerbosity?: TextVerbosity }

function applyConciseResponseTextVerbosity(input: {
  agent: string
  conciseResponses: boolean
  options: TextVerbosityOptions
}): void {
  if (!PRODUCTION_PERSONA_IDS.has(input.agent) || input.conciseResponses) return
  if (input.options.textVerbosity === "low") input.options.textVerbosity = "medium"
}

function keepInstructionSource(source: string): boolean {
  const normalized = source.trim().replaceAll("\\", "/")
  if (!normalized.startsWith("/") && !/^[a-z]:\//i.test(normalized)) return true
  const filename = normalized.split("/").at(-1)?.toLowerCase()
  return filename !== "claude.md" && filename !== "context.md"
}

function filterInstructionBlocks(text: string): string {
  const headers = [...text.matchAll(/^Instructions from:\s+(.+)$/gm)]
  const first = headers[0]
  if (!first) return text
  const kept = [text.slice(0, first.index)]
  for (const [index, header] of headers.entries()) {
    if (keepInstructionSource(header[1] ?? "")) {
      kept.push(text.slice(header.index, headers[index + 1]?.index ?? text.length))
    }
  }
  return kept.join("").trim()
}

async function transformSessionContext(
  directory: string,
  event: ModelContext,
  imageGenerationUnavailable: () => Promise<boolean>,
): ReturnType<ExtensionHooks["context"]> {
  const options = { textVerbosity: event.textVerbosity }
  const state = readTeachingSessionState(directory, event.sessionID)
  if (PRODUCTION_PERSONA_IDS.has(event.agent)) {
    const conciseResponses =
      state?.conciseResponses ??
      resolveConciseResponses(
        await (await import("../config/runtime/project-config")).readProjectConfig(directory),
      )
    applyConciseResponseTextVerbosity({ agent: event.agent, conciseResponses, options })
  }
  const baseConciseResponses = state?.baseConciseResponses ?? state?.conciseResponses ?? true
  const system = event.system.map((part) => {
    let text = filterInstructionBlocks(part)
    if (state && !baseConciseResponses) {
      text = stripConciseResponseInstructions({ persona: state.persona, systemPrompt: text })
    }
    return text.trim()
  })
  await captureSessionSystemPrompt({
    directory,
    sessionID: event.sessionID,
    fullSystemPrompt: system.filter((text) => text !== "").join("\n\n"),
  })
  const hiddenTools =
    event.tools.includes("imagegen") && (await imageGenerationUnavailable())
      ? ["imagegen"]
      : undefined
  return {
    system,
    textVerbosity: options.textVerbosity,
    ...(hiddenTools ? { hiddenTools } : undefined),
  }
}

export function createBuddyHooks(
  location: ExtensionLocation,
  sessions: SessionAccess,
  options: { readonly imageGenerationUnavailable?: () => Promise<boolean> } = {},
): ExtensionHooks {
  const imageGenerationUnavailable =
    options.imageGenerationUnavailable ?? (() => imagePlanGate.unavailable())
  return {
    ...createBuddySubagentHooks(location.directory, sessions),
    context: (event) =>
      transformSessionContext(location.directory, event, imageGenerationUnavailable),
    permission: (input) => chatAccessHookEffect(sessions, location.directory, input),
  }
}
