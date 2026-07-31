import { cn } from "@buddy/ui"
import type { MermaidViewportController } from "./use-mermaid-viewport"

type MermaidInlineViewProps = {
  ariaLabel: string
  viewport: MermaidViewportController
}

export function MermaidInlineView({ ariaLabel, viewport }: MermaidInlineViewProps) {
  return (
    <div
      ref={viewport.viewportRef}
      data-component="mermaid-diagram-inline-viewport"
      className={cn(
        "no-scrollbar h-full min-h-0 w-full overflow-auto",
        viewport.isDragging ? "cursor-grabbing select-none" : "cursor-grab",
      )}
      onPointerDown={viewport.handlePointerDown}
    >
      <div
        className="relative overflow-visible"
        style={{
          width: viewport.canvasWidth,
          height: viewport.canvasHeight,
        }}
      >
        <div
          ref={viewport.svgHostRef}
          data-component="mermaid-diagram"
          role="img"
          aria-label={ariaLabel}
          className={cn(
            "absolute flex shrink-0 items-start justify-start overflow-visible [&_svg]:!block [&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none",
            viewport.isInitialized ? "opacity-100" : "opacity-0",
          )}
          style={{
            left: viewport.contentOffsetX,
            top: viewport.contentOffsetY,
            // Tailwind's preflight makes this host border-box. Its dimensions must therefore
            // include the canvas padding, or a short diagram can lose its entire SVG content box
            // to the top and bottom padding in Bench mode.
            width: viewport.svgHostWidth,
            height: viewport.svgHostHeight,
            padding: viewport.canvasPadding,
          }}
        />
      </div>
    </div>
  )
}
