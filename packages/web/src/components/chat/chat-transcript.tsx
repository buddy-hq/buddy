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
import { TooltipProvider } from "@buddy/ui"
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
import { recordTranscriptPerfEvent } from "@/lib/directory-chat/transcript-performance-probe"
import {
  VIRTUAL_CHAT_OVERSCAN,
  VIRTUAL_CHAT_TURN_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"
import { ChatScrollProvider } from "./chat-scroll-context"
import {
  InlineAssetLifecycleProvider,
  type InlineAssetSize,
} from "./inline-asset-boundary"
import {
  projectTimelineRows,
  reuseTimelineRows,
  type TimelineAssistantItem,
  type TimelineRow,
} from "./chat-timeline-rows"
import { chatTranscriptEqual } from "./utils/message-utils"
import { isHiddenFromUserMessage } from "./utils/message-visibility"
import { isChatReasoningPart, isChatTextPart } from "./utils/part-guards"
import { reasoningHeading } from "./utils/markdown"
import { useAssistantMeta } from "./hooks/use-assistant-meta"
import { UserSection } from "./sections/user-section"
import { HiddenSteps, type HiddenStepsExpansionState } from "./tools/hidden-steps/index"
import { HiddenStepsPlaceholder } from "./tools/hidden-steps/thinking-placeholder"
import { parseToolState } from "./tools/parse-tool-state"
import { GroupedIngestFullTextToolCard } from "./tools/render/ingest-full-text"
import { parseRenderFigureOutput, GroupedFigureToolCard } from "./tools/render/render-figure"
import { parseRenderMermaidSources, GroupedMermaidToolCard } from "./tools/render/mermaid"
import { ToolExpansionStateProvider } from "./tools/basic-tool"
import { toolDefaultOpen } from "./utils/constants"
import { AssistantPartRenderer } from "./parts/assistant-part/assistant-part"
import { MessageDivider } from "./parts/assistant-part/message-divider"
import { AssistantErrorCard } from "./assistant-error-card"
import { SessionRetryNotice } from "./session-retry-notice"
import type { ChatTranscriptProps } from "./types"

const HISTORY_PREPEND_TOP_THRESHOLD_PX = 160
const TIMELINE_CACHE_LIMIT = 16
const TIMELINE_PADDING_END_PX = 64
const TIMELINE_SCROLL_END_THRESHOLD_PX = 80
const TIMELINE_RESIZE_STABLE_FRAMES = 30
const TIMELINE_RESIZE_MAX_FRAMES = 180
const TIMELINE_INITIAL_VIEWPORT_HEIGHT_PX = 800
const VIEWPORT_SIZE_CHANGE_PIN_MULTIPLIER = 1
const EMPTY_PROVIDERS: ProviderInfo[] = []
const EMPTY_HIDDEN_STEPS_EXPANSION_STATE: HiddenStepsExpansionState = {
  open: false,
  itemOpenByPartID: {},
}

type TimelineCacheEntry = {
  measurements: VirtualItem[]
  viewState: TimelineViewState
}

type TimelineViewState = {
  hiddenStepsByRowKey: Record<string, HiddenStepsExpansionState>
  toolOpenByPartID: Record<string, boolean | undefined>
}

const timelineCache = new Map<string, TimelineCacheEntry>()

function timelineCacheKey(directory: string | undefined, sessionID: string | undefined) {
  return directory && sessionID ? `${directory}\u0000${sessionID}` : undefined
}

function cloneHiddenStepsExpansionState(
  state: HiddenStepsExpansionState,
): HiddenStepsExpansionState {
  return {
    open: state.open,
    itemOpenByPartID: { ...state.itemOpenByPartID },
  }
}

function cloneTimelineViewState(state: TimelineViewState | undefined): TimelineViewState {
  if (!state) {
    return { hiddenStepsByRowKey: {}, toolOpenByPartID: {} }
  }
  return {
    hiddenStepsByRowKey: Object.fromEntries(
      Object.entries(state.hiddenStepsByRowKey).map(([rowKey, expansionState]) => [
        rowKey,
        cloneHiddenStepsExpansionState(expansionState),
      ]),
    ),
    toolOpenByPartID: { ...state.toolOpenByPartID },
  }
}

function assistantPartIsStreaming(part: MessagePart) {
  if (!isChatTextPart(part) && !isChatReasoningPart(part)) return true
  return typeof part.time?.end !== "number"
}

function estimateRowSize(row: TimelineRow | undefined) {
  if (!row) return VIRTUAL_CHAT_TURN_ESTIMATE_PX
  switch (row.type) {
    case "turn-gap":
      return 24
    case "thinking":
      return 52
    case "turn-divider":
    case "retry":
    case "error":
      return 96
    case "user":
      return Math.max(96, 72 + row.partIDs.length * 36)
    case "assistant":
      if (row.item.type === "grouped-parts") return 260
      if (row.item.type === "abstracted") return 96
      return VIRTUAL_CHAT_TURN_ESTIMATE_PX
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

  const apply = () => {
    frameID = undefined
    const element = input.root.querySelector<HTMLElement>(
      `[data-timeline-key="${CSS.escape(input.anchor.key)}"]`,
    )
    const delta = element
      ? element.getBoundingClientRect().top - input.root.getBoundingClientRect().top - input.anchor.offset
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
      input.onDone()
      return
    }
    frameID = window.requestAnimationFrame(apply)
  }

  frameID = window.requestAnimationFrame(apply)
  return () => {
    if (frameID !== undefined) {
      window.cancelAnimationFrame(frameID)
    }
  }
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
      input.sessionID,
      input.showReasoningSummaries,
      visibleMessages,
    ],
  )

  return {
    rows: useStableTimelineRows(projected),
    visibleMessages,
  }
}

