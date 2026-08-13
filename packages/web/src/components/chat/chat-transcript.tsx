import {
  defaultRangeExtractor,
  elementScroll,
  measureElement as measureVirtualElement,
  useVirtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual"
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { TooltipProvider, cn } from "@buddy/ui"
import type {
  ToolCollectionToken,
  ToolLayoutRole,
  ToolRendererToken,
} from "@buddy/opencode-adapter/tool-presentation"
import { useShallow } from "zustand/react/shallow"

import "@/components/chat/tools/text-shimmer.css"
import { language } from "@/context/language"
import { useChatStore } from "@/state/chat-store"
import { useChatSettings } from "@/state/chat-settings"
import { IDLE_SESSION_STATUS, isSessionWorking } from "@/state/session-status"
import {
  loadOlderTranscriptMessages,
  useTranscriptMessage,
  useTranscriptMessages,
  useTranscriptPart,
  useTranscriptParts,
  useTranscriptSessionMessages,
  useTranscriptSessionMeta,
} from "@/state/transcript-repository"
import type { MessagePart, ProviderInfo, SessionStatusInfo } from "@/state/chat-types"
import {
  getTranscriptPerformanceProbe,
  recordTranscriptPerfEvent,
} from "@/lib/directory-chat/transcript-performance-probe"
import type { TranscriptScrollWriteReason } from "@/lib/directory-chat/transcript-performance-probe"
import {
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_SESSION_CACHE_LIMIT,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"
import { ChatScrollProvider } from "./chat-scroll-context"
import { InlineAssetLifecycleProvider, type InlineAssetSize } from "./inline-asset-boundary"
import {
  pendingEndOfTurnTailKey,
  latestLiveTimelineRowIndex,
  projectTimelineRows,
  reuseTimelineRows,
  withRevealedEndOfTurnTail,
  type TimelineAssistantItem,
  type TimelineRow,
} from "./chat-timeline-rows"
import { chatTranscriptEqual } from "./utils/message-utils"
import { isHiddenFromUserMessage } from "./utils/message-visibility"
import { isChatReasoningPart, isChatTextPart } from "./utils/part-guards"
import { useAssistantMeta } from "./hooks/use-assistant-meta"
import { useDelayedFlag } from "./hooks/use-delayed-flag"
import { UserSection } from "./sections/user-section"
import {
  ActivityRow,
  END_OF_TURN_DEAD_ZONE_MS,
  type ActivityRowExpansionState,
} from "./tools/activity-row"
import { ACTIVITY_THINKING_LABEL, activityWorkingLabel } from "./tools/activity-row/entries"
import {
  collapsedActivityRowHeightPx,
  proseRowHeightPx,
  transcriptGapClass,
} from "./transcript-layout"
import { parseToolState } from "./tools/parse-tool-state"
import { parseToolPresentation } from "./tools/parse-tool-presentation"
import { GroupedIngestFullTextToolCard } from "./tools/render/ingest-full-text"
import { GroupedBenchPresentToolCard } from "./tools/render/bench-present"
import { OBJECT_ROW_HEIGHT_PX, OBJECT_VARIANT_MD } from "@/components/objects/types"
import { parseRenderFigureOutput, GroupedFigureToolCard } from "./tools/render/render-figure"
import { GroupedImagegenToolCard } from "./tools/render/present-media"
import {
  parseRenderMermaidSources,
  GroupedMermaidToolCard,
} from "@/components/media/renderers/mermaid"
import { ToolExpansionStateProvider } from "./tools/basic-tool"
import { rendererDefaultOpen } from "./utils/constants"
import { AssistantPartRenderer } from "./parts/assistant-part/assistant-part"
import { MessageDivider } from "./parts/assistant-part/message-divider"
import { AssistantTruncatedNote } from "./assistant-error-card"
import { SessionRetryNotice } from "./session-retry-notice"
import { createAnchorShiftAnimator, resolveAnchorShiftPx } from "@/lib/surface-reveal-motion"
import {
  markActiveChatDestinationLayoutReady,
  readActiveChatTransitionID,
  registerActiveChatDestinationLayout,
} from "@/lib/active-chat-transition-state"
import type { ChatTranscriptProps } from "./types"

const HISTORY_PREPEND_TOP_THRESHOLD_PX = 160
const TIMELINE_PADDING_END_PX = 64
const TIMELINE_SCROLL_END_THRESHOLD_PX = 80
const TIMELINE_SCROLL_WRITE_EPSILON_PX = 0.5
const TIMELINE_BOTTOM_REPAIR_MIN_DISTANCE_PX = 1
const TIMELINE_RESIZE_BOTTOM_REPAIR_DELAY_MS = 120
const TIMELINE_INITIAL_LAYOUT_QUIET_MS = 120
const TIMELINE_PENDING_MARKDOWN_SELECTOR = '[data-markdown-parse-state="parsing"]'
const TIMELINE_RESIZE_STABLE_FRAMES = 30
const TIMELINE_RESIZE_MAX_FRAMES = 180
const TIMELINE_INITIAL_VIEWPORT_HEIGHT_PX = 800
const VIEWPORT_SIZE_CHANGE_PIN_MULTIPLIER = 1
const DEFERRED_TOOL_COLLAPSE_GUARD_MIN_PREVIOUS_SIZE_PX = 160
const DEFERRED_TOOL_COLLAPSE_GUARD_MAX_NEXT_SIZE_PX = 128
// Derived from the rendered bubble, not tuned. `px-4 py-3` contributes 24px of
// vertical padding, the hover action footer `mt-1 min-h-6` contributes 28px, and
// the row's own leading gap contributes 16px — 68px of chrome around a `text-sm`
// line box of 20px. A one-line user message measures 88px, which is exactly
// 68 + 20.
const USER_ROW_CHROME_ESTIMATE_PX = 68
const USER_ROW_LINE_HEIGHT_ESTIMATE_PX = 20
// The bubble is capped at `max-w-[min(82%,64ch)]`, so a line holds ~64 characters.
const USER_ROW_CHARS_PER_LINE_ESTIMATE = 64
// Each top-level attachment/chip/selection group adds a stacked row plus its
// `gap-2`. The projection counts rendered groups, not serialized message parts.
const USER_ROW_STACKED_CONTENT_ESTIMATE_PX = 44
const USER_ROW_MAX_ESTIMATE_PX = 1_600
const ASSISTANT_GROUPED_VISUAL_ROW_ESTIMATE_PX = 560
const ASSISTANT_FIGURE_ROW_ESTIMATE_PX = 392
const ASSISTANT_MEDIA_ROW_ESTIMATE_PX = 600
const ASSISTANT_HTML_WIDGET_ROW_ESTIMATE_PX = 489
const ASSISTANT_MERMAID_ROW_ESTIMATE_PX = 526
const ASSISTANT_PYTHON_TEXT_ROW_ESTIMATE_PX = 180
const ASSISTANT_PYTHON_PLOT_ROW_ESTIMATE_PX = 560
const EMPTY_PROVIDERS: ProviderInfo[] = []
const EMPTY_ACTIVITY_ROW_EXPANSION_STATE: ActivityRowExpansionState = {
  open: false,
  itemOpenByPartID: {},
}
const DEFAULT_INITIAL_SCROLL_OFFSET = () => undefined
const DEFAULT_SHOULD_ANCHOR_BOTTOM = () => true
const DEFAULT_HAS_SCROLL_GESTURE = () => false

type TimelineCacheEntry = {
  measurements: VirtualItem[]
  viewState: TimelineViewState
}

type TimelineViewState = {
  activityRowByKey: Record<string, ActivityRowExpansionState>
  toolOpenByPartID: Record<string, boolean | undefined>
}

const timelineCache = new Map<string, TimelineCacheEntry>()

function groupedCollectionEstimate(collection: ToolCollectionToken): number {
  switch (collection) {
    case "image-gallery":
    case "mermaid-gallery":
    case "figure-gallery":
      return ASSISTANT_GROUPED_VISUAL_ROW_ESTIMATE_PX
    case "full-text-collection":
      return 260
    case "bench-present-collection":
      return OBJECT_ROW_HEIGHT_PX[OBJECT_VARIANT_MD]
  }
}

function groupedCollectionContent(input: {
  collection: ToolCollectionToken
  parts: MessagePart[]
  directory: string | undefined
  canEditImages: boolean | undefined
  onOpenResource: ChatTranscriptProps["onOpenResource"]
}): ReactNode {
  switch (input.collection) {
    case "mermaid-gallery":
      return <GroupedMermaidToolCard parts={input.parts} directory={input.directory} />
    case "image-gallery":
      return (
        <GroupedImagegenToolCard
          parts={input.parts}
          directory={input.directory}
          canEditImages={input.canEditImages}
        />
      )
    case "figure-gallery":
      return <GroupedFigureToolCard parts={input.parts} directory={input.directory} />
    case "full-text-collection":
      return (
        <GroupedIngestFullTextToolCard
          parts={input.parts}
          directory={input.directory}
          onOpenResource={input.onOpenResource}
        />
      )
    case "bench-present-collection":
      return <GroupedBenchPresentToolCard parts={input.parts} directory={input.directory} />
  }
}

function timelineCacheKey(directory: string | undefined, sessionID: string | undefined) {
  return directory && sessionID ? `${directory}\u0000${sessionID}` : undefined
}

function cloneActivityRowExpansionState(
  state: ActivityRowExpansionState,
): ActivityRowExpansionState {
  return {
    open: state.open,
    itemOpenByPartID: { ...state.itemOpenByPartID },
  }
}

function cloneTimelineViewState(state: TimelineViewState | undefined): TimelineViewState {
  if (!state) {
    return { activityRowByKey: {}, toolOpenByPartID: {} }
  }
  return {
    activityRowByKey: Object.fromEntries(
      Object.entries(state.activityRowByKey).map(([rowKey, expansionState]) => [
        rowKey,
        cloneActivityRowExpansionState(expansionState),
      ]),
    ),
    toolOpenByPartID: { ...state.toolOpenByPartID },
  }
}

function assistantPartIsStreaming(part: MessagePart) {
  if (!isChatTextPart(part) && !isChatReasoningPart(part)) return true
  return typeof part.time?.end !== "number"
}

/**
 * A steered user row enters the timeline mid-stream, so its estimate is
 * corrected in the same frame as the semantic-end write that revealed it. An
 * overshoot therefore shows up as the steered message visibly jumping.
 *
 * The old estimate treated `partIDs.length` as a line count, so a two-part
 * message was estimated at two lines regardless of its text. A recorded steer
 * entered at 144px and measured 88px — a 56px jolt on the row the user was
 * looking at.
 */
export function estimateUserRowSize(row: Extract<TimelineRow, { type: "user" }>) {
  const textLines = Math.max(1, Math.ceil(row.textLength / USER_ROW_CHARS_PER_LINE_ESTIMATE))
  return Math.min(
    USER_ROW_MAX_ESTIMATE_PX,
    USER_ROW_CHROME_ESTIMATE_PX +
      textLines * USER_ROW_LINE_HEIGHT_ESTIMATE_PX +
      row.stackedContentCount * USER_ROW_STACKED_CONTENT_ESTIMATE_PX,
  )
}

export type TimelineTailSnapshot = {
  lastRowKey: string | undefined
  rowCount: number
}

/** True for an appended or same-length replacement tail, never a pure removal. */
export function isSemanticTimelineTailAddition(
  previous: TimelineTailSnapshot | undefined,
  next: TimelineTailSnapshot,
): boolean {
  if (!previous || next.lastRowKey === undefined) return false
  if (next.rowCount > previous.rowCount) return true
  return next.rowCount === previous.rowCount && next.lastRowKey !== previous.lastRowKey
}

function estimateAssistantToolRowSize(
  item: Extract<TimelineAssistantItem, { type: "part" }>,
  input: { previousLayoutRole: ToolLayoutRole | undefined; hasActionFooter: boolean },
) {
  switch (item.renderer) {
    case "figure":
      return ASSISTANT_FIGURE_ROW_ESTIMATE_PX
    case "media":
      return ASSISTANT_MEDIA_ROW_ESTIMATE_PX
    case "html-widget":
      return ASSISTANT_HTML_WIDGET_ROW_ESTIMATE_PX
    case "mermaid":
      return ASSISTANT_MERMAID_ROW_ESTIMATE_PX
    case "calculator":
      return item.imageAttachmentCount > 0
        ? ASSISTANT_PYTHON_PLOT_ROW_ESTIMATE_PX
        : ASSISTANT_PYTHON_TEXT_ROW_ESTIMATE_PX
    case "bench-present":
      return OBJECT_ROW_HEIGHT_PX[OBJECT_VARIANT_MD]
    default:
      // No renderer means a text or reasoning part: prose, not a tool card.
      return proseRowHeightPx({
        previous: input.previousLayoutRole,
        textLength: item.textLength,
        hasActionFooter: input.hasActionFooter,
      })
  }
}

function estimateRowSize(row: TimelineRow | undefined) {
  if (!row) return VIRTUAL_CHAT_TURN_ESTIMATE_PX
  switch (row.type) {
    case "turn-gap":
      return 24
    case "activity":
      // Always mounts collapsed. Having parts does not mean expanded — an
      // expanded row restored from the session cache carries its own
      // measurement, which stays authoritative.
      return collapsedActivityRowHeightPx(row.previousLayoutRole)
    case "turn-divider":
      // py-6 (24+24) + ~20px label row
      return 72
    case "retry":
    case "caveat":
      return 96
    case "user":
      return estimateUserRowSize(row)
    case "assistant":
      if (row.item.type === "grouped-parts") {
        return groupedCollectionEstimate(row.item.collection)
      }
      return estimateAssistantToolRowSize(row.item, {
        previousLayoutRole: row.previousLayoutRole,
        hasActionFooter: row.assistantActionsEnabled && row.assistantActionPartID === row.item.partID,
      })
  }
}

function scheduleConnectedMeasure<TElement extends HTMLElement>(
  element: TElement,
  measure: (element: TElement) => void,
) {
  return window.requestAnimationFrame(() => {
    if (element.isConnected) {
      measure(element)
    }
  })
}

function distanceFromVirtualEnd(root: HTMLElement, totalSize: number) {
  return Math.max(totalSize - root.clientHeight - root.scrollTop, 0)
}

/**
 * The single operation for every Buddy-owned write to the virtual end.
 *
 * The virtualizer keeps its own logical scroll offset and refreshes it only from
 * the scroll event installed by `observeElementOffset`. A native scroll event is
 * asynchronous, so between a direct `scrollTop` assignment and that event the
 * virtualizer still believes the viewport sits at the previous offset. Any row
 * measurement landing in that window computes its correction from the stale base
 * and reverses this write — the transcript's up/down flicker.
 *
 * Replaying the resulting offset as a synchronous `scroll` event closes that
 * window: the virtualizer's own listener adopts the real DOM offset and resets
 * its pending adjustments before the next measurement runs. It also covers the
 * case where the write is a browser-level no-op — a transcript shorter than its
 * viewport, where no native event ever arrives and the virtualizer would keep
 * its end sentinel and omit the first rows.
 *
 * The tradeoff is deliberate: the virtualizer notifies with `isScrolling: true`,
 * which reaches react-virtual's `flushSync` path, so this runs a synchronous
 * React render inside whatever called it. Every call site is a timer, animation
 * frame, ResizeObserver callback, or passive effect — never render — and the
 * no-op branch has always behaved this way. Recorded traces across 1,588 events
 * show the resulting writes monotonic with zero reversals and zero repairs.
 * Assigning `virtualizer.scrollOffset` directly would avoid the render, but
 * `scrollAdjustments` is private and would be left stale, double-counting the
 * next correction.
 */
export function commitTranscriptVirtualEnd(input: {
  root: HTMLElement
  virtualContent: HTMLElement | null
  totalSize: number
  reason: TranscriptScrollWriteReason
  markProgrammaticScroll?: (element: HTMLElement, top: number) => void
}) {
  const { root, virtualContent, totalSize, reason } = input
  if (virtualContent) {
    virtualContent.style.height = `${totalSize}px`
  }
  const requestedOffset = Math.max(totalSize - root.clientHeight, 0)
  const previousScrollTop = root.scrollTop
  input.markProgrammaticScroll?.(root, requestedOffset)
  root.scrollTop = requestedOffset
  const nextScrollTop = root.scrollTop
  const noOp = Math.abs(previousScrollTop - nextScrollTop) < TIMELINE_SCROLL_WRITE_EPSILON_PX
  recordTranscriptPerfEvent({
    type: "scroll-write",
    at: performance.now(),
    requestedOffset,
    previousScrollTop,
    nextScrollTop,
    noOp,
    reason,
  })
  root.dispatchEvent(new Event("scroll"))
}

/**
 * Write each mounted row's geometry to the DOM in the same synchronous turn the
 * virtualizer wrote `scrollTop`.
 *
 * `resizeItem` applies a bottom-following scroll adjustment directly to the
 * scroll element and then calls `notify(false)`, which is an ordinary React
 * re-render. The scroll write therefore lands before paint and the geometry it
 * compensates for — every wrapper's height and every following row's
 * `translateY` — lands a frame later. That single frame paints with the new
 * offset against the old positions, so everything below the row that grew is
 * drawn exactly one line too high, and the grown line is still clipped by the
 * wrapper's stale height. Frame-by-frame capture of a steered message: `-24px`
 * on a line, `-40px` on a paragraph break, one frame each, only while attached.
 *
 * react-virtual's own `directDomUpdates` does this, but it writes to the element
 * registered with `measureElement` — for the transcript that is the inner
 * measured child, not the wrapper that carries the transform. Hence our own.
 *
 * Idempotent with the React render that follows: both write the same values.
 */
export function syncVirtualRowGeometry(
  items: readonly VirtualItem[],
  wrappers: Map<string, HTMLElement>,
) {
  for (const item of items) {
    const wrapper = wrappers.get(String(item.key))
    if (!wrapper) continue
    const height = `${item.size}px`
    const transform = `translateY(${item.start}px)`
    if (wrapper.style.height !== height) {
      wrapper.style.height = height
    }
    if (wrapper.style.transform !== transform) {
      wrapper.style.transform = transform
    }
  }
}

export function isDeferredToolFallbackCollapse(input: {
  root: HTMLElement | null
  previousSize: number | undefined
  nextSize: number
}) {
  if (
    !input.root ||
    input.previousSize === undefined ||
    input.previousSize < DEFERRED_TOOL_COLLAPSE_GUARD_MIN_PREVIOUS_SIZE_PX ||
    input.nextSize > DEFERRED_TOOL_COLLAPSE_GUARD_MAX_NEXT_SIZE_PX
  ) {
    return false
  }
  return input.root.querySelector('[data-component="deferred-tool-fallback"]') !== null
}

function captureVisibleTimelineAnchor(root: HTMLElement) {
  const view = root.getBoundingClientRect()
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("[data-timeline-key]"))
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter((item) => item.rect.bottom > view.top && item.rect.top < view.bottom)
    .toSorted((left, right) => left.rect.top - right.rect.top)
  const anchor = candidates[0]
  const key = anchor?.element.dataset.timelineKey
  if (!anchor || !key) return undefined
  return {
    key,
    offset: anchor.rect.top - view.top,
  }
}

function restoreVisibleTimelineAnchor(input: {
  root: HTMLElement
  anchor: { key: string; offset: number }
  onDone: () => void
}) {
  let frame = 0
  let stable = 0
  let frameID: number | undefined
  let lastDeltaPx: number | undefined
  let finished = false

  const finish = () => {
    if (finished) return
    finished = true
    if (frameID !== undefined) {
      window.cancelAnimationFrame(frameID)
      frameID = undefined
    }
    input.root.removeEventListener("wheel", finish)
    input.root.removeEventListener("touchstart", finish)
    input.root.removeEventListener("pointerdown", finish)
    input.root.removeEventListener("keydown", finish)
    input.onDone()
  }

  const apply = () => {
    if (finished) return
    frameID = undefined
    const element = input.root.querySelector<HTMLElement>(
      `[data-timeline-key="${CSS.escape(input.anchor.key)}"]`,
    )
    const delta = element
      ? element.getBoundingClientRect().top -
        input.root.getBoundingClientRect().top -
        input.anchor.offset
      : undefined
    lastDeltaPx = delta

    if (delta !== undefined && Math.abs(delta) > 0.5) {
      input.root.scrollTop += delta
      stable = 0
    } else {
      stable += 1
    }

    frame += 1
    if (stable >= TIMELINE_RESIZE_STABLE_FRAMES || frame >= TIMELINE_RESIZE_MAX_FRAMES) {
      recordTranscriptPerfEvent({
        type: "geometry-settlement",
        at: performance.now(),
        rowKey: input.anchor.key,
        frames: frame,
        stableFrames: stable,
        lastDeltaPx,
        completed: stable >= TIMELINE_RESIZE_STABLE_FRAMES,
      })
      finish()
      return
    }
    frameID = window.requestAnimationFrame(apply)
  }

  // Geometry settlement must never compete with an explicit reading gesture. In particular, a
  // paginated prepend used to pin the compaction boundary for 30 stable frames and make wheel-up
  // input appear frozen.
  input.root.addEventListener("wheel", finish, { passive: true })
  input.root.addEventListener("touchstart", finish, { passive: true })
  input.root.addEventListener("pointerdown", finish, { passive: true })
  input.root.addEventListener("keydown", finish)
  frameID = window.requestAnimationFrame(apply)
  return finish
}

function useStableTimelineRows(rows: TimelineRow[]) {
  const previousRef = useRef<TimelineRow[] | undefined>(undefined)
  return useMemo(() => {
    const reused = reuseTimelineRows(previousRef.current, rows)
    previousRef.current = reused
    return reused
  }, [rows])
}

function useProjectedRows(input: {
  messages: ReturnType<typeof useTranscriptSessionMessages>
  revertMessageID: string | undefined
  isBusy: boolean
  sessionID: string | undefined
  directory: string | undefined
  activeSessionStatus: SessionStatusInfo
  showReasoningSummaries: boolean
}) {
  const visibleMessages = useMemo(() => {
    const filtered = input.messages.filter((message) => !isHiddenFromUserMessage(message))
    const revertMessageID = input.revertMessageID
    return revertMessageID
      ? filtered.filter((message) => message.info.id < revertMessageID)
      : filtered
  }, [input.messages, input.revertMessageID])

  const projected = useMemo(
    () =>
      projectTimelineRows({
        messages: visibleMessages,
        forkExclusiveEndMessageID: input.revertMessageID,
        isBusy: input.isBusy,
        sessionID: input.sessionID,
        directory: input.directory,
        activeSessionStatus: input.activeSessionStatus,
        showReasoningSummaries: input.showReasoningSummaries,
      }),
    [
      input.activeSessionStatus,
      input.directory,
      input.isBusy,
      input.revertMessageID,
      input.sessionID,
      input.showReasoningSummaries,
      visibleMessages,
    ],
  )

  // Hold the end-of-turn tail row out of the timeline until its pause is real.
  // A turn that ends inside the dead-zone window therefore never inserts and
  // removes that row's height, and the transcript stays put at completion.
  const pendingTailKey = pendingEndOfTurnTailKey(projected)
  const endOfTurnTailRevealed = useDelayedFlag(
    pendingTailKey !== undefined,
    END_OF_TURN_DEAD_ZONE_MS,
    pendingTailKey,
  )
  const revealed = useMemo(
    () => withRevealedEndOfTurnTail(projected, endOfTurnTailRevealed),
    [endOfTurnTailRevealed, projected],
  )

  return {
    rows: useStableTimelineRows(revealed),
    visibleMessages,
  }
}

function TimelineUserRow(props: {
  row: Extract<TimelineRow, { type: "user" }>
  providers: ProviderInfo[]
  canRevert: boolean
  animateEntrance: boolean
  onRevertMessage: ChatTranscriptProps["onRevertMessage"]
}) {
  const info = useTranscriptMessage(props.row.userMessageID)
  const parts = useTranscriptParts(props.row.partIDs)
  const userMessage = useMemo(() => (info ? { info, parts } : undefined), [info, parts])

  return (
    <article
      data-message-id={props.row.userMessageID}
      data-timeline-row="UserMessage"
      className="relative min-w-0 w-full max-w-full px-4 md:px-5"
    >
      <UserSection
        userMessage={userMessage}
        providers={props.providers}
        onRevertMessage={props.canRevert ? props.onRevertMessage : undefined}
        animateEntrance={props.animateEntrance}
      />
    </article>
  )
}

function usePreviousPart(partID: string | undefined) {
  return useTranscriptPart(partID)
}

function assistantItemPartIDs(item: TimelineAssistantItem) {
  switch (item.type) {
    case "grouped-parts":
      return item.partIDs
    case "part":
      return [item.partID]
  }
}

function useAssistantRowParts(item: TimelineAssistantItem) {
  return useTranscriptParts(assistantItemPartIDs(item))
}

function partRenderer(part: MessagePart | undefined): ToolRendererToken | undefined {
  if (part?.type !== "tool") return undefined
  const presentation = parseToolPresentation(part)
  return presentation?.archetype === "silent" ? undefined : presentation?.renderer
}

function partUsesRenderer(part: MessagePart | undefined, renderer: ToolRendererToken) {
  return partRenderer(part) === renderer
}

function partIsRenderMermaidTool(part: MessagePart | undefined) {
  return partUsesRenderer(part, "mermaid")
}

function TimelineAssistantRow(props: {
  row: Extract<TimelineRow, { type: "assistant" }>
  providers: ProviderInfo[]
  directory: string | undefined
  canEditImages: boolean | undefined
  shellToolDefaultOpen: boolean
  editToolDefaultOpen: boolean
  onOpenSession: ChatTranscriptProps["onOpenSession"]
  onOpenResource: ChatTranscriptProps["onOpenResource"]
  onForkMessage: ChatTranscriptProps["onForkMessage"]
  toolOpenByPartID: TimelineViewState["toolOpenByPartID"]
  onToolOpenChange: (partID: string, open: boolean) => void
}) {
  const parts = useAssistantRowParts(props.row.item)
  const previousPart = usePreviousPart(props.row.item.previousPartID)
  const assistantMessageInfos = useTranscriptMessages(props.row.assistantMessageIDs)
  const assistantMessages = useMemo(
    () => assistantMessageInfos.map((info) => ({ info, parts: [] })),
    [assistantMessageInfos],
  )
  const assistantMetaText = useAssistantMeta(
    assistantMessages,
    props.providers,
    props.row.turnDurationMs,
    props.row.assistantAborted,
  )

  const previousPartState = previousPart ? parseToolState(previousPart) : undefined
  const stripLeadingFigureImage =
    props.row.item.type === "part" &&
    parts[0]?.type === "text" &&
    partUsesRenderer(previousPart, "figure") &&
    previousPartState?.status === "completed" &&
    !!parseRenderFigureOutput(previousPartState)
  const stripLeadingMermaidSources =
    props.row.item.type === "part" &&
    parts[0]?.type === "text" &&
    partIsRenderMermaidTool(previousPart) &&
    previousPartState?.status === "completed"
      ? Object.values(parseRenderMermaidSources(previousPartState)).filter(
          (source): source is string => typeof source === "string" && source.trim().length > 0,
        )
      : undefined
  const itemPart = props.row.item.type === "part" ? parts[0] : undefined
  const assistantSessionID = assistantMessageInfos.find((info) => info?.sessionID)?.sessionID
  const requestFork = props.onForkMessage
  const forkExclusiveMessageID = props.row.forkExclusiveMessageID
  const rowActive = props.row.active
  const onForkMessage = useCallback(() => {
    if (!requestFork || !assistantSessionID || rowActive) return
    return requestFork({
      sessionID: assistantSessionID,
      ...(forkExclusiveMessageID ? { messageID: forkExclusiveMessageID } : {}),
    })
  }, [assistantSessionID, forkExclusiveMessageID, requestFork, rowActive])
  const availableOnForkMessage =
    requestFork && assistantSessionID && !rowActive ? onForkMessage : undefined

  return (
    <article
      data-message-id={props.row.userMessageID}
      data-timeline-row="AssistantPart"
      className="relative min-w-0 w-full max-w-full px-4 md:px-5"
    >
      <div
        className={`flow-root min-w-0 w-full max-w-full ${transcriptGapClass(
          props.row.previousLayoutRole,
          props.row.layoutRole,
        )}`}
      >
        {props.row.item.type === "grouped-parts"
          ? groupedCollectionContent({
              collection: props.row.item.collection,
              parts,
              directory: props.directory,
              canEditImages: props.canEditImages,
              onOpenResource: props.onOpenResource,
            })
          : null}

        {itemPart ? (
          itemPart.type === "tool" ? (
            <ToolExpansionStateProvider
              value={{
                open: props.toolOpenByPartID[itemPart.id],
                onOpenChange: (open) => props.onToolOpenChange(itemPart.id, open),
              }}
            >
              <AssistantPartRenderer
                part={itemPart}
                actionPartID={props.row.assistantActionPartID}
                actionsEnabled={props.row.assistantActionsEnabled}
                metaText={assistantMetaText}
                interrupted={props.row.assistantAborted}
                streaming={props.row.active && assistantPartIsStreaming(itemPart)}
                stripLeadingFigureImage={stripLeadingFigureImage}
                stripLeadingMermaidSources={stripLeadingMermaidSources}
                directory={props.directory}
                canEditImages={props.canEditImages}
                onOpenSession={props.onOpenSession}
                onOpenResource={props.onOpenResource}
                onForkMessage={availableOnForkMessage}
                defaultOpen={rendererDefaultOpen(
                  partRenderer(itemPart),
                  props.shellToolDefaultOpen,
                  props.editToolDefaultOpen,
                )}
              />
            </ToolExpansionStateProvider>
          ) : (
            <AssistantPartRenderer
              part={itemPart}
              actionPartID={props.row.assistantActionPartID}
              actionsEnabled={props.row.assistantActionsEnabled}
              metaText={assistantMetaText}
              interrupted={props.row.assistantAborted}
              streaming={props.row.active && assistantPartIsStreaming(itemPart)}
              stripLeadingFigureImage={stripLeadingFigureImage}
              stripLeadingMermaidSources={stripLeadingMermaidSources}
              directory={props.directory}
              canEditImages={props.canEditImages}
              onOpenSession={props.onOpenSession}
              onOpenResource={props.onOpenResource}
              onForkMessage={availableOnForkMessage}
            />
          )
        ) : null}
      </div>
    </article>
  )
}

function TimelineActivityRow(props: {
  row: Extract<TimelineRow, { type: "activity" }>
  providers: ProviderInfo[]
  directory: string | undefined
  animateEntrance: boolean
  onOpenSession: ChatTranscriptProps["onOpenSession"]
  expansionState: ActivityRowExpansionState | undefined
  onExpansionStateChange: (state: ActivityRowExpansionState) => void
}) {
  const parts = useTranscriptParts(props.row.partIDs)
  const assistantMessageInfos = useTranscriptMessages(props.row.assistantMessageIDs)
  const assistantMessages = useMemo(
    () => assistantMessageInfos.map((info) => ({ info, parts: [] })),
    [assistantMessageInfos],
  )
  const assistantMetaText = useAssistantMeta(
    assistantMessages,
    props.providers,
    props.row.turnDurationMs,
    props.row.assistantAborted,
  )
  const zeroEntryLabel = props.row.initial
    ? ACTIVITY_THINKING_LABEL
    : activityWorkingLabel(props.row.key)

  return (
    <article
      data-message-id={props.row.userMessageID}
      data-timeline-row="Activity"
      className={cn(
        "relative min-w-0 w-full max-w-full px-4 md:px-5",
        // The thinking placeholder is the "we got your message" signal, so it
        // must appear essentially immediately, or keyboard submits feel
        // unresponsive and a fast reply can finish before it ever shows. A tiny
        // 100ms delay lets the user block lead by a hair — short enough to still
        // read as instant (well under the 550ms that felt laggy). fill-mode-
        // backwards holds the hidden start through that 100ms so it doesn't
        // flash its final state first. It then materialises in place: a gentle
        // fade + de-blur (comes into focus) where it sits, no translate and no
        // scale. Filter/opacity only (blur is a filter, like opacity), applied
        // to this row's child, so it never perturbs the virtualiser measure.
        props.animateEntrance &&
          "animate-in fade-in blur-in-[6px] delay-100 fill-mode-backwards duration-[300ms] ease-out motion-reduce:animate-none",
      )}
    >
      <div className={`flow-root ${transcriptGapClass(props.row.previousLayoutRole, "activity")}`}>
        <ActivityRow
          parts={parts}
          seed={props.row.key}
          zeroEntryLabel={zeroEntryLabel}
          onOpenSession={props.onOpenSession}
          directory={props.directory}
          actionPartID={props.row.assistantActionPartID}
          actionsEnabled={props.row.assistantActionsEnabled}
          metaText={assistantMetaText}
          interrupted={props.row.assistantAborted}
          isBusy={props.row.active}
          isCurrent={props.row.current}
          expansionState={props.expansionState ?? EMPTY_ACTIVITY_ROW_EXPANSION_STATE}
          onExpansionStateChange={props.onExpansionStateChange}
        />
      </div>
    </article>
  )
}

function TimelineRowRenderer(props: {
  row: TimelineRow
  providers: ProviderInfo[]
  directory: string | undefined
  canEditImages: boolean | undefined
  lastUserMessageID: string | undefined
  entranceUserMessageID: string | undefined
  shellToolDefaultOpen: boolean
  editToolDefaultOpen: boolean
  onOpenSession: ChatTranscriptProps["onOpenSession"]
  onOpenResource: ChatTranscriptProps["onOpenResource"]
  onForkMessage: ChatTranscriptProps["onForkMessage"]
  onRevertMessage: ChatTranscriptProps["onRevertMessage"]
  onRetryAction: ChatTranscriptProps["onRetryAction"]
  onContinueTruncated: ChatTranscriptProps["onContinueTruncated"]
  activityRowExpansionByKey: Record<string, ActivityRowExpansionState>
  onActivityRowExpansionStateChange: (rowKey: string, state: ActivityRowExpansionState) => void
  toolOpenByPartID: TimelineViewState["toolOpenByPartID"]
  onToolOpenChange: (partID: string, open: boolean) => void
}) {
  switch (props.row.type) {
    case "turn-gap":
      return <div data-timeline-row="TurnGap" aria-hidden="true" className="h-6" />
    case "user":
      return (
        <TimelineUserRow
          row={props.row}
          providers={props.providers}
          canRevert={props.row.userMessageID === props.lastUserMessageID}
          animateEntrance={props.row.userMessageID === props.entranceUserMessageID}
          onRevertMessage={props.onRevertMessage}
        />
      )
    case "turn-divider":
      return (
        <article
          data-message-id={props.row.userMessageID}
          data-timeline-row="TurnDivider"
          className="relative min-w-0 w-full max-w-full px-4 md:px-5"
        >
          <MessageDivider
            label={
              props.row.label === "compaction" ? language.t("chat.compaction.compacted") : "Stopped"
            }
          />
        </article>
      )
    case "assistant":
      return (
        <TimelineAssistantRow
          row={props.row}
          providers={props.providers}
          directory={props.directory}
          canEditImages={props.canEditImages}
          shellToolDefaultOpen={props.shellToolDefaultOpen}
          editToolDefaultOpen={props.editToolDefaultOpen}
          onOpenSession={props.onOpenSession}
          onOpenResource={props.onOpenResource}
          onForkMessage={props.onForkMessage}
          toolOpenByPartID={props.toolOpenByPartID}
          onToolOpenChange={props.onToolOpenChange}
        />
      )
    case "activity":
      return (
        <TimelineActivityRow
          row={props.row}
          providers={props.providers}
          directory={props.directory}
          animateEntrance={props.row.userMessageID === props.entranceUserMessageID}
          onOpenSession={props.onOpenSession}
          expansionState={props.activityRowExpansionByKey[props.row.key]}
          onExpansionStateChange={(state) =>
            props.onActivityRowExpansionStateChange(props.row.key, state)
          }
        />
      )
    case "retry": {
      const retryRow = props.row
      return (
        <article
          data-message-id={retryRow.userMessageID}
          data-timeline-row="Retry"
          className="relative min-w-0 w-full max-w-full px-4 md:px-5"
        >
          <SessionRetryNotice
            model={retryRow.model}
            onAction={(action) =>
              props.onRetryAction?.({
                action,
                userMessageID: retryRow.userMessageID,
                ...(retryRow.model.action?.link ? { link: retryRow.model.action.link } : {}),
              })
            }
          />
        </article>
      )
    }
    case "caveat":
      return (
        <article
          data-message-id={props.row.userMessageID}
          data-timeline-row="Caveat"
          className="relative min-w-0 w-full max-w-full px-4 md:px-5"
        >
          <AssistantTruncatedNote
            onContinue={() =>
              props.onContinueTruncated?.({ userMessageID: props.row.userMessageID })
            }
          />
        </article>
      )
  }
}

function TimelineVirtualRow(props: {
  virtualRow: VirtualItem
  row: TimelineRow
  measureElement: (node: HTMLDivElement | null) => void
  resizeItem: (index: number, size: number) => void
  registerWrapper: (rowKey: string, node: HTMLElement | null) => void
  onInlineAssetContentReady: (rowKey: string) => void
  onInlineAssetSizeChange: (rowKey: string, size: InlineAssetSize) => void
  children: ReactNode
}) {
  const {
    children,
    measureElement,
    resizeItem,
    registerWrapper,
    onInlineAssetContentReady,
    onInlineAssetSizeChange,
    row,
    virtualRow,
  } = props
  const rowKey = row.key
  const elementRef = useRef<HTMLDivElement | null>(null)
  const bindWrapper = useCallback(
    (node: HTMLElement | null) => {
      registerWrapper(rowKey, node)
    },
    [registerWrapper, rowKey],
  )
  const contentMeasureFrameRef = useRef<number | undefined>(undefined)
  const bindElement = useCallback(
    (node: HTMLDivElement | null) => {
      elementRef.current = node
      measureElement(node)
    },
    [measureElement],
  )
  const scheduleRowMeasure = useCallback(() => {
    const element = elementRef.current
    if (!element) return
    if (contentMeasureFrameRef.current !== undefined) {
      window.cancelAnimationFrame(contentMeasureFrameRef.current)
    }
    contentMeasureFrameRef.current = scheduleConnectedMeasure(element, measureElement)
  }, [measureElement])
  const lifecycle = useMemo(
    () => ({
      onContentReady: () => {
        onInlineAssetContentReady(rowKey)
        scheduleRowMeasure()
      },
      onSizeChange: (size: InlineAssetSize) => {
        onInlineAssetSizeChange(rowKey, size)
        scheduleRowMeasure()
      },
    }),
    [onInlineAssetContentReady, onInlineAssetSizeChange, rowKey, scheduleRowMeasure],
  )

  useEffect(() => {
    recordTranscriptPerfEvent({
      type: "visible-row-mount",
      at: performance.now(),
      rowKey,
      index: virtualRow.index,
    })
    return () => {
      recordTranscriptPerfEvent({
        type: "visible-row-unmount",
        at: performance.now(),
        rowKey,
        index: virtualRow.index,
      })
    }
  }, [rowKey, virtualRow.index])

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    resizeItem(virtualRow.index, element.getBoundingClientRect().height)
  }, [resizeItem, rowKey, virtualRow.index])

  useEffect(() => {
    return () => {
      if (contentMeasureFrameRef.current !== undefined) {
        window.cancelAnimationFrame(contentMeasureFrameRef.current)
      }
    }
  }, [])

  return (
    <div
      ref={bindWrapper}
      data-timeline-key={rowKey}
      className="absolute inset-x-0 top-0 min-w-0 max-w-full"
      style={{
        height: `${virtualRow.size}px`,
        overflow: "clip",
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      <div data-index={virtualRow.index} ref={bindElement} className="flow-root">
        <InlineAssetLifecycleProvider value={lifecycle}>{children}</InlineAssetLifecycleProvider>
      </div>
    </div>
  )
}

export const ChatTranscript = memo(function ChatTranscript(props: ChatTranscriptProps) {
  const {
    canEditImages,
    directory,
    sessionID: requestedSessionID,
    onForkMessage,
    onOpenSession,
    onOpenResource,
    onRevertMessage,
    onRetryAction,
    onContinueTruncated,
    onViewportHeightChange,
    markProgrammaticScroll,
    scrollViewportRef,
    initialScrollOffset = DEFAULT_INITIAL_SCROLL_OFFSET,
    shouldAnchorBottom = DEFAULT_SHOULD_ANCHOR_BOTTOM,
    hasScrollGesture = DEFAULT_HAS_SCROLL_GESTURE,
  } = props
  const directoryState = useChatStore((state) =>
    directory ? state.directories[directory] : undefined,
  )
  const sessionID = requestedSessionID ?? directoryState?.sessionID
  const sessions = directoryState?.sessions ?? []
  const activeSession = sessionID ? sessions.find((session) => session.id === sessionID) : undefined
  const providers = directoryState?.providers ?? EMPTY_PROVIDERS
  const activeSessionStatus = sessionID
    ? (directoryState?.sessionStatusByID[sessionID] ?? IDLE_SESSION_STATUS)
    : IDLE_SESSION_STATUS
  const messages = useTranscriptSessionMessages(directory, sessionID)
  const transcriptMeta = useTranscriptSessionMeta(directory, sessionID)
  const { showReasoningSummaries, shellToolDefaultOpen, editToolDefaultOpen } = useChatSettings(
    useShallow((state) => ({
      showReasoningSummaries: state.showReasoningSummaries,
      shellToolDefaultOpen: state.shellToolDefaultOpen,
      editToolDefaultOpen: state.editToolDefaultOpen,
    })),
  )
  const isBusy = isSessionWorking({
    info: activeSession,
    status: activeSessionStatus,
    messages,
  })
  const { rows, visibleMessages } = useProjectedRows({
    messages,
    revertMessageID: activeSession?.revert?.messageID,
    isBusy,
    sessionID,
    directory,
    activeSessionStatus,
    showReasoningSummaries,
  })
  const lastUserMessage = visibleMessages.findLast((message) => message.info.role === "user")
  const lastUserMessageID = lastUserMessage?.info.id
  // A freshly sent message is added optimistically; async-loaded history is not.
  // This lets the very first send of an empty session animate (no prior tail id
  // to advance past) without also animating when an existing conversation's
  // history streams in.
  const lastUserMessageIsOptimistic =
    lastUserMessage?.parts.some((part) => part.optimistic === true) ?? false
  const cacheKey = timelineCacheKey(directory, sessionID)
  const cached = cacheKey ? timelineCache.get(cacheKey) : undefined
  const participatesInActiveChatTransition = requestedSessionID === undefined
  const [chatTransitionID] = useState(readActiveChatTransitionID)
  const initialLayoutReadyTimerRef = useRef<number | undefined>(undefined)
  const initialLayoutReadyRef = useRef(false)
  const initialLayoutRegisteredRef = useRef(false)
  const cancelInitialLayoutReady = useCallback(() => {
    if (initialLayoutReadyTimerRef.current === undefined) return
    window.clearTimeout(initialLayoutReadyTimerRef.current)
    initialLayoutReadyTimerRef.current = undefined
  }, [])
  const scheduleInitialLayoutReady = useCallback(() => {
    if (
      initialLayoutReadyRef.current ||
      !initialLayoutRegisteredRef.current ||
      transcriptMeta.loading
    ) {
      return
    }
    cancelInitialLayoutReady()
    const markReadyAfterQuietLayout = () => {
      if (scrollViewportRef?.current?.querySelector(TIMELINE_PENDING_MARKDOWN_SELECTOR)) {
        initialLayoutReadyTimerRef.current = window.setTimeout(
          markReadyAfterQuietLayout,
          TIMELINE_INITIAL_LAYOUT_QUIET_MS,
        )
        return
      }
      initialLayoutReadyTimerRef.current = undefined
      initialLayoutReadyRef.current = true
      markActiveChatDestinationLayoutReady(chatTransitionID)
    }
    initialLayoutReadyTimerRef.current = window.setTimeout(
      markReadyAfterQuietLayout,
      TIMELINE_INITIAL_LAYOUT_QUIET_MS,
    )
  }, [cancelInitialLayoutReady, chatTransitionID, scrollViewportRef, transcriptMeta.loading])

  useLayoutEffect(() => {
    if (!participatesInActiveChatTransition) return
    initialLayoutRegisteredRef.current = registerActiveChatDestinationLayout(chatTransitionID)
    if (!initialLayoutRegisteredRef.current) return
    if (!transcriptMeta.loading) {
      scheduleInitialLayoutReady()
    }
    return cancelInitialLayoutReady
  }, [
    cancelInitialLayoutReady,
    chatTransitionID,
    participatesInActiveChatTransition,
    rows.length,
    scheduleInitialLayoutReady,
    transcriptMeta.loading,
  ])

  // Entrance animation: play the user block's transform/opacity "pop" once (and
  // its mirror on the assistant's thinking placeholder), only for a genuine
  // send. The tail user-message id advances to a strictly newer id exactly when
  // the user sends — assistant replies and history prepends leave it unchanged,
  // and a revert moves it backwards. The first send of an empty session has no
  // prior tail to beat, so we fall back to the optimistic flag, which a live
  // send carries but async-loaded history does not. Never on session switch or
  // re-scroll. Message ids are time-ordered (compared with < elsewhere here).
  const entranceCacheKeyRef = useRef<string | undefined>(cacheKey)
  const previousLastUserMessageIDRef = useRef<string | undefined>(lastUserMessageID)
  const [entranceUserMessageID, setEntranceUserMessageID] = useState<string | undefined>(undefined)

  // useLayoutEffect, not useEffect: it must set the flag before the browser
  // paints the newly mounted row. With useEffect the row paints once at its
  // resting position (a flash) before the entrance class lands, then jumps to
  // the start and animates — two visible movements. Running pre-paint means the
  // very first painted frame already carries the entrance's hidden start state.
  useLayoutEffect(() => {
    const sessionChanged = entranceCacheKeyRef.current !== cacheKey
    const previous = previousLastUserMessageIDRef.current
    entranceCacheKeyRef.current = cacheKey
    previousLastUserMessageIDRef.current = lastUserMessageID
    if (sessionChanged) {
      setEntranceUserMessageID(undefined)
      return
    }
    if (lastUserMessageID === undefined) return
    const advanced = previous !== undefined && lastUserMessageID > previous
    // First send in a session we've been watching empty: no prior tail to beat,
    // but the optimistic flag confirms it's a live send rather than a history load.
    const firstSend = previous === undefined && lastUserMessageIsOptimistic
    if (advanced || firstSend) {
      setEntranceUserMessageID(lastUserMessageID)
    }
  }, [cacheKey, lastUserMessageID, lastUserMessageIsOptimistic])

  // Stop flagging the entrance after it has had time to play, so remounting the
  // row (scrolling it out of and back into the virtual window) never replays it.
  useEffect(() => {
    if (!entranceUserMessageID) return
    const timer = window.setTimeout(() => setEntranceUserMessageID(undefined), 600)
    return () => window.clearTimeout(timer)
  }, [entranceUserMessageID])
  const [restoredInitialScrollOffset] = useState(() => initialScrollOffset())
  const hasRestoredInitialScrollOffset = restoredInitialScrollOffset !== undefined
  const restoredInitialRowCountRef = useRef(rows.length)
  const rowCountChangedSinceRestoreRef = useRef(false)
  if (rows.length !== restoredInitialRowCountRef.current) {
    rowCountChangedSinceRestoreRef.current = true
  }
  const virtualContentRef = useRef<HTMLDivElement | null>(null)
  const prependAnchorRef = useRef<{ key: string; offset: number } | undefined>(undefined)
  const restoreAnchorCancelRef = useRef<(() => void) | undefined>(undefined)
  const loadingOlderRef = useRef(false)
  const resizePinnedIndexesRef = useRef<number[]>([])
  const resizePinFrameRef = useRef<number | undefined>(undefined)
  const bottomAnchorCacheKeyRef = useRef<string | undefined>(undefined)
  const bottomAnchorFrameRef = useRef<number | undefined>(undefined)
  const viewStateCacheKeyRef = useRef<string | undefined>(cacheKey)
  const viewStateRef = useRef<TimelineViewState>(cloneTimelineViewState(cached?.viewState))
  const [rangeVersion, setRangeVersion] = useState(0)
  const [, setViewStateVersion] = useState(0)
  const scrollElement = scrollViewportRef?.current ?? undefined

  if (viewStateCacheKeyRef.current !== cacheKey) {
    viewStateCacheKeyRef.current = cacheKey
    viewStateRef.current = cloneTimelineViewState(cached?.viewState)
  }

  const timelineViewState = viewStateRef.current
  const handleActivityRowExpansionStateChange = useCallback(
    (rowKey: string, expansionState: ActivityRowExpansionState) => {
      viewStateRef.current = {
        ...viewStateRef.current,
        activityRowByKey: {
          ...viewStateRef.current.activityRowByKey,
          [rowKey]: cloneActivityRowExpansionState(expansionState),
        },
      }
      setViewStateVersion((version) => version + 1)
    },
    [],
  )
  const handleToolOpenChange = useCallback((partID: string, open: boolean) => {
    viewStateRef.current = {
      ...viewStateRef.current,
      toolOpenByPartID: {
        ...viewStateRef.current.toolOpenByPartID,
        [partID]: open,
      },
    }
    setViewStateVersion((version) => version + 1)
  }, [])
  const initialRect = useMemo(
    () =>
      scrollElement
        ? {
            width: scrollElement.clientWidth,
            height: scrollElement.clientHeight || TIMELINE_INITIAL_VIEWPORT_HEIGHT_PX,
          }
        : undefined,
    [scrollElement],
  )

  const activeRowIndex = useMemo(() => latestLiveTimelineRowIndex(rows), [rows])

  const rowWrappersRef = useRef(new Map<string, HTMLElement>())
  const registerRowWrapper = useCallback((rowKey: string, node: HTMLElement | null) => {
    if (node) {
      rowWrappersRef.current.set(rowKey, node)
    } else {
      rowWrappersRef.current.delete(rowKey)
    }
  }, [])

  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => scrollViewportRef?.current ?? null,
    initialOffset: () =>
      restoredInitialScrollOffset ?? (shouldAnchorBottom() ? Number.MAX_SAFE_INTEGER : 0),
    initialMeasurementsCache: cached?.measurements,
    initialRect,
    estimateSize: (index) => estimateRowSize(rows[index]),
    scrollToFn: (offset, options, instance) => {
      if (virtualContentRef.current) {
        virtualContentRef.current.style.height = `${instance.getTotalSize()}px`
      }
      const root = scrollViewportRef?.current
      const previousScrollTop = root?.scrollTop
      elementScroll(offset, options, instance)
      const nextScrollTop = root?.scrollTop
      recordTranscriptPerfEvent({
        type: "scroll-write",
        at: performance.now(),
        // The virtualizer writes `offset + adjustments`; recording the bare
        // offset makes a trace read as though the write missed its target.
        requestedOffset: offset + (options.adjustments ?? 0),
        previousScrollTop,
        nextScrollTop,
        noOp:
          previousScrollTop !== undefined &&
          nextScrollTop !== undefined &&
          Math.abs(previousScrollTop - nextScrollTop) < TIMELINE_SCROLL_WRITE_EPSILON_PX,
        reason: "virtualizer",
      })
    },
    // Runs synchronously from `notify`, which `resizeItem` calls immediately
    // after it has written `scrollTop`. Without this the compensating geometry
    // waits for React and paints a frame late — see `syncVirtualRowGeometry`.
    onChange: (instance) => {
      syncVirtualRowGeometry(instance.getVirtualItems(), rowWrappersRef.current)
    },
    getItemKey: (index) => rows[index]?.key ?? `removed:${index}`,
    measureElement: measureVirtualElement,
    anchorTo: "end",
    followOnAppend: false,
    scrollEndThreshold: TIMELINE_SCROLL_END_THRESHOLD_PX,
    overscan: VIRTUAL_CHAT_OVERSCAN,
    paddingEnd: TIMELINE_PADDING_END_PX,
    // ResizeObserver fires after layout and before paint, which is the only
    // moment a bottom-following correction can land in the same frame as the
    // growth that caused it. Deferring it into requestAnimationFrame paints one
    // frame with the row already taller and scrollTop not yet moved — every new
    // line appears a line low and then settles.
    useAnimationFrameWithResizeObserver: false,
    rangeExtractor: (range) => {
      void rangeVersion
      const base = defaultRangeExtractor(range)
      const pinned = resizePinnedIndexesRef.current
      const active = activeRowIndex >= 0 ? [activeRowIndex] : []
      return Array.from(new Set([...pinned, ...base, ...active]))
        .filter((index) => index >= 0 && index < range.count)
        .toSorted((left, right) => left - right)
    },
  })

  useEffect(() => {
    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
      if (shouldAnchorBottom()) return false
      const firstVisibleIndex = rowVirtualizer.range?.startIndex
      return firstVisibleIndex !== undefined && item.index < firstVisibleIndex
    }

    return () => {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
    }
  }, [rowVirtualizer, shouldAnchorBottom])

  const bottomRepairTimerRef = useRef<number | undefined>(undefined)
  const anchorShiftAnimator = useMemo(() => createAnchorShiftAnimator(), [])
  const repairBottomAnchor = useCallback(
    (reason: TranscriptScrollWriteReason) => {
      if (!shouldAnchorBottom() || hasScrollGesture()) return
      const root = scrollViewportRef?.current
      if (!root) return
      const totalSize = rowVirtualizer.getTotalSize()
      const distanceFromEnd = distanceFromVirtualEnd(root, totalSize)
      if (distanceFromEnd <= TIMELINE_BOTTOM_REPAIR_MIN_DISTANCE_PX) return
      recordTranscriptPerfEvent({
        type: "bottom-anchor-repair",
        at: performance.now(),
        distanceFromEnd,
      })
      commitTranscriptVirtualEnd({
        root,
        virtualContent: virtualContentRef.current,
        totalSize,
        reason,
        markProgrammaticScroll,
      })
    },
    [
      hasScrollGesture,
      markProgrammaticScroll,
      rowVirtualizer,
      scrollViewportRef,
      shouldAnchorBottom,
    ],
  )

  const scheduleResizeBottomRepair = useCallback(() => {
    if (hasScrollGesture()) return
    if (bottomRepairTimerRef.current !== undefined) {
      window.clearTimeout(bottomRepairTimerRef.current)
    }
    bottomRepairTimerRef.current = window.setTimeout(() => {
      bottomRepairTimerRef.current = undefined
      repairBottomAnchor("trailing-repair")
    }, TIMELINE_RESIZE_BOTTOM_REPAIR_DELAY_MS)
  }, [hasScrollGesture, repairBottomAnchor])

  useEffect(
    () => () => {
      if (bottomRepairTimerRef.current !== undefined) {
        window.clearTimeout(bottomRepairTimerRef.current)
      }
      anchorShiftAnimator.cancel()
    },
    [anchorShiftAnimator],
  )

  useEffect(() => {
    const resizeItem = rowVirtualizer.resizeItem

    rowVirtualizer.resizeItem = (index, size) => {
      const item = rowVirtualizer.measurementsCache[index]
      const previous = item ? (rowVirtualizer.itemSizeCache.get(item.key) ?? item.size) : undefined
      const root = scrollViewportRef?.current
      const element = root?.querySelector<HTMLElement>(`[data-index="${index}"]`) ?? null
      const measuredRowKey =
        element?.closest<HTMLElement>("[data-timeline-key]")?.dataset.timelineKey ??
        rows[index]?.key
      // Sub-pixel remeasures change nothing visually but still move the total
      // size, which can flip a range boundary and unmount/remount the row that
      // straddles it. On a very tall row that reads as the whole transcript
      // blanking and coming back.
      const subPixelJitter =
        previous !== undefined && Math.abs(size - previous) < TIMELINE_SCROLL_WRITE_EPSILON_PX
      const skipResize =
        subPixelJitter ||
        isDeferredToolFallbackCollapse({
          root: element,
          previousSize: previous,
          nextSize: size,
        })
      recordTranscriptPerfEvent({
        type: "row-size",
        at: performance.now(),
        index,
        rowKey: measuredRowKey,
        previousSize: previous,
        nextSize: size,
        deltaPx: previous === undefined ? undefined : size - previous,
        ignored: skipResize,
      })
      if (skipResize) return
      if (
        root &&
        previous !== undefined &&
        Math.abs(size - previous) > root.clientHeight * VIEWPORT_SIZE_CHANGE_PIN_MULTIPLIER
      ) {
        const view = root.getBoundingClientRect()
        resizePinnedIndexesRef.current = Array.from(
          root.querySelectorAll<HTMLElement>("[data-index]"),
        )
          .filter((element) => {
            const rect = element.getBoundingClientRect()
            return rect.bottom > view.top && rect.top < view.bottom
          })
          .map((element) => Number(element.dataset.index))
          .filter((index) => Number.isFinite(index))

        if (resizePinFrameRef.current !== undefined) {
          window.cancelAnimationFrame(resizePinFrameRef.current)
        }
        setRangeVersion((version) => version + 1)
        resizePinFrameRef.current = window.requestAnimationFrame(() => {
          resizePinFrameRef.current = window.requestAnimationFrame(() => {
            resizePinFrameRef.current = undefined
            resizePinnedIndexesRef.current = []
            setRangeVersion((version) => version + 1)
          })
        })
      }
      resizeItem(index, size)
      if (
        root &&
        shouldAnchorBottom() &&
        (previous === undefined || Math.abs(size - previous) > 0.5)
      ) {
        scheduleResizeBottomRepair()
      }
      if (previous === undefined || Math.abs(size - previous) > TIMELINE_SCROLL_WRITE_EPSILON_PX) {
        scheduleInitialLayoutReady()
      }
    }

    // A restored attached offset owns the first paint, but it may no longer be the
    // virtual end when the viewport or transcript changed while this task was hidden.
    // Reconcile after the same quiet window used for asynchronous row measurements so
    // cached geometry cannot fight the restored offset during the initial mount.
    if (hasRestoredInitialScrollOffset && shouldAnchorBottom()) {
      scheduleResizeBottomRepair()
    }

    return () => {
      rowVirtualizer.resizeItem = resizeItem
      if (resizePinFrameRef.current !== undefined) {
        window.cancelAnimationFrame(resizePinFrameRef.current)
        resizePinFrameRef.current = undefined
      }
    }
  }, [
    hasRestoredInitialScrollOffset,
    hasScrollGesture,
    rowVirtualizer,
    rows,
    scheduleInitialLayoutReady,
    scheduleResizeBottomRepair,
    scrollViewportRef,
    shouldAnchorBottom,
  ])

  // A composer surface opening or closing resizes this viewport. Repairing the
  // bottom anchor from a later frame makes the transcript jump a full surface
  // height in one paint, and animating the surface height instead would relayout
  // the virtualized list every frame. Commit the corrected offset synchronously
  // here — the observer already runs after layout and before paint — then replay
  // the resulting shift as a compositor transform so the settle costs no layout,
  // no scroll events, and no React renders.
  useEffect(() => {
    const root = scrollViewportRef?.current
    if (!root || typeof ResizeObserver === "undefined") return

    let previousHeight = root.clientHeight
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === root)
      if (!entry) return
      const nextHeight = entry.contentRect.height
      if (Math.abs(nextHeight - previousHeight) <= TIMELINE_SCROLL_WRITE_EPSILON_PX) return
      const shiftPx = resolveAnchorShiftPx({
        scrollHeight: root.scrollHeight,
        previousViewportHeight: previousHeight,
        nextViewportHeight: nextHeight,
      })
      previousHeight = nextHeight
      onViewportHeightChange?.(root)
      if (!shouldAnchorBottom() || hasScrollGesture()) return
      // Growing the viewport is repaired by the browser's own scrollTop clamp,
      // so only the shrink direction needs an explicit write here.
      repairBottomAnchor("viewport-resize")
      anchorShiftAnimator.run(virtualContentRef.current, shiftPx)
    })

    observer.observe(root)
    const cancelAnchorShift = () => {
      anchorShiftAnimator.cancel()
    }
    root.addEventListener("wheel", cancelAnchorShift, { passive: true })
    root.addEventListener("touchstart", cancelAnchorShift, { passive: true })
    return () => {
      observer.disconnect()
      root.removeEventListener("wheel", cancelAnchorShift)
      root.removeEventListener("touchstart", cancelAnchorShift)
      anchorShiftAnimator.cancel()
    }
  }, [
    anchorShiftAnimator,
    hasScrollGesture,
    onViewportHeightChange,
    repairBottomAnchor,
    scrollViewportRef,
    shouldAnchorBottom,
  ])

  useLayoutEffect(() => {
    if (!cacheKey || rows.length === 0) return
    if (hasRestoredInitialScrollOffset) return
    if (bottomAnchorCacheKeyRef.current === cacheKey) return
    bottomAnchorCacheKeyRef.current = cacheKey

    if (bottomAnchorFrameRef.current !== undefined) {
      window.cancelAnimationFrame(bottomAnchorFrameRef.current)
    }
    bottomAnchorFrameRef.current = window.requestAnimationFrame(() => {
      bottomAnchorFrameRef.current = undefined
      if (bottomAnchorCacheKeyRef.current !== cacheKey) return
      if (!shouldAnchorBottom() || hasScrollGesture()) return
      const root = scrollViewportRef?.current
      if (!root) return
      commitTranscriptVirtualEnd({
        root,
        virtualContent: virtualContentRef.current,
        totalSize: rowVirtualizer.getTotalSize(),
        reason: "initial-end",
        markProgrammaticScroll,
      })
    })

    return () => {
      if (bottomAnchorFrameRef.current !== undefined) {
        window.cancelAnimationFrame(bottomAnchorFrameRef.current)
        bottomAnchorFrameRef.current = undefined
      }
    }
  }, [
    cacheKey,
    hasRestoredInitialScrollOffset,
    hasScrollGesture,
    markProgrammaticScroll,
    rowVirtualizer,
    rows.length,
    scrollViewportRef,
    shouldAnchorBottom,
  ])

  const lastRowKey = rows.at(-1)?.key
  // Record what entered and at what estimate. A capture started after a steer
  // sees only ordinary streaming, so the moment the steered row appears — and
  // the estimate it appears at — was invisible in every earlier trace.
  const appendedRowsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const previousRowKeys = appendedRowsRef.current
    const nextRowKeys = new Set(rows.map((row) => row.key))
    appendedRowsRef.current = nextRowKeys
    if (
      previousRowKeys.size === 0 ||
      getTranscriptPerformanceProbe()?.isRecording() !== true
    ) {
      return
    }

    const appendedRows = rows.flatMap((row, index) =>
      previousRowKeys.has(row.key) ? [] : [{ row, index }],
    )
    if (appendedRows.length === 0) return

    recordTranscriptPerfEvent({
      type: "rows-appended",
      at: performance.now(),
      rowCount: rows.length,
      previousRowCount: previousRowKeys.size,
      appended: appendedRows.map(({ row, index }) => ({
        key: row.key,
        index,
        // What the virtualizer holds, falling back to the projection's own
        // number before the row reaches the measurement cache. Reporting only
        // the latter hid a real gap: a row entered at 108 while this logged 88,
        // because the estimate was recomputed after the message it describes
        // had already changed.
        estimatedSize:
          rowVirtualizer.measurementsCache[index]?.size ?? estimateRowSize(row),
      })),
    })
  }, [rowVirtualizer, rows])

  // A genuinely new tail is the one structural change the virtualizer will not
  // follow on its own. Track both count and identity so a same-length tail
  // replacement repairs the anchor while a pure removal does not.
  const timelineTailRef = useRef<TimelineTailSnapshot>()
  useEffect(() => {
    const nextTail = { lastRowKey, rowCount: rows.length }
    const tailWasAdded = isSemanticTimelineTailAddition(timelineTailRef.current, nextTail)
    timelineTailRef.current = nextTail
    if (!tailWasAdded) return
    if (hasRestoredInitialScrollOffset && !rowCountChangedSinceRestoreRef.current) return
    if (lastRowKey === undefined || !shouldAnchorBottom() || hasScrollGesture()) return
    const root = scrollViewportRef?.current
    if (!root) return
    const totalSize = rowVirtualizer.getTotalSize()
    const distanceFromEnd = distanceFromVirtualEnd(root, totalSize)
    if (distanceFromEnd <= TIMELINE_BOTTOM_REPAIR_MIN_DISTANCE_PX) return
    commitTranscriptVirtualEnd({
      root,
      virtualContent: virtualContentRef.current,
      totalSize,
      reason: "semantic-row-addition",
      markProgrammaticScroll,
    })
  }, [
    hasRestoredInitialScrollOffset,
    hasScrollGesture,
    lastRowKey,
    markProgrammaticScroll,
    rowVirtualizer,
    rows.length,
    scrollViewportRef,
    shouldAnchorBottom,
  ])

  useEffect(() => {
    return () => {
      if (!cacheKey) return
      timelineCache.delete(cacheKey)
      timelineCache.set(cacheKey, {
        measurements: rowVirtualizer.takeSnapshot(),
        viewState: cloneTimelineViewState(viewStateRef.current),
      })
      while (timelineCache.size > VIRTUAL_CHAT_SESSION_CACHE_LIMIT) {
        const first = timelineCache.keys().next().value
        if (!first) break
        timelineCache.delete(first)
      }
    }
  }, [cacheKey, rowVirtualizer])

  const restorePrependAnchor = useCallback(() => {
    const root = scrollViewportRef?.current
    const anchor = prependAnchorRef.current
    if (!root || !anchor) return

    restoreAnchorCancelRef.current?.()
    restoreAnchorCancelRef.current = restoreVisibleTimelineAnchor({
      root,
      anchor,
      onDone: () => {
        prependAnchorRef.current = undefined
        restoreAnchorCancelRef.current = undefined
      },
    })
  }, [scrollViewportRef])

  const loadOlderHistory = useCallback(() => {
    if (!directory || !sessionID) return
    if (loadingOlderRef.current) return
    if (transcriptMeta.loading || transcriptMeta.complete || !transcriptMeta.cursor) return

    const root = scrollViewportRef?.current
    if (root) {
      prependAnchorRef.current = captureVisibleTimelineAnchor(root)
    }
    loadingOlderRef.current = true
    void loadOlderTranscriptMessages(directory, sessionID)
      .then(() => {
        if (shouldAnchorBottom()) {
          // An attached transcript owns the semantic end. Restoring the previously visible row
          // after a prepend instead pins that row (often the "Session compacted" boundary) near
          // the top and fights end anchoring while the new page is measured.
          prependAnchorRef.current = undefined
          restoreAnchorCancelRef.current?.()
          restoreAnchorCancelRef.current = undefined
          return
        }
        restorePrependAnchor()
      })
      .finally(() => {
        loadingOlderRef.current = false
      })
  }, [
    directory,
    restorePrependAnchor,
    scrollViewportRef,
    sessionID,
    shouldAnchorBottom,
    transcriptMeta.complete,
    transcriptMeta.cursor,
    transcriptMeta.loading,
  ])

  useEffect(() => {
    if (transcriptMeta.complete || !transcriptMeta.cursor) return
    const viewport = scrollViewportRef?.current
    if (!viewport) return

    const handleScroll = () => {
      if (viewport.scrollTop <= HISTORY_PREPEND_TOP_THRESHOLD_PX) {
        loadOlderHistory()
      }
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true })
    handleScroll()
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [loadOlderHistory, scrollViewportRef, transcriptMeta.complete, transcriptMeta.cursor])

  useEffect(() => {
    return () => {
      restoreAnchorCancelRef.current?.()
      restoreAnchorCancelRef.current = undefined
    }
  }, [])

  const handleInlineAssetContentReady = useCallback((rowKey: string) => {
    recordTranscriptPerfEvent({
      type: "inline-asset",
      at: performance.now(),
      rowKey,
      action: "content-ready",
      width: undefined,
      height: undefined,
    })
  }, [])
  const handleInlineAssetSizeChange = useCallback((rowKey: string, size: InlineAssetSize) => {
    recordTranscriptPerfEvent({
      type: "inline-asset",
      at: performance.now(),
      rowKey,
      action: "size-change",
      width: size.width,
      height: size.height,
    })
  }, [])
  const virtualItems = rowVirtualizer.getVirtualItems()
  const firstVirtualIndex = virtualItems[0]?.index
  const lastVirtualIndex = virtualItems.at(-1)?.index

  useEffect(() => {
    if (firstVirtualIndex === undefined || lastVirtualIndex === undefined) return
    recordTranscriptPerfEvent({
      type: "virtual-range",
      at: performance.now(),
      firstIndex: firstVirtualIndex,
      lastIndex: lastVirtualIndex,
      rowCount: rows.length,
      mountedCount: virtualItems.length,
    })
  }, [firstVirtualIndex, lastVirtualIndex, rows.length, virtualItems.length])

  return (
    <ChatScrollProvider viewportRef={scrollViewportRef}>
      <TooltipProvider>
        <div className="relative min-w-0 w-full max-w-full">
          <div
            ref={virtualContentRef}
            className="relative min-w-0 w-full max-w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null

              return (
                <TimelineVirtualRow
                  key={virtualRow.key}
                  virtualRow={virtualRow}
                  row={row}
                  measureElement={rowVirtualizer.measureElement}
                  resizeItem={rowVirtualizer.resizeItem}
                  registerWrapper={registerRowWrapper}
                  onInlineAssetContentReady={handleInlineAssetContentReady}
                  onInlineAssetSizeChange={handleInlineAssetSizeChange}
                >
                  <TimelineRowRenderer
                    row={row}
                    providers={providers}
                    directory={directory}
                    canEditImages={canEditImages}
                    lastUserMessageID={lastUserMessageID}
                    entranceUserMessageID={entranceUserMessageID}
                    shellToolDefaultOpen={shellToolDefaultOpen}
                    editToolDefaultOpen={editToolDefaultOpen}
                    onOpenSession={onOpenSession}
                    onOpenResource={onOpenResource}
                    onForkMessage={onForkMessage}
                    onRevertMessage={onRevertMessage}
                    onRetryAction={onRetryAction}
                    onContinueTruncated={onContinueTruncated}
                    activityRowExpansionByKey={timelineViewState.activityRowByKey}
                    onActivityRowExpansionStateChange={handleActivityRowExpansionStateChange}
                    toolOpenByPartID={timelineViewState.toolOpenByPartID}
                    onToolOpenChange={handleToolOpenChange}
                  />
                </TimelineVirtualRow>
              )
            })}
          </div>
        </div>
      </TooltipProvider>
    </ChatScrollProvider>
  )
}, chatTranscriptEqual)
