import { toast } from "@buddy/ui"
import type { ObjectWhiteboardSessionReadResponse } from "@buddy/sdk/types"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePlatform } from "@/context/platform"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { whiteboardQueryKeys, whiteboardSessionQueryOptions } from "./whiteboard-query"
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
import { createWhiteboardShareJson } from "./whiteboard-share"
import type { WhiteboardLearnerSaveHandler } from "./whiteboard-learner-save"
import type { MessageWithParts } from "@/state/chat-types"

const WhiteboardCanvas = lazy(async () => {
  const module = await import("./whiteboard-canvas")
  return { default: module.WhiteboardCanvas }
})

type WhiteboardPaneProps = {
  directory: string
  sessionID?: string
  isBusy: boolean
  messages: MessageWithParts[]
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

function resolveWhiteboardCanvasKey(input: { sessionID?: string }): string {
  return input.sessionID ?? WHITEBOARD_CANVAS_EMPTY_KEY
}

function resolveWhiteboardCanvasViewport(input: {
  sessionID?: string
  liveViewport?: {
    sessionID?: string
    viewport: WhiteboardViewport
  }
  boardViewport?: WhiteboardViewport
}): WhiteboardViewport | undefined {
  const liveViewport = input.liveViewport
  if (liveViewport && liveViewport.sessionID === input.sessionID) {
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

function shouldRefetchWhiteboardAfterBusyChange(input: {
  sessionID?: string
  wasBusy: boolean
  isBusy: boolean
}): boolean {
  return Boolean(input.sessionID && input.wasBusy && !input.isBusy)
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
  sessionID?: string
  hasActiveWhiteboardCreateTool: boolean
}): boolean {
  return Boolean(input.sessionID && input.hasActiveWhiteboardCreateTool)
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
  const { directory, sessionID, isBusy, messages } = props
  const platform = usePlatform()
  const queryClient = useQueryClient()
  const [sharingBoard, setSharingBoard] = useState(false)
  const [activeWhiteboardBase, setActiveWhiteboardBase] = useState<ActiveWhiteboardBase>()
  // Canvas edits are transient share/save input. Keeping them outside render state prevents an
  // Excalidraw text-submit from synchronously rerendering the editor during its own cleanup.
  const liveDraftBoardRef = useRef<LiveWhiteboardBoard>()
  const liveViewportRef = useRef<{
    sessionID?: string
    viewport: WhiteboardViewport
  }>()
  const previousBoardKeyRef = useRef<string>()
  const previousBusyRef = useRef(isBusy)
  const settleLearnerSaveRef = useRef<() => Promise<boolean>>()
  const sessionQuery = useQuery({
    ...whiteboardSessionQueryOptions(directory, sessionID ?? ""),
    enabled: Boolean(sessionID),
  })
  const refetchSession = sessionQuery.refetch
  const currentBoard = sessionQuery.data?.currentBoard ?? undefined
  const boardID = currentBoard?.boardID
  const computedProgressivePreview = useMemo(
    () =>
      buildProgressiveWhiteboardPreviewFromMessages({
        messages,
        baseBoardID: boardID,
        baseElements: currentBoard?.elements ?? [],
        ...(currentBoard?.viewport ? { baseViewport: currentBoard.viewport } : {}),
      }),
    [boardID, currentBoard?.elements, currentBoard?.viewport, messages],
  )
  const completedWhiteboardCreateCount = useMemo(
    () => countCompletedWhiteboardCreate(messages),
    [messages],
  )
  const hasActiveWhiteboardCreateTool = useMemo(
    () => hasActiveWhiteboardCreate(messages),
    [messages],
  )
  const hasUnfetchedCompletedWhiteboardCreateTool = useMemo(
    () =>
      hasUnfetchedCompletedWhiteboardCreate({
        messages,
        baseBoardID: boardID,
      }),
    [boardID, messages],
  )
  const hasLatestFailedWhiteboardCreateTool = useMemo(
    () => hasLatestFailedWhiteboardCreate(messages),
    [messages],
  )
  const [progressivePreview, setProgressivePreview] = useState<ProgressiveWhiteboardPreview>()
  const shouldUseFetchedBoardDuringActiveCreate = shouldPreferFetchedBoardDuringActiveCreate({
    activeBase: activeWhiteboardBase,
    currentBoardID: currentBoard?.boardID,
    hasActiveWhiteboardCreateTool,
  })
  const displayedBoard = useMemo(() => {
    if (currentBoard && progressivePreview && !shouldUseFetchedBoardDuringActiveCreate) {
      return {
        ...currentBoard,
        elements: progressivePreview.elements,
        ...(progressivePreview.viewport ? { viewport: progressivePreview.viewport } : {}),
      }
    }
    if (currentBoard) return currentBoard
    if (!progressivePreview) return undefined
    return {
      elements: progressivePreview.elements,
      ...(progressivePreview.viewport ? { viewport: progressivePreview.viewport } : {}),
    }
  }, [currentBoard, progressivePreview, shouldUseFetchedBoardDuringActiveCreate])
  const canvasKey = resolveWhiteboardCanvasKey({
    sessionID,
  })
  const canvasViewport = resolveWhiteboardCanvasViewport({
    sessionID,
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
    if (!sessionID || completedWhiteboardCreateCount === 0) return
    void refetchSession()
  }, [completedWhiteboardCreateCount, refetchSession, sessionID])

  useEffect(() => {
    setActiveWhiteboardBase((current) => {
      if (!hasActiveWhiteboardCreateTool) return undefined
      return current ?? { boardID }
    })
  }, [boardID, hasActiveWhiteboardCreateTool])

  useEffect(() => {
    if (
      !shouldPollWhiteboardDuringActiveCreate({
        sessionID,
        hasActiveWhiteboardCreateTool,
      })
    ) {
      return
    }
    void refetchSession()
    const interval = window.setInterval(() => {
      void refetchSession()
    }, ACTIVE_WHITEBOARD_REFETCH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [hasActiveWhiteboardCreateTool, refetchSession, sessionID])

  useEffect(() => {
    const wasBusy = previousBusyRef.current
    previousBusyRef.current = isBusy
    if (!shouldRefetchWhiteboardAfterBusyChange({ sessionID, wasBusy, isBusy })) return
    void refetchSession()
  }, [isBusy, refetchSession, sessionID])

  useEffect(() => {
    const boardKey = `${sessionID ?? ""}:${boardID ?? ""}`
    if (previousBoardKeyRef.current === undefined) {
      previousBoardKeyRef.current = boardKey
      return
    }
    if (previousBoardKeyRef.current === boardKey) return
    previousBoardKeyRef.current = boardKey
    setProgressivePreview(undefined)
    liveDraftBoardRef.current = undefined
  }, [boardID, sessionID])

  const updateSessionData = useCallback(
    (data: ObjectWhiteboardSessionReadResponse) => {
      if (!sessionID) return
      queryClient.setQueryData(whiteboardQueryKeys.session(directory, sessionID), data)
    },
    [directory, queryClient, sessionID],
  )

  const shareBoard = useCallback(async () => {
    if (!sessionID || !displayedBoard || sharingBoard) return
    setSharingBoard(true)
    try {
      const saveSettled = await settleLearnerSaveRef.current?.()
      const liveDraftBoard = liveDraftBoardRef.current
      if (saveSettled === false && !liveDraftBoard) {
        toast.error(WHITEBOARD_SHARE_SAVE_FAILED_MESSAGE)
        return
      }
      const refetched = await refetchSession()
      const boardToShare = resolveWhiteboardShareBoard({
        displayedBoard,
        liveDraftBoard,
        latestBoard: refetched.data?.currentBoard ?? null,
      })
      if (!boardToShare) return
      const json = await createWhiteboardShareJson(boardToShare)
      const result = requireBuddyData(
        await getBuddyClient(directory).objectWhiteboard.session.share.create({
          directory,
          sessionID,
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
  }, [directory, displayedBoard, platform, refetchSession, sessionID, sharingBoard])

  const registerLearnerSaveSettler = useCallback((settle: (() => Promise<boolean>) | undefined) => {
    settleLearnerSaveRef.current = settle
  }, [])

  const captureLiveViewport = useCallback(
    (viewport: WhiteboardViewport) => {
      liveViewportRef.current = {
        sessionID,
        viewport,
      }
    },
    [sessionID],
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
      if (!sessionID) {
        return { status: "skipped" }
      }
      try {
        const result = await getBuddyClient(directory).objectWhiteboard.session.saveLearnerEdit({
          directory,
          sessionID,
          baseBoardID: input.baseBoardID,
          elements: input.elements,
          viewport: input.viewport,
        })
        if (result.response?.status === 409) {
          await refetchSession()
          liveDraftBoardRef.current = undefined
          return { status: "skipped" }
        }
        const data = requireBuddyData(result)
        updateSessionData(data)
        liveDraftBoardRef.current = undefined
        return data.currentBoard ? { status: "saved" } : { status: "failed" }
      } catch (error) {
        await refetchSession()
        toast.error(error instanceof Error ? error.message : String(error))
        return { status: "failed" }
      }
    },
    [directory, refetchSession, sessionID, updateSessionData],
  )

  const saveRenderReport = useCallback(
    async (report: WhiteboardRenderReport) => {
      if (!sessionID) return
      try {
        await getBuddyClient(directory).objectWhiteboard.session.renderReport.save({
          directory,
          sessionID,
          ...report,
        })
      } catch {
        // Render feedback improves future model edits but should never surface as a save error.
      }
    },
    [directory, sessionID],
  )

  const shareAction = useMemo(
    () => ({
      disabled: !sessionID || !displayedBoard || sharingBoard || hasActiveWhiteboardCreateTool,
      isSharing: sharingBoard,
      onShare: () => {
        void shareBoard()
      },
    }),
    [displayedBoard, hasActiveWhiteboardCreateTool, sessionID, shareBoard, sharingBoard],
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
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-weaker">
            {isBusy ? "Opening whiteboard..." : "Ask Buddy to draw on the whiteboard."}
          </div>
        )}
      </div>
    </section>
  )
}

export {
  resolveWhiteboardCanvasKey,
  resolveWhiteboardCanvasViewport,
  resolveWhiteboardRenderReportKey,
  resolveWhiteboardShareBoard,
  shouldPollWhiteboardDuringActiveCreate,
  shouldPreferFetchedBoardDuringActiveCreate,
  shouldRetainProgressiveWhiteboardPreview,
  shouldRefetchWhiteboardAfterBusyChange,
}
