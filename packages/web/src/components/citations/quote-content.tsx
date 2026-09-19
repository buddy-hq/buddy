import type { ReactNode } from "react"
import type { Citation } from "@buddy/citation-contract"
import { cn, toast } from "@buddy/ui"
import { FileTypeIcon } from "@/components/files/file-type-icon"
import { MessageSquareTextIcon, QuoteIcon } from "@/icons/app-icons"
import { requestCitationNavigation } from "@/lib/citations/navigation"
import { fileNameFromPath } from "@/lib/workspace-file-paths"
import type { QuoteView } from "./quote-view"
import "./citations.css"

export const QUOTE_HOVER_OPEN_DELAY_MS = 300
export const QUOTE_HOVER_CLOSE_DELAY_MS = 100

export function openCitationSource(citation: Citation) {
  void requestCitationNavigation(citation).then(
    (opened) => {
      if (!opened) toast.warning("The citation source is not currently available.")
    },
    () => toast.warning("The citation source is not currently available."),
  )
}

export function QuoteSourceIcon(props: { quote: QuoteView; className?: string }) {
  const className = cn("size-3.5 shrink-0", props.className)
  if (props.quote.path) {
    return <FileTypeIcon fileName={fileNameFromPath(props.quote.path)} className={className} />
  }
  if (props.quote.kind === "chat") {
    return <MessageSquareTextIcon className={cn(className, "text-icon-base")} />
  }
  return <QuoteIcon className={cn(className, "text-icon-base")} />
}

export function QuoteOpenTarget(props: {
  citation: Citation | undefined
  className?: string
  children: ReactNode
}) {
  const { citation } = props
  if (!citation) return <span className={props.className}>{props.children}</span>
  return (
    <button
      type="button"
      onClick={() => openCitationSource(citation)}
      className={cn("group/open cursor-pointer text-left", props.className)}
    >
      {props.children}
    </button>
  )
}

export function QuoteDetail(props: { quote: QuoteView }) {
  const { quote } = props
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <QuoteOpenTarget
        citation={quote.citation}
        className="flex h-5 min-w-0 items-center gap-1.5 self-start"
      >
        <QuoteSourceIcon quote={quote} />
        <span className="min-w-0 truncate text-[11px] text-text-weaker underline-offset-2 group-hover/open:underline">
          {quote.label}
        </span>
      </QuoteOpenTarget>
      <div className="quote-excerpt max-h-60 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words">
        <mark className="quote-mark">{quote.excerpt}</mark>
      </div>
      {quote.comment ? (
        <p className="quote-comment max-h-40 overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words">
          {quote.comment}
        </p>
      ) : null}
    </div>
  )
}
