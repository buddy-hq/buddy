import { useMemo } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@buddy/ui"
import {
  QUOTE_HOVER_CLOSE_DELAY_MS,
  QUOTE_HOVER_OPEN_DELAY_MS,
  QuoteDetail,
  QuoteOpenTarget,
  QuoteSourceIcon,
} from "./quote-content"
import { quoteView, type QuoteData, type QuoteView } from "./quote-view"

export type QuoteBandItem = QuoteData & { id: string }

type TBandQuote = {
  id: string
  view: QuoteView
}

function QuoteBandNote(props: { quote: QuoteView }) {
  const { quote } = props
  return (
    <QuoteOpenTarget citation={quote.citation} className="flex min-w-0 gap-1.5">
      <span className="quote-excerpt flex h-[1lh] shrink-0 items-center">
        <QuoteSourceIcon quote={quote} className="size-[1.15em]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-2.5">
        <span className="quote-excerpt line-clamp-1 break-all">
          <mark className="quote-mark">{quote.excerpt}</mark>
        </span>
        {quote.comment ? (
          <span className="quote-comment line-clamp-2 break-words">{quote.comment}</span>
        ) : null}
      </span>
    </QuoteOpenTarget>
  )
}

export function QuoteBand(props: { items: readonly QuoteBandItem[] }) {
  const quotes = useMemo<TBandQuote[]>(
    () => props.items.map((item) => ({ id: item.id, view: quoteView(item) })),
    [props.items],
  )
  return (
    <HoverCard openDelay={QUOTE_HOVER_OPEN_DELAY_MS} closeDelay={QUOTE_HOVER_CLOSE_DELAY_MS}>
      <HoverCardTrigger asChild>
        <div data-chat-typography className="quote-band flex max-w-[64ch] flex-col gap-6 px-4 py-4">
          {quotes.map((quote) => (
            <QuoteBandNote key={quote.id} quote={quote.view} />
          ))}
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="end"
        sideOffset={8}
        className="flex max-h-[min(70vh,var(--radix-hover-card-content-available-height))] w-(--radix-hover-card-trigger-width) max-w-[calc(100vw-2rem)] flex-col gap-5 overflow-y-auto p-3"
      >
        {quotes.map((quote) => (
          <QuoteDetail key={quote.id} quote={quote.view} />
        ))}
      </HoverCardContent>
    </HoverCard>
  )
}
