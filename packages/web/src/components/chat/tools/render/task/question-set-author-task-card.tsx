import { useQueries, useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "motion/react"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import {
  objectQuestionSetPayloadQueryOptions,
  workspaceQuestionSetObjectsQueryOptions,
} from "@/state/workspace-objects-query"
import {
  createBenchObjectTarget,
  selectQuestionSetObjects,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import type { ObjectQuestionSetReadQuestionsResponse } from "@buddy/sdk/types"
import { ToolOutputPanel } from "../../tool-output-panel"
import type { ToolPartProps } from "../../registry"
import { readString } from "../../types"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import { TASK_CARD_TRANSITION } from "../task-motion"
import { useSubagentCardData } from "./task-card-header"
import { SubagentCard } from "./subagent-card"
import { parseTaskResultOutput } from "./task-utils"

function questionCountLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.questionCount.one" : "chatTools.questionCount.other", {
    count,
  })
}

function QuestionSetObjectTaskPreview(props: {
  object: ObjectQuestionSetReadQuestionsResponse
  onOpenObject: (object: ObjectQuestionSetReadQuestionsResponse) => void
}) {
  return (
    <motion.button
      type="button"
      onClick={() => props.onOpenObject(props.object)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={TASK_CARD_TRANSITION}
      whileHover={{ backgroundColor: "var(--surface-weak)" }}
      whileTap={{ scale: 0.995 }}
      className="w-full cursor-pointer px-3 py-2.5 text-left transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-strong">{props.object.title}</p>
          <p className="mt-0.5 text-xs text-text-weak">
            {props.object.groupType} · {questionCountLabel(props.object.questions.length)}
          </p>
        </div>
        <div className="shrink-0 rounded bg-surface-base px-3 py-1.5 text-xs font-medium text-text-strong">
          Open
        </div>
      </div>
    </motion.button>
  )
}

function questionSetDetailQuery(
  directory: string,
  objectID: string,
  enabled: boolean,
) {
  const options = objectQuestionSetPayloadQueryOptions({ directory, objectID })

  return {
    queryKey: options.queryKey,
    queryFn: options.queryFn,
    staleTime: options.staleTime,
    enabled,
  }
}

export function QuestionSetAuthorTaskCard({
  state,
  onOpenSession,
  directory,
}: Pick<ToolPartProps, "state" | "onOpenSession" | "directory">) {
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
  const openBenchRoute = useOpenBench()
  const output = state.output || (state.error ?? "")
  const taskResultOutput = parseTaskResultOutput(output)

  const childSessionID = readString(state.metadata.sessionId)
  const objectsQuery = useQuery({
    ...workspaceQuestionSetObjectsQueryOptions(directory ?? ""),
    enabled: state.status === "completed" && !!directory && !!childSessionID,
  })

  const objectStubs = selectQuestionSetObjects(objectsQuery)
  const shouldLoadObjects = state.status === "completed" && !!directory && !!childSessionID
  const objectDetailQueries = useQueries({
    queries: objectStubs.map((object) =>
      questionSetDetailQuery(directory ?? "", object.objectID, shouldLoadObjects),
    ),
  })

  const items = childSessionID
    ? objectDetailQueries
        .flatMap((query) => {
          const object = query.data
          if (!object || object.createdBy.kind !== "tool") return []
          return object.createdBy.sessionID === childSessionID ? [object] : []
        })
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []
  const detailPending = objectDetailQueries.some((query) => query.isPending)
  const detailError = objectDetailQueries.find((query) => query.error)?.error
  const loadingObjects = objectsQuery.isPending || detailPending
  const objectError = objectsQuery.error ?? detailError
  const shouldShowOutputFallback =
    !loadingObjects && items.length === 0 && taskResultOutput.length > 0
  const shouldShowObjectError = objectError !== null && objectError !== undefined

  function handleOpenObject(object: ObjectQuestionSetReadQuestionsResponse) {
    if (!directory) return
    void openBenchRoute({
      directory,
      target: createBenchObjectTarget("question-set", object.objectID),
      mode: BENCH_MODE_REQUEST_POLICY,
      autoOpen: null,
    })
  }

  const error = state.status === "error" ? taskResultOutput || undefined : undefined
  const showCompletedBody = state.status === "completed"

  return (
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={TASK_CARD_TRANSITION}
              className="text-sm text-text-weak px-3 py-2.5"
            >
              {language.t("chatTools.loadingQuestionSet", {
                defaultValue: "Loading generated question set...",
              })}
            </motion.div>
          ) : null}
          <AnimatePresence mode="popLayout">
            {items.map((object) => (
              <div key={object.objectID}>
                <QuestionSetObjectTaskPreview
                  object={object}
                  onOpenObject={(targetObject) => {
                    void handleOpenObject(targetObject)
                  }}
                />
              </div>
            ))}
          </AnimatePresence>
          {shouldShowOutputFallback ? (
            <div className="px-3 py-2.5">
              <ToolOutputPanel output={taskResultOutput} />
            </div>
          ) : null}
          {shouldShowObjectError ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={TASK_CARD_TRANSITION}
              className="text-xs text-icon-critical-base px-3 py-2.5"
            >
              {stringifyError(objectError)}
            </motion.p>
          ) : null}
        </>
      ) : null}
    </SubagentCard>
  )
}
