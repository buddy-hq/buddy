import { useEffect, useMemo, useRef, useState } from "react"
import { language } from "@/context/language"
import type { QuestionRequest } from "@/state/chat-types"

type QuestionDockProps = {
  request: QuestionRequest
  pendingCount?: number
  onReply: (answers: string[][]) => Promise<void>
  onReject: () => Promise<void>
}

const MAX_DIGIT = 9

function isCustomEnabled(v: boolean | undefined) {
  return v !== false
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

  // Derived state
  const question = questions[tab]
  const isConfirm = !isSingle && tab === questions.length
  const options = question?.options ?? []
  const hasCustom = isCustomEnabled(question?.custom)
  const total = options.length + (hasCustom ? 1 : 0)
  const isOther = hasCustom && selected === options.length
  const isMulti = question?.multiple === true
  const input = customText[tab] ?? ""
  const customPicked = useMemo(() => {
    if (!input) return false
    return answers[tab]?.includes(input) ?? false
  }, [answers, tab, input])
  const canSubmit = useMemo(
    () => questions.every((_, index) => (answers[index]?.length ?? 0) > 0),
    [answers, questions],
  )

  // --- actions ---

  function doSubmit() {
    if (responding || !canSubmit) return
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
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.getAttribute("contenteditable") === "true") &&
        !containerRef.current?.contains(active)
      ) {
        return
      }

      // Skip if a dialog is open
      if (document.querySelector("[role='dialog']")) return

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
    <div
      ref={containerRef}
      tabIndex={-1}
      className="flex flex-col overflow-hidden rounded-lg border border-border-base border-l-2 border-l-border-interactive-base bg-surface-raised-base focus:outline-none"
      role="region"
      aria-label={language.t("chat.questionDock.responseRequired")}
    >
      {/* Tab bar (multi-question only) */}
      {!isSingle && (
        <div className="flex gap-1 px-3 pt-2.5 pb-1">
          {questions.map((q, i) => {
            const isActive = i === tab
            const isAnswered = (answers[i]?.length ?? 0) > 0
            return (
              <button
                key={`tab-${requestID}-${q.header}`}
                type="button"
                onClick={() => doSelectTab(i)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-surface-interactive-base text-text-on-interactive-base"
                    : isAnswered
                      ? "text-text-base hover:bg-surface-raised-base-hover"
                      : "text-text-weak hover:bg-surface-raised-base-hover"
                }`}
              >
                {q.header}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => doSelectTab(questions.length)}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              isConfirm
                ? "bg-surface-interactive-base text-text-on-interactive-base"
                : "text-text-weak hover:bg-surface-raised-base-hover"
            }`}
          >
            {language.t("chat.questionDock.confirm")}
          </button>
        </div>
      )}

      {/* Question body */}
      {!isConfirm && question && (
        <div className="flex flex-col gap-2 px-3 py-2">
          <p className="text-sm text-text-base">
            {question.question}
            {isMulti ? language.t("chat.questionDock.selectAllSuffix") : ""}
          </p>

          <div className="flex flex-col">
            {options.map((opt, i) => {
              const isActive = i === selected
              const isPicked = answers[tab]?.includes(opt.label) ?? false
              return (
                <div
                  key={`opt-${requestID}-${tab}-${opt.label}`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => doSelectAt(i)}
                  className={`cursor-pointer rounded px-1 py-0.5 ${isActive ? "bg-surface-raised-base-hover" : ""}`}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={`text-xs tabular-nums ${isActive ? "text-text-interactive-base" : "text-text-weaker"}`}
                    >
                      {i + 1}.
                    </span>
                    <span
                      className={`text-sm ${
                        isActive
                          ? "text-text-interactive-base"
                          : isPicked
                            ? "text-icon-success-base"
                            : "text-text-base"
                      }`}
                    >
                      {isMulti ? `[${isPicked ? "\u2713" : "\u00A0"}] ${opt.label}` : opt.label}
                    </span>
                    {!isMulti && isPicked && (
                      <span className="text-xs text-icon-success-base">{"\u2713"}</span>
                    )}
                  </div>
                  {opt.description && (
                    <div className="pl-5 text-xs text-text-weak">{opt.description}</div>
                  )}
                </div>
              )
            })}

            {/* "Type your own answer" option */}
            {hasCustom && (
              <div
                onMouseEnter={() => setSelected(options.length)}
                onClick={() => doSelectAt(options.length)}
                className={`cursor-pointer rounded px-1 py-0.5 ${isOther ? "bg-surface-raised-base-hover" : ""}`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-xs tabular-nums ${isOther ? "text-text-interactive-base" : "text-text-weaker"}`}
                  >
                    {options.length + 1}.
                  </span>
                  <span
                    className={`text-sm ${
                      isOther
                        ? "text-text-interactive-base"
                        : customPicked
                          ? "text-icon-success-base"
                          : "text-text-base"
                    }`}
                  >
                    {isMulti
                      ? `[${customPicked ? "\u2713" : "\u00A0"}] ${language.t("chat.questionDock.typeOwnAnswer")}`
                      : language.t("chat.questionDock.typeOwnAnswer")}
                  </span>
                  {!isMulti && customPicked && (
                    <span className="text-xs text-icon-success-base">{"\u2713"}</span>
                  )}
                </div>

                {/* Inline textarea when editing */}
                {editing && (
                  <div className="pl-5 pt-1">
                    <textarea
                      ref={(el) => {
                        textareaRef.current = el
                        if (el) {
                          el.focus()
                          el.selectionStart = el.selectionEnd = el.value.length
                        }
                      }}
                      defaultValue={input}
                      placeholder={language.t("chat.questionDock.customPlaceholder")}
                      rows={1}
                      className="w-full resize-none bg-transparent p-0 text-sm text-text-base placeholder:text-text-weak focus:outline-none"
                    />
                  </div>
                )}

                {/* Show committed custom text when not editing */}
                {!editing && input && <div className="pl-5 text-xs text-text-weak">{input}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm / review tab */}
      {isConfirm && (
        <div className="flex flex-col gap-1.5 px-3 py-2">
          <p className="text-sm font-medium text-text-base">
            {language.t("chat.questionDock.review")}
          </p>
          {questions.map((q, i) => {
            const value = answers[i]?.join(", ") ?? ""
            const isAnswered = Boolean(value)
            return (
              <div key={`review-${requestID}-${q.header}`} className="pl-1 text-sm">
                <span className="text-text-weak">{q.header}: </span>
                <span className={isAnswered ? "text-text-base" : "text-icon-critical-base"}>
                  {isAnswered ? value : language.t("chat.questionDock.notAnswered")}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pending count */}
      {(props.pendingCount ?? 0) > 0 && (
        <div className="px-3 pb-1 text-xs text-text-weak">
          {language.t(
            (props.pendingCount ?? 0) === 1
              ? "chat.questionDock.pendingQuestions.one"
              : "chat.questionDock.pendingQuestions.other",
            { count: props.pendingCount ?? 0 },
          )}
        </div>
      )}

      {/* Keyboard shortcuts footer */}
      <div className="flex gap-3 border-t border-border-base px-3 py-1.5 text-xs">
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
      </div>
    </div>
  )
}
