import { AnimatePresence, motion } from "motion/react"
import { isRecord } from "../../tools/types"
import { language } from "@/context/language"
import { ToolRow, ToolRowAction, ToolRowIcon } from "../tool-row"
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

/**
 * Completed Q&A body: questions and answers share one left edge. Hierarchy is
 * color only (question weak, answer weakest).
 */
function QuestionAnswerList({
  questions,
  answers,
}: {
  questions: ToolQuestion[]
  answers: string[][]
}) {
  const questionEntries = enumerateQuestionMarkdownText(
    questions.map((entry) => entry.question),
  )

  // Pair gap >> Q→A gap so each exchange reads as a unit.
  return (
    <ul className="flex list-none flex-col gap-4">
      {questionEntries.map((questionEntry, index) => {
        const question = questions[index]?.question ?? questionEntry.text
        const entryAnswers = answers[index] ?? []
        const answerEntries = enumerateQuestionMarkdownText(entryAnswers)
        const cacheKey = buildQuestionMarkdownCacheKey("question-tool", index, question)
        return (
          <li
            key={`q:${questionEntry.text}:${questionEntry.occurrence}`}
            className="flex min-w-0 flex-col gap-0.5"
          >
            <QuestionMarkdown
              text={question}
              cacheKey={`${cacheKey}:prompt`}
              variant="compact"
              className="min-w-0 text-text-weak"
            />
            {entryAnswers.length > 0 ? (
              answerEntries.map((answerEntry) => (
                <QuestionMarkdown
                  key={`${cacheKey}:answer:${answerEntry.text}:${answerEntry.occurrence}`}
                  text={answerEntry.text}
                  cacheKey={`${cacheKey}:answer:${answerEntry.text}:${answerEntry.occurrence}`}
                  variant="compact"
                  className="min-w-0 text-text-weakest"
                />
              ))
            ) : (
              <span className="text-xs italic text-text-weakest">
                {language.t("chatTools.noAnswer")}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function renderQuestionTool({ state, info, icon }: ToolPartProps) {
  const questions = readQuestions(state.input)
  const questionAnswers = readQuestionAnswers(state.metadata)
  const hasAnswers = questionAnswers.length > 0
  const isActive = state.status === "pending" || state.status === "running"
  const isPending = state.status === "pending"
  const isAnswered = !isActive && hasAnswers

  // One chrome phrase, one type style — never "asked" + smaller subject.
  // Singular/plural only; no counts and no answer dump in the top row.
  const chromeLabel =
    questions.length === 0
      ? (info.subtitle ?? language.t("chatTools.asking.other"))
      : language.t(questions.length === 1 ? "chatTools.asked.one" : "chatTools.asked.other")
  const askingLabel =
    questions.length === 0
      ? language.t("chatTools.askingQuestions")
      : language.t(questions.length === 1 ? "chatTools.asking.one" : "chatTools.asking.other")

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
            <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
            <ToolRowAction className="normal-case text-text-weaker">
              <TextShimmer text={language.t("chatTools.askingQuestions")} active={true} />
            </ToolRowAction>
          </ToolRow>
        </motion.div>
      ) : !isAnswered ? (
        <motion.div
          key="asking"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={TASK_CARD_TRANSITION}
        >
          <ToolRow>
            <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
            <ToolRowAction className="normal-case text-text-weaker">
              <TextShimmer text={askingLabel} active={isActive} />
            </ToolRowAction>
          </ToolRow>
        </motion.div>
      ) : (
        <motion.div
          key="answered"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={TASK_CARD_TRANSITION}
          className="w-full"
        >
          <ToolRow className="mb-3">
            <ToolRowIcon>{icon?.("size-3.5")}</ToolRowIcon>
            <ToolRowAction className="normal-case text-text-weaker">{chromeLabel}</ToolRowAction>
          </ToolRow>
          <QuestionAnswerList questions={questions} answers={questionAnswers} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