function TimelineUserRow(props: {
  row: Extract<TimelineRow, { type: "user" }>
  providers: ProviderInfo[]
  canRevert: boolean
  onForkMessage: ChatTranscriptProps["onForkMessage"]
  onRevertMessage: ChatTranscriptProps["onRevertMessage"]
}) {
  const info = useTranscriptMessage(props.row.userMessageID)
  const parts = useTranscriptParts(props.row.partIDs)
  const userMessage = useMemo(
    () => (info ? { info, parts } : undefined),
    [info, parts],
  )

  return (
    <article
      data-message-id={props.row.userMessageID}
      data-timeline-row="UserMessage"
      className="relative min-w-0 w-full max-w-full px-4 md:px-5"
    >
      <UserSection
        userMessage={userMessage}
        providers={props.providers}
        onForkMessage={props.onForkMessage}
        onRevertMessage={props.canRevert ? props.onRevertMessage : undefined}
      />
    </article>
  )
}

function usePreviousPart(partID: string | undefined) {
  return useTranscriptPart(partID)
}

function assistantItemPartIDs(item: TimelineAssistantItem) {
  switch (item.type) {
    case "abstracted":
    case "grouped-parts":
      return item.partIDs
    case "part":
      return [item.partID]
  }
}

function useAssistantRowParts(item: TimelineAssistantItem) {
  return useTranscriptParts(assistantItemPartIDs(item))
}

function partIsRenderFigureTool(part: MessagePart | undefined) {
  return (
    part?.type === "tool" &&
    (String(part.tool ?? "") === "render_figure" ||
      String(part.tool ?? "") === "render_freeform_figure")
  )
}

function partIsRenderMermaidTool(part: MessagePart | undefined) {
  return part?.type === "tool" && String(part.tool ?? "") === "render_mermaid"
}

