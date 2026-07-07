import "@excalidraw/excalidraw/index.css"

import {
  Button,
  ComposerDock,
  ComposerDockBody,
  cn,
} from "@buddy/ui"
import { Excalidraw, exportToBlob, MIME_TYPES } from "@excalidraw/excalidraw"
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"
import {
  EraserIcon,
  HandIcon,
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  PenLineIcon,
  XIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTheme } from "@/theme"
import {
  createAttachmentID,
  readFileAsDataUrl,
} from "./attachment-utils"
import type { PromptComposerAttachment } from "./prompt-types"

export type SketchAttachmentFlush = () => Promise<PromptComposerAttachment | undefined>

type SketchDockProps = {
  acceptsImages: boolean
  benchHost: HTMLDivElement | null | undefined
  imageModelOptions: Array<{
    key: string
    label: string
  }>
  isMaximized: boolean
  isOpen: boolean
  onModelChange: (model: string) => void
  onClose: () => void
  onMaximize?: () => void
  onMinimize: () => void
  onRestore: () => void
  onSketchContentChange: (hasSketch: boolean) => void
  onSketchAttachmentChange: (attachment: PromptComposerAttachment | undefined) => void
  onFlushSketchAttachmentChange: (flush: SketchAttachmentFlush | undefined) => void
  className?: string
}

type SketchSnapshot = {
  elements: readonly NonDeletedExcalidrawElement[]
  appState: AppState
  files: BinaryFiles
}

type SketchTool = "pen" | "pan"

const SKETCH_EXPORT_DEBOUNCE_MS = 120
const SKETCH_CANVAS_POST_OPEN_REFRESH_DELAY_MS = 260
const SKETCH_EXPORT_PADDING_PX = 18
const SKETCH_ATTACHMENT_FILENAME = "sketch.png"
const SKETCH_ATTACHMENT_MIME = MIME_TYPES.png
const SKETCH_BACKGROUND_COLOR = "#ffffff"
const SKETCH_STROKE_COLOR = "#343a40"
const SKETCH_GRID_SIZE_PX = 20
const SKETCH_TOOL_PEN: SketchTool = "pen"
const SKETCH_TOOL_PAN: SketchTool = "pan"

const SKETCH_UI_OPTIONS = {
  canvasActions: {
    changeViewBackgroundColor: false,
    clearCanvas: false,
    export: false,
    loadScene: false,
    saveAsImage: false,
    saveToActiveFile: false,
    toggleTheme: false,
  },
  tools: {
    image: false,
  },
} as const

const SKETCH_INITIAL_DATA: ExcalidrawInitialDataState = {
  appState: {
    activeTool: {
      type: "freedraw",
      customType: null,
      locked: true,
      lastActiveTool: null,
    },
    currentItemStrokeColor: SKETCH_STROKE_COLOR,
    currentItemStrokeWidth: 1,
    exportBackground: true,
    exportEmbedScene: false,
    exportWithDarkMode: false,
    gridModeEnabled: true,
    gridSize: SKETCH_GRID_SIZE_PX,
    viewBackgroundColor: SKETCH_BACKGROUND_COLOR,
  },
}

const SKETCH_DOCK_CSS = `
[data-component="prompt-sketch-dock-canvas"] .layer-ui__wrapper,
[data-component="prompt-sketch-dock-canvas"] .App-menu_top,
[data-component="prompt-sketch-dock-canvas"] .App-toolbar,
[data-component="prompt-sketch-dock-canvas"] .FixedSideContainer,
[data-component="prompt-sketch-dock-canvas"] .Island,
[data-component="prompt-sketch-dock-canvas"] .excalidraw__footer,
[data-component="prompt-sketch-dock-canvas"] .help-icon,
[data-component="prompt-sketch-dock-canvas"] .Stack_vertical {
  display: none !important;
}

[data-component="prompt-sketch-dock-canvas"] .excalidraw {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}
`

function hasSketchElements(elements: readonly NonDeletedExcalidrawElement[]) {
  return elements.length > 0
}

function resolveAttachmentID(current: string | undefined) {
  return current ?? createAttachmentID()
}

