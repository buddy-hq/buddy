import { toast } from "@buddy/ui"
import type { ObjectWhiteboardObjectReadResponse } from "@buddy/sdk/types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePlatform } from "@/context/platform"
import { useBenchSurfaceActive } from "@/components/bench/bench-surface-activity"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { whiteboardQueryKeys, whiteboardObjectQueryOptions } from "./whiteboard-query"
import type {
  PersistedWhiteboardElement,
  WhiteboardRenderReport,
  WhiteboardViewport,
} from "./whiteboard-elements"
import {
  buildProgressiveWhiteboardPreviewFromMessages,
  countCompletedWhiteboardCreate,
  hasActiveWhiteboardCreate,
  hasLatestFailedWhiteboardCreate,
  hasUnfetchedCompletedWhiteboardCreate,
  resolveStickyProgressiveWhiteboardPreview,
  type ProgressiveWhiteboardPreview,
} from "./whiteboard-progressive"
import { useLiveWhiteboardMessages } from "./whiteboard-live-messages"
import { createWhiteboardShareJson } from "./whiteboard-share"
import type {
  WhiteboardLearnerSaveHandler,
  WhiteboardLearnerSaveSettlement,
} from "./whiteboard-learner-save"
import type { MessageWithParts } from "@/state/chat-types"
import { allowBenchLeave, type BenchLeaveGuardResult } from "@/lib/bench-leave-guard"

const WhiteboardCanvas = lazy(async () => {
  const module = await import("./whiteboard-canvas")
  return { default: module.WhiteboardCanvas }
})

// Lazy so lottie-web stays out of the pane chunk; the animation only shows while busy.
const WhiteboardOpeningAnimation = lazy(async () => {
  const module = await import("./whiteboard-opening-animation")
  return { default: module.WhiteboardOpeningAnimation }
})

type WhiteboardPaneProps = {
  directory: string
  objectID?: string
  previewToolKey?: string
  isBusy: boolean
  messages: MessageWithParts[]
  onLeaveGuardChange?: (guard: (() => Promise<BenchLeaveGuardResult>) | undefined) => void
}

type LiveWhiteboardBoard = {
  elements: PersistedWhiteboardElement[]
  viewport: WhiteboardViewport
}

type ShareableWhiteboardBoard = {
  elements: PersistedWhiteboardElement[]
}

type ActiveWhiteboardBase = {
  boardID?: string
}

const WHITEBOARD_CANVAS_EMPTY_KEY = "empty"
const ACTIVE_WHITEBOARD_REFETCH_INTERVAL_MS = 250
const WHITEBOARD_SHARE_OPENING_MESSAGE = "Opening shared board..."
const WHITEBOARD_SHARE_SAVE_FAILED_MESSAGE =
  "The pending whiteboard edit did not save. Try sharing again after it saves."
const WHITEBOARD_LEAVE_SAVE_FAILED_MESSAGE =
  "The pending whiteboard edit did not save. Try switching chats again after it saves."
const WHITEBOARD_SAVE_CONFLICT_MESSAGE =
  "The whiteboard changed elsewhere. Review the latest board before switching chats."
const WHITEBOARD_SAVE_STILL_RUNNING_MESSAGE =
  "The whiteboard is still saving. Try switching chats again in a moment."

function resolveWhiteboardCanvasKey(input: { objectID?: string }): string {
  return input.objectID ?? WHITEBOARD_CANVAS_EMPTY_KEY
}

function resolveWhiteboardCanvasViewport(input: {
  objectID?: string
  liveViewport?: {
    objectID?: string
    viewport: WhiteboardViewport
  }
  boardViewport?: WhiteboardViewport
}): WhiteboardViewport | undefined {
  const liveViewport = input.liveViewport
  if (liveViewport && liveViewport.objectID === input.objectID) {
    return liveViewport.viewport
  }
  return input.boardViewport
}

function resolveWhiteboardShareBoard(input: {
  displayedBoard?: ShareableWhiteboardBoard
  liveDraftBoard?: LiveWhiteboardBoard
  latestBoard?: ShareableWhiteboardBoard | null
}): ShareableWhiteboardBoard | undefined {
  return input.liveDraftBoard ?? input.latestBoard ?? input.displayedBoard
}

