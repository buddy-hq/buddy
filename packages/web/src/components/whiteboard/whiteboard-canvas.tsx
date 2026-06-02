import "@excalidraw/excalidraw/index.css"

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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "@/theme"
import {
  createWhiteboardRenderReport,
  elementVersionSignature,
  resolveWhiteboardRemoteSceneViewport,
  toEditorElementConversion,
  toPersistedElements,
  viewportFromAppState,
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
} from "./whiteboard-learner-save"

const LEARNER_EDIT_DEBOUNCE_MS = 2_000
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
let whiteboardFontsReadyPromise: Promise<void> | undefined

type RestoredViewportAppState = Pick<AppState, "scrollX" | "scrollY" | "zoom">

type WhiteboardCanvasProps = {
  board: {
    elements: PersistedWhiteboardElement[]
    viewport?: WhiteboardViewport
    boardID?: string
  }
  viewportOverride?: WhiteboardViewport
  renderReportKey?: string
  readOnly: boolean
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
  onSaveSettlerChange?: (settle: (() => Promise<boolean>) | undefined) => void
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
  return prepared.groups.flatMap((group) =>
    group.kind === "native"
      ? group.elements
      : convertToExcalidrawElements(group.elements, {
          regenerateIds: false,
        }),
  )
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

export function WhiteboardCanvas(props: WhiteboardCanvasProps) {
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
  const fontsReadyRef = useRef(false)
  const boardIDRef = useRef(props.board.boardID)
  const pendingBoardIDRef = useRef(props.board.boardID)
  const lastRenderReportSignatureRef = useRef<string>()
  const pendingInitialSceneFrameRef = useRef<number>()
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

  const cancelPendingRenderReportFrame = useCallback(() => {
    if (pendingRenderReportFrameRef.current === undefined) return
    window.cancelAnimationFrame(pendingRenderReportFrameRef.current)
    pendingRenderReportFrameRef.current = undefined
  }, [])

  const scheduleRenderReport = useCallback(() => {
    if (!renderReportRef.current || !fontsReadyRef.current || readOnlyRef.current) return
    cancelPendingRenderReportFrame()
    pendingRenderReportFrameRef.current = window.requestAnimationFrame(() => {
      pendingRenderReportFrameRef.current = undefined
      const api = apiRef.current
      const boardID = boardIDRef.current
      const onRenderReport = renderReportRef.current
      if (!api || !boardID || !onRenderReport || !fontsReadyRef.current || readOnlyRef.current) {
        return
      }
      const report = createWhiteboardRenderReport({
        boardID,
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        readBounds: getCommonBounds,
      })
      const signature = whiteboardRenderReportSignature(report)
      if (signature === lastRenderReportSignatureRef.current) return
      lastRenderReportSignatureRef.current = signature
      onRenderReport(report)
    })
  }, [cancelPendingRenderReportFrame])

  const settleScene = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      cancelPendingInitialSceneFrame()
      const nextBoardID = pendingBoardIDRef.current
      pendingInitialSceneFrameRef.current = window.requestAnimationFrame(() => {
        pendingInitialSceneFrameRef.current = undefined
        if (apiRef.current !== api || pendingBoardIDRef.current !== nextBoardID) return
        baselineRef.current = elementVersionSignature(api.getSceneElements())
        boardIDRef.current = nextBoardID
        autosaveReadyRef.current = !readOnlyRef.current
        viewportChangeRef.current?.(viewportFromAppState(api.getAppState()))
        setCanvasSettled(true)
        scheduleRenderReport()
      })
    },
    [cancelPendingInitialSceneFrame, scheduleRenderReport],
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
      const appState = viewport ? viewportToRestoredAppState(viewport, api.getAppState()) : undefined
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
      cancelPendingInitialSceneFrame()
      cancelPendingRenderReportFrame()
      autosaveReadyRef.current = false
      apiRef.current = undefined
      void saveSchedulerRef.current.flush()
    },
    [cancelPendingInitialSceneFrame, cancelPendingRenderReportFrame],
  )

  useEffect(() => {
    baselineRef.current = elementVersionSignature(elements)
    const api = apiRef.current
    if (!api) return
    if (elementVersionSignature(api.getSceneElements()) !== baselineRef.current) {
      applySceneToApi(api, elements, "mounted-update")
    }
    if (props.readOnly) return
    void saveSchedulerRef.current.flush()
    settleScene(api)
    scheduleRenderReport()
  }, [applySceneToApi, elements, props.readOnly, scheduleRenderReport, settleScene])

  const setApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api
      setCanvasSettled(false)
      if (viewportRef.current) {
        applySceneToApi(api, [...api.getSceneElements()], "initial-mount")
      }
      settleScene(api)
    },
    [applySceneToApi, settleScene],
  )

  const handleChange = useCallback(
    (nextElements: readonly OrderedExcalidrawElement[], appState: AppState) => {
      if (remoteSceneUpdateDepthRef.current > 0) return
      const viewport = viewportFromAppState(appState)
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

  return (
    <div className="relative h-full overflow-hidden">
      {!fontsReady || !canvasSettled ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-text-weaker">
          Preparing whiteboard…
        </div>
      ) : null}
      {conversion.warning ? (
        <div className="absolute top-3 left-3 z-10 max-w-md rounded-md border border-border-warning-base/60 bg-surface-warning-weak/95 px-3 py-2 text-xs text-text-base shadow-sm">
          {conversion.warning}
        </div>
      ) : null}
      {fontsReady ? (
        <div className={`h-full ${canvasSettled ? "" : "invisible"}`}>
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={initialData}
            onChange={handleChange}
            theme={mode}
            viewModeEnabled={props.readOnly}
            UIOptions={WHITEBOARD_EXCALIDRAW_UI_OPTIONS}
          />
        </div>
      ) : null}
    </div>
  )
}
