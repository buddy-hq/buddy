import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  cn,
} from "@buddy/ui"
import { useCallback, useEffect, useRef, useState } from "react"
import { language } from "@/context/language"
import type { MermaidRenderResult } from "./lib/render"
import { mermaidConstants } from "./constants"

export type MermaidSvgBounds = {
  width: number
  height: number
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

type MermaidFullscreenDialogProps = {
  value: MermaidRenderResult | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  alt: string
}

export function MermaidFullscreenDialog({
  value,
  open,
  onOpenChange,
  alt,
}: MermaidFullscreenDialogProps) {
  const [zoom, setZoom] = useState<number>(mermaidConstants.zoom.DEFAULT)
  const [svgBounds, setSvgBounds] = useState<MermaidSvgBounds>({
    width: mermaidConstants.svg.DEFAULT_WIDTH,
    height: mermaidConstants.svg.DEFAULT_HEIGHT,
  })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  const fullscreenSvgHostRef = useRef<HTMLDivElement | null>(null)
  const fullscreenViewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open || value === undefined) return
    const bounds = measureSvgBounds(value.svg)
    setSvgBounds(bounds)
  }, [open, value])

  useEffect(() => {
    if (!open || value === undefined || !fullscreenSvgHostRef.current) return
    value.bindFunctions?.(fullscreenSvgHostRef.current)
  }, [open, value])

  const fitZoom = useCallback(() => {
    const viewportWidth =
      fullscreenViewportRef.current?.clientWidth && fullscreenViewportRef.current.clientWidth > 0
        ? fullscreenViewportRef.current.clientWidth
        : window.innerWidth
    const viewportHeight =
      fullscreenViewportRef.current?.clientHeight && fullscreenViewportRef.current.clientHeight > 0
        ? fullscreenViewportRef.current.clientHeight
        : window.innerHeight

    const horizontalPadding =
      viewportWidth >= mermaidConstants.layout.BREAKPOINT_LG
        ? mermaidConstants.layout.PADDING_LG_H
        : viewportWidth >= mermaidConstants.layout.BREAKPOINT_MD
          ? mermaidConstants.layout.PADDING_MD_H
          : mermaidConstants.layout.PADDING_SM_H
    const verticalPadding =
      viewportHeight >= mermaidConstants.layout.BREAKPOINT_MD
        ? mermaidConstants.layout.PADDING_LG_V
        : mermaidConstants.layout.PADDING_SM_V
    const availableWidth = viewportWidth - horizontalPadding
    const availableHeight = viewportHeight - verticalPadding

    if (availableWidth <= 0 || availableHeight <= 0) {
      setZoom(mermaidConstants.zoom.DEFAULT)
      return
    }

    setZoom(
      clampZoom(
        Math.min(
          availableWidth / svgBounds.width,
          availableHeight / svgBounds.height,
          mermaidConstants.zoom.MAX_AUTO_FIT,
        ),
      ),
    )
  }, [svgBounds.height, svgBounds.width])

  useEffect(() => {
    if (!open || value === undefined) return

    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(() => {
        fitZoom()
      })
      return () => window.cancelAnimationFrame(frame)
    }

    const timeout = window.setTimeout(() => {
      fitZoom()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [fitZoom, open, value])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!fullscreenViewportRef.current) return
    setIsDragging(true)
    dragStartRef.current = {
      x: e.pageX,
      y: e.pageY,
      scrollLeft: fullscreenViewportRef.current.scrollLeft,
      scrollTop: fullscreenViewportRef.current.scrollTop,
    }
  }, [])

  useEffect(() => {
    if (!open || !isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!fullscreenViewportRef.current) return
      const dx = e.pageX - dragStartRef.current.x
      const dy = e.pageY - dragStartRef.current.y
      fullscreenViewportRef.current.scrollLeft = dragStartRef.current.scrollLeft + dx
      fullscreenViewportRef.current.scrollTop = dragStartRef.current.scrollTop + dy
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, open])

  const zoomIn = useCallback(() => {
    setZoom((current) => clampZoom(current + mermaidConstants.zoom.STEP))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((current) => clampZoom(current - mermaidConstants.zoom.STEP))
  }, [])

  const resetZoom = useCallback(() => {
    fitZoom()
  }, [fitZoom])

  const zoomLabel = useCallback(() => {
    return `${Math.round(zoom * 100)}%`
  }, [zoom])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setZoom(mermaidConstants.zoom.DEFAULT)
        }
      }}
    >
      {/* TODO: Portal inheritance hack - see header comment below */}
      <DialogContent
        showCloseButton={false}
        className="dark h-[100dvh] w-[100vw] max-w-none gap-0 overflow-hidden border-0 bg-background-base p-0 ring-0 sm:max-w-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{alt}</DialogTitle>
          <DialogDescription>
            {language.t("chatTools.mermaidDiagram.fullscreenDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-full overflow-hidden bg-background-base">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:40px_40px] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]" />

          {/* TODO: Root cause investigation needed - text tokens are resolving to light-mode values inside the Portal. Forcing dark class & inline colors as a workaround. */}
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 p-4 md:px-6 md:py-6 dark">
            <div className="flex min-w-0 flex-col">
              <p
                className="truncate text-sm font-bold text-text-invert-base md:text-base"
                style={{ color: "white" }}
              >
                {alt}
              </p>
              <p
                className="truncate text-xs font-medium text-text-invert-base/60"
                style={{ color: "rgba(255, 255, 255, 0.6)" }}
              >
                {language.t("chatTools.mermaidDiagram.fullscreenHint")}
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-xl border border-border-base/60 bg-surface-base/80 p-1 shadow-sm backdrop-blur-md">
              <Button
                type="button"
                data-action="mermaid-zoom-out"
                size="sm"
                variant="ghost"
                className="h-8 w-8 rounded-lg"
                aria-label={language.t("chatTools.mermaidDiagram.zoomOutAria")}
                onClick={zoomOut}
                disabled={zoom <= mermaidConstants.zoom.MIN}
              >
                -
              </Button>
              <div
                className="px-2 text-[13px] font-medium text-text-base"
                aria-label={language.t("chatTools.mermaidDiagram.zoomLevelAria")}
              >
                {zoomLabel()}
              </div>
              <Button
                type="button"
                data-action="mermaid-zoom-in"
                size="sm"
                variant="ghost"
                className="h-8 w-8 rounded-lg"
                aria-label={language.t("chatTools.mermaidDiagram.zoomInAria")}
                onClick={zoomIn}
                disabled={zoom >= mermaidConstants.zoom.MAX}
              >
                +
              </Button>
              <div className="mx-1 h-4 w-px bg-border-base/50" />
              <Button
                type="button"
                data-action="mermaid-fit"
                size="sm"
                variant="ghost"
                className="h-8 px-3 rounded-lg text-[13px]"
                aria-label={language.t("chatTools.mermaidDiagram.resetZoomAria")}
                onClick={resetZoom}
              >
                {language.t("chatTools.mermaidDiagram.fit")}
              </Button>
              <DialogClose asChild>
                <Button
                  type="button"
                  data-action="mermaid-close-fullscreen"
                  size="sm"
                  variant="ghost"
                  className="h-8 px-3 rounded-lg text-[13px]"
                  aria-label={language.t("chatTools.mermaidDiagram.closeFullscreenAria")}
                >
                  {language.t("chatTools.mermaidDiagram.close")}
                </Button>
              </DialogClose>
            </div>
          </div>

          {value === undefined ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-text-weak">
              {language.t("chatTools.mermaidDiagram.rendering")}
            </div>
          ) : (
            <div
              ref={fullscreenViewportRef}
              className={cn(
                "relative h-full overflow-auto px-5 pb-6 pt-28 md:px-8 md:pt-32",
                isDragging ? "cursor-grabbing select-none" : "cursor-grab",
              )}
              onMouseDown={handleMouseDown}
            >
              <div className="relative flex min-h-full min-w-full overflow-visible">
                <div
                  ref={fullscreenSvgHostRef}
                  data-component="mermaid-diagram-fullscreen"
                  role="img"
                  aria-label={`${alt} ${language.t("chatTools.mermaidDiagram.fullscreenAriaSuffix")}`}
                  className="m-auto flex shrink-0 items-center justify-center p-10 md:p-20 [&_svg]:!block [&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none"
                  style={{
                    width: `calc(${svgBounds.width * zoom}px + (var(--p-v, 80px) * 2))`,
                    height: `calc(${svgBounds.height * zoom}px + (var(--p-h, 160px) * 2))`,
                  }}
                  dangerouslySetInnerHTML={{ __html: value.svg }}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
