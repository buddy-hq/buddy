import { parseConfiguredModel, type readProjectConfig } from "@buddy/backend/config/runtime"
import { buildBuddyPromptEnvelope } from "./buddy-prompt-compiler"
import { createPromptContext, type CreatePromptContextResult } from "./context"
import { normalizePromptParts } from "./workspace-file-references"
import { nativeResourcePromptAttachmentsFromParts } from "./native-resource-attachments"
import { applyNativePdfDeliveryPolicy } from "./native-pdf-delivery"
import type { TeachingSessionState } from "../shared/teaching-session-state"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitModel,
  normalizePersonaTarget,
} from "../shared/targeting"
import { resolveSubagentToolForwarding } from "../agent-execution/transforms/subagent-tool-forwarding"
import type { PermissionRuleset } from "@buddy/opencode-adapter/permission"

export type MessagePromptPipelineContext = {
  directory: string
  sessionID: string
}

export type MessagePromptPipelineResult = {
  transformed: Record<string, unknown>
  subagentSessionPermission?: PermissionRuleset
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
    currentBenchFingerprint?: string
    deliveredBenchFingerprint?: string
    currentTeachingFingerprint?: string
    deliveredTeachingFingerprint?: string
  }
}

export async function runMessagePromptPipeline(input: {
  context: MessagePromptPipelineContext
  body: Record<string, unknown>
  projectConfig: Awaited<ReturnType<typeof readProjectConfig>>
  previousState?: TeachingSessionState
}): Promise<MessagePromptPipelineResult> {
  assertNoLegacyRuntimeOverrides(input.body)

  const content = typeof input.body.content === "string" ? input.body.content : ""
  const normalizedParts = await normalizePromptParts({
    directory: input.context.directory,
    content,
    parts: Array.isArray(input.body.parts) ? [...input.body.parts] : [],
  })
  const parts = await applyNativePdfDeliveryPolicy({
    directory: input.context.directory,
    parts: normalizedParts,
  })
  const nativeResourceAttachments = nativeResourcePromptAttachmentsFromParts(parts)

  const target = normalizePersonaTarget({
    body: input.body,
    config: input.projectConfig,
    sessionPersona: input.previousState?.persona,
  })

  const transformed = Object.assign({}, input.body, {
    parts,
  })

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
      nativeResourceAttachments,
    })
    const promptEnvelope = await buildBuddyPromptEnvelope(promptContextResult.context)

    sessionRuntimeForPermissions = promptContextResult.sessionRuntimeForPermissions
    nextTeachingState = promptContextResult.nextTeachingState
    buddySystem = promptEnvelope.systemContext
    learnerContextDelivery = promptEnvelope.deliveredLearnerContext
    turnContextDelivery = promptEnvelope.turnContextDelivery

    if (promptEnvelope.userPreludeParts.length > 0) {
      parts.unshift(...promptEnvelope.userPreludeParts)
      transformed.parts = parts
    }
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
  const subagentForwarding = await resolveSubagentToolForwarding({
    currentTools: transformed.tools,
    directory: input.context.directory,
    previousState: input.previousState,
    projectConfig: input.projectConfig,
    sessionID: input.context.sessionID,
    targetAgent: target.agent,
  })
  if (subagentForwarding.toolOverrides) {
    transformed.tools = subagentForwarding.toolOverrides
  }
  if (subagentForwarding.stateSeed && !nextTeachingState) {
    nextTeachingState = subagentForwarding.stateSeed
  }
  delete transformed.content
  delete transformed.persona
  delete transformed.focusGoalIds
  delete transformed.modelRuntime
  delete transformed.teaching
  delete transformed.imageEdit
  delete transformed.nativeResourceAttachments

  return Object.assign(
    Object.assign(
      {
        transformed,
        sessionRuntimeForPermissions,
      },
      subagentForwarding.sessionPermission
        ? { subagentSessionPermission: subagentForwarding.sessionPermission }
        : undefined,
      nextTeachingState ? { nextTeachingState } : undefined,
      learnerContextDelivery ? { learnerContextDelivery } : undefined,
    ),
    turnContextDelivery ? { turnContextDelivery } : undefined,
  )
}
