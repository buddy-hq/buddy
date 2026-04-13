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

type UseMermaidViewportOptions = {
  value: MermaidRenderResult | undefined
  enabled?: boolean
  canvasPadding: number
  panOverscan: number
  defaultZoomMode?: MermaidDefaultZoomMode
  getFitPadding?: (viewport: MermaidViewportSize) => MermaidViewportFitPadding
  mountSvg?: boolean
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
}: UseMermaidViewportOptions): MermaidViewportController {
  const [zoom, setZoom] = useState<number>(mermaidConstants.zoom.DEFAULT)
  const [isAutoZoom, setIsAutoZoom] = useState(true)
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

  const applyAutoZoom = useCallback(() => {
    const viewportSize = readViewportSize(viewportRef.current)
    if (!viewportSize) {
      setZoom(mermaidConstants.zoom.DEFAULT)
      return
    }

    const fitPadding = getFitPadding?.(viewportSize) ?? ZERO_FIT_PADDING
    const availableWidth = viewportSize.width - fitPadding.horizontal - canvasPadding * 2
    const availableHeight = viewportSize.height - fitPadding.vertical - canvasPadding * 2

    if (availableWidth <= 0 || availableHeight <= 0) {
      setZoom(mermaidConstants.zoom.DEFAULT)
      return
    }

    const nextZoom =
      defaultZoomMode === "responsive"
        ? Math.min(mermaidConstants.zoom.DEFAULT, availableWidth / svgBounds.width)
        : Math.min(
            availableWidth / svgBounds.width,
            availableHeight / svgBounds.height,
            mermaidConstants.zoom.MAX_AUTO_FIT,
          )

    setZoom(clampZoom(nextZoom))

    if (!initializedRef.current) {
      initializedRef.current = true
      setIsInitialized(true)
    }
  }, [canvasPadding, defaultZoomMode, getFitPadding, svgBounds.height, svgBounds.width])

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

    autoFitRef.current = true
    resetScrollPositionRef.current = true
    initializedRef.current = false
    setIsInitialized(false)
    setIsAutoZoom(true)
    setSvgBounds(measureSvgBounds(value.svg))
  }, [enabled, value])

  useEffect(() => {
    if (!enabled || value === undefined) {
      return
    }

    scheduleAutoZoom()
  }, [enabled, scheduleAutoZoom, svgBounds, value])

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

    viewportRef.current.scrollLeft = panOverscan
    viewportRef.current.scrollTop = panOverscan
    resetScrollPositionRef.current = false
  }, [enabled, panOverscan, value, viewportSize.height, viewportSize.width, zoom])

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
    autoFitRef.current = false
    setIsAutoZoom(false)
    if (!initializedRef.current) {
      initializedRef.current = true
      setIsInitialized(true)
    }
    setZoom((current) => clampZoom(current + mermaidConstants.zoom.STEP))
  }, [])

  const zoomOut = useCallback(() => {
    autoFitRef.current = false
    setIsAutoZoom(false)
    if (!initializedRef.current) {
      initializedRef.current = true
      setIsInitialized(true)
    }
    setZoom((current) => clampZoom(current - mermaidConstants.zoom.STEP))
  }, [])

  const resetZoom = useCallback(() => {
    autoFitRef.current = true
    resetScrollPositionRef.current = true
    setIsAutoZoom(true)
    scheduleAutoZoom()
  }, [scheduleAutoZoom])

  const renderedWidth = svgBounds.width * zoom
  const renderedHeight = svgBounds.height * zoom
  const contentWidth = renderedWidth + canvasPadding * 2
  const contentHeight = renderedHeight + canvasPadding * 2
  const canvasWidth = Math.max(contentWidth + panOverscan * 2, viewportSize.width + panOverscan * 2)
  const canvasHeight = Math.max(
    contentHeight + panOverscan * 2,
    viewportSize.height + panOverscan * 2,
  )

  return {
    viewportRef,
    svgHostRef,
    svgBounds,
    renderedWidth,
    renderedHeight,
    canvasWidth,
    canvasHeight,
    contentOffsetX: panOverscan,
    contentOffsetY: panOverscan,
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
