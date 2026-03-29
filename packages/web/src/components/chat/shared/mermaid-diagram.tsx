import {
  Button,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ExpandIcon,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@buddy/ui"
import { motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { language } from "@/context/language"
import { renderMermaidSvg, type MermaidRenderResult } from "../../../lib/mermaid/render"

const VOID_HTML_TAG_PATTERN =
  /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(\s[^>]*?)?\s*\/?>/giu
const DEFAULT_SVG_BOUNDS = {
  width: 1200,
  height: 800,
}

type MermaidDiagramState =
  | {
      status: "loading"
    }
  | {
      status: "ready"
      value: MermaidRenderResult
    }
  | {
      status: "error"
      message: string
    }

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3.5
const ZOOM_STEP = 0.2
type MermaidSvgBounds = typeof DEFAULT_SVG_BOUNDS
const DIAGRAM_REVEAL_SPRING = { type: "spring", stiffness: 300, damping: 30, mass: 1 } as const

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim()
  }
  return language.t("chatTools.mermaidDiagram.renderErrorDefault")
}

function normalizeSvgMarkupForDownload(svgMarkup: string): string {
  return svgMarkup.replace(VOID_HTML_TAG_PATTERN, (_fullMatch, tagName, attributes = "") => {
    return `<${String(tagName).toLowerCase()}${String(attributes)} />`
  })
}

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

function mountSvg(host: HTMLDivElement | null, value: MermaidRenderResult) {
  if (!host) {
    return
  }

  host.innerHTML = value.svg
  value.bindFunctions?.(host)
}

