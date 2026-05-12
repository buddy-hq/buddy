import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@buddy/ui"
import { language } from "@/context/language"
import { CheckIcon, XIcon, ListIcon, PresentationIcon } from "lucide-react"
import { cn } from "@buddy/ui"
import { QuestionMarkdown, buildQuestionMarkdownCacheKey } from "./question-markdown"

export type PublicQuestionSetArtifact = {
  artifactID: string
  title: string
  groupType: "quiz" | "practice" | "assessment"
  questions: Array<{
    id: string
    prompt: string
    goalIds: string[]
    explanation?: string
    payload: {
      multipleSelect: boolean
      countChoices?: boolean
      numCorrect?: number
      hasNoneOfTheAbove?: boolean
      randomize?: boolean
      choices: Array<{
        id: string
        content: string
        isNoneOfTheAbove?: boolean
      }>
    }
  }>
}

export type QuestionSetEvaluationResult = {
  totalQuestions: number
  correctQuestions: number
  status: "completed" | "partial" | "stuck"
  questions: Array<{
    questionID: string
    correct: boolean
    selectedChoiceIds: string[]
    correctChoiceIds: string[]
    explanation?: string
    choices: Array<{
      choiceID: string
      selected: boolean
      correct: boolean
      rationale?: string
    }>
  }>
}

export type SubmitQuestionSetAttemptOutput = {
  attemptID: string
  artifactID: string
  result: QuestionSetEvaluationResult
}

type AnswerState = Record<string, string[]>
type QuestionSetInlineSessionState = {
  answers: AnswerState
  error?: string
  randomizeSeed: number
  result?: QuestionSetEvaluationResult
}

const HASH_OFFSET_BASIS = 2166136261
const HASH_MULTIPLIER = 16777619
const questionSetInlineSessionState = new Map<string, QuestionSetInlineSessionState>()

function questionStatusLabel(correct: boolean | undefined): string | undefined {
  if (correct === undefined) {
    return undefined
  }
  return correct ? "Correct" : "Incorrect"
}

function questionCountLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.questionCount.one" : "chatTools.questionCount.other", {
    count,
  })
}

function hashString(value: string): number {
  let hash = HASH_OFFSET_BASIS
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, HASH_MULTIPLIER)
  }
  return hash >>> 0
}

function orderedChoicesForQuestion(input: {
  artifactID: string
  question: PublicQuestionSetArtifact["questions"][number]
  randomizeSeed: number
}) {
  if (!input.question.payload.randomize) {
    return input.question.payload.choices
  }

  return [...input.question.payload.choices].toSorted((left, right) => {
    const leftWeight = hashString(
      `${input.artifactID}:${input.question.id}:${input.randomizeSeed}:${left.id}`,
    )
    const rightWeight = hashString(
      `${input.artifactID}:${input.question.id}:${input.randomizeSeed}:${right.id}`,
    )
    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight
    }
    return left.id.localeCompare(right.id)
  })
}

