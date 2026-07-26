import "@excalidraw/excalidraw/index.css"

import { Button, Skeleton } from "@buddy/ui"
import { useDelayedPendingVisible } from "@/components/bench/bench-surface-pending"
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  FONT_FAMILY,
  getCommonBounds,
  restore,
  zoomToFitBounds,
} from "@excalidraw/excalidraw"
import type { SceneBounds } from "@excalidraw/excalidraw/element/bounds"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import { LinkIcon, Loader2Icon } from "@/icons/app-icons"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "@/theme"
import {
  createWhiteboardRenderReport,
  elementVersionSignature,
  resolveWhiteboardRemoteSceneUpdate,
  resolveWhiteboardRemoteSceneViewport,
  resolveWhiteboardViewportFromAppState,
  toEditorElementConversion,
  toPersistedElements,
  viewportToAppState,
  whiteboardRenderReportSignature,
  type WhiteboardElementPreparation,
  type PersistedWhiteboardElement,
  type WhiteboardRenderReport,
  type WhiteboardViewport,
} from "./whiteboard-elements"
import {
  createWhiteboardLearnerSaveScheduler,
  type WhiteboardLearnerSaveHandler,
  type WhiteboardLearnerSaveSettlement,
} from "./whiteboard-learner-save"

const LEARNER_EDIT_DEBOUNCE_MS = 2_000
const WHITEBOARD_CANVAS_REFRESH_FRAME_COUNT = 2
const WHITEBOARD_CANVAS_POST_SETTLE_REFRESH_DELAY_MS = 260
const WHITEBOARD_FONT_LOADS = [
  "20px Excalifont",
  "400 16px Assistant",
  "500 16px Assistant",
  "700 16px Assistant",
] as const
const WHITEBOARD_EXCALIDRAW_UI_OPTIONS = {
  canvasActions: {
    saveToActiveFile: false,
    loadScene: false,
    export: false,
    toggleTheme: false,
  },
  tools: {
    image: false,
  },
} as const

/** Hide stock chrome pieces we do not want on the bench whiteboard. */
const WHITEBOARD_CANVAS_CSS = `
[data-component="whiteboard-canvas"] .default-sidebar-trigger {
  display: none !important;
}

/* Align Buddy share control with the stock top-right chrome slot (where Library sat). */
[data-component="whiteboard-canvas"] .layer-ui__wrapper__top-right {
  align-items: flex-start;
}

/*
 * Stock menu wraps social links in a group, with a separator above and below.
 * Hide the group and both adjacent bare separator divs so we don't leave double rules.
 */
[data-component="whiteboard-canvas"] .dropdown-menu > div:has(+ .dropdown-menu-group),
[data-component="whiteboard-canvas"] .dropdown-menu .dropdown-menu-group,
[data-component="whiteboard-canvas"] .dropdown-menu .dropdown-menu-group + div {
  display: none !important;
}
`

let whiteboardFontsReadyPromise: Promise<void> | undefined

type RestoredViewportAppState = Pick<AppState, "scrollX" | "scrollY" | "zoom">

type WhiteboardCanvasShareAction = {
  disabled: boolean
  isSharing: boolean
  onShare: () => void
}

type WhiteboardCanvasProps = {
  board: {
    elements: PersistedWhiteboardElement[]
    viewport?: WhiteboardViewport
    boardID?: string
  }
  viewportOverride?: WhiteboardViewport
  renderReportKey?: string
  readOnly: boolean
  reportReadOnlyBoard?: boolean
  shareAction?: WhiteboardCanvasShareAction
  onSave: WhiteboardLearnerSaveHandler
  onViewportChange?: (viewport: WhiteboardViewport) => void
  onLiveBoardChange?: (
    board:
      | {
          elements: PersistedWhiteboardElement[]
          viewport: WhiteboardViewport
        }
      | undefined,
  ) => void
  onSaveSettlerChange?: (
    settle: (() => Promise<WhiteboardLearnerSaveSettlement>) | undefined,
  ) => void
  onRenderReport?: (report: WhiteboardRenderReport) => void
}

function viewportBounds(viewport: WhiteboardViewport): SceneBounds {
  return [viewport.x, viewport.y, viewport.x + viewport.width, viewport.y + viewport.height]
}

function loadWhiteboardFonts(): Promise<void> {
  if (whiteboardFontsReadyPromise) return whiteboardFontsReadyPromise
  whiteboardFontsReadyPromise = Promise.all(
    WHITEBOARD_FONT_LOADS.map(async (font) => {
      await document.fonts.load(font)
    }),
  )
    .then(async () => {
      await document.fonts.ready
    })
    .catch(() => {})
  return whiteboardFontsReadyPromise
}

