import { Button, CheckIcon, CopyIcon, cn } from "@buddy/ui"
import { motion } from "motion/react"
import { useRef, useState, useCallback, useEffect, useId } from "react"
import { language } from "@/context/language"
import { useMermaidRender } from "./use-mermaid-render"
import { MermaidInlineView } from "./mermaid-inline-view"
import { MermaidActionBar } from "./mermaid-action-bar"
import { MermaidFullscreenDialog } from "./mermaid-fullscreen-dialog"
import { MODAL_EXPAND_SPRING } from "./motion"
import { mermaidConstants } from "./constants"
import { useMermaidViewport } from "./use-mermaid-viewport"

export const DIAGRAM_REVEAL_SPRING = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
} as const

function buildMermaidErrorClipboardText(input: { message: string; source?: string }): string {
  const sections = [language.t("chatTools.mermaidDiagram.renderErrorTitle"), "", input.message]
  if (input.source) {
    sections.push(
      "",
      language.t("chatTools.mermaidDiagram.renderErrorSourceLabel"),
      "",
      input.source,
    )
  }

  return sections.join("\n")
}

export function MermaidDiagram(props: {
  source: string
  alt: string
  artifactID?: string
  className?: string
  failureClassName?: string
  showRawSourceOnError?: boolean
  rawSourceClassName?: string
  hideLoadingPlaceholder?: string | boolean
  renderWrapper?: (
    diagramElement: React.ReactNode,
    actions: React.ReactNode | null,
  ) => React.ReactNode
  minimalActions?: boolean
  disableRevealAnimation?: boolean
}) {
  const { artifactID, source } = props
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [copiedErrorDetails, setCopiedErrorDetails] = useState(false)
  const copyResetTimeoutRef = useRef<number | undefined>(undefined)
  const instanceId = useId()
  const layoutId = artifactID
    ? `mermaid-zoom-${artifactID}-${instanceId}`
    : `mermaid-zoom-${instanceId}`

  const { state } = useMermaidRender({ source, artifactID })

  useEffect(() => {
    if (state.status !== "error") {
      setCopiedErrorDetails(false)
    }
  }, [state.status])

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== undefined) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    }
  }, [])

  const handleFullscreenOpen = useCallback(() => {
    setFullscreenOpen(true)
  }, [])

  const handleCopyErrorDetails = useCallback(async () => {
    if (state.status !== "error" || !("clipboard" in navigator)) {
      return
    }

    try {
      await navigator.clipboard.writeText(
        buildMermaidErrorClipboardText({
          message: state.message,
          ...(props.showRawSourceOnError ? { source: props.source } : {}),
        }),
      )
      setCopiedErrorDetails(true)
      if (copyResetTimeoutRef.current !== undefined) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
      copyResetTimeoutRef.current = window.setTimeout(() => setCopiedErrorDetails(false), 2000)
    } catch {
      // ignore clipboard failures
    }
  }, [props.showRawSourceOnError, props.source, state])

  const readyValue = state.status === "ready" ? state.value : undefined
  const inlineViewport = useMermaidViewport({
    value: readyValue,
    enabled: state.status === "ready",
    canvasPadding: mermaidConstants.viewport.INLINE_CANVAS_PADDING,
    panOverscan: mermaidConstants.viewport.INLINE_PAN_OVERSCAN,
    defaultZoomMode: "responsive",
  })

  const actions =
    state.status === "ready" ? (
      <MermaidActionBar
        source={source}
        onFullscreenOpen={handleFullscreenOpen}
        svgRef={inlineViewport.svgHostRef}
        originalSvg={state.value.svg}
        artifactID={artifactID}
        minimal={props.minimalActions}
        zoomControls={{
          zoomIn: inlineViewport.zoomIn,
          zoomOut: inlineViewport.zoomOut,
          resetZoom: inlineViewport.resetZoom,
          zoomLabel: inlineViewport.isAutoZoom
            ? language.t("chatTools.mermaidDiagram.auto")
            : inlineViewport.zoomLabel,
          canZoomIn: inlineViewport.canZoomIn,
          canZoomOut: inlineViewport.canZoomOut,
        }}
      />
    ) : null

  const content = (
    <div className={cn("h-full min-h-0", props.className)}>
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
          layoutId={layoutId}
          className="h-full overflow-hidden rounded-[14px]"
          transition={MODAL_EXPAND_SPRING}
          {...(!props.disableRevealAnimation && {
            initial: {
              opacity: 0,
              y: mermaidConstants.animation.Y_OFFSET,
              scale: mermaidConstants.animation.SCALE_START,
            },
            animate: { opacity: 1, y: 0, scale: 1 },
          })}
        >
          <MermaidInlineView ariaLabel={props.alt} viewport={inlineViewport} />
        </motion.div>
      ) : null}

      {state.status === "error" ? (
        <div className={props.failureClassName ?? "space-y-3"}>
          <div
            data-component="mermaid-error-panel"
            className="rounded-xl border border-border-critical-base/35 bg-surface-critical-base/6 px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="font-medium text-icon-critical-base">
                  {language.t("chatTools.mermaidDiagram.renderErrorTitle")}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={language.t("chatTools.mermaidDiagram.copyErrorDetails")}
                onClick={() => {
                  void handleCopyErrorDetails()
                }}
              >
                {copiedErrorDetails ? (
                  <CheckIcon className="size-3.5" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
              </Button>
            </div>
          </div>

          {props.showRawSourceOnError ? (
            <div className="space-y-2">
              <pre
                className={
                  props.rawSourceClassName ??
                  "max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-base bg-surface-weak/40 p-3 text-xs text-text-base"
                }
              >
                <code>{props.source}</code>
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}

      <MermaidFullscreenDialog
        value={readyValue}
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        alt={props.alt}
        layoutId={layoutId}
      />
    </div>
  )

  if (props.renderWrapper) {
    return <>{props.renderWrapper(content, actions)}</>
  }

  return (
    <>
      {content}
      {actions}
    </>
  )
}
