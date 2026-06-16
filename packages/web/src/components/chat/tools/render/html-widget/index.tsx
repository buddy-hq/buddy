import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Button,
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
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import type { ToolPartProps } from "../../registry"

const INLINE_MAX_HEIGHT_RATIO = 0.7
const INLINE_MAX_HEIGHT_PX = 720
const MIN_VIEWPORT_CONTAINER_WIDTH_PX = 1
const BENCH_RECOMMENDED_SCALE = 0.78
const HTML_WIDGET_FRAME_MODE_INLINE = "inline"
const HTML_WIDGET_FRAME_MODE_BENCH = "bench"

type HtmlWidgetFrameMode =
  | typeof HTML_WIDGET_FRAME_MODE_INLINE
  | typeof HTML_WIDGET_FRAME_MODE_BENCH

type ViewportSize = {
  width: number
  height: number
}

type HtmlWidgetFrameProps = {
  widget: HtmlWidgetToolOutput
  mode: HtmlWidgetFrameMode
  reloadKey?: number
  className?: string
}

type HtmlWidgetFrameLoadState = "loading" | "loaded" | "error"

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

function resolveInlineAvailableHeight(windowSize: ViewportSize): number {
  return Math.min(windowSize.height * INLINE_MAX_HEIGHT_RATIO, INLINE_MAX_HEIGHT_PX)
}

function resolveInlineViewportScale(input: {
  viewport: HtmlWidgetViewport
  containerWidth: number
  windowSize: ViewportSize
}): number {
  const availableWidth = Math.max(
    input.containerWidth || input.viewport.width,
    MIN_VIEWPORT_CONTAINER_WIDTH_PX,
  )
  const availableHeight = resolveInlineAvailableHeight(input.windowSize)
  const fitScale = Math.min(
    availableWidth / input.viewport.width,
    availableHeight / input.viewport.height,
  )

  return Math.min(1, fitScale)
}

function useHtmlWidgetRuntimeFrame(input: {
  widget: HtmlWidgetToolOutput
  reloadKey: number
}) {
  const [loadState, setLoadState] = useState<HtmlWidgetFrameLoadState>("loading")
  const runtimeUrl = useMemo(
    () => resolveAssetUrl(appendRenderKey(input.widget.runtimeUrl, input.reloadKey)),
    [input.reloadKey, input.widget.runtimeUrl],
  )

  useEffect(() => {
    setLoadState("loading")
  }, [runtimeUrl])

  return {
    runtimeUrl,
    loadState,
    handleLoaded: () => setLoadState("loaded"),
    handleError: () => setLoadState("error"),
  }
}

function HtmlWidgetFrameOverlay(props: { loadState: HtmlWidgetFrameLoadState }) {
  if (props.loadState === "loading") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-surface-base">
        <Loader2Icon className="size-5 animate-spin text-text-weak" aria-hidden />
      </div>
    )
  }

  if (props.loadState === "error") {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-surface-base p-4 text-center text-sm text-text-weak">
        Widget failed to load.
      </div>
    )
  }

  return null
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

function HtmlWidgetInlineFrame(props: {
  widget: HtmlWidgetToolOutput
  reloadKey: number
  className?: string
}) {
  const container = useContainerWidth()
  const windowSize = useWindowViewportSize()
  const frame = useHtmlWidgetRuntimeFrame({
    widget: props.widget,
    reloadKey: props.reloadKey,
  })
  const scale = resolveInlineViewportScale({
    viewport: props.widget.viewport,
    containerWidth: container.width,
    windowSize,
  })
  const scaledWidth = props.widget.viewport.width * scale
  const scaledHeight = props.widget.viewport.height * scale
  const benchRecommended = scale < BENCH_RECOMMENDED_SCALE

  return (
    <div ref={container.ref} className={cn("w-full min-w-0", props.className)}>
      <div
        className="relative mx-auto overflow-hidden rounded-lg border border-border-base bg-background-base shadow-inner"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          maxWidth: "100%",
        }}
      >
        <iframe
          key={frame.runtimeUrl}
          title={props.widget.title}
          src={frame.runtimeUrl}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="block border-0 bg-background-base"
          style={{
            width: `${props.widget.viewport.width}px`,
            height: `${props.widget.viewport.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          onLoad={frame.handleLoaded}
          onError={frame.handleError}
        />
        <HtmlWidgetFrameOverlay loadState={frame.loadState} />
        {benchRecommended ? (
          <div className="absolute right-2 bottom-2 rounded-md border border-border-base bg-surface-base px-2 py-1 text-[11px] font-medium text-text-weak shadow-sm">
            Bench recommended
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-center text-[11px] text-text-weak">
        {formatHtmlWidgetViewport(props.widget.viewport)}
      </div>
      <div className="sr-only" aria-live="polite">
        {benchRecommended ? "Open on Bench for the intended widget size." : ""}
      </div>
    </div>
  )
}

function HtmlWidgetBenchFrame(props: {
  widget: HtmlWidgetToolOutput
  reloadKey: number
  className?: string
}) {
  const frame = useHtmlWidgetRuntimeFrame({
    widget: props.widget,
    reloadKey: props.reloadKey,
  })

  return (
    <div
      className={cn(
        "relative h-full min-h-0 w-full overflow-hidden bg-background-base",
        props.className,
      )}
    >
      <iframe
        key={frame.runtimeUrl}
        title={props.widget.title}
        src={frame.runtimeUrl}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="block h-full w-full border-0 bg-background-base"
        onLoad={frame.handleLoaded}
        onError={frame.handleError}
      />
      <HtmlWidgetFrameOverlay loadState={frame.loadState} />
    </div>
  )
}

function HtmlWidgetFrame({ widget, mode, reloadKey = 0, className }: HtmlWidgetFrameProps) {
  if (mode === HTML_WIDGET_FRAME_MODE_BENCH) {
    return <HtmlWidgetBenchFrame widget={widget} reloadKey={reloadKey} className={className} />
  }

  return <HtmlWidgetInlineFrame widget={widget} reloadKey={reloadKey} className={className} />
}

function HtmlWidgetCard(props: {
  widget: HtmlWidgetToolOutput
  directory?: string
  status?: ToolPartProps["state"]["status"]
  hideStatus?: boolean
}) {
  const openBenchRoute = useOpenBench()
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
      {props.directory ? (
        <HtmlWidgetAction
          label="Open on Bench"
          onClick={() => {
            if (!props.directory) return
            void openBenchRoute({
              directory: props.directory,
              target: {
                type: "artifact",
                kind: "html-widget",
                artifactID: props.widget.artifactID,
              },
              mode: BENCH_MODE_REQUEST_POLICY,
              autoOpen: null,
            })
          }}
        >
          <ExternalLinkIcon className="size-3.5" aria-hidden />
        </HtmlWidgetAction>
      ) : null}
    </div>
  )

  return (
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

export { HtmlWidgetCard, HtmlWidgetFrame }