function prepareConvertedElements(
  elements: OrderedExcalidrawElement[],
): OrderedExcalidrawElement[] {
  const normalized = elements.map((element) =>
    element.type === "text"
      ? {
          ...element,
          fontFamily: FONT_FAMILY.Excalifont,
        }
      : element,
  )
  return restore({ elements: normalized, files: {} }, null, null, { refreshDimensions: true })
    .elements
}

function convertPreparedElements(
  prepared: WhiteboardElementPreparation,
): OrderedExcalidrawElement[] {
  return prepared.groups.flatMap((group) => {
    if (group.kind === "native") return group.elements
    return convertToExcalidrawElements(group.elements, {
      regenerateIds: false,
    })
  })
}

function viewportToInitialAppState(
  viewport: WhiteboardViewport,
): Pick<AppState, "scrollX" | "scrollY"> {
  const restored = viewportToAppState(viewport)
  return {
    scrollX: restored.scrollX,
    scrollY: restored.scrollY,
  }
}

function viewportToRestoredAppState(
  viewport: WhiteboardViewport,
  currentAppState: AppState,
): RestoredViewportAppState {
  const restored = viewportToAppState(viewport, currentAppState)
  const fitted = zoomToFitBounds({
    bounds: viewportBounds(viewport),
    appState: currentAppState,
    fitToViewport: true,
    minZoom: restored.zoomValue,
    maxZoom: restored.zoomValue,
  })
  return {
    scrollX: restored.scrollX,
    scrollY: restored.scrollY,
    zoom: fitted.appState.zoom,
  }
}

/**
 * Covers the canvas while fonts load and the scene settles.
 *
 * The cover is opaque from the first frame so a half-drawn canvas never shows, but it stays
 * wordless until the settle is slow enough to be worth acknowledging. Most settles finish in a
 * couple of frames, and a line of text flashing through them read as a glitch, not progress.
 */
function WhiteboardCanvasSettlingCover() {
  const acknowledged = useDelayedPendingVisible()

  return (
    <div
      data-component="whiteboard-canvas-settling"
      className="absolute inset-0 z-10 flex items-center justify-center bg-background-base"
      role="status"
      aria-busy
    >
      {acknowledged ? <Skeleton className="h-full w-full" /> : null}
    </div>
  )
}

