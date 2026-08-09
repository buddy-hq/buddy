import { useCallback, useEffect, useMemo } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { cn } from "@buddy/ui"
import { language } from "@/context/language"
import { objectRef, workspaceFileRef } from "@/components/bench/bench-context-utils"
import {
  useRegisterBenchContextProvider,
  type BenchContextProvider,
} from "@/components/bench/bench-route-context"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { FlashcardReviewStage } from "@/components/flashcard/flashcard-review-stage"
import { FlashcardDeckView } from "@/components/flashcard/flashcard-deck-view"
import { FlashcardSessionSummary } from "@/components/flashcard/flashcard-session-summary"
import { FlashcardPracticeStage } from "@/components/flashcard/flashcard-practice-stage"
import {
  useFlashcardReviewSession,
  type ReviewPhase,
} from "@/components/flashcard/flashcard-review-session"
import { buildFlashcardVisibleContent } from "@/components/flashcard/flashcard-card-content"
import {
  resolveFlashcardStanding,
  type FlashcardStanding,
} from "@/components/flashcard/flashcard-deck-standing"
import { REVIEW_STAGE_BACKGROUND } from "@/components/flashcard/flashcard-review-surface"
import { getFlashcardDueCount } from "@/lib/flashcard"
import {
  objectFlashcardDeckPayloadQueryOptions,
  objectFlashcardDeckQueueQueryOptions,
  workspaceObjectsQueryKeys,
  workspaceFlashcardDeckObjectsQueryOptions,
} from "@/state/workspace-objects-query"
import { selectFlashcardDeckObjects } from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"
import { prepareFlashcardBenchTarget } from "@/components/flashcard/flashcard-bench-target"
import {
  writeFlashcardDeckSurfaceState,
  useFlashcardDeckSurfaceState,
  benchSurfaceUiKey,
  type FlashcardDeckSurfaceMode,
  type FlashcardReviewTallyState,
} from "@/state/bench-surface-ui-state"
import type { ObjectFlashcardDeckReadDeckResponse } from "@buddy/sdk/types"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench, type BenchTarget } from "@/lib/bench-navigation"
import { absoluteWorkspaceFilePath } from "@/lib/workspace-file-paths"

const FLASHCARD_DECK_MANAGED_ROOT = ".buddy/objects/v1/flashcard-deck"
const FLASHCARD_DECK_STATE_DIRECTORY = "state"
const FLASHCARD_DECK_STATE_FILE_NAME = "deck.json"

/**
 * The flashcard deck on Bench.
 *
 * A deck is a place; a review is an activity inside it. This surface owns the
 * place, and review, practice and the session summary are modes of the same
 * bench target rather than separate destinations — which is why a drained queue
 * lands you back on the deck instead of on a dead end.
 *
 * Mode lives in the durable per-target UI store, not in component state: Bench
 * keep-alive is bounded, so a surface can be evicted mid-session and has to
 * come back where the user left it.
 */

type FlashcardBenchDeckProps = {
  directory: string
  objectID: string
  target: Extract<BenchTarget, { type: "object" }>
  deck: ObjectFlashcardDeckReadDeckResponse
}

function buildFlashcardContextContent(input: {
  mode: FlashcardDeckSurfaceMode
  phase: ReviewPhase
  deck: ObjectFlashcardDeckReadDeckResponse | null
  standing: FlashcardStanding | null
  revealed: boolean
  cardsReviewed: number
  practiceIndex: number
  practiceRevealed: boolean
}): string {
  if (input.mode === "deck") {
    return [
      `Flashcard deck open on Bench: ${input.deck?.title ?? ""}`,
      input.standing ? `Standing: ${input.standing.headline} — ${input.standing.detail}` : "",
      `Cards: ${input.deck?.cards.length ?? 0}`,
    ]
      .filter(Boolean)
      .join("\n\n")
  }

  if (input.mode === "done") {
    return [
      `Flashcard review finished. Cards reviewed this session: ${input.cardsReviewed}.`,
      input.standing ? input.standing.sessionLine : "",
    ]
      .filter(Boolean)
      .join(" ")
  }

  if (input.mode === "practice") {
    if (!input.deck || input.deck.cards.length === 0) {
      return "Flashcard practice is open, but the deck has no cards."
    }
    const cardIndex = input.practiceIndex % input.deck.cards.length
    const card = input.deck.cards[cardIndex]
    const note = card ? input.deck.notes.find((entry) => entry.noteID === card.noteID) : undefined
    if (!card || !note) {
      return "Flashcard practice is open, but the current card note is unavailable."
    }
    const visibleContent = buildFlashcardVisibleContent({
      note,
      templateIdx: card.templateIdx,
      revealed: input.practiceRevealed,
    })
    return [
      `Flashcard practice: ${input.deck.title}`,
      `Current card: ${card.cardID}`,
      `Position: ${cardIndex + 1} / ${input.deck.cards.length}`,
      `Revealed: ${input.practiceRevealed}`,
      `Front:\n${visibleContent.frontText}`,
      visibleContent.backText ? `Back:\n${visibleContent.backText}` : "Back: hidden until revealed",
    ].join("\n\n")
  }

  if (input.phase.kind === "loading") return "Flashcard review is loading the next card."
  if (input.phase.kind === "error") return `Flashcard review error: ${input.phase.message}`
  if (input.phase.kind === "no-due") return "Flashcard review is open. There are no due cards."
  if (input.phase.kind === "complete") {
    return `Flashcard review is complete. Cards reviewed this session: ${input.cardsReviewed}.`
  }

  const cardPhase = input.phase
  const note = input.deck?.notes.find((entry) => entry.noteID === cardPhase.card.noteID)
  if (!note || !input.deck) {
    return "Flashcard review is open, but the current card note is unavailable."
  }

  const visibleContent = buildFlashcardVisibleContent({
    note,
    templateIdx: cardPhase.card.templateIdx,
    revealed: input.revealed,
  })

  return [
    `Flashcard review: ${input.deck.title}`,
    `Current card: ${cardPhase.card.cardID}`,
    `Revealed: ${input.revealed}`,
    `Front:\n${visibleContent.frontText}`,
    visibleContent.backText ? `Back:\n${visibleContent.backText}` : "Back: hidden until revealed",
  ].join("\n\n")
}

