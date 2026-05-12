import { AnimatePresence, motion } from "motion/react"
import { ClipboardPenLine } from "lucide-react"
import { isRecord } from "../../tools/types"
import { language } from "@/context/language"
import { ToolRow, ToolRowAction, ToolRowIcon, ToolRowSubject } from "../tool-row"
import { TextShimmer } from "../../tools/text-shimmer"
import { TASK_CARD_TRANSITION } from "./task-motion"
import type { ToolPartProps } from "../registry"
import {
  QuestionMarkdown,
  buildQuestionMarkdownCacheKey,
  enumerateQuestionMarkdownText,
} from "./question-set/question-markdown"

type ToolQuestion = {
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

export function renderQuestionTool({ state, info, icon }: ToolPartProps) {
  const questions = readQuestions(state.input)
  const questionAnswers = readQuestionAnswers(state.metadata)
  const hasAnswers = questionAnswers.length > 0
  const isActive = state.status === "pending" || state.status === "running"
  const isPending = state.status === "pending"

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
    <AnimatePresence mode="wait" initial={false}>
      {isPending ? (
        <motion.div
          key="pending"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={TASK_CARD_TRANSITION}
        >
          <ToolRow>
            <ToolRowIcon>
              <ClipboardPenLine className="size-3.5" />
            </ToolRowIcon>
            <ToolRowAction>
              <TextShimmer text={language.t("chatTools.askingQuestions")} active={true} />
            </ToolRowAction>
          </ToolRow>
        </motion.div>
      ) : !hasAnswers ? (
        <motion.div
          key="asking"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={TASK_CARD_TRANSITION}
        >
          <ToolRow>
            <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
            <ToolRowAction>
              <TextShimmer text="asking" active={isActive} />
            </ToolRowAction>
            {subtitle ? <ToolRowSubject>{subtitle}</ToolRowSubject> : null}
          </ToolRow>
        </motion.div>
      ) : (
        <motion.div
          key="answered"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={TASK_CARD_TRANSITION}
          className="w-full overflow-hidden rounded-lg border border-border-weak-base bg-surface-base"
        >
          <div className="border-b border-border-weak-base p-2">
            <ToolRow>
              <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
              <ToolRowAction>asked</ToolRowAction>
              {subtitle ? <ToolRowSubject>{subtitle}</ToolRowSubject> : null}
            </ToolRow>
          </div>
          <div className="flex flex-col gap-3 p-2">
            {questions.map((question, index) => {
              const answers = questionAnswers[index] ?? []
              const answerEntries = enumerateQuestionMarkdownText(answers)
              const questionKey = `${question.question}:${answers.join("|")}`
              const questionCacheKey = buildQuestionMarkdownCacheKey(
                "question-tool",
                index,
                question.question,
              )
              return (
                <div key={questionKey} className="flex flex-col gap-1">
                  <QuestionMarkdown
                    text={question.question}
                    cacheKey={`${questionCacheKey}:prompt`}
                    variant="compact"
                    className="text-text-base"
                  />
                  <div className="flex flex-col gap-0.5 pl-2">
                    {answers.length > 0 ? (
                      answerEntries.map((answerEntry) => (
                        <QuestionMarkdown
                          key={`${questionCacheKey}:answer:${answerEntry.text}:${answerEntry.occurrence}`}
                          text={answerEntry.text}
                          cacheKey={`${questionCacheKey}:answer:${answerEntry.text}:${answerEntry.occurrence}`}
                          variant="compact"
                          className="text-text-weaker"
                        />
                      ))
                    ) : (
                      <span className="text-xs text-text-weaker">
                        {language.t("chatTools.noAnswer")}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