function TimelineAssistantRow(props: {
  row: Extract<TimelineRow, { type: "assistant" }>
  providers: ProviderInfo[]
  directory: string | undefined
  shellToolDefaultOpen: boolean
  editToolDefaultOpen: boolean
  onOpenSession: ChatTranscriptProps["onOpenSession"]
  onOpenResource: ChatTranscriptProps["onOpenResource"]
  hiddenStepsExpansionState: HiddenStepsExpansionState | undefined
  onHiddenStepsExpansionStateChange: (state: HiddenStepsExpansionState) => void
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
    partIsRenderFigureTool(previousPart) &&
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

  return (
    <article
      data-message-id={props.row.userMessageID}
      data-timeline-row="AssistantPart"
      className="relative min-w-0 w-full max-w-full px-4 md:px-5"
    >
      <div
        className={`flow-root min-w-0 w-full max-w-full ${
          props.row.previousAssistantPart ? "pt-4" : "pt-5"
        }`}
      >
        {props.row.item.type === "abstracted" ? (
          <HiddenSteps
            parts={parts}
            onOpenSession={props.onOpenSession}
            directory={props.directory}
            copyPartID={props.row.assistantCopyPartID}
            metaText={assistantMetaText}
            interrupted={props.row.assistantAborted}
            isBusy={props.row.active}
            expansionState={props.hiddenStepsExpansionState ?? EMPTY_HIDDEN_STEPS_EXPANSION_STATE}
            onExpansionStateChange={props.onHiddenStepsExpansionStateChange}
          />
        ) : null}

        {props.row.item.type === "grouped-parts" && props.row.item.tool === "render_mermaid" ? (
          <GroupedMermaidToolCard parts={parts} directory={props.directory} />
        ) : null}
        {props.row.item.type === "grouped-parts" &&
        (props.row.item.tool === "render_figure" ||
          props.row.item.tool === "render_freeform_figure") ? (
          <GroupedFigureToolCard parts={parts} directory={props.directory} />
        ) : null}
        {props.row.item.type === "grouped-parts" && props.row.item.tool === "ingest_full_text" ? (
          <GroupedIngestFullTextToolCard
            parts={parts}
            directory={props.directory}
            onOpenResource={props.onOpenResource}
          />
        ) : null}

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
                copyPartID={props.row.assistantCopyPartID}
                metaText={assistantMetaText}
                interrupted={props.row.assistantAborted}
                streaming={props.row.active && assistantPartIsStreaming(itemPart)}
                stripLeadingFigureImage={stripLeadingFigureImage}
                stripLeadingMermaidSources={stripLeadingMermaidSources}
                directory={props.directory}
                onOpenSession={props.onOpenSession}
                onOpenResource={props.onOpenResource}
                defaultOpen={toolDefaultOpen(
                  String(itemPart.tool ?? ""),
                  props.shellToolDefaultOpen,
                  props.editToolDefaultOpen,
                )}
              />
            </ToolExpansionStateProvider>
          ) : (
            <AssistantPartRenderer
              part={itemPart}
              copyPartID={props.row.assistantCopyPartID}
              metaText={assistantMetaText}
              interrupted={props.row.assistantAborted}
              streaming={props.row.active && assistantPartIsStreaming(itemPart)}
              stripLeadingFigureImage={stripLeadingFigureImage}
              stripLeadingMermaidSources={stripLeadingMermaidSources}
              directory={props.directory}
              onOpenSession={props.onOpenSession}
              onOpenResource={props.onOpenResource}
            />
          )
        ) : null}
      </div>
    </article>
  )
}

function TimelineThinkingRow(props: {
  row: Extract<TimelineRow, { type: "thinking" }>
}) {
  const reasoningPart = useTranscriptPart(props.row.reasoningPartID)
  const detail =
    props.row.reasoningHeading ??
    (reasoningPart && isChatReasoningPart(reasoningPart)
      ? reasoningHeading(reasoningPart.text)
      : undefined)

  return (
    <article
      data-message-id={props.row.userMessageID}
      data-timeline-row="Thinking"
      className="relative min-w-0 w-full max-w-full px-4 md:px-5"
    >
      <div
        className={`flow-root ${props.row.previousAssistantPart ? "pt-4" : "pt-5"}`}
      >
        <HiddenStepsPlaceholder detail={detail} />
      </div>
    </article>
  )
}

