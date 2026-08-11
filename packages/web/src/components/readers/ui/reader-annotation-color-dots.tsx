import { cn } from "@buddy/ui"
import type { ReaderAnnotationColorId } from "../reader-types"
import { READER_ANNOTATION_COLOR_OPTIONS } from "./reader-ui-constants"

type ReaderAnnotationColorDotsProps = {
  selected?: ReaderAnnotationColorId
  size?: "default" | "large"
  onSelect: (color: ReaderAnnotationColorId) => void
}

export function ReaderAnnotationColorDots({
  selected,
  size = "default",
  onSelect,
}: ReaderAnnotationColorDotsProps) {
  const large = size === "large"
  return (
    <span className={cn("flex items-center", large ? "gap-2.5" : "gap-2")}>
      {READER_ANNOTATION_COLOR_OPTIONS.map((color) => (
        <button
          key={color.id}
          type="button"
          aria-label={color.label}
          title={color.label}
          aria-pressed={selected === color.id}
          onClick={() => onSelect(color.id)}
          className={cn(
            "shrink-0 rounded-full transition-transform hover:scale-110",
            large ? "size-6" : "size-5",
            color.previewClassName,
            selected === color.id &&
              "ring-2 ring-border-interactive-base ring-offset-2 ring-offset-surface-raised-stronger-non-alpha",
          )}
        />
      ))}
    </span>
  )
}
