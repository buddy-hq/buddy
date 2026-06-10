import { useState, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "motion/react"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { getFlashcardDueCount, isFlashcardReviewAvailable } from "@/lib/flashcard"
import { FlashcardReviewDialog } from "@/components/flashcard/flashcard-review-dialog"
import {
  workspaceArtifactsQueryKeys,
  workspaceFlashcardDecksQueryOptions,
} from "@/state/workspace-artifacts-query"
import { ToolOutputPanel } from "../../tool-output-panel"
import type { ToolPartProps } from "../../registry"
import { readString } from "../../types"
import { TASK_CARD_TRANSITION } from "../task-motion"
import { useSubagentCardData } from "./task-card-header"
import { SubagentCard } from "./subagent-card"
import { parseTaskResultOutput } from "./task-utils"
import type { FlashcardDecksListResponse } from "@buddy/sdk"

function FlashcardDeckTaskPreview(props: {
  deck: FlashcardDecksListResponse["decks"][number]
  directory: string
  onStartReview: (deck: { deckID: string; title: string }) => void
}) {
  const reviewAvailable = isFlashcardReviewAvailable(props.deck)
  const totalDue = getFlashcardDueCount(props.deck.dueCounts)

  if (!reviewAvailable) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={TASK_CARD_TRANSITION}
        className="flex items-center justify-between gap-4 px-3 py-2.5"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-strong">{props.deck.title}</p>
          <p className="mt-0.5 text-xs text-text-weak">
            {props.deck.cardCount} {props.deck.cardCount === 1 ? "card" : "cards"}
          </p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.button
      type="button"
      onClick={() => props.onStartReview({ deckID: props.deck.deckID, title: props.deck.title })}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={TASK_CARD_TRANSITION}
      whileHover={{ backgroundColor: "var(--surface-weak)" }}
      whileTap={{ scale: 0.995 }}
      className="w-full cursor-pointer px-3 py-2.5 text-left transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-strong">{props.deck.title}</p>
          <p className="mt-0.5 text-xs text-text-weak">
            {props.deck.cardCount} {props.deck.cardCount === 1 ? "card" : "cards"} · {totalDue} due
          </p>
        </div>
        <div className="shrink-0 rounded bg-surface-base px-3 py-1.5 text-xs font-medium text-text-strong">
          Review
        </div>
      </div>
    </motion.button>
  )
}

export function FlashcardAuthorTaskCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const queryClient = useQueryClient()
  const {
    agentName,
    openChildSession,
    activityLine,
    activityContent,
    activityIcon,
    activityActive,
    status,
  } = useSubagentCardData({ state, onOpenSession, directory })
  const output = state.output || (state.error ?? "")
  const taskResultOutput = parseTaskResultOutput(output)
  const [reviewDeck, setReviewDeck] = useState<{ deckID: string; title: string } | null>(null)

  const childSessionID = readString(state.metadata.sessionId)
  const decksQuery = useQuery({
    ...workspaceFlashcardDecksQueryOptions(directory ?? ""),
    enabled: state.status === "completed" && !!directory && !!childSessionID,
  })

  const items = useMemo(() => {
    const decks = decksQuery.data?.decks ?? []
    if (!childSessionID) return []
    return decks
      .filter((deck) => deck.createdBy.sessionID === childSessionID)
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [decksQuery.data, childSessionID])

  const error = state.status === "error" ? taskResultOutput || undefined : undefined
  const showCompletedBody = state.status === "completed"

  return (
    <>
      <SubagentCard
        agentName={agentName}
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
            {decksQuery.isPending ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={TASK_CARD_TRANSITION}
                className="text-sm text-text-weak px-3 py-2.5"
              >
                {language.t("chatTools.loadingFlashcards", {
                  defaultValue: "Loading generated flashcard deck...",
                })}
              </motion.div>
            ) : null}
            <AnimatePresence mode="popLayout">
              {items.map((deck) => (
                <div key={deck.deckID}>
                  <FlashcardDeckTaskPreview
                    deck={deck}
                    directory={directory ?? ""}
                    onStartReview={setReviewDeck}
                  />
                </div>
              ))}
            </AnimatePresence>
            {!decksQuery.isPending && items.length === 0 && taskResultOutput.length > 0 ? (
              <div className="px-3 py-2.5">
                <ToolOutputPanel output={taskResultOutput} />
              </div>
            ) : null}
            {decksQuery.error ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={TASK_CARD_TRANSITION}
                className="text-xs text-icon-critical-base px-3 py-2.5"
              >
                {stringifyError(decksQuery.error)}
              </motion.p>
            ) : null}
          </>
        ) : null}
      </SubagentCard>

      {directory && reviewDeck ? (
        <FlashcardReviewDialog
          open={reviewDeck !== null}
          onOpenChange={(open) => {
            if (!open) {
              setReviewDeck(null)
              void queryClient.invalidateQueries({
                queryKey: workspaceArtifactsQueryKeys.flashcard(directory),
              })
            }
          }}
          directory={directory}
          deckID={reviewDeck.deckID}
          deckTitle={reviewDeck.title}
        />
      ) : null}
    </>
  )
}
