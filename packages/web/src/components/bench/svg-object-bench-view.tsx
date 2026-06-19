import { useEffect, useState } from "react"
import DOMPurify from "dompurify"
import { BenchZoomableViewer } from "@/components/bench/bench-viewer-shell"

const SVG_DEFAULT_WIDTH = 640
const SVG_DEFAULT_HEIGHT = 400
const SVG_MIN_RENDER_WIDTH = 960

type SvgObjectBenchViewProps = {
  title: string
  subtitle?: string
  loadSvg: () => Promise<Blob | File>
}

type SvgBounds = {
  width: number
  height: number
}

type SvgObjectState =
  | { kind: "loading" }
  | { kind: "ready"; markup: string; bounds: SvgBounds }
  | { kind: "error"; message: string }

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

function measureSvgBounds(svgMarkup: string): SvgBounds {
  if (typeof DOMParser === "undefined") {
    return { width: SVG_DEFAULT_WIDTH, height: SVG_DEFAULT_HEIGHT }
  }

  try {
    const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml")
    const svg = parsed.querySelector("svg")
    if (!svg) {
      return { width: SVG_DEFAULT_WIDTH, height: SVG_DEFAULT_HEIGHT }
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
    return { width: SVG_DEFAULT_WIDTH, height: SVG_DEFAULT_HEIGHT }
  }

  return { width: SVG_DEFAULT_WIDTH, height: SVG_DEFAULT_HEIGHT }
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

function sanitizeSvgMarkup(markup: string): string {
  if (!DOMPurify.isSupported) {
    return markup
  }

  return DOMPurify.sanitize(markup, {
    USE_PROFILES: { svg: true, svgFilters: true },
    SANITIZE_NAMED_PROPS: true,
    FORBID_TAGS: ["script", "foreignObject"],
    FORBID_CONTENTS: ["script", "foreignObject"],
  })
}

export function SvgObjectBenchView(props: SvgObjectBenchViewProps) {
  const { loadSvg, subtitle, title } = props
  const [state, setState] = useState<SvgObjectState>({ kind: "loading" })

  useEffect(() => {
    let active = true
    setState({ kind: "loading" })

    async function loadSvgMarkup() {
      try {
        const markup = sanitizeSvgMarkup(await (await loadSvg()).text())
        if (!active) return
        setState({
          kind: "ready",
          markup,
          bounds: normalizeSvgRenderBounds(measureSvgBounds(markup)),
        })
      } catch (error) {
        if (!active) return
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    void loadSvgMarkup()
    return () => {
      active = false
    }
  }, [loadSvg])

  return (
    <BenchZoomableViewer title={title} subtitle={subtitle} fitContent>
      {state.kind === "ready" ? (
        <div
          role="img"
          aria-label={title}
          data-component="svg-object-bench-surface"
          className="block overflow-visible [&_svg]:block [&_svg]:h-full [&_svg]:w-full [&_svg]:max-w-none"
          style={{ width: state.bounds.width, height: state.bounds.height }}
          dangerouslySetInnerHTML={{ __html: state.markup }}
        />
      ) : (
        <div className="flex h-60 w-96 items-center justify-center text-sm text-text-weak">
          {state.kind === "loading" ? "Loading figure" : state.message}
        </div>
      )}
    </BenchZoomableViewer>
  )
}
