import { parseConfiguredModel, readProjectConfig } from "../../config/compatibility.js"
import { compileRuntimeProfile } from "../../learning/runtime/compiler.js"
import { buildPromptInjectionPolicy } from "../../learning/runtime/prompt-injection-policy.js"
import { resolvePromptInjectionDecision } from "../../learning/runtime/prompt-injection.js"
import { readTeachingSessionState, writeTeachingSessionState } from "../../learning/runtime/session-state.js"
import { type WorkspaceState } from "../../learning/runtime/types.js"
import { LearnerService } from "../../learning/learner/service.js"
import { buildLearningSystemPrompt, summarizeAdvisorySuggestions } from "../../learning/shared/compose-system-prompt.js"
import { TeachingPromptContextSchema } from "../../learning/teaching/types.js"
import { getBuddyPersona } from "../../personas/catalog.js"
import { SessionTransformValidationError } from "./errors.js"
import { assertSessionExistsInDirectory } from "./lookup.js"
import { syncBuddyRuntimeSessionPermissions } from "./permissions.js"
import { restoreTeachingSessionState, writeLastLlmOutbound } from "./state.js"
import type { SessionTransform, SessionTransformContext } from "./transform-types.js"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitModel,
  normalizePersonaTarget,
  resolveCurrentSurface,
  resolveFocusGoalIds,
  resolveIntentOverride,
} from "./targeting.js"

