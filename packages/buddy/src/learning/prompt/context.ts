import path from "node:path"
import { parseConfiguredModel, type readProjectConfig } from "@buddy/backend/config/runtime"
import { ModelID, ProviderID } from "@buddy/opencode-adapter/id"
import { Provider } from "@buddy/opencode-adapter/provider"
import type { TeachingPromptContext } from "../features/lesson-workspace/model/types"
import { TeachingPromptContextSchema } from "../features/lesson-workspace/model/types"
import { resolveSessionRuntime } from "../access/resolve-session-runtime"
import type { ResolvedSessionRuntime } from "../access/types"
import {
  buildLearnerRuntimeSnapshot,
  type LearnerRuntimeSnapshot,
} from "../features/memory/runtime/snapshot"
import { getBuddyPersona } from "../personas/wiring/persona-profiles"
import { REGISTERED_BUDDY_PERSONAS } from "../personas/registry"
import {
  buildLearnerContextView,
  type LearnerContextItem,
} from "../shared/learner-context-delivery"
import type { TeachingSessionState } from "../shared/teaching-session-state"
import { hasExplicitModel, resolveCurrentSurface, resolveFocusGoalIds } from "../shared/targeting"
import type {
  Persona,
  TeachingWorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import { listRegisteredResources } from "../../resources/resource-registry-service"
import { resolveResourcePackFullTextMetadata } from "../../resource-packs"

type MessagePromptProjectConfig = Awaited<ReturnType<typeof readProjectConfig>>

type ActiveReadingContext = {
  resourceKey?: string
  title: string
  path: string
  cfi?: string
  index?: number
  fraction?: number
  locationLabel?: string
  tocLabel?: string
  pageLabel?: string
  currentPassageText?: string
  visibleStartText?: string
  visibleEndText?: string
  readingTrail?: ActiveReadingTrailEntry[]
  annotationSummary?: ActiveAnnotationSummaryEntry[]
}

type ActiveReadingTrailEntry = {
  tocLabel: string
  cfi?: string
  fraction?: number
}

type ActiveAnnotationSummaryEntry = {
  text: string
  tocLabel?: string
  note?: string
}

export type PromptResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

export type PromptTurnSnapshot = {
  persona: Persona
  teachingWorkspaceState: TeachingWorkspaceState
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
  cfi?: string
  index?: number
  fraction?: number
  locationLabel?: string
  tocLabel?: string
  pageLabel?: string
  currentPassageText?: string
  visibleStartText?: string
  visibleEndText?: string
  readingTrail?: ActiveReadingTrailEntry[]
  annotationSummary?: ActiveAnnotationSummaryEntry[]
}

export type PromptModel = {
  providerID: string
  modelID: string
  contextWindow: number
  inputWindow?: number
  outputWindow: number
  image?: boolean
}

export type PromptPersonalization = {
  preferredName?: string
  occupation?: string
  moreAboutYou?: string
}

type PromptModelRuntimeSnapshot = PromptModel

export type PromptContext = {
  directory: string
  sessionID: string
  persona: Persona
  sessionRuntime: ResolvedSessionRuntime
  visibleSurfaces: ResolvedSessionRuntime["ui"]["visibleSurfaces"]
  teachingWorkspaceState: TeachingWorkspaceState
  learnerSnapshot: LearnerRuntimeSnapshot
  learnerContextDigest?: string
  priorLearnerContextDigest?: string
  priorLearnerContextItems?: LearnerContextItem[]
  priorDeliveredReadingTurnContextDigest?: string
  priorDeliveredTeachingTurnContextDigest?: string
  focusGoalIds: string[]
  resources: PromptResource[]
  activeResource?: ActivePromptResource
  model?: PromptModel
  personalization?: PromptPersonalization
  teachingContext?: TeachingPromptContext
  priorTurn?: PromptTurnSnapshot
}

export type CreatePromptContextResult = {
  context: PromptContext
  sessionRuntimeForPermissions: ResolvedSessionRuntime
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

const MAX_PASSAGE_TEXT_CHARS = 1200
const MAX_START_END_TEXT_CHARS = 200

function boundText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars)
}

function readTrimmedStringField(value: object, key: string): string | undefined {
  const candidate = Reflect.get(value, key)
  if (typeof candidate !== "string") return undefined
  const trimmed = candidate.trim()
  return trimmed ? trimmed : undefined
}

function readBoundedStringField(value: object, key: string, maxChars: number): string | undefined {
  const trimmed = readTrimmedStringField(value, key)
  if (!trimmed) return undefined
  return boundText(trimmed, maxChars)
}

function readFiniteNumberField(value: object, key: string): number | undefined {
  const candidate = Reflect.get(value, key)
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined
}

function readReadingTrail(value: unknown): ActiveReadingTrailEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const tocLabel = readTrimmedStringField(entry, "tocLabel")
    if (!tocLabel) return []
    const cfi = readTrimmedStringField(entry, "cfi")
    const fraction = readFiniteNumberField(entry, "fraction")
    return [
      {
        tocLabel,
        ...(cfi ? { cfi } : {}),
        ...(fraction !== undefined ? { fraction } : {}),
      },
    ]
  })
  return entries.length > 0 ? entries : undefined
}

