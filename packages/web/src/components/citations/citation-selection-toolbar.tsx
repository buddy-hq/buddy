import { createPortal } from "react-dom"
import type { RefObject } from "react"
import { Button } from "@buddy/ui"
import { QuoteIcon } from "@/icons/app-icons"

/** Small shared action shown beside a completed text selection. */
export function CitationSelectionToolbar(props: {
  actionRef: RefObject<HTMLDivElement>
  position: { x: number; y: number } | undefined
  onCite: () => void
}) {
  if (!props.position) return null
  return createPortal(
    <div
      ref={props.actionRef}
      data-component="citation-selection-toolbar"
      className="fixed z-[100] -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-full border border-border-base bg-surface-raised-base p-0.5 shadow-lg"
      style={{ left: props.position.x, top: props.position.y }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Cite selected text"
        title="Cite selected text"
        className="rounded-full"
        onPointerDown={(event) => event.preventDefault()}
        onClick={props.onCite}
      >
        <QuoteIcon className="size-3" />
      </Button>
    </div>,
    document.body,
  )
}
