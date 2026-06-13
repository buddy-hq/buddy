import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "motion/react"
import { language } from "@/context/language"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { stringifyError } from "@/lib/api-client"
import { workspaceQuestionSetArtifactsQueryOptions } from "@/state/workspace-artifacts-query"
import {
  artifactKindFilter,
  type QuestionSetLibraryArtifact,
} from "@/components/layout/chat-left-sidebar/library-artifact-selectors"
import { ToolOutputPanel } from "../../tool-output-panel"
import type { ToolPartProps } from "../../registry"
import { readString } from "../../types"
import {
  QuestionSetInlineView,
  type PublicQuestionSetArtifact,
  type SubmitQuestionSetAttemptOutput,
} from "../question-set/question-set-inline-view"
import { TASK_CARD_TRANSITION } from "../task-motion"
import { useSubagentCardData } from "./task-card-header"
import { SubagentCard } from "./subagent-card"
import { parseTaskResultOutput } from "./task-utils"

type QuestionSetArtifact = QuestionSetLibraryArtifact

function questionCountLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.questionCount.one" : "chatTools.questionCount.other", {
    count,
  })
}

function QuestionSetArtifactTaskPreview(props: {
  artifact: QuestionSetArtifact
  onOpenArtifact: (artifact: QuestionSetArtifact) => void
}) {
  return (
    <motion.button
      type="button"
      onClick={() => props.onOpenArtifact(props.artifact)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={TASK_CARD_TRANSITION}
      whileHover={{ backgroundColor: "var(--surface-weak)" }}
      whileTap={{ scale: 0.995 }}
      className="w-full cursor-pointer px-3 py-2.5 text-left transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-strong">{props.artifact.title}</p>
          <p className="mt-0.5 text-xs text-text-weak">
            {props.artifact.summary.groupType} ·{" "}
            {questionCountLabel(props.artifact.summary.questionCount)}
          </p>
        </div>
        <div className="shrink-0 rounded bg-surface-base px-3 py-1.5 text-xs font-medium text-text-strong">
          Open
        </div>
      </div>
    </motion.button>
  )
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
  const output = state.output || (state.error ?? "")
  const taskResultOutput = parseTaskResultOutput(output)
  const [openArtifact, setOpenArtifact] = useState<PublicQuestionSetArtifact | undefined>(undefined)
  const [openArtifactError, setOpenArtifactError] = useState<string | undefined>(undefined)

  const childSessionID = readString(state.metadata.sessionId)
  const artifactsQuery = useQuery({
    ...workspaceQuestionSetArtifactsQueryOptions(directory ?? ""),
    enabled: state.status === "completed" && !!directory && !!childSessionID,
  })

  const items = useMemo(() => {
    const artifacts = (artifactsQuery.data?.artifacts ?? []).filter(
      artifactKindFilter("question-set"),
    )
    if (!childSessionID) return []
    return artifacts
      .filter((artifact) => artifact.origin?.sessionID === childSessionID)
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [artifactsQuery.data, childSessionID])

  async function handleOpenArtifact(artifact: QuestionSetArtifact) {
    if (!directory) return
    setOpenArtifactError(undefined)
    try {
      const response = await getBuddyClient(directory).questionSet.read({
        artifactID: artifact.artifactID,
      })
      setOpenArtifact(requireBuddyData(response))
    } catch (error) {
      setOpenArtifactError(stringifyError(error))
    }
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
          {artifactsQuery.isPending ? (
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
            {items.map((artifact) => (
              <div key={artifact.artifactID}>
                  <QuestionSetArtifactTaskPreview
                    artifact={artifact}
                    onOpenArtifact={(targetArtifact) => {
                      void handleOpenArtifact(targetArtifact)
                    }}
                  />
                </div>
              ))}
          </AnimatePresence>
          {!artifactsQuery.isPending && items.length === 0 && taskResultOutput.length > 0 ? (
            <div className="px-3 py-2.5">
              <ToolOutputPanel output={taskResultOutput} />
            </div>
          ) : null}
          {artifactsQuery.error ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={TASK_CARD_TRANSITION}
              className="text-xs text-icon-critical-base px-3 py-2.5"
            >
              {stringifyError(artifactsQuery.error)}
            </motion.p>
          ) : null}
          {openArtifactError ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={TASK_CARD_TRANSITION}
              className="text-xs text-icon-critical-base px-3 py-2.5"
            >
              {openArtifactError}
            </motion.p>
          ) : null}
          {openArtifact && directory ? (
            <QuestionSetInlineView
              artifact={openArtifact}
              defaultOpen={true}
              hideCard={true}
              persistKey={`task-question-set:${openArtifact.artifactID}`}
              onOpenChange={(open) => {
                if (!open) setOpenArtifact(undefined)
              }}
              onSubmit={async (answers) => {
                const response: SubmitQuestionSetAttemptOutput = requireBuddyData(
                  await getBuddyClient(directory).questionSet.submitAttempt({
                    artifactID: openArtifact.artifactID,
                    answers: openArtifact.questions.map((question) => ({
                      questionID: question.id,
                      selectedChoiceIds: answers[question.id] ?? [],
                    })),
                  }),
                )
                return response.result
              }}
            />
          ) : null}
        </>
      ) : null}
    </SubagentCard>
  )
}
