import { lazy, Suspense, useState, type ReactNode } from "react"
import { Dialog, DialogContent } from "@buddy/ui"
import { resolveAssetUrl } from "../../../lib/resource-url"
import type { ToolAttachment } from "./registry"

const ToolAttachmentPdfPreview = lazy(async () => {
  const module = await import("./tool-attachment-pdf-preview")
  return { default: module.ToolAttachmentPdfPreview }
})

const TOOL_ATTACHMENT_LINK_CLASS =
  "inline-flex rounded-md border border-border-base bg-surface-weak px-2 py-1 text-xs text-text-base hover:bg-surface-weak/80"

function isInlineDataUrl(url: string) {
  return url.startsWith("data:") || url.startsWith("blob:")
}

function resolveAttachmentUrl(url: string) {
  if (isInlineDataUrl(url)) {
    return url
  }
  return resolveAssetUrl(url)
}

interface ToolAttachmentGalleryProps {
  attachments: ToolAttachment[]
}

function ToolAttachmentFileLink(props: { url: string; label: string; children: ReactNode }) {
  return (
    <a
      data-slot="tool-attachment-link"
      className={TOOL_ATTACHMENT_LINK_CLASS}
      href={props.url}
      target="_blank"
      rel="noreferrer"
      download={isInlineDataUrl(props.url) ? props.label : undefined}
    >
      {props.children}
    </a>
  )
}

function ToolAttachmentPdfLink(props: {
  attachmentID: string
  sourceUrl: string
  url: string
  label: string
}) {
  const [previewOpen, setPreviewOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        data-slot="tool-attachment-link"
        className={TOOL_ATTACHMENT_LINK_CLASS}
        onClick={() => setPreviewOpen(true)}
      >
        {`Open ${props.label}`}
      </button>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="h-[85vh] grid-rows-[minmax(0,1fr)] overflow-hidden p-0 sm:max-w-5xl">
          {previewOpen ? (
            <Suspense fallback={null}>
              <ToolAttachmentPdfPreview
                attachmentID={props.attachmentID}
                sourceUrl={props.sourceUrl}
                name={props.label}
                fallback={
                  <ToolAttachmentFileLink url={props.url} label={props.label}>
                    {isInlineDataUrl(props.url)
                      ? `Download ${props.label}`
                      : `Open ${props.label} in your browser`}
                  </ToolAttachmentFileLink>
                }
              />
            </Suspense>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
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
              className="flex max-w-sm flex-col gap-1 rounded-lg border border-border-base bg-background-base p-2"
            >
              <img
                data-slot="tool-attachment-image"
                className="h-auto w-full rounded-md"
                src={url}
                alt={label}
                loading="lazy"
              />
              <figcaption className="truncate text-xs text-text-weak">{label}</figcaption>
            </figure>
          )
        }

        if (isPdf) {
          return (
            <ToolAttachmentPdfLink
              key={attachment.id}
              attachmentID={attachment.id}
              sourceUrl={attachment.url}
              url={url}
              label={label}
            />
          )
        }

        return (
          <ToolAttachmentFileLink key={attachment.id} url={url} label={label}>
            {label}
          </ToolAttachmentFileLink>
        )
      })}
    </div>
  )
}
