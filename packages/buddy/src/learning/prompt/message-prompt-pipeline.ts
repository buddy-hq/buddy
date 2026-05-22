import { parseConfiguredModel, type readProjectConfig } from "../../config/runtime/config-access"
import { buildBuddyPromptEnvelope, type BuddyPromptEnvelope } from "./buddy-prompt-compiler"
import { createPromptContext, type CreatePromptContextResult } from "./context"
import { normalizePromptParts } from "./workspace-file-references"
import type { TeachingSessionState } from "../shared/teaching-session-state"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitModel,
  normalizePersonaTarget,
} from "../shared/targeting"

export type MessagePromptPipelineContext = {
  directory: string
  sessionID: string
}

export type MessagePromptPipelineResult = {
  transformed: Record<string, unknown>
  sessionRuntimeForPermissions?: CreatePromptContextResult["sessionRuntimeForPermissions"]
  nextTeachingState?: TeachingSessionState
  learnerContextDelivery?: {
    fingerprint: string
    items: TeachingSessionState["lastDeliveredLearnerContextItems"]
    kind: "bootstrap" | "delta"
  }
  turnContextDelivery?: {
    currentReadingFingerprint?: string
    deliveredReadingFingerprint?: string
    currentTeachingFingerprint?: string
    deliveredTeachingFingerprint?: string
  }
}

function userPreludeSystemContext(promptEnvelope: BuddyPromptEnvelope): string {
  return promptEnvelope.userPreludeParts
    .map((part) => part.text)
    .join("\n\n")
    .trim()
}

export async function runMessagePromptPipeline(input: {
  context: MessagePromptPipelineContext
  body: Record<string, unknown>
  projectConfig: Awaited<ReturnType<typeof readProjectConfig>>
  previousState?: TeachingSessionState
}): Promise<MessagePromptPipelineResult> {
  assertNoLegacyRuntimeOverrides(input.body)

  const content = typeof input.body.content === "string" ? input.body.content : ""
  const parts = await normalizePromptParts({
    directory: input.context.directory,
    content,
    parts: Array.isArray(input.body.parts) ? [...input.body.parts] : [],
  })

  const target = normalizePersonaTarget({
    body: input.body,
    config: input.projectConfig,
  })

  const transformed: Record<string, unknown> = {
    ...input.body,
    parts,
  }

  let sessionRuntimeForPermissions:
    | CreatePromptContextResult["sessionRuntimeForPermissions"]
    | undefined
  let nextTeachingState: TeachingSessionState | undefined
  let learnerContextDelivery: MessagePromptPipelineResult["learnerContextDelivery"]
  let turnContextDelivery: MessagePromptPipelineResult["turnContextDelivery"]
  const existingSystem = typeof input.body.system === "string" ? input.body.system.trim() : ""
  let buddySystem = ""

  if (target.includeBuddySystem && target.personaID) {
    const promptContextResult = await createPromptContext({
      directory: input.context.directory,
      sessionID: input.context.sessionID,
      body: input.body,
      projectConfig: input.projectConfig,
      previousState: input.previousState,
      personaID: target.personaID,
    })
    const promptEnvelope = await buildBuddyPromptEnvelope(promptContextResult.context)

    sessionRuntimeForPermissions = promptContextResult.sessionRuntimeForPermissions
    nextTeachingState = promptContextResult.nextTeachingState
    buddySystem = promptEnvelope.systemContext
    const preludeSystem = userPreludeSystemContext(promptEnvelope)
    if (preludeSystem) {
      transformed.turnPrelude = preludeSystem
    }
    learnerContextDelivery = promptEnvelope.deliveredLearnerContext
    turnContextDelivery = promptEnvelope.turnContextDelivery
  }

  const mergedSystem = [existingSystem, buddySystem].filter(Boolean).join("\n\n").trim()
  if (mergedSystem) {
    transformed.system = mergedSystem
  }
  const configuredModel = parseConfiguredModel(input.projectConfig.model)
  const explicitModel = hasExplicitModel(input.body.model)
  if (!explicitModel && configuredModel) {
    transformed.model = configuredModel
  }
  transformed.agent = target.agent
  delete transformed.content
  delete transformed.persona
  delete transformed.focusGoalIds
  delete transformed.modelRuntime
  delete transformed.teaching

  return {
    transformed,
    sessionRuntimeForPermissions,
    ...(nextTeachingState ? { nextTeachingState } : {}),
    ...(learnerContextDelivery ? { learnerContextDelivery } : {}),
    ...(turnContextDelivery ? { turnContextDelivery } : {}),
  }
}
