import type { ReactNode } from "react"
import { Badge } from "@buddy/ui"
import { ListChecksIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import { ToolRow, ToolRowAction, ToolRowIcon } from "@/components/chat/tools/tool-row"
import { TextShimmer } from "@/components/chat/tools/text-shimmer"
import {
  QuestionMarkdown,
  buildQuestionMarkdownCacheKey,
  enumerateQuestionMarkdownText,
} from "@/components/chat/tools/render/question-set/question-markdown"

/**
 * Easel: original thread body + unified chrome phrase.
 *
 * Chrome (one phrase, one weight — not action + smaller subject):
 *   1 → "asked a question" / "asking a question"
 *   n → "asked questions" / "asking questions"
 *
 * Body: one left edge; answer color weaker than question (no rail/icon).
 */

type MockQuestion = {
  question: string
  answers: string[]
}

function askedLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.asked.one" : "chatTools.asked.other")
}

function askingLabel(count: number): string {
  return language.t(count === 1 ? "chatTools.asking.one" : "chatTools.asking.other")
}

function ToolChrome({ label, shimmer }: { label: string; shimmer?: boolean }) {
  return (
    <ToolRow className="mb-3">
      <ToolRowIcon>
        <ListChecksIcon className="size-3.5" />
      </ToolRowIcon>
      <ToolRowAction className="normal-case text-text-weaker">
        {shimmer ? <TextShimmer text={label} active={true} /> : label}
      </ToolRowAction>
    </ToolRow>
  )
}

function TranscriptFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[36rem] rounded-md bg-background-base px-1 py-1">{children}</div>
  )
}

