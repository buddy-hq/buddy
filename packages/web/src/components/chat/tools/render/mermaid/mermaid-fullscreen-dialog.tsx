import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@buddy/ui"
import { useCallback, useEffect, useRef, useState } from "react"
import { language } from "@/context/language"
import type { MermaidRenderResult } from "../../../../../lib/mermaid/render"

export const DEFAULT_SVG_BOUNDS = {
  width: 1200,
  height: 800,
} as const

export type MermaidSvgBounds = {
  width: number
  height: number
}

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3.5
export const ZOOM_STEP = 0.2

function clampZoom(input: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, input))
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
    return DEFAULT_SVG_BOUNDS
  }

  try {
    const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml")
    const svg = parsed.querySelector("svg")
    if (!svg) {
      return DEFAULT_SVG_BOUNDS
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
    return DEFAULT_SVG_BOUNDS
  }

  return DEFAULT_SVG_BOUNDS
}

interface MermaidFullscreenDialogProps {
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
  const [zoom, setZoom] = useState(1)
  const [svgBounds, setSvgBounds] = useState<MermaidSvgBounds>(DEFAULT_SVG_BOUNDS)
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

    const horizontalPadding = viewportWidth >= 1024 ? 220 : viewportWidth >= 768 ? 160 : 96
    const verticalPadding = viewportHeight >= 768 ? 190 : 128
    const availableWidth = viewportWidth - horizontalPadding
    const availableHeight = viewportHeight - verticalPadding

    if (availableWidth <= 0 || availableHeight <= 0) {
      setZoom(1)
      return
    }

    setZoom(
      clampZoom(
        Math.min(availableWidth / svgBounds.width, availableHeight / svgBounds.height, 2.25),
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

  const zoomIn = useCallback(() => {
    setZoom((current) => clampZoom(current + ZOOM_STEP))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((current) => clampZoom(current - ZOOM_STEP))
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
          setZoom(1)
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="h-[100dvh] w-[100vw] max-w-none gap-0 overflow-hidden border-0 bg-background-base/96 p-0 ring-0 sm:max-w-none"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{alt}</DialogTitle>
          <DialogDescription>
            {language.t("chatTools.mermaidDiagram.fullscreenDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_18%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.04),transparent_16%),radial-gradient(circle_at_bottom_center,rgba(52,211,153,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] opacity-20" />

          <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4 md:p-6">
            <div className="max-w-sm rounded-2xl border border-border-base/70 bg-background-base/78 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <p className="truncate text-lg font-semibold text-text-base">{alt}</p>
              <p className="mt-1 text-sm text-text-weak">
                {language.t("chatTools.mermaidDiagram.fullscreenHint")}
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-border-base/70 bg-background-base/82 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <Button
                type="button"
                data-action="mermaid-zoom-out"
                size="sm"
                variant="outline"
                aria-label={language.t("chatTools.mermaidDiagram.zoomOutAria")}
                onClick={zoomOut}
                disabled={zoom <= MIN_ZOOM}
              >
                -
              </Button>
              <div
                className="rounded-xl border border-border-base/60 bg-surface-raised-base/60 px-3 py-1.5 text-sm font-medium text-text-base"
                aria-label={language.t("chatTools.mermaidDiagram.zoomLevelAria")}
              >
                {zoomLabel()}
              </div>
              <Button
                type="button"
                data-action="mermaid-zoom-in"
                size="sm"
                variant="outline"
                aria-label={language.t("chatTools.mermaidDiagram.zoomInAria")}
                onClick={zoomIn}
                disabled={zoom >= MAX_ZOOM}
              >
                +
              </Button>
              <Button
                type="button"
                data-action="mermaid-fit"
                size="sm"
                variant="outline"
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
                  variant="outline"
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
              className="relative h-full overflow-auto px-5 pb-6 pt-28 md:px-8 md:pt-32"
            >
              <div className="flex min-h-full w-max min-w-full items-center justify-center">
                <div className="rounded-[28px] border border-border-base/60 bg-surface-raised-base/18 p-4 shadow-[0_32px_100px_rgba(0,0,0,0.5)] backdrop-blur-sm md:p-6">
                  <div className="rounded-[22px] border border-border-base/60 bg-background-base/96 p-3 md:p-5">
                    <div data-component="mermaid-diagram-fullscreen-scale" className="w-max">
                      <div
                        ref={fullscreenSvgHostRef}
                        data-component="mermaid-diagram-fullscreen"
                        role="img"
                        aria-label={`${alt} ${language.t("chatTools.mermaidDiagram.fullscreenAriaSuffix")}`}
                        className="w-max [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                        style={{
                          width: `${svgBounds.width * zoom}px`,
                          height: `${svgBounds.height * zoom}px`,
                        }}
                        dangerouslySetInnerHTML={{ __html: value.svg }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
