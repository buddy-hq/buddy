import { Fragment, useState } from "react"
import { Badge, BookOpenIcon, MessagesSquareIcon, SquarePenIcon, Switch, cn } from "@buddy/ui"
import {
  SIDEBAR_GROUP_PADDING_X_PX,
  SIDEBAR_ROW_LEADING_GAP_PX,
  SIDEBAR_ROW_LEADING_SLOT_PX,
  SIDEBAR_ROW_PADDING_LEFT_PX,
} from "@/components/layout/chat-left-sidebar/row-geometry"
import {
  ThreadStatusIndicator,
  threadStatusLabel,
  type ThreadStatus,
} from "@/components/layout/chat-left-sidebar/thread-helpers"

// ---------------------------------------------------------------------------
// This easel documents the change that shipped. The "Proposed" pane renders the
// real ThreadStatusIndicator and the real row-geometry constants, so it cannot
// drift from the components it is arguing for. The "Current" pane is a frozen
// copy of the old markup, kept only for the before/after.
// ---------------------------------------------------------------------------

const SIDEBAR_WIDTH_PX = 244
const STATUS_DOT_SIZE_PX = 6

/** Scroll container: `px-1.5` on chat-left-sidebar.tsx */
const SCROLL_PADDING_X_PX = 6

// --- Old geometry, as it was before this pass -------------------------------
const OLD_PINNED_ROW_PADDING_PX = 8
const OLD_PINNED_STATUS_OFFSET_PX = 2
const OLD_THREAD_ROW_PADDING_PX = 26
const OLD_THREAD_STATUS_OFFSET_PX = 6
const OLD_NEW_CHAT_PADDING_PX = 8
const OLD_HEADER_PADDING_PX = 6
const OLD_HEADER_BUTTON_PADDING_PX = 4
const LEADING_ICON_SIZE_PX = 14
const LEADING_GAP_PX = 8

const OLD_PINNED_TEXT_X = SCROLL_PADDING_X_PX + OLD_PINNED_ROW_PADDING_PX
const OLD_PINNED_DOT_X = SCROLL_PADDING_X_PX + OLD_PINNED_STATUS_OFFSET_PX
const OLD_THREAD_TEXT_X =
  SCROLL_PADDING_X_PX + SIDEBAR_GROUP_PADDING_X_PX + OLD_THREAD_ROW_PADDING_PX
const OLD_THREAD_DOT_X =
  SCROLL_PADDING_X_PX + SIDEBAR_GROUP_PADDING_X_PX + OLD_THREAD_STATUS_OFFSET_PX
const OLD_NEW_CHAT_TEXT_X =
  SCROLL_PADDING_X_PX + OLD_NEW_CHAT_PADDING_PX + LEADING_ICON_SIZE_PX + LEADING_GAP_PX
const OLD_HEADER_TEXT_X =
  SCROLL_PADDING_X_PX +
  OLD_HEADER_PADDING_PX +
  OLD_HEADER_BUTTON_PADDING_PX +
  LEADING_ICON_SIZE_PX +
  LEADING_GAP_PX

// --- Shipped geometry, derived from the same constants the sidebar uses ------
const NEW_LEADING_X = SCROLL_PADDING_X_PX + SIDEBAR_GROUP_PADDING_X_PX + SIDEBAR_ROW_PADDING_LEFT_PX
const NEW_TEXT_X = NEW_LEADING_X + SIDEBAR_ROW_LEADING_SLOT_PX + SIDEBAR_ROW_LEADING_GAP_PX

type MockThread = {
  id: string
  title: string
  status: ThreadStatus
  active?: boolean
}

const PINNED_THREADS: MockThread[] = [
  { id: "pin-1", title: "Buddy JSON Streaming Support", status: "unread" },
  { id: "pin-2", title: "Greeting", status: "idle" },
]

