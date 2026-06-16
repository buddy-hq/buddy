import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Button, cn } from "@buddy/ui"
import { CheckIcon, ListIcon, PresentationIcon, XIcon } from "lucide-react"
import { artifactRef, artifactTarget } from "@/components/bench/bench-context-utils"
import { useRegisterBenchContextProvider } from "@/components/bench/bench-route-context"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import {
  QuestionMarkdown,
  buildQuestionMarkdownCacheKey,
} from "@/components/chat/tools/render/question-set/question-markdown"
import type {
  PublicQuestionSetArtifact,
  QuestionSetEvaluationResult,
} from "@/components/chat/tools/render/question-set/question-set-inline-view"
import { orderedChoicesForQuestion } from "@/components/chat/tools/render/question-set/question-set-inline-view"

type AnswerState = Record<string, string[]>

type QuestionSetBenchReviewProps = {
  directory: string
  route: string
  artifact: PublicQuestionSetArtifact
  onSubmit: (answers: AnswerState) => Promise<QuestionSetEvaluationResult>
}

function questionCountLabel(count: number) {
  return count === 1 ? "1 question" : `${count} questions`
}

function questionStatusLabel(correct: boolean | undefined) {
  if (correct === undefined) return undefined
  return correct ? "Correct" : "Incorrect"
}

