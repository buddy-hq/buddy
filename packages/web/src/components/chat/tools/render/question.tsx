import { BasicTool } from "../../tools/basic-tool"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { motion } from "motion/react"
import { MOTION_SOFT } from "../../tools/tool-motion"
import { ToolErrorPanel } from "../../tools/tool-error-panel"
import { language } from "@/context/language"
import { isRecord } from "../../tools/types"
import type { ToolPartProps } from "../registry"
interface ToolQuestion {
  question: string
}

function readQuestions(input: Record<string, unknown>): ToolQuestion[] {
  const value = input.questions
  if (!Array.isArray(value)) return []

  return value.flatMap((entry): ToolQuestion[] => {
    if (!isRecord(entry)) return []
    if (typeof entry.question !== "string") return []
    return [{ question: entry.question }]
  })
}

function readQuestionAnswers(metadata: Record<string, unknown>): string[][] {
  const value = metadata.answers
  if (!Array.isArray(value)) return []

  return value.map((entry) => {
    if (!Array.isArray(entry)) return []
    return entry.filter((answer): answer is string => typeof answer === "string")
  })
}

export function renderQuestionTool({ state, info, defaultOpen }: ToolPartProps) {
  const questions = readQuestions(state.input)
  const questionAnswers = readQuestionAnswers(state.metadata)
  const hasAnswers = questionAnswers.length > 0
  const output = state.output || (state.error ?? "")
  const hasContent = output.trim().length > 0
  const hasError = state.status === "error" && hasContent

  const subtitle =
    questions.length === 0
      ? info.subtitle
      : hasAnswers
        ? language.t("chatTools.answeredCount", { count: questions.length })
        : language.t(
            questions.length === 1
              ? "chatTools.questionCount.one"
              : "chatTools.questionCount.other",
            { count: questions.length },
          )

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION_SOFT}
      className="rounded-xl border border-border-base bg-surface-base shadow-sm ring-1 ring-border-brand-base/20 p-2"
    >
      <BasicTool
        trigger={{ title: info.title, subtitle }}
        status={state.status}
        defaultOpen={defaultOpen || hasAnswers}
      >
        {hasAnswers ? (
          <div className="space-y-2">
            {questions.map((question, index) => {
              const answers = questionAnswers[index] ?? []
              const questionKey = `${question.question}:${answers.join("|")}`
              return (
                <div
                  key={questionKey}
                  className="rounded-md border border-border-base bg-background-base p-2"
                >
                  <div className="text-sm text-text-base">{question.question}</div>
                  <div className="mt-1 text-xs text-text-weak">
                    {answers.join(", ") || language.t("chatTools.noAnswer")}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
        {hasError ? (
          <ToolErrorPanel error={output} />
        ) : hasContent ? (
          <ToolOutputPanel output={output} copyLabel={language.t("chatTools.copyOutput")} />
        ) : null}
      </BasicTool>
    </motion.div>
  )
}
