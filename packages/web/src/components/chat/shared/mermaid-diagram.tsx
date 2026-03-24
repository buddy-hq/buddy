import { Button } from "@buddy/ui"
import { useEffect, useRef, useState } from "react"
import { renderMermaidSvg, type MermaidRenderResult } from "../../../lib/mermaid/render"

const VOID_HTML_TAG_PATTERN =
  /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(\s[^>]*?)?\s*\/?>/giu

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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim()
  }
  return "Unable to render Mermaid diagram."
}

function normalizeSvgMarkupForDownload(svgMarkup: string): string {
  return svgMarkup.replace(VOID_HTML_TAG_PATTERN, (_fullMatch, tagName, attributes = "") => {
    return `<${String(tagName).toLowerCase()}${String(attributes)} />`
  })
}

export function MermaidDiagram(props: {
  source: string
  alt: string
  artifactID?: string
  className?: string
  failureClassName?: string
  showRawSourceOnError?: boolean
  rawSourceClassName?: string
}) {
  const [state, setState] = useState<MermaidDiagramState>({ status: "loading" })
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied">("idle")
  const [downloadFeedback, setDownloadFeedback] = useState<"idle" | "downloaded">("idle")
  const copyResetTimeoutRef = useRef<number | undefined>(undefined)
  const downloadResetTimeoutRef = useRef<number | undefined>(undefined)
  const svgHostRef = useRef<HTMLDivElement | null>(null)

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

    void renderMermaidSvg({
      source: props.source,
      artifactID: props.artifactID,
    })
      .then((value) => {
        if (cancelled) return
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
    if (!svgHostRef.current) {
      return
    }

    svgHostRef.current.innerHTML = state.value.svg
    state.value.bindFunctions?.(svgHostRef.current)
  }, [state])

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
    const suffix = props.artifactID ? props.artifactID.slice(0, 8) : "diagram"
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

  return (
    <div className={props.className}>
      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Copy Mermaid"
          onClick={() => void copyMermaidSource()}
        >
          {copyFeedback === "copied" ? "Copied" : "Copy Mermaid"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Download SVG"
          disabled={state.status !== "ready"}
          onClick={downloadRenderedSvg}
        >
          {downloadFeedback === "downloaded" ? "Downloaded" : "Download SVG"}
        </Button>
      </div>

      {state.status === "loading" ? (
        <div className="text-sm text-text-weak">Rendering Mermaid diagram...</div>
      ) : null}

      {state.status === "ready" ? (
        <div
          ref={svgHostRef}
          data-component="mermaid-diagram"
          role="img"
          aria-label={props.alt}
          className="overflow-auto"
        />
      ) : null}

      {state.status === "error" ? (
        <>
          <div
            className={
              props.failureClassName ??
              "rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base"
            }
          >
            Unable to render Mermaid diagram: {state.message}
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
    </div>
  )
}