function TimelineRowRenderer(props: {
  row: TimelineRow
  providers: ProviderInfo[]
  directory: string | undefined
  lastUserMessageID: string | undefined
  shellToolDefaultOpen: boolean
  editToolDefaultOpen: boolean
  onOpenSession: ChatTranscriptProps["onOpenSession"]
  onOpenResource: ChatTranscriptProps["onOpenResource"]
  onForkMessage: ChatTranscriptProps["onForkMessage"]
  onRevertMessage: ChatTranscriptProps["onRevertMessage"]
  hiddenStepsExpansionByRowKey: Record<string, HiddenStepsExpansionState>
  onHiddenStepsExpansionStateChange: (rowKey: string, state: HiddenStepsExpansionState) => void
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
          onForkMessage={props.onForkMessage}
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
              props.row.label === "compaction"
                ? language.t("chat.compaction.compacted")
                : "Interrupted"
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
          shellToolDefaultOpen={props.shellToolDefaultOpen}
          editToolDefaultOpen={props.editToolDefaultOpen}
          onOpenSession={props.onOpenSession}
          onOpenResource={props.onOpenResource}
          hiddenStepsExpansionState={props.hiddenStepsExpansionByRowKey[props.row.key]}
          onHiddenStepsExpansionStateChange={(state) =>
            props.onHiddenStepsExpansionStateChange(props.row.key, state)
          }
          toolOpenByPartID={props.toolOpenByPartID}
          onToolOpenChange={props.onToolOpenChange}
        />
      )
    case "thinking":
      return <TimelineThinkingRow row={props.row} />
    case "retry":
      return (
        <article
          data-message-id={props.row.userMessageID}
          data-timeline-row="Retry"
          className="relative min-w-0 w-full max-w-full px-4 md:px-5"
        >
          <SessionRetryNotice status={props.row.status} />
        </article>
      )
    case "error":
      return (
        <article
          data-message-id={props.row.userMessageID}
          data-timeline-row="Error"
          className="relative min-w-0 w-full max-w-full px-4 md:px-5"
        >
          <AssistantErrorCard message={props.row.text} errorName={props.row.errorName} />
        </article>
      )
  }
}

