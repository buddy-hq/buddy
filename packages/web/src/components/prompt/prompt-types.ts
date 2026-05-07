export type PromptComposerAttachment = {
  id: string
  filename: string
  mime: string
  dataUrl: string
  kind: "image" | "file"
}

export const PROMPT_PART_TYPE_TEXT = "text" as const
export const PROMPT_PART_TYPE_FILE = "file" as const
export const PROMPT_PART_TYPE_AGENT = "agent" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const WORKSPACE_FILE_REFERENCE_PART_TYPE = "workspace-file-reference" as const
export const RESOURCE_REFERENCE_PART_TYPE = "resource-reference" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const READING_SELECTION_PART_TYPE = "reading-selection" as const
// Sync with packages/buddy/src/learning/prompt/workspace-file-references.ts.
export const BUDDY_PROMPT_PART_METADATA_KEY = "buddyPromptPart" as const

export type PromptTextPart = {
  type: typeof PROMPT_PART_TYPE_TEXT
  text: string
}

export type PromptFilePart = {
  type: typeof PROMPT_PART_TYPE_FILE
  mime: string
  url: string
  filename: string
}

export type PromptAgentPart = {
  type: typeof PROMPT_PART_TYPE_AGENT
  name: string
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
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

export type PromptAttachmentPart = PromptTextPart | PromptFilePart

export type PromptComposerPart =
  | PromptTextPart
  | PromptAgentPart
  | PromptWorkspaceFileReferencePart
  | PromptResourceReferencePart
  | PromptReadingSelectionPart

export type PromptSubmissionPart =
  | PromptTextPart
  | PromptAgentPart
  | PromptWorkspaceFileReferencePart
  | PromptResourceReferencePart
  | PromptReadingSelectionPart
  | PromptFilePart
