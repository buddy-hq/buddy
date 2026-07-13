import { ToolOutputPanel } from "../../../tools/tool-output-panel"
import type { ToolPartProps } from "../../registry"
import { language } from "@/context/language"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { IDEMPOTENCY_KEY_PARAMETER } from "@/lib/idempotency"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import {
  QuestionSetInlineView,
  type QuestionSetObject,
  type SubmitQuestionSetAttemptOutput,
} from "./question-set-inline-view"
import { QuestionSetToolCard } from "./question-set-tool-card"
import {
  objectBenchTarget,
  readInlinePresentation,
  type BuddyPresentationDescriptor,
} from "../buddy-object-result"
import { useHydratedInlinePresentation } from "../use-hydrated-inline-presentation"

type RenderSavedQuestionSetOutput = {
  questionSet: QuestionSetObject
  questionCount: number
}

function parseRenderSavedQuestionSetOutput(
  presentation: BuddyPresentationDescriptor,
): RenderSavedQuestionSetOutput | undefined {
  if (!presentation || presentation.data?.renderer !== "question-set") return undefined
  return {
    questionSet: presentation.data.questionSet,
    questionCount: presentation.data.questionSet.questions.length,
  }
}

function questionCountLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.questionCount.one" : "chatTools.questionCount.other", {
    count,
  })
}

function CompletedQuestionSetTool(props: {
  toolProps: ToolPartProps
  presentation: BuddyPresentationDescriptor
}) {
  const openBenchRoute = useOpenBench()
  const directory = props.toolProps.directory
  const output = props.toolProps.state.output || (props.toolProps.state.error ?? "")
  const showOutput = output.trim().length > 0
  const hydrated = useHydratedInlinePresentation({
    directory,
    presentation: props.presentation,
  })
  const parsed = parseRenderSavedQuestionSetOutput(hydrated.presentation)

  if (!parsed) {
    return (
      <QuestionSetToolCard
        title={props.toolProps.info.title}
        subtitle={props.toolProps.info.subtitle}
        status={props.toolProps.state.status}
      >
        {hydrated.isPending ? (
          <div className="text-sm text-text-weak">Loading question set...</div>
        ) : hydrated.error ? (
          <div className="text-sm text-icon-critical-base">Question set is unavailable.</div>
        ) : showOutput ? (
          <ToolOutputPanel output={output} copyLabel={language.t("chatTools.copyOutput")} />
        ) : null}
      </QuestionSetToolCard>
    )
  }

  return (
    <QuestionSetToolCard
      title={parsed.questionSet.title}
      subtitle={`${parsed.questionSet.groupType} • ${questionCountLabel(parsed.questionCount)}`}
      status={props.toolProps.state.status}
    >
      <QuestionSetInlineView
        questionSet={parsed.questionSet}
        onOpenBench={
          directory
            ? () => {
                void openBenchRoute({
                  directory,
                  target: objectBenchTarget({
                    kind: "question-set",
                    objectID: parsed.questionSet.objectID,
                    viewID: "practice",
                  }),
                  mode: BENCH_MODE_REQUEST_POLICY,
                  autoOpen: null,
                })
              }
            : undefined
        }
        onSubmit={async (answers, submissionID) => {
          if (!directory) {
            throw new Error(language.t("chatTools.questionSetNoWorkspaceDirectory"))
          }
          const response: SubmitQuestionSetAttemptOutput = requireBuddyData(
            await getBuddyClient(directory).objectQuestionSet.submitAttempt({
              [IDEMPOTENCY_KEY_PARAMETER]: submissionID,
              directory,
              objectID: parsed.questionSet.objectID,
              answers: parsed.questionSet.questions.map((question) => ({
                questionID: question.id,
                selectedChoiceIds: answers[question.id] ?? [],
              })),
            }),
          )

          return response.result
        }}
      />
    </QuestionSetToolCard>
  )
}

export function renderSavedQuestionSetTool(props: ToolPartProps) {
  const running = props.state.status === "pending" || props.state.status === "running"
  const presentation =
    props.state.status === "completed"
      ? readInlinePresentation(props.state.metadata, "question-set")
      : undefined

  if (running) {
    return (
      <QuestionSetToolCard
        title={props.info.title}
        subtitle={props.info.subtitle}
        status={props.state.status}
      >
        <div className="text-sm text-text-weak">Preparing question set...</div>
      </QuestionSetToolCard>
    )
  }
  if (!presentation) {
    const output = props.state.output || (props.state.error ?? "")
    return (
      <QuestionSetToolCard
        title={props.info.title}
        subtitle={props.info.subtitle}
        status={props.state.status}
      >
        {output.trim().length > 0 ? (
          <ToolOutputPanel output={output} copyLabel={language.t("chatTools.copyOutput")} />
        ) : null}
      </QuestionSetToolCard>
    )
  }
  return <CompletedQuestionSetTool toolProps={props} presentation={presentation} />
}
