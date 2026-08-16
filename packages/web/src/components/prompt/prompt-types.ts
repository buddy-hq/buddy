import {
  READER_ANCHOR_KIND_CFI_TEXT,
  readReaderTextAnchor,
  type ReaderTextAnchor,
} from "@buddy/reader-contract"
import { isNativeResourceFormat } from "@buddy/workspace-file-policy"
import type { NativeResourceDelivery, NativeResourceFormat } from "@buddy/workspace-file-policy"
import { parseTJsonObject, parseTString } from "@/components/chat/tools/types"
import { parseStringArray } from "@/state/chat-types"

export type PromptModelAttachment = {
  id: string
  filename: string
  mime: string
  dataUrl: string
  localPath?: string
  editTarget?: true
  kind: "image" | "file"
}

type PromptNativeResourceAttachmentBase = {
  id: string
  filename: string
  mime: string
  kind: "native-resource"
  format: NativeResourceFormat
  delivery: NativeResourceDelivery
  dataUrl?: undefined
  localPath?: string
  editTarget?: undefined
}

export type PromptCopyingNativeResourceAttachment = PromptNativeResourceAttachmentBase & {
  status: "copying"
}

export type PromptReadyNativeResourceAttachment = PromptNativeResourceAttachmentBase & {
  status: "ready"
  uploadID: string
  workspacePath: string
  localPath: string
  sizeBytes: number
}

export type PromptErrorNativeResourceAttachment = PromptNativeResourceAttachmentBase & {
  status: "error"
  error: string
}

export type PromptNativeResourceAttachment =
  | PromptCopyingNativeResourceAttachment
  | PromptReadyNativeResourceAttachment
  | PromptErrorNativeResourceAttachment

export type PromptComposerAttachment = PromptModelAttachment | PromptNativeResourceAttachment

export function isPromptNativeResourceAttachment(
  attachment: PromptComposerAttachment,
): attachment is PromptNativeResourceAttachment {
  return attachment.kind === "native-resource"
}

export function isPromptReadyNativeResourceAttachment(
  attachment: PromptComposerAttachment,
): attachment is PromptReadyNativeResourceAttachment {
  return attachment.kind === "native-resource" && attachment.status === "ready"
}

export function isPromptModelAttachment(
  attachment: PromptComposerAttachment,
): attachment is PromptModelAttachment {
  return attachment.kind === "image" || attachment.kind === "file"
}

export type PromptImageEditIntent = {
  targetPaths: string[]
}

// Object-replacement char standing in for each character of a structured pill
// when the composer value is matched for `@`/`/` triggers. Length-preserving, so
// match offsets map 1:1 onto editor cursor offsets, while `@`/`/` characters
// inside a pill's serialized text (e.g. "@node_modules/@types/…") can never
// start or extend a trigger match.
export const PROMPT_STRUCTURED_MASK_CHAR = "￼" as const

export const PROMPT_PART_TYPE_TEXT = "text" as const
export const PROMPT_PART_TYPE_FILE = "file" as const
export const PROMPT_PART_TYPE_AGENT = "agent" as const
export const PROMPT_PART_TYPE_SKILL = "skill" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const OPENCODE_REFERENCE_PART_TYPE = "opencode-reference" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const WORKSPACE_FILE_REFERENCE_PART_TYPE = "workspace-file-reference" as const
export const RESOURCE_REFERENCE_PART_TYPE = "resource-reference" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const READING_SELECTION_PART_TYPE = "reading-selection" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const SELECTION_CONTEXT_PART_TYPE = "selection-context" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const BUDDY_PROMPT_PART_METADATA_KEY = "buddyPromptPart" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const NATIVE_RESOURCE_ATTACHMENT_PART_TYPE = "native-resource-attachment" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const TEXT_FILE_ATTACHMENT_PART_TYPE = "text-file-attachment" as const

export type PromptTextFileAttachmentMetadata = {
  type: typeof TEXT_FILE_ATTACHMENT_PART_TYPE
  filename: string
  mime: string
}

export type PromptTextPart = {
  type: typeof PROMPT_PART_TYPE_TEXT
  text: string
  metadata?: {
    [BUDDY_PROMPT_PART_METADATA_KEY]: PromptTextFileAttachmentMetadata
  }
}

export type PromptFilePart = {
  type: typeof PROMPT_PART_TYPE_FILE
  mime: string
  url: string
  filename: string
  source?: {
    type: "file"
    path: string
    text: {
      value: string
      start: number
      end: number
    }
  }
}

export type PromptAgentPart = {
  type: typeof PROMPT_PART_TYPE_AGENT
  name: string
}

/**
 * A skill invocation rendered inline as a pill. Purely an editor-side construct:
 * it serializes to `/name` and is converted to text before submission, so the
 * backend keeps its existing start-of-message slash-command contract.
 */
