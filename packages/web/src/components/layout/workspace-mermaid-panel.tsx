import { measureElement as measureVirtualElement, useVirtualizer } from "@tanstack/react-virtual"
import { useCallback, useEffect, useRef, useState } from "react"
import { Badge, Button, Card, CardContent } from "@buddy/ui"
import { language } from "@/context/language"
import { MermaidDiagram } from "@/components/chat/tools/render/mermaid/mermaid-diagram"
import { RefreshCwIcon, LayoutTemplateIcon } from "lucide-react"
import {
  VIRTUAL_MERMAID_CARD_ESTIMATE_PX,
  VIRTUAL_MERMAID_MIN_ITEMS,
  VIRTUAL_MERMAID_OVERSCAN,
} from "@/components/virtualization/virtualization-defaults"
import {
  loadWorkspaceMermaidArtifacts,
  type WorkspaceMermaidArtifactView,
} from "@/state/chat-actions"

function formatCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

function artifactLabel(count: number): string {
  return `${count} diagram${count === 1 ? "" : "s"}`
}

export function WorkspaceMermaidPanel(props: { directory: string }) {
  const [artifacts, setArtifacts] = useState<WorkspaceMermaidArtifactView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const artifactsListRef = useRef<HTMLDivElement>(null)

  const loadArtifacts = useCallback(
    async (isDisposed?: () => boolean) => {
      const disposed = isDisposed ?? (() => false)
      if (!disposed()) {
        setLoading(true)
        setError(undefined)
      }

      try {
        const result = await loadWorkspaceMermaidArtifacts(props.directory)
        if (disposed()) return
        setArtifacts(result.artifacts)
      } catch (loadError) {
        if (disposed()) return
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      } finally {
        if (!disposed()) {
          setLoading(false)
        }
      }
    },
    [props.directory],
  )

  const shouldVirtualizeArtifacts = artifacts.length >= VIRTUAL_MERMAID_MIN_ITEMS
  const artifactsVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: shouldVirtualizeArtifacts ? artifacts.length : 0,
    getScrollElement: () => artifactsListRef.current,
    getItemKey: (index) => artifacts[index]?.artifactID ?? index,
    estimateSize: () => VIRTUAL_MERMAID_CARD_ESTIMATE_PX,
    measureElement: measureVirtualElement,
    enabled: shouldVirtualizeArtifacts,
    overscan: VIRTUAL_MERMAID_OVERSCAN,
  })

  function renderArtifactCard(artifact: WorkspaceMermaidArtifactView, index: number) {
    return (
      <div className={index === artifacts.length - 1 ? "" : "pb-3"}>
        <Card
          size="sm"
          data-component="mermaid-artifact-item"
          data-artifact-id={artifact.artifactID}
          className="gap-0 py-0"
        >
          <CardContent className="space-y-3 px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{artifact.diagramType}</Badge>
              <Badge variant="outline">{formatCreatedAt(artifact.createdAt)}</Badge>
              {artifact.repairAttempts > 0 ? (
                <Badge variant="outline">
                  {language.t("workspaceMermaid.repairedPrefix")} {artifact.repairAttempts}{" "}
                  {artifact.repairAttempts === 1
                    ? language.t("workspaceMermaid.repairedTime")
                    : language.t("workspaceMermaid.repairedTimes")}
                </Badge>
              ) : null}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-text-base">{artifact.alt}</p>
              {artifact.caption ? (
                <p className="text-sm text-text-weak">{artifact.caption}</p>
              ) : null}
            </div>

            <MermaidDiagram
              source={artifact.source}
              artifactID={artifact.artifactID}
              alt={artifact.alt}
              className="rounded-lg border border-border-base bg-background-base p-3"
              failureClassName="rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 p-3 text-sm text-icon-critical-base"
              showRawSourceOnError
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  useEffect(() => {
    let disposed = false
    void loadArtifacts(() => disposed)

    return () => {
      disposed = true
    }
  }, [loadArtifacts])

  return (
    <div data-component="workspace-mermaid-panel" className="flex min-h-0 flex-1 flex-col p-3">
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider leading-none text-text-weak">
            {language.t("workspaceMermaid.title")}
          </p>
          <p className="line-clamp-2 text-xs text-text-weak">{artifactLabel(artifacts.length)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            data-action="workspace-mermaid-refresh"
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => void loadArtifacts()}
            disabled={loading}
            title={language.t("common.refresh")}
          >
            <RefreshCwIcon className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-text-weak">{language.t("workspaceMermaid.loading")}</div>
      ) : null}

      {!loading && artifacts.length === 0 ? (
        <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border-base/40 bg-surface-weak/5 px-4 py-10 text-center">
          <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-surface-weak shadow-sm">
            <LayoutTemplateIcon className="size-4 text-text-weak" />
          </div>
          <h3 className="text-[13px] font-medium text-text-base">No Diagrams Yet</h3>
          <p className="mt-1.5 max-w-[220px] text-[12px] leading-relaxed text-text-weak">
            {language.t("workspaceMermaid.emptyState")}
          </p>
        </div>
      ) : null}

      {artifacts.length > 0 ? (
        <div ref={artifactsListRef} className="flex-1 min-h-0 overflow-y-auto">
          {shouldVirtualizeArtifacts ? (
            <div
              className="relative w-full"
              style={{ height: `${artifactsVirtualizer.getTotalSize()}px` }}
            >
              {artifactsVirtualizer.getVirtualItems().map((virtualRow) => {
                const artifact = artifacts[virtualRow.index]
                if (!artifact) return null

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={artifactsVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {renderArtifactCard(artifact, virtualRow.index)}
                  </div>
                )
              })}
            </div>
          ) : (
            <div>
              {artifacts.map((artifact, index) => (
                <div key={artifact.artifactID}>{renderArtifactCard(artifact, index)}</div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base">
          {error}
        </p>
      ) : null}
    </div>
  )
}
