import { useRef } from "react"
import { PencilLineIcon } from "@/icons/app-icons"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@buddy/ui"
import type { ReaderAnnotationViewModel } from "../reader-types"
import { ReaderAnnotationsPanel } from "./reader-annotations-panel"

type ReaderAnnotationsPopoverProps = {
  annotations: ReaderAnnotationViewModel[]
  onShowAnnotation: (annotation: ReaderAnnotationViewModel) => void
  onEditAnnotation: (annotation: ReaderAnnotationViewModel) => void
  onDeleteAnnotation: (annotationId: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ReaderAnnotationsPopover({
  annotations,
  onShowAnnotation,
  onEditAnnotation,
  onDeleteAnnotation,
  open,
  onOpenChange,
}: ReaderAnnotationsPopoverProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Annotations">
          <PencilLineIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="h-[min(28rem,70vh)] w-80 p-0"
      >
        <ReaderAnnotationsPanel
          annotations={annotations}
          onShowAnnotation={onShowAnnotation}
          onEditAnnotation={onEditAnnotation}
          onDeleteAnnotation={onDeleteAnnotation}
          viewportRef={viewportRef}
        />
      </PopoverContent>
    </Popover>
  )
}
