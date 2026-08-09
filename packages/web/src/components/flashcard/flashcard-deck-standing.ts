import { language } from "@/context/language"
import { getFlashcardDueCount } from "@/lib/flashcard"
import type {
  ObjectFlashcardDeckQueuedCardsResponse,
  ObjectFlashcardDeckReadDeckResponse,
} from "@buddy/sdk/types"

/**
 * Where a deck stands, in one sentence.
 *
 * The scheduler already decides why a queue is empty and by how much; this
 * turns that decision into the copy the deck and the end of a session both
 * show. Both surfaces read from here so they can never disagree about why you
 * stopped — the deck's headline and the session's closing line are the same
 * fact addressed to someone arriving and someone leaving.
 *
 * Every value below comes from `queuedCards.completion` or `readDeck.config`.
 * Nothing is reconstructed from raw cards: the queue builder is the only place
 * allowed to decide availability.
 */

export type FlashcardStandingID =
  | "due"
  | "fresh"
  | "learning-wait"
  | "limit-review"
  | "limit-new"
  | "clear"

/**
 * Only two verbs exist, because only two are backed. `study` runs the real
 * queuedCards → submitReview loop; `practice` reads the deck and rates nothing.
 */
export type FlashcardStandingAction = { label: string; mode: "study" | "practice" }

export type FlashcardStanding = {
  id: FlashcardStandingID
  eyebrow: string
  headline: string
  detail: string
  /** The closing line when a session drains for this reason. */
  sessionLine: string
  action: FlashcardStandingAction
  tone: "ready" | "calm" | "limit"
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/**
 * A wait, in the coarsest unit that is still true. Anything past today reads as
 * a clock time rather than a countdown, because "in 14 hours" is not how anyone
 * thinks about tomorrow morning.
 */
function formatWait(target: number, now: number): string {
  const deltaMs = target - now
  if (deltaMs <= MINUTE_MS) return language.t("flashcardDeck.waitMoments")
  if (deltaMs < HOUR_MS) {
    return language.t("flashcardDeck.waitMinutes", { count: Math.round(deltaMs / MINUTE_MS) })
  }
  if (deltaMs < 6 * HOUR_MS) {
    return language.t("flashcardDeck.waitHours", { count: Math.round(deltaMs / HOUR_MS) })
  }
  return new Date(target).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function neverStudied(deck: ObjectFlashcardDeckReadDeckResponse): boolean {
  return deck.cards.length > 0 && deck.cards.every((card) => card.reps === 0)
}

export function resolveFlashcardStanding(input: {
  deck: ObjectFlashcardDeckReadDeckResponse
  queue: ObjectFlashcardDeckQueuedCardsResponse
  now: number
}): FlashcardStanding {
  const { deck, queue } = input
  const { completion } = queue
  const dueCount = getFlashcardDueCount(queue)

  if (dueCount > 0) {
    const parts: string[] = []
    if (queue.newCount > 0)
      parts.push(language.t("flashcardDeck.partNew", { count: queue.newCount }))
    if (queue.learningCount > 0) {
      parts.push(language.t("flashcardDeck.partLearning", { count: queue.learningCount }))
    }
    if (queue.reviewCount > 0) {
      parts.push(language.t("flashcardDeck.partReview", { count: queue.reviewCount }))
    }

    if (neverStudied(deck)) {
      const perDay = Math.max(1, queue.resolvedConfig.newPerDay)
      const days = Math.ceil(deck.cards.length / perDay)
      return {
        id: "fresh",
        eyebrow: language.t("flashcardDeck.eyebrowNewDeck"),
        headline: language.t("flashcardDeck.freshHeadline", { count: deck.cards.length }),
        detail: language.t(
          days === 1 ? "flashcardDeck.freshDetail.one" : "flashcardDeck.freshDetail.other",
          {
            perDay,
            days,
          },
        ),
        sessionLine: language.t("flashcardDeck.freshSession"),
        action: { label: language.t("flashcardDeck.actionStart"), mode: "study" },
        tone: "ready",
      }
    }

    return {
      id: "due",
      eyebrow: language.t("flashcardDeck.eyebrowReady"),
      headline: language.t("flashcardDeck.dueHeadline", { count: dueCount }),
      detail: parts.join(" · "),
      sessionLine: language.t("flashcardDeck.dueSession", { count: dueCount }),
      action: {
        label: language.t("flashcardDeck.actionStudy", { count: dueCount }),
        mode: "study",
      },
      tone: "ready",
    }
  }

  const practice: FlashcardStandingAction = {
    label: language.t("flashcardDeck.actionPractice"),
    mode: "practice",
  }

  /* A limit that is actively holding cards back is the most useful thing to
     say, so it outranks a learning wait: the wait resolves itself in minutes,
     the limit does not resolve until the rollover. */
  if (completion.reviewLimitReached) {
    return {
      id: "limit-review",
      eyebrow: language.t("flashcardDeck.eyebrowDailyLimit"),
      headline: language.t("flashcardDeck.reviewLimitHeadline"),
      detail: language.t("flashcardDeck.reviewLimitDetail", {
        done: completion.reviewedToday.reviewCount,
        limit: queue.resolvedConfig.reviewsPerDay,
        held: completion.reviewHeldBack,
      }),
      sessionLine: language.t("flashcardDeck.reviewLimitSession", {
        limit: queue.resolvedConfig.reviewsPerDay,
        held: completion.reviewHeldBack,
      }),
      action: practice,
      tone: "limit",
    }
  }

  if (completion.newLimitReached) {
    return {
      id: "limit-new",
      eyebrow: language.t("flashcardDeck.eyebrowDailyLimit"),
      headline: language.t("flashcardDeck.newLimitHeadline"),
      detail: language.t("flashcardDeck.newLimitDetail", {
        done: completion.reviewedToday.newCount,
        limit: queue.resolvedConfig.newPerDay,
        held: completion.newHeldBack,
      }),
      sessionLine: language.t("flashcardDeck.newLimitSession", {
        limit: queue.resolvedConfig.newPerDay,
        held: completion.newHeldBack,
      }),
      action: practice,
      tone: "limit",
    }
  }

  if (
    completion.learningLaterToday > 0 &&
    completion.nextLearningAt !== null &&
    completion.nextLearningAt !== undefined
  ) {
    const wait = formatWait(completion.nextLearningAt, input.now)
    return {
      id: "learning-wait",
      eyebrow: language.t("flashcardDeck.eyebrowScheduled"),
      headline: language.t("flashcardDeck.learningHeadline", { wait }),
      detail: language.t("flashcardDeck.learningDetail", {
        count: completion.learningLaterToday,
      }),
      sessionLine: language.t("flashcardDeck.learningSession", {
        count: completion.learningLaterToday,
        wait,
      }),
      action: practice,
      tone: "calm",
    }
  }

  return {
    id: "clear",
    eyebrow: language.t("flashcardDeck.eyebrowClear"),
    headline: language.t("flashcardDeck.clearHeadline"),
    detail:
      completion.returningLater > 0
        ? language.t("flashcardDeck.clearDetail", { count: completion.returningLater })
        : language.t("flashcardDeck.clearDetailNone"),
    sessionLine:
      completion.returningLater > 0
        ? language.t("flashcardDeck.clearSession", { count: completion.returningLater })
        : language.t("flashcardDeck.clearSessionNone"),
    action: practice,
    tone: "calm",
  }
}
