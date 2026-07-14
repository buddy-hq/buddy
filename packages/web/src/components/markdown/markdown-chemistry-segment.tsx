import { Button, Skeleton } from "@buddy/ui"
import { Alert, AlertDescription, AlertTitle } from "@buddy/ui/components/ui/alert"
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from "react"
import { ChemistryErrorBoundary } from "@/components/media/renderers/chemistry/chemistry-error-boundary"
import {
  chemistryFormatLabel,
  type ChemistryFormat,
} from "@/components/media/renderers/chemistry/formats"
import { chemistryDiagramViewportClass } from "@/components/media/renderers/chemistry/layout"
import {
  reportChemistryRenderFailure,
  shouldReportChemistryRenderFailure,
} from "@/components/media/renderers/chemistry/auto-repair"
import type { ChemistryDiagramRenderState } from "@/components/media/renderers/chemistry/chemistry-diagram"

async function loadChemistryDiagram() {
  const module = await import("@/components/media/renderers/chemistry/chemistry-diagram")
  return { default: module.ChemistryDiagram }
}

function lazyChemistryDiagramForAttempt(attempt: number) {
  void attempt
  return lazy(loadChemistryDiagram)
}

function ChemistryDiagramFallback(props: { format: ChemistryFormat }): ReactNode {
  const formatLabel = chemistryFormatLabel(props.format)
  const viewportClass = chemistryDiagramViewportClass(props.format)
  return (
    <div
      role="status"
      aria-label={`Loading ${formatLabel} chemistry renderer`}
      className={`${viewportClass} flex items-center justify-center py-6`}
    >
      <Skeleton className="h-32 w-full max-w-md rounded-lg" />
    </div>
  )
}

export function MarkdownChemistrySegment(props: {
  format: ChemistryFormat
  source: string
  alt: string
  directory?: string
  autoRepairContext?: {
    directory: string
    sessionID: string
    messageID: string
    partID: string
    segmentIndex: number
    rawFence: string
  }
}): ReactNode {
  const [loadAttempt, setLoadAttempt] = useState(0)
  const repairDirectory = props.autoRepairContext?.directory
  const repairSessionID = props.autoRepairContext?.sessionID
  const repairMessageID = props.autoRepairContext?.messageID
  const repairPartID = props.autoRepairContext?.partID
  const repairSegmentIndex = props.autoRepairContext?.segmentIndex
  const repairRawFence = props.autoRepairContext?.rawFence
  const viewportClass = chemistryDiagramViewportClass(props.format)
  const ChemistryDiagram = useMemo(() => lazyChemistryDiagramForAttempt(loadAttempt), [loadAttempt])
  const onRenderStateChange = useCallback(
    (state: ChemistryDiagramRenderState) => {
      if (
        !repairDirectory ||
        !repairSessionID ||
        !repairMessageID ||
        !repairPartID ||
        repairSegmentIndex === undefined ||
        repairRawFence === undefined ||
        !shouldReportChemistryRenderFailure(state)
      ) {
        return
      }
      void reportChemistryRenderFailure({
        directory: repairDirectory,
        sessionID: repairSessionID,
        assistantMessageID: repairMessageID,
        partID: repairPartID,
        segmentIndex: repairSegmentIndex,
        rawFence: repairRawFence,
        format: props.format,
        source: props.source,
      }).catch(() => undefined)
    },
    [
      props.format,
      props.source,
      repairDirectory,
      repairMessageID,
      repairPartID,
      repairRawFence,
      repairSegmentIndex,
      repairSessionID,
    ],
  )
  return (
    <section
      aria-label={props.alt}
      data-component="markdown-chemistry"
      data-chemistry-format={props.format}
      className="not-prose my-4 min-w-0"
    >
      <ChemistryErrorBoundary
        resetKeys={[props.format, props.source, loadAttempt]}
        fallback={({ error, retry }) => (
          <div className={`${viewportClass} flex flex-col gap-3 overflow-auto`}>
            <Alert variant="destructive">
              <AlertTitle>Chemistry renderer unavailable</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
            <details className="rounded-md border border-border-base bg-surface-weak">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-text-weak">
                View preserved chemistry source
              </summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-border-base p-3 text-xs text-text-base">
                <code>{props.source}</code>
              </pre>
            </details>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setLoadAttempt((attempt) => attempt + 1)
                  retry()
                }}
              >
                Retry chemistry renderer
              </Button>
            </div>
          </div>
        )}
      >
        <Suspense fallback={<ChemistryDiagramFallback format={props.format} />}>
          <ChemistryDiagram
            source={props.source}
            format={props.format}
            directory={props.directory}
            alt={props.alt}
            onRenderStateChange={onRenderStateChange}
          />
        </Suspense>
      </ChemistryErrorBoundary>
    </section>
  )
}
