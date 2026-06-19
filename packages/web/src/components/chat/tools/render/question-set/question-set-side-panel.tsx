import { ArrowLeftIcon } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import {
  QuestionSetInlineView,
} from "@/components/chat/tools/render/question-set/question-set-inline-view"
import { language } from "@/context/language"
import { stringifyError } from "@/lib/api-client"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import { objectQuestionSetPayloadQueryOptions } from "@/state/workspace-objects-query"
import { useWorkspaceQuestionSetObjectPanelStore } from "@/state/workspace-question-set-object-panel-store"

type QuestionSetSidePanelProps = {
  objectID: string
  directory: string
  onClose: () => void
}

export function QuestionSetSidePanel(props: QuestionSetSidePanelProps) {
  const openBenchRoute = useOpenBench()
  const closeQuestionSet = useWorkspaceQuestionSetObjectPanelStore((state) => state.closeQuestionSet)
  const questionSetQuery = useQuery(
    objectQuestionSetPayloadQueryOptions({
      directory: props.directory,
      objectID: props.objectID,
    }),
  )
  const questionSet = questionSetQuery.data
  const error = questionSetQuery.error ? stringifyError(questionSetQuery.error) : undefined

  function handleBack() {
    closeQuestionSet(props.directory)
    props.onClose()
  }

  return (
    <div
      data-component="question-set-side-panel"
      className="flex min-h-0 flex-1 flex-col bg-background-base"
    >
      <div className="flex items-center gap-2 border-b border-border-base/30 px-3 py-2">
        <button
          type="button"
          onClick={handleBack}
          className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back
        </button>
        <span className="truncate text-xs font-medium text-text-base">
          {questionSet?.title ?? language.t("workspaceQuestionSet.title")}
        </span>
      </div>

      {questionSetQuery.isPending ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <span className="text-sm text-text-weak">
            {language.t("workspaceQuestionSet.loading")}
          </span>
        </div>
      ) : null}

      {questionSet ? (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto p-3">
          <QuestionSetInlineView
            questionSet={questionSet}
            persistKey={`selected-question-set:${questionSet.objectID}`}
            onOpenBench={() => {
              void openBenchRoute({
                directory: props.directory,
                target: {
                  type: "object",
                  ref: {
                    kind: "question-set",
                    objectID: questionSet.objectID,
                    revisionID: null,
                    itemID: null,
                  },
                  viewID: "practice",
                },
                mode: BENCH_MODE_REQUEST_POLICY,
                autoOpen: null,
              })
            }}
            onSubmit={async (answers) => {
              const response = requireBuddyData(
                await getBuddyClient(props.directory).objectQuestionSet.submitAttempt({
                  directory: props.directory,
                  objectID: questionSet.objectID,
                  answers: questionSet.questions.map((question) => ({
                    questionID: question.id,
                    selectedChoiceIds: answers[question.id] ?? [],
                  })),
                }),
              )

              return response.result
            }}
          />
        </div>
      ) : null}

      {error ? (
        <div className="p-3">
          <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
            {error}
          </p>
        </div>
      ) : null}
    </div>
  )
}
