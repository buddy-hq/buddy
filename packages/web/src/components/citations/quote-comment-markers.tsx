import { useMemo } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@buddy/ui"
import { language } from "@/context/language"
import type { StagedQuote } from "@/lib/citations/staged-quotes"
import { QUOTE_HOVER_CLOSE_DELAY_MS, QUOTE_HOVER_OPEN_DELAY_MS, QuoteDetail } from "./quote-content"
import { quoteView } from "./quote-view"

export const QUOTE_COMMENT_MARKER_SIZE_PX = 20

const MARKER_LIFT_PX = 3

const SAME_LINE_TOLERANCE_PX = 8

export type QuoteCommentAnchor = {
  quote: StagedQuote
  top: number
  left: number
}

export type QuoteCommentMarkerGroup = {
  key: string
  top: number
  left: number
  quotes: StagedQuote[]
}

export function groupQuoteCommentAnchors(
  anchors: readonly QuoteCommentAnchor[],
): QuoteCommentMarkerGroup[] {
  const groups: QuoteCommentMarkerGroup[] = []
  for (const anchor of anchors.toSorted((left, right) => left.top - right.top)) {
    const line = groups.find(
      (group) =>
        Math.abs(group.top - anchor.top) <= SAME_LINE_TOLERANCE_PX &&
        Math.abs(group.left - anchor.left) <= SAME_LINE_TOLERANCE_PX,
    )
    if (line) {
      line.quotes.push(anchor.quote)
      continue
    }
    groups.push({
      key: anchor.quote.citation.id,
      top: anchor.top,
      left: anchor.left,
      quotes: [anchor.quote],
    })
  }
  return groups
}

function QuoteCommentMarker(props: { group: QuoteCommentMarkerGroup }) {
  const { group } = props
  const quotes = useMemo(
    () =>
      group.quotes.map((quote) => ({
        quote,
        view: quoteView({ text: quote.citation.excerpt, citation: quote.citation }),
      })),
    [group.quotes],
  )
  return (
    <HoverCard openDelay={QUOTE_HOVER_OPEN_DELAY_MS} closeDelay={QUOTE_HOVER_CLOSE_DELAY_MS}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-component="quote-comment-marker"
          aria-label={language.t("chat.selection.commentMarker")}
          className="pointer-events-auto absolute flex -translate-y-1/2 items-center justify-center rounded-full rounded-bl-[3px] bg-surface-interactive-base text-[11px] leading-none font-semibold text-text-on-interactive-base cursor-default shadow-sm transition-transform hover:scale-110"
          style={{
            top: group.top - MARKER_LIFT_PX,
            left: group.left,
            width: QUOTE_COMMENT_MARKER_SIZE_PX,
            height: QUOTE_COMMENT_MARKER_SIZE_PX,
          }}
        >
          {group.quotes.length}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="left"
        align="start"
        sideOffset={8}
        className="flex max-h-[min(70vh,var(--radix-hover-card-content-available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col gap-5 overflow-y-auto p-3"
      >
        {quotes.map(({ quote, view }) => (
          <QuoteDetail key={quote.citation.id} quote={view} />
        ))}
      </HoverCardContent>
    </HoverCard>
  )
}

export function QuoteCommentMarkers(props: { anchors: readonly QuoteCommentAnchor[] }) {
  const groups = useMemo(() => groupQuoteCommentAnchors(props.anchors), [props.anchors])
  if (groups.length === 0) return null
  return (
    <div data-quote-comment-markers className="pointer-events-none absolute inset-0 z-[4]">
      {groups.map((group) => (
        <QuoteCommentMarker key={group.key} group={group} />
      ))}
    </div>
  )
}
