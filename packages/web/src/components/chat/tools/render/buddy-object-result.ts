import {
  defaultBenchObjectViewID,
  isBenchObjectKind,
  type BenchObjectKind,
  type BenchObjectRef,
  type BenchTarget,
} from "@/lib/bench-navigation"
import {
  isRecord,
  parseTBoolean,
  parseTNumber,
  parseTString,
  readNonEmptyString,
  type TJsonObject,
} from "../types"

type BuddyObjectResultStatus = "ok" | "blocked" | "error"
type BuddyObjectLifecycle = "revisioned" | "live" | "imported" | "external-reference"
type BuddyObjectStatus = "ready" | "preparing" | "stale" | "unsupported" | "error" | "unavailable"
type BuddyPresentationSurface = "inline" | "bench" | "library"
type BuddyInlineViewData =
  | HtmlWidgetInlineData
  | MediaGalleryInlineData
  | MermaidInlineData
  | FigureInlineData
  | QuestionSetInlineData
  | FlashcardDeckInlineData

type HtmlWidgetInlineData = {
  renderer: "html-widget"
  runtimeUrl: string
  sourceRoot: string
  entryPath: string
  sourceVersion: string | null
  viewportPreset: string
}

type MediaGalleryInlineData = {
  renderer: "media-gallery"
  layout: "single" | "grid" | "strip"
  items: Array<{
    itemID: string
    title: string | null
    mediaType: string
    mimeType: string | null
    source: {
      role: "original" | "authoring" | "payload" | "external"
      path: string
      displayPath?: string
      workspacePath?: string | null
      availability: "available" | "missing" | "error"
    }
    availability: "available" | "missing" | "error" | "unavailable"
    rawUrl: string | null
    fileName: string | null
  }>
}

type MermaidInlineData = {
  renderer: "mermaid"
  source: string
  svgUrl: string | null
  alt: string
  caption: string | null
  renderStatus: "ready" | "stale" | "error"
  failedRenderKey: string | null
}

type FigureInlineData = {
  renderer: "figure"
  svgUrl: string | null
  source: string | null
  alt: string | null
  caption: string | null
  renderStatus: "ready" | "stale" | "error"
}

type QuestionSetInlineChoice = {
  id: string
  content: string
  isNoneOfTheAbove?: boolean
}

type QuestionSetInlineQuestion = {
  id: string
  prompt: string
  goalIds: string[]
  explanation?: string
  payload: {
    multipleSelect: boolean
    countChoices?: boolean
    numCorrect?: number
    hasNoneOfTheAbove?: boolean
    randomize?: boolean
    choices: QuestionSetInlineChoice[]
  }
}

type QuestionSetInlineObject = {
  objectID: string
  title: string
  groupType: "quiz" | "practice" | "assessment"
  questions: QuestionSetInlineQuestion[]
}

type QuestionSetInlineData = {
  renderer: "question-set"
  questionSet: QuestionSetInlineObject
}

type FlashcardDeckInlineData = {
  renderer: "flashcard-deck"
  title: string
  noteCount: number
  cardCount: number
}

type BuddyObjectSummary = {
  kind: BenchObjectKind
  objectID: string
  title: string
  status: BuddyObjectStatus
  lifecycle: BuddyObjectLifecycle
  sourceRoot: string | null
}

type BuddyPresentationDescriptor = {
  ref: BenchObjectRef
  viewID: string
  surface: BuddyPresentationSurface
  data: BuddyInlineViewData | null
  autoOpen: {
    policyID: "whiteboard" | "fullscreen-html-widget"
    eventKey: string
  } | null
}

type BuddyObjectResult = {
  version: 1
  status: BuddyObjectResultStatus
  reason: string | null
  message: string
  primaryRef: BenchObjectRef | null
  objects: BuddyObjectSummary[]
  presentations: BuddyPresentationDescriptor[]
}

type TMediaGallerySource = MediaGalleryInlineData["items"][number]["source"]
type TMediaGallerySourceBase = Pick<TMediaGallerySource, "role" | "path" | "availability">
type TQuestionSetChoice = QuestionSetInlineChoice
type TQuestionSetPayload = QuestionSetInlineQuestion["payload"]
type TQuestionSetQuestion = QuestionSetInlineQuestion

