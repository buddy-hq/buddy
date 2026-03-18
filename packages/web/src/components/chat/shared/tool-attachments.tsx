import { resolveApiUrl } from "../../../lib/api-client"
import type { ToolAttachment } from "../tools/registry"

function resolveAttachmentUrl(url: string) {
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url
  }
  return resolveApiUrl(url)
}

interface ToolAttachmentGalleryProps {
  attachments: ToolAttachment[]
}

export function ToolAttachmentGallery({ attachments }: ToolAttachmentGalleryProps) {
  if (attachments.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment) => {
        const url = resolveAttachmentUrl(attachment.url)
        const label = attachment.filename ?? "attachment"
        const isImage = attachment.mime.startsWith("image/")
        const isPdf = attachment.mime === "application/pdf"

        if (isImage) {
          return (
            <figure
              key={attachment.id}
              data-slot="tool-attachment"
              className="flex max-w-sm flex-col gap-1 rounded-lg border border-border bg-background p-2"
            >
              <img
                data-slot="tool-attachment-image"
                className="h-auto w-full rounded-md"
                src={url}
                alt={label}
                loading="lazy"
              />
              <figcaption className="truncate text-xs text-muted-foreground">{label}</figcaption>
            </figure>
          )
        }

        return (
          <a
            key={attachment.id}
            data-slot="tool-attachment-link"
            className="inline-flex rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted/80"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            {isPdf ? `Open ${label}` : label}
          </a>
        )
      })}
    </div>
  )
}
