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
import {
  workspaceArtifactsQueryKeys,
  workspaceMermaidArtifactsQueryOptions,
} from "@/state/workspace-artifacts-query"
import {
  artifactKindFilter,
  type MermaidLibraryArtifact,
} from "@/components/layout/chat-left-sidebar/library-artifact-selectors"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"

const MERMAID_CARD_CONTENT_HEIGHT_CLASS = "aspect-video min-h-[18rem] w-full"
const MERMAID_CARD_GAP_PX = 16

function MermaidArtifactPlaceholderCard(props: { artifact: MermaidLibraryArtifact }) {
  return (
    <MermaidToolCard
      title={props.artifact.summary.alt}
      diagramType={props.artifact.summary.diagramType}
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

function HydratedMermaidArtifactCard(props: {
  directory: string
  artifact: MermaidLibraryArtifact
  enabled: boolean
}) {
  const detailQuery = useQuery({
    queryKey: [
      "workspace-artifact-detail",
      "mermaid",
      props.directory,
      props.artifact.artifactID,
    ] as const,
    queryFn: async () =>
      requireBuddyData(
        await getBuddyClient(props.directory).mermaid.read({
          directory: props.directory,
          artifactID: props.artifact.artifactID,
        }),
      ),
  })

  if (detailQuery.isPending) {
    return <MermaidArtifactPlaceholderCard artifact={props.artifact} />
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <MermaidToolCard
        title={props.artifact.summary.alt}
        diagramType={props.artifact.summary.diagramType}
        hideStatus
        contentClassName={MERMAID_CARD_CONTENT_HEIGHT_CLASS}
      >
        <div className="flex h-full w-full items-center justify-center bg-surface-critical-base/10 p-4 text-center text-xs text-icon-critical-base">
          {detailQuery.error ? stringifyError(detailQuery.error) : "Unable to load diagram."}
        </div>
      </MermaidToolCard>
    )
  }

  return (
    <MermaidDiagram
      directory={props.directory}
      source={detailQuery.data.source}
      artifactID={props.artifact.artifactID}
      alt={detailQuery.data.alt}
      enabled={props.enabled}
      renderPriority={1}
      showRawSourceOnError
      minimalActions
      disableRevealAnimation
      renderWrapper={(diagramElement, actions) => (
        <MermaidToolCard
          title={detailQuery.data.alt}
          diagramType={detailQuery.data.diagramType}
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
  const [visibleIndexes, setVisibleIndexes] = useState<number[]>([])
  const artifactsListRef = useRef<HTMLDivElement>(null)
  const artifactsQuery = useQuery(workspaceMermaidArtifactsQueryOptions(props.directory))
  const artifacts = (artifactsQuery.data?.artifacts ?? []).filter(artifactKindFilter("mermaid"))
  const loadErrors = artifactsQuery.data?.loadErrors ?? []
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

      setVisibleIndexes((current) =>
        sameIndexes(current, visibleIndexes) ? current : visibleIndexes,
      )

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

  function renderArtifactCard(
    artifact: MermaidLibraryArtifact,
    input: { hydrated: boolean; visible: boolean },
  ) {
    if (!input.hydrated) {
      return <MermaidArtifactPlaceholderCard artifact={artifact} />
    }

    return (
      <HydratedMermaidArtifactCard
        directory={props.directory}
        artifact={artifact}
        enabled={input.visible}
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

    setVisibleIndexes((current) => {
      const next = current.filter((index) => index < artifacts.length)
      return sameIndexes(current, next) ? current : next
    })
  }, [artifacts.length])

  return (
    <div data-component="workspace-mermaid-panel" className="flex min-h-0 flex-1 flex-col p-3">
      {loading ? (
        <div className="text-sm text-text-weak">{language.t("workspaceMermaid.loading")}</div>
      ) : null}

      {!loading && artifacts.length === 0 && loadErrors.length === 0 ? (
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
                const visible = visibleIndexes.includes(virtualRow.index)

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={artifactsVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {renderArtifactCard(artifact, { hydrated, visible })}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {artifacts.map((artifact) => (
                <div key={artifact.artifactID}>
                  {renderArtifactCard(artifact, { hydrated: true, visible: true })}
                </div>
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
      {loadErrors.map((loadError) => (
        <p
          key={`${loadError.kind}:${loadError.artifactID}:${loadError.message}`}
          className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base"
        >
          {loadError.message}
        </p>
      ))}
    </div>
  )
}
