import { useState } from "react"
import {
  attachmentRequiresVisionInput,
  createAttachmentID,
  readFileAsDataUrl,
} from "./attachment-utils"
import type { PromptComposerAttachment } from "./prompt-types"

type UsePromptComposerAttachmentsProps = {
  attachments: PromptComposerAttachment[]
  setDraftAttachments: (attachments: PromptComposerAttachment[]) => void
  resetHistoryNavigation: () => void
  acceptsImages: boolean
  onUnsupportedImages?: (count: number) => void
}

export function usePromptComposerAttachments(props: UsePromptComposerAttachmentsProps) {
  const [previewAttachment, setPreviewAttachment] = useState<PromptComposerAttachment | null>(null)

  async function addAttachments(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    const supported = props.acceptsImages
      ? list
      : list.filter((file) => !attachmentRequiresVisionInput(file.type))
    const unsupportedImageCount = list.length - supported.length
    if (unsupportedImageCount > 0) {
      props.onUnsupportedImages?.(unsupportedImageCount)
    }
    if (supported.length === 0) return

    const next = await Promise.all(
      supported.map(async (file) => ({
        id: createAttachmentID(),
        filename: file.name || (file.type.startsWith("image/") ? "image" : "attachment"),
        mime: file.type || "application/octet-stream",
        dataUrl: await readFileAsDataUrl(file),
        kind: file.type.startsWith("image/") ? ("image" as const) : ("file" as const),
      })),
    ).catch(() => undefined)

    if (!next) return

    props.resetHistoryNavigation()
    props.setDraftAttachments([...props.attachments, ...next])
  }

  function removeAttachment(id: string) {
    props.resetHistoryNavigation()
    props.setDraftAttachments(props.attachments.filter((attachment) => attachment.id !== id))
  }

  return {
    previewAttachment,
    openPreviewAttachment: setPreviewAttachment,
    closePreviewAttachment: () => setPreviewAttachment(null),
    addAttachments,
    removeAttachment,
  }
}
