import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
  ComposerDock,
  ComposerDockFooter,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@buddy/ui"
import { language } from "@/context/language"
import type { QuestionRequest } from "@/state/chat-types"
import {
  QuestionMarkdown,
  buildQuestionMarkdownCacheKey,
  enumerateQuestionMarkdownText,
} from "@/components/chat/tools/render/question-set/question-markdown"

type QuestionDockProps = {
  request: QuestionRequest
  pendingCount?: number
  onReply: (answers: string[][]) => Promise<void>
  onReject: () => Promise<void>
}

const MAX_DIGIT = 9

// Horizontal slide + fade for tab switching (panels slide in the direction of navigation)
const TAB_SLIDE_PX = 16
const TAB_PANEL_TRANSITION = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const }

function isCustomEnabled(v: boolean | undefined) {
  return v !== false
}

function isTextEntryElement(element: Element | null) {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  )
}

type QuestionDockTabBarProps = {
  requestID: string
  questions: QuestionRequest["questions"]
  tab: number
  answers: string[][]
  onSelectTab: (index: number) => void
}

function QuestionDockTabBar({
  requestID,
  questions,
  tab,
  answers,
  onSelectTab,
}: QuestionDockTabBarProps) {
  const tabScrollRef = useRef<HTMLDivElement>(null)
  const [showLeftChevron, setShowLeftChevron] = useState(false)
  const [showRightChevron, setShowRightChevron] = useState(false)

  const updateScrollAffordance = useCallback(() => {
    const el = tabScrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setShowLeftChevron(scrollLeft > 0)
    setShowRightChevron(Math.ceil(scrollLeft + clientWidth) < scrollWidth - 1)
  }, [])

  useEffect(() => {
    const el = tabScrollRef.current
    if (!el) return

    updateScrollAffordance()
    el.addEventListener("scroll", updateScrollAffordance)
    const observer = new ResizeObserver(updateScrollAffordance)
    observer.observe(el)
    const content = el.firstElementChild
    if (content) observer.observe(content)

    return () => {
      el.removeEventListener("scroll", updateScrollAffordance)
      observer.disconnect()
    }
  }, [updateScrollAffordance, requestID, questions.length])

  useEffect(() => {
    const scrollEl = tabScrollRef.current
    if (!scrollEl) return

    const activeTrigger = scrollEl.querySelector<HTMLElement>(
      '[data-slot="tabs-trigger"][data-state="active"]',
    )
    if (!activeTrigger) return

    activeTrigger.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })

    const syncAffordance = () => updateScrollAffordance()
    scrollEl.addEventListener("scroll", syncAffordance, { once: true })
    const timeout = window.setTimeout(syncAffordance, 350)
    return () => {
      scrollEl.removeEventListener("scroll", syncAffordance)
      window.clearTimeout(timeout)
    }
  }, [tab, requestID, updateScrollAffordance])

  return (
    <Tabs
      value={String(tab)}
      onValueChange={(v: string) => onSelectTab(Number(v))}
      activationMode="manual"
      className="flex shrink-0 flex-col"
    >
      <div className="relative shrink-0">
        <div
          ref={tabScrollRef}
          className="min-w-0 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <TabsList
            variant="line"
            className="!flex !h-auto w-max min-w-full justify-start gap-1 rounded-none px-4 pt-3 pb-2"
          >
            {questions.map((q, i) => {
              const isAnswered = (answers[i]?.length ?? 0) > 0
              return (
                <TabsTrigger
                  key={`tab-${requestID}-${q.header}`}
                  value={String(i)}
                  className={cn(
                    "h-auto flex-none rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none",
                    "data-[state=active]:bg-surface-interactive-base data-[state=active]:text-text-on-interactive-base",
                    "data-[state=inactive]:hover:bg-surface-base-hover",
                    isAnswered
                      ? "data-[state=inactive]:text-text-base"
                      : "data-[state=inactive]:text-text-weak",
                  )}
                >
                  {q.header}
                </TabsTrigger>
              )
            })}
            <TabsTrigger
              value={String(questions.length)}
              className={cn(
                "h-auto flex-none rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none",
                "data-[state=active]:bg-surface-interactive-base data-[state=active]:text-text-on-interactive-base",
                "data-[state=inactive]:text-text-weak data-[state=inactive]:hover:bg-surface-base-hover",
              )}
            >
              {language.t("chat.questionDock.review")}
            </TabsTrigger>
          </TabsList>
        </div>
        {showLeftChevron ? (
          <div className="absolute inset-y-0 left-0 z-10 flex items-center bg-surface-base pr-1 pl-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 bg-surface-base"
              aria-label={language.t("chat.questionDock.scrollTabsBack", {
                defaultValue: "Scroll tabs back",
              })}
              onClick={() => {
                const el = tabScrollRef.current
                if (el) el.scrollBy({ left: -el.clientWidth, behavior: "smooth" })
              }}
            >
              <ChevronLeftIcon className="size-4 text-text-weak" />
            </Button>
            <div className="pointer-events-none absolute -right-4 inset-y-0 w-4 bg-gradient-to-r from-surface-base to-transparent" />
          </div>
        ) : null}
        {showRightChevron ? (
          <div className="absolute inset-y-0 right-0 z-10 flex items-center bg-surface-base pl-1 pr-1">
            <div className="pointer-events-none absolute -left-4 inset-y-0 w-4 bg-gradient-to-l from-surface-base to-transparent" />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 bg-surface-base"
              aria-label={language.t("chat.questionDock.scrollTabsForward", {
                defaultValue: "Scroll tabs forward",
              })}
              onClick={() => {
                const el = tabScrollRef.current
                if (el) el.scrollBy({ left: el.clientWidth, behavior: "smooth" })
              }}
            >
              <ChevronRightIcon className="size-4 text-text-weak" />
            </Button>
          </div>
        ) : null}
      </div>
    </Tabs>
  )
}