function resolveWhiteboardLeaveSettlement(
  settlement: WhiteboardLearnerSaveSettlement | undefined,
): BenchLeaveGuardResult {
  if (settlement === undefined || settlement.status === "clean" || settlement.status === "saved") {
    return allowBenchLeave()
  }
  if (settlement.status === "conflict") {
    return {
      status: "block",
      reason: "conflict",
      message: WHITEBOARD_SAVE_CONFLICT_MESSAGE,
    }
  }
  if (settlement.status === "still-saving") {
    return {
      status: "block",
      reason: "saving",
      message: WHITEBOARD_SAVE_STILL_RUNNING_MESSAGE,
    }
  }
  return {
    status: "block",
    reason: "save_error",
    message: WHITEBOARD_LEAVE_SAVE_FAILED_MESSAGE,
  }
}

function shouldRefetchWhiteboardAfterBusyChange(input: {
  objectID?: string
  wasBusy: boolean
  isBusy: boolean
}): boolean {
  return Boolean(input.objectID && input.wasBusy && !input.isBusy)
}

function shouldRetainProgressiveWhiteboardPreview(input: {
  hasActiveWhiteboardCreateTool: boolean
  hasUnfetchedCompletedWhiteboardCreateTool: boolean
  hasLatestFailedWhiteboardCreateTool: boolean
  isBusy: boolean
}): boolean {
  return (
    input.hasActiveWhiteboardCreateTool ||
    input.hasUnfetchedCompletedWhiteboardCreateTool ||
    (input.hasLatestFailedWhiteboardCreateTool && input.isBusy)
  )
}

function shouldPollWhiteboardDuringActiveCreate(input: {
  objectID?: string
  hasActiveWhiteboardCreateTool: boolean
}): boolean {
  return Boolean(input.objectID && input.hasActiveWhiteboardCreateTool)
}

function shouldShowWhiteboardOpeningAnimation(input: {
  hasDisplayedBoard: boolean
  hasActiveWhiteboardCreateTool: boolean
  isBusy: boolean
}): boolean {
  return !input.hasDisplayedBoard && (input.hasActiveWhiteboardCreateTool || input.isBusy)
}

function shouldPreferFetchedBoardDuringActiveCreate(input: {
  activeBase: ActiveWhiteboardBase | undefined
  currentBoardID?: string
  hasActiveWhiteboardCreateTool: boolean
}): boolean {
  return Boolean(
    input.hasActiveWhiteboardCreateTool &&
    input.activeBase &&
    input.currentBoardID &&
    input.currentBoardID !== input.activeBase.boardID,
  )
}

function resolveWhiteboardRenderReportKey(input: {
  boardID?: string
  updatedAt?: string
}): string | undefined {
  if (!input.boardID || !input.updatedAt) return undefined
  return `${input.boardID}:${input.updatedAt}`
}

