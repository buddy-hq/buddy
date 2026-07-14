import { Skeleton, cn } from "@buddy/ui"
import { Alert, AlertDescription, AlertTitle } from "@buddy/ui/components/ui/alert"
import { useEffect, useId, useMemo } from "react"
import {
  useInlineAssetActivation,
  useInlineAssetLifecycleReporter,
} from "@/components/chat/inline-asset-boundary"
import { chemistryFormatLabel, type ChemistryFormat } from "./formats"
import { chemistryDiagramViewportClass } from "./layout"
import { scopeChemistrySvgIDs } from "./svg"
import { useChemistryRender } from "./use-chemistry-render"

const MAX_ERROR_SUMMARY_CHARACTERS = 240

export type ChemistryDiagramRenderState =
  | { status: "loading" }
  | { status: "ready"; warnings: string[] }
  | { status: "error"; message: string; code?: string }

export type ChemistryDiagramProps = {
  source: string
  format: ChemistryFormat
  directory?: string
  alt?: string
  className?: string
  enabled?: boolean
  showSourceOnError?: boolean
  onRenderStateChange?: (state: ChemistryDiagramRenderState) => void
}

function summarizeError(message: string): string {
  const singleLine = message.trim().replace(/\s+/gu, " ")
  if (singleLine.length <= MAX_ERROR_SUMMARY_CHARACTERS) {
    return singleLine
  }
  return `${singleLine.slice(0, MAX_ERROR_SUMMARY_CHARACTERS - 3)}...`
}

function chemistryErrorGuidance(format: ChemistryFormat, code?: string): string {
  switch (code) {
    case "renderer_busy":
      return "The chemistry renderer is busy. Try again after pending renders finish."
    case "indigo_render_timeout":
      return "The browser renderer timed out. Retry the render."
    case "indigo_runtime_unavailable":
      return "The browser renderer is unavailable. Retry after its local runtime is restored."
    case "indigo_render_failed":
    case "render_cancelled":
      return "The browser renderer stopped before producing the structure. Retry the render."
    case "chemfig_render_timeout":
      return "The backend renderer timed out. Retry the render."
    case "chemfig_runtime_unavailable":
      return "The backend renderer is unavailable. Retry after the local runtime is restored."
    case "chemfig_dvi_conversion_failed":
    case "chemfig_invalid_svg":
    case "chemfig_output_too_large":
    case "chemfig_render_failed":
      return "The backend renderer failed after receiving the source. Retry or report the failure."
    case "invalid_source":
    case "source_too_large":
    case "unsafe_source":
    case "chemfig_tex_compile_failed":
      return `Review the source and ${chemistryFormatLabel(format)} constraints, then retry.`
    default:
      return `Review the source for ${chemistryFormatLabel(format)} compatibility, then retry.`
  }
}

export function ChemistryDiagram(props: ChemistryDiagramProps) {
  const activation = useInlineAssetActivation()
  const onRenderStateChange = props.onRenderStateChange
  const svgInstanceID = useId()
  const enabled = (props.enabled ?? true) && activation.active
  const state = useChemistryRender({
    source: props.source,
    format: props.format,
    directory: props.directory,
    enabled,
  })
  const label = props.alt?.trim() || `${chemistryFormatLabel(props.format)} chemistry diagram`
  const viewportClass = chemistryDiagramViewportClass(props.format)
  const scopedSvg = useMemo(
    () =>
      state.status === "ready"
        ? scopeChemistrySvgIDs(state.value.svg, `buddy-chemistry-${svgInstanceID}`)
        : undefined,
    [state, svgInstanceID],
  )
  useInlineAssetLifecycleReporter({
    ref: activation.ref,
    active: enabled && (state.status === "ready" || state.status === "error"),
  })

  useEffect(() => {
    if (state.status === "error") {
      onRenderStateChange?.({ status: "error", message: state.message, code: state.code })
      return
    }
    onRenderStateChange?.(
      state.status === "ready"
        ? { status: "ready", warnings: state.value.warnings }
        : { status: "loading" },
    )
  }, [onRenderStateChange, state])

  return (
    <div ref={activation.ref} className={cn("min-w-0", props.className)}>
      <figure
        data-component="chemistry-diagram"
        data-chemistry-format={props.format}
        data-markdown-export-status={state.status}
        className="min-w-0"
      >
        <div className={cn(viewportClass, "min-w-0 overflow-auto")}>
          {state.status === "loading" ? (
            <div
              role="status"
              aria-label={`Rendering ${chemistryFormatLabel(props.format)} structure`}
              className="flex h-full items-center justify-center py-6"
            >
              <Skeleton className="h-32 w-full max-w-md rounded-lg" />
            </div>
          ) : null}

          {state.status === "ready" ? (
            <div className="flex h-full flex-col gap-3 overflow-auto">
              <div
                role="img"
                aria-label={label}
                data-component="chemistry-svg"
                className="flex min-h-40 w-full min-w-0 flex-1 items-center justify-center overflow-auto py-4 text-text-base [&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: scopedSvg ?? state.value.svg }}
              />
              {state.value.warnings.length > 0 ? (
                <Alert>
                  <AlertTitle>Structure warning</AlertTitle>
                  <AlertDescription>
                    {summarizeError(state.value.warnings.join(" · "))}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="flex h-full flex-col gap-3 overflow-auto">
              <Alert variant="destructive">
                <AlertTitle>Chemistry rendering failed</AlertTitle>
                <AlertDescription>
                  <p>{summarizeError(state.message)}</p>
                  <p>{chemistryErrorGuidance(props.format, state.code)}</p>
                </AlertDescription>
              </Alert>
              {props.showSourceOnError !== false ? (
                <details className="rounded-md border border-border-base bg-surface-weak">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-text-weak">
                    View chemistry source
                  </summary>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border-base p-3 text-xs text-text-base">
                    <code>{props.source}</code>
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </div>

      </figure>
    </div>
  )
}
