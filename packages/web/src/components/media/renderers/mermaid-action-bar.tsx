import { CheckIcon, CopyIcon, DownloadIcon, ExpandIcon, TargetIcon } from "@buddy/ui"
import { useCallback, useEffect, useRef, useState, memo } from "react"
import {
  MediaActionBar,
  MediaActionButton,
  MediaActionSeparator,
  MediaActionValue,
} from "@/components/media/media-action-bar"
import { language } from "@/context/language"
import { mermaidConstants } from "@/components/media/renderers/mermaid/constants"

type MermaidActionBarProps = {
  source: string
  onFullscreenOpen?: () => void
  svgRef: React.RefObject<HTMLDivElement | null>
  originalSvg: string
  objectID?: string
  minimal?: boolean
  hideFullscreen?: boolean
  zoomControls?: {
    zoomIn: () => void
    zoomOut: () => void
    resetZoom: () => void
    zoomLabel: string
    canZoomIn: boolean
    canZoomOut: boolean
  }
}

function normalizeSvgMarkupForDownload(svgMarkup: string): string {
  return svgMarkup.replace(
    mermaidConstants.patterns.VOID_HTML_TAG,
    (_fullMatch, tagName, attributes = "") => {
      return `<${String(tagName).toLowerCase()}${String(attributes)} />`
    },
  )
}

export const MermaidActionBar = memo(function MermaidActionBar({
  source,
  onFullscreenOpen,
  svgRef,
  originalSvg,
  objectID,
  minimal,
  hideFullscreen,
  zoomControls,
}: MermaidActionBarProps) {
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied">("idle")
  const [downloadFeedback, setDownloadFeedback] = useState<"idle" | "downloaded">("idle")

  const copyResetTimeoutRef = useRef<number | undefined>(undefined)
  const downloadResetTimeoutRef = useRef<number | undefined>(undefined)

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

  const copyMermaidSource = useCallback(async () => {
    if (!("clipboard" in navigator)) return

    try {
      await navigator.clipboard.writeText(source)
      setCopyFeedback("copied")
      if (copyResetTimeoutRef.current !== undefined) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
      copyResetTimeoutRef.current = window.setTimeout(
        () => setCopyFeedback("idle"),
        mermaidConstants.timeouts.FEEDBACK_RESET,
      )
    } catch {
      // ignore clipboard failures
    }
  }, [source])

  const downloadFileName = useCallback(() => {
    const suffix = objectID
      ? objectID.slice(0, mermaidConstants.svg.OBJECT_ID_SLICE)
      : language.t("chatTools.mermaidDiagram.downloadFallbackSuffix")
    return `mermaid-${suffix}.svg`
  }, [objectID])

  const downloadRenderedSvg = useCallback(() => {
    const renderedSvg =
      svgRef.current?.querySelector("svg")?.outerHTML ?? svgRef.current?.innerHTML ?? originalSvg
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
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), mermaidConstants.timeouts.REVOKE_URL)

    setDownloadFeedback("downloaded")
    if (downloadResetTimeoutRef.current !== undefined) {
      window.clearTimeout(downloadResetTimeoutRef.current)
    }
    downloadResetTimeoutRef.current = window.setTimeout(
      () => setDownloadFeedback("idle"),
      mermaidConstants.timeouts.FEEDBACK_RESET,
    )
  }, [svgRef, originalSvg, downloadFileName])

  const zoomGlyphClassName = minimal ? "text-[12px]" : "text-sm"

  return (
    <MediaActionBar>
      {zoomControls ? (
        <>
          <MediaActionButton
            label={language.t("chatTools.mermaidDiagram.zoomOutAria")}
            onClick={zoomControls.zoomOut}
            disabled={!zoomControls.canZoomOut}
            dataAction="mermaid-inline-zoom-out"
            icon={<span className={`font-semibold leading-none ${zoomGlyphClassName}`}>-</span>}
            minimal={minimal}
          />
          <MediaActionValue minimal={minimal}>{zoomControls.zoomLabel}</MediaActionValue>
          <MediaActionButton
            label={language.t("chatTools.mermaidDiagram.zoomInAria")}
            onClick={zoomControls.zoomIn}
            disabled={!zoomControls.canZoomIn}
            dataAction="mermaid-inline-zoom-in"
            icon={<span className={`font-semibold leading-none ${zoomGlyphClassName}`}>+</span>}
            minimal={minimal}
          />
          <MediaActionButton
            label={language.t("chatTools.mermaidDiagram.resetZoomAria")}
            onClick={zoomControls.resetZoom}
            dataAction="mermaid-inline-fit"
            icon={<TargetIcon />}
            minimal={minimal}
          />
          <MediaActionSeparator />
        </>
      ) : null}
      <MediaActionButton
        label={
          copyFeedback === "copied"
            ? language.t("chatTools.mermaidDiagram.copied")
            : language.t("chatTools.mermaidDiagram.copyMermaid")
        }
        onClick={() => {
          void copyMermaidSource()
        }}
        dataAction="mermaid-copy-source"
        icon={copyFeedback === "copied" ? <CheckIcon /> : <CopyIcon />}
        minimal={minimal}
      />
      <MediaActionButton
        label={
          downloadFeedback === "downloaded"
            ? language.t("chatTools.mermaidDiagram.downloaded")
            : language.t("chatTools.mermaidDiagram.downloadSvg")
        }
        onClick={downloadRenderedSvg}
        dataAction="mermaid-download-svg"
        icon={downloadFeedback === "downloaded" ? <CheckIcon /> : <DownloadIcon />}
        minimal={minimal}
      />
      {!hideFullscreen && onFullscreenOpen ? (
        <MediaActionButton
          label={language.t("chatTools.mermaidDiagram.openFullscreen")}
          onClick={onFullscreenOpen}
          dataAction="mermaid-open-fullscreen"
          icon={<ExpandIcon />}
          minimal={minimal}
        />
      ) : null}
    </MediaActionBar>
  )
})
