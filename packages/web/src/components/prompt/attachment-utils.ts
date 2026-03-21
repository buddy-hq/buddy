import type { PromptComposerAttachment } from "./prompt-types"

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"]
export const ACCEPTED_FILE_TYPES = [...ACCEPTED_IMAGE_TYPES, "application/pdf"]

export function cloneAttachments(attachments: PromptComposerAttachment[]) {
  return attachments.map((attachment) => ({ ...attachment }))
}

export function createAttachmentID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    const onLoad = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("Failed to read attachment"))
    }
    const onError = () => reject(reader.error ?? new Error("Failed to read attachment"))
    reader.addEventListener("load", onLoad, { once: true })
    reader.addEventListener("error", onError, { once: true })
    reader.readAsDataURL(file)
  })
}
