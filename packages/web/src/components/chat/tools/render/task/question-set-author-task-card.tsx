import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion, AnimatePresence } from "motion/react"
import { language } from "@/context/language"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { stringifyError } from "@/lib/api-client"
import { workspaceQuestionSetArtifactsQueryOptions } from "@/state/workspace-artifacts-query"
import { ToolOutputPanel } from "../../tool-output-panel"
import type { ToolPartProps } from "../../registry"
import {
  QuestionSetInlineView,
  type SubmitQuestionSetAttemptOutput,
} from "../question-set/question-set-inline-view"
import { TASK_CARD_TRANSITION } from "../task-motion"
import { useTaskCardHeader } from "./task-card-header"
import { SubagentArtifactCard } from "./subagent-artifact-card"
import { parseTaskResultOutput } from "./task-utils"
import type { QuestionSetArtifactsListResponse } from "@buddy/sdk"

type QuestionSetArtifact = QuestionSetArtifactsListResponse["artifacts"][number]

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
      className="w-full cursor-pointer rounded p-2 text-left transition-colors -m-2"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-strong">{props.artifact.title}</p>
          <p className="mt-0.5 text-xs text-text-weak">
            {props.artifact.groupType} · {questionCountLabel(props.artifact.questions.length)}
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
  const header = useTaskCardHeader({ state, onOpenSession, directory })
  const output = state.output || (state.error ?? "")
  const taskResultOutput = parseTaskResultOutput(output)
  const [openArtifact, setOpenArtifact] = useState<QuestionSetArtifact | undefined>(undefined)

  const artifactsQuery = useQuery({
    ...workspaceQuestionSetArtifactsQueryOptions(directory ?? ""),
    enabled: state.status === "completed" && !!directory && !!header.childSessionID,
  })

  const items = useMemo(() => {
    const artifacts = artifactsQuery.data?.artifacts ?? []
    if (!header.childSessionID) return []
    return artifacts
      .filter((artifact) => artifact.createdBy.sessionID === header.childSessionID)
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [artifactsQuery.data, header.childSessionID])

  function handleOpenArtifact(artifact: QuestionSetArtifact) {
    setOpenArtifact(artifact)
  }

  return (
    <SubagentArtifactCard
      state={state}
      displayAgent={header.displayAgent}
      openChildSession={header.openChildSession}
      taskResultOutput={taskResultOutput}
    >
      {artifactsQuery.isPending ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={TASK_CARD_TRANSITION}
          className="text-sm text-text-weak"
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
              onOpenArtifact={handleOpenArtifact}
            />
          </div>
        ))}
      </AnimatePresence>
      {!artifactsQuery.isPending && items.length === 0 && taskResultOutput.length > 0 ? (
        <ToolOutputPanel output={taskResultOutput} />
      ) : null}
      {artifactsQuery.error ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={TASK_CARD_TRANSITION}
          className="text-xs text-icon-critical-base"
        >
          {stringifyError(artifactsQuery.error)}
        </motion.p>
      ) : null}
      {openArtifact && directory ? (
        <QuestionSetInlineView
          artifact={openArtifact}
          defaultOpen={true}
          hideCard={true}
          persistKey={`task-question-set:${openArtifact.artifactID}`}
          onOpenChange={(open) => {
            if (!open) {
              setOpenArtifact(undefined)
            }
          }}
          onSubmit={async (answers) => {
            const response: SubmitQuestionSetAttemptOutput = requireBuddyData(
              await getBuddyClient(directory).questionSetArtifacts.submitAttempt({
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
    </SubagentArtifactCard>
  )
}
