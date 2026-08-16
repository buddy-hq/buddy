import { cn } from "@buddy/ui"
import { language } from "@/context/language"
import { QuoteIcon, XIcon } from "@/icons/app-icons"
import { parseTString } from "@/components/chat/tools/types"
import { FileTypeIcon } from "@/components/files/file-type-icon"

/**
 * A passage the user pulled from a document, rendered as a citation rather than
 * a chat bubble. Two densities share one look (the `composer-surface-clip`
 * grain material — quote-rail + softer fill, see composer-surfaces.css):
 *
 * - `inline` — the full card shown in the transcript: labelled header, a
 *   height-capped mono excerpt that scrolls only on hover, and a file
 *   attribution footer.
 * - `chip` — the compact, removable form shown over the composer: the same
 *   label + a one-line mono preview.
 *
 * The excerpt is set in the mono (code) font on purpose: it reads as a verbatim
 * clipping, clearly distinct from the sans chat around it, and respects the
 * user's configured code font.
 */
export type SelectionClipData = {
  text: string
  source?: "reading" | "markdown"
  path?: string
  headingPath?: string[]
  tocLabel?: string
  pageLabel?: string
  locationLabel?: string
}

function clipTitle(source: SelectionClipData["source"]): string {
  return source === "markdown"
    ? language.t("chat.selection.documentTitle")
    : language.t("chat.selection.passageTitle")
}

function basename(path: string): string {
  const segments = path.split(/[\\/]/)
  return segments[segments.length - 1] || path
}

/** Location metadata (heading trail / toc / page / location), sans the path. */
function clipLocation(data: SelectionClipData): string | undefined {
  const parts = [
    data.headingPath && data.headingPath.length > 0 ? data.headingPath.join(" / ") : undefined,
    data.tocLabel,
    data.pageLabel,
    data.locationLabel,
  ].flatMap((value) => {
    const text = parseTString(value)
    return text !== undefined && text.length > 0 ? [text] : []
  })
  return parts.length > 0 ? parts.join(" · ") : undefined
}

export function SelectionClip({
  data,
  variant,
  onRemove,
  className,
}: {
  data: SelectionClipData
  variant: "inline" | "chip"
  onRemove?: () => void
  className?: string
}) {
  const title = clipTitle(data.source)
  const location = clipLocation(data)

  if (variant === "chip") {
    const detail = [data.path ? basename(data.path) : undefined, location]
      .flatMap((value) => {
        const text = parseTString(value)
        return text !== undefined && text.length > 0 ? [text] : []
      })
      .join(" · ")
    return (
      <div
        className={cn(
          "composer-surface-clip composer-grain relative flex max-w-[min(72%,52ch)] items-stretch overflow-hidden",
          className,
        )}
      >
        <div className="min-w-0 flex-1 py-1.5 pr-1.5 pl-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-text-weaker uppercase">
            <QuoteIcon className="size-3 shrink-0" />
            <span className="truncate">
              {title}
              {detail ? <span className="text-text-weak/60"> · {detail}</span> : null}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] leading-4 text-text-weak">
            {data.text}
          </div>
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={language.t("chat.selection.remove")}
            className="relative z-[3] my-1 mr-1 inline-flex size-5 shrink-0 items-center justify-center self-start rounded-full text-text-weak transition-colors hover:bg-surface-strong hover:text-text-base"
          >
            <XIcon className="size-3" />
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className={cn("composer-surface-clip composer-grain relative overflow-hidden", className)}>
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 text-[11px] font-medium tracking-wide text-text-weaker uppercase">
        <QuoteIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {location ? (
          <span className="min-w-0 truncate text-[11px] font-normal tracking-normal text-text-weak/70 normal-case">
            {location}
          </span>
        ) : null}
      </div>
      <div className="composer-scroll-hover max-h-[200px] overflow-y-auto px-3">
        <div className="font-mono text-[13px] leading-6 whitespace-pre-wrap break-words text-text-base">
          {data.text}
        </div>
      </div>
      {data.path ? (
        <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-2.5 text-[11px] text-text-weak">
          <FileTypeIcon fileName={basename(data.path)} className="size-3.5 shrink-0" />
          <span className="truncate">{data.path}</span>
        </div>
      ) : null}
    </div>
  )
}
