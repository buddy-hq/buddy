import { ArrowLeftIcon } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import {
  QuestionSetInlineView,
  type PublicQuestionSetArtifact,
  type SubmitQuestionSetAttemptOutput,
} from "@/components/chat/tools/render/question-set/question-set-inline-view"
import { language } from "@/context/language"
import { requestJson, stringifyError } from "@/lib/api-client"
import { workspaceArtifactsQueryKeys } from "@/state/workspace-artifacts-query"
import { useWorkspaceQuestionSetPanelStore } from "@/state/workspace-question-set-panel-store"

type QuestionSetSidePanelProps = {
  artifactID: string
  directory: string
  onClose: () => void
}

export function QuestionSetSidePanel(props: QuestionSetSidePanelProps) {
  const closeQuestionSet = useWorkspaceQuestionSetPanelStore((state) => state.closeQuestionSet)
  const artifactQuery = useQuery({
    queryKey: [
      ...workspaceArtifactsQueryKeys.questionSet(props.directory),
      "detail",
      props.artifactID,
    ],
    queryFn: () =>
      requestJson<PublicQuestionSetArtifact>(
        props.directory,
        `/api/question-set-artifacts/${props.artifactID}`,
      ),
  })
  const artifact = artifactQuery.data
  const error = artifactQuery.error ? stringifyError(artifactQuery.error) : undefined

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
          {artifact?.title ?? language.t("workspaceQuestionSet.title")}
        </span>
      </div>

      {artifactQuery.isPending ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <span className="text-sm text-text-weak">
            {language.t("workspaceQuestionSet.loading")}
          </span>
        </div>
      ) : null}

      {artifact ? (
        <div className="scrollbar-hover flex-1 min-h-0 overflow-y-auto p-3">
          <QuestionSetInlineView
            artifact={artifact}
            persistKey={`selected-question-set:${artifact.artifactID}`}
            onSubmit={async (answers) => {
              const response = await requestJson<SubmitQuestionSetAttemptOutput>(
                props.directory,
                `/api/question-set-artifacts/${artifact.artifactID}/attempts`,
                {
                  method: "POST",
                  body: {
                    answers: artifact.questions.map((question) => ({
                      questionID: question.id,
                      selectedChoiceIds: answers[question.id] ?? [],
                    })),
                  },
                },
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
