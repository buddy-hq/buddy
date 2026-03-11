import { parseConfiguredModel, type readProjectConfig } from "@buddy/backend/config/runtime"
import { SessionTransformValidationError } from "../../session"
import { TeachingPromptContextSchema } from "../capabilities"
import { getBuddyPersona } from "../personas"
import { buildLearningSystemPrompt } from "./learning-prompt"
import type { SystemPromptCtx } from "./prompt-context"
import { getWorkspaceSnapshot } from "../learner-model"
import { resolveCapabilityProfile } from "../resolve-capability-profile"
import type { TeachingSessionState } from "../shared/teaching-session-state"
import type { WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitModel,
  normalizePersonaTarget,
  resolveCurrentSurface,
  resolveFocusGoalIds,
  resolveIntent,
} from "../shared/targeting"

export type MessagePromptPipelineContext = {
  directory: string
  sessionID: string
}

export type MessagePromptPipelineResult = {
  transformed: Record<string, unknown>
  runtimeProfileForPermissions?: ReturnType<typeof resolveCapabilityProfile>
  nextTeachingState?: TeachingSessionState
}

export async function runMessagePromptPipeline(input: {
  context: MessagePromptPipelineContext
  body: Record<string, unknown>
  projectConfig: Awaited<ReturnType<typeof readProjectConfig>>
  previousState?: TeachingSessionState
}): Promise<MessagePromptPipelineResult> {
  assertNoLegacyRuntimeOverrides(input.body)

  const parts = Array.isArray(input.body.parts) ? [...input.body.parts] : []
  const content = typeof input.body.content === "string" ? input.body.content : ""
  if (content.trim().length > 0) {
    parts.unshift({
      type: "text",
      text: content,
    })
  }

  if (parts.length === 0) {
    throw new SessionTransformValidationError("content or parts must be provided")
  }

  const teachingContextResult = TeachingPromptContextSchema.safeParse(input.body.teaching)
  const teachingContext = teachingContextResult.success ? teachingContextResult.data : undefined
  const target = normalizePersonaTarget({
    body: input.body,
    config: input.projectConfig,
  })

  const transformed: Record<string, unknown> = {
    ...input.body,
    parts,
  }

  let runtimeProfileForPermissions: ReturnType<typeof resolveCapabilityProfile> | undefined
  let nextTeachingState: TeachingSessionState | undefined
  const existingSystem = typeof input.body.system === "string" ? input.body.system.trim() : ""
  let buddySystem = ""

  if (target.includeBuddySystem && target.personaID) {
    const persona = getBuddyPersona(target.personaID, input.projectConfig.personas)
    const intent = resolveIntent({
      body: input.body,
      config: input.projectConfig,
    })
    const focusGoalIds = resolveFocusGoalIds(input.body)
    const workspaceState: WorkspaceState = teachingContext?.active ? "interactive" : "chat"
    const learnerSnapshot = await getWorkspaceSnapshot({
      directory: input.context.directory,
      query: {
        persona: persona.id,
        intent: intent,
        focusGoalIds,
        workspaceState,
      },
    })
    const runtimeProfile = resolveCapabilityProfile({
      persona,
      workspaceState,
      intent,
    })
    runtimeProfileForPermissions = runtimeProfile

    const promptBuildContext: SystemPromptCtx = {
      directory: input.context.directory,
      persona: runtimeProfile.persona,
      capabilityEnvelope: runtimeProfile.capabilityEnvelope,
      intent: intent,
      learnerSnapshot: learnerSnapshot,
      focusGoalIds,
      teachingContext,
      ...(input.previousState
        ? {
            priorTurn: {
              persona: input.previousState.persona,
              intent: input.previousState.intent,
              workspaceState: input.previousState.workspaceState,
            },
          }
        : {}),
    }
    const promptBuild = await buildLearningSystemPrompt(promptBuildContext)

    nextTeachingState = {
      sessionId: input.context.sessionID,
      persona: persona.id,
      intent,
      currentSurface: resolveCurrentSurface({
        personaID: persona.id,
        config: input.projectConfig,
        workspaceState,
      }),
      workspaceState,
      focusGoalIds,
    }
    buddySystem = promptBuild.systemContext

    if (promptBuild.turnReminder) {
      parts.unshift({
        type: "text",
        text: promptBuild.turnReminder,
        synthetic: true,
      })
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
  delete transformed.content
  delete transformed.persona
  delete transformed.intent
  delete transformed.focusGoalIds
  delete transformed.teaching

  return {
    transformed,
    runtimeProfileForPermissions,
    ...(nextTeachingState ? { nextTeachingState } : {}),
  }
}
