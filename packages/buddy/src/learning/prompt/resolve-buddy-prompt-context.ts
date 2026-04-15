import { parseConfiguredModel, type readProjectConfig } from "@buddy/backend/config/runtime"
import { ModelID, ProviderID } from "@buddy/opencode-adapter/id"
import { Provider } from "@buddy/opencode-adapter/provider"
import type { TeachingPromptContext } from "../capabilities/lesson-workspace/model/types"
import { TeachingPromptContextSchema } from "../capabilities/lesson-workspace/model/types"
import { LearnerSnapshotCompiler } from "../learner-model/projections/snapshot"
import { getBuddyPersona } from "../personas/wiring/persona.orchestration"
import { resolveCapabilityProfile } from "../resolve-capability-profile"
import type { TeachingSessionState } from "../shared/teaching-session-state"
import {
  hasExplicitModel,
  resolveCurrentSurface,
  resolveFocusGoalIds,
  resolveIntent,
} from "../shared/targeting"
import type { WorkspaceState } from "@buddy/backend/learning/shared/teaching-vocabulary"
import { listRegisteredResources } from "../../resources/resource-registry-service"
import { resolveResourcePackFullTextMetadata } from "../../resource-packs"
import type {
  ActivePromptResourceSnapshot,
  BuddyPromptBuildContext,
  PromptResourceSnapshot,
} from "./contracts"

type MessagePromptProjectConfig = Awaited<ReturnType<typeof readProjectConfig>>

type ActiveReadingContext = {
  resourceKey?: string
  title: string
  path: string
  locationLabel?: string
  tocLabel?: string
  pageLabel?: string
}

export type ResolvedBuddyPromptContext = {
  promptBuildContext: BuddyPromptBuildContext
  runtimeProfileForPermissions: ReturnType<typeof resolveCapabilityProfile>
  nextTeachingState: TeachingSessionState
}

function resolveTeachingContext(body: Record<string, unknown>): TeachingPromptContext | undefined {
  const result = TeachingPromptContextSchema.safeParse(body.teaching)
  return result.success ? result.data : undefined
}

function readTrimmedStringField(value: object, key: string): string | undefined {
  const candidate = Reflect.get(value, key)
  if (typeof candidate !== "string") return undefined
  const trimmed = candidate.trim()
  return trimmed ? trimmed : undefined
}

async function resolvePromptModelSnapshot(input: {
  body: Record<string, unknown>
  projectConfig: MessagePromptProjectConfig
}): Promise<BuddyPromptBuildContext["model"] | undefined> {
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

async function resolvePromptResourceSnapshot(input: {
  directory: string
  resource: {
    id: string
    alias: string
    sourceRelpath: string
    format: string
    status: PromptResourceSnapshot["status"]
    warnings: string[]
    packKey?: string
  }
}): Promise<PromptResourceSnapshot> {
  const metadata = await resolveResourcePackFullTextMetadata({
    directory: input.directory,
    packKey: input.resource.packKey,
  })

  return {
    id: input.resource.id,
    alias: input.resource.alias,
    sourceRelpath: input.resource.sourceRelpath,
    format: input.resource.format,
    status: input.resource.status,
    warnings: input.resource.warnings,
    ...(metadata?.fullTextPath ? { fullTextPath: metadata.fullTextPath } : {}),
    ...(metadata?.fullTextEstTokens !== undefined
      ? { fullTextEstTokens: metadata.fullTextEstTokens }
      : {}),
    ...(metadata?.fullTextChars !== undefined ? { fullTextChars: metadata.fullTextChars } : {}),
  }
}

function parseActiveReadingContext(value: unknown): ActiveReadingContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const title = readTrimmedStringField(value, "title") ?? ""
  const path = readTrimmedStringField(value, "path") ?? ""
  const resourceKey = readTrimmedStringField(value, "resourceKey")
  const locationLabel = readTrimmedStringField(value, "locationLabel")
  const tocLabel = readTrimmedStringField(value, "tocLabel")
  const pageLabel = readTrimmedStringField(value, "pageLabel")
  if (!title || !path) return undefined

  return {
    ...(resourceKey ? { resourceKey } : {}),
    title,
    path,
    ...(locationLabel ? { locationLabel } : {}),
    ...(tocLabel ? { tocLabel } : {}),
    ...(pageLabel ? { pageLabel } : {}),
  }
}

