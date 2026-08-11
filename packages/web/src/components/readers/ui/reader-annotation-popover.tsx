import { PencilLineIcon, Trash2Icon } from "@/icons/app-icons"
import { Button, cn } from "@buddy/ui"
import type {
  ReaderAnnotationColorId,
  ReaderAnnotationPopoverViewModel,
  ReaderAnnotationViewModel,
} from "../reader-types"
import { ReaderAnnotationColorDots } from "./reader-annotation-color-dots"
import { ReaderFloatingSurface } from "./reader-floating-surface"
import {
  ReaderFloatingOverlay,
  READER_FLOATING_OVERLAY_ANCHOR_OFFSET_PROPERTY,
} from "./reader-floating-overlay"
import { READER_ANNOTATION_COLOR_OPTIONS } from "./reader-ui-constants"

type ReaderAnnotationPopoverProps = {
  popover: ReaderAnnotationPopoverViewModel | null
  anchorRoot: HTMLElement | null
  annotations: ReaderAnnotationViewModel[]
  onChangeColor?: (annotation: ReaderAnnotationViewModel, color: ReaderAnnotationColorId) => void
  onEditAnnotation: (annotation: ReaderAnnotationViewModel) => void
  onDeleteAnnotation: (annotationId: string) => void
}

export function ReaderAnnotationPopover({
  popover,
  anchorRoot,
  annotations,
  onChangeColor,
  onEditAnnotation,
  onDeleteAnnotation,
}: ReaderAnnotationPopoverProps) {
  if (!popover) return null
  const annotation = annotations.find((entry) => entry.id === popover.annotationId)
  if (!annotation) return null
  const color = READER_ANNOTATION_COLOR_OPTIONS.find(
    (option) => option.id === annotation.color,
  )

  return (
    <ReaderFloatingOverlay
      anchorRoot={anchorRoot}
      dataComponent="reader-annotation-popover"
      className="-translate-x-1/2 -translate-y-full pb-1.5"
      x={popover.x}
      y={popover.y}
    >
      <ReaderFloatingSurface className="w-[300px] gap-3 p-4">
        <p
          className={cn(
            "line-clamp-3 rounded-sm text-xs leading-relaxed text-text-base",
            color?.washClassName,
          )}
        >
          {annotation.text}
        </p>
        {annotation.note ? (
          <p className="text-[11px] leading-relaxed text-text-weak">{annotation.note}</p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <ReaderAnnotationColorDots
            selected={annotation.color}
            size="large"
            onSelect={(nextColor) => onChangeColor?.(annotation, nextColor)}
          />
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Edit note"
              onClick={() => onEditAnnotation(annotation)}
              className="size-9 rounded-full"
            >
              <PencilLineIcon className="size-[18px]" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete"
              onClick={() => onDeleteAnnotation(annotation.id)}
              className="size-9 rounded-full"
            >
              <Trash2Icon className="size-[18px]" />
            </Button>
          </span>
        </div>
      </ReaderFloatingSurface>
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
