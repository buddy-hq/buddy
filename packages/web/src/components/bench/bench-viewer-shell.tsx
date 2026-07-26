import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from "@buddy/ui"
import { MinusIcon, PlusIcon, RotateCcwIcon } from "@/icons/app-icons"
import { readBenchSurfaceViewport, writeBenchSurfaceViewport } from "@/state/bench-surface-ui-state"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

const BENCH_ZOOM_MIN = 0.25
const BENCH_ZOOM_MAX = 4
const BENCH_ZOOM_STEP = 0.15
const BENCH_ZOOM_DEFAULT = 1
const BENCH_CANVAS_PADDING_PX = 32
const BENCH_CANVAS_PAN_OVERSCAN_PX = 512
const BENCH_CANVAS_BACKGROUND_CLASS =
  "bg-[linear-gradient(rgba(0,0,0,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.025)_1px,transparent_1px)] bg-[size:40px_40px] dark:bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)]"

export type BenchViewerAction = {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  dataAction?: string
}

export type BenchZoomControls = {
  zoomLabel: string
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  canZoomIn: boolean
  canZoomOut: boolean
}

type BenchViewerShellProps = {
  title: string
  subtitle?: string
  actions?: BenchViewerAction[]
  toolbar?: ReactNode
  zoomControls?: BenchZoomControls
  controlsPlacement?: "header" | "dock"
  hideHeader?: boolean
  dock?: ReactNode
  dockPanel?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

type BenchSurfaceViewerProps = {
  title: string
  subtitle?: string
  actions?: BenchViewerAction[]
  toolbar?: ReactNode
  controlsPlacement?: "header" | "dock"
  hideHeader?: boolean
  dock?: ReactNode
  dockPanel?: ReactNode
  children: ReactNode
  className?: string
  surfaceClassName?: string
}

type BenchZoomableViewerProps = {
  title: string
  subtitle?: string
  actions?: BenchViewerAction[]
  toolbar?: ReactNode
  controlsPlacement?: "header" | "dock"
  hideHeader?: boolean
  dock?: ReactNode
  dockPanel?: ReactNode
  children: ReactNode
  className?: string
  canvasClassName?: string
  contentClassName?: string
  fitContent?: boolean
  initialZoom?: number
  /**
   * Persists zoom and pan for this Bench target so an evicted surface returns where the user left
   * it. Keep-alive is bounded, so eviction is normal — this is what makes it survivable.
   */
  viewportKey?: string
}

type BenchSize = {
  width: number
  height: number
}

type BenchZoomState = {
  zoom: number
  isAutoFit: boolean
}

export type BenchZoomableCanvasMetrics = {
  canvasWidth: number
  canvasHeight: number
  contentOffsetX: number
  contentOffsetY: number
  renderedWidth: number
  renderedHeight: number
}

function clampZoom(value: number) {
  return Math.min(BENCH_ZOOM_MAX, Math.max(BENCH_ZOOM_MIN, value))
}

function zoomLabel(value: number) {
  return `${Math.round(value * 100)}%`
}

function hasMeasuredSize(size: BenchSize) {
  return size.width > 0 && size.height > 0
}

export function resolveBenchFitZoom(input: {
  viewportSize: BenchSize
  contentSize: BenchSize
  canvasPadding: number
}) {
  if (!hasMeasuredSize(input.viewportSize) || !hasMeasuredSize(input.contentSize)) {
    return BENCH_ZOOM_DEFAULT
  }

  const availableWidth = input.viewportSize.width - input.canvasPadding * 2
  const availableHeight = input.viewportSize.height - input.canvasPadding * 2
  if (availableWidth <= 0 || availableHeight <= 0) {
    return BENCH_ZOOM_DEFAULT
  }

  return clampZoom(
    Math.min(
      BENCH_ZOOM_MAX,
      availableWidth / input.contentSize.width,
      availableHeight / input.contentSize.height,
    ),
  )
}

export function resolveBenchZoomableCanvasMetrics(input: {
  viewportSize: BenchSize
  contentSize: BenchSize
  zoom: number
  canvasPadding: number
  panOverscan: number
}): BenchZoomableCanvasMetrics {
  const renderedWidth = input.contentSize.width * input.zoom
  const renderedHeight = input.contentSize.height * input.zoom
  const minimumCanvasWidth = input.viewportSize.width + input.panOverscan * 2
  const minimumCanvasHeight = input.viewportSize.height + input.panOverscan * 2
  const canvasWidth = Math.max(
    minimumCanvasWidth,
    renderedWidth + input.canvasPadding * 2 + input.panOverscan * 2,
  )
  const canvasHeight = Math.max(
    minimumCanvasHeight,
    renderedHeight + input.canvasPadding * 2 + input.panOverscan * 2,
  )

  return {
    canvasWidth,
    canvasHeight,
    contentOffsetX: Math.max(input.canvasPadding, (canvasWidth - renderedWidth) / 2),
    contentOffsetY: Math.max(input.canvasPadding, (canvasHeight - renderedHeight) / 2),
    renderedWidth,
    renderedHeight,
  }
}

export function resolveBenchCenteredScroll(input: {
  viewportSize: BenchSize
  metrics: BenchZoomableCanvasMetrics
}) {
  return {
    left: Math.max(
      0,
      input.metrics.contentOffsetX + input.metrics.renderedWidth / 2 - input.viewportSize.width / 2,
    ),
    top: Math.max(
      0,
      input.metrics.contentOffsetY +
        input.metrics.renderedHeight / 2 -
        input.viewportSize.height / 2,
    ),
  }
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        "button,a,input,textarea,select,option,[role='button'],[data-bench-pan-disabled]",
      ),
    )
  )
}

