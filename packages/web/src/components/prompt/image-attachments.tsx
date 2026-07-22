import { XIcon } from "@buddy/ui"
import { language } from "@/context/language"
import { FileAttachmentChip } from "@/components/files/file-attachment-chip"
import type { PromptComposerAttachment } from "./prompt-types"

type ImageAttachmentsProps = {
  attachments: PromptComposerAttachment[]
  unsupportedAttachmentIds?: Set<string>
  onRemove: (id: string) => void
  onRetry?: (id: string) => void
  onOpen?: (attachment: PromptComposerAttachment) => void
}

export function ImageAttachments({
  attachments,
  unsupportedAttachmentIds,
  onRemove,
  onRetry,
  onOpen,
}: ImageAttachmentsProps) {
  if (attachments.length === 0) return null

  return (
    <div
      data-component="prompt-attachments"
      className="flex flex-wrap items-start gap-2 px-3 pt-3"
    >
      {attachments.map((attachment) => (
        <AttachmentItem
          key={attachment.id}
          attachment={attachment}
          unsupported={unsupportedAttachmentIds?.has(attachment.id) ?? false}
          onRemove={onRemove}
          onRetry={onRetry}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function AttachmentItem(props: {
  attachment: PromptComposerAttachment
  unsupported: boolean
  onRemove: (id: string) => void
  onRetry?: (id: string) => void
  onOpen?: (attachment: PromptComposerAttachment) => void
}) {
  if (!props.attachment.mime.startsWith("image/")) {
    const status =
      props.attachment.kind === "native-resource" ? props.attachment.status : "ready"
    return (
      <FileAttachmentChip
        fileName={props.attachment.filename}
        mime={props.attachment.mime}
        status={status}
        className="w-[min(100%,260px)]"
        onRetry={status === "error" ? () => props.onRetry?.(props.attachment.id) : undefined}
        onRemove={() => props.onRemove(props.attachment.id)}
      />
    )
  }

  if (props.attachment.kind !== "image") return null

  const borderClassName = props.unsupported ? "border-border-warning-base" : "border-border-base"

  return (
    <div
      data-component="prompt-attachment-item"
      data-kind={props.attachment.kind}
      data-filename={props.attachment.filename}
      data-unsupported={props.unsupported ? "true" : undefined}
      className="relative group"
    >
      <img
        src={props.attachment.dataUrl}
        alt={props.attachment.filename}
        className={`size-16 rounded-lg border ${borderClassName} bg-surface-weak object-cover transition-colors hover:border-border-hover ${props.unsupported ? "opacity-60" : "cursor-pointer"}`}
        onClick={() => {
          if (!props.unsupported) props.onOpen?.(props.attachment)
        }}
      />

      <button
        type="button"
        data-action="prompt-attachment-remove"
        onClick={() => props.onRemove(props.attachment.id)}
        className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background-base border border-border-base flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-weak"
        aria-label={language.t("prompt.composer.removeAttachmentAria", {
          filename: props.attachment.filename,
        })}
      >
        <XIcon className="size-3 text-text-weak" />
      </button>

      <div className="absolute right-0 bottom-0 left-0 rounded-b-lg bg-[color:color-mix(in_oklab,var(--surface-raised-stronger-non-alpha)_78%,transparent)] px-1 py-0.5 backdrop-blur-[2px]">
        <span className="block truncate text-[10px] text-text-base">
          {props.attachment.filename}
        </span>
      </div>
      {props.unsupported ? (
        <div className="absolute top-1 left-1 rounded bg-surface-warning-strong px-1 py-0.5 text-[9px] font-medium text-text-on-warning-strong">
          unsupported
        </div>
      ) : null}
    </div>
  )
}
