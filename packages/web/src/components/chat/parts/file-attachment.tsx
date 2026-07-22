import { useState } from "react"
import { Dialog, DialogContent, cn } from "@buddy/ui"
import { language } from "@/context/language"
import { FileAttachmentChip } from "@/components/files/file-attachment-chip"
import type { ChatFilePart } from "../utils/part-guards"

type FileAttachmentPartProps = {
  part: ChatFilePart
  queued?: boolean
}

export function FileAttachmentPart({ part, queued }: FileAttachmentPartProps) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const url = part.url
  const filename = part.filename ?? ""
  const mime = part.mime
  const isImage = mime.startsWith("image/")

  if (!isImage) {
    return (
      <FileAttachmentChip
        fileName={filename || language.t("files.attachment.genericType")}
        mime={mime}
        className={cn(queued && "opacity-60")}
      />
    )
  }

  return (
    <>
      <div
        className={cn(
          "flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border-base bg-surface-weak transition-colors hover:border-border-hover",
          queued && "opacity-60",
        )}
        onClick={() => setPreviewOpen(true)}
        title={filename}
      >
        <img className="h-full w-full object-cover" src={url} alt={filename} />
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
          <img src={url} alt={filename} className="w-full h-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  )
}