const QUICK_CHATS: MockThread[] = [
  { id: "q-1", title: "How AI Agents Work", status: "working", active: true },
  { id: "q-2", title: "Food Triangle and Ideal Diets", status: "retrying" },
  { id: "q-3", title: "Food Triangle and Ideal Ratios", status: "unread" },
  { id: "q-4", title: "Spaced repetition scheduling", status: "idle" },
  { id: "q-5", title: "Why forgetting curves flatten", status: "idle" },
]

function applyBusyStress(threads: MockThread[], stress: boolean): MockThread[] {
  if (!stress) return threads
  return threads.map((thread) => ({ ...thread, status: "working" }))
}

// ---------------------------------------------------------------------------

type RulerGuide = { x: number; label: string; tone: "text" | "leading" }

function RulerOverlay(props: { guides: RulerGuide[]; visible: boolean }) {
  if (!props.visible) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {props.guides.map((guide) => (
        <div
          key={`${guide.label}:${guide.x}`}
          className="absolute inset-y-0"
          style={{ left: `${guide.x}px` }}
        >
          <div
            className={cn(
              "h-full w-px",
              guide.tone === "text"
                ? "bg-surface-critical-strong/70"
                : "bg-surface-warning-base/70",
            )}
          />
          <span
            className={cn(
              "absolute -top-4 left-0 -translate-x-1/2 rounded px-1 text-[9px] font-medium tabular-nums",
              guide.tone === "text"
                ? "bg-surface-critical-strong/15 text-text-critical-base"
                : "bg-surface-warning-base/15 text-icon-warning-base",
            )}
          >
            {guide.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** Frozen copy of the old markup: absolute overlay, offset math, pulse + green. */
function OldThreadRow(props: { thread: MockThread; rowPaddingPx: number; statusOffsetPx: number }) {
  const busy = props.thread.status === "working" || props.thread.status === "retrying"
  const unread = props.thread.status === "unread"

  return (
    <div
      className={cn(
        "relative rounded-lg",
        props.thread.active
          ? "bg-surface-raised-strong text-text-strong"
          : "text-text-weak hover:bg-surface-raised-base-hover",
      )}
    >
      <div
        className="relative w-full py-1 pr-2.5 text-left"
        style={{ paddingLeft: `${props.rowPaddingPx}px` }}
      >
        <div
          className="absolute top-1/2 flex -translate-y-1/2 items-center justify-center"
          style={{ left: `${props.statusOffsetPx}px` }}
        >
          {busy || unread ? (
            <span
              className={cn(
                "inline-block shrink-0 rounded-full",
                busy ? "animate-pulse bg-text-interactive-base" : "bg-surface-success-base",
              )}
              style={{ width: `${STATUS_DOT_SIZE_PX}px`, height: `${STATUS_DOT_SIZE_PX}px` }}
              aria-hidden="true"
            />
          ) : null}
        </div>
        <span className="block truncate text-xs font-light">{props.thread.title}</span>
      </div>
    </div>
  )
}

/** Shipped: one leading slot, in-flow, the real indicator, nothing trailing. */
function NewThreadRow(props: { thread: MockThread }) {
  return (
    <div
      className={cn(
        "relative flex items-center rounded-lg py-1 pr-2",
        props.thread.active
          ? "bg-surface-raised-strong text-text-strong"
          : "text-text-weak hover:bg-surface-raised-base-hover",
      )}
      style={{
        paddingLeft: `${SIDEBAR_ROW_PADDING_LEFT_PX}px`,
        gap: `${SIDEBAR_ROW_LEADING_GAP_PX}px`,
      }}
    >
      <span
        className="flex shrink-0 items-center justify-center self-stretch"
        style={{ width: `${SIDEBAR_ROW_LEADING_SLOT_PX}px` }}
      >
        <ThreadStatusIndicator status={props.thread.status} />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-light">{props.thread.title}</span>
    </div>
  )
}

function SectionLabel(props: { children: string; paddingLeftPx: number }) {
  return (
    <p
      className="pt-1 pb-1 text-[13px] font-normal tracking-wide text-icon-base"
      style={{ paddingLeft: `${props.paddingLeftPx}px` }}
    >
      {props.children}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Sidebars
// ---------------------------------------------------------------------------

function OldSidebar(props: { rulers: boolean; stress: boolean }) {
  const quickChats = applyBusyStress(QUICK_CHATS, props.stress)

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border-base bg-background-base py-3"
      style={{ width: `${SIDEBAR_WIDTH_PX}px` }}
    >
      <RulerOverlay
        visible={props.rulers}
        guides={[
          { x: OLD_PINNED_DOT_X, label: `${OLD_PINNED_DOT_X}`, tone: "leading" },
          { x: OLD_PINNED_TEXT_X, label: `${OLD_PINNED_TEXT_X}`, tone: "text" },
          { x: OLD_NEW_CHAT_TEXT_X, label: `${OLD_NEW_CHAT_TEXT_X}`, tone: "text" },
          { x: OLD_THREAD_TEXT_X, label: `${OLD_THREAD_TEXT_X}`, tone: "text" },
        ]}
      />

      <div
        style={{
          paddingLeft: `${SCROLL_PADDING_X_PX}px`,
          paddingRight: `${SCROLL_PADDING_X_PX}px`,
        }}
      >
        <div
          className="mb-2 flex items-center rounded-lg py-1.5 text-sm font-light text-text-weak"
          style={{ paddingLeft: `${OLD_NEW_CHAT_PADDING_PX}px`, gap: `${LEADING_GAP_PX}px` }}
        >
          <SquarePenIcon className="size-3.5 shrink-0" strokeWidth={2} />
          <span className="truncate">New chat</span>
        </div>

        <section className="mb-2 space-y-0.5">
          <SectionLabel paddingLeftPx={OLD_PINNED_ROW_PADDING_PX}>Pinned</SectionLabel>
          <div className="flex flex-col space-y-0.5">
            {PINNED_THREADS.map((thread) => (
              <OldThreadRow
                key={thread.id}
                thread={thread}
                rowPaddingPx={OLD_PINNED_ROW_PADDING_PX}
                statusOffsetPx={OLD_PINNED_STATUS_OFFSET_PX}
              />
            ))}
          </div>
        </section>

        <SectionLabel paddingLeftPx={OLD_NEW_CHAT_PADDING_PX}>Notebooks</SectionLabel>

        <section>
          <div
            className="flex items-center rounded-lg py-1 text-sm font-light text-text-weak"
            style={{
              paddingLeft: `${OLD_HEADER_PADDING_PX + OLD_HEADER_BUTTON_PADDING_PX}px`,
              gap: `${LEADING_GAP_PX}px`,
            }}
          >
            <MessagesSquareIcon className="size-3.5 shrink-0" />
            <span className="truncate">Quick chats</span>
          </div>
          <div
            className="flex flex-col space-y-0.5"
            style={{
              paddingLeft: `${SIDEBAR_GROUP_PADDING_X_PX}px`,
              paddingRight: `${SIDEBAR_GROUP_PADDING_X_PX}px`,
            }}
          >
            {quickChats.map((thread) => (
              <OldThreadRow
                key={thread.id}
                thread={thread}
                rowPaddingPx={OLD_THREAD_ROW_PADDING_PX}
                statusOffsetPx={OLD_THREAD_STATUS_OFFSET_PX}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function NewSidebar(props: { rulers: boolean; stress: boolean }) {
  const quickChats = applyBusyStress(QUICK_CHATS, props.stress)

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border-base bg-background-base py-3"
      style={{ width: `${SIDEBAR_WIDTH_PX}px` }}
    >
      <RulerOverlay
        visible={props.rulers}
        guides={[
          { x: NEW_LEADING_X, label: `${NEW_LEADING_X}`, tone: "leading" },
          { x: NEW_TEXT_X, label: `${NEW_TEXT_X}`, tone: "text" },
        ]}
      />

      <div
        style={{
          paddingLeft: `${SCROLL_PADDING_X_PX}px`,
          paddingRight: `${SCROLL_PADDING_X_PX}px`,
        }}
      >
        <div
          style={{
            paddingLeft: `${SIDEBAR_GROUP_PADDING_X_PX}px`,
            paddingRight: `${SIDEBAR_GROUP_PADDING_X_PX}px`,
          }}
        >
          <div
            className="mb-2 flex items-center rounded-lg py-1.5 text-sm font-light text-text-weak"
            style={{
              paddingLeft: `${SIDEBAR_ROW_PADDING_LEFT_PX}px`,
              gap: `${SIDEBAR_ROW_LEADING_GAP_PX}px`,
            }}
          >
            <SquarePenIcon className="size-3.5 shrink-0" strokeWidth={2} />
            <span className="truncate">New chat</span>
          </div>

          <section className="mb-2 space-y-0.5">
            <SectionLabel paddingLeftPx={SIDEBAR_ROW_PADDING_LEFT_PX}>Pinned</SectionLabel>
            {PINNED_THREADS.map((thread) => (
              <NewThreadRow key={thread.id} thread={thread} />
            ))}
          </section>

          <SectionLabel paddingLeftPx={SIDEBAR_ROW_PADDING_LEFT_PX}>Notebooks</SectionLabel>

          <section>
            <div
              className="flex items-center rounded-lg py-1 text-sm font-light text-text-weak"
              style={{
                paddingLeft: `${SIDEBAR_ROW_PADDING_LEFT_PX}px`,
                gap: `${SIDEBAR_ROW_LEADING_GAP_PX}px`,
              }}
            >
              <MessagesSquareIcon className="size-3.5 shrink-0" />
              <span className="truncate">Quick chats</span>
            </div>
            <div className="flex flex-col space-y-0.5">
              {quickChats.map((thread) => (
                <NewThreadRow key={thread.id} thread={thread} />
              ))}
            </div>

            <div
              className="mt-1 flex items-center rounded-lg py-1 text-sm font-light text-text-weak"
              style={{
                paddingLeft: `${SIDEBAR_ROW_PADDING_LEFT_PX}px`,
                gap: `${SIDEBAR_ROW_LEADING_GAP_PX}px`,
              }}
            >
              <BookOpenIcon className="size-3.5 shrink-0" />
              <span className="truncate">Learning science</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const VOCABULARY: { status: ThreadStatus; fill: string; motion: string }[] = [
  { status: "unread", fill: "Solid · interactive", motion: "Still" },
  { status: "working", fill: "Solid · interactive", motion: "Pulsing" },
  { status: "retrying", fill: "Solid · warning", motion: "Pulsing" },
  { status: "idle", fill: "Absent", motion: "—" },
]

function VocabularyLegend() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-weaker">
        The vocabulary — one slot, one shape, two channels
      </p>
      <div className="overflow-hidden rounded-lg border border-border-weaker-base">
        <div className="grid grid-cols-[64px_120px_1fr_1fr_1.4fr] items-center gap-px bg-border-weaker-base text-[11px]">
          <div className="bg-surface-raised-base px-2 py-1.5 text-text-weaker">Dot</div>
          <div className="bg-surface-raised-base px-2 py-1.5 text-text-weaker">State</div>
          <div className="bg-surface-raised-base px-2 py-1.5 text-text-weaker">Fill</div>
          <div className="bg-surface-raised-base px-2 py-1.5 text-text-weaker">Motion</div>
          <div className="bg-surface-raised-base px-2 py-1.5 text-text-weaker">In a row</div>
          {VOCABULARY.map((entry) => (
            <Fragment key={entry.status}>
              <div className="flex h-11 items-center justify-center bg-background-base">
                <ThreadStatusIndicator status={entry.status} />
              </div>
              <div className="h-full bg-background-base px-2 py-3 text-text-base">
                {threadStatusLabel(entry.status)}
              </div>
              <div className="h-full bg-background-base px-2 py-3 text-text-weak">{entry.fill}</div>
              <div className="h-full bg-background-base px-2 py-3 text-text-weak">
                {entry.motion}
              </div>
              <div className="bg-background-base px-2 py-1.5">
                <NewThreadRow
                  thread={{ id: entry.status, title: "Buddy JSON Streaming", status: entry.status }}
                />
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function SidebarAlignmentRedesignEasel() {
  const [rulers, setRulers] = useState(true)
  const [stress, setStress] = useState(false)

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-background-base">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-weaker-base px-4 py-2">
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-medium text-text-base">Left sidebar · alignment + status</p>
          <p className="truncate text-[11px] text-text-weaker">
            Shipped · one left slot that never moves · dots only · fill + pulse carry the state
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="sidebar-rulers" className="text-xs text-text-weak">
              Rulers
            </label>
            <Switch
              id="sidebar-rulers"
              size="sm"
              checked={rulers}
              aria-label="Show alignment rulers"
              onCheckedChange={setRulers}
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="sidebar-stress" className="text-xs text-text-weak">
              All working
            </label>
            <Switch
              id="sidebar-stress"
              size="sm"
              checked={stress}
              aria-label="Set every thread to working"
              onCheckedChange={setStress}
            />
          </div>
          <Badge variant="outline">Easel</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-8 p-6">
        <div className="flex flex-wrap items-start gap-10">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text-strong">Before</p>
              <Badge variant="outline" className="text-text-critical-base">
                3 baselines
              </Badge>
            </div>
            <OldSidebar rulers={rulers} stress={stress} />
            <ul className="w-[244px] space-y-1 text-[11px] leading-relaxed text-text-weaker">
              <li>
                <span className="text-text-critical-base">{OLD_PINNED_TEXT_X}px</span> pinned title
                — dot ended at exactly {OLD_PINNED_DOT_X + STATUS_DOT_SIZE_PX}px, so the gap was{" "}
                <span className="text-text-critical-base">0</span>
              </li>
              <li>
                Same dot in a notebook row got{" "}
                <span className="text-text-critical-base">
                  {OLD_THREAD_TEXT_X - OLD_THREAD_DOT_X - STATUS_DOT_SIZE_PX}px
                </span>{" "}
                instead
              </li>
              <li>
                <span className="text-text-critical-base">{OLD_NEW_CHAT_TEXT_X}px</span> New chat ·{" "}
                <span className="text-text-critical-base">{OLD_HEADER_TEXT_X}px</span> header ·{" "}
                <span className="text-text-critical-base">{OLD_THREAD_TEXT_X}px</span> thread
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text-strong">After</p>
              <Badge variant="outline" className="text-text-success-base">
                1 baseline
              </Badge>
            </div>
            <NewSidebar rulers={rulers} stress={stress} />
            <ul className="w-[244px] space-y-1 text-[11px] leading-relaxed text-text-weaker">
              <li>
                <span className="text-icon-warning-base">{NEW_LEADING_X}px</span> leading slot —
                dot, book icon, and chat icon all share it
              </li>
              <li>
                <span className="text-text-success-base">{NEW_TEXT_X}px</span> every label, every
                row type, every section
              </li>
              <li>
                The dot never changes position or size across states, so nothing shifts as a thread
                moves through them
              </li>
              <li>Trailing edge stays empty — hover actions keep it to themselves</li>
            </ul>
          </div>
        </div>

        <VocabularyLegend />

        <div className="flex flex-col gap-2 rounded-lg border border-border-weaker-base bg-surface-raised-base/40 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-weaker">
            Worth knowing
          </p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-text-weak">
            <li>
              <span className="text-text-base">Reduced motion.</span> Pulsing is the only channel
              separating Live from Unread — both are solid interactive dots. Under{" "}
              <code className="text-text-base">prefers-reduced-motion</code> the pulse is dropped
              and the active states get a static ring instead, so they stay distinguishable.
            </li>
            <li>
              <span className="text-text-base">One slot means one winner.</span> A thread that is
              both working and unread shows working; the unread dot returns when the run finishes.
              That is a consequence of the single-slot design, not an oversight.
            </li>
            <li>
              <span className="text-text-base">Unread moved off green.</span> It now shares the
              interactive hue with Live, separated by motion — which frees the success colour
              entirely.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