export function QuestionDock(props: QuestionDockProps) {
  const requestID = props.request.id
  const questions = props.request.questions
  const isSingle = questions.length === 1 && questions[0]?.multiple !== true
  const tabCount = isSingle ? 1 : questions.length + 1

  const [tab, setTab] = useState(0)
  const [selected, setSelected] = useState(0)
  const [answers, setAnswers] = useState<string[][]>(() => questions.map(() => []))
  const [customText, setCustomText] = useState<string[]>(() => questions.map(() => ""))
  const [editing, setEditing] = useState(false)
  const [responding, setResponding] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const questionsRef = useRef(questions)
  questionsRef.current = questions

  // Reset on new request
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
    const container = containerRef.current
    if (!container) return
    const frame = window.requestAnimationFrame(() => {
      container.focus({ preventScroll: true })
    })
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [editing, requestID])

  // Derived state
  const question = questions[tab]
  const isConfirm = !isSingle && tab === questions.length
  const options = question?.options ?? []
  const hasCustom = isCustomEnabled(question?.custom)
  const total = options.length + (hasCustom ? 1 : 0)
  const isOther = hasCustom && selected === options.length
  const isMulti = question?.multiple === true

  // --- actions ---

  function doSubmit() {
    if (responding) return
    setResponding(true)
    const result = questions.map((_, i) => answers[i] ?? [])
    void props.onReply(result).finally(() => setResponding(false))
  }

  function doReject() {
    if (responding) return
    setResponding(true)
    void props.onReject().finally(() => setResponding(false))
  }

  function doPick(answer: string, isCustom = false) {
    setAnswers((prev) => {
      const next = [...prev]
      next[tab] = [answer]
      return next
    })
    if (isCustom) {
      setCustomText((prev) => {
        const next = [...prev]
        next[tab] = answer
        return next
      })
    }
    if (isSingle) {
      setResponding(true)
      void props.onReply([[answer]]).finally(() => setResponding(false))
      return
    }
    setTab(tab + 1)
    setSelected(0)
  }

  function doToggle(answer: string) {
    setAnswers((prev) => {
      const existing = prev[tab] ?? []
      const next = [...existing]
      const idx = next.indexOf(answer)
      if (idx === -1) next.push(answer)
      else next.splice(idx, 1)
      const result = [...prev]
      result[tab] = next
      return result
    })
  }

  function doSelectAt(index: number) {
    const isCustomOption = hasCustom && index === options.length
    if (isCustomOption) {
      if (!isMulti) {
        setEditing(true)
        return
      }
      const val = customText[tab] ?? ""
      if (val && (answers[tab]?.includes(val) ?? false)) {
        doToggle(val)
        return
      }
      setEditing(true)
      return
    }
    const opt = options[index]
    if (!opt) return
    if (isMulti) {
      doToggle(opt.label)
      return
    }
    doPick(opt.label)
  }

  function doSelectTab(index: number) {
    setTab(index)
    setSelected(0)
  }

  function handleCustomSubmit() {
    const text = (textareaRef.current?.value ?? "").trim()
    const prev = customText[tab]

    if (!text) {
      if (prev) {
        setCustomText((p) => {
          const n = [...p]
          n[tab] = ""
          return n
        })
        setAnswers((p) => {
          const n = [...p]
          n[tab] = (n[tab] ?? []).filter((x) => x !== prev)
          return n
        })
      }
      setEditing(false)
      return
    }

    if (isMulti) {
      setCustomText((p) => {
        const n = [...p]
        n[tab] = text
        return n
      })
      setAnswers((p) => {
        const existing = p[tab] ?? []
        const next = [...existing]
        if (prev) {
          const idx = next.indexOf(prev)
          if (idx !== -1) next.splice(idx, 1)
        }
        if (!next.includes(text)) next.push(text)
        const result = [...p]
        result[tab] = next
        return result
      })
      setEditing(false)
      return
    }

    doPick(text, true)
    setEditing(false)
  }

  // --- keyboard handler ---
  // Re-registers every render so closures always reference current state.
  useEffect(() => {
    if (responding) return

    function handleKey(e: KeyboardEvent) {
      // Don't consume browser shortcuts
      if (e.ctrlKey || e.altKey || e.metaKey) return

      // Don't intercept keys when the user is typing in an external input
      const active = document.activeElement
      if (isTextEntryElement(active) && !containerRef.current?.contains(active)) {
        return
      }

      // Skip only when focus is inside a different dialog.
      const activeDialog = active instanceof HTMLElement ? active.closest("[role='dialog']") : null
      if (activeDialog && !containerRef.current?.contains(activeDialog)) return

      // --- editing custom text ---
      if (editing && !isConfirm) {
        if (e.key === "Escape") {
          e.preventDefault()
          setEditing(false)
          return
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleCustomSubmit()
          return
        }
        // Let textarea handle all other keys
        return
      }

      // --- tab switching (multi-question only) ---
      if (!isSingle) {
        if (e.key === "ArrowLeft" || e.key === "h") {
          e.preventDefault()
          doSelectTab((tab - 1 + tabCount) % tabCount)
          return
        }
        if (e.key === "ArrowRight" || e.key === "l") {
          e.preventDefault()
          doSelectTab((tab + 1) % tabCount)
          return
        }
        if (e.key === "Tab") {
          e.preventDefault()
          const dir = e.shiftKey ? -1 : 1
          doSelectTab((tab + dir + tabCount) % tabCount)
          return
        }
      }

      // --- confirm tab ---
      if (isConfirm) {
        if (e.key === "Enter") {
          e.preventDefault()
          doSubmit()
          return
        }
        if (e.key === "Escape") {
          e.preventDefault()
          doReject()
          return
        }
        return
      }

      // --- option navigation ---
      const digit = Number(e.key)
      const max = Math.min(total, MAX_DIGIT)

      if (!Number.isNaN(digit) && digit >= 1 && digit <= max) {
        e.preventDefault()
        setSelected(digit - 1)
        doSelectAt(digit - 1)
        return
      }

      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault()
        setSelected((s) => (s - 1 + total) % total)
        return
      }

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault()
        setSelected((s) => (s + 1) % total)
        return
      }

      if (e.key === "Enter") {
        e.preventDefault()
        doSelectAt(selected)
        return
      }

      if (e.key === "Escape") {
        e.preventDefault()
        doReject()
      }
    }

    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  })

  // --- enter label for shortcuts footer ---
  const enterLabel = isConfirm ? "submit" : isMulti ? "toggle" : isSingle ? "submit" : "confirm"

  return (
    <ComposerDock
      ref={containerRef}
      autoFocus={false}
      className={cn(
        "max-h-none rounded-lg border-border-weak-base bg-surface-base shadow-none backdrop-blur-none",
        "border-l-2 border-l-border-interactive-base",
      )}
      role="region"
      aria-label={language.t("chat.questionDock.responseRequired")}
    >
      {!isSingle ? (
        <QuestionDockTabBar
          requestID={requestID}
          questions={questions}
          tab={tab}
          answers={answers}
          onSelectTab={doSelectTab}
        />
      ) : null}

      {/* Grid-stack: all panels share the same grid cell (1/1), only the active
         one is visible. Keeps MarkdownHtmlSegment mounted so its async parse
         happens once on first render, avoiding the layout flicker that
         AnimatePresence+popLayout caused with the initially-empty markdown divs. */}
      <div className="relative grid min-h-0 overflow-hidden" style={{ gridTemplate: "1fr / 1fr" }}>
        {/* Question panels */}
        {questions.map((q, qi) => {
          const isActivePanel = !isSingle ? tab === qi : true
          const panelOptions = q.options ?? []
          const panelHasCustom = isCustomEnabled(q.custom)
          const panelIsMulti = q.multiple === true
          const panelInput = customText[qi] ?? ""
          const panelCacheKey = buildQuestionMarkdownCacheKey(
            "question-dock",
            requestID,
            qi,
            q.header,
          )
          const panelCustomPicked = panelInput
            ? (answers[qi]?.includes(panelInput) ?? false)
            : false

          return (
            <motion.div
              key={`panel-${requestID}-${q.header}`}
              animate={
                isActivePanel
                  ? { opacity: 1, x: 0 }
                  : { opacity: 0, x: qi < tab ? -TAB_SLIDE_PX : TAB_SLIDE_PX }
              }
              transition={TAB_PANEL_TRANSITION}
              className={cn(
                "min-w-0",
                isActivePanel
                  ? "relative z-10"
                  : "pointer-events-none absolute inset-0 z-0 overflow-hidden",
              )}
              style={{ gridArea: "1 / 1" }}
              role={!isSingle ? "tabpanel" : undefined}
              aria-hidden={!isActivePanel}
            >
              <div className="flex flex-col gap-3 px-4 py-3">
                <QuestionMarkdown
                  text={q.question}
                  cacheKey={`${panelCacheKey}:prompt`}
                  variant="compact"
                  className="[&_p]:text-[1rem] [&_p]:leading-relaxed [&_li]:text-[1rem]"
                />
                {panelIsMulti ? (
                  <p className="text-xs text-text-weak">
                    {language.t("chat.questionDock.selectAllSuffix")}
                  </p>
                ) : null}

                <div className="flex flex-col gap-0.5">
                  {panelOptions.map((opt, i) => {
                    const isActive = isActivePanel && i === selected
                    const isPicked = answers[qi]?.includes(opt.label) ?? false
                    return (
                      <div
                        key={`opt-${requestID}-${qi}-${opt.label}`}
                        onMouseEnter={() => setSelected(i)}
                        onClick={() => doSelectAt(i)}
                        className={cn(
                          "cursor-pointer rounded px-2 py-1",
                          isActive ? "bg-surface-base-hover" : "",
                        )}
                      >
                        <div className="flex items-baseline gap-2">
                          <span
                            className={cn(
                              "shrink-0 text-xs tabular-nums",
                              isActive ? "text-text-interactive-base" : "text-text-weaker",
                            )}
                          >
                            {i + 1}.
                          </span>
                          {panelIsMulti ? (
                            <span
                              className={cn(
                                "shrink-0 text-sm",
                                isActive
                                  ? "text-text-interactive-base"
                                  : isPicked
                                    ? "text-icon-success-base"
                                    : "text-text-base",
                              )}
                            >
                              [{isPicked ? "\u2713" : "\u00A0"}]
                            </span>
                          ) : null}
                          <div
                            className={cn(
                              "min-w-0 text-sm",
                              isActive
                                ? "text-text-interactive-base"
                                : isPicked
                                  ? "text-icon-success-base"
                                  : "text-text-base",
                            )}
                          >
                            <QuestionMarkdown
                              text={opt.label}
                              cacheKey={`${panelCacheKey}:option:${i}:label`}
                              variant="compact"
                            />
                          </div>
                          {!panelIsMulti && isPicked && (
                            <span className="text-xs text-icon-success-base">{"\u2713"}</span>
                          )}
                        </div>
                        {opt.description && (
                          <div className="pl-5 text-xs text-text-weak">
                            <QuestionMarkdown
                              text={opt.description}
                              cacheKey={`${panelCacheKey}:option:${i}:description`}
                              variant="compact"
                              className="text-xs text-text-weak"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* "Type your own answer" option */}
                  {panelHasCustom && (
                    <div
                      onMouseEnter={() => setSelected(panelOptions.length)}
                      onClick={() => doSelectAt(panelOptions.length)}
                      className={cn(
                        "cursor-pointer rounded px-2 py-1",
                        isActivePanel && isOther ? "bg-surface-base-hover" : "",
                      )}
                    >
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "shrink-0 text-xs tabular-nums",
                            isActivePanel && isOther
                              ? "text-text-interactive-base"
                              : "text-text-weaker",
                          )}
                        >
                          {panelOptions.length + 1}.
                        </span>
                        <span
                          className={cn(
                            "text-sm",
                            isActivePanel && isOther
                              ? "text-text-interactive-base"
                              : panelCustomPicked
                                ? "text-icon-success-base"
                                : "text-text-base",
                          )}
                        >
                          {panelIsMulti
                            ? `[${panelCustomPicked ? "\u2713" : "\u00A0"}] ${language.t("chat.questionDock.typeOwnAnswer")}`
                            : language.t("chat.questionDock.typeOwnAnswer")}
                        </span>
                        {!panelIsMulti && panelCustomPicked && (
                          <span className="text-xs text-icon-success-base">{"\u2713"}</span>
                        )}
                      </div>

                      {/* Inline textarea when editing */}
                      {isActivePanel && editing && (
                        <div className="pl-5 pt-1">
                          <textarea
                            ref={(el) => {
                              textareaRef.current = el
                              if (el) {
                                el.focus()
                                el.selectionStart = el.selectionEnd = el.value.length
                              }
                            }}
                            defaultValue={panelInput}
                            placeholder={language.t("chat.questionDock.customPlaceholder")}
                            rows={1}
                            className="w-full resize-none bg-transparent p-0 text-sm text-text-base placeholder:text-text-weak focus:outline-none"
                          />
                        </div>
                      )}

                      {/* Show committed custom text when not editing */}
                      {!(isActivePanel && editing) && panelInput ? (
                        <div className="pl-5 text-xs text-text-weak">
                          <QuestionMarkdown
                            text={panelInput}
                            cacheKey={`${panelCacheKey}:custom`}
                            variant="compact"
                            className="text-xs text-text-weak"
                          />
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}

        {/* Review panel (multi-question only) */}
        {!isSingle && (
          <motion.div
            animate={isConfirm ? { opacity: 1, x: 0 } : { opacity: 0, x: -TAB_SLIDE_PX }}
            transition={TAB_PANEL_TRANSITION}
            className={cn(
              "min-w-0",
              isConfirm
                ? "relative z-10"
                : "pointer-events-none absolute inset-0 z-0 overflow-hidden",
            )}
            style={{ gridArea: "1 / 1" }}
            role="tabpanel"
            aria-hidden={!isConfirm}
          >
            <div className="flex flex-col gap-2 px-4 py-3">
              <p className="text-sm font-medium text-text-base">
                {language.t("chat.questionDock.review")}
              </p>
              {questions.map((q, i) => {
                const value = answers[i] ?? []
                const answerEntries = enumerateQuestionMarkdownText(value)
                const isAnswered = value.length > 0
                const reviewCacheKey = buildQuestionMarkdownCacheKey(
                  "question-dock-review",
                  requestID,
                  i,
                  q.header,
                )
                return (
                  <div key={`review-${requestID}-${q.header}`} className="pl-1 text-sm">
                    <span className="text-text-weak">{q.header}: </span>
                    {isAnswered ? (
                      <div className="mt-0.5 flex flex-col gap-1">
                        {answerEntries.map((answerEntry) => (
                          <QuestionMarkdown
                            key={`${reviewCacheKey}:answer:${answerEntry.text}:${answerEntry.occurrence}`}
                            text={answerEntry.text}
                            cacheKey={`${reviewCacheKey}:answer:${answerEntry.text}:${answerEntry.occurrence}`}
                            variant="compact"
                            className="text-text-base"
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="text-icon-critical-base">
                        {language.t("chat.questionDock.notAnswered")}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </div>

      {/* Pending count */}
      {(props.pendingCount ?? 0) > 0 && (
        <div className="px-4 pb-2 text-xs text-text-weak">
          {language.t(
            (props.pendingCount ?? 0) === 1
              ? "chat.questionDock.pendingQuestions.one"
              : "chat.questionDock.pendingQuestions.other",
            { count: props.pendingCount ?? 0 },
          )}
        </div>
      )}

      {/* Keyboard shortcuts footer */}
      <ComposerDockFooter className="gap-3 px-4 py-2 text-xs">
        {!isSingle && (
          <span>
            <span className="text-text-base">{"\u21C6"}</span>{" "}
            <span className="text-text-weak">tab</span>
          </span>
        )}
        {!isConfirm && (
          <span>
            <span className="text-text-base">{"\u2191\u2193"}</span>{" "}
            <span className="text-text-weak">select</span>
          </span>
        )}
        <span>
          <span className="text-text-base">enter</span>{" "}
          <span className="text-text-weak">{enterLabel}</span>
        </span>
        <span>
          <span className="text-text-base">esc</span>{" "}
          <span className="text-text-weak">dismiss</span>
        </span>
        {isConfirm ? (
          <Button
            type="button"
            size="lg"
            onClick={doSubmit}
            disabled={responding}
            className={cn(
              "ml-auto bg-surface-interactive-base text-text-on-interactive-base",
              "hover:bg-surface-interactive-base/90 active:scale-[0.98]",
            )}
          >
            {responding
              ? language.t("chat.questionDock.submitting")
              : language.t("chat.questionDock.submit")}
          </Button>
        ) : null}
      </ComposerDockFooter>
    </ComposerDock>
  )
}
