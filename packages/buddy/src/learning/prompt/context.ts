import path from "node:path"
import { parseConfiguredModel, type readProjectConfig } from "@buddy/backend/config/runtime"
import {
  READER_ANCHOR_KIND_CFI_POSITION,
  readReaderLocation,
  type ReaderLocation,
  type ReaderTrailEntry,
} from "@buddy/reader-contract"
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
import type { PrimaryUse } from "../shared/teaching-vocabulary"
import {
  buildLearnerContextView,
  type LearnerContextItem,
} from "../shared/learner-context-delivery"
import {
  BenchContextSnapshotMissingError,
  readBenchContext,
  type BenchReadContextOutput,
} from "../features/bench/context"
import type { TeachingSessionState } from "../shared/teaching-session-state"
import { hasExplicitModel, resolveCurrentSurface, resolveFocusGoalIds } from "../shared/targeting"
import type {
  Persona,
  TeachingWorkspaceState,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import { listRegisteredResources } from "../../resources/resource-registry-service"
import { IMAGE_EDIT_TARGET_MAX, type ImageEditIntent } from "../features/image-generation/contracts"
import type { NativeResourcePromptAttachment } from "./native-resource-attachments"
import {
  parseJsonArray,
  parseJsonObject,
  parseNonEmptyPromptString,
  parsePromptBoolean,
  parsePromptFiniteNumber,
  parsePromptStringList,
  type TJsonObject,
  type TJsonValue,
  type TMessagePromptBody,
} from "./utils"

type MessagePromptProjectConfig = Awaited<ReturnType<typeof readProjectConfig>>

type ActiveReadingContext = {
  resourceKey?: string
  title: string
  path: string
  location?: ReaderLocation
  currentPassageText?: string
  visibleStartText?: string
  visibleEndText?: string
  readingTrail?: ReaderTrailEntry[]
  annotationSummary?: ActiveAnnotationSummaryEntry[]
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
  objectID: string
  name: string
  alias: string
  managedSource: string
  format: string
  status: PromptResourceStatus
  warnings: string[]
  benchReaderRelpath?: string
  packPath?: string
  fullTextPath?: string
  fullTextEstimatedTokens?: number
  fullTextChars?: number
}

export type ActivePromptResource = {
  objectID?: string
  alias?: string
  title: string
  path: string
  status?: PromptResourceStatus
  location?: ReaderLocation
  currentPassageText?: string
  visibleStartText?: string
  visibleEndText?: string
  readingTrail?: ReaderTrailEntry[]
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
  primaryUse?: PrimaryUse
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
  priorDeliveredBenchTurnContextDigest?: string
  priorDeliveredTeachingTurnContextDigest?: string
  focusGoalIds: string[]
  resources: PromptResource[]
  activeResource?: ActivePromptResource
  benchContext?: BenchReadContextOutput
  model?: PromptModel
  personalization?: PromptPersonalization
  teachingContext?: TeachingPromptContext
  imageEditIntent?: ImageEditIntent
  nativeResourceAttachments?: NativeResourcePromptAttachment[]
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
  body: TMessagePromptBody
  projectConfig: MessagePromptProjectConfig
  previousState?: TeachingSessionState
  personaID: Persona
  nativeResourceAttachments: NativeResourcePromptAttachment[]
}

function resolveTeachingContext(body: TMessagePromptBody): TeachingPromptContext | undefined {
  const result = TeachingPromptContextSchema.safeParse(body.teaching)
  return result.success ? result.data : undefined
}

function resolveImageEditIntent(body: TMessagePromptBody): ImageEditIntent | undefined {
  const value = parseJsonObject(body.imageEdit)
  if (value === undefined) return undefined
  const targetPaths = parsePromptStringList(value.targetPaths)
  if (targetPaths === undefined) return undefined

  const trimmedTargetPaths = targetPaths
    .flatMap((targetPath) => {
      const trimmed = targetPath.trim()
      return trimmed ? [trimmed] : []
    })
    .slice(0, IMAGE_EDIT_TARGET_MAX)

  return trimmedTargetPaths.length > 0 ? { targetPaths: trimmedTargetPaths } : undefined
}

const MAX_PASSAGE_TEXT_CHARS = 1200
const MAX_START_END_TEXT_CHARS = 200

function boundText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars)
}

