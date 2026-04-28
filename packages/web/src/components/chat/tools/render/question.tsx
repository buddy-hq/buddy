import { motion } from "motion/react"
import { MOTION_SOFT } from "../../tools/tool-motion"
import { language } from "@/context/language"
import { isRecord } from "../../tools/types"
import { TextShimmer } from "../../tools/text-shimmer"
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
      className="w-full rounded-xl border border-border-base bg-surface-base p-4"
    >
      {hasAnswers ? (
        <div className="flex w-full flex-col gap-6">
          {questions.map((question, index) => {
            const answers = questionAnswers[index] ?? []
            const questionKey = `${question.question}:${answers.join("|")}`
            return (
              <div key={questionKey} className="flex w-full flex-col gap-2">
                <div className="text-[15px] font-medium leading-relaxed text-text-stronger">
                  {question.question}
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-surface-weak px-3 py-2 text-[14px] leading-relaxed text-text-base">
                  <span className="mt-0.5 font-medium text-text-weaker">↳</span>
                  <div className="flex-1">
                    {answers.join(", ") || language.t("chatTools.noAnswer")}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-weak">
            <TextShimmer
              text={info.title}
              active={state.status === "pending" || state.status === "running"}
            />
          </span>
          {subtitle && <span className="text-xs text-text-weaker">{subtitle}</span>}
        </div>
      )}
    </motion.div>
  )
}
