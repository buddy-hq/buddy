import { useEffect, useState } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "@buddy/ui"
import { language } from "@/context/language"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { requestJson, stringifyError } from "@/lib/api-client"
import {
  getFlashcardDueCount,
  isFlashcardReviewAvailable,
  type FlashcardDueCounts,
} from "@/lib/flashcard"
import { parseSubagentSession } from "@/lib/session-family"
import type { PublicQuestionSetArtifact } from "@/components/chat/tools/render/question-set/question-set-inline-view"
import { FlashcardReviewDialog } from "@/components/flashcard/flashcard-review-dialog"
import { useChatStore } from "@/state/chat-store"
import { useUiPreferences } from "@/state/ui-preferences"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"
import { workspaceArtifactsQueryKeys } from "@/state/workspace-artifacts-query"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { readString } from "../../tools/types"
import type { ToolPartProps } from "../registry"
import { formatThreadAge } from "@/components/layout/chat-left-sidebar/thread-helpers"
import type { FlashcardDecksReadResponse } from "@buddy/sdk/types"

const FLASHCARD_AUTHOR_SUBAGENT = "flashcard-author" as const
const QUESTION_SET_AUTHOR_SUBAGENT = "question-set-author" as const
const TASK_RESULT_OPEN_TAG = "<task_result>" as const
const TASK_RESULT_CLOSE_TAG = "</task_result>" as const
const MAX_PREVIEW_CARDS = 3

type FlashcardDeckListItem = {
  deckID: string
  kind: string
  title: string
  noteCount: number
  cardCount: number
  dueCounts: FlashcardDueCounts
  reviewAvailable?: boolean
  createdAt: string
  createdBy: {
    sessionID: string
    messageID: string
    callID: string
    subagent: string
  }
}

type QuestionSetArtifactListItem = PublicQuestionSetArtifact & {
  createdAt: string
  createdBy: {
    sessionID: string
    messageID: string
    callID: string
    subagent: string
  }
}

const flashcardDeckRequests = new Map<string, Promise<FlashcardDecksReadResponse>>()

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

function fetchFlashcardDeck(
  directory: string,
  deckID: string,
): Promise<FlashcardDecksReadResponse> {
  const cacheKey = `${directory}:${deckID}`
  const existing = flashcardDeckRequests.get(cacheKey)
  if (existing) {
    return existing
  }

  const request = getBuddyClient(directory)
    .flashcardDecks.read({ deckID })
    .then((result) => requireBuddyData(result))
    .finally(() => {
      flashcardDeckRequests.delete(cacheKey)
    })

  flashcardDeckRequests.set(cacheKey, request)
  return request
}

function getCardFrontPreview(
  note: FlashcardDecksReadResponse["notes"][number],
  templateIdx: number,
): string {
  if (note.type === "basic" && "front" in note.fields) {
    return note.fields.front
  }

  if (note.type === "cloze" && "text" in note.fields) {
    const ordinal = templateIdx + 1
    return note.fields.text.replace(
      /\{\{c(\d+)::([^}]+)\}\}/gu,
      (_match: string, indexStr: string, answer: string) => {
        return Number.parseInt(indexStr, 10) === ordinal ? "[...]" : answer
      },
    )
  }

  return ""
}

function CardPreviewList(props: { deck: FlashcardDecksReadResponse; totalCards: number }) {
  const noteMap = new Map(props.deck.notes.map((note) => [note.noteID, note] as const))
  const previews: Array<{ key: string; text: string }> = []

  for (const card of props.deck.cards) {
    if (previews.length >= MAX_PREVIEW_CARDS) {
      break
    }

    const note = noteMap.get(card.noteID)
    if (!note) {
      continue
    }

    const text = getCardFrontPreview(note, card.templateIdx)
    if (text.length > 0) {
      previews.push({ key: card.cardID, text })
    }
  }

  if (previews.length === 0) {
    return null
  }

  const remaining = props.totalCards - previews.length

  return (
    <div className="flex flex-col gap-1.5">
      {previews.map((preview) => (
        <div
          key={preview.key}
          className="truncate rounded-md border border-border-base/30 bg-surface-weak/30 px-2.5 py-1.5 text-xs text-text-weak"
        >
          {preview.text}
        </div>
      ))}
      {remaining > 0 ? (
        <span className="pl-0.5 text-[11px] text-text-weaker">
          {language.t("workspaceFlashcard.moreCards", { count: remaining })}
        </span>
      ) : null}
    </div>
  )
}

