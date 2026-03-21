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

export type PromptAttachmentPart = PromptTextPart | PromptFilePart

export type PromptComposerPart =
  | PromptTextPart
  | PromptAgentPart
  | PromptWorkspaceFileReferencePart
  | PromptResourceReferencePart

export type PromptSubmissionPart =
  | PromptTextPart
  | PromptAgentPart
  | PromptWorkspaceFileReferencePart
  | PromptResourceReferencePart
  | PromptFilePart