export type PromptSkillPart = {
  type: typeof PROMPT_PART_TYPE_SKILL
  name: string
}

export type PromptOpenCodeReferencePart = {
  type: typeof OPENCODE_REFERENCE_PART_TYPE
  name: string
  path: string
}

export type PromptWorkspaceFileReferencePart = {
  type: typeof WORKSPACE_FILE_REFERENCE_PART_TYPE
  path: string
}

export type PromptResourceReferencePart = {
  type: typeof RESOURCE_REFERENCE_PART_TYPE
  key: string
}

export type PromptReadingSelectionPart = {
  type: typeof READING_SELECTION_PART_TYPE
  text: string
  selectionKey?: string
  resourceKey?: string
  anchor: ReaderTextAnchor
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export type PromptSelectionContextSource = "reading" | "markdown"

export type PromptReadingSelectionContextPart = {
  type: typeof SELECTION_CONTEXT_PART_TYPE
  source: "reading"
  text: string
  selectionKey: string
  resourceKey?: string
  anchor: ReaderTextAnchor
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
  path?: never
  version?: never
  headingPath?: never
}

export type PromptMarkdownSelectionContextPart = {
  type: typeof SELECTION_CONTEXT_PART_TYPE
  source: "markdown"
  text: string
  selectionKey: string
  path?: string
  version?: string
  headingPath?: string[]
  resourceKey?: never
  anchor?: never
  tocLabel?: never
  pageLabel?: never
  locationLabel?: never
}

export type PromptSelectionContextPart =
  | PromptReadingSelectionContextPart
  | PromptMarkdownSelectionContextPart

export type PromptNativeResourceAttachmentPart = {
  type: typeof NATIVE_RESOURCE_ATTACHMENT_PART_TYPE
  filename: string
  sourcePath: string
  format: NativeResourceFormat
  alias: string
  mime: string
}

function parseTNonEmptyString<TValue>(value: TValue): string | undefined {
  const text = parseTString(value)
  if (text === undefined || text.length === 0) return undefined
  return text
}

function optionalStringField<TValue>(value: TValue) {
  const text = parseTString(value)
  return text === undefined ? undefined : ({ value: text } as const)
}

function optionalLabelFields(input: {
  tocLabel: ReturnType<typeof parseTString>
  pageLabel: ReturnType<typeof parseTString>
  locationLabel: ReturnType<typeof parseTString>
}) {
  return Object.assign(
    Object.assign(
      {},
      input.tocLabel === undefined ? undefined : ({ tocLabel: input.tocLabel } as const),
      input.pageLabel === undefined ? undefined : ({ pageLabel: input.pageLabel } as const),
    ),
    input.locationLabel === undefined
      ? undefined
      : ({ locationLabel: input.locationLabel } as const),
  )
}

export function readPromptReaderTextAnchor<TValue>(value: TValue): ReaderTextAnchor | undefined {
  const record = parseTJsonObject(value)
  if (!record) return undefined
  if (record.anchor !== undefined) return readReaderTextAnchor(record.anchor)
  const cfi = parseTString(record.cfi)
  if (cfi === undefined) return undefined

  return readReaderTextAnchor(
    Object.assign(
      {
        kind: READER_ANCHOR_KIND_CFI_TEXT,
        cfi,
      } as const,
      record.index !== undefined ? { sectionIndex: record.index } : undefined,
    ),
  )
}

export function readPromptReadingSelectionMetadata<TMetadata>(
  metadata: TMetadata,
): PromptReadingSelectionPart | undefined {
  const record = parseTJsonObject(metadata)
  if (!record) return undefined

  const candidate = parseTJsonObject(record[BUDDY_PROMPT_PART_METADATA_KEY])
  if (!candidate) return undefined
  if (candidate.type !== READING_SELECTION_PART_TYPE) return undefined
  const text = parseTString(candidate.text)
  if (text === undefined) return undefined
  const anchor = readPromptReaderTextAnchor(candidate)
  if (!anchor) return undefined

  const selectionKey = optionalStringField(candidate.selectionKey)
  const resourceKey = optionalStringField(candidate.resourceKey)
  return Object.assign(
    Object.assign(
      {
        type: READING_SELECTION_PART_TYPE,
        text,
        anchor,
      } as const,
      selectionKey === undefined ? undefined : { selectionKey: selectionKey.value },
      resourceKey === undefined ? undefined : { resourceKey: resourceKey.value },
    ),
    optionalLabelFields({
      tocLabel: parseTString(candidate.tocLabel),
      pageLabel: parseTString(candidate.pageLabel),
      locationLabel: parseTString(candidate.locationLabel),
    }),
  )
}

export function readPromptSelectionContextMetadata<TMetadata>(
  metadata: TMetadata,
): PromptSelectionContextPart | PromptReadingSelectionPart | undefined {
  const record = parseTJsonObject(metadata)
  if (!record) return undefined

  const candidate = parseTJsonObject(record[BUDDY_PROMPT_PART_METADATA_KEY])
  if (!candidate) return undefined
  if (candidate.type === READING_SELECTION_PART_TYPE) {
    return readPromptReadingSelectionMetadata(metadata)
  }
  if (candidate.type !== SELECTION_CONTEXT_PART_TYPE) return undefined
  if (candidate.source !== "reading" && candidate.source !== "markdown") return undefined
  const text = parseTString(candidate.text)
  if (text === undefined) return undefined
  const selectionKey = parseTString(candidate.selectionKey)
  if (selectionKey === undefined) return undefined
  const headingPath = parseStringArray(candidate.headingPath)
  if (candidate.source === "markdown") {
    const markdownSelection: Pick<
      PromptMarkdownSelectionContextPart,
      "type" | "source" | "text" | "selectionKey"
    > = {
      type: SELECTION_CONTEXT_PART_TYPE,
      source: "markdown",
      text,
      selectionKey,
    }
    const pathField = optionalStringField(candidate.path)
    const versionField = optionalStringField(candidate.version)
    return Object.assign(
      Object.assign(
        markdownSelection,
        pathField === undefined ? undefined : { path: pathField.value },
        versionField === undefined ? undefined : { version: versionField.value },
      ),
      headingPath ? { headingPath } : undefined,
    )
  }

  const anchor = readPromptReaderTextAnchor(candidate)
  if (!anchor) return undefined
  const readingSelection: Pick<
    PromptReadingSelectionContextPart,
    "type" | "source" | "text" | "selectionKey" | "anchor"
  > = {
    type: SELECTION_CONTEXT_PART_TYPE,
    source: "reading",
    text,
    selectionKey,
    anchor,
  }
  const resourceKey = optionalStringField(candidate.resourceKey)
  return Object.assign(
    readingSelection,
    resourceKey === undefined ? undefined : { resourceKey: resourceKey.value },
    optionalLabelFields({
      tocLabel: parseTString(candidate.tocLabel),
      pageLabel: parseTString(candidate.pageLabel),
      locationLabel: parseTString(candidate.locationLabel),
    }),
  )
}

export function readPromptNativeResourceAttachmentPart<TValue>(
  value: TValue,
): PromptNativeResourceAttachmentPart | undefined {
  const record = parseTJsonObject(value)
  if (!record || record.type !== NATIVE_RESOURCE_ATTACHMENT_PART_TYPE) return undefined
  const filename = parseTNonEmptyString(record.filename)
  const sourcePath = parseTNonEmptyString(record.sourcePath)
  const format = parseTString(record.format)
  const alias = parseTNonEmptyString(record.alias)
  const mime = parseTNonEmptyString(record.mime)
  if (!filename || !sourcePath || !format || !isNativeResourceFormat(format) || !alias || !mime) {
    return undefined
  }
  return {
    type: NATIVE_RESOURCE_ATTACHMENT_PART_TYPE,
    filename,
    sourcePath,
    format,
    alias,
    mime,
  }
}

export function readPromptNativeResourceAttachmentMetadata<TMetadata>(
  metadata: TMetadata,
): PromptNativeResourceAttachmentPart | undefined {
  const record = parseTJsonObject(metadata)
  if (!record) return undefined
  return readPromptNativeResourceAttachmentPart(record[BUDDY_PROMPT_PART_METADATA_KEY])
}

export function readPromptTextFileAttachmentMetadata<TMetadata>(
  metadata: TMetadata,
): PromptTextFileAttachmentMetadata | undefined {
  const record = parseTJsonObject(metadata)
  if (!record) return undefined
  const candidate = parseTJsonObject(record[BUDDY_PROMPT_PART_METADATA_KEY])
  if (!candidate || candidate.type !== TEXT_FILE_ATTACHMENT_PART_TYPE) return undefined
  const filename = parseTNonEmptyString(candidate.filename)
  const mime = parseTNonEmptyString(candidate.mime)
  if (!filename || !mime) return undefined
  return {
    type: TEXT_FILE_ATTACHMENT_PART_TYPE,
    filename,
    mime,
  }
}

export type PromptAttachmentPart = PromptTextPart | PromptFilePart

export type PromptComposerPart =
  | PromptTextPart
  | PromptAgentPart
  | PromptSkillPart
  | PromptOpenCodeReferencePart
  | PromptWorkspaceFileReferencePart
  | PromptResourceReferencePart
  | PromptReadingSelectionPart
  | PromptSelectionContextPart

export type PromptSubmissionPart =
  | PromptTextPart
  | PromptAgentPart
  | PromptOpenCodeReferencePart
  | PromptWorkspaceFileReferencePart
  | PromptResourceReferencePart
  | PromptReadingSelectionPart
  | PromptSelectionContextPart
  | PromptNativeResourceAttachmentPart
  | PromptFilePart
