import "@excalidraw/excalidraw/index.css"

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  FONT_FAMILY,
  restore,
  zoomToFitBounds,
} from "@excalidraw/excalidraw"
import type { SceneBounds } from "@excalidraw/excalidraw/element/bounds"
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types"
import type { WhiteboardsRevisionReadResponse } from "@buddy/sdk"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "@/theme"
import {
  elementVersionSignature,
  toEditorElementConversion,
  toPersistedElements,
  viewportFromAppState,
  viewportToAppState,
  type WhiteboardElementPreparation,
  type PersistedWhiteboardElement,
  type WhiteboardViewport,
} from "./whiteboard-elements"
import {
  createWhiteboardLearnerSaveScheduler,
  type WhiteboardLearnerSaveHandler,
} from "./whiteboard-learner-save"

const LEARNER_EDIT_DEBOUNCE_MS = 2_000
const VIEWPORT_SIGNATURE_PRECISION = 100
const WHITEBOARD_FONT_LOADS = [
  "20px Excalifont",
  "400 16px Assistant",
  "500 16px Assistant",
  "700 16px Assistant",
] as const
let whiteboardFontsReadyPromise: Promise<void> | undefined

type RestoredViewportAppState = Pick<AppState, "scrollX" | "scrollY" | "zoom">

