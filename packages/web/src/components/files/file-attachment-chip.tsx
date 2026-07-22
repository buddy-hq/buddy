import { cn, Spinner } from "@buddy/ui"
import { useEffect, useState } from "react"
import { language } from "@/context/language"
import { AlertCircleIcon, XIcon } from "@/icons/app-icons"
import { fileExtensionFromPath } from "@/lib/workspace-file-paths"
import { FileTypeIcon } from "./file-type-icon"

/**
 * A non-image file rendered as a named chip: the real file-type glyph from the
 * shared icon library (the same one the explorer uses) + the filename + a short
 * type label. Shared by the composer's attachment tray and the sent-message
 * transcript so an attached spreadsheet/PDF/doc reads the same everywhere,
 * instead of the old anonymous folder square.
 */

// Friendlier labels for the common office/document types; everything else falls
// back to the uppercased extension (e.g. "SVG"), then the mime subtype.
const FRIENDLY_FILE_TYPE_BY_EXTENSION: Record<string, string> = {
  xls: "Excel spreadsheet",
  xlsb: "Excel spreadsheet",
  xlsm: "Excel spreadsheet",
  xlsx: "Excel spreadsheet",
  numbers: "Numbers spreadsheet",
  ods: "Spreadsheet",
  csv: "CSV table",
  tsv: "Table",
  doc: "Word document",
  docx: "Word document",
  odt: "Document",
  rtf: "Rich text",
  txt: "Text",
  md: "Markdown",
  mdx: "Markdown",
  pdf: "PDF",
  ppt: "PowerPoint",
  pptx: "PowerPoint",
  key: "Keynote",
  odp: "Presentation",
  json: "JSON",
  zip: "Archive",
}

function describeFileType(fileName: string, mime?: string): string {
  const extension = fileExtensionFromPath(fileName)
  const friendly = FRIENDLY_FILE_TYPE_BY_EXTENSION[extension]
  if (friendly) return friendly
  if (extension) return extension.toUpperCase()
  const subtype = mime?.split("/")[1]
  if (subtype) return subtype.toUpperCase()
  return language.t("files.attachment.genericType")
}

type FileAttachmentChipProps = {
  fileName: string
  mime?: string
  onClick?: () => void
  onRemove?: () => void
  onRetry?: () => void
  status?: "copying" | "ready" | "error"
  className?: string
}

export const FILE_ATTACHMENT_SPINNER_DELAY_MS = 150

export function FileAttachmentChip({
  fileName,
  mime,
  onClick,
  onRemove,
  onRetry,
  status = "ready",
  className,
}: FileAttachmentChipProps) {
  const typeLabel = describeFileType(fileName, mime)
  const [spinnerVisible, setSpinnerVisible] = useState(false)
  const retryable = status === "error" && Boolean(onRetry)
  const interactive = Boolean(onClick) || retryable
  const subtitle =
    status === "copying" ? "Copying…" : status === "error" ? "Copy failed" : typeLabel

  useEffect(() => {
    if (status !== "copying") {
      setSpinnerVisible(false)
      return
    }

    const timer = window.setTimeout(() => {
      setSpinnerVisible(true)
    }, FILE_ATTACHMENT_SPINNER_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  function activate(): void {
    if (retryable) {
      onRetry?.()
      return
    }
    onClick?.()
  }

  return (
    <div
      data-component="file-attachment-chip"
      data-filename={fileName}
      data-status={status}
      className={cn(
        "group/file-chip relative flex max-w-[min(100%,260px)] items-center gap-2.5 rounded-xl border border-border-base bg-surface-weak py-1.5 pr-3 pl-2 transition-colors",
        interactive && "cursor-pointer hover:border-border-hover",
        className,
      )}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (!interactive || (event.key !== "Enter" && event.key !== " ")) return
        event.preventDefault()
        activate()
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={retryable ? `${fileName}: Copy failed. Click to retry.` : fileName}
      aria-label={retryable ? `Retry copying ${fileName}` : undefined}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-weak-base bg-surface-raised-base">
        {status === "copying" && spinnerVisible ? (
          <Spinner className="size-4 text-text-weak" aria-label="Copying file" />
        ) : status === "error" ? (
          <AlertCircleIcon className="size-5 text-icon-critical-base" aria-hidden="true" />
        ) : (
          <FileTypeIcon fileName={fileName} className="size-5" />
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium leading-4 text-text-base">
          {fileName}
        </span>
        <span
          className={cn(
            "truncate text-[11px] leading-4",
            status === "error" ? "text-text-critical-base" : "text-text-weaker",
          )}
          aria-live="polite"
        >
          {subtitle}
        </span>
      </span>

      {onRemove ? (
        <button
          type="button"
          data-action="file-attachment-chip-remove"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-border-base bg-background-base text-text-weak opacity-0 transition-opacity hover:bg-surface-weak group-hover/file-chip:opacity-100 focus-visible:opacity-100"
          aria-label={language.t("prompt.composer.removeAttachmentAria", { filename: fileName })}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
