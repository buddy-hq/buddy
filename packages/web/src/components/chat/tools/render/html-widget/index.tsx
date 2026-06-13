import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "@buddy/ui"
import {
  AppWindowIcon,
  ClipboardCopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react"
import { ArtifactCard } from "../../artifact-card"
import { ToolErrorPanel } from "../../tool-error-panel"
import { TextShimmer } from "../../text-shimmer"
import { ToolRow, ToolRowAction, ToolRowIcon } from "../../tool-row"
import {
  formatHtmlWidgetViewport,
  readHtmlWidgetOutputArtifact,
  readHtmlWidgetSource,
  type HtmlWidgetToolOutput,
  type HtmlWidgetViewport,
} from "@/lib/html-widgets"
import { resolveAssetUrl } from "@/lib/resource-url"
import { stringifyError } from "@/lib/api-client"
import type { ToolPartProps } from "../../registry"

const INLINE_MAX_HEIGHT_RATIO = 0.7
const INLINE_MAX_HEIGHT_PX = 720
const FULLSCREEN_CHROME_HEIGHT_PX = 160
const MIN_FULLSCREEN_HEIGHT_PX = 320
const MIN_VIEWPORT_CONTAINER_WIDTH_PX = 1
const FULLSCREEN_RECOMMENDED_SCALE = 0.78

type ViewportMode = "inline" | "fullscreen"

type ViewportSize = {
  width: number
  height: number
}

type HtmlWidgetFrameProps = {
  widget: HtmlWidgetToolOutput
  mode: ViewportMode
  reloadKey?: number
  className?: string
}

type HtmlWidgetActionProps = {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function readWindowViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return {
      width: 1024,
      height: 768,
    }
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function appendRenderKey(url: string, renderKey: number): string {
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}renderKey=${encodeURIComponent(String(renderKey))}`
}

function useWindowViewportSize(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(() => readWindowViewportSize())

  useEffect(() => {
    const handleResize = () => setSize(readWindowViewportSize())
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return size
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const updateWidth = () => {
      setWidth(element.getBoundingClientRect().width)
    }
    updateWidth()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth)
      return () => window.removeEventListener("resize", updateWidth)
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return {
    ref,
    width,
  }
}

function resolveAvailableHeight(mode: ViewportMode, windowSize: ViewportSize): number {
  if (mode === "fullscreen") {
    return Math.max(windowSize.height - FULLSCREEN_CHROME_HEIGHT_PX, MIN_FULLSCREEN_HEIGHT_PX)
  }

  return Math.min(windowSize.height * INLINE_MAX_HEIGHT_RATIO, INLINE_MAX_HEIGHT_PX)
}

function resolveViewportScale(input: {
  viewport: HtmlWidgetViewport
  mode: ViewportMode
  containerWidth: number
  windowSize: ViewportSize
}): number {
  const availableWidth = Math.max(
    input.containerWidth || input.viewport.width,
    MIN_VIEWPORT_CONTAINER_WIDTH_PX,
  )
  const availableHeight = resolveAvailableHeight(input.mode, input.windowSize)
  const fitScale = Math.min(
    availableWidth / input.viewport.width,
    availableHeight / input.viewport.height,
  )

  if (input.mode === "fullscreen") {
    return fitScale
  }

  return Math.min(1, fitScale)
}

function HtmlWidgetAction({ label, disabled, onClick, children }: HtmlWidgetActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-7 rounded-md"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function HtmlWidgetFrame({ widget, mode, reloadKey = 0, className }: HtmlWidgetFrameProps) {
  const container = useContainerWidth()
  const windowSize = useWindowViewportSize()
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const scale = resolveViewportScale({
    viewport: widget.viewport,
    mode,
    containerWidth: container.width,
    windowSize,
  })
  const scaledWidth = widget.viewport.width * scale
  const scaledHeight = widget.viewport.height * scale
  const runtimeUrl = useMemo(
    () => resolveAssetUrl(appendRenderKey(widget.runtimeUrl, reloadKey)),
    [reloadKey, widget.runtimeUrl],
  )
  const fullscreenRecommended = mode === "inline" && scale < FULLSCREEN_RECOMMENDED_SCALE

  useEffect(() => {
    setLoaded(false)
    setLoadError(false)
  }, [runtimeUrl])

  return (
    <div ref={container.ref} className={cn("w-full min-w-0", className)}>
      <div
        className="relative mx-auto overflow-hidden rounded-lg border border-border-base bg-background-base shadow-inner"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          maxWidth: "100%",
        }}
      >
        <iframe
          key={runtimeUrl}
          title={widget.title}
          src={runtimeUrl}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="block border-0 bg-background-base"
          style={{
            width: `${widget.viewport.width}px`,
            height: `${widget.viewport.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setLoadError(true)}
        />
        {!loaded && !loadError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-base">
            <Loader2Icon className="size-5 animate-spin text-text-weak" aria-hidden />
          </div>
        ) : null}
        {loadError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-base p-4 text-center text-sm text-text-weak">
            Widget failed to load.
          </div>
        ) : null}
        {fullscreenRecommended ? (
          <div className="absolute right-2 bottom-2 rounded-md border border-border-base bg-surface-base px-2 py-1 text-[11px] font-medium text-text-weak shadow-sm">
            Fullscreen recommended
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-center text-[11px] text-text-weak">
        {formatHtmlWidgetViewport(widget.viewport)}
      </div>
      {mode === "inline" ? (
        <div className="sr-only" aria-live="polite">
          {fullscreenRecommended ? "Open fullscreen for the intended widget size." : ""}
        </div>
      ) : null}
    </div>
  )
}