type WhiteboardCanvasProps = {
  revision: Pick<WhiteboardsRevisionReadResponse, "elements" | "viewport"> & {
    revisionID?: string
  }
  readOnly: boolean
  onSave: WhiteboardLearnerSaveHandler
  onLiveRevisionChange?: (
    revision:
      | {
          elements: PersistedWhiteboardElement[]
          viewport: WhiteboardViewport
        }
      | undefined,
  ) => void
  onSaveSettlerChange?: (settle: (() => Promise<boolean>) | undefined) => void
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

function prepareConvertedElements(elements: OrderedExcalidrawElement[]): OrderedExcalidrawElement[] {
  const normalized = elements.map((element) =>
    element.type === "text"
      ? {
          ...element,
          fontFamily: FONT_FAMILY.Excalifont,
        }
      : element,
  )
  return restore(
    { elements: normalized, files: {} },
    null,
    null,
    { refreshDimensions: true },
  ).elements
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

function roundedViewportValue(value: number): number {
  return Math.round(value * VIEWPORT_SIGNATURE_PRECISION) / VIEWPORT_SIGNATURE_PRECISION
}

function viewportSignature(viewport: WhiteboardViewport): string {
  return [
    roundedViewportValue(viewport.x),
    roundedViewportValue(viewport.y),
    roundedViewportValue(viewport.width),
    roundedViewportValue(viewport.height),
  ].join(":")
}

function appStateViewportSignature(appState: AppState): string {
  return viewportSignature(viewportFromAppState(appState))
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
  const apiRef = useRef<ExcalidrawImperativeAPI>()
  const baselineRef = useRef("")
  const saveRef = useRef(props.onSave)
  const liveRevisionChangeRef = useRef(props.onLiveRevisionChange)
  const readOnlyRef = useRef(props.readOnly)
  const baseRevisionIDRef = useRef(props.revision.revisionID)
  const userViewportOverrideRef = useRef(false)
  const lastAppliedViewportSignatureRef = useRef<string>()
  const suppressedViewportSignatureRef = useRef<string>()
  const saveSchedulerRef = useRef(
    createWhiteboardLearnerSaveScheduler({ delayMs: LEARNER_EDIT_DEBOUNCE_MS }),
  )
  const conversion = useMemo<{
    elements: OrderedExcalidrawElement[]
    warning?: string
  }>(
    () => {
      if (!fontsReady) return { elements: [] }
      const prepared = toEditorElementConversion(props.revision.elements)
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
    },
    [fontsReady, props.revision.elements],
  )
  const elements = conversion.elements

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
    liveRevisionChangeRef.current = props.onLiveRevisionChange
  }, [props.onLiveRevisionChange])

  useEffect(() => {
    readOnlyRef.current = props.readOnly
  }, [props.readOnly])

  useEffect(() => {
    baseRevisionIDRef.current = props.revision.revisionID
    // Preserve manual camera control during one stream, then allow the next durable revision to frame itself.
    userViewportOverrideRef.current = false
    liveRevisionChangeRef.current?.(undefined)
  }, [props.revision.revisionID])

  const settleSaves = useCallback(() => saveSchedulerRef.current.flush(), [])

  useEffect(() => {
    onSaveSettlerChange?.(settleSaves)
    return () => {
      onSaveSettlerChange?.(undefined)
    }
  }, [onSaveSettlerChange, settleSaves])

  useEffect(
    () => () => {
      void saveSchedulerRef.current.flush()
    },
    [],
  )

  useEffect(() => {
    void saveSchedulerRef.current.flush()
    baselineRef.current = elementVersionSignature(elements)
    const api = apiRef.current
    if (!api) return
    const appState =
      props.revision.viewport && !userViewportOverrideRef.current
        ? viewportToRestoredAppState(props.revision.viewport, api.getAppState())
        : undefined
    if (appState) {
      const signature = appStateViewportSignature({
        ...api.getAppState(),
        ...appState,
      })
      lastAppliedViewportSignatureRef.current = signature
      suppressedViewportSignatureRef.current = signature
    }
    api.updateScene({
      elements,
      ...(appState ? { appState } : {}),
      captureUpdate: CaptureUpdateAction.NEVER,
    })
  }, [elements, props.revision.viewport])

  const setApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api
      baselineRef.current = elementVersionSignature(elements)
      if (props.revision.viewport) {
        const appState = viewportToRestoredAppState(props.revision.viewport, api.getAppState())
        const signature = appStateViewportSignature({
          ...api.getAppState(),
          ...appState,
        })
        lastAppliedViewportSignatureRef.current = signature
        suppressedViewportSignatureRef.current = signature
        api.updateScene({
          elements,
          appState,
          captureUpdate: CaptureUpdateAction.NEVER,
        })
      }
    },
    [elements, props.revision.viewport],
  )

  const handleChange = useCallback(
    (nextElements: readonly OrderedExcalidrawElement[], appState: AppState) => {
      const currentViewportSignature = appStateViewportSignature(appState)
      if (suppressedViewportSignatureRef.current === currentViewportSignature) {
        suppressedViewportSignatureRef.current = undefined
      } else if (
        lastAppliedViewportSignatureRef.current !== undefined &&
        currentViewportSignature !== lastAppliedViewportSignatureRef.current
      ) {
        userViewportOverrideRef.current = true
      }
      if (readOnlyRef.current) return
      const signature = elementVersionSignature(nextElements)
      if (signature === baselineRef.current) return
      const liveElements = toPersistedElements(nextElements)
      const viewport = viewportFromAppState(appState)
      saveSchedulerRef.current.schedule({
        save: saveRef.current,
        elements: liveElements,
        viewport,
        ...(baseRevisionIDRef.current ? { baseRevisionID: baseRevisionIDRef.current } : {}),
      })
      liveRevisionChangeRef.current?.({
        elements: liveElements,
        viewport,
      })
    },
    [],
  )

  return (
    <div className="relative h-full overflow-hidden">
      {!fontsReady ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-xs text-text-weaker">
          Preparing whiteboard…
        </div>
      ) : null}
      {conversion.warning ? (
        <div className="absolute top-3 left-3 z-10 max-w-md rounded-md border border-border-warning-base/60 bg-surface-warning-weak/95 px-3 py-2 text-xs text-text-base shadow-sm">
          {conversion.warning}
        </div>
      ) : null}
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={{
          elements,
          appState: props.revision.viewport
            ? viewportToInitialAppState(props.revision.viewport)
            : undefined,
        }}
        onChange={handleChange}
        theme={mode}
        viewModeEnabled={props.readOnly}
        UIOptions={{
          canvasActions: {
            saveToActiveFile: false,
            loadScene: false,
            export: false,
            toggleTheme: false,
          },
          tools: {
            image: false,
          },
        }}
      />
    </div>
  )
}