function resolvePromptPersonalization(
  projectConfig: MessagePromptProjectConfig,
): PromptPersonalization | undefined {
  const personalization = projectConfig.personalization
  if (!personalization) return undefined

  const preferredName = personalization.preferred_name?.trim() || undefined
  const occupation = personalization.occupation?.trim() || undefined
  const moreAboutYou = personalization.more_about_you?.trim() || undefined

  if (!preferredName && !occupation && !moreAboutYou) {
    return undefined
  }

  return {
    ...(preferredName ? { preferredName } : {}),
    ...(occupation ? { occupation } : {}),
    ...(moreAboutYou ? { moreAboutYou } : {}),
  }
}

async function resolvePromptModel(input: {
  body: Record<string, unknown>
  projectConfig: MessagePromptProjectConfig
}) {
  const runtimeSnapshot = readPromptModelRuntimeSnapshot(input.body.modelRuntime)
  const explicitModel = hasExplicitModel(input.body.model) ? input.body.model : undefined
  const configuredModel = parseConfiguredModel(input.projectConfig.model)
  const modelRef = explicitModel ?? configuredModel
  if (!modelRef) return runtimeSnapshot

  const resolvedModel = await Provider.getModel(
    ProviderID.make(modelRef.providerID),
    ModelID.make(modelRef.modelID),
  ).catch(() => undefined)
  if (!resolvedModel) return runtimeSnapshot

  const image = resolvedModel.capabilities?.input?.image ?? false

  return {
    providerID: resolvedModel.providerID,
    modelID: resolvedModel.id,
    contextWindow: resolvedModel.limit.context,
    ...(resolvedModel.limit.input !== undefined ? { inputWindow: resolvedModel.limit.input } : {}),
    outputWindow: resolvedModel.limit.output,
    ...(image ? { image } : {}),
  }
}

function readPromptModelRuntimeSnapshot(value: unknown): PromptModelRuntimeSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined

  const record = value as Record<string, unknown>
  const providerID =
    typeof record.providerID === "string" && record.providerID.trim().length > 0
      ? record.providerID
      : undefined
  const modelID =
    typeof record.modelID === "string" && record.modelID.trim().length > 0
      ? record.modelID
      : undefined
  const contextWindow =
    typeof record.contextWindow === "number" && Number.isFinite(record.contextWindow)
      ? record.contextWindow
      : undefined
  const outputWindow =
    typeof record.outputWindow === "number" && Number.isFinite(record.outputWindow)
      ? record.outputWindow
      : undefined
  const inputWindow =
    typeof record.inputWindow === "number" && Number.isFinite(record.inputWindow)
      ? record.inputWindow
      : undefined
  const image = typeof record.image === "boolean" ? record.image : undefined

  if (!providerID || !modelID || contextWindow === undefined || outputWindow === undefined) {
    return undefined
  }

  return {
    providerID,
    modelID,
    contextWindow,
    ...(inputWindow !== undefined ? { inputWindow } : {}),
    ...(image ? { image } : {}),
    outputWindow,
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
  const cfi = readTrimmedStringField(value, "cfi")
  const index = readFiniteNumberField(value, "index")
  const fraction = readFiniteNumberField(value, "fraction")
  const locationLabel = readTrimmedStringField(value, "locationLabel")
  const tocLabel = readTrimmedStringField(value, "tocLabel")
  const pageLabel = readTrimmedStringField(value, "pageLabel")
  const currentPassageText = readBoundedStringField(
    value,
    "currentPassageText",
    MAX_PASSAGE_TEXT_CHARS,
  )
  const visibleStartText = readBoundedStringField(
    value,
    "visibleStartText",
    MAX_START_END_TEXT_CHARS,
  )
  const visibleEndText = readBoundedStringField(value, "visibleEndText", MAX_START_END_TEXT_CHARS)
  const readingTrail = readReadingTrail(Reflect.get(value, "readingTrail"))
  const annotationSummary = readAnnotationSummary(Reflect.get(value, "annotationSummary"))
  if (!title || !path) return undefined

  return {
    ...(resourceKey ? { resourceKey } : {}),
    title,
    path,
    ...(cfi ? { cfi } : {}),
    ...(index !== undefined ? { index } : {}),
    ...(fraction !== undefined ? { fraction } : {}),
    ...(locationLabel ? { locationLabel } : {}),
    ...(tocLabel ? { tocLabel } : {}),
    ...(pageLabel ? { pageLabel } : {}),
    ...(currentPassageText ? { currentPassageText } : {}),
    ...(visibleStartText ? { visibleStartText } : {}),
    ...(visibleEndText ? { visibleEndText } : {}),
    ...(readingTrail ? { readingTrail } : {}),
    ...(annotationSummary ? { annotationSummary } : {}),
  }
}