function readTrimmedStringField(value: TJsonObject, key: string): string | undefined {
  return parseNonEmptyPromptString(value[key])
}

function readBoundedStringField(value: TJsonObject, key: string, maxChars: number): string | undefined {
  const trimmed = readTrimmedStringField(value, key)
  if (!trimmed) return undefined
  return boundText(trimmed, maxChars)
}

function readFiniteNumberField(value: TJsonObject, key: string): number | undefined {
  return parsePromptFiniteNumber(value[key])
}

function readLegacyReaderLocation(value: TJsonObject): ReaderLocation | undefined {
  const cfi = readTrimmedStringField(value, "cfi")
  if (!cfi) return undefined
  const sectionIndex = readFiniteNumberField(value, "index")
  const fraction = readFiniteNumberField(value, "fraction")
  const tocLabel = readTrimmedStringField(value, "tocLabel")
  const pageLabel = readTrimmedStringField(value, "pageLabel")
  const locationLabel = readTrimmedStringField(value, "locationLabel")

  return readReaderLocation(
    Object.assign(
      Object.assign(
        {
          anchor: Object.assign(
            {
              kind: READER_ANCHOR_KIND_CFI_POSITION,
              cfi,
            },
            sectionIndex !== undefined ? { sectionIndex } : undefined,
          ),
        },
        fraction !== undefined ? { fraction } : undefined,
        tocLabel ? { tocLabel } : undefined,
        pageLabel ? { pageLabel } : undefined,
      ),
      locationLabel ? { locationLabel } : undefined,
    ),
  )
}

function readActiveReaderLocation(value: TJsonObject): ReaderLocation | undefined {
  if (value.location !== undefined) return readReaderLocation(value.location)
  return readLegacyReaderLocation(value)
}

function readReadingTrail(value: TJsonValue | undefined): ReaderTrailEntry[] | undefined {
  const entriesValue = parseJsonArray(value)
  if (entriesValue === undefined) return undefined
  const entries = entriesValue.flatMap((entry) => {
    const object = parseJsonObject(entry)
    if (object === undefined) return []
    const label = readTrimmedStringField(object, "label") ?? readTrimmedStringField(object, "tocLabel")
    if (!label) return []
    const fraction = readFiniteNumberField(object, "fraction")
    const location =
      object.anchor !== undefined
        ? readReaderLocation(
            Object.assign(
              { anchor: object.anchor },
              fraction !== undefined ? { fraction } : undefined,
            ),
          )
        : readLegacyReaderLocation(object)
    if (!location) return []
    return [
      Object.assign(
        {
          label,
          anchor: location.anchor,
        },
        location.fraction !== undefined ? { fraction: location.fraction } : undefined,
      ),
    ]
  })
  return entries.length > 0 ? entries : undefined
}

function resolvePromptPersonalization(
  projectConfig: MessagePromptProjectConfig,
): PromptPersonalization | undefined {
  const personalization = projectConfig.personalization
  if (!personalization) return undefined

  const primaryUse = personalization.primary_use
  const preferredName = personalization.preferred_name?.trim() || undefined
  const occupation = personalization.occupation?.trim() || undefined
  const moreAboutYou = personalization.more_about_you?.trim() || undefined

  if (!primaryUse && !preferredName && !occupation && !moreAboutYou) {
    return undefined
  }

  return Object.assign(
    Object.assign(
      {},
      primaryUse ? { primaryUse } : undefined,
      preferredName ? { preferredName } : undefined,
      occupation ? { occupation } : undefined,
    ),
    moreAboutYou ? { moreAboutYou } : undefined,
  )
}

