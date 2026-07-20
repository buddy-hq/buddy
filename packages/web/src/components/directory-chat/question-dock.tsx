import { useEffect, useRef, useState } from "react"
import {
  ArrowLeftIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@buddy/ui"
import {
  QuestionInlineMarkdown,
  QuestionMarkdown,
  buildQuestionMarkdownCacheKey,
  isQuestionMarkdownBlock,
} from "@/components/chat/tools/render/question-set/question-markdown"
import { language } from "@/context/language"
import type { QuestionRequest } from "@/state/chat-types"

type QuestionDockProps = {
  request: QuestionRequest
  pendingCount?: number
  onReply: (answers: string[][]) => Promise<void>
  onReject: () => Promise<void>
}

const MAX_DIGIT_SHORTCUT = 9

function isCustomEnabled(value: boolean | undefined): boolean {
  return value !== false
}

function isTextEntryElement(element: Element | null): boolean {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}

function PendingLine(props: { count: number }) {
  if (props.count <= 0) return null
  return (
    <p className="text-[11px] text-text-weaker">
      {language.t(
        props.count === 1
          ? "chat.questionDock.pendingQuestions.one"
          : "chat.questionDock.pendingQuestions.other",
        { count: props.count },
      )}
    </p>
  )
}

export function QuestionDock(props: QuestionDockProps) {
  const requestID = props.request.id
  const questions = props.request.questions
  const hasReviewStep = questions.length > 1
  const reviewIndex = questions.length

  const [tab, setTab] = useState(0)
  const [selected, setSelected] = useState(0)
  const [answers, setAnswers] = useState<string[][]>(() => questions.map(() => []))
  const [customText, setCustomText] = useState<string[]>(() => questions.map(() => ""))
  const [editing, setEditing] = useState(false)
  const [responding, setResponding] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const questionsRef = useRef(questions)
  questionsRef.current = questions

  useEffect(() => {
    const nextQuestions = questionsRef.current
    setTab(0)
    setSelected(0)
    setAnswers(nextQuestions.map(() => []))
    setCustomText(nextQuestions.map(() => ""))
    setEditing(false)
    setResponding(false)
  }, [requestID])

  useEffect(() => {
    if (editing) return
    const frame = window.requestAnimationFrame(() => {
      containerRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editing, requestID])

  const isReview = hasReviewStep && tab === reviewIndex
  const question = isReview ? undefined : questions[tab]
  const options = question?.options ?? []
  const hasCustom = question ? isCustomEnabled(question.custom) : false
  const isMulti = question?.multiple === true
  const isSingleSelectAuto = questions.length === 1 && !isMulti
  const totalOptions = options.length + (hasCustom ? 1 : 0)
  const canGoPrevious = hasReviewStep && tab > 0
  const canGoNext = hasReviewStep && tab < reviewIndex
  const questionCacheKey = question
    ? buildQuestionMarkdownCacheKey("question-dock", requestID, tab, question.header)
    : undefined

  function selectTab(index: number) {
    setTab(index)
    setSelected(0)
    setEditing(false)
  }

  function submit() {
    if (responding) return
    setResponding(true)
    const result = questions.map((_, index) => answers[index] ?? [])
    void props.onReply(result).finally(() => setResponding(false))
  }

  function reject() {
    if (responding) return
    setResponding(true)
    void props.onReject().finally(() => setResponding(false))
  }

  function pick(answer: string, isCustomAnswer = false) {
    if (responding || isReview) return

    const nextAnswers = answers.map((value, index) => (index === tab ? [answer] : value))
    setAnswers(nextAnswers)
    if (isCustomAnswer) {
      setCustomText((current) => current.map((value, index) => (index === tab ? answer : value)))
    }

    if (isSingleSelectAuto) {
      setResponding(true)
      void props.onReply(nextAnswers).finally(() => setResponding(false))
      return
    }

    selectTab(Math.min(tab + 1, reviewIndex))
  }

  function toggle(answer: string) {
    if (isReview) return
    setAnswers((current) =>
      current.map((value, index) => {
        if (index !== tab) return value
        return value.includes(answer)
          ? value.filter((candidate) => candidate !== answer)
          : [...value, answer]
      }),
    )
  }

  function selectOption(index: number) {
    if (!question) return
    const isCustomOption = hasCustom && index === options.length
    if (isCustomOption) {
      const existingCustomAnswer = customText[tab] ?? ""
      if (isMulti && existingCustomAnswer && answers[tab]?.includes(existingCustomAnswer)) {
        toggle(existingCustomAnswer)
        return
      }
      setEditing(true)
      return
    }

    const option = options[index]
    if (!option) return
    if (isMulti) {
      toggle(option.label)
      return
    }
    pick(option.label)
  }

  function commitCustomAnswer(input?: { value?: string; advance?: boolean }) {
    if (isReview) return
    const value = (input?.value ?? inputRef.current?.value ?? "").trim()
    const previousValue = customText[tab] ?? ""

    if (!value) {
      setCustomText((current) =>
        current.map((candidate, index) => (index === tab ? "" : candidate)),
      )
      if (previousValue) {
        setAnswers((current) =>
          current.map((answer, index) =>
            index === tab ? answer.filter((candidate) => candidate !== previousValue) : answer,
          ),
        )
      }
      setEditing(false)
      return
    }

    if (!isMulti) {
      if (input?.advance === false) {
        setCustomText((current) =>
          current.map((candidate, index) => (index === tab ? value : candidate)),
        )
        setAnswers((current) => current.map((answer, index) => (index === tab ? [value] : answer)))
        setEditing(false)
        return
      }
      setEditing(false)
      pick(value, true)
      return
    }

    setCustomText((current) =>
      current.map((candidate, index) => (index === tab ? value : candidate)),
    )
    setAnswers((current) =>
      current.map((answer, index) => {
        if (index !== tab) return answer
        const withoutPrevious = previousValue
          ? answer.filter((candidate) => candidate !== previousValue)
          : answer
        return withoutPrevious.includes(value) ? withoutPrevious : [...withoutPrevious, value]
      }),
    )
    setEditing(false)
  }

  useEffect(() => {
    if (responding) return

    function handleKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) return

      const activeElement = document.activeElement
      if (isTextEntryElement(activeElement) && !containerRef.current?.contains(activeElement)) {
        return
      }

      const activeDialog =
        activeElement instanceof HTMLElement ? activeElement.closest("[role='dialog']") : null
      if (activeDialog && !containerRef.current?.contains(activeDialog)) return

      if (editing && !isReview) {
        if (event.key === "Escape") {
          event.preventDefault()
          setEditing(false)
        } else if (event.key === "Enter") {
          event.preventDefault()
          commitCustomAnswer()
        }
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        reject()
        return
      }

      if (isReview) {
        if (event.key === "ArrowLeft" || event.key === "h") {
          event.preventDefault()
          selectTab(Math.max(0, reviewIndex - 1))
        } else if (event.key === "Enter") {
          event.preventDefault()
          submit()
        }
        return
      }

      if (hasReviewStep) {
        if (event.key === "ArrowLeft" || event.key === "h") {
          event.preventDefault()
          selectTab(Math.max(0, tab - 1))
          return
        }
        if (event.key === "ArrowRight" || event.key === "l") {
          event.preventDefault()
          selectTab(Math.min(reviewIndex, tab + 1))
          return
        }
        if (event.key === "Tab") {
          event.preventDefault()
          const direction = event.shiftKey ? -1 : 1
          selectTab((tab + direction + reviewIndex + 1) % (reviewIndex + 1))
          return
        }
      }

      const digit = Number(event.key)
      const maxDigit = Math.min(totalOptions, MAX_DIGIT_SHORTCUT)
      if (!Number.isNaN(digit) && digit >= 1 && digit <= maxDigit) {
        event.preventDefault()
        setSelected(digit - 1)
        selectOption(digit - 1)
        return
      }

      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault()
        if (totalOptions === 0) return
        setSelected((current) => (current - 1 + totalOptions) % totalOptions)
      } else if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault()
        if (totalOptions === 0) return
        setSelected((current) => (current + 1) % totalOptions)
      } else if (event.key === "Enter") {
        event.preventDefault()
        if (isMulti && totalOptions === 0) {
          if (hasReviewStep) selectTab(Math.min(tab + 1, reviewIndex))
          else submit()
          return
        }
        selectOption(selected)
      }
    }

    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  })

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="region"
      aria-label={language.t("chat.questionDock.responseRequired")}
      className="overflow-hidden rounded-2xl border border-border-base bg-surface-base shadow-md outline-none"
    >
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        {isReview ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={language.t("chat.questionDock.backToQuestions")}
              onClick={() => selectTab(Math.max(0, reviewIndex - 1))}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base"
            >
              <ArrowLeftIcon className="size-4" />
            </button>
            <p className="min-w-0 flex-1 text-sm font-medium leading-tight text-text-strong">
              {language.t("chat.questionDock.reviewAnswers")}
            </p>
            <button
              type="button"
              aria-label={language.t("chat.questionDock.dismiss")}
              title={language.t("chat.questionDock.dismissTitle")}
              onClick={reject}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden
                className="stroke-current"
              >
                <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {question && questionCacheKey && isQuestionMarkdownBlock(question.question) ? (
                <QuestionMarkdown
                  text={question.question}
                  cacheKey={`${questionCacheKey}:prompt`}
                  variant="compact"
                  className="font-medium leading-tight text-text-strong [&_p]:leading-tight"
                />
              ) : question && questionCacheKey ? (
                <p className="text-sm font-medium leading-tight text-text-strong">
                  <QuestionInlineMarkdown
                    text={question.question}
                    cacheKey={`${questionCacheKey}:prompt`}
                    className="align-middle"
                    wrapContent
                  />
                </p>
              ) : null}
            </div>
            <div className="flex h-7 shrink-0 items-center gap-0.5">
              {hasReviewStep ? (
                <>
                  <button
                    type="button"
                    aria-label={language.t("chat.questionDock.previousQuestion")}
                    disabled={!canGoPrevious}
                    onClick={() => selectTab(Math.max(0, tab - 1))}
                    className="flex size-7 items-center justify-center rounded-md text-text-weak transition-colors enabled:hover:bg-surface-base-hover enabled:hover:text-text-base disabled:opacity-35"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <span className="select-none px-0.5 text-xs leading-none tabular-nums text-text-weak">
                    {language.t("chat.questionDock.progress", {
                      current: tab + 1,
                      total: questions.length,
                    })}
                  </span>
                  <button
                    type="button"
                    aria-label={language.t("chat.questionDock.nextQuestion")}
                    disabled={!canGoNext}
                    onClick={() => selectTab(Math.min(reviewIndex, tab + 1))}
                    className="flex size-7 items-center justify-center rounded-md text-text-weak transition-colors enabled:hover:bg-surface-base-hover enabled:hover:text-text-base disabled:opacity-35"
                  >
                    <ChevronRightIcon className="size-4" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                aria-label={language.t("chat.questionDock.dismiss")}
                title={language.t("chat.questionDock.dismissTitle")}
                onClick={reject}
                className="flex size-7 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden
                  className="stroke-current"
                >
                  <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {!isReview && isMulti ? (
          <p className="-mt-1 text-xs text-text-weaker">
            {language.t("chat.questionDock.selectAll")}
          </p>
        ) : null}

        {isReview ? (
          <div className="flex flex-col gap-1.5">
            {questions.map((reviewQuestion, index) => {
              const values = answers[index] ?? []
              return (
                <button
                  key={`${requestID}-${reviewQuestion.header}`}
                  type="button"
                  onClick={() => selectTab(index)}
                  className="-mx-2 flex w-full items-baseline gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-base-hover"
                >
                  <span className="shrink-0 text-xs text-text-weaker">{reviewQuestion.header}</span>
                  {values.length > 0 ? (
                    values.some(isQuestionMarkdownBlock) ? (
                      <div className="min-w-0 flex-1 text-sm text-text-base">
                        {values.map((value) => (
                          <QuestionMarkdown
                            key={`${requestID}:${reviewQuestion.header}:${value}`}
                            text={value}
                            cacheKey={`${requestID}:${reviewQuestion.header}:${value}`}
                            variant="compact"
                          />
                        ))}
                      </div>
                    ) : (
                      <QuestionInlineMarkdown
                        text={values.join(" · ")}
                        cacheKey={`${requestID}:${reviewQuestion.header}:answers`}
                        className="min-w-0 text-sm text-text-base"
                      />
                    )
                  ) : (
                    <span className="text-sm text-icon-critical-base">
                      {language.t("chat.questionDock.notAnswered")}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : question ? (
          <TooltipProvider delayDuration={300}>
            <div className="flex flex-col gap-0.5">
              {options.map((option, index) => {
                const picked = answers[tab]?.includes(option.label) ?? false
                const active = selected === index
                const optionCacheKey = `${questionCacheKey}:option:${index}`
                const hasBlockContent =
                  isQuestionMarkdownBlock(option.label) ||
                  (option.description ? isQuestionMarkdownBlock(option.description) : false)
                const row = (
                  <button
                    type="button"
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => selectOption(index)}
                    className={cn(
                      "group -mx-2 flex w-full items-center gap-2.5 rounded-full px-2 py-1.5 text-left transition-colors active:scale-[0.995]",
                      active || picked ? "bg-surface-base-hover" : "hover:bg-surface-base-hover/70",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                        active || picked
                          ? "bg-surface-interactive-base text-text-on-interactive-base"
                          : "bg-surface-raised-base text-text-weaker",
                      )}
                    >
                      {isMulti && picked ? "✓" : index + 1}
                    </span>
                    {hasBlockContent ? (
                      <div className="min-w-0 flex-1 text-left">
                        <QuestionMarkdown
                          text={option.label}
                          cacheKey={`${optionCacheKey}:label`}
                          variant="compact"
                          className="font-medium text-text-base"
                        />
                        {option.description ? (
                          <QuestionMarkdown
                            text={option.description}
                            cacheKey={`${optionCacheKey}:description`}
                            variant="compact"
                            className="text-text-weaker"
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">
                        <QuestionInlineMarkdown
                          text={option.label}
                          cacheKey={`${optionCacheKey}:label`}
                          className="text-sm font-medium text-text-base"
                        />
                        {option.description ? (
                          <span className="ml-1.5 text-sm text-text-weaker">
                            <QuestionInlineMarkdown
                              text={option.description}
                              cacheKey={`${optionCacheKey}:description`}
                              className="align-middle"
                              wrapContent
                            />
                          </span>
                        ) : null}
                      </span>
                    )}
                    {!isMulti ? (
                      <span className="shrink-0 text-text-weaker opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    ) : null}
                  </button>
                )

                return option.description ? (
                  <Tooltip key={option.label}>
                    <TooltipTrigger asChild>{row}</TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={6}
                      className="max-w-xs text-left leading-snug"
                    >
                      {option.description}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div key={option.label}>{row}</div>
                )
              })}

              <div className="-mx-2 flex items-center gap-2 px-2 py-1.5">
                {hasCustom ? (
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-0.5 transition-colors",
                      selected === options.length || editing
                        ? "bg-surface-base-hover"
                        : "hover:bg-surface-base-hover/70",
                    )}
                    onMouseEnter={() => setSelected(options.length)}
                    onClick={() => {
                      if (!editing) {
                        setEditing(true)
                        setSelected(options.length)
                      }
                    }}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-raised-base text-xs text-text-weaker">
                      ✎
                    </span>
                    {editing ? (
                      <input
                        ref={inputRef}
                        autoFocus
                        defaultValue={customText[tab] ?? ""}
                        placeholder=""
                        aria-label={language.t("chat.questionDock.typeOwnAnswer")}
                        className="min-w-0 flex-1 bg-transparent text-sm leading-6 text-text-base outline-none"
                        onClick={(event) => event.stopPropagation()}
                        onBlur={(event) => {
                          commitCustomAnswer({
                            value: event.currentTarget.value,
                            advance: false,
                          })
                        }}
                      />
                    ) : (
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm leading-6",
                          customText[tab] ? "text-text-base" : "text-text-weaker",
                        )}
                      >
                        {customText[tab] || language.t("chat.questionDock.typeOwnAnswer")}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="min-w-0 flex-1" />
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={reject}
                  className="shrink-0 text-text-weak"
                >
                  {language.t("chat.questionDock.skip")}
                </Button>
              </div>
            </div>
          </TooltipProvider>
        ) : null}

        {isReview || isMulti ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <PendingLine count={props.pendingCount ?? 0} />
            <div className="ml-auto flex items-center gap-2">
              {isReview ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={reject}
                  className="text-text-weak"
                >
                  {language.t("chat.questionDock.skip")}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={responding}
                onClick={() => {
                  if (isReview || !hasReviewStep) {
                    submit()
                    return
                  }
                  selectTab(Math.min(tab + 1, reviewIndex))
                }}
                className="bg-surface-interactive-base text-text-on-interactive-base"
              >
                {isReview || !hasReviewStep
                  ? responding
                    ? language.t("chat.questionDock.submitting")
                    : language.t("chat.questionDock.submit")
                  : language.t("chat.questionDock.continue")}
              </Button>
            </div>
          </div>
        ) : (props.pendingCount ?? 0) > 0 ? (
          <div className="pt-1">
            <PendingLine count={props.pendingCount ?? 0} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