function BenchToolbarButton(props: BenchViewerAction & { tooltipSide?: "top" | "bottom" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-8 rounded-lg text-text-weak transition-transform hover:bg-surface-base-hover hover:text-text-base active:scale-[0.97]"
          aria-label={props.label}
          disabled={props.disabled}
          data-action={props.dataAction}
          onClick={props.onClick}
        >
          {props.icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={props.tooltipSide ?? "bottom"} sideOffset={6}>
        <p>{props.label}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function BenchControlGroup(props: {
  children: ReactNode
  placement: "header" | "dock"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1",
        props.placement === "header" &&
          "rounded-xl border border-border-base/60 bg-surface-base/70 p-1",
        props.className,
      )}
    >
      {props.children}
    </div>
  )
}

export function BenchFloatingControlDock(props: {
  children: ReactNode
  className?: string
  upperRow?: ReactNode
}) {
  if (!props.children) return null

  return (
    <div
      data-component="bench-floating-control-dock"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-8 z-40 flex justify-center px-4",
        props.className,
      )}
    >
      <div className="flex min-w-0 max-w-full flex-col items-center gap-2">
        {props.upperRow ? (
          <div
            data-component="bench-control-dock-panel"
            data-bench-pan-disabled
            className="pointer-events-auto flex min-w-0 max-w-full items-center overflow-x-auto rounded-2xl border border-border-base/70 bg-surface-base/92 p-1.5 text-text-base shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl"
          >
            {props.upperRow}
          </div>
        ) : null}
        <div
          data-component="bench-control-dock"
          data-bench-pan-disabled
          className="pointer-events-auto flex max-w-full items-center gap-1 rounded-2xl border border-border-base/70 bg-surface-base/88 p-1.5 text-text-base shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl"
        >
          {props.children}
        </div>
      </div>
    </div>
  )
}

function BenchZoomToolbar(props: { controls: BenchZoomControls; placement: "header" | "dock" }) {
  const tooltipSide = props.placement === "dock" ? "top" : "bottom"
  return (
    <BenchControlGroup placement={props.placement}>
      <BenchToolbarButton
        label="Zoom out"
        disabled={!props.controls.canZoomOut}
        onClick={props.controls.zoomOut}
        dataAction="bench-zoom-out"
        icon={<MinusIcon className="size-4" aria-hidden />}
        tooltipSide={tooltipSide}
      />
      <div
        data-component="bench-zoom-label"
        className="min-w-14 px-1 text-center text-[12px] font-medium tabular-nums text-text-weak"
      >
        {props.controls.zoomLabel}
      </div>
      <BenchToolbarButton
        label="Zoom in"
        disabled={!props.controls.canZoomIn}
        onClick={props.controls.zoomIn}
        dataAction="bench-zoom-in"
        icon={<PlusIcon className="size-4" aria-hidden />}
        tooltipSide={tooltipSide}
      />
      <div className="mx-1 h-4 w-px bg-border-base/70" />
      <BenchToolbarButton
        label="Reset zoom"
        onClick={props.controls.resetZoom}
        dataAction="bench-reset-zoom"
        icon={<RotateCcwIcon className="size-4" aria-hidden />}
        tooltipSide={tooltipSide}
      />
    </BenchControlGroup>
  )
}