function readAnnotationSummary(value: unknown): ActiveAnnotationSummaryEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const text = readTrimmedStringField(entry, "text")
    if (!text) return []
    const tocLabel = readTrimmedStringField(entry, "tocLabel")
    const note = readTrimmedStringField(entry, "note")
    return [
      {
        text,
        ...(tocLabel ? { tocLabel } : {}),
        ...(note ? { note } : {}),
      },
    ]
  })
  return entries.length > 0 ? entries : undefined
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
    ...(activeReadingContext.cfi ? { cfi: activeReadingContext.cfi } : {}),
    ...(activeReadingContext.index !== undefined ? { index: activeReadingContext.index } : {}),
    ...(activeReadingContext.fraction !== undefined
      ? { fraction: activeReadingContext.fraction }
      : {}),
    ...(activeReadingContext.locationLabel
      ? { locationLabel: activeReadingContext.locationLabel }
      : {}),
    ...(activeReadingContext.tocLabel ? { tocLabel: activeReadingContext.tocLabel } : {}),
    ...(activeReadingContext.pageLabel ? { pageLabel: activeReadingContext.pageLabel } : {}),
    ...(activeReadingContext.currentPassageText
      ? { currentPassageText: activeReadingContext.currentPassageText }
      : {}),
    ...(activeReadingContext.visibleStartText
      ? { visibleStartText: activeReadingContext.visibleStartText }
      : {}),
    ...(activeReadingContext.visibleEndText
      ? { visibleEndText: activeReadingContext.visibleEndText }
      : {}),
    ...(activeReadingContext.readingTrail
      ? { readingTrail: activeReadingContext.readingTrail }
      : {}),
    ...(activeReadingContext.annotationSummary
      ? { annotationSummary: activeReadingContext.annotationSummary }
      : {}),
  }
}

async function buildPromptContext(
  input: CreatePromptContextInput,
): Promise<CreatePromptContextResult> {
  const teachingContext = resolveTeachingContext(input.body)
  const activeReadingContext = parseActiveReadingContext(input.body.reading)
  const personalization = resolvePromptPersonalization(input.projectConfig)
  const persona = getBuddyPersona(input.personaID, input.projectConfig.personas)
  const personaDefinition = REGISTERED_BUDDY_PERSONAS.find(
    (definition) => definition.id === input.personaID,
  )
  if (!personaDefinition) {
    throw new Error(`Unknown Buddy persona "${input.personaID}"`)
  }
  const focusGoalIds = resolveFocusGoalIds(input.body)
  const teachingWorkspaceState: TeachingWorkspaceState = teachingContext?.active
    ? "active"
    : "inactive"
  const learnerSnapshot = await buildLearnerRuntimeSnapshot(input.directory)
  const learnerContextView = buildLearnerContextView(learnerSnapshot)
  const learnerContextDigest = learnerContextView.fingerprint
  const resources = await listRegisteredResources(input.directory).catch(() => [])
  const sessionRuntime = resolveSessionRuntime({
    persona: {
      id: persona.id,
      features: personaDefinition.features,
      defaultSurface: persona.defaultSurface,
    },
    teachingWorkspaceState,
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
      persona: sessionRuntime.persona,
      sessionRuntime,
      visibleSurfaces: sessionRuntime.ui.visibleSurfaces,
      teachingWorkspaceState,
      learnerSnapshot,
      learnerContextDigest,
      ...(input.previousState?.lastDeliveredLearnerContextDigest
        ? {
            priorLearnerContextDigest: input.previousState.lastDeliveredLearnerContextDigest,
          }
        : {}),
      ...(input.previousState?.lastDeliveredLearnerContextItems
        ? { priorLearnerContextItems: input.previousState.lastDeliveredLearnerContextItems }
        : {}),
      ...(input.previousState?.lastDeliveredReadingTurnContextDigest
        ? {
            priorDeliveredReadingTurnContextDigest:
              input.previousState.lastDeliveredReadingTurnContextDigest,
          }
        : {}),
      ...(input.previousState?.lastDeliveredTeachingTurnContextDigest
        ? {
            priorDeliveredTeachingTurnContextDigest:
              input.previousState.lastDeliveredTeachingTurnContextDigest,
          }
        : {}),
      focusGoalIds,
      resources: promptResources,
      ...(model ? { model } : {}),
      ...(personalization ? { personalization } : {}),
      ...(teachingContext ? { teachingContext } : {}),
      ...(activeResource ? { activeResource } : {}),
      ...(input.previousState
        ? {
            priorTurn: {
              persona: input.previousState.persona,
              teachingWorkspaceState: input.previousState.teachingWorkspaceState,
            } satisfies PromptTurnSnapshot,
          }
        : {}),
    },
    sessionRuntimeForPermissions: sessionRuntime,
    nextTeachingState: {
      sessionId: input.sessionID,
      persona: persona.id,
      currentSurface: resolveCurrentSurface({
        personaID: persona.id,
        config: input.projectConfig,
        teachingWorkspaceState,
      }),
      teachingWorkspaceState,
      sessionRuntime,
      focusGoalIds,
      learnerContextDigest,
    } satisfies TeachingSessionState,
  }
}

export type PromptVisibleSurface = PromptContext["visibleSurfaces"][number]

export async function createPromptContext(input: CreatePromptContextInput) {
  return buildPromptContext(input)
}
