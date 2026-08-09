import { PencilLineIcon, XIcon } from "@/icons/app-icons"
import { Button, ScrollArea, cn } from "@buddy/ui"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"
import type { ReaderAnnotationViewModel } from "../reader-types"
import {
  READER_ANNOTATION_COLOR_OPTIONS,
  READER_ANNOTATION_STYLE_LABELS,
  READER_EMPTY_ANNOTATIONS_MESSAGE,
  READER_VIRTUALIZE_ROW_THRESHOLD,
} from "./reader-ui-constants"

type ReaderAnnotationsPanelProps = {
  annotations: ReaderAnnotationViewModel[]
  onShowAnnotation: (annotation: ReaderAnnotationViewModel) => void
  onEditAnnotation: (annotation: ReaderAnnotationViewModel) => void
  onDeleteAnnotation: (annotationId: string) => void
  viewportRef: React.RefObject<HTMLDivElement>
}

export function ReaderAnnotationsPanel({
  annotations,
  onShowAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  viewportRef,
}: ReaderAnnotationsPanelProps) {
  const renderAnnotation = (annotation: ReaderAnnotationViewModel) => {
    const color = READER_ANNOTATION_COLOR_OPTIONS.find((option) => option.id === annotation.color)
    return (
      <div className="group mb-0.5 flex items-start gap-2 rounded-md px-1 py-2 hover:bg-surface-base-hover">
        <span
          aria-hidden="true"
          className={cn("mt-1.5 size-2 shrink-0 rounded-full", color?.previewClassName)}
        />
        <button
          type="button"
          onClick={() => onShowAnnotation(annotation)}
          className="min-w-0 flex-1 rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base"
        >
          <span className="block text-xs uppercase tracking-wide text-text-weaker">
            {READER_ANNOTATION_STYLE_LABELS[annotation.style]}
            {annotation.locationLabel ? ` · ${annotation.locationLabel}` : ""}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-text-base">
            {annotation.text}
          </span>
          {annotation.note ? (
            <span className="mt-0.5 line-clamp-1 block text-xs text-text-weaker">
              {annotation.note}
            </span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => onEditAnnotation(annotation)}
            aria-label="Edit annotation"
          >
            <PencilLineIcon />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => onDeleteAnnotation(annotation.id)}
            aria-label="Delete annotation"
          >
            <XIcon />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center border-b px-3 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-text-weaker">
          Annotations
        </span>
        {annotations.length > 0 ? (
          <span className="ml-2 font-mono text-xs text-text-weaker">{annotations.length}</span>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 py-2" viewportRef={viewportRef}>
        {annotations.length === 0 ? (
          <p className="px-2 py-4 text-sm text-text-weaker">{READER_EMPTY_ANNOTATIONS_MESSAGE}</p>
        ) : annotations.length >= READER_VIRTUALIZE_ROW_THRESHOLD ? (
          <VirtualizedRows
            items={annotations}
            getItemKey={(item) => item.id}
            estimateSize={() => 76}
            getScrollElement={() => viewportRef.current}
            overscan={8}
            measure
            renderItem={renderAnnotation}
          />
        ) : (
          <div>
            {annotations.map((annotation) => (
              <div key={annotation.id}>{renderAnnotation(annotation)}</div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