function DueCountsSummary(props: { dueCounts: FlashcardDeckListItem["dueCounts"] }) {
  const total = getFlashcardDueCount(props.dueCounts)

  if (total === 0) {
    return (
      <span className="text-xs text-text-weaker">{language.t("workspaceFlashcard.noDue")}</span>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {props.dueCounts.new > 0 ? (
        <span className="rounded-sm bg-surface-interactive-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-interactive-base">
          {language.t("workspaceFlashcard.dueNew", { count: props.dueCounts.new })}
        </span>
      ) : null}
      {props.dueCounts.learning > 0 ? (
        <span className="rounded-sm bg-surface-warning-base/15 px-1.5 py-0.5 text-[11px] font-medium text-icon-warning-base">
          {language.t("workspaceFlashcard.dueLearning", { count: props.dueCounts.learning })}
        </span>
      ) : null}
      {props.dueCounts.review > 0 ? (
        <span className="rounded-sm bg-surface-success-base/15 px-1.5 py-0.5 text-[11px] font-medium text-text-success-base">
          {language.t("workspaceFlashcard.dueReview", { count: props.dueCounts.review })}
        </span>
      ) : null}
    </div>
  )
}

function parseTaskResultOutput(output: string): string {
  const start = output.indexOf(TASK_RESULT_OPEN_TAG)
  const end = output.indexOf(TASK_RESULT_CLOSE_TAG)

  if (start === -1 || end === -1 || end <= start) {
    return output.trim()
  }

  return output.slice(start + TASK_RESULT_OPEN_TAG.length, end).trim()
}

function TaskStatusIndicator(props: { status: ToolPartProps["state"]["status"] }) {
  if (props.status === "pending" || props.status === "running") {
    return <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-text-weaker" />
  }

  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full",
        props.status === "error" ? "bg-icon-critical-base/70" : "bg-text-interactive-base/60",
      )}
      aria-hidden="true"
    />
  )
}

function useTaskCardHeader(input: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const childSessionID = readString(input.state.metadata.sessionId)
  const configuredSubagent = readString(input.state.input.subagent_type)
  const description = readString(input.state.input.description)?.trim()
  const onOpenSession = input.onOpenSession
  const openChildSession =
    childSessionID && onOpenSession ? () => onOpenSession(childSessionID) : undefined
  const childSession = useChatStore((store) => {
    if (!input.directory || !childSessionID) {
      return undefined
    }

    return store.directories[input.directory]?.sessions.find(
      (session) => session.id === childSessionID,
    )
  })
  const parsedSession = childSession ? parseSubagentSession(childSession) : undefined
  const displayTitle =
    parsedSession?.title ||
    description ||
    childSession?.title ||
    language.t("sidebar.untitledThread")
  const displayAgent = parsedSession?.agent || configuredSubagent
  const secondaryLine =
    description && parsedSession?.title && parsedSession.title !== description
      ? description
      : undefined
  const age = childSession
    ? formatThreadAge(childSession.time.updated ?? childSession.time.created)
    : undefined

  return {
    age,
    childSessionID,
    displayAgent,
    displayTitle,
    openChildSession,
    secondaryLine,
  }
}