function DiagramActionButton(props: {
  label: string
  onClick: () => void
  icon: JSX.Element
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        disabled={props.disabled}
        aria-label={props.label}
        onClick={(event) => {
          event.stopPropagation()
          props.onClick()
        }}
        onMouseDown={(event) => event.preventDefault()}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border-base/70 bg-background-base/88 text-text-weak shadow-[0_12px_32px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-colors hover:bg-surface-raised-base hover:text-text-base disabled:pointer-events-none disabled:opacity-50"
      >
        {props.icon}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <p>{props.label}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function MermaidDiagram(props: {
  source: string
  alt: string
  artifactID?: string
  className?: string
  failureClassName?: string
  showRawSourceOnError?: boolean
  rawSourceClassName?: string
  hideLoadingPlaceholder?: boolean
}) {
  const [state, setState] = useState<MermaidDiagramState>({ status: "loading" })
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied">("idle")
  const [downloadFeedback, setDownloadFeedback] = useState<"idle" | "downloaded">("idle")
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [svgBounds, setSvgBounds] = useState<MermaidSvgBounds>(DEFAULT_SVG_BOUNDS)
  const copyResetTimeoutRef = useRef<number | undefined>(undefined)
  const downloadResetTimeoutRef = useRef<number | undefined>(undefined)
  const svgHostRef = useRef<HTMLDivElement | null>(null)
  const fullscreenSvgHostRef = useRef<HTMLDivElement | null>(null)
  const fullscreenViewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== undefined) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
      if (downloadResetTimeoutRef.current !== undefined) {
        window.clearTimeout(downloadResetTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })
    setSvgBounds(DEFAULT_SVG_BOUNDS)
    setZoom(1)

    void renderMermaidSvg({
      source: props.source,
      artifactID: props.artifactID,
    })
      .then((value) => {
        if (cancelled) return
        setSvgBounds(measureSvgBounds(value.svg))
        setState({
          status: "ready",
          value,
        })
      })
      .catch((error) => {
        if (cancelled) return
        setState({
          status: "error",
          message: errorMessage(error),
        })
      })

    return () => {
      cancelled = true
    }
  }, [props.artifactID, props.source])

  useEffect(() => {
    if (state.status !== "ready") {
      return
    }
    mountSvg(svgHostRef.current, state.value)
  }, [state])

  useEffect(() => {
    if (!fullscreenOpen || state.status !== "ready" || !fullscreenSvgHostRef.current) {
      return
    }
    state.value.bindFunctions?.(fullscreenSvgHostRef.current)
  }, [fullscreenOpen, state])

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
    if (!fullscreenOpen || state.status !== "ready") {
      return
    }

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
  }, [fitZoom, fullscreenOpen, state.status])

  async function copyMermaidSource() {
    if (!("clipboard" in navigator)) return

    try {
      await navigator.clipboard.writeText(props.source)
      setCopyFeedback("copied")
      if (copyResetTimeoutRef.current !== undefined) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
      copyResetTimeoutRef.current = window.setTimeout(() => setCopyFeedback("idle"), 2000)
    } catch {
      // ignore clipboard failures
    }
  }

  function downloadFileName() {
    const suffix = props.artifactID
      ? props.artifactID.slice(0, 8)
      : language.t("chatTools.mermaidDiagram.downloadFallbackSuffix")
    return `mermaid-${suffix}.svg`
  }

  function downloadRenderedSvg() {
    if (state.status !== "ready") return

    const renderedSvg =
      svgHostRef.current?.querySelector("svg")?.outerHTML ??
      svgHostRef.current?.innerHTML ??
      state.value.svg
    const normalizedSvg = normalizeSvgMarkupForDownload(renderedSvg)

    const blob = new Blob([normalizedSvg], {
      type: "image/svg+xml;charset=utf-8",
    })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = objectUrl
    link.download = downloadFileName()
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)

    setDownloadFeedback("downloaded")
    if (downloadResetTimeoutRef.current !== undefined) {
      window.clearTimeout(downloadResetTimeoutRef.current)
    }
    downloadResetTimeoutRef.current = window.setTimeout(() => setDownloadFeedback("idle"), 2000)
  }

  function zoomIn() {
    setZoom((current) => clampZoom(current + ZOOM_STEP))
  }

  function zoomOut() {
    setZoom((current) => clampZoom(current - ZOOM_STEP))
  }

  function resetZoom() {
    fitZoom()
  }

  function zoomLabel() {
    return `${Math.round(zoom * 100)}%`
  }

  return (
    <div className={props.className}>
      {state.status === "loading" ? (
        props.hideLoadingPlaceholder ? (
          <div aria-hidden className="min-h-6" />
        ) : (
          <div className="flex min-h-48 items-center justify-center text-sm text-text-weak">
            {language.t("chatTools.mermaidDiagram.rendering")}
          </div>
        )
      ) : null}

      {state.status === "ready" ? (
        <motion.div
          className="overflow-hidden rounded-[14px]"
          initial={{ opacity: 0, y: 8, scale: 0.995 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={DIAGRAM_REVEAL_SPRING}
        >
          <div
            ref={svgHostRef}
            data-component="mermaid-diagram"
            role="img"
            aria-label={props.alt}
            className="max-h-[48vh] overflow-auto pr-2"
          />
          <TooltipProvider>
            <div className="mt-4 flex justify-end">
              <div className="flex items-center gap-1.5 rounded-full border border-border-base/70 bg-surface-raised-base/82 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                <DiagramActionButton
                  label={
                    copyFeedback === "copied"
                      ? language.t("chatTools.mermaidDiagram.copied")
                      : language.t("chatTools.mermaidDiagram.copyMermaid")
                  }
                  onClick={() => {
                    void copyMermaidSource()
                  }}
                  icon={
                    copyFeedback === "copied" ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <CopyIcon className="size-4" />
                    )
                  }
                />
                <DiagramActionButton
                  label={
                    downloadFeedback === "downloaded"
                      ? language.t("chatTools.mermaidDiagram.downloaded")
                      : language.t("chatTools.mermaidDiagram.downloadSvg")
                  }
                  onClick={downloadRenderedSvg}
                  icon={
                    downloadFeedback === "downloaded" ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <DownloadIcon className="size-4" />
                    )
                  }
                />
                <DiagramActionButton
                  label={language.t("chatTools.mermaidDiagram.openFullscreen")}
                  onClick={() => setFullscreenOpen(true)}
                  icon={<ExpandIcon className="size-4" />}
                />
              </div>
            </div>
          </TooltipProvider>
        </motion.div>
      ) : null}

      {state.status === "error" ? (
        <>
          <div
            className={
              props.failureClassName ??
              "rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base"
            }
          >
            {language.t("chatTools.mermaidDiagram.renderErrorPrefix")} {state.message}
          </div>
          {props.showRawSourceOnError ? (
            <pre
              className={
                props.rawSourceClassName ??
                "mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-2 text-xs text-text-base"
              }
            >
              <code>{props.source}</code>
            </pre>
          ) : null}
        </>
      ) : null}

      <Dialog
        open={fullscreenOpen}
        onOpenChange={(next) => {
          setFullscreenOpen(next)
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
            <DialogTitle>{props.alt}</DialogTitle>
            <DialogDescription>
              {language.t("chatTools.mermaidDiagram.fullscreenDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="relative h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_18%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.04),transparent_16%),radial-gradient(circle_at_bottom_center,rgba(52,211,153,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] opacity-20" />

            <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4 md:p-6">
              <div className="max-w-sm rounded-2xl border border-border-base/70 bg-background-base/78 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <p className="truncate text-lg font-semibold text-text-base">{props.alt}</p>
                <p className="mt-1 text-sm text-text-weak">
                  {language.t("chatTools.mermaidDiagram.fullscreenHint")}
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-border-base/70 bg-background-base/82 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <Button
                  type="button"
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
                    size="sm"
                    variant="outline"
                    aria-label={language.t("chatTools.mermaidDiagram.closeFullscreenAria")}
                  >
                    {language.t("chatTools.mermaidDiagram.close")}
                  </Button>
                </DialogClose>
              </div>
            </div>

            {state.status === "loading" ? (
              <div className="flex h-full items-center justify-center p-8 text-sm text-text-weak">
                {language.t("chatTools.mermaidDiagram.rendering")}
              </div>
            ) : null}

            {state.status === "ready" ? (
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
                          aria-label={`${props.alt} ${language.t("chatTools.mermaidDiagram.fullscreenAriaSuffix")}`}
                          className="w-max [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                          style={{
                            width: `${svgBounds.width * zoom}px`,
                            height: `${svgBounds.height * zoom}px`,
                          }}
                          dangerouslySetInnerHTML={{ __html: state.value.svg }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {state.status === "error" ? (
              <div className="m-6 rounded-2xl border border-border-critical-base/40 bg-surface-critical-base/10 p-4 text-sm text-icon-critical-base shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
                {language.t("chatTools.mermaidDiagram.renderErrorPrefix")} {state.message}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
