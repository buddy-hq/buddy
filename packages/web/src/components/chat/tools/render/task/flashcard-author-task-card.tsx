import { useQueries, useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { getFlashcardDueCount, isFlashcardReviewAvailable } from "@/lib/flashcard"
import {
  objectFlashcardDeckPayloadQueryOptions,
  workspaceFlashcardDeckObjectsQueryOptions,
} from "@/state/workspace-objects-query"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import {
  createBenchObjectTarget,
  getFlashcardDeckObjectSummary,
  selectFlashcardDeckObjects,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import type { ObjectFlashcardDeckReadDeckResponse } from "@buddy/sdk/types"
import { ToolOutputPanel } from "../../tool-output-panel"
import type { ToolPartProps } from "../../registry"
import { readString } from "../../types"
import {
  TASK_CARD_ENTER_ANIMATE,
  TASK_CARD_TRANSITION,
  taskCardEnterInitial,
} from "../task-motion"
import { useSubagentCardData } from "./task-card-header"
import { SubagentCard } from "./subagent-card"
import { parseTaskResultOutput } from "./task-utils"

function FlashcardDeckTaskPreview(props: {
  deck: ObjectFlashcardDeckReadDeckResponse
  onStartReview: (deck: { objectID: string; title: string }) => void
}) {
  const summary = getFlashcardDeckObjectSummary(props.deck)
  const reviewAvailable = isFlashcardReviewAvailable(summary)
  const totalDue = getFlashcardDueCount(summary.dueCounts)

  if (!reviewAvailable) {
    return (
      <div className="flex items-center justify-between gap-4 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-strong">{props.deck.title}</p>
          <p className="mt-0.5 text-xs text-text-weak">
            {summary.cardCount} {summary.cardCount === 1 ? "card" : "cards"}
          </p>
        </div>
      </div>
    )
  }

  return (
    <motion.button
      type="button"
      onClick={() =>
        props.onStartReview({ objectID: props.deck.objectID, title: props.deck.title })
      }
      whileHover={{ backgroundColor: "var(--surface-weak)" }}
      whileTap={{ scale: 0.995 }}
      className="w-full cursor-pointer px-3 py-2.5 text-left transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-strong">{props.deck.title}</p>
          <p className="mt-0.5 text-xs text-text-weak">
            {summary.cardCount} {summary.cardCount === 1 ? "card" : "cards"} · {totalDue} due
          </p>
        </div>
        <div className="shrink-0 rounded bg-surface-base px-3 py-1.5 text-xs font-medium text-text-strong">
          Review
        </div>
      </div>
    </motion.button>
  )
}

function flashcardDeckDetailQuery(directory: string, objectID: string, enabled: boolean) {
  const options = objectFlashcardDeckPayloadQueryOptions({ directory, objectID })

  return {
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    staleTime: options.staleTime,
    enabled,
  }
}

export function FlashcardAuthorTaskCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const openBenchRoute = useOpenBench()
  const {
    agentName,
    taskTitle,
    openChildSession,
    activityLine,
    activityContent,
    activityIcon,
    activityActive,
    status,
  } = useSubagentCardData({ state, onOpenSession, directory })
  const reducedMotion = useReducedMotion() === true
  const output = state.output || (state.error ?? "")
  const taskResultOutput = parseTaskResultOutput(output)

  const childSessionID = readString(state.metadata.sessionId)
  const decksQuery = useQuery({
    ...workspaceFlashcardDeckObjectsQueryOptions(directory ?? ""),
    enabled: state.status === "completed" && !!directory && !!childSessionID,
  })

  const deckObjects = selectFlashcardDeckObjects(decksQuery)
  const shouldLoadDecks = state.status === "completed" && !!directory && !!childSessionID
  const deckDetailQueries = useQueries({
    queries: deckObjects.map((deck) =>
      flashcardDeckDetailQuery(directory ?? "", deck.objectID, shouldLoadDecks),
    ),
  })
  const items = childSessionID
    ? deckDetailQueries
        .flatMap((query) => {
          const deck = query.data
          if (!deck || deck.createdBy.kind !== "tool") return []
          return deck.createdBy.sessionID === childSessionID ? [deck] : []
        })
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []
  const detailPending = deckDetailQueries.some((query) => query.isPending)
  const detailError = deckDetailQueries.find((query) => query.error)?.error

  const loadingObjects = decksQuery.isPending || detailPending

  const objectError = decksQuery.error ?? detailError

  const shouldShowOutputFallback =
    !loadingObjects && items.length === 0 && taskResultOutput.length > 0

  const shouldShowObjectError = objectError !== null && objectError !== undefined

  const error = state.status === "error" ? taskResultOutput || undefined : undefined
  const showCompletedBody = state.status === "completed"

  return (
    <>
      <SubagentCard
        agentName={agentName}
        taskTitle={taskTitle}
        status={status}
        onOpenSession={openChildSession}
        activityLine={!showCompletedBody ? activityLine : undefined}
        activityContent={!showCompletedBody ? activityContent : undefined}
        activityIcon={activityIcon}
        activityActive={activityActive}
        error={error}
      >
        {showCompletedBody ? (
          <>
            {loadingObjects ? (
              <div className="text-sm text-text-weak px-3 py-2.5">
                {language.t("chatTools.loadingFlashcards", {
                  defaultValue: "Loading generated flashcard deck...",
                })}
              </div>
            ) : null}
            <AnimatePresence initial={false}>
              {items.map((deck) => (
                <motion.div
                  key={deck.objectID}
                  initial={taskCardEnterInitial(reducedMotion)}
                  animate={TASK_CARD_ENTER_ANIMATE}
                  transition={TASK_CARD_TRANSITION}
                >
                  <FlashcardDeckTaskPreview
                    deck={deck}
                    onStartReview={(selectedDeck) => {
                      if (!directory) return
                      void openBenchRoute({
                        directory,
                        target: createBenchObjectTarget("flashcard-deck", selectedDeck.objectID),
                        mode: BENCH_MODE_REQUEST_POLICY,
                        autoOpen: null,
                      })
                    }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            {shouldShowOutputFallback ? (
              <div className="px-3 py-2.5">
                <ToolOutputPanel output={taskResultOutput} />
              </div>
            ) : null}
            {shouldShowObjectError ? (
              <p className="text-xs text-icon-critical-base px-3 py-2.5">
                {stringifyError(objectError)}
              </p>
            ) : null}
          </>
        ) : null}
      </SubagentCard>
    </>
  )
}
