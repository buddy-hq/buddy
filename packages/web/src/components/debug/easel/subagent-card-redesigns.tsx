import { useState, type ReactNode } from "react"
import { Badge, Button, cn } from "@buddy/ui"
import { SubagentCard } from "@/components/chat/tools/render/task/subagent-card"

/*
 * The subagent card exactly as it ships today, in every state it can reach.
 * This renders the real `SubagentCard` — not a mock — so anything changed in
 * the component shows up here immediately. Baseline for redesign.
 */

const SHORT_RESULT =
  "Found 14 notes under `product/`. Three clusters: onboarding friction, pricing experiments, " +
  "and a stale roadmap fragment from March."

const LONG_RESULT = `## Vault map — product

Scanned **214 notes** across the vault and grouped them by topic.

### Clusters

1. **Onboarding friction** — 5 notes, mostly from Q1. Two are near-duplicates
   (\`onboarding-drop-off.md\` and \`onboarding-funnel-notes.md\`).
2. **Pricing experiments** — 6 notes. The most recent supersedes the other five.
3. **Roadmap** — 3 notes, one of which is a stale March fragment that contradicts
   the current roadmap on two of the four bets.

### Recommendation

Merge the roadmap fragment before mapping the rest, otherwise the topic index
will carry two conflicting versions of the same quarter.

\`\`\`ts
const clusters = groupBy(notes, (note) => note.topic)
\`\`\`

Remaining work is mechanical: tag the 14 product notes, then re-run the mapper
over \`business/\` and \`ventures/\` with the corrected glob.`

const SHORT_ERROR = "Glob `**/business/**/*.md` matched 0 files."

const LONG_ERROR = `Error: no files matched pattern
    at resolveGlob (packages/buddy/src/workspace/glob.ts:112:11)
    at mapNotes (packages/buddy/src/learning/vault-mapper.ts:64:22)
    at async Task.run (vendor/opencode/packages/opencode/src/tool/task.ts:88:5)

Pattern: **/business/**/*.md
Vault:   /Users/prashant/Notes
Hint:    the vault uses "Business Notes/" with a space and a capital B.`

const LONG_TITLE =
  "Reconcile the Obsidian vault taxonomy with the directory-scoped workspace store naming convention"

const LONG_ACTIVITY =
  "Reading packages/web/src/components/directory-chat/right-workspace-skills-drawer.tsx"

/** Mirrors FlashcardDeckTaskPreview — what flashcard-author returns. */
function FlashcardDeckChild() {
  return (
    <div className="w-full cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-surface-weak">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-strong">
            Western education · Chapter 4
          </p>
          <p className="mt-0.5 text-xs text-text-weak">24 cards · 24 due</p>
        </div>
        <div className="shrink-0 rounded bg-surface-base px-3 py-1.5 text-xs font-medium text-text-strong">
          Review
        </div>
      </div>
    </div>
  )
}

/** Mirrors QuestionSetObjectTaskPreview — what question-set-author returns. */
function QuestionSetChild() {
  return (
    <div className="w-full cursor-pointer px-3 py-2.5 text-left transition-colors hover:bg-surface-weak">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-strong">Foundations checkpoint</p>
          <p className="mt-0.5 text-xs text-text-weak">multiple-choice · 10 questions</p>
        </div>
        <div className="shrink-0 rounded bg-surface-base px-3 py-1.5 text-xs font-medium text-text-strong">
          Open
        </div>
      </div>
    </div>
  )
}

// ─── state inventory ─────────────────────────────────────────────────────────

type CardCase = {
  id: string
  label: string
  note: string
  render: (openable: boolean) => ReactNode
}

