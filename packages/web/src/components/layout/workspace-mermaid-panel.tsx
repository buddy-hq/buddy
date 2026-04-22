import {
  defaultRangeExtractor,
  measureElement as measureVirtualElement,
  useVirtualizer,
} from "@tanstack/react-virtual"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import { language } from "@/context/language"
import { MermaidDiagram } from "@/components/chat/tools/render/mermaid/mermaid-diagram"
import { MermaidToolCard } from "@/components/chat/tools/render/mermaid/mermaid-tool-card"
import { LayoutTemplateIcon } from "lucide-react"
import { stringifyError } from "@/lib/api-client"
import {
  VIRTUAL_MERMAID_CARD_ESTIMATE_PX,
  VIRTUAL_MERMAID_RETAINED_ITEMS,
  VIRTUAL_MERMAID_MIN_ITEMS,
  VIRTUAL_MERMAID_OVERSCAN,
} from "@/components/virtualization/virtualization-defaults"
import type { WorkspaceMermaidArtifactView } from "@/state/chat-actions"
import {
  workspaceArtifactsQueryKeys,
  workspaceMermaidArtifactsQueryOptions,
} from "@/state/workspace-artifacts-query"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"

const MERMAID_CARD_CONTENT_HEIGHT_CLASS = "aspect-video min-h-[18rem] w-full"
const MERMAID_CARD_GAP_PX = 16

function mergeRetainedIndexes(current: number[], next: number[], max: number) {
  const retained = [...current]

  for (const index of next) {
    const existingIndex = retained.indexOf(index)
    if (existingIndex >= 0) {
      retained.splice(existingIndex, 1)
    }
    retained.push(index)
  }

  if (retained.length <= max) {
    return retained
  }

  return retained.slice(retained.length - max)
}

function sameIndexes(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

export function WorkspaceMermaidPanel(props: { directory: string }) {
  const [hydratedIndexes, setHydratedIndexes] = useState<number[]>([])
  const [retainedIndexes, setRetainedIndexes] = useState<number[]>([])
  const artifactsListRef = useRef<HTMLDivElement>(null)
  const artifactsQuery = useQuery(workspaceMermaidArtifactsQueryOptions(props.directory))
  const artifacts = artifactsQuery.data?.artifacts ?? []
  const loading = artifactsQuery.isPending
  const error = artifactsQuery.error ? stringifyError(artifactsQuery.error) : undefined

  const shouldVirtualizeArtifacts = artifacts.length >= VIRTUAL_MERMAID_MIN_ITEMS
  const artifactsVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: shouldVirtualizeArtifacts ? artifacts.length : 0,
    getScrollElement: () => artifactsListRef.current,
    getItemKey: (index) => artifacts[index]?.artifactID ?? index,
    estimateSize: () => VIRTUAL_MERMAID_CARD_ESTIMATE_PX,
    measureElement: measureVirtualElement,
    enabled: shouldVirtualizeArtifacts,
    overscan: VIRTUAL_MERMAID_OVERSCAN,
    gap: MERMAID_CARD_GAP_PX,
    rangeExtractor: (range) => {
      const indexes = new Set(defaultRangeExtractor(range))

      for (const retainedIndex of retainedIndexes) {
        indexes.add(retainedIndex)
      }

      return [...indexes].toSorted((left, right) => left - right)
    },
    onChange: (instance, sync) => {
      if (sync) {
        return
      }

      const range = instance.range
      if (!range) {
        return
      }

      const visibleIndexes: number[] = []
      for (let index = range.startIndex; index <= range.endIndex; index += 1) {
        visibleIndexes.push(index)
      }

      setHydratedIndexes((current) => {
        const next = mergeRetainedIndexes(current, visibleIndexes, artifacts.length)
        return sameIndexes(current, next) ? current : next
      })

      setRetainedIndexes((current) => {
        const next = mergeRetainedIndexes(current, visibleIndexes, VIRTUAL_MERMAID_RETAINED_ITEMS)
        return sameIndexes(current, next) ? current : next
      })
    },
  })

  function renderArtifactCard(artifact: WorkspaceMermaidArtifactView, hydrated: boolean) {
    if (!hydrated) {
      return (
        <MermaidToolCard
          title={artifact.alt}
          diagramType={artifact.diagramType}
          hideStatus
          contentClassName={MERMAID_CARD_CONTENT_HEIGHT_CLASS}
        >
          <div className="flex h-full w-full items-center justify-center bg-surface-weak/10 p-3">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-12 w-24 animate-pulse rounded-lg border border-border-base/50 bg-surface-raised-base/80 shadow-inner" />
              <p className="text-sm text-text-weak">
                {language.t("chatTools.mermaidDiagram.rendering")}
              </p>
            </div>
          </div>
        </MermaidToolCard>
      )
    }

    return (
      <MermaidDiagram
        source={artifact.source}
        artifactID={artifact.artifactID}
        alt={artifact.alt}
        showRawSourceOnError
        minimalActions
        disableRevealAnimation
        renderWrapper={(diagramElement, actions) => (
          <MermaidToolCard
            title={artifact.alt}
            diagramType={artifact.diagramType}
            hideStatus
            contentClassName={MERMAID_CARD_CONTENT_HEIGHT_CLASS}
            actions={actions}
          >
            <div className="h-full w-full p-3">{diagramElement}</div>
          </MermaidToolCard>
        )}
      />
    )
  }

  useInvalidateQueryOnChatIdle({
    directory: props.directory,
    queryKey: workspaceArtifactsQueryKeys.mermaid(props.directory),
  })

  useEffect(() => {
    setHydratedIndexes((current) => {
      const next = current.filter((index) => index < artifacts.length)
      return sameIndexes(current, next) ? current : next
    })

    setRetainedIndexes((current) => {
      const next = current.filter((index) => index < artifacts.length)
      return sameIndexes(current, next) ? current : next
    })
  }, [artifacts.length])

  return (
    <div data-component="workspace-mermaid-panel" className="flex min-h-0 flex-1 flex-col p-3">
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
        <div
          ref={artifactsListRef}
          className="scrollbar-hover flex-1 min-h-0 overflow-y-auto"
          style={{ contain: "strict", overflowAnchor: "none" }}
        >
          {shouldVirtualizeArtifacts ? (
            <div
              className="relative w-full"
              style={{ height: `${artifactsVirtualizer.getTotalSize()}px` }}
            >
              {artifactsVirtualizer.getVirtualItems().map((virtualRow) => {
                const artifact = artifacts[virtualRow.index]
                if (!artifact) return null
                const hydrated = hydratedIndexes.includes(virtualRow.index)

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={artifactsVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {renderArtifactCard(artifact, hydrated)}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {artifacts.map((artifact) => (
                <div key={artifact.artifactID}>{renderArtifactCard(artifact, true)}</div>
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