function parseTNullableString<TValue>(value: TValue): string | null | undefined {
  if (value === null) return null
  return readNonEmptyString(value)
}

function readOptionalBooleanField(record: TJsonObject, key: string): boolean | undefined {
  if (!(key in record)) return undefined
  return parseTBoolean(record[key])
}

function readStringArray<TValue>(value: TValue): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items: string[] = []
  for (const item of value) {
    const text = readNonEmptyString(item)
    if (!text) return undefined
    items.push(text)
  }
  return items
}

function readObjectRef<TValue>(value: TValue): BenchObjectRef | undefined {
  if (!isRecord(value)) return undefined
  const kind = readNonEmptyString(value.kind)
  const objectID = readNonEmptyString(value.objectID)
  const revisionID = parseTNullableString(value.revisionID)
  const itemID = parseTNullableString(value.itemID)
  if (!kind || !isBenchObjectKind(kind) || !objectID) return undefined
  if (revisionID === undefined || itemID === undefined) return undefined
  return {
    kind,
    objectID,
    revisionID,
    itemID,
  }
}

function readLifecycle<TValue>(value: TValue): BuddyObjectLifecycle | undefined {
  const lifecycle = parseTString(value)
  if (
    lifecycle === "revisioned" ||
    lifecycle === "live" ||
    lifecycle === "imported" ||
    lifecycle === "external-reference"
  ) {
    return lifecycle
  }
  return undefined
}

function readStatus<TValue>(value: TValue): BuddyObjectStatus | undefined {
  const status = parseTString(value)
  if (
    status === "ready" ||
    status === "preparing" ||
    status === "stale" ||
    status === "unsupported" ||
    status === "error" ||
    status === "unavailable"
  ) {
    return status
  }
  return undefined
}

function readObjectSummary<TValue>(value: TValue): BuddyObjectSummary | undefined {
  if (!isRecord(value)) return undefined
  const kind = readNonEmptyString(value.kind)
  const objectID = readNonEmptyString(value.objectID)
  const title = readNonEmptyString(value.title)
  const status = readStatus(value.status)
  const lifecycle = readLifecycle(value.lifecycle)
  const sourceRoot = parseTNullableString(value.sourceRoot)
  if (!kind || !isBenchObjectKind(kind) || !objectID || !title || !status || !lifecycle) {
    return undefined
  }
  if (sourceRoot === undefined) return undefined
  return {
    kind,
    objectID,
    title,
    status,
    lifecycle,
    sourceRoot,
  }
}

function readSourceData<TValue>(
  value: TValue,
): MediaGalleryInlineData["items"][number]["source"] | undefined {
  if (!isRecord(value)) return undefined
  const role =
    value.role === "original" ||
    value.role === "authoring" ||
    value.role === "payload" ||
    value.role === "external"
      ? value.role
      : undefined
  const path = readNonEmptyString(value.path)
  const displayPath = readNonEmptyString(value.displayPath)
  const workspacePath = parseTNullableString(value.workspacePath)
  const availability =
    value.availability === "available" ||
    value.availability === "missing" ||
    value.availability === "error"
      ? value.availability
      : undefined
  if (!role || !path || !availability) return undefined
  if (workspacePath === undefined && "workspacePath" in value) return undefined
  const sourceBase: TMediaGallerySourceBase = {
    role,
    path,
    availability,
  }
  const source: TMediaGallerySource = Object.assign(
    sourceBase,
    displayPath ? { displayPath } : undefined,
    workspacePath !== undefined ? { workspacePath } : undefined,
  )
  return source
}

function readMediaItem<TValue>(value: TValue): MediaGalleryInlineData["items"][number] | undefined {
  if (!isRecord(value)) return undefined
  const itemID = readNonEmptyString(value.itemID)
  const title = parseTNullableString(value.title)
  const mediaType = readNonEmptyString(value.mediaType)
  const mimeType = parseTNullableString(value.mimeType)
  const source = readSourceData(value.source)
  const availability =
    value.availability === "available" ||
    value.availability === "missing" ||
    value.availability === "error" ||
    value.availability === "unavailable"
      ? value.availability
      : undefined
  const rawUrl = parseTNullableString(value.rawUrl)
  const fileName = parseTNullableString(value.fileName)
  if (
    !itemID ||
    title === undefined ||
    !mediaType ||
    mimeType === undefined ||
    !source ||
    !availability
  ) {
    return undefined
  }
  if (rawUrl === undefined || fileName === undefined) return undefined
  return {
    itemID,
    title,
    mediaType,
    mimeType,
    source,
    availability,
    rawUrl,
    fileName,
  }
}

