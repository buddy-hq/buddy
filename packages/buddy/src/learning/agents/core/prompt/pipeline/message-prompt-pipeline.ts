import { parseConfiguredModel, type readProjectConfig } from "@buddy/backend/config/runtime"
import { buildLearningSystemPrompt } from "../system"
import type { PromptBuildContext } from "../system"
import type { MessagePromptPipelineContext } from "./types"
import { TeachingPromptContextSchema } from "../../../capabilities"
import { getBuddyPersona } from "../../../personas"
import { getWorkspaceSnapshot } from "../../../../learner-model"
import { SessionTransformValidationError } from "../../../../../session"
import { compileRuntimeProfile } from "../../runtime/runtime-profile"
import type { TeachingSessionState } from "../../shared/teaching-session-state"
import type { WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitModel,
  normalizePersonaTarget,
  resolveCurrentSurface,
  resolveFocusGoalIds,
  resolveIntentOverride,
} from "../../shared/targeting"

export type MessagePromptPipelineResult = {
  transformed: Record<string, unknown>
  runtimeProfileForPermissions?: ReturnType<typeof compileRuntimeProfile>
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

  let runtimeProfileForPermissions: ReturnType<typeof compileRuntimeProfile> | undefined
  let nextTeachingState: TeachingSessionState | undefined
  const existingSystem = typeof input.body.system === "string" ? input.body.system.trim() : ""
  let buddySystem = ""

  if (target.includeBuddySystem && target.personaID) {
    const persona = getBuddyPersona(target.personaID, input.projectConfig.personas)
    const intentOverride = resolveIntentOverride({
      body: input.body,
      config: input.projectConfig,
    })
    const focusGoalIds = resolveFocusGoalIds(input.body)
    const workspaceState: WorkspaceState = teachingContext?.active ? "interactive" : "chat"
    const learnerSnapshot = await getWorkspaceSnapshot({
      directory: input.context.directory,
      query: {
        persona: persona.id,
        intent: intentOverride,
        focusGoalIds,
        workspaceState,
      },
    })
    const runtimeProfile = compileRuntimeProfile({
      persona,
      workspaceState,
      intentOverride,
    })
    runtimeProfileForPermissions = runtimeProfile

    const promptBuildContext: PromptBuildContext = {
      runtime: {
        directory: input.context.directory,
        profile: runtimeProfile,
        intentOverride,
      },
      learner: {
        snapshot: learnerSnapshot,
        focusGoalIds,
      },
      workspace: {
        teachingContext,
      },
      ...(input.previousState
        ? {
            previousState: {
              persona: input.previousState.persona,
              intentOverride: input.previousState.intentOverride,
              workspaceState: input.previousState.workspaceState,
            },
          }
        : {}),
    }
    const promptBuild = await buildLearningSystemPrompt(promptBuildContext)

    nextTeachingState = {
      sessionId: input.context.sessionID,
      persona: persona.id,
      intentOverride,
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
  transformed.agent = target.runtimeAgent
  delete transformed.content
  delete transformed.persona
  delete transformed.intent
  delete transformed.focusGoalIds
  delete transformed.activityBundleId
  delete transformed.teaching

  return {
    transformed,
    runtimeProfileForPermissions,
    ...(nextTeachingState ? { nextTeachingState } : {}),
  }
}
