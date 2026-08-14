import { useMemo, useState } from "react"
import { Button, cn } from "@buddy/ui"
import { BookOpenIcon, PlayIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import { Markdown } from "@/components/markdown/Markdown"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"
import { isFlashcardLeech } from "@/lib/flashcard"
import { REVIEW_CARD_RADIUS } from "./flashcard-review-surface"
import { isBasicFlashcardFields, isClozeFlashcardFields } from "./flashcard-card-content"
import { ClozeMarkdown } from "./flashcard-cloze-markdown"
import type { FlashcardStanding } from "./flashcard-deck-standing"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
} from "@buddy/sdk/types"

/**
 * The deck.
 *
 * Three groups, and the hierarchy between them is the design: a quiet identity
 * caption, the standing as the one thing that dominates, then a long list of
 * cards. Gaps run 4–20px inside a group against 28–40px between them; without
 * that ratio every line floats the same distance from every other line.
 *
 * The standing gets a container because a container binds as well as decorates
 * — but a plain inset surface, never the review card's paper and shadow, which
 * would read as a flashcard that wandered onto the deck page.
 */

type DeckCard = ObjectFlashcardDeckReadDeckResponse["cards"][number]
type DeckNote = ObjectFlashcardDeckReadDeckResponse["notes"][number]

const CARD_STATE_DOT: Record<DeckCard["state"], string> = {
  new: "bg-surface-interactive-base",
  learning: "bg-surface-warning-base",
  review: "bg-surface-success-base",
  relearning: "bg-surface-critical-base",
}

const CARD_STATE_LABEL: Record<DeckCard["state"], string> = {
  new: "workspaceFlashcard.cardStateNew",
  learning: "workspaceFlashcard.cardStateLearning",
  review: "workspaceFlashcard.cardStateReview",
  relearning: "workspaceFlashcard.cardStateRelearning",
}

const STANDING_RULE: Record<FlashcardStanding["tone"], string> = {
  ready: "bg-border-interactive-base",
  calm: "bg-border-base",
  limit: "bg-surface-warning-base",
}

const STANDING_EYEBROW: Record<FlashcardStanding["tone"], string> = {
  ready: "text-text-interactive-base",
  calm: "text-text-weaker",
  limit: "text-text-warning-base",
}

const EYEBROW = "text-[10px] font-medium uppercase tracking-[0.14em]"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const DECK_OVERVIEW_ESTIMATE_PX = 260
const DECK_CARD_ROW_ESTIMATE_PX = 68
const DECK_CARD_OPEN_ROW_ESTIMATE_PX = 220
const DECK_INITIAL_VIEWPORT_WIDTH_PX = 768
const DECK_INITIAL_VIEWPORT_HEIGHT_PX = 720
const DECK_INITIAL_VIEWPORT_RECT = {
  width: DECK_INITIAL_VIEWPORT_WIDTH_PX,
  height: DECK_INITIAL_VIEWPORT_HEIGHT_PX,
}

type DeckFilterID = "all" | "due" | "new" | "leech"

type DeckVirtualItem = { kind: "overview" } | { kind: "empty" } | { kind: "card"; card: DeckCard }

const DECK_FILTERS: { id: DeckFilterID; labelKey: string }[] = [
  { id: "all", labelKey: "flashcardDeck.filterAll" },
  { id: "due", labelKey: "flashcardDeck.filterDue" },
  { id: "new", labelKey: "flashcardDeck.filterNew" },
  { id: "leech", labelKey: "flashcardDeck.filterLeeches" },
]

/**
 * When a card comes back, in the coarsest unit that stays true. New cards have
 * no due date worth showing, so their state word takes the slot instead.
 */
function formatDue(card: DeckCard, now: number): string {
  if (card.state === "new") return language.t(CARD_STATE_LABEL.new)
  const deltaMs = card.due - now
  if (deltaMs <= 0) return language.t("flashcardDeck.dueNow")
  if (deltaMs < HOUR_MS) return `${Math.max(1, Math.round(deltaMs / MINUTE_MS))}m`
  if (deltaMs < DAY_MS) return `${Math.round(deltaMs / HOUR_MS)}h`
  return `${Math.round(deltaMs / DAY_MS)}d`
}

