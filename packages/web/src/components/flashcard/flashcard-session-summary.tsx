import { Button, cn } from "@buddy/ui"
import { language } from "@/context/language"
import {
  REVIEW_CARD_CHROME,
  REVIEW_CARD_RADIUS,
  REVIEW_RATING_TONE,
  REVIEW_STAGE_BACKGROUND,
} from "./flashcard-review-surface"
import type { CardRating, FlashcardSessionTally } from "./flashcard-review-session"
import type { FlashcardStanding } from "./flashcard-deck-standing"

/**
 * The end of a sitting.
 *
 * Three answers in priority order: what you did, why it stopped, what's next.
 * The middle one is `standing.sessionLine` — the same sentence the deck will
 * greet you with when you land back on it, sourced from the same place so the
 * two can never disagree.
 *
 * "What's next" is the other decks still waiting rather than canned chat
 * prompts: the drawer already knows every deck's queue, while firing a prompt
 * would need composer wiring that does not exist.
 */

const RATING_ORDER: CardRating[] = ["again", "hard", "good", "easy"]
const EYEBROW = "text-[10px] font-medium uppercase tracking-[0.14em] text-text-weaker"
const SUMMARY_MAX_W_PX = 460

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS

function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(1, Math.round(elapsedMs / SECOND_MS))
  if (elapsedMs < MINUTE_MS) return `${totalSeconds}s`
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
}

export type FlashcardUpNextDeck = {
  objectID: string
  title: string
  dueCount: number
}

export function FlashcardSessionSummary(props: {
  deckTitle: string
  tally: FlashcardSessionTally
  standing: FlashcardStanding
  upNext: FlashcardUpNextDeck[]
  onBackToDeck: () => void
  onPractice: () => void
  onOpenDeck: (objectID: string) => void
}) {
  const { tally } = props
  const total = Math.max(1, tally.reviewed)
  const ratings = RATING_ORDER.filter((rating) => tally.ratings[rating] > 0)

  return (
    <div
      data-component="flashcard-session-summary"
      className={cn("flex h-full min-h-0 flex-col", REVIEW_STAGE_BACKGROUND)}
    >
      <header className="flex h-11 shrink-0 items-center gap-3 px-4">
        <span className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-[0.14em] text-text-weaker">
          {props.deckTitle}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-weaker">
          {tally.reviewed}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-5">
        <div
          className={cn(
            "flex max-h-full w-full flex-col overflow-y-auto p-7",
            REVIEW_CARD_RADIUS,
            REVIEW_CARD_CHROME,
          )}
          style={{ maxWidth: SUMMARY_MAX_W_PX }}
        >
          {/* What you did. The bar and counts belong to the headline, so they
              sit 10–12px under it while the next block sits 28px away. */}
          <span className={EYEBROW}>{language.t("flashcardDeck.eyebrowSession")}</span>
          <p className="mt-3.5 text-[24px] font-semibold leading-tight tracking-tight text-text-stronger">
            {language.t("flashcardDeck.sessionHeadline", {
              count: tally.reviewed,
              duration: formatDuration(tally.elapsedMs),
            })}
          </p>
          {/* The strip carries the colour; the counts read plainly rather than
              repeating it word for word in four accents. */}
          <div className="mt-3 flex h-1 w-full overflow-hidden">
            {ratings.map((rating) => (
              <span
                key={rating}
                className={REVIEW_RATING_TONE[rating].rule}
                style={{ width: `${(tally.ratings[rating] / total) * 100}%` }}
                aria-hidden
              />
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-text-weaker">
            {ratings
              .map(
                (rating) =>
                  `${tally.ratings[rating]} ${language.t(
                    `workspaceFlashcard.rating${rating.charAt(0).toUpperCase()}${rating.slice(1)}`,
                  )}`,
              )
              .join(" · ")}
          </p>

          {/* Why it stopped — the deck's own sentence. */}
          <p className="mt-7 max-w-[42ch] text-[13.5px] leading-relaxed text-text-weak">
            {props.standing.sessionLine}
          </p>

          {/* One verb, one button. Practice is the quiet alternative. */}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Button size="sm" onClick={props.onBackToDeck}>
              {language.t("flashcardDeck.backToDeck")}
            </Button>
            <button
              type="button"
              onClick={props.onPractice}
              className="cursor-pointer text-[12px] text-text-weak underline-offset-4 transition-colors hover:text-text-base hover:underline"
            >
              {language.t("flashcardDeck.actionPractice")}
            </button>
          </div>

          <div className="mt-9 flex flex-col">
            <span className={EYEBROW}>{language.t("flashcardDeck.eyebrowUpNext")}</span>
            {props.upNext.length === 0 ? (
              <p className="mt-2 text-[12px] text-text-weaker">
                {language.t("flashcardDeck.upNextEmpty")}
              </p>
            ) : (
              <div className="mt-1 flex flex-col">
                {props.upNext.map((entry) => (
                  <button
                    key={entry.objectID}
                    type="button"
                    onClick={() => props.onOpenDeck(entry.objectID)}
                    className="group -mx-2 flex cursor-pointer items-baseline gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-surface-base"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text-base">
                      {entry.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-weaker transition-colors group-hover:text-text-interactive-base">
                      {language.t("flashcardDeck.upNextDue", { count: entry.dueCount })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