function readQuestionSetChoice<TValue>(value: TValue): QuestionSetInlineChoice | undefined {
  if (!isRecord(value)) return undefined
  const id = readNonEmptyString(value.id)
  const content = readNonEmptyString(value.content)
  const isNoneOfTheAbove = readOptionalBooleanField(value, "isNoneOfTheAbove")
  if (!id || !content) return undefined
  if ("isNoneOfTheAbove" in value && isNoneOfTheAbove === undefined) return undefined
  const choice: TQuestionSetChoice = Object.assign(
    {
      id,
      content,
    },
    isNoneOfTheAbove !== undefined ? { isNoneOfTheAbove } : undefined,
  )
  return choice
}

function readQuestionSetPayload<TValue>(value: TValue): QuestionSetInlineQuestion["payload"] | undefined {
  if (!isRecord(value)) return undefined
  const multipleSelect = parseTBoolean(value.multipleSelect)
  const countChoices = readOptionalBooleanField(value, "countChoices")
  const numCorrect = parseTNumber(value.numCorrect)
  const hasNoneOfTheAbove = readOptionalBooleanField(value, "hasNoneOfTheAbove")
  const randomize = readOptionalBooleanField(value, "randomize")
  if (!Array.isArray(value.choices)) return undefined
  const choices: QuestionSetInlineChoice[] = []
  for (const choiceValue of value.choices) {
    const choice = readQuestionSetChoice(choiceValue)
    if (!choice) return undefined
    choices.push(choice)
  }
  if (multipleSelect === undefined) return undefined
  if ("countChoices" in value && countChoices === undefined) return undefined
  if (
    "numCorrect" in value &&
    (numCorrect === undefined || !Number.isInteger(numCorrect) || numCorrect <= 0)
  ) {
    return undefined
  }
  if ("hasNoneOfTheAbove" in value && hasNoneOfTheAbove === undefined) return undefined
  if ("randomize" in value && randomize === undefined) return undefined
  const payload: TQuestionSetPayload = Object.assign(
    {
      multipleSelect,
      choices,
    },
    countChoices !== undefined ? { countChoices } : undefined,
    numCorrect !== undefined ? { numCorrect } : undefined,
    Object.assign(
      {},
      hasNoneOfTheAbove !== undefined ? { hasNoneOfTheAbove } : undefined,
      randomize !== undefined ? { randomize } : undefined,
    ),
  )
  return payload
}

function readQuestionSetQuestion<TValue>(value: TValue): QuestionSetInlineQuestion | undefined {
  if (!isRecord(value)) return undefined
  const id = readNonEmptyString(value.id)
  const prompt = readNonEmptyString(value.prompt)
  const goalIds = readStringArray(value.goalIds)
  const explanation = readNonEmptyString(value.explanation)
  const payload = readQuestionSetPayload(value.payload)
  if (!id || !prompt || !goalIds || !payload) return undefined
  if ("explanation" in value && !explanation) return undefined
  const question: TQuestionSetQuestion = Object.assign(
    {
      id,
      prompt,
      goalIds,
      payload,
    },
    explanation ? { explanation } : undefined,
  )
  return question
}

function readQuestionSetInlineObject<TValue>(value: TValue): QuestionSetInlineObject | undefined {
  if (!isRecord(value)) return undefined
  const objectID = readNonEmptyString(value.objectID)
  const title = readNonEmptyString(value.title)
  const groupType =
    value.groupType === "quiz" || value.groupType === "practice" || value.groupType === "assessment"
      ? value.groupType
      : undefined
  if (!Array.isArray(value.questions)) return undefined
  const questions: QuestionSetInlineQuestion[] = []
  for (const questionValue of value.questions) {
    const question = readQuestionSetQuestion(questionValue)
    if (!question) return undefined
    questions.push(question)
  }
  if (!objectID || !title || !groupType) return undefined
  return {
    objectID,
    title,
    groupType,
    questions,
  }
}

