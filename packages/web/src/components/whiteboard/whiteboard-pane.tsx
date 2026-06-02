import { Button } from "@buddy/ui"
import type { WhiteboardsReadResponse } from "@buddy/sdk"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ExternalLinkIcon, PresentationIcon } from "lucide-react"
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

const WHITEBOARD_CANVAS_EMPTY_KEY = "empty"

function resolveWhiteboardCanvasKey(input: {
  sessionID?: string
}): string {
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
  const [saveError, setSaveError] = useState<string>()
  const [shareStatus, setShareStatus] = useState<string>()
  const [liveDraftBoard, setLiveDraftBoard] = useState<LiveWhiteboardBoard>()
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
  const displayedBoard = useMemo(() => {
    if (currentBoard && progressivePreview) {
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
  }, [currentBoard, progressivePreview])
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
    setLiveDraftBoard(undefined)
    setSaveError(undefined)
    setShareStatus(undefined)
  }, [boardID, sessionID])

  const updateSessionData = useCallback(
    (data: WhiteboardsReadResponse) => {
      if (!sessionID) return
      queryClient.setQueryData(whiteboardQueryKeys.session(directory, sessionID), data)
    },
    [directory, queryClient, sessionID],
  )

  const shareBoard = useCallback(async () => {
    if (!sessionID || !displayedBoard || sharingBoard) return
    setSharingBoard(true)
    setSaveError(undefined)
    setShareStatus(undefined)
    try {
      const saveSettled = await settleLearnerSaveRef.current?.()
      if (saveSettled === false && !liveDraftBoard) {
        setSaveError("The pending whiteboard edit did not save. Try sharing again after it saves.")
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
        await getBuddyClient(directory).whiteboards.share.create({
          sessionID,
          json,
        }),
      )
      setShareStatus("Opening shared board...")
      platform.openLink(result.url)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSharingBoard(false)
    }
  }, [
    directory,
    displayedBoard,
    liveDraftBoard,
    platform,
    refetchSession,
    sessionID,
    sharingBoard,
  ])

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

  const saveLearnerEdit = useCallback<WhiteboardLearnerSaveHandler>(
    async (input: {
      baseBoardID: string
      elements: PersistedWhiteboardElement[]
      viewport: WhiteboardViewport
    }) => {
      if (!sessionID) {
        return { status: "skipped" }
      }
      setSaveError(undefined)
      setShareStatus(undefined)
      try {
        const result = await getBuddyClient(directory).whiteboards.saveLearnerEdit({
          sessionID,
          baseBoardID: input.baseBoardID,
          elements: input.elements,
          viewport: input.viewport,
        })
        if (result.response?.status === 409) {
          await refetchSession()
          setLiveDraftBoard(undefined)
          return { status: "skipped" }
        }
        const data = requireBuddyData(result)
        updateSessionData(data)
        setLiveDraftBoard(undefined)
        return data.currentBoard
          ? { status: "saved" }
          : { status: "failed" }
      } catch (error) {
        await refetchSession()
        setSaveError(error instanceof Error ? error.message : String(error))
        return { status: "failed" }
      }
    },
    [directory, refetchSession, sessionID, updateSessionData],
  )

  const saveRenderReport = useCallback(
    async (report: WhiteboardRenderReport) => {
      if (!sessionID) return
      try {
        await getBuddyClient(directory).whiteboards.renderReport.save({
          sessionID,
          ...report,
        })
      } catch {
        // Render feedback improves future model edits but should never surface as a save error.
      }
    },
    [directory, sessionID],
  )

  const boardStatus = displayedBoard ? "Current board" : undefined

  return (
    <section
      data-component="whiteboard-pane"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-background-base"
    >
      <header className="flex min-h-10 items-center gap-2 border-b border-border-base/60 bg-background-stronger/95 px-2.5">
        <PresentationIcon className="size-4 text-text-interactive-base" />
        <span className="text-xs font-medium text-text-base">Whiteboard</span>
        <span
          className={`min-w-0 flex-1 truncate text-[11px] ${
            saveError ? "text-icon-critical-base" : "text-text-weaker"
          }`}
        >
          {saveError ?? shareStatus ?? boardStatus}
        </span>
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={!sessionID || !displayedBoard || sharingBoard || hasActiveWhiteboardCreateTool}
          title="Upload the encrypted board to excalidraw.com and open the share link"
          onClick={() => void shareBoard()}
        >
          <ExternalLinkIcon />
          {sharingBoard ? "Sharing..." : "Share board"}
        </Button>
      </header>
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
              readOnly={Boolean(progressivePreview)}
              onViewportChange={captureLiveViewport}
              onSave={saveLearnerEdit}
              onLiveBoardChange={setLiveDraftBoard}
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
  shouldRetainProgressiveWhiteboardPreview,
  shouldRefetchWhiteboardAfterBusyChange,
}
