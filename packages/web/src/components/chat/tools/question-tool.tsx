import { ToolCardWithDetails, ToolOutputPanel } from '../shared/tool-card'
import { isRecord, readString, unwrapError } from '../shared/utils'
import type { ToolPartProps, ToolQuestion } from './registry'

function readQuestions(input: Record<string, unknown>): ToolQuestion[] {
  const value = input.questions
  if (!Array.isArray(value)) return []

  return value.flatMap((entry): ToolQuestion[] => {
    if (!isRecord(entry)) return []
    if (typeof entry.question !== 'string') return []
    return [{ question: entry.question }]
  })
}

function readQuestionAnswers(metadata: Record<string, unknown>): string[][] {
  const value = metadata.answers
  if (!Array.isArray(value)) return []

  return value.map((entry) => {
    if (!Array.isArray(entry)) return []
    return entry.filter((answer): answer is string => typeof answer === 'string')
  })
}

export function QuestionTool({ state, info, defaultOpen }: ToolPartProps) {
  const running = state.status === 'pending' || state.status === 'running'
  const questions = readQuestions(state.input)
  const questionAnswers = readQuestionAnswers(state.metadata)
  const hasAnswers = questionAnswers.length > 0
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : '')).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : '')

  const subtitle =
    questions.length === 0
      ? info.subtitle
      : hasAnswers
        ? `${questions.length} answered`
        : `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`

  return (
    <ToolCardWithDetails
      info={{ ...info, subtitle }}
      status={state.status}
      running={running}
      defaultOpen={defaultOpen || hasAnswers}
    >
      {hasAnswers ? (
        <div className="space-y-2">
          {questions.map((question, index) => {
            const answers = questionAnswers[index] ?? []
            return (
              <div key={index} className="rounded-md border border-border bg-background p-2">
                <div className="text-sm text-foreground">{question.question}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {answers.join(', ') || '(no answer)'}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
      {showOutput ? (
        <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
      ) : null}
    </ToolCardWithDetails>
  )
}
