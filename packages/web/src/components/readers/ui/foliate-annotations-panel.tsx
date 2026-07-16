import { PencilLineIcon, XIcon } from "@/icons/app-icons"
import { Button, ScrollArea, cn } from "@buddy/ui"
import { ANNOTATIONS_EMPTY_MESSAGE, VIRTUALIZE_ROW_THRESHOLD } from "../foliate-reader-constants"
import type { ReaderAnnotation } from "../foliate-reader-types"
import { ANNOTATION_COLORS, ANNOTATION_STYLE_LABELS } from "../foliate-reader-constants"
import { getAnnotationColorId, getAnnotationStyle } from "../utils/foliate-helpers"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"

export interface FoliateAnnotationsPanelProps {
  annotations: ReaderAnnotation[]
  onShowAnnotation: (annotation: ReaderAnnotation) => void
  onOpenAnnotationDialog: (annotation: ReaderAnnotation) => void
  onDeleteAnnotation: (value: string) => void
  annotationViewportRef: React.RefObject<HTMLDivElement>
}

export function FoliateAnnotationsPanel({
  annotations,
  onShowAnnotation,
  onOpenAnnotationDialog,
  onDeleteAnnotation,
  annotationViewportRef,
}: FoliateAnnotationsPanelProps) {
  const renderAnnotation = (annotation: ReaderAnnotation) => {
    const colorId = getAnnotationColorId(annotation.color)
    const colorDef = ANNOTATION_COLORS[colorId]
    const styleLabel = ANNOTATION_STYLE_LABELS[getAnnotationStyle(annotation)]

    return (
      <div className="group mb-0.5 flex items-start gap-2 px-1 py-2 transition-colors hover:bg-surface-weak/60">
        {/* Color swatch */}
        <span className={cn("mt-1 size-1.5 shrink-0", colorDef.previewClassName)} />
        <button
          type="button"
          onClick={() => onShowAnnotation(annotation)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="text-[10px] uppercase tracking-[0.1em] text-text-weaker">
            {styleLabel}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-text-base">
            {annotation.text}
          </div>
          {annotation.note ? (
            <div className="mt-0.5 line-clamp-1 text-[11px] text-text-weaker">
              {annotation.note}
            </div>
          ) : null}
        </button>
        {/* Action buttons — reveal on hover */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onOpenAnnotationDialog(annotation)}
            className="size-6"
          >
            <PencilLineIcon className="size-3" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onDeleteAnnotation(annotation.value)}
            className="size-6"
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border-base/40 px-3 py-2.5">
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-weaker">
          Annotations
        </span>
        {annotations.length > 0 ? (
          <span className="ml-2 font-mono text-[10px] text-text-weaker">{annotations.length}</span>
        ) : null}
      </div>

      <ScrollArea className="h-full px-2 py-2" viewportRef={annotationViewportRef}>
        {annotations.length === 0 ? (
          <p className="px-2 py-4 text-[12px] text-text-weaker">{ANNOTATIONS_EMPTY_MESSAGE}</p>
        ) : annotations.length >= VIRTUALIZE_ROW_THRESHOLD ? (
          <VirtualizedRows
            items={annotations}
            getItemKey={(item) => item.value}
            estimateSize={() => 72}
            getScrollElement={() => annotationViewportRef.current}
            overscan={8}
            measure
            renderItem={renderAnnotation}
          />
        ) : (
          <div>{annotations.map(renderAnnotation)}</div>
        )}
      </ScrollArea>
    </div>
  )
}
