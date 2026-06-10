import { resolveFileToolIcon, resolveFileToolPath } from "../file-tool-icon"
import { ToolRow, ToolRowIcon, ToolRowAction, ToolRowSubject, ToolRowArg } from "../tool-row"
import { resolveAssetUrl } from "../../../../lib/resource-url"
import { getReadPreviewImageAttachments, isReadImagePreview } from "../read-image-preview"
import { getSkillReferenceRowAction, resolveSkillReferenceInfo } from "../skill-reference"
import type { ToolPartProps } from "../registry"

export function renderReadTool({ state, info, icon }: ToolPartProps) {
  const filePath = resolveFileToolPath("read", state, info)
  const skillReference = resolveSkillReferenceInfo({
    filePath,
    title: info.title,
    subtitle: info.subtitle,
    detail: info.detail,
  })
  const active = state.status === "pending" || state.status === "running"
  const fileIcon = resolveFileToolIcon("read", state, info, icon)
  const imageAttachments = getReadPreviewImageAttachments({ state, filePath })
  const isImageRead = isReadImagePreview({ state, filePath })
  const action = skillReference ? `${getSkillReferenceRowAction(active)}:` : "read"
  const subject = skillReference?.displayName ?? info.subtitle

  return (
    <div className="flex flex-col gap-1.5">
      <ToolRow>
        <ToolRowIcon>{fileIcon?.("size-3.5")}</ToolRowIcon>
        <ToolRowAction>{isImageRead && info.subtitle ? info.subtitle : action}</ToolRowAction>
        {!isImageRead && subject ? <ToolRowSubject>{subject}</ToolRowSubject> : null}
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