export function createSessionMessageTransform(input: { context: SessionTransformContext }): SessionTransform {
  let rollbackTeachingState: (() => void) | undefined
  let observeAcceptedMessage: (() => Promise<void>) | undefined

  return {
    onTransform: async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
      assertNoLegacyRuntimeOverrides(body)

      const parts = Array.isArray(body.parts) ? [...body.parts] : []
      const content = typeof body.content === "string" ? body.content : ""
      const teachingContextResult = TeachingPromptContextSchema.safeParse(body.teaching)
      const teachingContext = teachingContextResult.success ? teachingContextResult.data : undefined
      const projectConfig = await readProjectConfig(input.context.directory)
      const target = normalizePersonaTarget({
        body,
        config: projectConfig,
      })
      if (content.trim().length > 0) {
        parts.unshift({
          type: "text",
          text: content,
        })
      }

      if (parts.length === 0) {
        throw new SessionTransformValidationError("content or parts must be provided")
      }

      const allTextContent = content.trim().length > 0
        ? content
        : parts
            .filter((part): part is { type: "text"; text: string } => {
              if (!part || typeof part !== "object") return false
              if (!("type" in part) || !("text" in part)) return false
              return part.type === "text" && typeof part.text === "string"
            })
            .map((part) => part.text)
            .join("\n")

      const transformed: Record<string, unknown> = {
        ...body,
        parts,
      }
      const existingSystem = typeof body.system === "string" ? body.system.trim() : ""
      let buddySystem = ""

      if (target.includeBuddySystem && target.personaID) {
        const previousState = readTeachingSessionState(input.context.directory, input.context.sessionID)
        const persona = getBuddyPersona(target.personaID, projectConfig.personas)
        const intentOverride = resolveIntentOverride({
          body,
          config: projectConfig,
        })
        const workspace = await LearnerService.ensureWorkspaceContext(input.context.directory)
        const focusGoalIds = resolveFocusGoalIds(body)
        const learnerDigest = await LearnerService.buildPromptContext({
          directory: input.context.directory,
          query: {
            workspaceId: workspace.workspaceId,
            persona: persona.id,
            intent: intentOverride,
            focusGoalIds,
            tokenBudget: 1400,
          },
        })
        const workspaceState: WorkspaceState = teachingContext?.active ? "interactive" : "chat"
        const runtimeProfile = compileRuntimeProfile({
          persona,
          workspaceState,
          intentOverride,
        })
        await assertSessionExistsInDirectory({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
          request: input.context.request,
        })
        const promptBuild = await buildLearningSystemPrompt({
          directory: input.context.directory,
          runtimeProfile,
          learnerDigest,
          teachingContext,
          intentOverride,
          focusGoalIds,
          userContent: allTextContent,
        })
        const injectionPolicy = buildPromptInjectionPolicy({
          previous: previousState,
          personaID: persona.id,
          intentOverride,
          workspaceState,
          focusGoalIds,
        })
        const promptInjection = resolvePromptInjectionDecision({
          previous: previousState?.promptInjectionCache,
          stableHeaderSections: promptBuild.stableHeaderSections,
          turnContextSections: promptBuild.turnContextSections,
          policy: injectionPolicy.policy,
        })

        rollbackTeachingState = () =>
          restoreTeachingSessionState({
            directory: input.context.directory,
            sessionID: input.context.sessionID,
            previousState,
          })

        writeTeachingSessionState(input.context.directory, {
          sessionId: input.context.sessionID,
          persona: persona.id,
          intentOverride,
          currentSurface: resolveCurrentSurface({
            personaID: persona.id,
            config: projectConfig,
            workspaceState,
          }),
          workspaceState,
          focusGoalIds,
          promptInjectionCache: promptInjection.cache,
          inspector: {
            runtimeAgent: runtimeProfile.runtimeAgent,
            capabilityEnvelope: runtimeProfile.capabilityEnvelope,
            learnerDigest,
            advisorySuggestions: summarizeAdvisorySuggestions({
              recommendedNextAction: learnerDigest.recommendedNextAction,
              openFeedbackActions: learnerDigest.openFeedbackActions,
              relevantGoalIds: focusGoalIds.length > 0 ? focusGoalIds : learnerDigest.relevantGoalIds,
            }),
            stableHeader: promptBuild.stableHeader,
            turnContext: promptBuild.turnContext,
            stableHeaderSections: promptBuild.stableHeaderSections,
            turnContextSections: promptBuild.turnContextSections,
            promptInjectionAudit: {
              ...injectionPolicy.audit,
              decision: {
                injectStableHeader: promptInjection.injectStableHeader,
                injectTurnContext: promptInjection.injectTurnContext,
                changedStableHeaderSectionKeys: promptInjection.changedStableHeaderSectionKeys,
                changedTurnContextSectionKeys: promptInjection.changedTurnContextSectionKeys,
              },
            },
          },
        })
        observeAcceptedMessage = async () => {
          await LearnerService.recordLearnerMessageEvent({
            directory: input.context.directory,
            content: allTextContent,
            goalIds: focusGoalIds.length > 0 ? focusGoalIds : learnerDigest.relevantGoalIds,
            sessionId: input.context.sessionID,
          })
        }
        await syncBuddyRuntimeSessionPermissions({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
          runtimeProfile,
        })
        buddySystem = promptInjection.stableHeader

        if (promptInjection.injectTurnContext) {
          parts.unshift({
            type: "text",
            text: promptInjection.turnContext,
            synthetic: true,
          })
          transformed.parts = parts
        }
      } else {
        await assertSessionExistsInDirectory({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
          request: input.context.request,
        })
        await syncBuddyRuntimeSessionPermissions({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
        })
      }
      const mergedSystem = [existingSystem, buddySystem].filter(Boolean).join("\n\n").trim()
      if (mergedSystem) {
        transformed.system = mergedSystem
      }
      const configuredModel = parseConfiguredModel(projectConfig.model)
      const explicitModel = hasExplicitModel(body.model)
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
      writeLastLlmOutbound({
        directory: input.context.directory,
        sessionID: input.context.sessionID,
        kind: "message",
        payload: transformed,
      })
      return transformed
    },
    onAccepted: async () => {
      if (observeAcceptedMessage) {
        await observeAcceptedMessage()
      }
    },
    rollbackState: () => {
      rollbackTeachingState?.()
    },
  }
}
