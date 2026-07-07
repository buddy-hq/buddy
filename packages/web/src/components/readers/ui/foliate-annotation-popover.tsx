import { PencilLineIcon, XIcon } from "lucide-react"
import type { ReaderAnnotationPopoverState, ReaderAnnotation } from "../foliate-reader-types"
import { getAnnotationAtValue } from "../utils/foliate-helpers"
import { FoliateFloatingOverlay } from "./foliate-floating-overlay"

export type FoliateAnnotationPopoverProps = {
  popover: ReaderAnnotationPopoverState | null
  anchorRoot: HTMLElement | null
  annotations: ReaderAnnotation[]
  onOpenAnnotationDialog: (annotation?: ReaderAnnotation) => void
  onDeleteAnnotation: (value: string) => void
}

export function FoliateAnnotationPopover({
  popover,
  anchorRoot,
  annotations,
  onOpenAnnotationDialog,
  onDeleteAnnotation,
}: FoliateAnnotationPopoverProps) {
  if (!popover) return null

  const { value, x, y } = popover
  const annotation = getAnnotationAtValue(annotations, value)

  return (
    <FoliateFloatingOverlay
      anchorRoot={anchorRoot}
      dataComponent="foliate-annotation-popover"
      className="-translate-x-1/2 -translate-y-full pb-1.5"
      x={x}
      y={y}
    >
      <div className="flex items-center gap-0 overflow-hidden border border-border-base/60 bg-surface-raised-base/98 shadow-lg backdrop-blur-sm">
        <button
          type="button"
          onClick={() => onOpenAnnotationDialog(annotation)}
          className="flex items-center gap-1 px-2.5 py-2 text-[11px] text-text-weak transition-colors hover:bg-surface-weak/60 hover:text-text-base"
        >
          <PencilLineIcon className="size-3.5" />
          <span>Edit</span>
        </button>
        <div className="h-4 w-px bg-border-base/40" />
        <button
          type="button"
          onClick={() => onDeleteAnnotation(value)}
          className="flex items-center gap-1 px-2.5 py-2 text-[11px] text-text-weak transition-colors hover:bg-surface-critical-weak hover:text-text-base"
        >
          <XIcon className="size-3.5" />
          <span>Delete</span>
        </button>
      </div>
      <div className="flex justify-center">
        <div className="size-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border-base/60" />
      </div>
    </FoliateFloatingOverlay>
  )
}