export function QuestionSetInlineView(props: {
  artifact: PublicQuestionSetArtifact
  onSubmit: (answers: Record<string, string[]>) => Promise<QuestionSetEvaluationResult>
  persistKey?: string
  defaultOpen?: boolean
  hideCard?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const persistKey = props.persistKey ?? props.artifact.artifactID
  const cachedState = questionSetInlineSessionState.get(persistKey)
  const [answers, setAnswers] = useState<AnswerState>(cachedState?.answers ?? {})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(cachedState?.error)
  const [result, setResult] = useState<QuestionSetEvaluationResult | undefined>(cachedState?.result)
  const [randomizeSeed, setRandomizeSeed] = useState(cachedState?.randomizeSeed ?? 0)

  const [isOpen, setIsOpen] = useState(props.defaultOpen ?? false)
  const [viewMode, setViewMode] = useState<"wizard" | "list">("wizard")
  const [currentStep, setCurrentStep] = useState(0)

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

  const evaluationByQuestionID = new Map(
    result?.questions.map((question) => [question.questionID, question]) ?? [],
  )

  const [slideDirection, setSlideDirection] = useState<1 | -1>(1)

  useEffect(() => {
    questionSetInlineSessionState.set(persistKey, {
      answers,
      ...(error ? { error } : {}),
      randomizeSeed,
      ...(result ? { result } : {}),
    })
  }, [answers, error, persistKey, randomizeSeed, result])

  function updateAnswer(questionID: string, nextSelectedChoiceIds: string[]) {
    if (result) {
      // Start of a retry attempt: reshuffle randomized questions.
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
      const response = await props.onSubmit(answers)
      setResult(response)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    props.onOpenChange?.(open)
  }

  return (
    <>
      {props.hideCard ? null : (
        <div className="space-y-3 rounded-xl border border-border-base bg-surface-base p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-text-stronger">{props.artifact.title}</h3>
              <div className="flex items-center gap-2 text-xs text-text-weak mt-1">
                <span className="capitalize">{props.artifact.groupType}</span>
                <span>•</span>
                <span>{questionCountLabel(props.artifact.questions.length)}</span>
              </div>
            </div>
            <Button onClick={() => handleOpenChange(true)}>Open Question Set</Button>
          </div>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex max-h-[min(90vh,60rem)] w-[95vw] !max-w-[95vw] sm:!max-w-[95vw] h-[85vh] flex-col overflow-hidden"
          showCloseButton
        >
          <DialogHeader className="border-b border-border-base/30 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-base font-medium">{props.artifact.title}</DialogTitle>
                <DialogDescription className="sr-only">Question set review</DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "wizard" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("wizard")}
                  className="gap-2"
                >
                  <PresentationIcon className="size-4" />
                  Wizard
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="gap-2"
                >
                  <ListIcon className="size-4" />
                  List
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 scrollbar-hover">
            <div className="mx-auto max-w-3xl space-y-6">
              {result ? (
                <div className="rounded-xl border-2 border-border-success-base bg-surface-success-base/5 px-6 py-4">
                  <p className="text-lg font-medium text-text-stronger">
                    Score: {result.correctQuestions} / {result.totalQuestions}
                  </p>
                  <p className="text-sm text-text-weak">
                    Status: <span className="capitalize">{result.status}</span>
                  </p>
                </div>
              ) : null}

              <div className="space-y-6 relative overflow-hidden min-h-[300px]">
                <AnimatePresence
                  mode={viewMode === "wizard" ? "wait" : "popLayout"}
                  custom={slideDirection}
                >
                  {props.artifact.questions.map((question, questionIndex) => {
                    if (viewMode === "wizard" && questionIndex !== currentStep && !result) {
                      return null // hide other steps in wizard unless viewing results
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
                      "question-set-inline",
                      props.artifact.artifactID,
                      question.id,
                    )

                    return (
                      <motion.div
                        key={
                          viewMode === "wizard" ? `wizard-${question.id}` : `list-${question.id}`
                        }
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
                        className={cn(
                          "rounded-2xl border border-border-base bg-surface-raised-base p-6 shadow-sm",
                          viewMode === "list" && "mb-6",
                        )}
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
                                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                                evaluation.correct
                                  ? "bg-surface-success-base/10 text-text-success-base border border-border-success-base/30"
                                  : "bg-surface-critical-base/10 text-icon-critical-base border border-border-critical-base/30",
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
                            const showRationale =
                              !!choiceEvaluation?.rationale &&
                              (choiceEvaluation.selected || choiceEvaluation.correct)

                            // Style state
                            const isCorrect = choiceEvaluation?.correct
                            const isWrongSelection =
                              choiceEvaluation &&
                              choiceEvaluation.selected &&
                              !choiceEvaluation.correct
                            const onChoose = () => {
                              if (submitting) {
                                return
                              }
                              toggleChoice({
                                questionID: question.id,
                                choiceID: choice.id,
                                multipleSelect: question.payload.multipleSelect,
                                noneOfTheAboveChoiceID,
                              })
                            }

                            return (
                              <div
                                key={choice.id}
                                role="button"
                                tabIndex={submitting ? -1 : 0}
                                aria-pressed={selected}
                                aria-disabled={submitting}
                                onClick={onChoose}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault()
                                    onChoose()
                                  }
                                }}
                                className={cn(
                                  "flex w-full cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all duration-200 active:scale-[0.99]",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base",
                                  // Default states
                                  !evaluation &&
                                    !selected &&
                                    "border-border-base/50 bg-surface-base hover:border-brand-base/50 hover:bg-surface-base-hover",
                                  // Selected but unevaluated
                                  !evaluation && selected && "border-brand-base bg-brand-base/5",
                                  // Evaluated correct
                                  evaluation &&
                                    isCorrect &&
                                    "border-border-success-base bg-surface-success-base/10",
                                  // Evaluated wrong selection
                                  evaluation &&
                                    isWrongSelection &&
                                    "border-border-critical-base bg-surface-critical-base/10",
                                  // Evaluated other unelected options
                                  evaluation &&
                                    !isCorrect &&
                                    !isWrongSelection &&
                                    "border-border-base/30 bg-surface-base opacity-60 pointer-events-none",
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      "flex size-5 shrink-0 items-center justify-center border",
                                      question.payload.multipleSelect
                                        ? "rounded-md"
                                        : "rounded-full",
                                      !evaluation &&
                                        selected &&
                                        "border-brand-base bg-brand-base text-white",
                                      !evaluation &&
                                        !selected &&
                                        "border-border-strong bg-surface-base",
                                      evaluation &&
                                        isCorrect &&
                                        "border-border-success-base bg-surface-success-base text-white",
                                      evaluation &&
                                        isWrongSelection &&
                                        "border-border-critical-base bg-surface-critical-base text-white",
                                      evaluation &&
                                        !isCorrect &&
                                        !isWrongSelection &&
                                        "border-border-base/50 bg-surface-base text-icon-weak",
                                    )}
                                  >
                                    {evaluation && isCorrect ? (
                                      <CheckIcon className="size-3" strokeWidth={3} />
                                    ) : null}
                                    {evaluation && isWrongSelection ? (
                                      <XIcon className="size-3" strokeWidth={3} />
                                    ) : null}
                                    {!evaluation && selected && !question.payload.multipleSelect ? (
                                      <div className="size-2 rounded-full bg-white" />
                                    ) : null}
                                    {!evaluation && selected && question.payload.multipleSelect ? (
                                      <CheckIcon className="size-3" strokeWidth={3} />
                                    ) : null}
                                  </div>
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
                                      "mt-2 ml-8 rounded-md bg-surface-base px-3 py-2 text-xs",
                                      isCorrect
                                        ? "text-text-success-base border border-border-success-base/30"
                                        : "text-icon-critical-base border border-border-critical-base/30",
                                    )}
                                  >
                                    <QuestionMarkdown
                                      text={choiceEvaluation?.rationale ?? ""}
                                      cacheKey={`${questionCacheKey}:choice:${choice.id}:rationale`}
                                      variant="compact"
                                    />
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>

                        {evaluation && (evaluation.explanation || question.explanation) ? (
                          <div className="mt-4 rounded-lg bg-surface-weak/50 p-4">
                            <p className="mb-2 text-sm font-semibold text-text-base">
                              Explanation:
                            </p>
                            <QuestionMarkdown
                              text={evaluation?.explanation ?? question.explanation ?? ""}
                              cacheKey={`${questionCacheKey}:explanation`}
                              variant="compact"
                            />
                          </div>
                        ) : null}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>

              {!result ? (
                <div className="flex items-center justify-between pt-6 border-t border-border-base/40">
                  {viewMode === "wizard" ? (
                    <div className="flex w-full items-center justify-between">
                      <Button
                        variant="outline"
                        disabled={currentStep === 0}
                        onClick={() => {
                          setSlideDirection(-1)
                          setCurrentStep((prev) => Math.max(0, prev - 1))
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
                            setCurrentStep((prev) =>
                              Math.min(props.artifact.questions.length - 1, prev + 1),
                            )
                          }}
                        >
                          Next
                        </Button>
                      ) : (
                        <Button onClick={() => void submitAttempt()} disabled={submitting}>
                          {submitting ? language.t("common.saving") : "Submit Quiz"}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => void submitAttempt()}
                      disabled={submitting}
                    >
                      {submitting ? language.t("common.saving") : "Submit Entire Quiz"}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex justify-end pt-6">
                  <Button
                    onClick={() => {
                      setResult(undefined)
                      setAnswers({})
                      setRandomizeSeed((c) => c + 1)
                      setCurrentStep(0)
                    }}
                  >
                    Retry Quiz
                  </Button>
                </div>
              )}

              {error ? (
                <p className="rounded-xl border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