function TaskCardHeaderContent(props: {
  age?: string
  displayAgent?: string
  displayTitle: string
  secondaryLine?: string
  status: ToolPartProps["state"]["status"]
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="pt-1">
        <TaskStatusIndicator status={props.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-weaker">
            {language.t("chatTools.task")}
          </span>
          {props.displayAgent ? (
            <span className="max-w-32 truncate text-xs font-medium text-text-interactive-base">
              {props.displayAgent}
            </span>
          ) : null}
          {props.age ? (
            <span className="ml-auto text-[11px] text-text-weaker">{props.age}</span>
          ) : null}
        </div>
        <p className="truncate text-sm text-text-strong">{props.displayTitle}</p>
        {props.secondaryLine ? (
          <p className="truncate text-xs text-text-weak">{props.secondaryLine}</p>
        ) : null}
      </div>
    </div>
  )
}

export function renderTaskTool({ state, onOpenSession, directory }: ToolPartProps) {
  const configuredSubagent = readString(state.input.subagent_type)
  if (configuredSubagent === FLASHCARD_AUTHOR_SUBAGENT) {
    return (
      <FlashcardAuthorTaskCard state={state} onOpenSession={onOpenSession} directory={directory} />
    )
  }
  if (configuredSubagent === QUESTION_SET_AUTHOR_SUBAGENT) {
    return (
      <QuestionSetAuthorTaskCard
        state={state}
        onOpenSession={onOpenSession}
        directory={directory}
      />
    )
  }

  return <TaskToolCard state={state} onOpenSession={onOpenSession} directory={directory} />
}

function TaskToolCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const { age, displayAgent, displayTitle, openChildSession, secondaryLine } = useTaskCardHeader({
    state,
    onOpenSession,
    directory,
  })
  const output = state.output || (state.error ?? "")
  const showOutput = output.trim().length > 0

  const cardContent = (
    <div
      className={cn(
        "w-full rounded-lg border border-border-base bg-surface-raised-base p-3 text-left transition-colors",
        openChildSession && state.status !== "error" && "hover:border-border-hover",
      )}
    >
      <TaskCardHeaderContent
        age={age}
        displayAgent={displayAgent}
        displayTitle={displayTitle}
        secondaryLine={secondaryLine}
        status={state.status}
      />
      {state.status === "error" && showOutput ? (
        <div className="mt-3">
          <ToolOutputPanel
            output={output}
            status={state.status}
            copyLabel={language.t("chatTools.copyOutput")}
          />
        </div>
      ) : null}
    </div>
  )

  if (openChildSession && state.status !== "error") {
    return (
      <button type="button" className="w-full text-left" onClick={openChildSession}>
        {cardContent}
      </button>
    )
  }

  return cardContent
}