function BenchActionsToolbar(props: {
  actions: BenchViewerAction[]
  placement: "header" | "dock"
}) {
  const tooltipSide = props.placement === "dock" ? "top" : "bottom"
  return (
    <BenchControlGroup placement={props.placement}>
      {props.actions.map((action) => (
        <BenchToolbarButton key={action.label} {...action} tooltipSide={tooltipSide} />
      ))}
    </BenchControlGroup>
  )
}

function BenchToolbarSlot(props: { children: ReactNode; placement: "header" | "dock" }) {
  return <BenchControlGroup placement={props.placement}>{props.children}</BenchControlGroup>
}

function BenchViewerControls(props: {
  actions?: BenchViewerAction[]
  toolbar?: ReactNode
  zoomControls?: BenchZoomControls
  placement: "header" | "dock"
}) {
  const hasActions = props.actions !== undefined && props.actions.length > 0
  if (!props.zoomControls && !props.toolbar && !hasActions) return null

  return (
    <>
      {props.zoomControls ? (
        <BenchZoomToolbar controls={props.zoomControls} placement={props.placement} />
      ) : null}
      {props.toolbar ? (
        <BenchToolbarSlot placement={props.placement}>{props.toolbar}</BenchToolbarSlot>
      ) : null}
      {hasActions ? (
        <BenchActionsToolbar actions={props.actions ?? []} placement={props.placement} />
      ) : null}
    </>
  )
}

export function BenchViewerShell(props: BenchViewerShellProps) {
  const controlsPlacement = props.controlsPlacement ?? "header"
  const showHeader = props.hideHeader !== true
  const headerControls =
    controlsPlacement === "header" && showHeader ? (
      <BenchViewerControls
        actions={props.actions}
        toolbar={props.toolbar}
        zoomControls={props.zoomControls}
        placement="header"
      />
    ) : null
  const dockControls =
    controlsPlacement === "dock" ? (
      <BenchViewerControls
        actions={props.actions}
        toolbar={props.toolbar}
        zoomControls={props.zoomControls}
        placement="dock"
      />
    ) : null
  const dockContent =
    props.dock || dockControls ? (
      <>
        {dockControls}
        {props.dock}
      </>
    ) : null

  return (
    <TooltipProvider>
      <section
        data-component="bench-viewer-shell"
        className={cn("flex h-full min-h-0 w-full flex-col bg-background-base", props.className)}
      >
        {showHeader ? (
          <header className="flex shrink-0 items-center gap-3 border-b border-border-base/70 bg-surface-base/85 px-4 py-2.5 backdrop-blur md:px-5">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-text-strong">{props.title}</h1>
              {props.subtitle ? (
                <p className="truncate text-xs text-text-weak">{props.subtitle}</p>
              ) : null}
            </div>
            {headerControls ? (
              <div className="flex shrink-0 items-center gap-2">{headerControls}</div>
            ) : null}
          </header>
        ) : null}
        <div className={cn("relative min-h-0 flex-1", props.contentClassName)}>
          {props.children}
          {dockContent ? (
            <BenchFloatingControlDock upperRow={props.dockPanel}>
              {dockContent}
            </BenchFloatingControlDock>
          ) : null}
        </div>
      </section>
    </TooltipProvider>
  )
}

export function BenchSurfaceViewer(props: BenchSurfaceViewerProps) {
  return (
    <BenchViewerShell
      title={props.title}
      subtitle={props.subtitle}
      actions={props.actions}
      toolbar={props.toolbar}
      controlsPlacement={props.controlsPlacement}
      hideHeader={props.hideHeader}
      dock={props.dock}
      dockPanel={props.dockPanel}
      className={props.className}
      contentClassName="overflow-hidden"
    >
      <div
        data-component="bench-native-surface"
        className={cn(
          "h-full min-h-0 w-full",
          BENCH_CANVAS_BACKGROUND_CLASS,
          props.surfaceClassName,
        )}
      >
        {props.children}
      </div>
    </BenchViewerShell>
  )
}

