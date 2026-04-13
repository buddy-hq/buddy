import * as React from "react"
import { PencilLineIcon } from "lucide-react"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@buddy/ui"
import { FoliateAnnotationsPanel } from "./foliate-annotations-panel"
import type { ReaderAnnotation } from "../foliate-reader-types"

export interface FoliateAnnotationsPopoverProps {
  annotations: ReaderAnnotation[]
  onShowAnnotation: (annotation: ReaderAnnotation) => void
  onOpenAnnotationDialog: (annotation: ReaderAnnotation) => void
  onDeleteAnnotation: (value: string) => void
}

export function FoliateAnnotationsPopover({
  annotations,
  onShowAnnotation,
  onOpenAnnotationDialog,
  onDeleteAnnotation,
}: FoliateAnnotationsPopoverProps) {
  const annotationViewportRef = React.useRef<HTMLDivElement>(null)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Annotations"
          className="shrink-0 text-text-weaker hover:text-text-base"
        >
          <PencilLineIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[320px] max-h-[70vh] overflow-hidden p-0"
      >
        <FoliateAnnotationsPanel
          annotations={annotations}
          onShowAnnotation={onShowAnnotation}
          onOpenAnnotationDialog={onOpenAnnotationDialog}
          onDeleteAnnotation={onDeleteAnnotation}
          annotationViewportRef={annotationViewportRef}
        />
      </PopoverContent>
    </Popover>
  )
}
