import { useState } from "react"
import { Dialog, DialogContent, FolderIcon, cn } from "@buddy/ui"
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

  return (
    <>
      <div
        className={cn(
          "flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border-base bg-surface-weak transition-colors hover:border-border-hover",
          queued && "opacity-60",
        )}
        onClick={() => isImage && setPreviewOpen(true)}
        title={filename}
      >
        {isImage ? (
          <img className="h-full w-full object-cover" src={url} alt={filename} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-weak">
            <FolderIcon className="h-5 w-5" />
          </div>
        )}
      </div>

      {isImage && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
            <img src={url} alt={filename} className="w-full h-full object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