function readInlineData<TValue>(value: TValue): BuddyInlineViewData | undefined {
  if (!isRecord(value)) return undefined
  if (value.renderer === "html-widget") {
    const runtimeUrl = readNonEmptyString(value.runtimeUrl)
    const sourceRoot = readNonEmptyString(value.sourceRoot)
    const entryPath = readNonEmptyString(value.entryPath)
    const sourceVersion = parseTNullableString(value.sourceVersion)
    const viewportPreset = readNonEmptyString(value.viewportPreset)
    if (
      !runtimeUrl ||
      !sourceRoot ||
      !entryPath ||
      sourceVersion === undefined ||
      !viewportPreset
    ) {
      return undefined
    }
    return {
      renderer: "html-widget",
      runtimeUrl,
      sourceRoot,
      entryPath,
      sourceVersion,
      viewportPreset,
    }
  }
  if (value.renderer === "media-gallery") {
    const layout =
      value.layout === "single" || value.layout === "grid" || value.layout === "strip"
        ? value.layout
        : undefined
    const items = Array.isArray(value.items)
      ? value.items
          .map(readMediaItem)
          .filter((item): item is MediaGalleryInlineData["items"][number] => item !== undefined)
      : undefined
    if (!layout || !items) return undefined
    return { renderer: "media-gallery", layout, items }
  }
  if (value.renderer === "mermaid") {
    const source = readNonEmptyString(value.source)
    const svgUrl = parseTNullableString(value.svgUrl)
    const alt = readNonEmptyString(value.alt)
    const caption = parseTNullableString(value.caption)
    const renderStatus =
      value.renderStatus === "ready" ||
      value.renderStatus === "stale" ||
      value.renderStatus === "error"
        ? value.renderStatus
        : undefined
    const failedRenderKey = parseTNullableString(value.failedRenderKey)
    if (
      !source ||
      svgUrl === undefined ||
      !alt ||
      caption === undefined ||
      !renderStatus ||
      failedRenderKey === undefined
    ) {
      return undefined
    }
    return { renderer: "mermaid", source, svgUrl, alt, caption, renderStatus, failedRenderKey }
  }
  if (value.renderer === "figure") {
    const svgUrl = parseTNullableString(value.svgUrl)
    const source = parseTNullableString(value.source)
    const alt = parseTNullableString(value.alt)
    const caption = parseTNullableString(value.caption)
    const renderStatus =
      value.renderStatus === "ready" ||
      value.renderStatus === "stale" ||
      value.renderStatus === "error"
        ? value.renderStatus
        : undefined
    if (
      svgUrl === undefined ||
      source === undefined ||
      alt === undefined ||
      caption === undefined ||
      !renderStatus
    ) {
      return undefined
    }
    return { renderer: "figure", svgUrl, source, alt, caption, renderStatus }
  }
  if (value.renderer === "question-set") {
    const questionSet = readQuestionSetInlineObject(value.questionSet)
    return questionSet ? { renderer: "question-set", questionSet } : undefined
  }
  if (value.renderer === "flashcard-deck") {
    const title = readNonEmptyString(value.title)
    const noteCount = parseTNumber(value.noteCount)
    const cardCount = parseTNumber(value.cardCount)
    if (!title || noteCount === undefined || cardCount === undefined) return undefined
    return { renderer: "flashcard-deck", title, noteCount, cardCount }
  }
  return undefined
}

function readPresentation<TValue>(value: TValue): BuddyPresentationDescriptor | undefined {
  if (!isRecord(value)) return undefined
  const ref = readObjectRef(value.ref)
  const viewID = readNonEmptyString(value.viewID)
  const surface =
    value.surface === "inline" || value.surface === "bench" || value.surface === "library"
      ? value.surface
      : undefined
  const data = value.data === null ? null : readInlineData(value.data)
  const autoOpen = value.autoOpen
  if (!ref || !viewID || !surface || data === undefined) return undefined
  if (autoOpen !== null && !isRecord(autoOpen)) return undefined
  if (isRecord(autoOpen)) {
    const policyID =
      autoOpen.policyID === "whiteboard" || autoOpen.policyID === "fullscreen-html-widget"
        ? autoOpen.policyID
        : undefined
    const eventKey = readNonEmptyString(autoOpen.eventKey)
    if (!policyID || !eventKey) return undefined
    return { ref, viewID, surface, data, autoOpen: { policyID, eventKey } }
  }
  return { ref, viewID, surface, data, autoOpen: null }
}