function DeckCardRow(props: {
  card: DeckCard
  note: DeckNote | undefined
  leech: boolean
  now: number
  open: boolean
  onToggle: () => void
}) {
  const { note } = props
  const stateLabel = language.t(CARD_STATE_LABEL[props.card.state])
  const frontClassName = cn(
    "pointer-events-none relative z-10 min-w-0 flex-1 text-[13.5px] leading-relaxed text-text-base [&_a]:pointer-events-auto [&_button]:pointer-events-auto",
    !props.open && "max-h-[2lh] overflow-hidden [&_[data-slot=markdown-copy-button]]:hidden",
  )

  return (
    <div className={cn("-mx-3 rounded-md px-3 transition-colors", props.open && "bg-surface-base")}>
      {/* Metadata sits in a right column, not under the question: underneath it
          reads as a continuation of the sentence and doubles the list's line
          count. State is the dot's job — the word only repeated the colour. */}
      <div className="relative flex w-full items-start gap-3 py-4 text-left">
        <button
          type="button"
          data-action="flashcard-deck-row-toggle"
          aria-expanded={props.open}
          aria-label={language.t(
            props.open ? "flashcardDeck.hideAnswer" : "flashcardDeck.showAnswer",
          )}
          onClick={props.onToggle}
          className="absolute inset-0 z-0 cursor-pointer rounded-md transition-colors hover:bg-surface-base/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
        />
        <span
          className={cn(
            "pointer-events-none relative z-10 mt-[7px] size-2 shrink-0 rounded-full",
            CARD_STATE_DOT[props.card.state],
          )}
          title={stateLabel}
          aria-label={stateLabel}
        />
        {note && isClozeFlashcardFields(note.fields) ? (
          <ClozeMarkdown
            text={note.fields.text}
            ordinal={props.card.templateIdx + 1}
            revealed={false}
            className={frontClassName}
          />
        ) : note && isBasicFlashcardFields(note.fields) ? (
          <Markdown text={note.fields.front} className={frontClassName} />
        ) : (
          <span className={frontClassName} />
        )}
        <span className="pointer-events-none relative z-10 mt-[3px] flex shrink-0 items-baseline gap-2 text-[11px] tabular-nums text-text-weaker">
          {props.leech ? (
            <span className="text-text-critical-base">
              {language.t("workspaceFlashcard.leechFlag")}
            </span>
          ) : null}
          <span>{formatDue(props.card, props.now)}</span>
        </span>
      </div>

      {props.open && note ? (
        <div className="pb-5 pl-[20px]">
          {isClozeFlashcardFields(note.fields) ? (
            <ClozeMarkdown
              text={note.fields.text}
              ordinal={props.card.templateIdx + 1}
              revealed
              className="max-w-[56ch] text-[13.5px] leading-relaxed text-text-interactive-base"
            />
          ) : isBasicFlashcardFields(note.fields) ? (
            <Markdown
              text={note.fields.back}
              className="max-w-[56ch] text-[13.5px] leading-relaxed text-text-interactive-base"
            />
          ) : null}
          {/* The guarantee, in a sentence rather than a shouted label. */}
          <p className="mt-5 text-[11px] leading-relaxed text-text-weaker">
            {language.t("flashcardDeck.peekGuarantee")}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function StandingBlock(props: { standing: FlashcardStanding; onAction: () => void }) {
  const { standing } = props

  return (
    <section className="flex flex-col rounded-md bg-surface-base px-5 py-5">
      <span className={cn(EYEBROW, STANDING_EYEBROW[standing.tone])}>{standing.eyebrow}</span>
      <div className={cn("mt-2 h-px w-full", STANDING_RULE[standing.tone])} />

      <p className="mt-4 text-[25px] font-semibold leading-[1.15] tracking-tight text-text-stronger">
        {standing.headline}
      </p>
      <p className="mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-text-weak">
        {standing.detail}
      </p>

      {/* A button only where there is a verb. When the queue is drained the
          honest answer is "nothing to do", so practice is a quiet link rather
          than a CTA arguing with the headline — and the link names the mode it
          opens, which is also the guarantee. */}
      {standing.action.mode === "study" ? (
        <div className="mt-5">
          <Button size="sm" onClick={props.onAction}>
            <PlayIcon data-icon="inline-start" aria-hidden />
            {standing.action.label}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={props.onAction}
          className="mt-4 w-fit cursor-pointer text-[12px] text-text-weak underline-offset-4 transition-colors hover:text-text-base hover:underline"
        >
          {standing.action.label}
        </button>
      )}
    </section>
  )
}

export function FlashcardDeckView(props: {
  deck: ObjectFlashcardDeckReadDeckResponse
  queue: ObjectFlashcardDeckQueuedCardsResponse
  standing: FlashcardStanding
  peekCardID: string | undefined
  onPeek: (cardID: string | undefined) => void
  onAction: () => void
}) {
  const { deck, queue } = props
  const [filter, setFilter] = useState<DeckFilterID>("all")
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const now = Date.now()

  const notesByID = useMemo(
    () => new Map(deck.notes.map((note) => [note.noteID, note])),
    [deck.notes],
  )
  /* The queue is the only authority on what is due. `cards` is intentionally a
     small payload window for review; queuedCardIDs is the complete admitted set
     and therefore the only correct source for a deck-wide filter. */
  const queuedCardIDs = useMemo(() => new Set(queue.queuedCardIDs), [queue.queuedCardIDs])

  const visibleCards = useMemo(() => {
    switch (filter) {
      case "due":
        return deck.cards.filter((card) => queuedCardIDs.has(card.cardID))
      case "new":
        return deck.cards.filter((card) => card.state === "new")
      case "leech":
        return deck.cards.filter((card) =>
          isFlashcardLeech(card.lapses, queue.resolvedConfig.leechThreshold),
        )
      case "all":
        return deck.cards
    }
  }, [deck.cards, filter, queue.resolvedConfig.leechThreshold, queuedCardIDs])

  const virtualItems = useMemo<DeckVirtualItem[]>(() => {
    const items: DeckVirtualItem[] = [{ kind: "overview" }]
    if (visibleCards.length === 0) {
      items.push({ kind: "empty" })
      return items
    }
    for (const card of visibleCards) items.push({ kind: "card", card })
    return items
  }, [visibleCards])

  return (
    <div
      ref={setScrollElement}
      data-component="flashcard-deck-view"
      className="absolute inset-0 flex min-h-0 flex-col overflow-y-auto px-6 py-6"
    >
      <div data-component="flashcard-deck-content" className="mx-auto w-full max-w-3xl">
        <VirtualizedRows
          items={virtualItems}
          getScrollElement={() => scrollElement}
          initialRect={DECK_INITIAL_VIEWPORT_RECT}
          getItemKey={(item) => (item.kind === "card" ? item.card.cardID : item.kind)}
          estimateSize={(item) => {
            if (item.kind === "overview") return DECK_OVERVIEW_ESTIMATE_PX
            if (item.kind === "empty") return DECK_CARD_ROW_ESTIMATE_PX
            return props.peekCardID === item.card.cardID
              ? DECK_CARD_OPEN_ROW_ESTIMATE_PX
              : DECK_CARD_ROW_ESTIMATE_PX
          }}
          measure
          renderItem={(item) => {
            if (item.kind === "overview") {
              return (
                <>
                  <header className="flex flex-col gap-1">
                    <h2 className="text-[15px] font-semibold leading-snug text-text-strong">
                      {deck.title}
                    </h2>
                    <p className="flex items-center gap-1.5 text-[11px] text-text-weaker">
                      <BookOpenIcon className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        {deck.source ? `${deck.source} · ` : ""}
                        {language.t(
                          deck.cards.length === 1
                            ? "workspaceFlashcard.cardCount.one"
                            : "workspaceFlashcard.cardCount.other",
                          { count: deck.cards.length },
                        )}
                      </span>
                    </p>
                  </header>

                  <div className="mt-7">
                    <StandingBlock standing={props.standing} onAction={props.onAction} />
                  </div>

                  <section className="mt-10 flex min-h-0 flex-col">
                    <div className="flex items-center justify-between gap-4 border-b border-border-base pb-2.5">
                      <span className={cn(EYEBROW, "text-text-weaker")}>
                        {language.t("flashcardDeck.eyebrowCards")}
                      </span>
                      <div className="flex items-center gap-3.5">
                        {DECK_FILTERS.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setFilter(entry.id)}
                            className={cn(
                              "cursor-pointer text-[11px] transition-colors",
                              entry.id === filter
                                ? "font-medium text-text-base"
                                : "text-text-weaker hover:text-text-base",
                            )}
                          >
                            {language.t(entry.labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                </>
              )
            }

            if (item.kind === "empty") {
              return (
                <p className="py-6 text-[12px] text-text-weaker">
                  {language.t("flashcardDeck.noCards")}
                </p>
              )
            }

            const card = item.card
            return (
              <div className={REVIEW_CARD_RADIUS}>
                <DeckCardRow
                  card={card}
                  note={notesByID.get(card.noteID)}
                  leech={isFlashcardLeech(card.lapses, queue.resolvedConfig.leechThreshold)}
                  now={now}
                  open={props.peekCardID === card.cardID}
                  onToggle={() =>
                    props.onPeek(props.peekCardID === card.cardID ? undefined : card.cardID)
                  }
                />
              </div>
            )
          }}
        />
      </div>
    </div>
  )
}