export const WhiteboardCanvas = memo(function WhiteboardCanvas(props: WhiteboardCanvasProps) {
  const { mode } = useTheme()
  const onSaveSettlerChange = props.onSaveSettlerChange
  const [fontsReady, setFontsReady] = useState(false)
  const [canvasSettled, setCanvasSettled] = useState(false)
  const apiRef = useRef<ExcalidrawImperativeAPI>()
  const autosaveReadyRef = useRef(false)
  const baselineRef = useRef("")
  const viewportRef = useRef(props.viewportOverride ?? props.board.viewport)
  const saveRef = useRef(props.onSave)
  const liveBoardChangeRef = useRef(props.onLiveBoardChange)
  const renderReportRef = useRef(props.onRenderReport)
  const viewportChangeRef = useRef(props.onViewportChange)
  const readOnlyRef = useRef(props.readOnly)
  const previousReadOnlyRef = useRef(props.readOnly)
  const reportReadOnlyBoardRef = useRef(props.reportReadOnlyBoard ?? false)
  const fontsReadyRef = useRef(false)
  const boardIDRef = useRef(props.board.boardID)
  const pendingBoardIDRef = useRef(props.board.boardID)
  const lastRenderReportSignatureRef = useRef<string>()
  const pendingInitialViewportFrameRef = useRef<number>()
  const initialViewportScenePendingRef = useRef(false)
  const pendingInitialSceneFrameRef = useRef<number>()
  const pendingCanvasRefreshFrameRef = useRef<number>()
  const pendingPostSettleRefreshTimeoutRef = useRef<number>()
  const pendingRenderReportFrameRef = useRef<number>()
  const remoteSceneUpdateDepthRef = useRef(0)
  const saveSchedulerRef = useRef(
    createWhiteboardLearnerSaveScheduler({ delayMs: LEARNER_EDIT_DEBOUNCE_MS }),
  )
  const conversion = useMemo<{
    elements: OrderedExcalidrawElement[]
    warning?: string
  }>(() => {
    if (!fontsReady) return { elements: [] }
    const prepared = toEditorElementConversion(props.board.elements)
    try {
      const converted = prepareConvertedElements(convertPreparedElements(prepared))
      return {
        elements: converted,
        ...(prepared.warning ? { warning: prepared.warning } : {}),
      }
    } catch (error) {
      return {
        elements: [],
        warning: `Whiteboard rendering skipped invalid element data: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }, [fontsReady, props.board.elements])
  const elements = conversion.elements
  const viewport = props.viewportOverride ?? props.board.viewport
  const initialData = useMemo(
    () => ({
      elements,
      appState: viewport ? viewportToInitialAppState(viewport) : undefined,
    }),
    [elements, viewport],
  )

  const cancelPendingInitialSceneFrame = useCallback(() => {
    if (pendingInitialSceneFrameRef.current === undefined) return
    window.cancelAnimationFrame(pendingInitialSceneFrameRef.current)
    pendingInitialSceneFrameRef.current = undefined
  }, [])

  const cancelPendingInitialViewportFrame = useCallback(() => {
    if (pendingInitialViewportFrameRef.current === undefined) return
    window.cancelAnimationFrame(pendingInitialViewportFrameRef.current)
    pendingInitialViewportFrameRef.current = undefined
    initialViewportScenePendingRef.current = false
  }, [])

  const cancelPendingCanvasRefreshFrame = useCallback(() => {
    if (pendingCanvasRefreshFrameRef.current === undefined) return
    window.cancelAnimationFrame(pendingCanvasRefreshFrameRef.current)
    pendingCanvasRefreshFrameRef.current = undefined
  }, [])

  const cancelPendingPostSettleRefresh = useCallback(() => {
    if (pendingPostSettleRefreshTimeoutRef.current === undefined) return
    window.clearTimeout(pendingPostSettleRefreshTimeoutRef.current)
    pendingPostSettleRefreshTimeoutRef.current = undefined
  }, [])

  const cancelPendingRenderReportFrame = useCallback(() => {
    if (pendingRenderReportFrameRef.current === undefined) return
    window.cancelAnimationFrame(pendingRenderReportFrameRef.current)
    pendingRenderReportFrameRef.current = undefined
  }, [])

  const scheduleRenderReport = useCallback(() => {
    const canReportReadOnlyBoard = !readOnlyRef.current || reportReadOnlyBoardRef.current
    if (!renderReportRef.current || !fontsReadyRef.current || !canReportReadOnlyBoard) return
    cancelPendingRenderReportFrame()
    pendingRenderReportFrameRef.current = window.requestAnimationFrame(() => {
      pendingRenderReportFrameRef.current = undefined
      const api = apiRef.current
      const boardID = boardIDRef.current
      const onRenderReport = renderReportRef.current
      const canReportCurrentBoard = !readOnlyRef.current || reportReadOnlyBoardRef.current
      if (!api || !boardID || !onRenderReport || !fontsReadyRef.current || !canReportCurrentBoard) {
        return
      }
      const report = createWhiteboardRenderReport({
        boardID,
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        readBounds: getCommonBounds,
      })
      if (!report) return
      const signature = whiteboardRenderReportSignature(report)
      if (signature === lastRenderReportSignatureRef.current) return
      lastRenderReportSignatureRef.current = signature
      onRenderReport(report)
    })
  }, [cancelPendingRenderReportFrame])

  const settleScene = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      cancelPendingInitialSceneFrame()
      cancelPendingCanvasRefreshFrame()
      cancelPendingPostSettleRefresh()
      const nextBoardID = pendingBoardIDRef.current
      const refreshVisibleCanvas = () => {
        if (apiRef.current !== api || pendingBoardIDRef.current !== nextBoardID) return
        api.refresh()
        scheduleRenderReport()
      }
      const completeSettle = () => {
        if (apiRef.current !== api || pendingBoardIDRef.current !== nextBoardID) return
        baselineRef.current = elementVersionSignature(api.getSceneElements())
        boardIDRef.current = nextBoardID
        autosaveReadyRef.current = !readOnlyRef.current
        const settledViewport = resolveWhiteboardViewportFromAppState(api.getAppState())
        if (settledViewport) viewportChangeRef.current?.(settledViewport)
        setCanvasSettled(true)
        scheduleRenderReport()
        pendingPostSettleRefreshTimeoutRef.current = window.setTimeout(() => {
          pendingPostSettleRefreshTimeoutRef.current = undefined
          pendingCanvasRefreshFrameRef.current = window.requestAnimationFrame(() => {
            pendingCanvasRefreshFrameRef.current = undefined
            refreshVisibleCanvas()
          })
        }, WHITEBOARD_CANVAS_POST_SETTLE_REFRESH_DELAY_MS)
      }
      const scheduleRefreshFrame = (framesRemaining: number) => {
        pendingCanvasRefreshFrameRef.current = window.requestAnimationFrame(() => {
          pendingCanvasRefreshFrameRef.current = undefined
          if (apiRef.current !== api || pendingBoardIDRef.current !== nextBoardID) return
          if (framesRemaining > 1) {
            scheduleRefreshFrame(framesRemaining - 1)
            return
          }
          api.refresh()
          pendingCanvasRefreshFrameRef.current = window.requestAnimationFrame(() => {
            pendingCanvasRefreshFrameRef.current = undefined
            completeSettle()
          })
        })
      }
      pendingInitialSceneFrameRef.current = window.requestAnimationFrame(() => {
        pendingInitialSceneFrameRef.current = undefined
        if (apiRef.current !== api || pendingBoardIDRef.current !== nextBoardID) return
        scheduleRefreshFrame(WHITEBOARD_CANVAS_REFRESH_FRAME_COUNT)
      })
    },
    [
      cancelPendingCanvasRefreshFrame,
      cancelPendingInitialSceneFrame,
      cancelPendingPostSettleRefresh,
      scheduleRenderReport,
    ],
  )

  const applySceneToApi = useCallback(
    (
      api: ExcalidrawImperativeAPI,
      nextElements: OrderedExcalidrawElement[],
      phase: "initial-mount" | "mounted-update",
    ) => {
      const viewport = resolveWhiteboardRemoteSceneViewport({
        phase,
        ...(viewportRef.current ? { viewport: viewportRef.current } : {}),
      })
      const appState = viewport
        ? viewportToRestoredAppState(viewport, api.getAppState())
        : undefined
      remoteSceneUpdateDepthRef.current += 1
      try {
        api.updateScene({
          elements: nextElements,
          ...(appState ? { appState } : {}),
          captureUpdate: CaptureUpdateAction.NEVER,
        })
      } finally {
        window.requestAnimationFrame(() => {
          remoteSceneUpdateDepthRef.current = Math.max(0, remoteSceneUpdateDepthRef.current - 1)
        })
      }
    },
    [],
  )

  useEffect(() => {
    let mounted = true
    void loadWhiteboardFonts().then(() => {
      if (mounted) setFontsReady(true)
    })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    saveRef.current = props.onSave
  }, [props.onSave])

  useEffect(() => {
    liveBoardChangeRef.current = props.onLiveBoardChange
  }, [props.onLiveBoardChange])

  useEffect(() => {
    renderReportRef.current = props.onRenderReport
  }, [props.onRenderReport])

  useEffect(() => {
    viewportChangeRef.current = props.onViewportChange
  }, [props.onViewportChange])

  useEffect(() => {
    readOnlyRef.current = props.readOnly
    if (props.readOnly) {
      autosaveReadyRef.current = false
      void saveSchedulerRef.current.flush()
    }
  }, [props.readOnly])

  useEffect(() => {
    reportReadOnlyBoardRef.current = props.reportReadOnlyBoard ?? false
    scheduleRenderReport()
  }, [props.reportReadOnlyBoard, scheduleRenderReport])

  useEffect(() => {
    fontsReadyRef.current = fontsReady
  }, [fontsReady])

  useEffect(() => {
    pendingBoardIDRef.current = props.board.boardID
    autosaveReadyRef.current = false
    lastRenderReportSignatureRef.current = undefined
    liveBoardChangeRef.current?.(undefined)
  }, [props.board.boardID])

  useEffect(() => {
    lastRenderReportSignatureRef.current = undefined
    scheduleRenderReport()
  }, [props.renderReportKey, scheduleRenderReport])

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const settleSaves = useCallback(() => saveSchedulerRef.current.flush(), [])

  useEffect(() => {
    onSaveSettlerChange?.(settleSaves)
    return () => {
      onSaveSettlerChange?.(undefined)
    }
  }, [onSaveSettlerChange, settleSaves])

  useEffect(
    () => () => {
      cancelPendingInitialViewportFrame()
      cancelPendingInitialSceneFrame()
      cancelPendingCanvasRefreshFrame()
      cancelPendingPostSettleRefresh()
      cancelPendingRenderReportFrame()
      autosaveReadyRef.current = false
      apiRef.current = undefined
      void saveSchedulerRef.current.flush()
    },
    [
      cancelPendingInitialSceneFrame,
      cancelPendingInitialViewportFrame,
      cancelPendingCanvasRefreshFrame,
      cancelPendingPostSettleRefresh,
      cancelPendingRenderReportFrame,
    ],
  )

  useEffect(() => {
    baselineRef.current = elementVersionSignature(elements)
    const wasReadOnly = previousReadOnlyRef.current
    previousReadOnlyRef.current = props.readOnly
    const api = apiRef.current
    if (!api) return
    if (initialViewportScenePendingRef.current) return
    const currentElements = api.getSceneElements()
    const remoteSceneUpdate = resolveWhiteboardRemoteSceneUpdate({
      currentElementSignature: elementVersionSignature(currentElements),
      nextElementSignature: baselineRef.current,
      wasReadOnly,
      isReadOnly: props.readOnly,
    })
    if (remoteSceneUpdate.shouldApply) {
      // Excalidraw can emit delayed onChange callbacks after updateScene. Keep autosave disarmed
      // until settleScene captures the normalized scene as the new learner-edit baseline.
      autosaveReadyRef.current = false
      applySceneToApi(
        api,
        remoteSceneUpdate.preserveCurrentElements ? [...currentElements] : elements,
        "mounted-update",
      )
    }
    if (props.readOnly) {
      if (props.reportReadOnlyBoard) {
        settleScene(api)
      }
      return
    }
    void saveSchedulerRef.current.flush()
    settleScene(api)
  }, [applySceneToApi, elements, props.readOnly, props.reportReadOnlyBoard, settleScene])

  const setApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api
      setCanvasSettled(false)
      cancelPendingInitialViewportFrame()
      if (viewportRef.current) {
        initialViewportScenePendingRef.current = true
        const nextBoardID = pendingBoardIDRef.current
        pendingInitialViewportFrameRef.current = window.requestAnimationFrame(() => {
          pendingInitialViewportFrameRef.current = undefined
          initialViewportScenePendingRef.current = false
          if (apiRef.current !== api || pendingBoardIDRef.current !== nextBoardID) return
          applySceneToApi(api, [...api.getSceneElements()], "initial-mount")
          settleScene(api)
        })
        return
      }
      settleScene(api)
    },
    [applySceneToApi, cancelPendingInitialViewportFrame, settleScene],
  )

  const handleChange = useCallback(
    (nextElements: readonly OrderedExcalidrawElement[], appState: AppState) => {
      if (remoteSceneUpdateDepthRef.current > 0) return
      const viewport = resolveWhiteboardViewportFromAppState(appState)
      if (!viewport) return
      viewportChangeRef.current?.(viewport)
      if (readOnlyRef.current) return
      if (!autosaveReadyRef.current) return
      const signature = elementVersionSignature(nextElements)
      if (signature === baselineRef.current) return
      const baseBoardID = boardIDRef.current
      if (!baseBoardID) return
      const liveElements = toPersistedElements(nextElements)
      saveSchedulerRef.current.schedule({
        save: saveRef.current,
        baseBoardID,
        elements: liveElements,
        viewport,
      })
      liveBoardChangeRef.current?.({
        elements: liveElements,
        viewport,
      })
    },
    [],
  )

  const shareDisabled = props.shareAction?.disabled
  const shareIsSharing = props.shareAction?.isSharing
  const onShare = props.shareAction?.onShare
  const renderTopRightUI = useCallback(() => {
    if (!onShare) return null
    return (
      <div data-component="whiteboard-share-action" className="pointer-events-auto">
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          disabled={Boolean(shareDisabled)}
          aria-label={shareIsSharing ? "Sharing board" : "Share board"}
          title="Upload the encrypted board to excalidraw.com and open the share link"
          onClick={onShare}
        >
          {shareIsSharing ? (
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
          ) : (
            <LinkIcon className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    )
  }, [onShare, shareDisabled, shareIsSharing])

  return (
    <div data-component="whiteboard-canvas" className="relative h-full w-full overflow-hidden">
      <style>{WHITEBOARD_CANVAS_CSS}</style>
      {!fontsReady || !canvasSettled ? (
        <WhiteboardCanvasSettlingCover />
      ) : null}
      {conversion.warning ? (
        <div className="absolute top-3 left-3 z-10 max-w-md rounded-md border border-border-warning-base/60 bg-surface-warning-weak/95 px-3 py-2 text-xs text-text-base shadow-sm">
          {conversion.warning}
        </div>
      ) : null}
      {fontsReady ? (
        <div className="h-full w-full">
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={initialData}
            onChange={handleChange}
            theme={mode}
            viewModeEnabled={props.readOnly}
            UIOptions={WHITEBOARD_EXCALIDRAW_UI_OPTIONS}
            renderTopRightUI={renderTopRightUI}
          />
        </div>
      ) : null}
    </div>
  )
})
