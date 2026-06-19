import { useCallback, useEffect, useRef, useState } from "react"
import { mermaidConstants } from "./constants"
import type { MermaidRenderResult } from "./lib/render"

export type MermaidSvgBounds = {
  width: number
  height: number
}

export type MermaidViewportSize = {
  width: number
  height: number
}

type MermaidViewportFitPadding = {
  horizontal: number
  vertical: number
}

type MermaidDefaultZoomMode = "fit" | "responsive"

type MermaidResponsiveAutoZoomStrategy = {
  minimumRenderedHeight: number
  maxViewportWidths: number
}

type UseMermaidViewportOptions = {
  value: MermaidRenderResult | undefined
  enabled?: boolean
  canvasPadding: number
  panOverscan: number
  defaultZoomMode?: MermaidDefaultZoomMode
  getFitPadding?: (viewport: MermaidViewportSize) => MermaidViewportFitPadding
  mountSvg?: boolean
  responsiveAutoZoomStrategy?: MermaidResponsiveAutoZoomStrategy
  zoomState?: MermaidViewportZoomState
  onZoomStateChange?: (state: MermaidViewportZoomState) => void
}

export type MermaidViewportZoomState = {
  zoom: number
  isAutoZoom: boolean
}

export type MermaidViewportController = {
  viewportRef: React.RefObject<HTMLDivElement>
  svgHostRef: React.RefObject<HTMLDivElement>
  svgBounds: MermaidSvgBounds
  renderedWidth: number
  renderedHeight: number
  canvasWidth: number
  canvasHeight: number
  contentOffsetX: number
  contentOffsetY: number
  canvasPadding: number
  zoom: number
  zoomLabel: string
  isAutoZoom: boolean
  isInitialized: boolean
  isDragging: boolean
  canZoomIn: boolean
  canZoomOut: boolean
  handlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

const ZERO_FIT_PADDING: MermaidViewportFitPadding = {
  horizontal: 0,
  vertical: 0,
}

function clampZoom(input: number) {
  return Math.min(mermaidConstants.zoom.MAX, Math.max(mermaidConstants.zoom.MIN, input))
}

function parseSvgDimension(value: string | null): number | undefined {
  if (!value) {
    return undefined
  }

  const matched = value.trim().match(/^\s*([0-9]+(?:\.[0-9]+)?)/u)
  if (!matched?.[1]) {
    return undefined
  }

  const parsed = Number.parseFloat(matched[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function measureSvgBounds(svgMarkup: string): MermaidSvgBounds {
  if (typeof DOMParser === "undefined") {
    return {
      width: mermaidConstants.svg.DEFAULT_WIDTH,
      height: mermaidConstants.svg.DEFAULT_HEIGHT,
    }
  }

  try {
    const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml")
    const svg = parsed.querySelector("svg")
    if (!svg) {
      return {
        width: mermaidConstants.svg.DEFAULT_WIDTH,
        height: mermaidConstants.svg.DEFAULT_HEIGHT,
      }
    }

    const viewBox = svg.getAttribute("viewBox")
    if (viewBox) {
      const parts = viewBox
        .trim()
        .split(/[\s,]+/u)
        .map((part) => Number.parseFloat(part))

      if (parts.length === 4) {
        const width = parts[2]
        const height = parts[3]
        if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
          return { width, height }
        }
      }
    }

    const width = parseSvgDimension(svg.getAttribute("width"))
    const height = parseSvgDimension(svg.getAttribute("height"))
    if (width && height) {
      return { width, height }
    }
  } catch {
    return {
      width: mermaidConstants.svg.DEFAULT_WIDTH,
      height: mermaidConstants.svg.DEFAULT_HEIGHT,
    }
  }

  return {
    width: mermaidConstants.svg.DEFAULT_WIDTH,
    height: mermaidConstants.svg.DEFAULT_HEIGHT,
  }
}

function readViewportSize(viewport: HTMLDivElement | null): MermaidViewportSize | undefined {
  if (viewport && viewport.clientWidth > 0 && viewport.clientHeight > 0) {
    return {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    }
  }

  if (typeof window === "undefined") {
    return undefined
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

export function resolveMermaidAutoZoom(input: {
  defaultZoomMode: MermaidDefaultZoomMode
  svgBounds: MermaidSvgBounds
  viewportSize: MermaidViewportSize
  canvasPadding: number
  fitPadding?: MermaidViewportFitPadding
  responsiveAutoZoomStrategy?: MermaidResponsiveAutoZoomStrategy
}): number {
  const availableWidth =
    input.viewportSize.width - (input.fitPadding?.horizontal ?? 0) - input.canvasPadding * 2
  const availableHeight =
    input.viewportSize.height - (input.fitPadding?.vertical ?? 0) - input.canvasPadding * 2

  if (
    availableWidth <= 0 ||
    availableHeight <= 0 ||
    input.svgBounds.width <= 0 ||
    input.svgBounds.height <= 0
  ) {
    return mermaidConstants.zoom.DEFAULT
  }

  const widthFitZoom = availableWidth / input.svgBounds.width
  const heightFitZoom = availableHeight / input.svgBounds.height
  const fitZoom =
    input.defaultZoomMode === "responsive"
      ? Math.min(mermaidConstants.zoom.DEFAULT, widthFitZoom)
      : Math.min(widthFitZoom, heightFitZoom, mermaidConstants.zoom.MAX_AUTO_FIT)

  if (
    input.defaultZoomMode !== "responsive" ||
    input.responsiveAutoZoomStrategy === undefined ||
    input.svgBounds.width / input.svgBounds.height < mermaidConstants.zoom.WIDE_DIAGRAM_ASPECT_RATIO
  ) {
    return clampZoom(fitZoom)
  }

  const targetRenderedHeight = Math.min(
    availableHeight,
    input.responsiveAutoZoomStrategy.minimumRenderedHeight,
  )
  const readableHeightZoom = targetRenderedHeight / input.svgBounds.height
  const overflowLimitedZoom =
    (availableWidth * input.responsiveAutoZoomStrategy.maxViewportWidths) / input.svgBounds.width

  return clampZoom(
    Math.max(
      fitZoom,
      Math.min(readableHeightZoom, overflowLimitedZoom, mermaidConstants.zoom.MAX_AUTO_FIT),
    ),
  )
}

export function resolveMermaidCanvasMetrics(input: {
  renderedWidth: number
  renderedHeight: number
  viewportSize: MermaidViewportSize
  canvasPadding: number
  panOverscan: number
}) {
  const contentWidth = input.renderedWidth + input.canvasPadding * 2
  const contentHeight = input.renderedHeight + input.canvasPadding * 2
  const canvasWidth = Math.max(
    contentWidth + input.panOverscan * 2,
    input.viewportSize.width + input.panOverscan * 2,
  )
  const canvasHeight = Math.max(
    contentHeight + input.panOverscan * 2,
    input.viewportSize.height + input.panOverscan * 2,
  )

  return {
    canvasWidth,
    canvasHeight,
    contentOffsetX: Math.max(input.canvasPadding, (canvasWidth - contentWidth) / 2),
    contentOffsetY: Math.max(input.canvasPadding, (canvasHeight - contentHeight) / 2),
    contentWidth,
    contentHeight,
  }
}

export function resolveMermaidCenteredScroll(input: {
  metrics: ReturnType<typeof resolveMermaidCanvasMetrics>
  viewportSize: MermaidViewportSize
}) {
  return {
    left: Math.max(
      0,
      input.metrics.contentOffsetX + input.metrics.contentWidth / 2 - input.viewportSize.width / 2,
    ),
    top: Math.max(
      0,
      input.metrics.contentOffsetY +
        input.metrics.contentHeight / 2 -
        input.viewportSize.height / 2,
    ),
  }
}

function mountSvgMarkup(host: HTMLDivElement | null, result: MermaidRenderResult) {
  if (!host) return

  if (host.innerHTML === result.svg) {
    return
  }

  host.innerHTML = result.svg
  result.bindFunctions?.(host)
}

export function useMermaidViewport({
  value,
  enabled = true,
  canvasPadding,
  panOverscan,
  defaultZoomMode = "fit",
  getFitPadding,
  mountSvg = true,
  responsiveAutoZoomStrategy,
  zoomState,
  onZoomStateChange,
}: UseMermaidViewportOptions): MermaidViewportController {
  const isControlled = zoomState !== undefined && onZoomStateChange !== undefined
  const [internalZoomState, setInternalZoomState] = useState<MermaidViewportZoomState>({
    zoom: mermaidConstants.zoom.DEFAULT,
    isAutoZoom: true,
  })
  const resolvedZoomState = isControlled ? zoomState : internalZoomState
  const zoom = resolvedZoomState.zoom
  const isAutoZoom = resolvedZoomState.isAutoZoom
  const [isInitialized, setIsInitialized] = useState(false)
  const [svgBounds, setSvgBounds] = useState<MermaidSvgBounds>({
    width: mermaidConstants.svg.DEFAULT_WIDTH,
    height: mermaidConstants.svg.DEFAULT_HEIGHT,
  })
  const [viewportSize, setViewportSize] = useState<MermaidViewportSize>({
    width: 0,
    height: 0,
  })
  const [isDragging, setIsDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const svgHostRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
  const autoFitRef = useRef(true)
  const resetScrollPositionRef = useRef(true)
  const initializedRef = useRef(false)
  const fitFrameRef = useRef<number | undefined>(undefined)
  const dragAbortControllerRef = useRef<AbortController | undefined>(undefined)
  const activePointerIDRef = useRef<number | undefined>(undefined)

  const commitZoomState = useCallback(
    (next: MermaidViewportZoomState) => {
      autoFitRef.current = next.isAutoZoom
      if (isControlled) {
        onZoomStateChange(next)
        return
      }

      setInternalZoomState(next)
    },
    [isControlled, onZoomStateChange],
  )

  const applyAutoZoom = useCallback(() => {
    const viewportSize = readViewportSize(viewportRef.current)
    if (!viewportSize) {
      commitZoomState({
        zoom: mermaidConstants.zoom.DEFAULT,
        isAutoZoom: true,
      })
      return
    }

    const fitPadding = getFitPadding?.(viewportSize) ?? ZERO_FIT_PADDING
    commitZoomState({
      zoom: resolveMermaidAutoZoom({
        defaultZoomMode,
        svgBounds,
        viewportSize,
        canvasPadding,
        fitPadding,
        responsiveAutoZoomStrategy,
      }),
      isAutoZoom: true,
    })

    if (!initializedRef.current) {
      initializedRef.current = true
      setIsInitialized(true)
    }
  }, [
    canvasPadding,
    commitZoomState,
    defaultZoomMode,
    getFitPadding,
    responsiveAutoZoomStrategy,
    svgBounds,
  ])

  const scheduleAutoZoom = useCallback(() => {
    if (!enabled || value === undefined) {
      return
    }

    if (typeof window === "undefined") {
      applyAutoZoom()
      return
    }

    if (!initializedRef.current) {
      applyAutoZoom()
      return
    }

    if (typeof window.requestAnimationFrame !== "function") {
      applyAutoZoom()
      return
    }

    if (fitFrameRef.current !== undefined) {
      window.cancelAnimationFrame(fitFrameRef.current)
    }

    fitFrameRef.current = window.requestAnimationFrame(() => {
      fitFrameRef.current = undefined
      if (autoFitRef.current) {
        applyAutoZoom()
      }
    })
  }, [applyAutoZoom, enabled, value])

  useEffect(() => {
    if (!mountSvg || !enabled || value === undefined) {
      return
    }

    mountSvgMarkup(svgHostRef.current, value)
  }, [enabled, mountSvg, value])

  useEffect(() => {
    if (!enabled || value === undefined) {
      return
    }

    resetScrollPositionRef.current = true
    setSvgBounds(measureSvgBounds(value.svg))

    if (isControlled) {
      autoFitRef.current = resolvedZoomState.isAutoZoom
      initializedRef.current = true
      setIsInitialized(true)
      return
    }

    autoFitRef.current = true
    initializedRef.current = false
    setIsInitialized(false)
    setInternalZoomState({
      zoom: mermaidConstants.zoom.DEFAULT,
      isAutoZoom: true,
    })
  }, [enabled, isControlled, resolvedZoomState.isAutoZoom, value])

  useEffect(() => {
    if (!isControlled) {
      return
    }

    autoFitRef.current = resolvedZoomState.isAutoZoom
  }, [isControlled, resolvedZoomState.isAutoZoom])

  useEffect(() => {
    if (!enabled || value === undefined) {
      return
    }

    if (isControlled) {
      if (
        !resolvedZoomState.isAutoZoom ||
        resolvedZoomState.zoom !== mermaidConstants.zoom.DEFAULT
      ) {
        return
      }
    }

    scheduleAutoZoom()
  }, [
    enabled,
    isControlled,
    resolvedZoomState.isAutoZoom,
    resolvedZoomState.zoom,
    scheduleAutoZoom,
    svgBounds,
    value,
  ])

  useEffect(() => {
    if (!enabled || value === undefined || !viewportRef.current) {
      return
    }

    const viewport = viewportRef.current
    const updateViewportSize = () => {
      const nextViewportSize = readViewportSize(viewport)
      if (!nextViewportSize) {
        return
      }

      setViewportSize((currentViewportSize) => {
        if (
          currentViewportSize.width === nextViewportSize.width &&
          currentViewportSize.height === nextViewportSize.height
        ) {
          return currentViewportSize
        }

        return nextViewportSize
      })
    }

    const handleViewportChange = () => {
      updateViewportSize()
      if (autoFitRef.current) {
        scheduleAutoZoom()
      }
    }

    updateViewportSize()

    const cleanupCallbacks: Array<() => void> = []

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(handleViewportChange)
      observer.observe(viewport)
      cleanupCallbacks.push(() => observer.disconnect())
    }

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleViewportChange)
      cleanupCallbacks.push(() => window.removeEventListener("resize", handleViewportChange))
    }

    return () => {
      for (const cleanup of cleanupCallbacks) {
        cleanup()
      }
    }
  }, [enabled, scheduleAutoZoom, value])

  useEffect(() => {
    if (
      !enabled ||
      value === undefined ||
      !resetScrollPositionRef.current ||
      !viewportRef.current ||
      !initializedRef.current
    ) {
      return
    }

    const renderedWidth = svgBounds.width * zoom
    const renderedHeight = svgBounds.height * zoom
    const metrics = resolveMermaidCanvasMetrics({
      renderedWidth,
      renderedHeight,
      viewportSize,
      canvasPadding,
      panOverscan,
    })
    const scroll = resolveMermaidCenteredScroll({ metrics, viewportSize })
    viewportRef.current.scrollLeft = scroll.left
    viewportRef.current.scrollTop = scroll.top
    resetScrollPositionRef.current = false
  }, [canvasPadding, enabled, panOverscan, svgBounds, value, viewportSize, zoom])

  useEffect(() => {
    return () => {
      dragAbortControllerRef.current?.abort()
      if (
        fitFrameRef.current !== undefined &&
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(fitFrameRef.current)
      }
    }
  }, [])

  const finishDrag = useCallback((pointerID?: number) => {
    dragAbortControllerRef.current?.abort()
    dragAbortControllerRef.current = undefined

    const viewport = viewportRef.current
    if (
      viewport &&
      pointerID !== undefined &&
      typeof viewport.hasPointerCapture === "function" &&
      viewport.hasPointerCapture(pointerID)
    ) {
      viewport.releasePointerCapture(pointerID)
    }

    activePointerIDRef.current = undefined
    setIsDragging(false)
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !viewportRef.current) {
        return
      }

      dragAbortControllerRef.current?.abort()
      const viewport = viewportRef.current
      const controller = new AbortController()
      dragAbortControllerRef.current = controller
      activePointerIDRef.current = event.pointerId

      setIsDragging(true)
      dragStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      }

      if (typeof viewport.setPointerCapture === "function") {
        viewport.setPointerCapture(event.pointerId)
      }

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== activePointerIDRef.current || !viewportRef.current) {
          return
        }

        pointerEvent.preventDefault()
        const dx = pointerEvent.clientX - dragStartRef.current.x
        const dy = pointerEvent.clientY - dragStartRef.current.y

        viewportRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx
        viewportRef.current.scrollTop = dragStartRef.current.scrollTop - dy
      }

      const handlePointerEnd = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== activePointerIDRef.current) {
          return
        }

        finishDrag(pointerEvent.pointerId)
      }

      viewport.addEventListener("pointermove", handlePointerMove, {
        signal: controller.signal,
      })
      viewport.addEventListener("pointerup", handlePointerEnd, {
        signal: controller.signal,
      })
      viewport.addEventListener("pointercancel", handlePointerEnd, {
        signal: controller.signal,
      })
      viewport.addEventListener("lostpointercapture", handlePointerEnd, {
        signal: controller.signal,
      })
    },
    [finishDrag],
  )

  useEffect(() => {
    if (!enabled && activePointerIDRef.current !== undefined) {
      finishDrag(activePointerIDRef.current)
    }
  }, [enabled, finishDrag])

  const zoomIn = useCallback(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      setIsInitialized(true)
    }
    commitZoomState({
      zoom: clampZoom(zoom + mermaidConstants.zoom.STEP),
      isAutoZoom: false,
    })
  }, [commitZoomState, zoom])

  const zoomOut = useCallback(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      setIsInitialized(true)
    }
    commitZoomState({
      zoom: clampZoom(zoom - mermaidConstants.zoom.STEP),
      isAutoZoom: false,
    })
  }, [commitZoomState, zoom])

  const resetZoom = useCallback(() => {
    resetScrollPositionRef.current = true
    commitZoomState({
      zoom,
      isAutoZoom: true,
    })
    scheduleAutoZoom()
  }, [commitZoomState, scheduleAutoZoom, zoom])

  const renderedWidth = svgBounds.width * zoom
  const renderedHeight = svgBounds.height * zoom
  const canvasMetrics = resolveMermaidCanvasMetrics({
    renderedWidth,
    renderedHeight,
    viewportSize,
    canvasPadding,
    panOverscan,
  })

  return {
    viewportRef,
    svgHostRef,
    svgBounds,
    renderedWidth,
    renderedHeight,
    canvasWidth: canvasMetrics.canvasWidth,
    canvasHeight: canvasMetrics.canvasHeight,
    contentOffsetX: canvasMetrics.contentOffsetX,
    contentOffsetY: canvasMetrics.contentOffsetY,
    canvasPadding,
    zoom,
    zoomLabel: `${Math.round(zoom * 100)}%`,
    isAutoZoom,
    isInitialized,
    isDragging,
    canZoomIn: zoom < mermaidConstants.zoom.MAX,
    canZoomOut: zoom > mermaidConstants.zoom.MIN,
    handlePointerDown,
    zoomIn,
    zoomOut,
    resetZoom,
  }
}
