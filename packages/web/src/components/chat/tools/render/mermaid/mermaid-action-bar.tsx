import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExpandIcon,
  TargetIcon,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@buddy/ui"
import { useCallback, useEffect, useRef, useState, memo } from "react"
import { language } from "@/context/language"
import { mermaidConstants } from "./constants"

type MermaidActionBarProps = {
  source: string
  onFullscreenOpen?: () => void
  svgRef: React.RefObject<HTMLDivElement | null>
  originalSvg: string
  artifactID?: string
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

const DiagramActionButton = memo(function DiagramActionButton(props: {
  label: string
  onClick: () => void
  icon: JSX.Element
  disabled?: boolean
  dataAction?: string
  minimal?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        {...(props.dataAction ? { "data-action": props.dataAction } : {})}
        disabled={props.disabled}
        aria-label={props.label}
        onClick={(event) => {
          event.stopPropagation()
          props.onClick()
        }}
        onMouseDown={(event) => event.preventDefault()}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-50",
          props.minimal
            ? "size-7 text-text-weak/70 hover:bg-surface-raised-base hover:text-text-base"
            : "size-9 border border-border-base/70 bg-background-base/88 text-text-weak shadow-[0_12px_32px_rgba(0,0,0,0.24)] backdrop-blur-xl hover:bg-surface-raised-base hover:text-text-base",
        )}
      >
        {props.icon}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <p>{props.label}</p>
      </TooltipContent>
    </Tooltip>
  )
})

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
  artifactID,
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
    const suffix = artifactID
      ? artifactID.slice(0, mermaidConstants.svg.ARTIFACT_ID_SLICE)
      : language.t("chatTools.mermaidDiagram.downloadFallbackSuffix")
    return `mermaid-${suffix}.svg`
  }, [artifactID])

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

  const iconSize = minimal ? "size-3.5" : "size-4"
  const zoomGlyphClassName = minimal ? "text-[12px]" : "text-sm"

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {zoomControls ? (
          <>
            <DiagramActionButton
              label={language.t("chatTools.mermaidDiagram.zoomOutAria")}
              onClick={zoomControls.zoomOut}
              disabled={!zoomControls.canZoomOut}
              dataAction="mermaid-inline-zoom-out"
              icon={<span className={cn("font-semibold leading-none", zoomGlyphClassName)}>-</span>}
              minimal={minimal}
            />
            <div
              data-component="mermaid-inline-zoom-level"
              aria-label={language.t("chatTools.mermaidDiagram.zoomLevelAria")}
              className={cn(
                "min-w-[2.75rem] px-1 text-center text-[11px] font-medium text-text-weak",
                minimal ? "text-[10px]" : "text-[11px]",
              )}
            >
              {zoomControls.zoomLabel}
            </div>
            <DiagramActionButton
              label={language.t("chatTools.mermaidDiagram.zoomInAria")}
              onClick={zoomControls.zoomIn}
              disabled={!zoomControls.canZoomIn}
              dataAction="mermaid-inline-zoom-in"
              icon={<span className={cn("font-semibold leading-none", zoomGlyphClassName)}>+</span>}
              minimal={minimal}
            />
            <DiagramActionButton
              label={language.t("chatTools.mermaidDiagram.resetZoomAria")}
              onClick={zoomControls.resetZoom}
              dataAction="mermaid-inline-fit"
              icon={<TargetIcon className={iconSize} />}
              minimal={minimal}
            />
            <div className="mx-1 h-4 w-px bg-border-base/50" />
          </>
        ) : null}
        <DiagramActionButton
          label={
            copyFeedback === "copied"
              ? language.t("chatTools.mermaidDiagram.copied")
              : language.t("chatTools.mermaidDiagram.copyMermaid")
          }
          onClick={() => {
            void copyMermaidSource()
          }}
          dataAction="mermaid-copy-source"
          icon={
            copyFeedback === "copied" ? (
              <CheckIcon className={iconSize} />
            ) : (
              <CopyIcon className={iconSize} />
            )
          }
          minimal={minimal}
        />
        <DiagramActionButton
          label={
            downloadFeedback === "downloaded"
              ? language.t("chatTools.mermaidDiagram.downloaded")
              : language.t("chatTools.mermaidDiagram.downloadSvg")
          }
          onClick={downloadRenderedSvg}
          dataAction="mermaid-download-svg"
          icon={
            downloadFeedback === "downloaded" ? (
              <CheckIcon className={iconSize} />
            ) : (
              <DownloadIcon className={iconSize} />
            )
          }
          minimal={minimal}
        />
        {!hideFullscreen && onFullscreenOpen ? (
          <DiagramActionButton
            label={language.t("chatTools.mermaidDiagram.openFullscreen")}
            onClick={onFullscreenOpen}
            dataAction="mermaid-open-fullscreen"
            icon={<ExpandIcon className={iconSize} />}
            minimal={minimal}
          />
        ) : null}
      </div>
    </TooltipProvider>
  )
})