function buildActiveResourceSnapshot(input: {
  activeReadingContext?: ActiveReadingContext
  resources: PromptResourceSnapshot[]
}): ActivePromptResourceSnapshot | undefined {
  const activeReadingContext = input.activeReadingContext
  if (!activeReadingContext) return undefined

  const matchedResource = activeReadingContext.resourceKey
    ? input.resources.find(
        (resource) =>
          resource.id === activeReadingContext.resourceKey ||
          resource.alias === activeReadingContext.resourceKey,
      )
    : undefined

  return {
    ...(matchedResource
      ? {
          id: matchedResource.id,
          alias: matchedResource.alias,
          status: matchedResource.status,
        }
      : {}),
    title: activeReadingContext.title,
    path: activeReadingContext.path,
    ...(activeReadingContext.locationLabel
      ? { locationLabel: activeReadingContext.locationLabel }
      : {}),
    ...(activeReadingContext.tocLabel ? { tocLabel: activeReadingContext.tocLabel } : {}),
    ...(activeReadingContext.pageLabel ? { pageLabel: activeReadingContext.pageLabel } : {}),
  }
}

export async function resolveBuddyPromptContext(input: {
  directory: string
  sessionID: string
  body: Record<string, unknown>
  projectConfig: MessagePromptProjectConfig
  previousState?: TeachingSessionState
  personaID: BuddyPromptBuildContext["persona"]
}): Promise<ResolvedBuddyPromptContext> {
  const teachingContext = resolveTeachingContext(input.body)
  const activeReadingContext = parseActiveReadingContext(input.body.reading)
  const persona = getBuddyPersona(input.personaID, input.projectConfig.personas)
  const intent = resolveIntent({
    body: input.body,
    config: input.projectConfig,
  })
  const focusGoalIds = resolveFocusGoalIds(input.body)
  const workspaceState: WorkspaceState = teachingContext?.active ? "interactive" : "chat"
  const learnerSnapshot = await LearnerSnapshotCompiler.compile({
    directory: input.directory,
    query: {
      persona: persona.id,
      intent,
      focusGoalIds,
      workspaceState,
    },
  })
  const resources = await listRegisteredResources(input.directory).catch(() => [])
  const runtimeProfile = resolveCapabilityProfile({
    persona,
    workspaceState,
    intent,
    configuredToolToggles: input.projectConfig.tools,
  })

  const [promptModel, promptResources] = await Promise.all([
    resolvePromptModelSnapshot({
      body: input.body,
      projectConfig: input.projectConfig,
    }),
    Promise.all(
      resources.map((resource) =>
        resolvePromptResourceSnapshot({
          directory: input.directory,
          resource,
        }),
      ),
    ),
  ])
  const activeResource = buildActiveResourceSnapshot({
    activeReadingContext,
    resources: promptResources,
  })

  const promptBuildContext: BuddyPromptBuildContext = {
    directory: input.directory,
    persona: runtimeProfile.persona,
    capabilityEnvelope: runtimeProfile.capabilityEnvelope,
    intent,
    learnerSnapshot,
    focusGoalIds,
    resources: promptResources,
    ...(promptModel ? { model: promptModel } : {}),
    ...(teachingContext ? { teachingContext } : {}),
    ...(activeResource ? { activeResource } : {}),
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

  return {
    promptBuildContext,
    runtimeProfileForPermissions: runtimeProfile,
    nextTeachingState: {
      sessionId: input.sessionID,
      persona: persona.id,
      intent,
      currentSurface: resolveCurrentSurface({
        personaID: persona.id,
        config: input.projectConfig,
        workspaceState,
      }),
      workspaceState,
      focusGoalIds,
    },
  }
}
