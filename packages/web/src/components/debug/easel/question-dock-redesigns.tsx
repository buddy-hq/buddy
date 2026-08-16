import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ArrowLeftIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  cn,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@buddy/ui"

/**
 * Easel · Question Dock · Spotlight
 *
 * Single design: one question owns the surface. Skip is a first-class
 * control (maps to production onReject). Same QuestionRequest contract.
 */

// ─── Domain fixtures ───────────────────────────────────────────────────────

type MockOption = {
  label: string
  description: string
}

type MockQuestion = {
  header: string
  question: string
  options: MockOption[]
  multiple?: boolean
  custom?: boolean
}

type ScenarioId = "single" | "multi" | "multiselect" | "long" | "custom-heavy"

type Scenario = {
  id: ScenarioId
  label: string
  blurb: string
  pendingCount: number
  questions: MockQuestion[]
}

const SCENARIOS: Scenario[] = [
  {
    id: "single",
    label: "Single",
    blurb: "One single-select · auto-submit on pick",
    pendingCount: 0,
    questions: [
      {
        header: "Next step",
        question: "Which pair now gives us the factors of the quadratic $x^2 - 5x + 6$?",
        options: [
          {
            label: "2 and 3 (Recommended)",
            description: "Both multiply to 6 and sum to 5 — the classic factor pair.",
          },
          {
            label: "−2 and −3",
            description: "Same product, wrong sign for the middle term.",
          },
          {
            label: "Need whiteboard open",
            description: "Pause and sketch the roots first.",
          },
        ],
        custom: true,
      },
    ],
  },
  {
    id: "multi",
    label: "Multi-Q",
    blurb: "3 questions · review before submit",
    pendingCount: 0,
    questions: [
      {
        header: "Root A",
        question: "If $x - 2 = 0$, what is $x$?",
        options: [
          { label: "x = 2", description: "Solve by isolating x." },
          { label: "x = −2", description: "Sign flip error." },
          { label: "x = 0", description: "Doesn't satisfy the equation." },
        ],
      },
      {
        header: "Root B",
        question: "If $x - 3 = 0$, what is $x$?",
        options: [
          { label: "x = 3", description: "Correct isolation." },
          { label: "x = −3", description: "Sign flip." },
        ],
      },
      {
        header: "Expand",
        question: "What should we get if we expand $(x - 2)(x - 3)$?",
        options: [
          {
            label: "x² − 5x + 6 (Recommended)",
            description: "FOIL: first, outer+inner, last.",
          },
          { label: "x² − 6x + 5", description: "Swapped middle coefficient." },
          { label: "x² + 5x + 6", description: "Wrong sign on middle term." },
        ],
        custom: true,
      },
    ],
  },
  {
    id: "long",
    label: "Long text",
    blurb: "Wrapping prompt · truncated option blurbs · hover for full text",
    pendingCount: 0,
    questions: [
      {
        header: "Project",
        question:
          "If you had enough time, support, and resources to complete one meaningful personal project over the next year, what kind of project would you be most excited to pursue and why?",
        options: [
          {
            label: "Creative project",
            description:
              "You would spend several weeks developing an original story, visual concept, musical piece, or other expressive work where experimentation and personal style matter more than following a fixed template.",
          },
          {
            label: "Practical project",
            description:
              "You would build or organize something useful, such as an application, business process, teaching kit, or system that solves a concrete problem for yourself or others.",
          },
          {
            label: "Research project",
            description:
              "You would investigate a complex topic, compare evidence from multiple sources, and produce a clear write-up or presentation that explains what you found and why it matters.",
          },
        ],
        custom: true,
      },
      {
        header: "Timeline",
        question:
          "How aggressively would you want to schedule that project if Buddy helped you break it into weekly milestones and kept you honest about scope?",
        options: [
          {
            label: "Steady weekly cadence",
            description:
              "A sustainable pace with protected blocks each week, allowing life interruptions without abandoning the goal.",
          },
          {
            label: "Sprint then pause",
            description:
              "Intense focused bursts when energy is high, then deliberate recovery periods before the next push.",
          },
          {
            label: "Open-ended exploration",
            description:
              "No fixed end date — treat the year as a sandbox and let the shape of the work emerge as you learn.",
          },
        ],
        custom: true,
      },
      {
        header: "Support",
        question:
          "When you get stuck mid-project, what kind of help from Buddy would feel most useful without taking the work away from you?",
        options: [
          {
            label: "Unstick with questions",
            description:
              "Socratic prompts that help you name the blocker, reframe the problem, and choose the next small move yourself.",
          },
          {
            label: "Concrete examples",
            description:
              "Worked samples, outlines, or parallel cases you can adapt — scaffolding you edit rather than blank-page invention.",
          },
          {
            label: "Accountability only",
            description:
              "Check-ins and gentle pressure on the plan, but leave craft decisions entirely to you.",
          },
        ],
        custom: true,
      },
    ],
  },
  {
    id: "multiselect",
    label: "Multi-select",
    blurb: "Select all that apply + custom",
    pendingCount: 0,
    questions: [
      {
        header: "Surfaces",
        question: "Which surfaces should stay open while we work?",
        multiple: true,
        custom: true,
        options: [
          {
            label: "Whiteboard",
            description: "Sketch factor trees and sign charts.",
          },
          {
            label: "Editor",
            description: "Keep notes as we decide the method.",
          },
          {
            label: "Figure panel",
            description: "Show the parabola once we graph.",
          },
        ],
      },
    ],
  },
  {
    id: "custom-heavy",
    label: "Long + custom",
    blurb: "Long prompt · few options · custom is the real path",
    pendingCount: 2,
    questions: [
      {
        header: "Approach",
        question:
          "Given everything we have tried so far on the quadratic, which next step should we take before we commit to a factorisation method — and why?",
        options: [
          {
            label: "Sketch roots first",
            description: "Open the whiteboard and check signs before expanding.",
          },
          {
            label: "Try quadratic formula",
            description: "Skip factoring and go straight to formula.",
          },
        ],
        custom: true,
      },
      {
        header: "Confidence",
        question: "How sure are you about that choice?",
        options: [
          { label: "Very sure", description: "Ready to commit." },
          { label: "Somewhat", description: "Want a quick check first." },
          { label: "Guessing", description: "Need more scaffolding." },
        ],
        custom: false,
      },
    ],
  },
]