function buildQuestionSetVisibleContext(input: {
  artifact: PublicQuestionSetArtifact
  answers: AnswerState
  currentStep: number
  evaluationByQuestionID: Map<string, QuestionSetEvaluationResult["questions"][number]>
  orderedChoicesByQuestionID: Map<
    string,
    PublicQuestionSetArtifact["questions"][number]["payload"]["choices"]
  >
  result?: QuestionSetEvaluationResult
  viewMode: "wizard" | "list"
}): string {
  const visibleQuestions =
    input.result || input.viewMode === "list"
      ? input.artifact.questions
      : input.artifact.questions[input.currentStep]
        ? [input.artifact.questions[input.currentStep]]
        : []

  const questionSections = visibleQuestions.map((question, visibleIndex) => {
    const questionIndex = input.artifact.questions.findIndex((entry) => entry.id === question.id)
    const selectedChoiceIds = input.answers[question.id] ?? []
    const evaluation = input.evaluationByQuestionID.get(question.id)
    const evaluationChoiceByID = new Map(
      evaluation?.choices.map((choice) => [choice.choiceID, choice]) ?? [],
    )
    const choices = input.orderedChoicesByQuestionID.get(question.id) ?? question.payload.choices
    const choiceLines = choices.map((choice) => {
      const selected = selectedChoiceIds.includes(choice.id)
      const choiceEvaluation = evaluationChoiceByID.get(choice.id)
      const rationale =
        choiceEvaluation?.rationale && (choiceEvaluation.selected || choiceEvaluation.correct)
          ? ` rationale="${choiceEvaluation.rationale}"`
          : ""
      const correctness = choiceEvaluation
        ? ` correct=${choiceEvaluation.correct}`
        : ""
      return `- ${selected ? "[selected]" : "[ ]"} ${choice.content}${correctness}${rationale}`
    })
    const explanation =
      evaluation && (evaluation.explanation || question.explanation)
        ? `Explanation: ${evaluation.explanation ?? question.explanation ?? ""}`
        : undefined

    return [
      `Question ${questionIndex >= 0 ? questionIndex + 1 : visibleIndex + 1}: ${question.prompt}`,
      question.payload.multipleSelect
        ? `Multiple select: true${question.payload.numCorrect ? `, expected answers: ${question.payload.numCorrect}` : ""}`
        : "Multiple select: false",
      `Choices:\n${choiceLines.join("\n")}`,
      evaluation ? `Result: ${questionStatusLabel(evaluation.correct) ?? "submitted"}` : undefined,
      explanation,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n")
  })

  return [
    `Question set: ${input.artifact.title}`,
    `View mode: ${input.viewMode}`,
    input.result
      ? `Score: ${input.result.correctQuestions} / ${input.result.totalQuestions}; status: ${input.result.status}`
      : "Result: not submitted",
    ...questionSections,
  ].join("\n\n")
}

export function QuestionSetBenchReview(props: QuestionSetBenchReviewProps) {
  const [answers, setAnswers] = useState<AnswerState>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [result, setResult] = useState<QuestionSetEvaluationResult | undefined>(undefined)
  const [randomizeSeed, setRandomizeSeed] = useState(0)
  const [viewMode, setViewMode] = useState<"wizard" | "list">("wizard")
  const [currentStep, setCurrentStep] = useState(0)
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1)
  const evaluationByQuestionID = useMemo(
    () => new Map(result?.questions.map((question) => [question.questionID, question]) ?? []),
    [result],
  )
  const orderedChoicesByQuestionID = useMemo(
    () =>
      new Map(
        props.artifact.questions.map((question) => [
          question.id,
          orderedChoicesForQuestion({
            artifactID: props.artifact.artifactID,
            question,
            randomizeSeed,
          }),
        ]),
      ),
    [props.artifact, randomizeSeed],
  )
  const resultState = error ? "error" : result ? "submitted" : "not-submitted"
  const contextProvider = useMemo(
    () => ({
      read: () => ({
        status: "open" as const,
        target: artifactTarget({
          artifactKind: "question-set",
          directory: props.directory,
          title: props.artifact.title,
          artifactID: props.artifact.artifactID,
          route: props.route,
          status: error ? "error" : "ready",
        }),
        metadata: [
          `group_type: ${props.artifact.groupType}`,
          `question_count: ${props.artifact.questions.length}`,
          `view_mode: ${viewMode}`,
          `current_step: ${currentStep + 1}`,
          `result_state: ${resultState}`,
        ],
        content: buildQuestionSetVisibleContext({
          artifact: props.artifact,
          answers,
          currentStep,
          evaluationByQuestionID,
          orderedChoicesByQuestionID,
          ...(result ? { result } : {}),
          viewMode,
        }),
        refs: [
          artifactRef({
            artifactID: props.artifact.artifactID,
            note: "Question set artifact on Bench.",
          }),
        ],
        hints: ["Do not expose correctness, rationales, or explanations before submission visibility."],
      }),
    }),
    [
      answers,
      currentStep,
      error,
      evaluationByQuestionID,
      orderedChoicesByQuestionID,
      props.artifact,
      props.directory,
      props.route,
      result,
      resultState,
      viewMode,
    ],
  )
  useRegisterBenchContextProvider(contextProvider)

  function updateAnswer(questionID: string, nextSelectedChoiceIds: string[]) {
    if (result) {
      setRandomizeSeed((current) => current + 1)
    }
    setResult(undefined)
    setError(undefined)
    setAnswers((current) => ({
      ...current,
      [questionID]: nextSelectedChoiceIds,
    }))
  }

  function toggleChoice(input: {
    questionID: string
    choiceID: string
    multipleSelect: boolean
    noneOfTheAboveChoiceID?: string
  }) {
    const currentSelected = answers[input.questionID] ?? []
    if (!input.multipleSelect) {
      updateAnswer(input.questionID, [input.choiceID])
      return
    }

    if (input.choiceID === input.noneOfTheAboveChoiceID) {
      updateAnswer(input.questionID, [input.choiceID])
      return
    }

    const withoutNoneOfTheAbove = input.noneOfTheAboveChoiceID
      ? currentSelected.filter((choiceID) => choiceID !== input.noneOfTheAboveChoiceID)
      : currentSelected

    if (withoutNoneOfTheAbove.includes(input.choiceID)) {
      updateAnswer(
        input.questionID,
        withoutNoneOfTheAbove.filter((choiceID) => choiceID !== input.choiceID),
      )
      return
    }

    updateAnswer(input.questionID, [...withoutNoneOfTheAbove, input.choiceID])
  }

  async function submitAttempt() {
    setSubmitting(true)
    setError(undefined)
    try {
      setResult(await props.onSubmit(answers))
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BenchViewerShell
      title={props.artifact.title}
      subtitle={`${props.artifact.groupType} · ${questionCountLabel(props.artifact.questions.length)}`}
      contentClassName="overflow-hidden"
      toolbar={
        <>
          <Button
            type="button"
            variant={viewMode === "wizard" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("wizard")}
            className="gap-2"
          >
            <PresentationIcon className="size-4" aria-hidden />
            Wizard
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="gap-2"
          >
            <ListIcon className="size-4" aria-hidden />
            List
          </Button>
        </>
      }
    >
      <div
        data-component="question-set-bench-review"
        data-view-mode={viewMode}
        className="flex h-full min-h-0 flex-col"
      >
        <div className="scrollbar-hover min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            {result ? (
              <div className="rounded-xl border border-border-success-base bg-surface-success-base/5 px-5 py-4">
                <p className="text-lg font-medium text-text-stronger">
                  Score: {result.correctQuestions} / {result.totalQuestions}
                </p>
                <p className="text-sm text-text-weak">
                  Status: <span className="capitalize">{result.status}</span>
                </p>
              </div>
            ) : null}

            <div className="relative min-h-[300px] space-y-6 overflow-hidden">
              <AnimatePresence
                mode={viewMode === "wizard" ? "wait" : "popLayout"}
                custom={slideDirection}
              >
                {props.artifact.questions.map((question, questionIndex) => {
                  if (viewMode === "wizard" && questionIndex !== currentStep && !result) {
                    return null
                  }

                  const selectedChoiceIds = answers[question.id] ?? []
                  const evaluation = evaluationByQuestionID.get(question.id)
                  const evaluationChoiceByID = new Map(
                    evaluation?.choices.map((choice) => [choice.choiceID, choice]) ?? [],
                  )
                  const questionChoices =
                    orderedChoicesByQuestionID.get(question.id) ?? question.payload.choices
                  const noneOfTheAboveChoiceID = questionChoices.find(
                    (choice) => choice.isNoneOfTheAbove,
                  )?.id
                  const expectedCount = question.payload.numCorrect
                  const questionCacheKey = buildQuestionMarkdownCacheKey(
                    "question-set-bench",
                    props.artifact.artifactID,
                    question.id,
                  )

                  return (
                    <motion.section
                      key={viewMode === "wizard" ? `wizard-${question.id}` : `list-${question.id}`}
                      custom={slideDirection}
                      initial={
                        viewMode === "wizard"
                          ? { opacity: 0, x: slideDirection === 1 ? 50 : -50 }
                          : { opacity: 0, y: 20 }
                      }
                      animate={
                        viewMode === "wizard" ? { opacity: 1, x: 0 } : { opacity: 1, y: 0 }
                      }
                      exit={
                        viewMode === "wizard"
                          ? {
                              opacity: 0,
                              x: slideDirection === 1 ? -50 : 50,
                              transition: { duration: 0.2 },
                            }
                          : { opacity: 0, y: -20, transition: { duration: 0.2 } }
                      }
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="rounded-xl border border-border-base bg-surface-raised-base p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-2 text-text-stronger">
                          <span className="mt-0.5 text-text-weak">{questionIndex + 1}.</span>
                          <QuestionMarkdown
                            text={question.prompt}
                            cacheKey={`${questionCacheKey}:prompt`}
                            className="min-w-0 flex-1 text-text-stronger"
                          />
                        </div>
                        {evaluation ? (
                          <div
                            className={cn(
                              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                              evaluation.correct
                                ? "border-border-success-base/30 bg-surface-success-base/10 text-text-success-base"
                                : "border-border-critical-base/30 bg-surface-critical-base/10 text-icon-critical-base",
                            )}
                          >
                            {evaluation.correct ? (
                              <CheckIcon className="size-3.5" />
                            ) : (
                              <XIcon className="size-3.5" />
                            )}
                            {questionStatusLabel(evaluation.correct)}
                          </div>
                        ) : null}
                      </div>

                      {question.payload.multipleSelect && expectedCount ? (
                        <p className="mt-2 text-sm text-text-weak">
                          Choose {expectedCount} {expectedCount === 1 ? "answer" : "answers"}.
                        </p>
                      ) : null}

                      <div className="mt-5 grid gap-3">
                        {questionChoices.map((choice) => {
                          const selected = selectedChoiceIds.includes(choice.id)
                          const choiceEvaluation = evaluationChoiceByID.get(choice.id)
                          const isCorrect = choiceEvaluation?.correct
                          const isWrongSelection =
                            choiceEvaluation && choiceEvaluation.selected && !choiceEvaluation.correct
                          const showRationale =
                            !!choiceEvaluation?.rationale &&
                            (choiceEvaluation.selected || choiceEvaluation.correct)

                          return (
                            <button
                              key={choice.id}
                              type="button"
                              aria-pressed={selected}
                              disabled={submitting}
                              onClick={() =>
                                toggleChoice({
                                  questionID: question.id,
                                  choiceID: choice.id,
                                  multipleSelect: question.payload.multipleSelect,
                                  noneOfTheAboveChoiceID,
                                })
                              }
                              className={cn(
                                "flex w-full flex-col gap-2 rounded-xl border-2 p-4 text-left transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base",
                                !evaluation &&
                                  !selected &&
                                  "border-border-base/50 bg-surface-base hover:border-border-interactive-base/50 hover:bg-surface-base-hover",
                                !evaluation &&
                                  selected &&
                                  "border-border-interactive-base bg-surface-interactive-weak",
                                evaluation &&
                                  isCorrect &&
                                  "border-border-success-base bg-surface-success-base/10",
                                evaluation &&
                                  isWrongSelection &&
                                  "border-border-critical-base bg-surface-critical-base/10",
                                evaluation &&
                                  !isCorrect &&
                                  !isWrongSelection &&
                                  "border-border-base/30 bg-surface-base opacity-60",
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    "flex size-5 shrink-0 items-center justify-center border",
                                    question.payload.multipleSelect ? "rounded-md" : "rounded-full",
                                    selected
                                      ? "border-border-interactive-base bg-surface-interactive-base text-text-on-interactive-base"
                                      : "border-border-strong-base bg-surface-base",
                                    evaluation &&
                                      isCorrect &&
                                      "border-border-success-base bg-surface-success-base text-text-on-success-base",
                                    evaluation &&
                                      isWrongSelection &&
                                      "border-border-critical-base bg-surface-critical-base text-text-on-critical-base",
                                  )}
                                >
                                  {evaluation && isCorrect ? (
                                    <CheckIcon className="size-3" strokeWidth={3} />
                                  ) : null}
                                  {evaluation && isWrongSelection ? (
                                    <XIcon className="size-3" strokeWidth={3} />
                                  ) : null}
                                  {!evaluation && selected && question.payload.multipleSelect ? (
                                    <CheckIcon className="size-3" strokeWidth={3} />
                                  ) : null}
                                  {!evaluation && selected && !question.payload.multipleSelect ? (
                                    <span className="size-2 rounded-full bg-white" />
                                  ) : null}
                                </span>
                                <QuestionMarkdown
                                  text={choice.content}
                                  cacheKey={`${questionCacheKey}:choice:${choice.id}:content`}
                                  variant="compact"
                                  className="min-w-0 flex-1 text-text-stronger"
                                />
                              </div>
                              {showRationale ? (
                                <div
                                  className={cn(
                                    "ml-8 rounded-md border bg-surface-base px-3 py-2 text-xs",
                                    isCorrect
                                      ? "border-border-success-base/30 text-text-success-base"
                                      : "border-border-critical-base/30 text-icon-critical-base",
                                  )}
                                >
                                  <QuestionMarkdown
                                    text={choiceEvaluation?.rationale ?? ""}
                                    cacheKey={`${questionCacheKey}:choice:${choice.id}:rationale`}
                                    variant="compact"
                                  />
                                </div>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>

                      {evaluation && (evaluation.explanation || question.explanation) ? (
                        <div className="mt-4 rounded-lg bg-surface-weak/50 p-4">
                          <p className="mb-2 text-sm font-semibold text-text-base">Explanation:</p>
                          <QuestionMarkdown
                            text={evaluation.explanation ?? question.explanation ?? ""}
                            cacheKey={`${questionCacheKey}:explanation`}
                            variant="compact"
                          />
                        </div>
                      ) : null}
                    </motion.section>
                  )
                })}
              </AnimatePresence>
            </div>

            {error ? (
              <p className="rounded-xl border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 border-t border-border-base/50 bg-background-base/90 px-6 py-4 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl justify-end gap-2">
            {result ? (
              <Button
                onClick={() => {
                  setResult(undefined)
                  setAnswers({})
                  setRandomizeSeed((current) => current + 1)
                  setCurrentStep(0)
                }}
              >
                Retry
              </Button>
            ) : viewMode === "wizard" ? (
              <div className="flex w-full items-center justify-between gap-4">
                <Button
                  variant="outline"
                  disabled={currentStep === 0}
                  onClick={() => {
                    setSlideDirection(-1)
                    setCurrentStep((current) => Math.max(0, current - 1))
                  }}
                >
                  Previous
                </Button>
                <span className="text-xs font-medium text-text-weak">
                  Question {currentStep + 1} of {props.artifact.questions.length}
                </span>
                {currentStep < props.artifact.questions.length - 1 ? (
                  <Button
                    onClick={() => {
                      setSlideDirection(1)
                      setCurrentStep((current) =>
                        Math.min(props.artifact.questions.length - 1, current + 1),
                      )
                    }}
                  >
                    Next
                  </Button>
                ) : (
                  <Button onClick={() => void submitAttempt()} disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit Quiz"}
                  </Button>
                )}
              </div>
            ) : (
              <Button className="w-full" onClick={() => void submitAttempt()} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Entire Quiz"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </BenchViewerShell>
  )
}
