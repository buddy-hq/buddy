import { useCallback, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeftIcon } from "@/icons/app-icons"
import { Card, CardContent } from "@buddy/ui"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import {
  getFlashcardDueCounts,
  isFlashcardReviewAvailable,
  type FlashcardDueCounts,
} from "@/lib/flashcard"
import type { ObjectFlashcardDeckReadDeckResponse } from "@buddy/sdk/types"
import {
  objectFlashcardDeckPayloadQueryOptions,
  objectFlashcardDeckQueueQueryOptions,
  workspaceObjectsQueryKeys,
  workspaceFlashcardDeckObjectsQueryOptions,
} from "@/state/workspace-objects-query"
import {
  getFlashcardDeckObjectSummary,
  selectFlashcardDeckObjects,
  workspaceObjectLoadErrorKey,
  type FlashcardDeckLibraryObject,
  type FlashcardDeckObjectSummary,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { FlashcardReviewStage } from "@/components/flashcard/flashcard-review-stage"
import { useFlashcardReviewSession } from "@/components/flashcard/flashcard-review-session"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noteCountLabel(count: number): string {
  return language.t(
    count === 1 ? "workspaceFlashcard.noteCount.one" : "workspaceFlashcard.noteCount.other",
    { count },
  )
}

function cardCountLabel(count: number): string {
  return language.t(
    count === 1 ? "workspaceFlashcard.cardCount.one" : "workspaceFlashcard.cardCount.other",
    { count },
  )
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

// ---------------------------------------------------------------------------
// DueCountsBadges (reused in both deck list and review header)
// ---------------------------------------------------------------------------

export function DueCountsBadges(props: { dueCounts: FlashcardDueCounts }) {
  const { dueCounts } = props
  const total = dueCounts.new + dueCounts.learning + dueCounts.review

  if (total === 0) {
    return (
      <span className="text-[11px] text-text-weaker">{language.t("workspaceFlashcard.noDue")}</span>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      {dueCounts.new > 0 ? (
        <span className="rounded-sm bg-surface-interactive-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-interactive-base">
          {language.t("workspaceFlashcard.dueNew", { count: dueCounts.new })}
        </span>
      ) : null}
      {dueCounts.learning > 0 ? (
        <span className="rounded-sm bg-surface-warning-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-on-warning-subtle">
          {language.t("workspaceFlashcard.dueLearning", { count: dueCounts.learning })}
        </span>
      ) : null}
      {dueCounts.review > 0 ? (
        <span className="rounded-sm bg-surface-success-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-success-base">
          {language.t("workspaceFlashcard.dueReview", { count: dueCounts.review })}
        </span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReviewSession — handles the fetch-review-submit loop for one deck
// ---------------------------------------------------------------------------

function ReviewSession(props: {
  directory: string
  objectID: string
  deckTitle: string
  onBack: () => void
}) {
  const { directory, objectID, deckTitle, onBack } = props
  const queryClient = useQueryClient()

  // The panel is one of two windows onto the same deck, so a rating here has to
  // land in the shared caches the library list reads from.
  const handleDeckRefreshed = useCallback(
    (deck: ObjectFlashcardDeckReadDeckResponse) => {
      queryClient.setQueryData(
        objectFlashcardDeckPayloadQueryOptions({ directory, objectID }).queryKey,
        deck,
      )
      void queryClient.invalidateQueries({
        queryKey: workspaceObjectsQueryKeys.flashcard(directory),
      })
    },
    [directory, objectID, queryClient],
  )

  const session = useFlashcardReviewSession({
    directory,
    objectID,
    onDeckRefreshed: handleDeckRefreshed,
  })
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-base/30 px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base"
        >
          <ArrowLeftIcon className="size-3.5" />
          {language.t("workspaceFlashcard.backToDecks")}
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-base">
          {deckTitle}
        </span>
        {session.queue ? (
          <DueCountsBadges dueCounts={getFlashcardDueCounts(session.queue)} />
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FlashcardReviewStage session={session} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

function WorkspaceFlashcardDeckCard(props: {
  directory: string
  deck: FlashcardDeckLibraryObject
  onStartReview: (deck: { objectID: string; title: string }) => void
}) {
  const deckQuery = useQuery({
    ...objectFlashcardDeckPayloadQueryOptions({
      directory: props.directory,
      objectID: props.deck.objectID,
    }),
    refetchOnMount: false,
  })
  const queueQuery = useQuery({
    ...objectFlashcardDeckQueueQueryOptions({
      directory: props.directory,
      objectID: props.deck.objectID,
    }),
    refetchOnMount: false,
  })
  const deck = deckQuery.data
  const summary: FlashcardDeckObjectSummary | undefined = deck
    ? getFlashcardDeckObjectSummary(deck)
    : undefined
  const reviewAvailable = isFlashcardReviewAvailable(queueQuery.data)
  const title = deck?.title ?? props.deck.title
  const timestamp = deck?.createdAt ?? props.deck.updatedAt

  return (
    <Card
      size="sm"
      className={`gap-0 overflow-hidden border-border-base/60 bg-surface-raised-base/70 transition-colors ${reviewAvailable ? "cursor-pointer hover:border-border-interactive-base/60 hover:bg-surface-raised-base" : ""}`}
      onClick={
        reviewAvailable
          ? () => props.onStartReview({ objectID: props.deck.objectID, title })
          : undefined
      }
    >
      <CardContent className="space-y-2 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-text-base">{title}</p>
        </div>
        {summary ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-weak">
              <span>{noteCountLabel(summary.noteCount)}</span>
              <span className="text-text-weaker">·</span>
              <span>{cardCountLabel(summary.cardCount)}</span>
              <span className="text-text-weaker">·</span>
              <span>{formatTimestamp(timestamp)}</span>
            </div>
            {queueQuery.data ? (
              <DueCountsBadges dueCounts={getFlashcardDueCounts(queueQuery.data)} />
            ) : null}
          </>
        ) : (
          <p className="text-xs text-text-weak">{language.t("workspaceFlashcard.loadingDeck")}</p>
        )}
        {deckQuery.error ? (
          <p className="text-xs text-icon-critical-base">{stringifyError(deckQuery.error)}</p>
        ) : null}
        {queueQuery.error ? (
          <p className="text-xs text-icon-critical-base">{stringifyError(queueQuery.error)}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function WorkspaceFlashcardPanel(props: { directory: string }) {
  const queryClient = useQueryClient()
  const decksQuery = useQuery(workspaceFlashcardDeckObjectsQueryOptions(props.directory))
  const decks = selectFlashcardDeckObjects(decksQuery)
  const loadErrors = decksQuery.data?.loadErrors ?? []
  const loading = decksQuery.isPending
  const error = decksQuery.error ? stringifyError(decksQuery.error) : undefined

  const [reviewDeck, setReviewDeck] = useState<{
    objectID: string
    title: string
  } | null>(null)

  useInvalidateQueryOnChatIdle({
    directory: props.directory,
    queryKey: workspaceObjectsQueryKeys.flashcard(props.directory),
  })

  const handleBack = useCallback(() => {
    setReviewDeck(null)
    // Refresh deck list to get updated due counts after reviewing
    void queryClient.invalidateQueries({
      queryKey: workspaceObjectsQueryKeys.flashcard(props.directory),
    })
  }, [queryClient, props.directory])

  // Review mode: show the review session
  if (reviewDeck) {
    return (
      <div data-component="workspace-flashcard-panel" className="flex min-h-0 flex-1 flex-col">
        <ReviewSession
          directory={props.directory}
          objectID={reviewDeck.objectID}
          deckTitle={reviewDeck.title}
          onBack={handleBack}
        />
      </div>
    )
  }

  // Deck list mode
  return (
    <div data-component="workspace-flashcard-panel" className="flex min-h-0 flex-1 flex-col p-3">
      {loading ? (
        <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/20 bg-surface-weak/5 px-4 py-10 text-center animate-pulse">
          <div className="h-4 w-32 rounded-md bg-surface-strong/20"></div>
          <div className="mt-2 h-3 w-48 rounded-md bg-surface-strong/10"></div>
        </div>
      ) : null}

      {!loading && decks.length === 0 && loadErrors.length === 0 ? (
        <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/40 bg-surface-weak/5 px-4 py-10 text-center">
          <h3 className="text-[13px] font-medium text-text-base">
            {language.t("workspaceFlashcard.title")}
          </h3>
          <p className="mt-1.5 max-w-[220px] text-[12px] leading-relaxed text-text-weak">
            {language.t("workspaceFlashcard.emptyState")}
          </p>
        </div>
      ) : null}

      {decks.length > 0 ? (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto space-y-3">
          {decks.map((deck) => (
            <WorkspaceFlashcardDeckCard
              key={deck.objectID}
              directory={props.directory}
              deck={deck}
              onStartReview={setReviewDeck}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}

      {loadErrors.map((loadError) => (
        <p
          key={workspaceObjectLoadErrorKey(loadError)}
          className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base"
        >
          {loadError.message}
        </p>
      ))}
    </div>
  )
}
