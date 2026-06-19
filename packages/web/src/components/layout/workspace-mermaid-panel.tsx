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
  objectMermaidPayloadQueryOptions,
  workspaceObjectsQueryKeys,
  workspaceMermaidObjectsQueryOptions,
} from "@/state/workspace-objects-query"
import {
  createBenchObjectTarget,
  selectMermaidObjects,
  workspaceObjectLoadErrorKey,
  type MermaidLibraryObject,
} from "@/components/layout/chat-left-sidebar/library-object-selectors"
import { useInvalidateQueryOnChatIdle } from "@/components/layout/use-invalidate-query-on-chat-idle"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"

const MERMAID_CARD_CONTENT_HEIGHT_CLASS = "aspect-video min-h-[18rem] w-full"
const MERMAID_CARD_GAP_PX = 16

function MermaidObjectPlaceholderCard(props: { object: MermaidLibraryObject }) {
  return (
    <MermaidToolCard
      title={props.object.title}
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

function HydratedMermaidObjectCard(props: {
  directory: string
  object: MermaidLibraryObject
  enabled: boolean
}) {
  const openBenchRoute = useOpenBench()
  const detailQuery = useQuery({
    ...objectMermaidPayloadQueryOptions({
      directory: props.directory,
      objectID: props.object.objectID,
    }),
  })

  if (detailQuery.isPending) {
    return <MermaidObjectPlaceholderCard object={props.object} />
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <MermaidToolCard
        title={props.object.title}
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
      alt={detailQuery.data.alt}
      enabled={props.enabled}
      renderPriority={1}
      showRawSourceOnError
      minimalActions
      disableRevealAnimation
      onFullscreenOpen={() => {
        void openBenchRoute({
          directory: props.directory,
          target: createBenchObjectTarget("mermaid", props.object.objectID),
          mode: BENCH_MODE_REQUEST_POLICY,
          autoOpen: null,
        })
      }}
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
  const objectsListRef = useRef<HTMLDivElement>(null)
  const objectsQuery = useQuery(workspaceMermaidObjectsQueryOptions(props.directory))
  const objects = selectMermaidObjects(objectsQuery)
  const loadErrors = objectsQuery.data?.loadErrors ?? []
  const loading = objectsQuery.isPending
  const error = objectsQuery.error ? stringifyError(objectsQuery.error) : undefined

  const shouldVirtualizeObjects = objects.length >= VIRTUAL_MERMAID_MIN_ITEMS
  const objectsVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: shouldVirtualizeObjects ? objects.length : 0,
    getScrollElement: () => objectsListRef.current,
    getItemKey: (index) => objects[index]?.objectID ?? index,
    estimateSize: () => VIRTUAL_MERMAID_CARD_ESTIMATE_PX,
    measureElement: measureVirtualElement,
    enabled: shouldVirtualizeObjects,
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
        const next = mergeRetainedIndexes(current, visibleIndexes, objects.length)
        return sameIndexes(current, next) ? current : next
      })

      setRetainedIndexes((current) => {
        const next = mergeRetainedIndexes(current, visibleIndexes, VIRTUAL_MERMAID_RETAINED_ITEMS)
        return sameIndexes(current, next) ? current : next
      })
    },
  })

  function renderObjectCard(
    object: MermaidLibraryObject,
    input: { hydrated: boolean; visible: boolean },
  ) {
    if (!input.hydrated) {
      return <MermaidObjectPlaceholderCard object={object} />
    }

    return (
      <HydratedMermaidObjectCard
        directory={props.directory}
        object={object}
        enabled={input.visible}
      />
    )
  }

  useInvalidateQueryOnChatIdle({
    directory: props.directory,
    queryKey: workspaceObjectsQueryKeys.mermaid(props.directory),
  })

  useEffect(() => {
    setHydratedIndexes((current) => {
      const next = current.filter((index) => index < objects.length)
      return sameIndexes(current, next) ? current : next
    })

    setRetainedIndexes((current) => {
      const next = current.filter((index) => index < objects.length)
      return sameIndexes(current, next) ? current : next
    })

    setVisibleIndexes((current) => {
      const next = current.filter((index) => index < objects.length)
      return sameIndexes(current, next) ? current : next
    })
  }, [objects.length])

  return (
    <div data-component="workspace-mermaid-panel" className="flex min-h-0 flex-1 flex-col p-3">
      {loading ? (
        <div className="text-sm text-text-weak">{language.t("workspaceMermaid.loading")}</div>
      ) : null}

      {!loading && objects.length === 0 && loadErrors.length === 0 ? (
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

      {objects.length > 0 ? (
        <div
          ref={objectsListRef}
          className="scrollbar-hover flex-1 min-h-0 overflow-y-auto"
          style={{ contain: "strict", overflowAnchor: "none" }}
        >
          {shouldVirtualizeObjects ? (
            <div
              className="relative w-full"
              style={{ height: `${objectsVirtualizer.getTotalSize()}px` }}
            >
              {objectsVirtualizer.getVirtualItems().map((virtualRow) => {
                const object = objects[virtualRow.index]
                if (!object) return null
                const hydrated = hydratedIndexes.includes(virtualRow.index)
                const visible = visibleIndexes.includes(virtualRow.index)

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={objectsVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {renderObjectCard(object, { hydrated, visible })}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {objects.map((object) => (
                <div key={object.objectID}>
                  {renderObjectCard(object, { hydrated: true, visible: true })}
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
          key={workspaceObjectLoadErrorKey(loadError)}
          className="mt-2 rounded-md border border-border-critical-base/40 bg-surface-critical-base/10 px-2 py-1.5 text-xs text-icon-critical-base"
        >
          {loadError.message}
        </p>
      ))}
    </div>
  )
}
