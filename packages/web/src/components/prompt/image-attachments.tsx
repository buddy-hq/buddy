import { XIcon, FolderIcon } from '@buddy/ui'
import type { PromptComposerAttachment } from './prompt-types'

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
          {attachment.mime.startsWith('image/') ? (
            <img
              src={attachment.dataUrl}
              alt={attachment.filename}
              className="size-16 rounded-md object-cover border border-border hover:border-foreground/20 transition-colors cursor-pointer bg-muted"
              onClick={() => onOpen?.(attachment)}
            />
          ) : (
            <div className="size-16 rounded-md bg-muted flex items-center justify-center border border-border">
              <FolderIcon className="size-6 text-muted-foreground" />
            </div>
          )}

          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
            aria-label={`Remove ${attachment.filename}`}
          >
            <XIcon className="size-3 text-muted-foreground" />
          </button>

          <div className="absolute right-0 bottom-0 left-0 rounded-b-md bg-[color:color-mix(in_oklab,var(--popover)_78%,transparent)] px-1 py-0.5 backdrop-blur-[2px]">
            <span className="block truncate text-[10px] text-popover-foreground">
              {attachment.filename}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
