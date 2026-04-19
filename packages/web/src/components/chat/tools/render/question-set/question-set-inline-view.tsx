import { useEffect, useMemo, useState } from "react"
import { Button } from "@buddy/ui"
import { language } from "@/context/language"

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
}) {
  const persistKey = props.persistKey ?? props.artifact.artifactID
  const cachedState = questionSetInlineSessionState.get(persistKey)
  const [answers, setAnswers] = useState<AnswerState>(cachedState?.answers ?? {})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(cachedState?.error)
  const [result, setResult] = useState<QuestionSetEvaluationResult | undefined>(cachedState?.result)
  const [randomizeSeed, setRandomizeSeed] = useState(cachedState?.randomizeSeed ?? 0)

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-weak">
        <span>{props.artifact.groupType}</span>
        <span>•</span>
        <span>{questionCountLabel(props.artifact.questions.length)}</span>
      </div>

      {result ? (
        <div className="rounded-md border border-border-base/60 bg-surface-raised-base px-3 py-2 text-sm">
          <p className="font-medium text-text-base">
            Score: {result.correctQuestions}/{result.totalQuestions}
          </p>
          <p className="text-xs text-text-weak">Status: {result.status}</p>
        </div>
      ) : null}

      <div className="space-y-3">
        {props.artifact.questions.map((question, questionIndex) => {
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

          return (
            <div
              key={question.id}
              className="rounded-md border border-border-base/70 bg-background-base px-3 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-text-base">
                  {language.t("chatTools.questionPrefix", { index: questionIndex + 1 })}{" "}
                  {question.prompt}
                </p>
                {evaluation ? (
                  <span className="text-xs text-text-weak">
                    {questionStatusLabel(evaluation.correct)}
                  </span>
                ) : null}
              </div>

              {question.payload.multipleSelect && expectedCount ? (
                <p className="mt-1 text-xs text-text-weak">
                  Choose {expectedCount} {expectedCount === 1 ? "answer" : "answers"}.
                </p>
              ) : null}

              <div className="mt-3 space-y-2">
                {questionChoices.map((choice) => {
                  const selected = selectedChoiceIds.includes(choice.id)
                  const choiceEvaluation = evaluationChoiceByID.get(choice.id)
                  const showRationale =
                    !!choiceEvaluation?.rationale &&
                    (choiceEvaluation.selected || choiceEvaluation.correct)

                  return (
                    <label
                      key={choice.id}
                      className="block rounded-md border border-border-base/60 bg-surface-raised-base/40 px-2 py-2"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type={question.payload.multipleSelect ? "checkbox" : "radio"}
                          name={`question-${question.id}`}
                          checked={selected}
                          onChange={() =>
                            toggleChoice({
                              questionID: question.id,
                              choiceID: choice.id,
                              multipleSelect: question.payload.multipleSelect,
                              noneOfTheAboveChoiceID,
                            })
                          }
                          disabled={submitting}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-text-base">{choice.content}</p>
                          {choiceEvaluation ? (
                            <p className="text-xs text-text-weak">
                              {choiceEvaluation.correct
                                ? "correct"
                                : choiceEvaluation.selected
                                  ? "selected"
                                  : ""}
                            </p>
                          ) : null}
                          {showRationale ? (
                            <p className="text-xs text-text-weak">{choiceEvaluation?.rationale}</p>
                          ) : null}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>

              {evaluation && (evaluation.explanation || question.explanation) ? (
                <p className="mt-2 text-xs text-text-weak">
                  {evaluation?.explanation ?? question.explanation}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void submitAttempt()} disabled={submitting}>
          {submitting ? language.t("common.saving") : "Submit"}
        </Button>
      </div>

      {error ? (
        <p className="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}
    </div>
  )
}
