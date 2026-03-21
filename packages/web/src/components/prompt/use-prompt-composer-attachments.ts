import { useState } from 'react'
import { createAttachmentID, readFileAsDataUrl } from './attachment-utils'
import type { PromptComposerAttachment } from './prompt-types'

type UsePromptComposerAttachmentsProps = {
  promptKey: string
  attachments: PromptComposerAttachment[]
  setDraftAttachments: (key: string, attachments: PromptComposerAttachment[]) => void
  resetHistoryNavigation: () => void
}

export function usePromptComposerAttachments(props: UsePromptComposerAttachmentsProps) {
  const [previewAttachment, setPreviewAttachment] = useState<PromptComposerAttachment | null>(null)

  async function addAttachments(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return

    const next = await Promise.all(
      list.map(async (file) => ({
        id: createAttachmentID(),
        filename: file.name || (file.type.startsWith('image/') ? 'image' : 'attachment'),
        mime: file.type || 'application/octet-stream',
        dataUrl: await readFileAsDataUrl(file),
        kind: file.type.startsWith('image/') ? ('image' as const) : ('file' as const),
      })),
    ).catch(() => undefined)

    if (!next) return

    props.resetHistoryNavigation()
    props.setDraftAttachments(props.promptKey, [...props.attachments, ...next])
  }

  function removeAttachment(id: string) {
    props.resetHistoryNavigation()
    props.setDraftAttachments(
      props.promptKey,
      props.attachments.filter((attachment) => attachment.id !== id),
    )
  }

  return {
    previewAttachment,
    openPreviewAttachment: setPreviewAttachment,
    closePreviewAttachment: () => setPreviewAttachment(null),
    addAttachments,
    removeAttachment,
  }
}