function HtmlWidgetFullscreenDialog(props: {
  widget: HtmlWidgetToolOutput
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-3rem)] max-w-[calc(100vw-3rem)] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border-base px-4 py-3">
          <DialogTitle className="truncate text-sm">{props.widget.title}</DialogTitle>
          <DialogDescription className="sr-only">
            HTML widget fullscreen preview
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden bg-surface-base p-4">
          <HtmlWidgetFrame widget={props.widget} mode="fullscreen" className="h-full" />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function HtmlWidgetCard(props: {
  widget: HtmlWidgetToolOutput
  directory?: string
  status?: ToolPartProps["state"]["status"]
  hideStatus?: boolean
}) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [copying, setCopying] = useState(false)
  const [frameKey, setFrameKey] = useState(0)

  const copySource = useCallback(async () => {
    if (!props.directory) return

    setCopying(true)
    try {
      const source = await readHtmlWidgetSource({
        directory: props.directory,
        artifactID: props.widget.artifactID,
      })
      await navigator.clipboard.writeText(source)
      toast("Widget source copied")
    } catch (error) {
      toast(stringifyError(error))
    } finally {
      setCopying(false)
    }
  }, [props.directory, props.widget.artifactID])

  const actions = (
    <div className="flex items-center gap-1">
      <HtmlWidgetAction label="Reload widget" onClick={() => setFrameKey((current) => current + 1)}>
        <RefreshCwIcon className="size-3.5" aria-hidden />
      </HtmlWidgetAction>
      {props.directory ? (
        <HtmlWidgetAction label="Copy source" disabled={copying} onClick={() => void copySource()}>
          {copying ? (
            <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ClipboardCopyIcon className="size-3.5" aria-hidden />
          )}
        </HtmlWidgetAction>
      ) : null}
      <HtmlWidgetAction label="Open fullscreen" onClick={() => setFullscreenOpen(true)}>
        <ExternalLinkIcon className="size-3.5" aria-hidden />
      </HtmlWidgetAction>
    </div>
  )

  return (
    <>
      <ArtifactCard
        title={props.widget.title}
        subtitle={props.widget.description ?? props.widget.sourcePath}
        badge="HTML"
        status={props.status}
        hideStatus={props.hideStatus}
        actions={actions}
        contentClassName="bg-surface-base"
        headerPosition="bottom"
      >
        <div className="p-3">
          <HtmlWidgetFrame widget={props.widget} mode="inline" reloadKey={frameKey} />
        </div>
      </ArtifactCard>
      <HtmlWidgetFullscreenDialog
        widget={props.widget}
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
      />
    </>
  )
}

export function renderPresentHtmlWidgetTool(props: ToolPartProps) {
  const output = props.state.output || (props.state.error ?? "")
  const showOutput = output.trim().length > 0
  const running = props.state.status === "pending" || props.state.status === "running"
  const widget =
    props.state.status === "completed" ? readHtmlWidgetOutputArtifact(props.state.metadata) : undefined

  if (running || !widget) {
    return (
      <div className="flex flex-col gap-1.5">
        <ToolRow>
          <ToolRowIcon>{props.icon?.("size-3.5") ?? <AppWindowIcon className="size-3.5" />}</ToolRowIcon>
          <ToolRowAction>
            <TextShimmer text={props.info.title} active={running} />
          </ToolRowAction>
        </ToolRow>
        {props.state.status === "error" && showOutput ? <ToolErrorPanel error={output} /> : null}
      </div>
    )
  }

  return (
    <HtmlWidgetCard
      widget={widget}
      directory={props.directory}
      status={props.state.status}
      hideStatus
    />
  )
}

export { HtmlWidgetCard, HtmlWidgetFrame, HtmlWidgetFullscreenDialog }
