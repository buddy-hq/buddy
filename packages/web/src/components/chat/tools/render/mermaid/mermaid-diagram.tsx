import { Button, CheckIcon, CopyIcon, cn } from "@buddy/ui"
import { motion } from "motion/react"
import { useRef, useState, useCallback, useEffect } from "react"
import { language } from "@/context/language"
import { useMermaidRender } from "./use-mermaid-render"
import { MermaidInlineView } from "./mermaid-inline-view"
import { MermaidActionBar } from "./mermaid-action-bar"
import { MermaidFullscreenDialog } from "./mermaid-fullscreen-dialog"
import { MODAL_EXPAND_SPRING } from "./motion"
import { mermaidConstants } from "./constants"
import { useMermaidViewport, type MermaidViewportZoomState } from "./use-mermaid-viewport"
import { useInlineAssetActivation } from "@/components/chat/inline-asset-boundary"

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readErrorMessages(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()]
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => readErrorMessages(item))
  }
  if (isRecord(value)) {
    const directMessage = value.message
    if (typeof directMessage === "string" && directMessage.trim()) {
      return [directMessage.trim()]
    }
  }
  return []
}

function normalizeUnsupportedTypeMessage(message: string): string | undefined {
  const match = message.match(
    /No diagram type detected matching given configuration for text:\s*([A-Za-z][\w-]*)/u,
  )
  if (!match?.[1]) {
    return undefined
  }
  return `This Mermaid runtime could not recognize the "${match[1]}" diagram type.`
}

function summarizeMermaidErrorText(message: string): string {
  const trimmed = message.trim()
  if (!trimmed) {
    return language.t("chatTools.mermaidDiagram.renderErrorDefault")
  }

  const unsupportedType = normalizeUnsupportedTypeMessage(trimmed)
  if (unsupportedType) {
    return unsupportedType
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      const messages = readErrorMessages(parsed)
      if (messages.some((entry) => entry.includes('must start with "msg"'))) {
        return language.t("chatTools.mermaidDiagram.renderAutoRepairFailed")
      }
      const firstMessage = messages.find((entry) => entry.trim().length > 0)
      if (firstMessage) {
        return firstMessage
      }
    } catch {
      // fall through to generic cleanup
    }
  }

  const singleLine = trimmed.replace(/\s+/gu, " ")
  if (singleLine.length <= 240) {
    return singleLine
  }
  return `${singleLine.slice(0, 237)}...`
}

export function MermaidDiagram(props: {
  source: string
  alt: string
  artifactID?: string
  directory?: string
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
  enabled?: boolean
  renderPriority?: number
  onRequestFix?: (errorMessage: string) => void
  onRenderFailure?: (input: { message: string; persisted: boolean; renderKey?: string }) => void
  errorMeta?: React.ReactNode
  fixDisabled?: boolean
}) {
  const { artifactID, source, onRenderFailure } = props
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [sharedZoomState, setSharedZoomState] = useState<MermaidViewportZoomState>({
    zoom: mermaidConstants.zoom.DEFAULT,
    isAutoZoom: true,
  })
  const [copiedErrorDetails, setCopiedErrorDetails] = useState(false)
  const copyResetTimeoutRef = useRef<number | undefined>(undefined)
  const activation = useInlineAssetActivation()
  const enabled = (props.enabled ?? true) && activation.active

  const { state } = useMermaidRender({
    source,
    artifactID,
    directory: props.directory,
    enabled,
    priority: props.renderPriority,
  })

  useEffect(() => {
    if (state.status !== "error") {
      setCopiedErrorDetails(false)
    }
  }, [state.status])

  useEffect(() => {
    if (state.status !== "error") {
      return
    }
    onRenderFailure?.({
      message: state.message,
      persisted: state.persisted,
      ...(state.renderKey ? { renderKey: state.renderKey } : {}),
    })
  }, [onRenderFailure, state])

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== undefined) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    }
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

  useEffect(() => {
    setSharedZoomState({
      zoom: mermaidConstants.zoom.DEFAULT,
      isAutoZoom: true,
    })
  }, [source])
  const errorSummary =
    state.status === "error" ? summarizeMermaidErrorText(state.message) : undefined
  const errorMetaSummary =
    typeof props.errorMeta === "string"
      ? summarizeMermaidErrorText(props.errorMeta)
      : props.errorMeta
  const inlineViewport = useMermaidViewport({
    value: readyValue,
    enabled: state.status === "ready" && !fullscreenOpen,
    zoomState: sharedZoomState,
    onZoomStateChange: setSharedZoomState,
    canvasPadding: mermaidConstants.viewport.INLINE_CANVAS_PADDING,
    panOverscan: mermaidConstants.viewport.INLINE_PAN_OVERSCAN,
    defaultZoomMode: "responsive",
    responsiveAutoZoomStrategy: {
      minimumRenderedHeight: mermaidConstants.viewport.INLINE_AUTO_MIN_RENDERED_HEIGHT,
      maxViewportWidths: mermaidConstants.viewport.INLINE_AUTO_MAX_VIEWPORT_WIDTHS,
    },
  })

  const handleFullscreenOpen = useCallback(() => {
    setFullscreenOpen(true)
  }, [])

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
    <div
      ref={activation.ref}
      data-markdown-export-status={state.status}
      className={cn("h-full min-h-0", props.className)}
    >
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
                {errorSummary ? <div className="text-sm text-text-base">{errorSummary}</div> : null}
                <div className="text-xs text-text-weak">
                  {language.t("chatTools.mermaidDiagram.renderErrorDescriptionCompact")}
                </div>
                {errorMetaSummary && errorMetaSummary !== errorSummary ? (
                  <div className="text-xs text-text-weak">{errorMetaSummary}</div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {props.onRequestFix ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={props.fixDisabled}
                    onClick={() => {
                      if (state.status === "error") {
                        props.onRequestFix?.(state.message)
                      }
                    }}
                  >
                    {props.fixDisabled
                      ? language.t("chatTools.mermaidDiagram.renderFixRequested")
                      : language.t("chatTools.mermaidDiagram.renderFixRequest")}
                  </Button>
                ) : null}
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
          </div>

          {props.showRawSourceOnError ? (
            <div className="space-y-2">
              <details className="rounded-md border border-border-base/50 bg-surface-weak/20">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-text-weak">
                  {language.t("chatTools.mermaidDiagram.viewSource")}
                </summary>
                <pre
                  className={
                    props.rawSourceClassName ??
                    "max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border-base/50 p-3 text-xs text-text-base"
                  }
                >
                  <code>{props.source}</code>
                </pre>
              </details>
            </div>
          ) : null}
        </div>
      ) : null}

      <MermaidFullscreenDialog
        value={readyValue}
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        alt={props.alt}
        zoomState={sharedZoomState}
        onZoomStateChange={setSharedZoomState}
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