const CASES: CardCase[] = [
  {
    id: "pending",
    label: "pending",
    note: "Dispatched, child session not started. Reads `Starting specialist`. Header is never clickable in this state.",
    render: () => <SubagentCard taskTitle="Map product notes" status="pending" />,
  },
  {
    id: "running-bare",
    label: "running · no activity",
    note: "Child is up but has produced no tool activity yet. Falls back to `Working`.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Map product notes"
        status="running"
        onOpenSession={openable ? () => {} : undefined}
      />
    ),
  },
  {
    id: "running-activity",
    label: "running · activity line",
    note: "`activityLine` from the child's latest tool call. Static text — the glider carries liveness now.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Map startup business notes"
        status="running"
        activityLine="Identifying glob pattern for Business projects"
        onOpenSession={openable ? () => {} : undefined}
      />
    ),
  },
  {
    id: "running-content",
    label: "running · activityContent",
    note: "Structured file-tool activity (verb + target). Takes precedence over `activityLine`.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Map build and venture notes"
        status="running"
        activityContent={
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-weaker">
            <span>Grep</span>
            <span className="truncate font-mono text-text-weak">ventures/**/*.md</span>
          </span>
        }
        onOpenSession={openable ? () => {} : undefined}
      />
    ),
  },
  {
    id: "running-overflow",
    label: "running · overflow",
    note: "Long title and long activity line. Both truncate against the glider column.",
    render: (openable) => (
      <SubagentCard
        taskTitle={LONG_TITLE}
        status="running"
        activityLine={LONG_ACTIVITY}
        onOpenSession={openable ? () => {} : undefined}
      />
    ),
  },
  {
    id: "completed-bare",
    label: "completed · no body",
    note: "Terminal, nothing returned. Header collapses to one line, icon turns success green.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Find hidden product references"
        status="completed"
        onOpenSession={openable ? () => {} : undefined}
      />
    ),
  },
  {
    id: "completed-short",
    label: "completed · short markdown",
    note: "String child → ExpandableMarkdown. Under 300px so no expand affordance appears.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Map product notes"
        status="completed"
        onOpenSession={openable ? () => {} : undefined}
      >
        {SHORT_RESULT}
      </SubagentCard>
    ),
  },
  {
    id: "completed-long",
    label: "completed · long markdown",
    note: "Over 300px, so it clamps to 10vh with a gradient fade and a chevron to expand.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Map the whole vault by topic"
        status="completed"
        onOpenSession={openable ? () => {} : undefined}
      >
        {LONG_RESULT}
      </SubagentCard>
    ),
  },
  {
    id: "completed-deck",
    label: "completed · flashcard deck",
    note: "FlashcardAuthorTaskCard passes a deck preview as a node child — no markdown wrapper.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Write flashcards for chapter four"
        status="completed"
        onOpenSession={openable ? () => {} : undefined}
      >
        <FlashcardDeckChild />
      </SubagentCard>
    ),
  },
  {
    id: "completed-questions",
    label: "completed · question set",
    note: "QuestionSetAuthorTaskCard, same slot. Two decks/sets stack inside one card.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Build a checkpoint quiz"
        status="completed"
        onOpenSession={openable ? () => {} : undefined}
      >
        <QuestionSetChild />
      </SubagentCard>
    ),
  },
  {
    id: "completed-multi",
    label: "completed · two artifacts",
    note: "The child slot takes N previews. No separator between them today.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Write flashcards for both chapters"
        status="completed"
        onOpenSession={openable ? () => {} : undefined}
      >
        <>
          <FlashcardDeckChild />
          <QuestionSetChild />
        </>
      </SubagentCard>
    ),
  },
  {
    id: "error-short",
    label: "error · short",
    note: "ToolErrorPanel in the body: monospace, critical colour, copy button.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Map startup business notes"
        status="error"
        error={SHORT_ERROR}
        onOpenSession={openable ? () => {} : undefined}
      />
    ),
  },
  {
    id: "error-long",
    label: "error · stack trace",
    note: "Panel caps at max-h-60 and scrolls internally.",
    render: (openable) => (
      <SubagentCard
        taskTitle="Map remaining vault sections"
        status="error"
        error={LONG_ERROR}
        onOpenSession={openable ? () => {} : undefined}
      />
    ),
  },
]

const FANOUT = [
  { title: "Map product notes", activity: undefined },
  {
    title: "Map startup business notes",
    activity: "Identifying glob pattern for Business projects",
  },
  { title: "Map build and venture notes", activity: undefined },
  { title: "Map growth and go-to-market", activity: undefined },
  { title: "Find hidden product references", activity: undefined },
]

const WIDTHS = [
  { id: "narrow", label: "Narrow · 480", className: "max-w-[480px]" },
  { id: "chat", label: "Chat · 680", className: "max-w-[680px]" },
  { id: "wide", label: "Wide · 860", className: "max-w-[860px]" },
]

export function SubagentCardRedesignsEasel() {
  const [widthID, setWidthID] = useState(WIDTHS[1].id)
  const [openable, setOpenable] = useState(true)
  const [showFanout, setShowFanout] = useState(true)

  const width = WIDTHS.find((item) => item.id === widthID) ?? WIDTHS[1]

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border-weaker-base px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-strong">Subagent card · current</h2>
          <p className="text-xs text-text-weak">
            The real `SubagentCard`, every state it can reach. Baseline for redesign.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {WIDTHS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setWidthID(item.id)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  widthID === item.id
                    ? "bg-surface-interactive-weak font-medium text-text-interactive-base"
                    : "text-text-weak hover:bg-surface-base-hover hover:text-text-base",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setOpenable((value) => !value)}>
            {openable ? "Clickable" : "Not clickable"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowFanout((value) => !value)}>
            {showFanout ? "Hide fan-out" : "Show fan-out"}
          </Button>
          <Badge variant="outline">Easel</Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className={cn("flex flex-col gap-7", width.className)}>
          {showFanout ? (
            <section className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="font-mono text-xs font-semibold text-text-strong">
                  fan-out · 5 running
                </h3>
                <span className="h-px flex-1 bg-border-weaker-base" />
              </div>
              <p className="text-xs text-text-weaker">
                One parent dispatch, five child sessions, stacked in the transcript.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                {FANOUT.map((item) => (
                  <SubagentCard
                    key={item.title}
                    taskTitle={item.title}
                    status="running"
                    activityLine={item.activity}
                    onOpenSession={openable ? () => {} : undefined}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {CASES.map((item) => (
            <section key={item.id} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="font-mono text-xs font-semibold text-text-strong">{item.label}</h3>
                <span className="h-px flex-1 bg-border-weaker-base" />
              </div>
              <p className="text-xs text-text-weaker">{item.note}</p>
              <div className="pt-1">{item.render(openable)}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