/** Body: one left edge; weaker answer color (no rail / icon / ordinals) */
function QuestionAnswerList({
  questions,
  cachePrefix,
}: {
  questions: MockQuestion[]
  cachePrefix: string
}) {
  const questionEntries = enumerateQuestionMarkdownText(questions.map((q) => q.question))

  return (
    <ul className="flex list-none flex-col gap-4">
      {questionEntries.map((entry, index) => {
        const question = questions[index]?.question ?? entry.text
        const answers = questions[index]?.answers ?? []
        const answerEntries = enumerateQuestionMarkdownText(answers)
        const cacheKey = buildQuestionMarkdownCacheKey(cachePrefix, index, question)

        return (
          <li
            key={`q:${entry.text}:${entry.occurrence}`}
            className="flex min-w-0 flex-col gap-0.5"
          >
            <QuestionMarkdown
              text={question}
              cacheKey={`${cacheKey}:prompt`}
              variant="compact"
              className="min-w-0 text-text-weak"
            />
            {answers.length > 0 ? (
              answerEntries.map((answerEntry) => (
                <QuestionMarkdown
                  key={`${cacheKey}:a:${answerEntry.text}:${answerEntry.occurrence}`}
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

function AnsweredCard({
  questions,
  cachePrefix,
}: {
  questions: MockQuestion[]
  cachePrefix: string
}) {
  return (
    <TranscriptFrame>
      <ToolChrome label={askedLabel(questions.length)} />
      <QuestionAnswerList questions={questions} cachePrefix={cachePrefix} />
    </TranscriptFrame>
  )
}

// ─── States ─────────────────────────────────────────────────────────────────

const MULTI_MATH: MockQuestion[] = [
  { question: "If $x - 2 = 0$, what is $x$?", answers: ["$x = 2$"] },
  { question: "If $x - 3 = 0$, what is $x$?", answers: ["$x = -3$"] },
  {
    question: "What should we get if we expand $(x - 2)(x - 3)$?",
    answers: ["$x^2 - 5x + 6$"],
  },
]

const SINGLE: MockQuestion[] = [
  {
    question: "Which pair now gives us the factors of the quadratic?",
    answers: ["Need whiteboard open"],
  },
]

const MULTI_SELECT: MockQuestion[] = [
  {
    question: "Which surfaces should stay open while we work?",
    answers: ["Whiteboard", "Editor"],
  },
]

const PARTIAL: MockQuestion[] = [
  { question: "If $x - 2 = 0$, what is $x$?", answers: ["$x = 2$"] },
  { question: "If $x - 3 = 0$, what is $x$?", answers: [] },
  {
    question: "What should we get if we expand $(x - 2)(x - 3)$?",
    answers: ["$x^2 - 5x + 6$"],
  },
]

const LONG: MockQuestion[] = [
  {
    question:
      "Given everything we have tried so far on the quadratic, which next step should we take before we commit to a factorisation method — and why?",
    answers: [
      "Open the whiteboard and sketch the roots first so we can check signs before expanding",
    ],
  },
]

type StateCard = {
  id: string
  label: string
  note: string
  render: () => ReactNode
}

const STATES: StateCard[] = [
  {
    id: "pending",
    label: "Pending",
    note: "Tool part created — shimmer only.",
    render: () => (
      <TranscriptFrame>
        <ToolChrome label={language.t("chatTools.askingQuestions")} shimmer />
      </TranscriptFrame>
    ),
  },
  {
    id: "asking-1",
    label: "Asking · one",
    note: "One phrase, one weight: “Asking a question”.",
    render: () => (
      <TranscriptFrame>
        <ToolChrome label={askingLabel(1)} shimmer />
      </TranscriptFrame>
    ),
  },
  {
    id: "asking-3",
    label: "Asking · many",
    note: "One phrase: “Asking questions”.",
    render: () => (
      <TranscriptFrame>
        <ToolChrome label={askingLabel(3)} shimmer />
      </TranscriptFrame>
    ),
  },
  {
    id: "answered-1",
    label: "Answered · one",
    note: "Chrome: “Asked a question”. One left edge, no elbow.",
    render: () => <AnsweredCard questions={SINGLE} cachePrefix="easel-single" />,
  },
  {
    id: "answered-3",
    label: "Answered · many",
    note: "Chrome: “Asked questions”. One left edge, no elbow.",
    render: () => <AnsweredCard questions={MULTI_MATH} cachePrefix="easel-multi" />,
  },
  {
    id: "answered-multiselect",
    label: "Answered · multi-select",
    note: "Multiple labels under one question.",
    render: () => <AnsweredCard questions={MULTI_SELECT} cachePrefix="easel-ms" />,
  },
  {
    id: "partial",
    label: "Answered · partial",
    note: "Skipped question shows (no answer).",
    render: () => <AnsweredCard questions={PARTIAL} cachePrefix="easel-partial" />,
  },
  {
    id: "long",
    label: "Answered · long copy",
    note: "Long Q/A; chrome stays short and one weight.",
    render: () => <AnsweredCard questions={LONG} cachePrefix="easel-long" />,
  },
]

function StateCardView({ state }: { state: StateCard }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border-weaker-base bg-background-base shadow-sm">
      <header className="border-b border-border-weaker-base px-3 py-2">
        <h3 className="text-xs font-medium text-text-strong">{state.label}</h3>
        <p className="mt-0.5 text-[11px] leading-snug text-text-weaker">{state.note}</p>
      </header>
      <div className="bg-surface-inset-base/50 px-4 py-5">{state.render()}</div>
    </section>
  )
}

export function QuestionToolAnsweredEasel() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      <div className="shrink-0 space-y-1.5 border-b border-border-weaker-base px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium text-text-strong">
              Question tool · original thread · all states
            </h2>
            <p className="text-[11px] text-text-weaker">
              Chrome is one phrase at one weight:{" "}
              <span className="text-text-weak">Asked a question</span> /{" "}
              <span className="text-text-weak">Asked questions</span>. Body: one left edge;
              answers weaker.
            </p>
          </div>
          <Badge variant="outline">Easel · UI fidelity</Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-3 lg:grid-cols-2">
          {STATES.map((state) => (
            <StateCardView key={state.id} state={state} />
          ))}
        </div>
      </div>
    </div>
  )
}
