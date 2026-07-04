import { useState, type ReactNode } from "react"
import { BenchZoomableViewer, type BenchViewerAction } from "@/components/bench/bench-viewer-shell"

const SVG_DEFAULT_WIDTH = 640
const SVG_DEFAULT_HEIGHT = 400
const SVG_MIN_RENDER_WIDTH = 960
const SVG_LOADING_WIDTH = 384
const SVG_LOADING_HEIGHT = 240

type SvgBenchViewProps = {
  title: string
  subtitle?: string
  src?: string
  actions?: BenchViewerAction[]
  toolbar?: ReactNode
}

type SvgBounds = {
  width: number
  height: number
}

type SvgObjectState = { kind: "loading" } | { kind: "ready"; bounds: SvgBounds } | { kind: "error" }

function measureSvgBounds(bounds: SvgBounds): SvgBounds {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { width: SVG_DEFAULT_WIDTH, height: SVG_DEFAULT_HEIGHT }
  }

  return bounds
}

function normalizeSvgRenderBounds(bounds: SvgBounds): SvgBounds {
  if (bounds.width >= SVG_MIN_RENDER_WIDTH) {
    return bounds
  }

  const scale = SVG_MIN_RENDER_WIDTH / bounds.width
  return {
    width: SVG_MIN_RENDER_WIDTH,
    height: bounds.height * scale,
  }
}

function SvgBenchViewContent(props: SvgBenchViewProps) {
  const { actions, src, subtitle, title, toolbar } = props
  const [state, setState] = useState<SvgObjectState>({ kind: "loading" })

  const bounds =
    state.kind === "ready" ? state.bounds : { width: SVG_LOADING_WIDTH, height: SVG_LOADING_HEIGHT }

  return (
    <BenchZoomableViewer
      title={title}
      subtitle={subtitle}
      actions={actions}
      toolbar={toolbar}
      controlsPlacement="dock"
      hideHeader
      fitContent
    >
      <div
        data-component="svg-bench-surface"
        className="relative block overflow-visible"
        style={{ width: bounds.width, height: bounds.height }}
      >
        {state.kind === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-weak">
            SVG preview could not be loaded.
          </div>
        ) : src ? (
          <img
            src={src}
            alt={title}
            draggable={false}
            decoding="async"
            className="block size-full max-w-none select-none object-contain"
            onLoad={(event) => {
              setState({
                kind: "ready",
                bounds: normalizeSvgRenderBounds(
                  measureSvgBounds({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  }),
                ),
              })
            }}
            onError={() => setState({ kind: "error" })}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-text-weak">
            SVG preview URL is unavailable.
          </div>
        )}
      </div>
    </BenchZoomableViewer>
  )
}

export function SvgBenchView(props: SvgBenchViewProps) {
  return <SvgBenchViewContent key={props.src} {...props} />
}
