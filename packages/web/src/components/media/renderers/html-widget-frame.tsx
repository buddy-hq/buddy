import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "@buddy/ui"
import { Loader2Icon } from "@/icons/app-icons"
import { type HtmlWidgetPresentation, type HtmlWidgetViewport } from "@/lib/html-widgets"
import { resolveAssetUrl } from "@/lib/resource-url"
import { useKeyedMediaState } from "../use-keyed-media-state"

const INLINE_MAX_HEIGHT_RATIO = 0.7
const INLINE_MAX_HEIGHT_PX = 720
const MIN_VIEWPORT_CONTAINER_WIDTH_PX = 1
const BENCH_RECOMMENDED_SCALE = 0.78

type HtmlWidgetFrameMode = "inline" | "bench"

type ViewportSize = {
  width: number
  height: number
}

type HtmlWidgetFrameProps = {
  widget: HtmlWidgetPresentation
  mode: HtmlWidgetFrameMode
  reloadKey?: number
  className?: string
  showStateOverlay?: boolean
  onLoadStateChange?: (state: HtmlWidgetFrameLoadState) => void
}

export type HtmlWidgetFrameLoadState = "loading" | "loaded" | "error"

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

  useLayoutEffect(() => {
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

function resolveInlineViewportHeightScale(input: {
  viewport: HtmlWidgetViewport
  windowSize: ViewportSize
}): number {
  return Math.min(1, resolveInlineAvailableHeight(input.windowSize) / input.viewport.height)
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
  const heightScale = resolveInlineViewportHeightScale({
    viewport: input.viewport,
    windowSize: input.windowSize,
  })
  const fitScale = Math.min(availableWidth / input.viewport.width, heightScale)

  return Math.min(1, fitScale)
}

function useHtmlWidgetRuntimeFrame(input: {
  widget: HtmlWidgetPresentation
  reloadKey: number
  onLoadStateChange?: (state: HtmlWidgetFrameLoadState) => void
}) {
  const { widget, reloadKey, onLoadStateChange } = input
  const runtimeUrl = useMemo(
    () => resolveAssetUrl(appendRenderKey(widget.runtimeUrl, reloadKey)),
    [reloadKey, widget.runtimeUrl],
  )
  const [loadState, setLoadState] = useKeyedMediaState<HtmlWidgetFrameLoadState>(
    runtimeUrl,
    "loading",
  )

  useEffect(() => {
    onLoadStateChange?.(loadState)
  }, [onLoadStateChange, loadState])

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

/**
 * The frame's box before its widget descriptor has been hydrated.
 *
 * A widget's geometry is a pure function of its viewport preset, which is known
 * as soon as the tool part is read. Rendering a one-line status row while the
 * descriptor loads and then swapping in a ~480px frame moves everything below it
 * twice. This reserves the identical box — same max width, max height, and
 * aspect ratio as `HtmlWidgetInlineFrame` — so hydration only fills it in.
 */
export function HtmlWidgetFramePlaceholder(props: {
  viewport: HtmlWidgetViewport
  className?: string
}) {
  const windowSize = useWindowViewportSize()
  const heightScale = resolveInlineViewportHeightScale({
    viewport: props.viewport,
    windowSize,
  })

  return (
    <div className={cn("w-full min-w-0", props.className)}>
      <div
        className="relative mx-auto overflow-hidden rounded-xl bg-background-base"
        style={{
          width: "100%",
          maxWidth: `${props.viewport.width * heightScale}px`,
          maxHeight: `${props.viewport.height * heightScale}px`,
          aspectRatio: `${props.viewport.width} / ${props.viewport.height}`,
        }}
      >
        <HtmlWidgetFrameOverlay loadState="loading" />
      </div>
    </div>
  )
}

function HtmlWidgetInlineFrame(props: {
  widget: HtmlWidgetPresentation
  reloadKey: number
  className?: string
  showStateOverlay: boolean
  onLoadStateChange?: (state: HtmlWidgetFrameLoadState) => void
}) {
  const container = useContainerWidth()
  const windowSize = useWindowViewportSize()
  const frame = useHtmlWidgetRuntimeFrame({
    widget: props.widget,
    reloadKey: props.reloadKey,
    onLoadStateChange: props.onLoadStateChange,
  })
  const measured = container.width > 0
  const heightScale = resolveInlineViewportHeightScale({
    viewport: props.widget.viewport,
    windowSize,
  })
  const scale = measured
    ? resolveInlineViewportScale({
        viewport: props.widget.viewport,
        containerWidth: container.width,
        windowSize,
      })
    : heightScale
  const maxFrameWidth = props.widget.viewport.width * heightScale
  const maxFrameHeight = props.widget.viewport.height * heightScale
  const benchRecommended = measured && scale < BENCH_RECOMMENDED_SCALE

  return (
    <div ref={container.ref} className={cn("w-full min-w-0", props.className)}>
      <div
        className="relative mx-auto overflow-hidden bg-background-base"
        style={{
          width: "100%",
          maxWidth: `${maxFrameWidth}px`,
          maxHeight: `${maxFrameHeight}px`,
          aspectRatio: `${props.widget.viewport.width} / ${props.widget.viewport.height}`,
        }}
      >
        {measured ? (
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
        ) : null}
        {props.showStateOverlay ? (
          <HtmlWidgetFrameOverlay loadState={measured ? frame.loadState : "loading"} />
        ) : null}
      </div>
      <div className="sr-only" aria-live="polite">
        {benchRecommended ? "Open on Bench for the intended widget size." : ""}
      </div>
    </div>
  )
}

function HtmlWidgetBenchFrame(props: {
  widget: HtmlWidgetPresentation
  reloadKey: number
  className?: string
  showStateOverlay: boolean
  onLoadStateChange?: (state: HtmlWidgetFrameLoadState) => void
}) {
  const frame = useHtmlWidgetRuntimeFrame({
    widget: props.widget,
    reloadKey: props.reloadKey,
    onLoadStateChange: props.onLoadStateChange,
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
      {props.showStateOverlay ? <HtmlWidgetFrameOverlay loadState={frame.loadState} /> : null}
    </div>
  )
}

export function HtmlWidgetFrame({
  widget,
  mode,
  reloadKey = 0,
  className,
  showStateOverlay = true,
  onLoadStateChange,
}: HtmlWidgetFrameProps) {
  if (mode === "bench") {
    return (
      <HtmlWidgetBenchFrame
        widget={widget}
        reloadKey={reloadKey}
        className={className}
        showStateOverlay={showStateOverlay}
        onLoadStateChange={onLoadStateChange}
      />
    )
  }

  return (
    <HtmlWidgetInlineFrame
      widget={widget}
      reloadKey={reloadKey}
      className={className}
      showStateOverlay={showStateOverlay}
      onLoadStateChange={onLoadStateChange}
    />
  )
}