// ─── State ─────────────────────────────────────────────────────────────────

type DockState = {
  answers: string[][]
  customText: string[]
  tab: number
  selected: number
  editing: boolean
  responding: boolean
  submitted: boolean
  dismissed: boolean
}

function emptyState(qCount: number): DockState {
  return {
    answers: Array.from({ length: qCount }, () => []),
    customText: Array.from({ length: qCount }, () => ""),
    tab: 0,
    selected: 0,
    editing: false,
    responding: false,
    submitted: false,
    dismissed: false,
  }
}

function isCustomEnabled(v: boolean | undefined) {
  return v !== false
}

function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background-base">
      <div className="min-h-0 flex-1" aria-hidden />
      <div className="mx-auto w-full max-w-200 shrink-0 px-4 pb-4 pt-2">{children}</div>
    </div>
  )
}

function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.25rem] items-center justify-center rounded border border-border-weaker-base bg-surface-raised-base px-1 py-0.5 font-mono text-[10px] text-text-weak">
      {children}
    </kbd>
  )
}

function PendingLine({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <p className="text-[11px] text-text-weaker">
      {count === 1
        ? "Buddy has another set of questions after this."
        : `Buddy has ${count} more sets of questions after this.`}
    </p>
  )
}

function Latexish({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\$[^$]+\$)/g)
  return (
    <span className={cn("align-middle", className)}>
      {parts.map((part, i) =>
        part.startsWith("$") && part.endsWith("$") ? (
          <span
            key={i}
            className="mx-0.5 inline rounded bg-surface-raised-base px-1 font-mono text-[0.92em] leading-none text-text-base"
          >
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  )
}

// ─── Spotlight ─────────────────────────────────────────────────────────────

function SpotlightDock({
  scenario,
  state,
  setState,
}: {
  scenario: Scenario
  state: DockState
  setState: (fn: (s: DockState) => DockState) => void
}) {
  const questions = scenario.questions
  // One single-select question → pick auto-submits, no review (matches ChatGPT / production)
  const isSingleSelectAuto = questions.length === 1 && questions[0]?.multiple !== true
  // Review step only when there are multiple questions in the batch
  const hasReviewStep = questions.length > 1
  const reviewIndex = questions.length
  const isReview = hasReviewStep && state.tab === reviewIndex
  const q = isReview ? undefined : questions[state.tab]
  const options = q?.options ?? []
  const hasCustom = q ? isCustomEnabled(q.custom) : false
  const isMulti = q?.multiple === true
  // Empty answers are valid — backend accepts string[][] with empty rows
  // (production submit is only disabled while responding)

  const skip = () => setState((s) => ({ ...s, dismissed: true }))

  const pick = (label: string, isCustomAnswer = false) => {
    if (state.responding) return
    setState((s) => {
      const answers = s.answers.map((a, i) => (i === s.tab ? [label] : a))
      const customText = isCustomAnswer
        ? s.customText.map((t, i) => (i === s.tab ? label : t))
        : s.customText
      if (isSingleSelectAuto) {
        return { ...s, answers, customText, responding: true, submitted: true }
      }
      // Multi-question batch: advance; last question lands on review
      const nextTab = hasReviewStep ? Math.min(s.tab + 1, reviewIndex) : s.tab
      return {
        ...s,
        answers,
        customText,
        tab: nextTab,
        selected: 0,
        editing: false,
      }
    })
  }

  const toggle = (label: string) => {
    setState((s) => {
      const cur = s.answers[s.tab] ?? []
      const next = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]
      const answers = s.answers.map((a, i) => (i === s.tab ? next : a))
      return { ...s, answers }
    })
  }

  const submit = () => {
    // Always allowed — unanswered rows go through as []
    setState((s) => ({ ...s, responding: true, submitted: true }))
  }

  if (state.dismissed) {
    return (
      <div className="rounded-2xl border border-dashed border-border-weaker-base px-4 py-6 text-center text-sm text-text-weaker">
        Skipped · composer restored
      </div>
    )
  }

  if (state.submitted) {
    return (
      <div className="rounded-2xl border border-border-interactive-base/30 bg-surface-interactive-base/5 px-4 py-5 text-center">
        <p className="text-sm font-medium text-text-base">Answers sent</p>
        <p className="mt-1 text-xs text-text-weaker">Agent continues with your choices.</p>
      </div>
    )
  }

  // Progress is only for real questions — review title already says "Review your answers"
  const progressLabel =
    !isReview && hasReviewStep ? `${state.tab + 1} of ${questions.length}` : null
  // From review you can always go back to the last question
  const canGoPrev = hasReviewStep && state.tab > 0
  const canGoNext = hasReviewStep && state.tab < reviewIndex

  const goPrev = () => {
    if (!canGoPrev) return
    setState((s) => ({
      ...s,
      tab: Math.max(0, s.tab - 1),
      selected: 0,
      editing: false,
    }))
  }
  const goNext = () => {
    if (!canGoNext) return
    setState((s) => ({
      ...s,
      tab: Math.min(reviewIndex, s.tab + 1),
      selected: 0,
      editing: false,
    }))
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-base bg-surface-base shadow-md">
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        {/* Title row */}
        {isReview ? (
          // Review: ← title … ×  (no step chevrons — back is the left arrow)
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Back to questions"
              onClick={goPrev}
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-weak transition-colors hover:bg-surface-base-hover hover:text-text-base"
            >
              <ArrowLeftIcon className="size-4" />
            </button>
            <p className="min-w-0 flex-1 text-sm font-medium leading-tight text-text-strong">
              Review your answers
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              title="Dismiss (esc)"
              onClick={skip}
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
              {q ? (
                <p className="text-sm font-medium leading-tight text-text-strong">
                  <Latexish text={q.question} />
                </p>
              ) : null}
            </div>

            <div className="flex h-7 shrink-0 items-center gap-0.5">
              {hasReviewStep ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous question"
                    disabled={!canGoPrev}
                    onClick={goPrev}
                    className="flex size-7 items-center justify-center rounded-md text-text-weak transition-colors enabled:hover:bg-surface-base-hover enabled:hover:text-text-base disabled:opacity-35"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  {progressLabel ? (
                    <span className="select-none px-0.5 text-xs leading-none tabular-nums text-text-weak">
                      {progressLabel}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Next question"
                    disabled={!canGoNext}
                    onClick={goNext}
                    className="flex size-7 items-center justify-center rounded-md text-text-weak transition-colors enabled:hover:bg-surface-base-hover enabled:hover:text-text-base disabled:opacity-35"
                  >
                    <ChevronRightIcon className="size-4" />
                  </button>
                </>
              ) : null}
              <button
                type="button"
                aria-label="Dismiss"
                title="Dismiss (esc)"
                onClick={skip}
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
          <p className="-mt-1 text-xs text-text-weaker">Select all that apply</p>
        ) : null}

        {/* Body */}
        {isReview ? (
          <div className="flex flex-col gap-1.5">
            {questions.map((qq, i) => {
              const val = state.answers[i] ?? []
              return (
                <button
                  key={qq.header}
                  type="button"
                  onClick={() => setState((s) => ({ ...s, tab: i }))}
                  className="-mx-2 flex w-full items-baseline gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-base-hover"
                >
                  <span className="shrink-0 text-xs text-text-weaker">{qq.header}</span>
                  {val.length > 0 ? (
                    <span className="min-w-0 text-sm text-text-base">{val.join(" · ")}</span>
                  ) : (
                    <span className="text-sm text-icon-critical-base">(not answered)</span>
                  )}
                </button>
              )
            })}
          </div>
        ) : q ? (
          // Number badges share the question’s left edge (no extra option indent).
          // -mx-2 px-2 only grows the hover pill; content stays on the text column.
          <TooltipProvider delayDuration={300}>
            <div className="flex flex-col gap-0.5">
              {options.map((opt, i) => {
                const picked = state.answers[state.tab]?.includes(opt.label) ?? false
                const active = state.selected === i
                const row = (
                  <button
                    type="button"
                    onMouseEnter={() => setState((s) => ({ ...s, selected: i }))}
                    onClick={() => (isMulti ? toggle(opt.label) : pick(opt.label))}
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
                      {isMulti ? (picked ? "✓" : i + 1) : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-sm font-medium text-text-base">{opt.label}</span>
                      {opt.description ? (
                        <span className="ml-1.5 text-sm text-text-weaker">
                          <Latexish text={opt.description} />
                        </span>
                      ) : null}
                    </span>
                    {!isMulti ? (
                      <span className="shrink-0 text-text-weaker opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    ) : null}
                  </button>
                )

                if (!opt.description) {
                  return <div key={opt.label}>{row}</div>
                }

                return (
                  <Tooltip key={opt.label}>
                    <TooltipTrigger asChild>{row}</TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={6}
                      className="max-w-xs text-left leading-snug"
                    >
                      {opt.description}
                    </TooltipContent>
                  </Tooltip>
                )
              })}

              {/* Final row: custom (left) + Skip (right) — same line as ChatGPT */}
              <div className="-mx-2 flex items-center gap-2 px-2 py-1.5">
                {hasCustom ? (
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-0.5 transition-colors",
                      state.selected === options.length || state.editing
                        ? "bg-surface-base-hover"
                        : "hover:bg-surface-base-hover/70",
                    )}
                    onMouseEnter={() => setState((s) => ({ ...s, selected: options.length }))}
                    onClick={() => {
                      if (!state.editing) {
                        setState((s) => ({ ...s, editing: true, selected: options.length }))
                      }
                    }}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-raised-base text-xs text-text-weaker">
                      ✎
                    </span>
                    {state.editing ? (
                      <input
                        autoFocus
                        defaultValue={state.customText[state.tab] ?? ""}
                        placeholder=""
                        aria-label="Type your own answer"
                        className="min-w-0 flex-1 bg-transparent text-sm leading-6 text-text-base outline-none"
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                          const v = e.currentTarget.value.trim()
                          if (!v) {
                            setState((s) => ({ ...s, editing: false }))
                            return
                          }
                          if (isMulti) {
                            setState((s) => {
                              const prev = s.customText[s.tab]
                              let next = [...(s.answers[s.tab] ?? [])]
                              if (prev) next = next.filter((x) => x !== prev)
                              if (!next.includes(v)) next.push(v)
                              return {
                                ...s,
                                answers: s.answers.map((a, i) => (i === s.tab ? next : a)),
                                customText: s.customText.map((t, i) => (i === s.tab ? v : t)),
                                editing: false,
                              }
                            })
                          } else {
                            setState((s) => ({
                              ...s,
                              customText: s.customText.map((t, i) => (i === s.tab ? v : t)),
                              editing: false,
                            }))
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            const v = e.currentTarget.value.trim()
                            if (!v) {
                              setState((s) => ({ ...s, editing: false }))
                              return
                            }
                            if (isMulti) {
                              setState((s) => {
                                const prev = s.customText[s.tab]
                                let next = [...(s.answers[s.tab] ?? [])]
                                if (prev) next = next.filter((x) => x !== prev)
                                if (!next.includes(v)) next.push(v)
                                return {
                                  ...s,
                                  answers: s.answers.map((a, i) => (i === s.tab ? next : a)),
                                  customText: s.customText.map((t, i) => (i === s.tab ? v : t)),
                                  editing: false,
                                }
                              })
                            } else {
                              pick(v, true)
                            }
                          }
                          if (e.key === "Escape") {
                            e.preventDefault()
                            setState((s) => ({ ...s, editing: false }))
                          }
                        }}
                      />
                    ) : (
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm leading-6",
                          state.customText[state.tab] ? "text-text-base" : "text-text-weaker",
                        )}
                      >
                        {state.customText[state.tab] || "Type your own answer"}
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
                  onClick={(e) => {
                    e.stopPropagation()
                    skip()
                  }}
                  className="shrink-0 text-text-weak"
                >
                  Skip
                </Button>
              </div>
            </div>
          </TooltipProvider>
        ) : null}

        {/*
          Primary actions:
          · Review → Submit always enabled (empty answers OK)
          · Multi-select only-Q → Submit in place (no review step)
          · Multi-select mid multi-Q → Continue
        */}
        {isReview || isMulti ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <PendingLine count={scenario.pendingCount} />
            <div className="ml-auto flex items-center gap-2">
              {isReview ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={skip}
                  className="text-text-weak"
                >
                  Skip
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={state.responding}
                onClick={() => {
                  if (isReview) {
                    submit()
                    return
                  }
                  // Single multi-select question: submit here, no review
                  if (!hasReviewStep) {
                    submit()
                    return
                  }
                  // Multi-Q: advance toward / into review
                  setState((s) => ({
                    ...s,
                    tab: Math.min(s.tab + 1, reviewIndex),
                    selected: 0,
                    editing: false,
                  }))
                }}
                className="bg-surface-interactive-base text-text-on-interactive-base"
              >
                {isReview || !hasReviewStep
                  ? state.responding
                    ? "Submitting…"
                    : "Submit"
                  : "Continue"}
              </Button>
            </div>
          </div>
        ) : scenario.pendingCount > 0 ? (
          <div className="pt-1">
            <PendingLine count={scenario.pendingCount} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Shell ─────────────────────────────────────────────────────────────────

export function QuestionDockRedesignsEasel() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("long")
  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!,
    [scenarioId],
  )

  const [state, setStateRaw] = useState<DockState>(() => emptyState(scenario.questions.length))

  useEffect(() => {
    setStateRaw(emptyState(scenario.questions.length))
  }, [scenario.id, scenario.questions.length])

  const setState = useCallback((fn: (s: DockState) => DockState) => {
    setStateRaw(fn)
  }, [])

  const reset = () => setStateRaw(emptyState(scenario.questions.length))

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-weaker-base px-3 py-1.5">
        <span className="text-xs font-medium text-text-base">Spotlight</span>
        <div className="h-3.5 w-px bg-border-weaker-base" />
        <ToggleGroup
          type="single"
          value={scenarioId}
          onValueChange={(v) => {
            if (v) {
              // SAFETY: This select only emits identifiers from the configured scenario list.
              setScenarioId(v as ScenarioId)
            }
          }}
          variant="outline"
          size="sm"
        >
          {SCENARIOS.map((s) => (
            <ToggleGroupItem key={s.id} value={s.id} className="text-xs">
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="hidden min-w-0 truncate text-[11px] text-text-weaker sm:inline">
          {scenario.blurb}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={reset}
          className="ml-auto h-7 text-xs"
        >
          Reset
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <Stage>
          <SpotlightDock scenario={scenario} state={state} setState={setState} />
        </Stage>
      </div>
    </div>
  )
}
