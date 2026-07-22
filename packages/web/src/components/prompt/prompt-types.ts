import { isNativeResourceFormat } from "@buddy/workspace-file-policy"
import type { NativeResourceDelivery, NativeResourceFormat } from "@buddy/workspace-file-policy"

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
  cfi?: string
  index?: number
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export type PromptSelectionContextSource = "reading" | "markdown"

export type PromptSelectionContextPart = {
  type: typeof SELECTION_CONTEXT_PART_TYPE
  source: PromptSelectionContextSource
  text: string
  selectionKey: string
  path?: string
  version?: string
  headingPath?: string[]
  resourceKey?: string
  cfi?: string
  index?: number
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

export type PromptNativeResourceAttachmentPart = {
  type: typeof NATIVE_RESOURCE_ATTACHMENT_PART_TYPE
  filename: string
  sourcePath: string
  format: NativeResourceFormat
  alias: string
  mime: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (!value.every((entry) => typeof entry === "string")) return undefined
  return value
}

export function readPromptReadingSelectionMetadata(
  metadata: unknown,
): PromptReadingSelectionPart | undefined {
  if (!isRecord(metadata)) return undefined

  const candidate = metadata[BUDDY_PROMPT_PART_METADATA_KEY]
  if (!isRecord(candidate)) return undefined
  if (candidate.type !== READING_SELECTION_PART_TYPE) return undefined
  if (typeof candidate.text !== "string") return undefined

  return {
    type: READING_SELECTION_PART_TYPE,
    text: candidate.text,
    ...(typeof candidate.selectionKey === "string" ? { selectionKey: candidate.selectionKey } : {}),
    ...(typeof candidate.resourceKey === "string" ? { resourceKey: candidate.resourceKey } : {}),
    ...(typeof candidate.cfi === "string" ? { cfi: candidate.cfi } : {}),
    ...(typeof candidate.index === "number" ? { index: candidate.index } : {}),
    ...(typeof candidate.tocLabel === "string" ? { tocLabel: candidate.tocLabel } : {}),
    ...(typeof candidate.pageLabel === "string" ? { pageLabel: candidate.pageLabel } : {}),
    ...(typeof candidate.locationLabel === "string"
      ? { locationLabel: candidate.locationLabel }
      : {}),
  }
}

export function readPromptSelectionContextMetadata(
  metadata: unknown,
): PromptSelectionContextPart | PromptReadingSelectionPart | undefined {
  if (!isRecord(metadata)) return undefined

  const candidate = metadata[BUDDY_PROMPT_PART_METADATA_KEY]
  if (!isRecord(candidate)) return undefined
  if (candidate.type === READING_SELECTION_PART_TYPE) {
    return readPromptReadingSelectionMetadata(metadata)
  }
  if (candidate.type !== SELECTION_CONTEXT_PART_TYPE) return undefined
  if (candidate.source !== "reading" && candidate.source !== "markdown") return undefined
  if (typeof candidate.text !== "string") return undefined
  if (typeof candidate.selectionKey !== "string") return undefined
  const headingPath = readStringArray(candidate.headingPath)

  return {
    type: SELECTION_CONTEXT_PART_TYPE,
    source: candidate.source,
    text: candidate.text,
    selectionKey: candidate.selectionKey,
    ...(typeof candidate.path === "string" ? { path: candidate.path } : {}),
    ...(typeof candidate.version === "string" ? { version: candidate.version } : {}),
    ...(headingPath ? { headingPath } : {}),
    ...(typeof candidate.resourceKey === "string" ? { resourceKey: candidate.resourceKey } : {}),
    ...(typeof candidate.cfi === "string" ? { cfi: candidate.cfi } : {}),
    ...(typeof candidate.index === "number" ? { index: candidate.index } : {}),
    ...(typeof candidate.tocLabel === "string" ? { tocLabel: candidate.tocLabel } : {}),
    ...(typeof candidate.pageLabel === "string" ? { pageLabel: candidate.pageLabel } : {}),
    ...(typeof candidate.locationLabel === "string"
      ? { locationLabel: candidate.locationLabel }
      : {}),
  }
}

export function readPromptNativeResourceAttachmentPart(
  value: unknown,
): PromptNativeResourceAttachmentPart | undefined {
  if (!isRecord(value) || value.type !== NATIVE_RESOURCE_ATTACHMENT_PART_TYPE) return undefined
  if (typeof value.filename !== "string" || value.filename.length === 0) return undefined
  if (typeof value.sourcePath !== "string" || value.sourcePath.length === 0) return undefined
  if (typeof value.format !== "string" || !isNativeResourceFormat(value.format)) return undefined
  if (typeof value.alias !== "string" || value.alias.length === 0) return undefined
  if (typeof value.mime !== "string" || value.mime.length === 0) return undefined
  return {
    type: NATIVE_RESOURCE_ATTACHMENT_PART_TYPE,
    filename: value.filename,
    sourcePath: value.sourcePath,
    format: value.format,
    alias: value.alias,
    mime: value.mime,
  }
}

export function readPromptNativeResourceAttachmentMetadata(
  metadata: unknown,
): PromptNativeResourceAttachmentPart | undefined {
  if (!isRecord(metadata)) return undefined
  return readPromptNativeResourceAttachmentPart(metadata[BUDDY_PROMPT_PART_METADATA_KEY])
}

export function readPromptTextFileAttachmentMetadata(
  metadata: unknown,
): PromptTextFileAttachmentMetadata | undefined {
  if (!isRecord(metadata)) return undefined
  const candidate = metadata[BUDDY_PROMPT_PART_METADATA_KEY]
  if (!isRecord(candidate) || candidate.type !== TEXT_FILE_ATTACHMENT_PART_TYPE) return undefined
  if (typeof candidate.filename !== "string" || candidate.filename.length === 0) return undefined
  if (typeof candidate.mime !== "string" || candidate.mime.length === 0) return undefined
  return {
    type: TEXT_FILE_ATTACHMENT_PART_TYPE,
    filename: candidate.filename,
    mime: candidate.mime,
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