function FlashcardDeckTaskPreview(props: {
  deck: FlashcardDeckListItem
  directory: string
  onStartReview: (deck: { deckID: string; title: string }) => void
}) {
  const [fullDeck, setFullDeck] = useState<FlashcardDecksReadResponse | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    void fetchFlashcardDeck(props.directory, props.deck.deckID)
      .then((deck) => {
        if (cancelled) {
          return
        }
        setFullDeck(deck)
        setLoadError(undefined)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        setLoadError(stringifyError(error))
      })

    return () => {
      cancelled = true
    }
  }, [props.deck.deckID, props.directory])

  const reviewAvailable = isFlashcardReviewAvailable(props.deck)

  return (
    <div className="rounded-lg border border-border-base/60 bg-surface-raised-base/70 p-3">
      <p className="truncate text-sm font-medium text-text-base">{props.deck.title}</p>
      <p className="mt-1 text-xs text-text-weak">
        {noteCountLabel(props.deck.noteCount)} · {cardCountLabel(props.deck.cardCount)}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <DueCountsSummary dueCounts={props.deck.dueCounts} />
        {fullDeck ? <CardPreviewList deck={fullDeck} totalCards={props.deck.cardCount} /> : null}
        {loadError ? (
          <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
            {loadError}
          </p>
        ) : null}
        {reviewAvailable ? (
          <button
            type="button"
            onClick={() =>
              props.onStartReview({ deckID: props.deck.deckID, title: props.deck.title })
            }
            className="cursor-pointer self-start rounded-md bg-surface-interactive-base/15 px-3 py-1.5 text-xs font-medium text-text-interactive-base transition-colors duration-150 hover:bg-surface-interactive-base/25 active:scale-[0.98]"
          >
            {language.t("workspaceFlashcard.startReview")}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function FlashcardAuthorTaskCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const queryClient = useQueryClient()
  const { age, childSessionID, displayAgent, displayTitle, openChildSession, secondaryLine } =
    useTaskCardHeader({
      state,
      onOpenSession,
      directory,
    })
  const output = state.output || (state.error ?? "")
  const taskResultOutput = parseTaskResultOutput(output)
  const showTaskResult = taskResultOutput.length > 0
  const [matchingDecks, setMatchingDecks] = useState<FlashcardDeckListItem[]>([])
  const [loadingDecks, setLoadingDecks] = useState(false)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [reviewDeck, setReviewDeck] = useState<{ deckID: string; title: string } | null>(null)

  useEffect(() => {
    setMatchingDecks([])
    setLoadError(undefined)

    if (state.status !== "completed" || !directory || !childSessionID) {
      setLoadingDecks(false)
      return
    }

    let cancelled = false
    setLoadingDecks(true)

    void requestJson<{ decks: FlashcardDeckListItem[] }>(directory, "/api/flashcard-decks")
      .then((result) => {
        if (cancelled) {
          return
        }

        const decks = (Array.isArray(result.decks) ? result.decks : [])
          .map((deck) => ({
            ...deck,
            reviewAvailable: isFlashcardReviewAvailable(deck),
          }))
          .filter((deck) => deck.createdBy.sessionID === childSessionID)
          .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))

        setMatchingDecks(decks)
        setLoadError(undefined)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        setLoadError(stringifyError(error))
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDecks(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [childSessionID, directory, state.status])

  return (
    <>
      <div className="w-full rounded-lg border border-border-base bg-surface-raised-base p-3 text-left">
        {openChildSession && state.status !== "error" ? (
          <button type="button" className="w-full text-left" onClick={openChildSession}>
            <TaskCardHeaderContent
              age={age}
              displayAgent={displayAgent}
              displayTitle={displayTitle}
              secondaryLine={secondaryLine}
              status={state.status}
            />
          </button>
        ) : (
          <TaskCardHeaderContent
            age={age}
            displayAgent={displayAgent}
            displayTitle={displayTitle}
            secondaryLine={secondaryLine}
            status={state.status}
          />
        )}

        {state.status === "completed" ? (
          <div className="mt-3 flex flex-col gap-3">
            {loadingDecks ? (
              <div className="text-sm text-text-weak">Loading generated flashcard deck...</div>
            ) : null}
            {matchingDecks.map((deck) => (
              <FlashcardDeckTaskPreview
                key={deck.deckID}
                deck={deck}
                directory={directory ?? ""}
                onStartReview={setReviewDeck}
              />
            ))}
            {!loadingDecks && matchingDecks.length === 0 && showTaskResult ? (
              <ToolOutputPanel
                output={taskResultOutput}
                status={state.status}
                copyLabel={language.t("chatTools.copyOutput")}
              />
            ) : null}
            {loadError ? (
              <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
                {loadError}
              </p>
            ) : null}
          </div>
        ) : null}

        {state.status === "error" && showTaskResult ? (
          <div className="mt-3">
            <ToolOutputPanel
              output={taskResultOutput}
              status={state.status}
              copyLabel={language.t("chatTools.copyOutput")}
            />
          </div>
        ) : null}
      </div>

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

function questionCountLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.questionCount.one" : "chatTools.questionCount.other", {
    count,
  })
}

function QuestionSetArtifactTaskPreview(props: {
  artifact: QuestionSetArtifactListItem
  onOpenArtifact: (artifact: QuestionSetArtifactListItem) => void
}) {
  return (
    <div className="rounded-lg border border-border-base/60 bg-surface-raised-base/70 p-3">
      <p className="truncate text-sm font-medium text-text-base">{props.artifact.title}</p>
      <p className="mt-1 text-xs text-text-weak">
        {props.artifact.groupType} · {questionCountLabel(props.artifact.questions.length)}
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => props.onOpenArtifact(props.artifact)}
          className="cursor-pointer self-start rounded-md bg-surface-interactive-base/15 px-3 py-1.5 text-xs font-medium text-text-interactive-base transition-colors duration-150 hover:bg-surface-interactive-base/25 active:scale-[0.98]"
        >
          Open Question Set
        </button>
      </div>
    </div>
  )
}

function QuestionSetAuthorTaskCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
  const { age, childSessionID, displayAgent, displayTitle, openChildSession, secondaryLine } =
    useTaskCardHeader({
      state,
      onOpenSession,
      directory,
    })
  const output = state.output || (state.error ?? "")
  const taskResultOutput = parseTaskResultOutput(output)
  const showTaskResult = taskResultOutput.length > 0
  const [matchingArtifacts, setMatchingArtifacts] = useState<QuestionSetArtifactListItem[]>([])
  const [loadingArtifacts, setLoadingArtifacts] = useState(false)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const setRightSidebarOpen = useUiPreferences((store) => store.setRightSidebarOpen)
  const setRightSidebarTab = useUiPreferences((store) => store.setRightSidebarTab)
  const openQuestionSet = useWorkspaceQuestionSetPanelStore((store) => store.openQuestionSet)

  useEffect(() => {
    setMatchingArtifacts([])
    setLoadError(undefined)

    if (state.status !== "completed" || !directory || !childSessionID) {
      setLoadingArtifacts(false)
      return
    }

    let cancelled = false
    setLoadingArtifacts(true)

    void requestJson<{ artifacts: QuestionSetArtifactListItem[] }>(
      directory,
      "/api/question-set-artifacts",
    )
      .then((result) => {
        if (cancelled) {
          return
        }

        const artifacts = (Array.isArray(result.artifacts) ? result.artifacts : [])
          .filter((artifact) => artifact.createdBy.sessionID === childSessionID)
          .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))

        setMatchingArtifacts(artifacts)
        setLoadError(undefined)
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        setLoadError(stringifyError(error))
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingArtifacts(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [childSessionID, directory, state.status])

  function handleOpenArtifact(artifact: QuestionSetArtifactListItem) {
    if (!directory) {
      return
    }

    openQuestionSet(directory, artifact.artifactID)
    setRightSidebarTab("question-set")
    setRightSidebarOpen(true)
  }

  return (
    <div className="w-full rounded-lg border border-border-base bg-surface-raised-base p-3 text-left">
      {openChildSession && state.status !== "error" ? (
        <button type="button" className="w-full text-left" onClick={openChildSession}>
          <TaskCardHeaderContent
            age={age}
            displayAgent={displayAgent}
            displayTitle={displayTitle}
            secondaryLine={secondaryLine}
            status={state.status}
          />
        </button>
      ) : (
        <TaskCardHeaderContent
          age={age}
          displayAgent={displayAgent}
          displayTitle={displayTitle}
          secondaryLine={secondaryLine}
          status={state.status}
        />
      )}

      {state.status === "completed" ? (
        <div className="mt-3 flex flex-col gap-3">
          {loadingArtifacts ? (
            <div className="text-sm text-text-weak">Loading generated question set...</div>
          ) : null}
          {matchingArtifacts.map((artifact) => (
            <QuestionSetArtifactTaskPreview
              key={artifact.artifactID}
              artifact={artifact}
              onOpenArtifact={handleOpenArtifact}
            />
          ))}
          {!loadingArtifacts && matchingArtifacts.length === 0 && showTaskResult ? (
            <ToolOutputPanel
              output={taskResultOutput}
              status={state.status}
              copyLabel={language.t("chatTools.copyOutput")}
            />
          ) : null}
          {loadError ? (
            <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
              {loadError}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.status === "error" && showTaskResult ? (
        <div className="mt-3">
          <ToolOutputPanel
            output={taskResultOutput}
            status={state.status}
            copyLabel={language.t("chatTools.copyOutput")}
          />
        </div>
      ) : null}
    </div>
  )
}