export function BenchZoomableViewer(props: BenchZoomableViewerProps) {
  const viewportKey = props.viewportKey
  const restoredViewport = useMemo(
    () => (viewportKey ? readBenchSurfaceViewport(viewportKey) : undefined),
    [viewportKey],
  )
  const initialZoom = clampZoom(restoredViewport?.zoom ?? props.initialZoom ?? BENCH_ZOOM_DEFAULT)
  const initialAutoFit =
    restoredViewport?.autoFit ??
    (restoredViewport?.zoom === undefined &&
      props.fitContent === true &&
      props.initialZoom === undefined)
  const [zoomState, setZoomState] = useState<BenchZoomState>({
    zoom: initialZoom,
    isAutoFit: initialAutoFit,
  })
  const [dragging, setDragging] = useState(false)
  const [viewportSize, setViewportSize] = useState<BenchSize>({ width: 0, height: 0 })
  const [contentSize, setContentSize] = useState<BenchSize>({ width: 0, height: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const shouldCenterScrollRef = useRef(true)
  const restoredPanRef = useRef(
    initialAutoFit || restoredViewport?.panX === undefined || restoredViewport.panY === undefined
      ? undefined
      : { panX: restoredViewport.panX, panY: restoredViewport.panY },
  )
  const initializationRef = useRef({ initialAutoFit, initialZoom, viewportKey })
  const zoomStateRef = useRef(zoomState)
  zoomStateRef.current = zoomState
  const dragStartRef = useRef({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  })

  useEffect(() => {
    const previous = initializationRef.current
    if (
      previous.initialAutoFit === initialAutoFit &&
      previous.initialZoom === initialZoom &&
      previous.viewportKey === viewportKey
    ) {
      return
    }
    initializationRef.current = { initialAutoFit, initialZoom, viewportKey }
    shouldCenterScrollRef.current = true
    restoredPanRef.current =
      initialAutoFit || restoredViewport?.panX === undefined || restoredViewport.panY === undefined
        ? undefined
        : { panX: restoredViewport.panX, panY: restoredViewport.panY }
    setZoomState({
      zoom: initialZoom,
      isAutoFit: initialAutoFit,
    })
  }, [initialAutoFit, initialZoom, restoredViewport, viewportKey])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const updateViewportSize = () => {
      const nextSize = {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      }
      if (!hasMeasuredSize(nextSize)) return

      setViewportSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize,
      )
    }

    updateViewportSize()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportSize)
      return () => window.removeEventListener("resize", updateViewportSize)
    }

    const observer = new ResizeObserver(updateViewportSize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return

    const updateContentSize = () => {
      const nextSize = {
        width: content.offsetWidth,
        height: content.offsetHeight,
      }
      if (!hasMeasuredSize(nextSize)) return

      setContentSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height ? current : nextSize,
      )
    }

    updateContentSize()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateContentSize)
      return () => window.removeEventListener("resize", updateContentSize)
    }

    const observer = new ResizeObserver(updateContentSize)
    observer.observe(content)
    return () => observer.disconnect()
  }, [props.children])

  const effectiveZoom = useMemo(
    () =>
      props.fitContent && zoomState.isAutoFit
        ? resolveBenchFitZoom({
            viewportSize,
            contentSize,
            canvasPadding: BENCH_CANVAS_PADDING_PX,
          })
        : zoomState.zoom,
    [contentSize, props.fitContent, viewportSize, zoomState.isAutoFit, zoomState.zoom],
  )

  const canvasMetrics = useMemo(
    () =>
      resolveBenchZoomableCanvasMetrics({
        viewportSize,
        contentSize,
        zoom: effectiveZoom,
        canvasPadding: BENCH_CANVAS_PADDING_PX,
        panOverscan: BENCH_CANVAS_PAN_OVERSCAN_PX,
      }),
    [contentSize, effectiveZoom, viewportSize],
  )

  useLayoutEffect(() => {
    if (
      (!shouldCenterScrollRef.current && !zoomState.isAutoFit) ||
      !viewportRef.current ||
      !hasMeasuredSize(viewportSize)
    ) {
      return
    }

    const scroll = resolveBenchCenteredScroll({
      viewportSize,
      metrics: canvasMetrics,
    })
    // A restored pan wins over centering: the surface is coming back, not opening.
    viewportRef.current.scrollLeft = restoredPanRef.current?.panX ?? scroll.left
    viewportRef.current.scrollTop = restoredPanRef.current?.panY ?? scroll.top
    restoredPanRef.current = undefined
    shouldCenterScrollRef.current = false
  }, [canvasMetrics, viewportSize, zoomState.isAutoFit])

  // Persist zoom and pan for this target so a bounded-cache eviction is survivable.
  useLayoutEffect(() => {
    if (!viewportKey) return
    const viewport = viewportRef.current
    return () => {
      writeBenchSurfaceViewport(viewportKey, {
        zoom: zoomStateRef.current.zoom,
        autoFit: zoomStateRef.current.isAutoFit,
        ...(!zoomStateRef.current.isAutoFit && viewport
          ? { panX: viewport.scrollLeft, panY: viewport.scrollTop }
          : {}),
      })
    }
  }, [viewportKey])

  const zoomControls = useMemo<BenchZoomControls>(
    () => ({
      zoomLabel: zoomLabel(effectiveZoom),
      canZoomIn: effectiveZoom < BENCH_ZOOM_MAX,
      canZoomOut: effectiveZoom > BENCH_ZOOM_MIN,
      zoomIn: () =>
        setZoomState({
          zoom: clampZoom(effectiveZoom + BENCH_ZOOM_STEP),
          isAutoFit: false,
        }),
      zoomOut: () =>
        setZoomState({
          zoom: clampZoom(effectiveZoom - BENCH_ZOOM_STEP),
          isAutoFit: false,
        }),
      resetZoom: () => {
        shouldCenterScrollRef.current = true
        if (props.fitContent) {
          setZoomState({
            zoom: resolveBenchFitZoom({
              viewportSize,
              contentSize,
              canvasPadding: BENCH_CANVAS_PADDING_PX,
            }),
            isAutoFit: true,
          })
          return
        }
        setZoomState({ zoom: BENCH_ZOOM_DEFAULT, isAutoFit: false })
      },
    }),
    [contentSize, effectiveZoom, props.fitContent, viewportSize],
  )
  const shouldAnimateZoomTransform = !zoomState.isAutoFit

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !viewportRef.current || isInteractiveTarget(event.target)) {
      return
    }

    const viewport = viewportRef.current
    setDragging(true)
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    }
    viewport.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging || !viewportRef.current) return
      event.preventDefault()
      viewportRef.current.scrollLeft =
        dragStartRef.current.scrollLeft - (event.clientX - dragStartRef.current.x)
      viewportRef.current.scrollTop =
        dragStartRef.current.scrollTop - (event.clientY - dragStartRef.current.y)
    },
    [dragging],
  )

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId)
    }
    setDragging(false)
  }, [])

  return (
    <BenchViewerShell
      title={props.title}
      subtitle={props.subtitle}
      actions={props.actions}
      toolbar={props.toolbar}
      controlsPlacement={props.controlsPlacement}
      hideHeader={props.hideHeader}
      dock={props.dock}
      dockPanel={props.dockPanel}
      zoomControls={zoomControls}
      className={props.className}
      contentClassName="overflow-hidden"
    >
      <div
        ref={viewportRef}
        data-component="bench-pan-zoom-canvas"
        className={cn(
          "relative h-full w-full overflow-auto",
          BENCH_CANVAS_BACKGROUND_CLASS,
          dragging ? "cursor-grabbing select-none" : "cursor-grab",
          props.canvasClassName,
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div
          className="relative"
          style={{
            width: canvasMetrics.canvasWidth,
            height: canvasMetrics.canvasHeight,
          }}
        >
          <div
            ref={contentRef}
            data-component="bench-zoom-content"
            className={cn(
              "absolute origin-top-left",
              shouldAnimateZoomTransform && "transition-transform duration-150 ease-out",
              props.contentClassName,
            )}
            style={{
              left: canvasMetrics.contentOffsetX,
              top: canvasMetrics.contentOffsetY,
              transform: `scale(${effectiveZoom})`,
            }}
          >
            {props.children}
          </div>
        </div>
      </div>
    </BenchViewerShell>
  )
}