function activateSketchTool(api: ExcalidrawImperativeAPI, tool: SketchTool) {
  if (tool === SKETCH_TOOL_PAN) {
    api.setActiveTool({ type: "hand" })
    return
  }
  api.setActiveTool({ type: "freedraw", locked: true })
}

function SketchDockHeader(props: { left?: ReactNode; right: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-weak-base bg-surface-base/50 px-4">
      <div className="flex h-full min-w-0 items-center gap-1">{props.left}</div>
      <div className="flex h-full shrink-0 items-center gap-1">{props.right}</div>
    </div>
  )
}

async function createSketchAttachment(input: {
  id: string
  snapshot: SketchSnapshot
}): Promise<PromptComposerAttachment> {
  const blob = await exportToBlob({
    elements: input.snapshot.elements,
    appState: {
      ...input.snapshot.appState,
      exportBackground: true,
      exportEmbedScene: false,
      exportWithDarkMode: false,
      viewBackgroundColor: SKETCH_BACKGROUND_COLOR,
    },
    files: input.snapshot.files,
    mimeType: SKETCH_ATTACHMENT_MIME,
    exportPadding: SKETCH_EXPORT_PADDING_PX,
  })
  const file = new File([blob], SKETCH_ATTACHMENT_FILENAME, { type: SKETCH_ATTACHMENT_MIME })

  return {
    id: input.id,
    filename: SKETCH_ATTACHMENT_FILENAME,
    mime: SKETCH_ATTACHMENT_MIME,
    dataUrl: await readFileAsDataUrl(file),
    kind: "image",
  }
}

