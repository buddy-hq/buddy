import { parseConfiguredModel, type readProjectConfig } from "@buddy/backend/config/runtime"
import { ModelID, ProviderID } from "@buddy/opencode-adapter/id"
import { Provider } from "@buddy/opencode-adapter/provider"
import { TeachingPromptContextSchema } from "../capabilities/lesson-workspace/model/types"
import { getBuddyPersona } from "../personas/wiring/persona.orchestration"
import { buildLearningSystemPrompt } from "./learning-prompt"
import { normalizePromptParts } from "./workspace-file-references"
import type { SystemPromptCtx } from "./prompt-context"
import { LearnerSnapshotCompiler } from "../learner-model/projections/snapshot"
import { listRegisteredResources } from "../../resources/resource-registry-service"
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
import { resolveResourcePackFullTextMetadata } from "../../resource-packs"

export type MessagePromptPipelineContext = {
  directory: string
  sessionID: string
}

export type MessagePromptPipelineResult = {
  transformed: Record<string, unknown>
  runtimeProfileForPermissions?: ReturnType<typeof resolveCapabilityProfile>
  nextTeachingState?: TeachingSessionState
}

type ActiveReadingContext = {
  resourceKey?: string
  title: string
  path: string
  locationLabel?: string
  tocLabel?: string
  pageLabel?: string
}

async function resolvePromptModelInfo(input: {
  body: Record<string, unknown>
  projectConfig: Awaited<ReturnType<typeof readProjectConfig>>
}): Promise<SystemPromptCtx["model"] | undefined> {
  const explicitModel = hasExplicitModel(input.body.model) ? input.body.model : undefined
  const configuredModel = parseConfiguredModel(input.projectConfig.model)
  const modelRef = explicitModel ?? configuredModel
  if (!modelRef) return undefined

  const resolvedModel = await Provider.getModel(
    ProviderID.make(modelRef.providerID),
    ModelID.make(modelRef.modelID),
  ).catch(() => undefined)
  if (!resolvedModel) return undefined

  return {
    providerID: resolvedModel.providerID,
    modelID: resolvedModel.id,
    contextWindow: resolvedModel.limit.context,
    ...(resolvedModel.limit.input !== undefined ? { inputWindow: resolvedModel.limit.input } : {}),
    outputWindow: resolvedModel.limit.output,
  }
}

async function resolvePromptResourceMetadata(input: {
  directory: string
  packKey?: string
}): Promise<
  Pick<SystemPromptCtx["resources"][number], "fullTextPath" | "fullTextEstTokens" | "fullTextChars">
> {
  const metadata = await resolveResourcePackFullTextMetadata(input)
  if (!metadata) return {}
  return {
    fullTextPath: metadata.fullTextPath,
    fullTextEstTokens: metadata.fullTextEstTokens,
    fullTextChars: metadata.fullTextChars,
  }
}

function parseActiveReadingContext(value: unknown): ActiveReadingContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const title = typeof record.title === "string" ? record.title.trim() : ""
  const path = typeof record.path === "string" ? record.path.trim() : ""
  if (!title || !path) return undefined

  return {
    ...(typeof record.resourceKey === "string" && record.resourceKey.trim()
      ? { resourceKey: record.resourceKey.trim() }
      : {}),
    title,
    path,
    ...(typeof record.locationLabel === "string" && record.locationLabel.trim()
      ? { locationLabel: record.locationLabel.trim() }
      : {}),
    ...(typeof record.tocLabel === "string" && record.tocLabel.trim()
      ? { tocLabel: record.tocLabel.trim() }
      : {}),
    ...(typeof record.pageLabel === "string" && record.pageLabel.trim()
      ? { pageLabel: record.pageLabel.trim() }
      : {}),
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
  const parts = await normalizePromptParts({
    directory: input.context.directory,
    content,
    parts: Array.isArray(input.body.parts) ? [...input.body.parts] : [],
  })

  const teachingContextResult = TeachingPromptContextSchema.safeParse(input.body.teaching)
  const teachingContext = teachingContextResult.success ? teachingContextResult.data : undefined
  const activeReadingContext = parseActiveReadingContext(input.body.reading)
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
    const learnerSnapshot = await LearnerSnapshotCompiler.compile({
      directory: input.context.directory,
      query: {
        persona: persona.id,
        intent: intent,
        focusGoalIds,
        workspaceState,
      },
    })
    const resources = await listRegisteredResources(input.context.directory).catch(() => [])
    const runtimeProfile = resolveCapabilityProfile({
      persona,
      workspaceState,
      intent,
      configuredToolToggles: input.projectConfig.tools,
    })
    runtimeProfileForPermissions = runtimeProfile

    const [promptModel, promptResources] = await Promise.all([
      resolvePromptModelInfo({
        body: input.body,
        projectConfig: input.projectConfig,
      }),
      Promise.all(
        resources.map(async (resource) => {
          const metadata = await resolvePromptResourceMetadata({
            directory: input.context.directory,
            packKey: resource.packKey,
          })

          return {
            id: resource.id,
            alias: resource.alias,
            sourceRelpath: resource.sourceRelpath,
            format: resource.format,
            status: resource.status,
            warnings: resource.warnings,
            fullTextPath: metadata.fullTextPath,
            fullTextEstTokens: metadata.fullTextEstTokens,
            fullTextChars: metadata.fullTextChars,
          }
        }),
      ),
    ])

    const activeResource =
      activeReadingContext &&
      (() => {
        const matched = activeReadingContext.resourceKey
          ? resources.find(
              (resource) =>
                resource.id === activeReadingContext.resourceKey ||
                resource.alias === activeReadingContext.resourceKey,
            )
          : undefined

        return {
          ...(matched ? { id: matched.id, alias: matched.alias, status: matched.status } : {}),
          title: activeReadingContext.title,
          path: activeReadingContext.path,
          ...(activeReadingContext.locationLabel
            ? { locationLabel: activeReadingContext.locationLabel }
            : {}),
          ...(activeReadingContext.tocLabel ? { tocLabel: activeReadingContext.tocLabel } : {}),
          ...(activeReadingContext.pageLabel ? { pageLabel: activeReadingContext.pageLabel } : {}),
        }
      })()

    const promptBuildContext: SystemPromptCtx = {
      directory: input.context.directory,
      persona: runtimeProfile.persona,
      capabilityEnvelope: runtimeProfile.capabilityEnvelope,
      intent: intent,
      learnerSnapshot: learnerSnapshot,
      focusGoalIds,
      resources: promptResources,
      ...(activeResource ? { activeResource } : {}),
      ...(promptModel ? { model: promptModel } : {}),
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
