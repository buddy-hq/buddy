import path from "node:path"
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
import type {
  Intent,
  Persona,
  WorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import { listRegisteredResources } from "../../resources/resource-registry-service"
import { resolveResourcePackFullTextMetadata } from "../../resource-packs"

type MessagePromptProjectConfig = Awaited<ReturnType<typeof readProjectConfig>>

type ActiveReadingContext = {
  resourceKey?: string
  title: string
  path: string
  locationLabel?: string
  tocLabel?: string
  pageLabel?: string
}

export type PromptResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

export type PromptTurnSnapshot = {
  persona: Persona
  intent: Intent
  workspaceState: WorkspaceState
}

export type PromptResource = {
  id: string
  name: string
  alias: string
  sourceRelpath: string
  format: string
  status: PromptResourceStatus
  warnings: string[]
  fullTextPath?: string
  fullTextEstTokens?: number
  fullTextChars?: number
}

export type ActivePromptResource = {
  id?: string
  alias?: string
  title: string
  path: string
  status?: PromptResourceStatus
  locationLabel?: string
  tocLabel?: string
  pageLabel?: string
}

export type PromptModel = {
  providerID: string
  modelID: string
  contextWindow: number
  inputWindow?: number
  outputWindow: number
}

export type PromptContext = {
  directory: string
  sessionID: string
  persona: Persona
  capabilityEnvelope: ReturnType<typeof resolveCapabilityProfile>["capabilityEnvelope"]
  visibleSurfaces: ReturnType<
    typeof resolveCapabilityProfile
  >["capabilityEnvelope"]["visibleSurfaces"]
  intent: Intent
  workspaceState: WorkspaceState
  learnerSnapshot: Awaited<ReturnType<typeof LearnerSnapshotCompiler.compile>>
  focusGoalIds: string[]
  resources: PromptResource[]
  activeResource?: ActivePromptResource
  model?: PromptModel
  teachingContext?: TeachingPromptContext
  priorTurn?: PromptTurnSnapshot
}

export type CreatePromptContextResult = {
  context: PromptContext
  runtimeProfileForPermissions: ReturnType<typeof resolveCapabilityProfile>
  nextTeachingState: TeachingSessionState
}

type CreatePromptContextInput = {
  directory: string
  sessionID: string
  body: Record<string, unknown>
  projectConfig: MessagePromptProjectConfig
  previousState?: TeachingSessionState
  personaID: Persona
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

async function resolvePromptModel(input: {
  body: Record<string, unknown>
  projectConfig: MessagePromptProjectConfig
}) {
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

async function resolvePromptResource(input: {
  directory: string
  resource: {
    id: string
    alias: string
    sourceRelpath: string
    sourceOriginRelpath?: string
    format: string
    status: PromptResourceStatus
    warnings: string[]
    title?: string
    packKey?: string
  }
}): Promise<PromptResource> {
  const metadata = await resolveResourcePackFullTextMetadata({
    directory: input.directory,
    packKey: input.resource.packKey,
  })

  return {
    id: input.resource.id,
    name: resolvePromptResourceName(input.resource),
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

function resolvePromptResourceName(input: {
  alias: string
  sourceRelpath: string
  sourceOriginRelpath?: string
  title?: string
}) {
  const title = input.title?.trim()
  if (title) {
    return title
  }

  const displayPath =
    input.sourceOriginRelpath && input.sourceOriginRelpath.trim().length > 0
      ? input.sourceOriginRelpath
      : input.sourceRelpath
  const filename = path.basename(displayPath).trim()
  if (filename.length > 0) {
    return filename
  }

  return input.alias
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

function buildActiveResource(
  activeReadingContext: ActiveReadingContext | undefined,
  resources: PromptResource[],
): ActivePromptResource | undefined {
  if (!activeReadingContext) return undefined

  const matchedResource = activeReadingContext.resourceKey
    ? resources.find(
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

async function buildPromptContext(
  input: CreatePromptContextInput,
): Promise<CreatePromptContextResult> {
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

  const [model, promptResources] = await Promise.all([
    resolvePromptModel({
      body: input.body,
      projectConfig: input.projectConfig,
    }),
    Promise.all(
      resources.map((resource) =>
        resolvePromptResource({
          directory: input.directory,
          resource,
        }),
      ),
    ),
  ])
  const activeResource = buildActiveResource(activeReadingContext, promptResources)

  return {
    context: {
      directory: input.directory,
      sessionID: input.sessionID,
      persona: runtimeProfile.persona,
      capabilityEnvelope: runtimeProfile.capabilityEnvelope,
      visibleSurfaces: runtimeProfile.capabilityEnvelope.visibleSurfaces,
      intent,
      workspaceState,
      learnerSnapshot,
      focusGoalIds,
      resources: promptResources,
      ...(model ? { model } : {}),
      ...(teachingContext ? { teachingContext } : {}),
      ...(activeResource ? { activeResource } : {}),
      ...(input.previousState
        ? {
            priorTurn: {
              persona: input.previousState.persona,
              intent: input.previousState.intent,
              workspaceState: input.previousState.workspaceState,
            } satisfies PromptTurnSnapshot,
          }
        : {}),
    },
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
    } satisfies TeachingSessionState,
  }
}

export type PromptVisibleSurface = PromptContext["visibleSurfaces"][number]

export async function createPromptContext(input: CreatePromptContextInput) {
  return buildPromptContext(input)
}