export function FlashcardBenchDeck(props: FlashcardBenchDeckProps) {
  const surfaceKey = benchSurfaceUiKey({ directory: props.directory, target: props.target })
  const surfaceState = useFlashcardDeckSurfaceState(surfaceKey)
  const mode = surfaceState.mode
  const openBench = useOpenBench()
  const editPath = absoluteWorkspaceFilePath({
    directory: props.directory,
    path: [
      FLASHCARD_DECK_MANAGED_ROOT,
      props.objectID,
      FLASHCARD_DECK_STATE_DIRECTORY,
      FLASHCARD_DECK_STATE_FILE_NAME,
    ].join("/"),
  })
  const deckQueryInput = { directory: props.directory, objectID: props.objectID }
  const liveDeckQuery = useQuery({
    ...objectFlashcardDeckPayloadQueryOptions(deckQueryInput),
    initialData: props.deck,
    refetchOnMount: false,
  })
  useInvalidateQueryOnChatIdle({
    directory: props.directory,
    queryKey: workspaceObjectsQueryKeys.flashcardDeckPayload(deckQueryInput),
  })

  const patchSurface = useCallback(
    (patch: Parameters<typeof writeFlashcardDeckSurfaceState>[1]) => {
      writeFlashcardDeckSurfaceState(surfaceKey, patch)
    },
    [surfaceKey],
  )
  const handleTallyChanged = useCallback(
    (reviewTally: FlashcardReviewTallyState) => patchSurface({ reviewTally }),
    [patchSurface],
  )

  const session = useFlashcardReviewSession({
    directory: props.directory,
    objectID: props.objectID,
    initialDeck: props.deck,
    initialTally: surfaceState.reviewTally,
    onTallyChanged: handleTallyChanged,
  })
  const { deck, phase, queue, revealed, cardsReviewed, tally, restart } = session

  /* The session owns the active deck's queue in every surface mode. Mounting a
     second observer here used the same cache key but still raced the session's
     imperative load, producing two initial requests. */
  const activeQueue = queue
  const activeDeck = liveDeckQuery.data ?? deck ?? props.deck
  const practiceCard =
    mode === "practice" && activeDeck.cards.length > 0
      ? activeDeck.cards[surfaceState.practiceIndex % activeDeck.cards.length]
      : undefined
  const contextCard =
    mode === "practice" ? practiceCard : phase.kind === "card" ? phase.card : undefined
  const contextRevealed =
    mode === "practice" ? surfaceState.practiceRevealed : mode === "review" ? revealed : false

  const standing = useMemo<FlashcardStanding | null>(
    () =>
      activeQueue
        ? resolveFlashcardStanding({ deck: activeDeck, queue: activeQueue, now: Date.now() })
        : null,
    [activeDeck, activeQueue],
  )

  /* A drained queue ends the sitting: land on the summary if anything was
     rated, otherwise straight back on the deck, which already explains why.
     In an effect, not in render — the store is shared, and writing to it while
     rendering re-enters every other subscriber mid-commit. */
  const drained = phase.kind === "complete" || phase.kind === "no-due"
  useEffect(() => {
    if (mode !== "review" || !drained) return
    patchSurface({ mode: cardsReviewed > 0 ? "done" : "deck" })
  }, [cardsReviewed, drained, mode, patchSurface])

  const showSummary = mode === "done"
  const decksQuery = useQuery({
    ...workspaceFlashcardDeckObjectsQueryOptions(props.directory),
    enabled: showSummary,
  })
  const otherDecks = showSummary
    ? selectFlashcardDeckObjects(decksQuery).filter((entry) => entry.objectID !== props.objectID)
    : []
  const otherQueues = useQueries({
    queries: otherDecks.map((entry) => ({
      ...objectFlashcardDeckQueueQueryOptions({
        directory: props.directory,
        objectID: entry.objectID,
      }),
      enabled: showSummary,
      refetchOnMount: false,
    })),
  })
  const upNext = otherDecks
    .map((entry, index) => ({
      objectID: entry.objectID,
      title: entry.title,
      dueCount: getFlashcardDueCount(otherQueues[index]?.data),
    }))
    .filter((entry) => entry.dueCount > 0)

  const openDeck = useCallback(
    (objectID: string) => {
      const target = prepareFlashcardBenchTarget({
        directory: props.directory,
        objectID,
        mode: "deck",
      })
      void openBench({
        directory: props.directory,
        target,
        mode: BENCH_MODE_REQUEST_POLICY,
        autoOpen: null,
      })
    },
    [openBench, props.directory],
  )

  const handleDeckAction = useCallback(() => {
    if (standing?.action.mode === "study") {
      restart(activeDeck)
      patchSurface({ mode: "review" })
      return
    }
    patchSurface({ mode: "practice", practiceIndex: 0, practiceRevealed: false })
  }, [activeDeck, patchSurface, restart, standing?.action.mode])

  const contextProvider = useMemo<BenchContextProvider>(
    () => ({
      read: () => ({
        targetStatus:
          phase.kind === "error" ? "error" : phase.kind === "loading" ? "loading" : "ready",
        title: activeDeck.title,
        metadata: [
          `edit_path: ${editPath}`,
          `deck_mode: ${mode}`,
          `review_phase: ${phase.kind}`,
          `revealed: ${contextRevealed}`,
          `cards_reviewed: ${cardsReviewed}`,
          `standing: ${standing?.id ?? "unknown"}`,
          `card_id: ${contextCard?.cardID ?? "none"}`,
          `note_id: ${contextCard?.noteID ?? "none"}`,
        ],
        content: [
          buildFlashcardContextContent({
            mode,
            phase,
            deck: activeDeck,
            standing,
            revealed,
            cardsReviewed,
            practiceIndex: surfaceState.practiceIndex,
            practiceRevealed: surfaceState.practiceRevealed,
          }),
          `Edit path: ${editPath}`,
        ].join("\n\n"),
        refs: [
          objectRef({ objectID: props.objectID, note: "Flashcard deck object on Bench." }),
          workspaceFileRef({
            path: editPath,
            note: "Authoritative flashcard deck state for minor text edits.",
          }),
        ],
        hints: [
          "Do not include hidden answer text until it is revealed.",
          "For a minor user-requested correction, edit only notes[].fields text in edit_path with the existing file tools. Preserve IDs, cards, configuration, review and scheduling state, counters, provenance, and revision files.",
        ],
      }),
    }),
    [
      activeDeck,
      cardsReviewed,
      contextCard,
      contextRevealed,
      editPath,
      mode,
      phase,
      props.objectID,
      revealed,
      standing,
      surfaceState.practiceIndex,
      surfaceState.practiceRevealed,
    ],
  )
  useRegisterBenchContextProvider({ target: props.target, provider: contextProvider })

  return (
    <BenchViewerShell title={activeDeck.title} hideHeader contentClassName="overflow-hidden">
      {mode === "review" ? (
        <FlashcardReviewStage
          session={session}
          deckTitle={activeDeck.title}
          onExit={() => patchSurface({ mode: "deck" })}
        />
      ) : mode === "practice" ? (
        <FlashcardPracticeStage
          deck={activeDeck}
          index={surfaceState.practiceIndex}
          revealed={surfaceState.practiceRevealed}
          onIndex={(index) => patchSurface({ practiceIndex: index })}
          onRevealed={(next) => patchSurface({ practiceRevealed: next })}
          onExit={() => patchSurface({ mode: "deck" })}
        />
      ) : mode === "done" && standing ? (
        <FlashcardSessionSummary
          deckTitle={activeDeck.title}
          tally={tally}
          standing={standing}
          upNext={upNext}
          onBackToDeck={() => patchSurface({ mode: "deck" })}
          onPractice={() =>
            patchSurface({ mode: "practice", practiceIndex: 0, practiceRevealed: false })
          }
          onOpenDeck={openDeck}
        />
      ) : standing && activeQueue ? (
        <FlashcardDeckView
          deck={activeDeck}
          queue={activeQueue}
          standing={standing}
          peekCardID={surfaceState.peekCardID}
          onPeek={(cardID) => patchSurface({ peekCardID: cardID })}
          onAction={handleDeckAction}
        />
      ) : (
        <div className={cn("flex h-full items-center justify-center", REVIEW_STAGE_BACKGROUND)}>
          <p className="text-[12px] text-text-weaker">
            {language.t("workspaceFlashcard.loadingDeck")}
          </p>
        </div>
      )}
    </BenchViewerShell>
  )
}
