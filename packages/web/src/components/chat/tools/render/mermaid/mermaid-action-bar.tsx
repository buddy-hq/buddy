import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExpandIcon,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@buddy/ui"
import { useCallback, useEffect, useRef, useState, memo } from "react"
import { language } from "@/context/language"
import { mermaidConstants } from "./constants"

type MermaidActionBarProps = {
  source: string
  onFullscreenOpen: () => void
  svgRef: React.RefObject<HTMLDivElement | null>
  originalSvg: string
  artifactID?: string
}

const DiagramActionButton = memo(function DiagramActionButton(props: {
  label: string
  onClick: () => void
  icon: JSX.Element
  disabled?: boolean
  dataAction?: string
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
        className="inline-flex size-9 items-center justify-center rounded-full border border-border-base/70 bg-background-base/88 text-text-weak shadow-[0_12px_32px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-colors hover:bg-surface-raised-base hover:text-text-base disabled:pointer-events-none disabled:opacity-50"
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
  return svgMarkup.replace(mermaidConstants.patterns.VOID_HTML_TAG, (_fullMatch, tagName, attributes = "") => {
    return `<${String(tagName).toLowerCase()}${String(attributes)} />`
  })
}

export const MermaidActionBar = memo(function MermaidActionBar({
  source,
  onFullscreenOpen,
  svgRef,
  originalSvg,
  artifactID,
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
      svgRef.current?.querySelector("svg")?.outerHTML ??
      svgRef.current?.innerHTML ??
      originalSvg
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

  return (
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
            icon={copyFeedback === "copied" ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
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
            onClick={onFullscreenOpen}
            dataAction="mermaid-open-fullscreen"
            icon={<ExpandIcon className="size-4" />}
          />
        </div>
      </div>
    </TooltipProvider>
  )
})