export function WhiteboardPane(props: WhiteboardPaneProps) {
  const {
    directory,
    objectID,
    previewToolKey,
    isBusy,
    messages: messageSnapshot,
    onLeaveGuardChange,
  } = props
  const messages = useLiveWhiteboardMessages(messageSnapshot)
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const [sharingBoard, setSharingBoard] = useState(false)
  const [activeWhiteboardBase, setActiveWhiteboardBase] = useState<ActiveWhiteboardBase>()
  // Canvas edits are transient share/save input. Keeping them outside render state prevents an
  // Excalidraw text-submit from synchronously rerendering the editor during its own cleanup.
  const liveDraftBoardRef = useRef<LiveWhiteboardBoard>()
  const liveViewportRef = useRef<{
    objectID?: string
    viewport: WhiteboardViewport
  }>()
  const previousBoardKeyRef = useRef<string>()
  const previousBusyRef = useRef(isBusy)
  const surfaceActive = useBenchSurfaceActive()
  const settleLearnerSaveRef = useRef<() => Promise<WhiteboardLearnerSaveSettlement>>()
  const objectQuery = useQuery({
    ...whiteboardObjectQueryOptions(directory, objectID ?? ""),
    enabled: Boolean(objectID),
  })
  const refetchObject = objectQuery.refetch
  const currentBoard = objectQuery.data?.currentBoard ?? undefined
  const boardID = currentBoard?.boardID
  const computedProgressivePreview = useMemo(
    () =>
      buildProgressiveWhiteboardPreviewFromMessages(
        Object.assign(
          {
            messages,
            objectID,
            toolKey: previewToolKey,
            baseBoardID: boardID,
            baseElements: currentBoard?.elements ?? [],
          },
          currentBoard?.viewport ? { baseViewport: currentBoard.viewport } : undefined,
        ),
      ),
    [boardID, currentBoard?.elements, currentBoard?.viewport, messages, objectID, previewToolKey],
  )
  const completedWhiteboardCreateCount = useMemo(
    () => countCompletedWhiteboardCreate(messages, objectID),
    [messages, objectID],
  )
  const hasActiveWhiteboardCreateTool = useMemo(
    () => hasActiveWhiteboardCreate(messages, objectID, previewToolKey),
    [messages, objectID, previewToolKey],
  )
  const hasUnfetchedCompletedWhiteboardCreateTool = useMemo(
    () =>
      hasUnfetchedCompletedWhiteboardCreate({
        messages,
        objectID,
        baseBoardID: boardID,
      }),
    [boardID, messages, objectID],
  )
  const hasLatestFailedWhiteboardCreateTool = useMemo(
    () => hasLatestFailedWhiteboardCreate(messages, objectID),
    [messages, objectID],
  )
  const [progressivePreview, setProgressivePreview] = useState<ProgressiveWhiteboardPreview>()
  const shouldUseFetchedBoardDuringActiveCreate = shouldPreferFetchedBoardDuringActiveCreate({
    activeBase: activeWhiteboardBase,
    currentBoardID: currentBoard?.boardID,
    hasActiveWhiteboardCreateTool,
  })
  const displayedBoard = useMemo(() => {
    if (currentBoard && progressivePreview && !shouldUseFetchedBoardDuringActiveCreate) {
      return Object.assign(
        {
          ...currentBoard,
          elements: progressivePreview.elements,
        },
        progressivePreview.viewport ? { viewport: progressivePreview.viewport } : undefined,
      )
    }
    if (currentBoard) return currentBoard
    if (!progressivePreview) return undefined
    return Object.assign(
      { elements: progressivePreview.elements },
      progressivePreview.viewport ? { viewport: progressivePreview.viewport } : undefined,
    )
  }, [currentBoard, progressivePreview, shouldUseFetchedBoardDuringActiveCreate])
  const showOpeningAnimation = shouldShowWhiteboardOpeningAnimation({
    hasDisplayedBoard: Boolean(displayedBoard),
    hasActiveWhiteboardCreateTool,
    isBusy,
  })
  const canvasKey = resolveWhiteboardCanvasKey({
    objectID,
  })
  const canvasViewport = resolveWhiteboardCanvasViewport({
    objectID,
    liveViewport: liveViewportRef.current,
    boardViewport: displayedBoard?.viewport,
  })
  const renderReportKey = resolveWhiteboardRenderReportKey({
    boardID: currentBoard?.boardID,
    updatedAt: currentBoard?.updatedAt,
  })

  useEffect(() => {
    setProgressivePreview((current) =>
      resolveStickyProgressiveWhiteboardPreview({
        current,
        computed: computedProgressivePreview,
        retainWithoutComputed: shouldRetainProgressiveWhiteboardPreview({
          hasActiveWhiteboardCreateTool,
          hasUnfetchedCompletedWhiteboardCreateTool,
          hasLatestFailedWhiteboardCreateTool,
          isBusy,
        }),
      }),
    )
  }, [
    computedProgressivePreview,
    hasActiveWhiteboardCreateTool,
    hasLatestFailedWhiteboardCreateTool,
    hasUnfetchedCompletedWhiteboardCreateTool,
    isBusy,
  ])

  useEffect(() => {
    if (!objectID || completedWhiteboardCreateCount === 0) return
    void refetchObject()
  }, [completedWhiteboardCreateCount, refetchObject, objectID])

  useEffect(() => {
    setActiveWhiteboardBase((current) => {
      if (!hasActiveWhiteboardCreateTool) return undefined
      return current ?? { boardID }
    })
  }, [boardID, hasActiveWhiteboardCreateTool])

  useEffect(() => {
    // A kept-alive board belonging to another chat stays mounted; it must not keep polling.
    if (!surfaceActive) return
    if (
      !shouldPollWhiteboardDuringActiveCreate({
        objectID,
        hasActiveWhiteboardCreateTool,
      })
    ) {
      return
    }
    void refetchObject()
    const interval = window.setInterval(() => {
      void refetchObject()
    }, ACTIVE_WHITEBOARD_REFETCH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [hasActiveWhiteboardCreateTool, refetchObject, objectID, surfaceActive])

  useEffect(() => {
    const wasBusy = previousBusyRef.current
    previousBusyRef.current = isBusy
    if (!shouldRefetchWhiteboardAfterBusyChange({ objectID, wasBusy, isBusy })) return
    void refetchObject()
  }, [isBusy, refetchObject, objectID])

  useEffect(() => {
    const boardKey = `${objectID ?? ""}:${boardID ?? ""}`
    if (previousBoardKeyRef.current === undefined) {
      previousBoardKeyRef.current = boardKey
      return
    }
    if (previousBoardKeyRef.current === boardKey) return
    previousBoardKeyRef.current = boardKey
    setProgressivePreview(undefined)
    liveDraftBoardRef.current = undefined
  }, [boardID, objectID])

  const updateObjectData = useCallback(
    (data: ObjectWhiteboardObjectReadResponse) => {
      if (!objectID) return
      queryClient.setQueryData(whiteboardQueryKeys.object(directory, objectID), data)
    },
    [directory, queryClient, objectID],
  )

  const shareBoard = useCallback(async () => {
    if (!objectID || !displayedBoard || sharingBoard) return
    setSharingBoard(true)
    try {
      const saveSettlement = await settleLearnerSaveRef.current?.()
      const liveDraftBoard = liveDraftBoardRef.current
      if (
        (saveSettlement?.status === "save-error" || saveSettlement?.status === "still-saving") &&
        !liveDraftBoard
      ) {
        toast.error(WHITEBOARD_SHARE_SAVE_FAILED_MESSAGE)
        return
      }
      const refetched = await refetchObject()
      const boardToShare = resolveWhiteboardShareBoard({
        displayedBoard,
        liveDraftBoard,
        latestBoard: refetched.data?.currentBoard ?? null,
      })
      if (!boardToShare) return
      const json = await createWhiteboardShareJson(boardToShare)
      const result = requireBuddyData(
        await getBuddyClient(directory).objectWhiteboard.object.share.create({
          directory,
          objectID,
          json,
        }),
      )
      toast(WHITEBOARD_SHARE_OPENING_MESSAGE)
      platform.openLink(result.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSharingBoard(false)
    }
  }, [directory, displayedBoard, platform, refetchObject, objectID, sharingBoard])

  const registerLearnerSaveSettler = useCallback(
    (settle: (() => Promise<WhiteboardLearnerSaveSettlement>) | undefined) => {
      settleLearnerSaveRef.current = settle
    },
    [],
  )

  const guardWhiteboardLeave = useCallback(async (): Promise<BenchLeaveGuardResult> => {
    const settlement = await settleLearnerSaveRef.current?.()
    const result = resolveWhiteboardLeaveSettlement(settlement)
    if (result.status === "block" && result.reason === "saving") {
      toast.error(WHITEBOARD_SAVE_STILL_RUNNING_MESSAGE)
    }
    return result
  }, [])

  useEffect(() => {
    onLeaveGuardChange?.(guardWhiteboardLeave)
    return () => {
      onLeaveGuardChange?.(undefined)
    }
  }, [guardWhiteboardLeave, onLeaveGuardChange])

  const captureLiveViewport = useCallback(
    (viewport: WhiteboardViewport) => {
      liveViewportRef.current = {
        objectID,
        viewport,
      }
    },
    [objectID],
  )

  const captureLiveDraftBoard = useCallback((board: LiveWhiteboardBoard | undefined) => {
    liveDraftBoardRef.current = board
  }, [])

  const saveLearnerEdit = useCallback<WhiteboardLearnerSaveHandler>(
    async (input: {
      baseBoardID: string
      elements: PersistedWhiteboardElement[]
      viewport: WhiteboardViewport
    }) => {
      if (!objectID) {
        return { status: "failed" }
      }
      try {
        const result = await getBuddyClient(directory).objectWhiteboard.object.saveLearnerEdit({
          directory,
          objectID,
          baseBoardID: input.baseBoardID,
          elements: input.elements,
          viewport: input.viewport,
        })
        if (result.response?.status === 409) {
          await refetchObject()
          liveDraftBoardRef.current = undefined
          toast.error(WHITEBOARD_SAVE_CONFLICT_MESSAGE)
          return { status: "conflict" }
        }
        const data = requireBuddyData(result)
        updateObjectData(data)
        liveDraftBoardRef.current = undefined
        return data.currentBoard ? { status: "saved" } : { status: "failed" }
      } catch (error) {
        await refetchObject()
        toast.error(error instanceof Error ? error.message : String(error))
        return { status: "failed" }
      }
    },
    [directory, refetchObject, objectID, updateObjectData],
  )

  const saveRenderReport = useCallback(
    async (report: WhiteboardRenderReport) => {
      if (!objectID) return
      try {
        await getBuddyClient(directory).objectWhiteboard.object.renderReport.save({
          directory,
          objectID,
          ...report,
        })
      } catch {
        // Render feedback improves future model edits but should never surface as a save error.
      }
    },
    [directory, objectID],
  )

  const shareAction = useMemo(
    () => ({
      disabled: !objectID || !displayedBoard || sharingBoard || hasActiveWhiteboardCreateTool,
      isSharing: sharingBoard,
      onShare: () => {
        void shareBoard()
      },
    }),
    [displayedBoard, hasActiveWhiteboardCreateTool, objectID, shareBoard, sharingBoard],
  )
  return (
    <section
      data-component="whiteboard-pane"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base"
    >
      <div className="min-h-0 flex-1">
        {displayedBoard ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-xs text-text-weaker">
                Loading whiteboard...
              </div>
            }
          >
            <WhiteboardCanvas
              key={canvasKey}
              board={displayedBoard}
              viewportOverride={canvasViewport}
              renderReportKey={renderReportKey}
              readOnly={Boolean(progressivePreview) || hasActiveWhiteboardCreateTool}
              reportReadOnlyBoard={shouldUseFetchedBoardDuringActiveCreate}
              shareAction={shareAction}
              onViewportChange={captureLiveViewport}
              onSave={saveLearnerEdit}
              onLiveBoardChange={captureLiveDraftBoard}
              onSaveSettlerChange={registerLearnerSaveSettler}
              onRenderReport={saveRenderReport}
            />
          </Suspense>
        ) : showOpeningAnimation ? (
          // No copy: the diagram assembling itself already says a board is being drawn.
          <Suspense fallback={null}>
            <WhiteboardOpeningAnimation />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-weaker">
            Ask Buddy to draw on the whiteboard.
          </div>
        )}
      </div>
    </section>
  )
}

export {
  resolveWhiteboardCanvasKey,
  resolveWhiteboardCanvasViewport,
  resolveWhiteboardLeaveSettlement,
  resolveWhiteboardRenderReportKey,
  resolveWhiteboardShareBoard,
  shouldPollWhiteboardDuringActiveCreate,
  shouldPreferFetchedBoardDuringActiveCreate,
  shouldRetainProgressiveWhiteboardPreview,
  shouldRefetchWhiteboardAfterBusyChange,
  shouldShowWhiteboardOpeningAnimation,
}
