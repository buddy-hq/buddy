import { HoverCard, HoverCardContent, HoverCardTrigger, cn } from "@buddy/ui"
import { language } from "@/context/language"
import { XIcon } from "@/icons/app-icons"
import { CHAT_BODY_TEXT_STYLE } from "@/components/chat/chat-text-styles"
import {
  QUOTE_HOVER_CLOSE_DELAY_MS,
  QUOTE_HOVER_OPEN_DELAY_MS,
  QuoteDetail,
  QuoteOpenTarget,
  QuoteSourceIcon,
} from "@/components/citations/quote-content"
import { quoteView, type QuoteData } from "@/components/citations/quote-view"
import { CitationCommentPopover } from "./citation-comment-popover"

const CHIP_ACTION_CLASS =
  "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-text-weak transition-colors hover:bg-surface-strong hover:text-text-base"

export function QuoteChip(props: {
  data: QuoteData
  onRemove?: () => void
  onCommentChange?: (comment: string) => void
  onCommentSend?: (comment: string) => boolean | void
  canSend?: boolean
  onReturnFocus?: () => void
  className?: string
}) {
  const quote = quoteView(props.data)
  return (
    <div
      className={cn(
        "flex w-60 max-w-full min-w-0 items-start rounded-[10px] bg-(--composer-surface-bg) py-2 pl-3",
        props.className,
      )}
    >
      <HoverCard openDelay={QUOTE_HOVER_OPEN_DELAY_MS} closeDelay={QUOTE_HOVER_CLOSE_DELAY_MS}>
        <HoverCardTrigger asChild>
          <div className="min-w-0 flex-1">
            <QuoteOpenTarget citation={quote.citation} className="flex w-full min-w-0 gap-1.5">
              <span className="flex h-5 shrink-0 items-center">
                <QuoteSourceIcon quote={quote} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="block truncate text-xs leading-5" style={CHAT_BODY_TEXT_STYLE}>
                  <mark className="quote-mark">{quote.excerpt}</mark>
                </span>
                {quote.comment ? (
                  <span className="block truncate text-xs text-text-weak">{quote.comment}</span>
                ) : null}
              </span>
            </QuoteOpenTarget>
          </div>
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-96 max-w-[calc(100vw-2rem)] p-3"
        >
          <QuoteDetail quote={quote} />
        </HoverCardContent>
      </HoverCard>
      <div className="flex shrink-0 items-start gap-0.5 pr-1.5">
        {props.onCommentChange ? (
          <CitationCommentPopover
            citationID={quote.citation?.id}
            comment={quote.comment ?? ""}
            onSave={props.onCommentChange}
            onSend={props.onCommentSend}
            canSend={props.canSend}
            onReturnFocus={props.onReturnFocus}
            triggerClassName={CHIP_ACTION_CLASS}
          />
        ) : null}
        {props.onRemove ? (
          <button
            type="button"
            onClick={props.onRemove}
            aria-label={language.t("chat.selection.remove")}
            className={CHIP_ACTION_CLASS}
          >
            <XIcon className="size-3" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
