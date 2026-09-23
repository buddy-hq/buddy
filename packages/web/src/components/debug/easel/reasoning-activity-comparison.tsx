import { useState } from "react"
import { Button, ChevronRightIcon, cn } from "@buddy/ui"
import { Panda } from "@/icons/app-icons"

const REASONING_TITLE = "Searching workspace for session ID"

type PreviewVersion = "current" | "proposed"

function ReasoningGlyph() {
  return <Panda className="h-3.5 w-3.5 shrink-0" aria-hidden />
}

function ChatPreview(props: {
  version: PreviewVersion
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}) {
  const current = props.version === "current"

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-weak-base bg-background-base">
      <div className="flex items-center justify-between gap-3 border-b border-border-weaker-base px-5 py-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-text-strong">
            {current ? "Before · previous" : "After · current"}
          </h3>
          <p className="text-xs text-text-weaker">
            {current ? "The title appears three times" : "Duration above, title once below"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            current
              ? "border-border-weak-base text-text-weaker"
              : "border-border-interactive-base text-text-interactive-base",
          )}
        >
          {current ? "Previous" : "Shipped"}
        </span>
      </div>

      <div className="flex min-h-72 flex-1 flex-col gap-8 px-5 py-8 sm:px-7">
        <div className="ml-auto max-w-[85%] rounded-2xl bg-surface-weak px-4 py-3 text-sm text-text-base">
          Did you actually read the session I sent you?
        </div>

        <div className="flex min-w-0 flex-col">
          <button
            type="button"
            aria-expanded={props.expanded}
            onClick={() => props.onExpandedChange(!props.expanded)}
            className="group flex w-full min-w-0 items-center gap-2 py-1.5 text-left text-xs text-text-weaker transition-colors hover:text-text-weak"
          >
            <ReasoningGlyph />
            <span className="min-w-0 flex-1 truncate">
              {current ? REASONING_TITLE : "Thought for 14s"}
            </span>
            <ChevronRightIcon
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform",
                props.expanded && "rotate-90",
              )}
              aria-hidden
            />
          </button>

          {props.expanded ? (
            <div className="mt-1 flex flex-col">
              <div className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs text-text-weaker">
                <ReasoningGlyph />
                <span className="min-w-0 flex-1 truncate">{REASONING_TITLE}</span>
                {current ? (
                  <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 rotate-90" aria-hidden />
                ) : null}
              </div>
              {current ? (
                <div className="pl-5 pt-1 pb-1 text-sm font-semibold text-text-weak">
                  {REASONING_TITLE}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <p className="max-w-[65ch] text-sm leading-relaxed text-text-base">
          I found the related file, but I couldn’t access the chat session you referenced.
        </p>
      </div>
    </section>
  )
}

export function ReasoningActivityComparisonEasel() {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-6 overflow-y-auto bg-background-base p-5 sm:p-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-text-weaker">
            Chat transcript · Issue 20
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-text-strong">
            A completed thought, shown once
          </h2>
          <p className="text-sm text-text-weak">
            The same reasoning entry supplied all three titles in the previous view. The current
            header reports elapsed thinking time and keeps the title in the expanded list.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setExpanded((value) => !value)}
          aria-pressed={expanded}
        >
          {expanded ? "Show collapsed" : "Show expanded"}
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChatPreview version="current" expanded={expanded} onExpandedChange={setExpanded} />
        <ChatPreview version="proposed" expanded={expanded} onExpandedChange={setExpanded} />
      </div>

      <p className="text-xs text-text-weaker">
        The 14s duration is illustrative. For this title-only summary, the current view has no
        second expansion because there is no additional reasoning text to reveal.
      </p>
    </div>
  )
}