function TimelineVirtualRow(props: {
  virtualRow: VirtualItem
  row: TimelineRow
  measureElement: (node: HTMLDivElement | null) => void
  resizeItem: (index: number, size: number) => void
  onInlineAssetContentReady: (rowKey: string) => void
  onInlineAssetSizeChange: (rowKey: string, size: InlineAssetSize) => void
  children: ReactNode
}) {
  const {
    children,
    measureElement,
    resizeItem,
    onInlineAssetContentReady,
    onInlineAssetSizeChange,
    row,
    virtualRow,
  } = props
  const rowKey = row.key
  const elementRef = useRef<HTMLDivElement | null>(null)
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
      data-timeline-key={rowKey}
      className="absolute inset-x-0 top-0 min-w-0 max-w-full"
      style={{
        height: `${virtualRow.size}px`,
        overflow: "clip",
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      <div data-index={virtualRow.index} ref={bindElement} className="flow-root">
        <InlineAssetLifecycleProvider value={lifecycle}>
          {children}
        </InlineAssetLifecycleProvider>
      </div>
    </div>
  )
}

export const ChatTranscript = memo(function ChatTranscript(props: ChatTranscriptProps) {
  const {
    directory,
    onForkMessage,
    onOpenSession,
    onOpenResource,
    onRevertMessage,
    scrollViewportRef,
  } = props
  const directoryState = useChatStore((state) =>
    directory ? state.directories[directory] : undefined,
  )
  const sessionID = directoryState?.sessionID
  const sessions = directoryState?.sessions ?? []
  const activeSession = sessionID
    ? sessions.find((session) => session.id === sessionID)
    : undefined
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
  const lastUserMessageID = visibleMessages.findLast((message) => message.info.role === "user")?.info.id
  const cacheKey = timelineCacheKey(directory, sessionID)
  const cached = cacheKey ? timelineCache.get(cacheKey) : undefined
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
  const handleHiddenStepsExpansionStateChange = useCallback(
    (rowKey: string, expansionState: HiddenStepsExpansionState) => {
      viewStateRef.current = {
        ...viewStateRef.current,
        hiddenStepsByRowKey: {
          ...viewStateRef.current.hiddenStepsByRowKey,
          [rowKey]: cloneHiddenStepsExpansionState(expansionState),
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

  const activeRowIndex = useMemo(
    () =>
      rows.findLastIndex(
        (row) => row.type === "thinking" || (row.type === "assistant" && row.active),
      ),
    [rows],
  )

  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => scrollViewportRef?.current ?? null,
    initialOffset: () => Number.MAX_SAFE_INTEGER,
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
        requestedOffset: offset,
        previousScrollTop,
        nextScrollTop,
        noOp:
          previousScrollTop !== undefined &&
          nextScrollTop !== undefined &&
          Math.abs(previousScrollTop - nextScrollTop) < 0.5,
      })
    },
    getItemKey: (index) => rows[index]?.key ?? `removed:${index}`,
    measureElement: measureVirtualElement,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: TIMELINE_SCROLL_END_THRESHOLD_PX,
    overscan: VIRTUAL_CHAT_OVERSCAN,
    paddingEnd: TIMELINE_PADDING_END_PX,
    useAnimationFrameWithResizeObserver: true,
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
    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
      item.end <= instance.getLogicalScrollOffset()

    return () => {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
    }
  }, [rowVirtualizer])

  useEffect(() => {
    const resizeItem = rowVirtualizer.resizeItem
    rowVirtualizer.resizeItem = (index, size) => {
      const item = rowVirtualizer.measurementsCache[index]
      const previous = item ? (rowVirtualizer.itemSizeCache.get(item.key) ?? item.size) : undefined
      const root = scrollViewportRef?.current
      recordTranscriptPerfEvent({
        type: "row-size",
        at: performance.now(),
        index,
        rowKey: rows[index]?.key,
        previousSize: previous,
        nextSize: size,
        deltaPx: previous === undefined ? undefined : size - previous,
      })
      if (
        root &&
        previous !== undefined &&
        Math.abs(size - previous) > root.clientHeight * VIEWPORT_SIZE_CHANGE_PIN_MULTIPLIER
      ) {
        const view = root.getBoundingClientRect()
        resizePinnedIndexesRef.current = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"))
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
    }

    return () => {
      rowVirtualizer.resizeItem = resizeItem
      if (resizePinFrameRef.current !== undefined) {
        window.cancelAnimationFrame(resizePinFrameRef.current)
        resizePinFrameRef.current = undefined
      }
    }
  }, [rowVirtualizer, rows, scrollViewportRef])

  useLayoutEffect(() => {
    if (!cacheKey || rows.length === 0) return
    if (bottomAnchorCacheKeyRef.current === cacheKey) return
    bottomAnchorCacheKeyRef.current = cacheKey

    if (bottomAnchorFrameRef.current !== undefined) {
      window.cancelAnimationFrame(bottomAnchorFrameRef.current)
    }
    bottomAnchorFrameRef.current = window.requestAnimationFrame(() => {
      bottomAnchorFrameRef.current = undefined
      if (bottomAnchorCacheKeyRef.current !== cacheKey) return
      rowVirtualizer.scrollToEnd()
    })

    return () => {
      if (bottomAnchorFrameRef.current !== undefined) {
        window.cancelAnimationFrame(bottomAnchorFrameRef.current)
        bottomAnchorFrameRef.current = undefined
      }
    }
  }, [cacheKey, rowVirtualizer, rows.length])

  useEffect(() => {
    return () => {
      if (!cacheKey) return
      timelineCache.delete(cacheKey)
      timelineCache.set(cacheKey, {
        measurements: rowVirtualizer.takeSnapshot(),
        viewState: cloneTimelineViewState(viewStateRef.current),
      })
      while (timelineCache.size > TIMELINE_CACHE_LIMIT) {
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

  const handleInlineAssetContentReady = useCallback(
    (rowKey: string) => {
      recordTranscriptPerfEvent({
        type: "inline-asset",
        at: performance.now(),
        rowKey,
        action: "content-ready",
        width: undefined,
        height: undefined,
      })
    },
    [],
  )
  const handleInlineAssetSizeChange = useCallback(
    (rowKey: string, size: InlineAssetSize) => {
      recordTranscriptPerfEvent({
        type: "inline-asset",
        at: performance.now(),
        rowKey,
        action: "size-change",
        width: size.width,
        height: size.height,
      })
    },
    [],
  )
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
                  onInlineAssetContentReady={handleInlineAssetContentReady}
                  onInlineAssetSizeChange={handleInlineAssetSizeChange}
                >
                  <TimelineRowRenderer
                    row={row}
                    providers={providers}
                    directory={directory}
                    lastUserMessageID={lastUserMessageID}
                    shellToolDefaultOpen={shellToolDefaultOpen}
                    editToolDefaultOpen={editToolDefaultOpen}
                    onOpenSession={onOpenSession}
                    onOpenResource={onOpenResource}
                    onForkMessage={onForkMessage}
                    onRevertMessage={onRevertMessage}
                    hiddenStepsExpansionByRowKey={timelineViewState.hiddenStepsByRowKey}
                    onHiddenStepsExpansionStateChange={handleHiddenStepsExpansionStateChange}
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
