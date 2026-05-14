import { Eye } from "lucide-react"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject, ToolRowArg } from "../tool-row"
import { resolveAssetUrl } from "../../../../lib/resource-url"
import { getReadPreviewImageAttachments, isReadImagePreview } from "../read-image-preview"
import type { ToolPartProps } from "../registry"

export function renderReadTool({ state, info, icon }: ToolPartProps) {
  const imageAttachments = getReadPreviewImageAttachments({ state, filePath: info.subtitle })
  const isImageRead = isReadImagePreview({ state, filePath: info.subtitle })

  return (
    <div className="flex flex-col gap-1.5">
      <ToolRow>
        <ToolRowIcon>{isImageRead ? <Eye className="size-3.5" /> : icon?.("size-3.5")}</ToolRowIcon>
        <ToolRowAction>{isImageRead && info.subtitle ? info.subtitle : "read"}</ToolRowAction>
        {!isImageRead && info.subtitle ? <ToolRowSubject>{info.subtitle}</ToolRowSubject> : null}
        {info.args?.map((arg) => (
          <ToolRowArg key={arg}>{arg}</ToolRowArg>
        ))}
      </ToolRow>
      {imageAttachments.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto">
          {imageAttachments.map((attachment) => {
            const url =
              attachment.url.startsWith("data:") || attachment.url.startsWith("blob:")
                ? attachment.url
                : resolveAssetUrl(attachment.url)
            const label = attachment.filename ?? "image"

            return (
              <img
                key={attachment.id}
                src={url}
                alt={label}
                className="max-h-28 w-auto shrink-0 rounded-md border border-border-base object-contain bg-surface-weaker"
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
