export type PromptComposerAttachment = {
  id: string
  filename: string
  mime: string
  dataUrl: string
  kind: "image" | "file"
}

export type PromptTextPart = {
  type: "text"
  text: string
}

export type PromptFilePart = {
  type: "file"
  mime: string
  url: string
  filename: string
}

export type PromptAttachmentPart = PromptTextPart | PromptFilePart