async function resolvePromptModel(input: {
  body: TMessagePromptBody
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

  return Object.assign(
    {
      providerID: resolvedModel.providerID,
      modelID: resolvedModel.id,
      contextWindow: resolvedModel.limit.context,
    },
    resolvedModel.limit.input !== undefined ? { inputWindow: resolvedModel.limit.input } : undefined,
    { outputWindow: resolvedModel.limit.output },
    image ? { image } : undefined,
  )
}

function readPromptModelRuntimeSnapshot(
  value: TJsonValue | undefined,
): PromptModelRuntimeSnapshot | undefined {
  const record = parseJsonObject(value)
  if (record === undefined) return undefined

  const providerID = parseNonEmptyPromptString(record.providerID)
  const modelID = parseNonEmptyPromptString(record.modelID)
  const contextWindow = parsePromptFiniteNumber(record.contextWindow)
  const outputWindow = parsePromptFiniteNumber(record.outputWindow)
  const inputWindow = parsePromptFiniteNumber(record.inputWindow)
  const image = parsePromptBoolean(record.image)

  if (!providerID || !modelID || contextWindow === undefined || outputWindow === undefined) {
    return undefined
  }

  return Object.assign(
    {
      providerID,
      modelID,
      contextWindow,
    },
    inputWindow !== undefined ? { inputWindow } : undefined,
    image ? { image } : undefined,
    { outputWindow },
  )
}

async function resolvePromptResource(input: {
  directory: string
  resource: {
    objectID: string
    alias: string
    sourceRelpath: string
    sourceOriginRelpath?: string
    format: string
    status: PromptResourceStatus
    warnings: string[]
    title?: string
    packPath?: string
    fullTextPath?: string
    fullTextEstimatedTokens?: number
    fullTextCharacters?: number
    readerPath?: string
  }
}): Promise<PromptResource> {
  return Object.assign(
    Object.assign(
      {
        objectID: input.resource.objectID,
        name: resolvePromptResourceName(input.resource),
        alias: input.resource.alias,
        managedSource: input.resource.sourceRelpath,
        format: input.resource.format,
        status: input.resource.status,
        warnings: input.resource.warnings,
      },
      input.resource.readerPath ? { benchReaderRelpath: input.resource.readerPath } : undefined,
      input.resource.packPath ? { packPath: input.resource.packPath } : undefined,
      input.resource.fullTextPath ? { fullTextPath: input.resource.fullTextPath } : undefined,
    ),
    input.resource.fullTextEstimatedTokens !== undefined
      ? { fullTextEstimatedTokens: input.resource.fullTextEstimatedTokens }
      : undefined,
    input.resource.fullTextCharacters !== undefined
      ? { fullTextChars: input.resource.fullTextCharacters }
      : undefined,
  )
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

function parseActiveReadingContext(
  value: TJsonValue | undefined,
): ActiveReadingContext | undefined {
  const object = parseJsonObject(value)
  if (object === undefined) return undefined

  const title = readTrimmedStringField(object, "title") ?? ""
  const path = readTrimmedStringField(object, "path") ?? ""
  const resourceKey = readTrimmedStringField(object, "resourceKey")
  const location = readActiveReaderLocation(object)
  const currentPassageText = readBoundedStringField(
    object,
    "currentPassageText",
    MAX_PASSAGE_TEXT_CHARS,
  )
  const visibleStartText = readBoundedStringField(
    object,
    "visibleStartText",
    MAX_START_END_TEXT_CHARS,
  )
  const visibleEndText = readBoundedStringField(object, "visibleEndText", MAX_START_END_TEXT_CHARS)
  const readingTrail = readReadingTrail(object.readingTrail)
  const annotationSummary = readAnnotationSummary(object.annotationSummary)
  if (!title || !path) return undefined

  return Object.assign(
    Object.assign(
      Object.assign({ title, path }, resourceKey ? { resourceKey } : undefined),
      location ? { location } : undefined,
      currentPassageText ? { currentPassageText } : undefined,
      visibleStartText ? { visibleStartText } : undefined,
    ),
    visibleEndText ? { visibleEndText } : undefined,
    readingTrail ? { readingTrail } : undefined,
    annotationSummary ? { annotationSummary } : undefined,
  )
}

function readAnnotationSummary(
  value: TJsonValue | undefined,
): ActiveAnnotationSummaryEntry[] | undefined {
  const entriesValue = parseJsonArray(value)
  if (entriesValue === undefined) return undefined
  const entries = entriesValue.flatMap((entry) => {
    const object = parseJsonObject(entry)
    if (object === undefined) return []
    const text = readTrimmedStringField(object, "text")
    if (!text) return []
    const tocLabel = readTrimmedStringField(object, "tocLabel")
    const note = readTrimmedStringField(object, "note")
    return [Object.assign({ text }, tocLabel ? { tocLabel } : undefined, note ? { note } : undefined)]
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
          resource.objectID === activeReadingContext.resourceKey ||
          resource.alias === activeReadingContext.resourceKey,
      )
    : undefined

  return Object.assign(
    Object.assign(
      Object.assign(
        {},
        matchedResource
          ? {
              objectID: matchedResource.objectID,
              alias: matchedResource.alias,
              status: matchedResource.status,
            }
          : undefined,
        {
          title: activeReadingContext.title,
          path: activeReadingContext.path,
        },
        activeReadingContext.location ? { location: activeReadingContext.location } : undefined,
      ),
      activeReadingContext.currentPassageText
        ? { currentPassageText: activeReadingContext.currentPassageText }
        : undefined,
      activeReadingContext.visibleStartText
        ? { visibleStartText: activeReadingContext.visibleStartText }
        : undefined,
      activeReadingContext.visibleEndText
        ? { visibleEndText: activeReadingContext.visibleEndText }
        : undefined,
    ),
    activeReadingContext.readingTrail
      ? { readingTrail: activeReadingContext.readingTrail }
      : undefined,
    activeReadingContext.annotationSummary
      ? { annotationSummary: activeReadingContext.annotationSummary }
      : undefined,
  )
}

function readSynchronizedBenchContext(input: {
  directory: string
  sessionID: string
}): BenchReadContextOutput | undefined {
  try {
    return readBenchContext(input).value
  } catch (error) {
    if (error instanceof BenchContextSnapshotMissingError) {
      return undefined
    }
    throw error
  }
}

async function buildPromptContext(
  input: CreatePromptContextInput,
): Promise<CreatePromptContextResult> {
  const teachingContext = resolveTeachingContext(input.body)
  const imageEditIntent = resolveImageEditIntent(input.body)
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
    config: input.projectConfig,
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
  const benchContext = readSynchronizedBenchContext({
    directory: input.directory,
    sessionID: input.sessionID,
  })

  const context: PromptContext = {
    directory: input.directory,
    sessionID: input.sessionID,
    persona: sessionRuntime.persona,
    sessionRuntime,
    visibleSurfaces: sessionRuntime.ui.visibleSurfaces,
    teachingWorkspaceState,
    learnerSnapshot,
    learnerContextDigest,
    focusGoalIds,
    resources: promptResources,
  }
  Object.assign(
    context,
    input.previousState?.lastDeliveredLearnerContextDigest
      ? {
          priorLearnerContextDigest: input.previousState.lastDeliveredLearnerContextDigest,
        }
      : undefined,
    input.previousState?.lastDeliveredLearnerContextItems
      ? { priorLearnerContextItems: input.previousState.lastDeliveredLearnerContextItems }
      : undefined,
    input.previousState?.lastDeliveredReadingTurnContextDigest
      ? {
          priorDeliveredReadingTurnContextDigest:
            input.previousState.lastDeliveredReadingTurnContextDigest,
        }
      : undefined,
  )
  Object.assign(
    context,
    input.previousState?.lastDeliveredBenchTurnContextDigest
      ? {
          priorDeliveredBenchTurnContextDigest:
            input.previousState.lastDeliveredBenchTurnContextDigest,
        }
      : undefined,
    input.previousState?.lastDeliveredTeachingTurnContextDigest
      ? {
          priorDeliveredTeachingTurnContextDigest:
            input.previousState.lastDeliveredTeachingTurnContextDigest,
        }
      : undefined,
    model ? { model } : undefined,
  )
  Object.assign(
    context,
    personalization ? { personalization } : undefined,
    teachingContext ? { teachingContext } : undefined,
    imageEditIntent ? { imageEditIntent } : undefined,
  )
  Object.assign(
    context,
    input.nativeResourceAttachments.length > 0
      ? { nativeResourceAttachments: input.nativeResourceAttachments }
      : undefined,
    activeResource ? { activeResource } : undefined,
    benchContext ? { benchContext } : undefined,
  )
  Object.assign(
    context,
    input.previousState
      ? {
          priorTurn: {
            persona: input.previousState.persona,
            teachingWorkspaceState: input.previousState.teachingWorkspaceState,
          } satisfies PromptTurnSnapshot,
        }
      : undefined,
  )

  return {
    context,
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
