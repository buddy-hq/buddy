import { motion } from "motion/react"
import { useRef, useState, useCallback, useId } from "react"
import { language } from "@/context/language"
import { useMermaidRender } from "./use-mermaid-render"
import { MermaidInlineView } from "./mermaid-inline-view"
import { MermaidActionBar } from "./mermaid-action-bar"
import { MermaidFullscreenDialog } from "./mermaid-fullscreen-dialog"
import { MODAL_EXPAND_SPRING } from "./motion"
import { mermaidConstants } from "./constants"

export const DIAGRAM_REVEAL_SPRING = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
} as const

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
  const svgHostRef = useRef<HTMLDivElement | null>(null)
  const instanceId = useId()
  const layoutId = artifactID
    ? `mermaid-zoom-${artifactID}-${instanceId}`
    : `mermaid-zoom-${instanceId}`

  const { state } = useMermaidRender({ source, artifactID })

  const handleFullscreenOpen = useCallback(() => {
    setFullscreenOpen(true)
  }, [])

  const readyValue = state.status === "ready" ? state.value : undefined

  const actions =
    state.status === "ready" ? (
      <MermaidActionBar
        source={source}
        onFullscreenOpen={handleFullscreenOpen}
        svgRef={svgHostRef}
        originalSvg={state.value.svg}
        artifactID={artifactID}
        minimal={props.minimalActions}
      />
    ) : null

  const content = (
    <div className={props.className}>
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
          className="overflow-hidden rounded-[14px]"
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
          <MermaidInlineView value={state.value} ariaLabel={props.alt} svgRef={svgHostRef} />
        </motion.div>
      ) : null}

      {state.status === "error" ? (
        <>
          <div
            className={
              props.failureClassName ??
              "rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base"
            }
          >
            {language.t("chatTools.mermaidDiagram.renderErrorPrefix")} {state.message}
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