function readBuddyObjectResult(metadata: TJsonObject): BuddyObjectResult | undefined {
  const value = metadata.buddyObjectResult
  if (!isRecord(value)) return undefined
  const version = value.version === 1 ? 1 : undefined
  const status =
    value.status === "ok" || value.status === "blocked" || value.status === "error"
      ? value.status
      : undefined
  const reason = parseTNullableString(value.reason)
  const message = readNonEmptyString(value.message)
  const primaryRef = value.primaryRef === null ? null : readObjectRef(value.primaryRef)
  const objects = Array.isArray(value.objects)
    ? value.objects
        .map(readObjectSummary)
        .filter((item): item is BuddyObjectSummary => item !== undefined)
    : undefined
  const presentations = Array.isArray(value.presentations)
    ? value.presentations
        .map(readPresentation)
        .filter((item): item is BuddyPresentationDescriptor => item !== undefined)
    : undefined
  if (
    !version ||
    !status ||
    reason === undefined ||
    !message ||
    primaryRef === undefined ||
    !objects ||
    !presentations
  ) {
    return undefined
  }
  return { version, status, reason, message, primaryRef, objects, presentations }
}

function readInlinePresentation(
  metadata: TJsonObject,
  renderer: BuddyInlineViewData["renderer"],
): BuddyPresentationDescriptor | undefined {
  const result = readBuddyObjectResult(metadata)
  return result?.presentations.find(
    (presentation) =>
      presentation.surface === "inline" &&
      (presentation.data?.renderer === renderer ||
        (presentation.data === null &&
          inlineRendererForObjectKind(presentation.ref.kind) === renderer)),
  )
}

function inlineRendererForObjectKind(
  kind: BenchObjectKind,
): BuddyInlineViewData["renderer"] | undefined {
  switch (kind) {
    case "html-widget":
      return "html-widget"
    case "media-presentation":
      return "media-gallery"
    case "mermaid":
      return "mermaid"
    case "figure":
    case "freeform-figure":
      return "figure"
    case "question-set":
      return "question-set"
    case "flashcard-deck":
      return "flashcard-deck"
    case "resource":
    case "whiteboard":
      return undefined
  }
}

function objectBenchTarget(input: {
  kind: BenchObjectKind
  objectID: string
  viewID?: string
  revisionID?: string | null
  itemID?: string | null
}): BenchTarget {
  return {
    type: "object",
    ref: {
      kind: input.kind,
      objectID: input.objectID,
      revisionID: input.revisionID ?? null,
      itemID: input.itemID ?? null,
    },
    viewID: input.viewID ?? defaultBenchObjectViewID(input.kind),
  }
}

function presentationBenchTarget(presentation: BuddyPresentationDescriptor): BenchTarget {
  return {
    type: "object",
    ref: presentation.ref,
    viewID: presentation.viewID,
  }
}

function metadataWithInlinePresentation(
  metadata: TJsonObject,
  presentation: BuddyPresentationDescriptor,
): TJsonObject {
  const result = readBuddyObjectResult(metadata)
  if (!result) return metadata
  const nextResult = {
    ...result,
    presentations: result.presentations.map((candidate) =>
      candidate.surface === presentation.surface &&
      candidate.viewID === presentation.viewID &&
      candidate.ref.kind === presentation.ref.kind &&
      candidate.ref.objectID === presentation.ref.objectID
        ? presentation
        : candidate,
    ),
  }
  const parsed = isRecord(nextResult) ? nextResult : undefined
  if (!parsed) return metadata
  return {
    ...metadata,
    buddyObjectResult: parsed,
  }
}

export {
  metadataWithInlinePresentation,
  objectBenchTarget,
  presentationBenchTarget,
  readBuddyObjectResult,
  readInlinePresentation,
  readInlineData,
}
export type {
  BuddyInlineViewData,
  BuddyObjectResult,
  BuddyPresentationDescriptor,
  FigureInlineData,
  FlashcardDeckInlineData,
  HtmlWidgetInlineData,
  MediaGalleryInlineData,
  MermaidInlineData,
  QuestionSetInlineData,
}
