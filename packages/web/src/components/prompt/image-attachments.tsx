import { XIcon, FolderIcon } from "@buddy/ui"
import { language } from "@/context/language"
import type { PromptComposerAttachment } from "./prompt-types"

type ImageAttachmentsProps = {
  attachments: PromptComposerAttachment[]
  onRemove: (id: string) => void
  onOpen?: (attachment: PromptComposerAttachment) => void
}

export function ImageAttachments({ attachments, onRemove, onOpen }: ImageAttachmentsProps) {
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="relative group">
          {attachment.mime.startsWith("image/") ? (
            <img
              src={attachment.dataUrl}
              alt={attachment.filename}
              className="size-16 rounded-md object-cover border border-border-base hover:border-border-hover transition-colors cursor-pointer bg-surface-weak"
              onClick={() => onOpen?.(attachment)}
            />
          ) : (
            <div className="size-16 rounded-md bg-surface-weak flex items-center justify-center border border-border-base">
              <FolderIcon className="size-6 text-text-weak" />
            </div>
          )}

          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background-base border border-border-base flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-weak"
            aria-label={language.t("prompt.composer.removeAttachmentAria", {
              filename: attachment.filename,
            })}
          >
            <XIcon className="size-3 text-text-weak" />
          </button>

          <div className="absolute right-0 bottom-0 left-0 rounded-b-md bg-[color:color-mix(in_oklab,var(--surface-raised-stronger-non-alpha)_78%,transparent)] px-1 py-0.5 backdrop-blur-[2px]">
            <span className="block truncate text-[10px] text-text-base">{attachment.filename}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