export function SketchDock(props: SketchDockProps) {
  const {
    acceptsImages,
    benchHost,
    className,
    imageModelOptions,
    isMaximized,
    isOpen,
    onClose,
    onFlushSketchAttachmentChange,
    onMaximize,
    onMinimize,
    onModelChange,
    onRestore,
    onSketchAttachmentChange,
    onSketchContentChange,
  } = props
  const { mode } = useTheme()
  const [hasSketch, setHasSketch] = useState(false)
  const [activeTool, setActiveTool] = useState<SketchTool>(SKETCH_TOOL_PEN)
  const apiRef = useRef<ExcalidrawImperativeAPI>()
  const latestSnapshotRef = useRef<SketchSnapshot>()
  const latestAttachmentRef = useRef<PromptComposerAttachment>()
  const attachmentIDRef = useRef<string>()
  const exportTimerRef = useRef<number>()
  const exportSequenceRef = useRef(0)

  const clearScheduledExport = useCallback(() => {
    if (exportTimerRef.current === undefined) return
    window.clearTimeout(exportTimerRef.current)
    exportTimerRef.current = undefined
  }, [])

  const publishEmptySketch = useCallback(() => {
    exportSequenceRef.current += 1
    latestSnapshotRef.current = undefined
    latestAttachmentRef.current = undefined
    clearScheduledExport()
    setHasSketch(false)
    onSketchContentChange(false)
    onSketchAttachmentChange(undefined)
  }, [clearScheduledExport, onSketchAttachmentChange, onSketchContentChange])

  const exportLatestSketch = useCallback(async () => {
    const snapshot = latestSnapshotRef.current
    if (!snapshot || !hasSketchElements(snapshot.elements)) {
      publishEmptySketch()
      return undefined
    }

    const nextID = resolveAttachmentID(attachmentIDRef.current)
    attachmentIDRef.current = nextID
    const exportID = exportSequenceRef.current + 1
    exportSequenceRef.current = exportID

    try {
      const attachment = await createSketchAttachment({ id: nextID, snapshot })
      if (exportSequenceRef.current !== exportID) {
        return latestAttachmentRef.current
      }
      latestAttachmentRef.current = attachment
      onSketchAttachmentChange(attachment)
      return attachment
    } catch (error) {
      console.error("[sketch-dock] exportLatestSketch failed:", error)
      return latestAttachmentRef.current
    }
  }, [onSketchAttachmentChange, publishEmptySketch])

  const scheduleSketchExport = useCallback(() => {
    clearScheduledExport()
    exportTimerRef.current = window.setTimeout(() => {
      exportTimerRef.current = undefined
      void exportLatestSketch()
    }, SKETCH_EXPORT_DEBOUNCE_MS)
  }, [clearScheduledExport, exportLatestSketch])

  const flushSketchAttachment = useCallback(async () => {
    clearScheduledExport()
    return exportLatestSketch()
  }, [clearScheduledExport, exportLatestSketch])

  useEffect(() => {
    onFlushSketchAttachmentChange(flushSketchAttachment)
    return () => {
      exportSequenceRef.current += 1
      clearScheduledExport()
      onFlushSketchAttachmentChange(undefined)
    }
  }, [clearScheduledExport, flushSketchAttachment, onFlushSketchAttachmentChange])

  const setApi = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      apiRef.current = api
      activateSketchTool(api, activeTool)
      window.requestAnimationFrame(() => {
        if (apiRef.current !== api) return
        api.refresh()
        activateSketchTool(api, activeTool)
      })
    },
    [activeTool],
  )

  const refreshCanvas = useCallback(() => {
    apiRef.current?.refresh()
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const initialFrame = window.requestAnimationFrame(refreshCanvas)
    let settledFrame: number | undefined
    const settledTimeout = window.setTimeout(() => {
      settledFrame = window.requestAnimationFrame(refreshCanvas)
    }, SKETCH_CANVAS_POST_OPEN_REFRESH_DELAY_MS)

    return () => {
      window.cancelAnimationFrame(initialFrame)
      window.clearTimeout(settledTimeout)
      if (settledFrame !== undefined) {
        window.cancelAnimationFrame(settledFrame)
      }
    }
  }, [isOpen, refreshCanvas])

  const handleChange = useCallback(
    (
      elements: readonly NonDeletedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      if (!hasSketchElements(elements)) {
        publishEmptySketch()
        return
      }

      latestSnapshotRef.current = {
        elements,
        appState,
        files,
      }
      setHasSketch(true)
      onSketchContentChange(true)
      scheduleSketchExport()
    },
    [onSketchContentChange, publishEmptySketch, scheduleSketchExport],
  )

  const handleClear = useCallback(() => {
    apiRef.current?.resetScene()
    if (apiRef.current) {
      activateSketchTool(apiRef.current, activeTool)
    }
    attachmentIDRef.current = undefined
    publishEmptySketch()
  }, [activeTool, publishEmptySketch])

  const selectTool = useCallback((tool: SketchTool) => {
    const api = apiRef.current
    if (!api) return
    setActiveTool(tool)
    activateSketchTool(api, tool)
  }, [])

  const imageModelMessage =
    imageModelOptions.length === 0
      ? "You have no models that support images. Connect a model or use your ChatGPT account to send sketches."
      : imageModelOptions.length === 1
        ? "Choose the following model to send sketches:"
        : "Choose from the following models to send sketches:"
  const currentSnapshot = latestSnapshotRef.current
  const initialData: ExcalidrawInitialDataState = currentSnapshot
    ? {
        elements: currentSnapshot.elements,
        appState: currentSnapshot.appState,
        files: currentSnapshot.files,
      }
    : SKETCH_INITIAL_DATA
  const rightActions = (
    <>
      {isMaximized ? (
        <button
          type="button"
          onClick={onRestore}
          className="flex size-6 items-center justify-center rounded-full text-text-weak transition-all hover:bg-surface-base-hover hover:text-text-base active:scale-95"
          aria-label="Return sketch to composer"
          title="Return to composer"
        >
          <Minimize2Icon className="size-3" />
        </button>
      ) : (
        <>
          {onMaximize ? (
            <button
              type="button"
              onClick={onMaximize}
              className="flex size-6 items-center justify-center rounded-full text-text-weak transition-all hover:bg-surface-base-hover hover:text-text-base active:scale-95"
              aria-label="Maximize sketch"
              title="Maximize"
            >
              <Maximize2Icon className="size-3" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onMinimize}
            className="flex size-6 items-center justify-center rounded-full text-text-weak transition-all hover:bg-surface-base-hover hover:text-text-base active:scale-95"
            aria-label="Minimize sketch"
            title="Minimize"
          >
            <MinusIcon className="size-3" />
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onClose}
        className="flex size-6 items-center justify-center rounded-full text-text-weak transition-all hover:bg-surface-critical-base/10 hover:text-text-on-critical-base active:scale-95"
        aria-label="Close sketch"
        title="Close"
      >
        <XIcon className="size-3" />
      </button>
    </>
  )
  const surface = (
    <>
      <style>{SKETCH_DOCK_CSS}</style>
      <div className="flex min-h-0 flex-1 flex-col">
        <SketchDockHeader
          left={
            acceptsImages ? (
              <>
                <button
                  type="button"
                  data-active={activeTool === SKETCH_TOOL_PEN ? "true" : undefined}
                  onClick={() => selectTool(SKETCH_TOOL_PEN)}
                  className="flex size-6 items-center justify-center rounded-md text-text-weak transition-all hover:bg-surface-base-hover hover:text-text-base data-[active=true]:bg-surface-interactive-base data-[active=true]:text-text-on-interactive-base active:scale-95"
                  aria-label="Draw"
                  aria-pressed={activeTool === SKETCH_TOOL_PEN}
                  title="Draw"
                >
                  <PenLineIcon className="size-3" />
                </button>
                <button
                  type="button"
                  data-active={activeTool === SKETCH_TOOL_PAN ? "true" : undefined}
                  onClick={() => selectTool(SKETCH_TOOL_PAN)}
                  className="flex size-6 items-center justify-center rounded-md text-text-weak transition-all hover:bg-surface-base-hover hover:text-text-base data-[active=true]:bg-surface-interactive-base data-[active=true]:text-text-on-interactive-base active:scale-95"
                  aria-label="Pan"
                  aria-pressed={activeTool === SKETCH_TOOL_PAN}
                  title="Pan"
                >
                  <HandIcon className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={!hasSketch}
                  className="flex size-6 items-center justify-center rounded-md text-text-weak transition-all hover:bg-surface-base-hover hover:text-text-base active:scale-95 disabled:pointer-events-none disabled:opacity-35"
                  aria-label="Clear sketch"
                  title="Clear"
                >
                  <EraserIcon className="size-3" />
                </button>
              </>
            ) : undefined
          }
          right={rightActions}
        />

        {acceptsImages ? (
          <ComposerDockBody className="bg-white dark:bg-[#121212]">
            <div
              data-component="prompt-sketch-dock-canvas"
              className={cn(
                "absolute inset-0 overflow-hidden bg-white dark:bg-[#121212]",
                "[&_.excalidraw]:bg-white dark:[&_.excalidraw]:bg-[#121212]",
              )}
              onContextMenu={(event) => event.preventDefault()}
            >
              <Excalidraw
                excalidrawAPI={setApi}
                initialData={initialData}
                onChange={handleChange}
                theme={mode}
                gridModeEnabled
                zenModeEnabled
                UIOptions={SKETCH_UI_OPTIONS}
                autoFocus
                handleKeyboardGlobally={false}
              />
            </div>
          </ComposerDockBody>
        ) : (
          <ComposerDockBody padded>
            <div className="w-full max-w-md">
              <p className="text-center text-sm leading-6 text-text-weak">
                {imageModelMessage}
              </p>
              {imageModelOptions.length > 0 ? (
                <div
                  className={cn(
                    "mt-4 grid grid-cols-1 gap-2",
                    imageModelOptions.length > 1 && "sm:grid-cols-2",
                  )}
                >
                  {imageModelOptions.map((option) => (
                    <Button
                      key={option.key}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onModelChange(option.key)}
                      className={cn(
                        "max-w-full min-w-0 justify-self-center",
                        imageModelOptions.length === 1 && "max-w-56",
                      )}
                      title={option.label}
                    >
                      <span className="truncate">{option.label}</span>
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </ComposerDockBody>
        )}
      </div>
    </>
  )

  if (isMaximized) {
    if (!benchHost) return null
    return createPortal(
      <div
        data-component="prompt-sketch-bench-surface"
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-surface-raised-base"
      >
        {surface}
      </div>,
      benchHost,
    )
  }

  return (
    <ComposerDock size="md" className={className}>
      {surface}
    </ComposerDock>
  )
}
