import { PencilLineIcon, XIcon } from "@/icons/app-icons"
import { Button, Separator } from "@buddy/ui"
import type {
  ReaderAnnotationPopoverViewModel,
  ReaderAnnotationViewModel,
} from "../reader-types"
import {
  ReaderFloatingOverlay,
  READER_FLOATING_OVERLAY_ANCHOR_OFFSET_PROPERTY,
} from "./reader-floating-overlay"

type ReaderAnnotationPopoverProps = {
  popover: ReaderAnnotationPopoverViewModel | null
  anchorRoot: HTMLElement | null
  annotations: ReaderAnnotationViewModel[]
  onEditAnnotation: (annotation: ReaderAnnotationViewModel) => void
  onDeleteAnnotation: (annotationId: string) => void
}

export function ReaderAnnotationPopover({
  popover,
  anchorRoot,
  annotations,
  onEditAnnotation,
  onDeleteAnnotation,
}: ReaderAnnotationPopoverProps) {
  if (!popover) return null
  const annotation = annotations.find((entry) => entry.id === popover.annotationId)
  if (!annotation) return null

  return (
    <ReaderFloatingOverlay
      anchorRoot={anchorRoot}
      dataComponent="reader-annotation-popover"
      className="-translate-x-1/2 -translate-y-full pb-1.5"
      x={popover.x}
      y={popover.y}
    >
      <div className="flex items-center overflow-hidden rounded-md border bg-surface-raised-base shadow-lg">
        <Button type="button" variant="ghost" size="sm" onClick={() => onEditAnnotation(annotation)}>
          <PencilLineIcon data-icon="inline-start" />
          Edit
        </Button>
        <Separator orientation="vertical" className="h-4 self-center" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDeleteAnnotation(annotation.id)}
        >
          <XIcon data-icon="inline-start" />
          Delete
        </Button>
      </div>
      <div
        aria-hidden="true"
        className="absolute top-full size-0 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-border-base"
        style={{
          left: `calc(50% + var(${READER_FLOATING_OVERLAY_ANCHOR_OFFSET_PROPERTY}, 0px))`,
        }}
      />
    </ReaderFloatingOverlay>
  )
}
