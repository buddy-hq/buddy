import type { ReactNode } from "react"
import { CopyIcon, PencilLineIcon, SearchIcon } from "@/icons/app-icons"
import { Button } from "@buddy/ui"
import type { ReaderAnnotationColorId, ReaderSelectionToolbarViewModel } from "../reader-types"
import { ReaderAnnotationColorDots } from "./reader-annotation-color-dots"
import { ReaderFloatingSurface } from "./reader-floating-surface"
import {
  ReaderFloatingOverlay,
  READER_FLOATING_OVERLAY_ANCHOR_OFFSET_PROPERTY,
} from "./reader-floating-overlay"

export type ReaderSelectionToolbarState = ReaderSelectionToolbarViewModel

type ReaderSelectionToolbarProps = {
  selectionAction: ReaderSelectionToolbarState | null
  anchorRoot: HTMLElement | null
  onCopyText: (text: string) => void
  onHighlight: (color: ReaderAnnotationColorId) => void
  onOpenAnnotationDialog: () => void
  onSearch: (text: string) => void
  onClose?: () => void
}

export function ReaderSelectionToolbar({
  selectionAction,
  anchorRoot,
  onCopyText,
  onHighlight,
  onOpenAnnotationDialog,
  onSearch,
}: ReaderSelectionToolbarProps) {
  if (!selectionAction) return null

  const { text, x, y } = selectionAction

  return (
    <ReaderFloatingOverlay
      anchorRoot={anchorRoot}
      dataComponent="reader-selection-toolbar"
      className="-translate-x-1/2 -translate-y-full pb-4"
      x={x}
      y={y}
    >
      <div className="relative flex flex-col items-center">
        <ReaderFloatingSurface
          role="toolbar"
          aria-label="Selection actions"
          className="flex-row items-center rounded-full px-2.5 py-1.5"
        >
          <ReaderAnnotationColorDots onSelect={onHighlight} />
          <span aria-hidden className="mx-2.5 h-5 w-px shrink-0 bg-border-weak-base" />

          <span className="flex items-center gap-1">
            <ActionButton onClick={onOpenAnnotationDialog} label="Add note">
              <PencilLineIcon />
            </ActionButton>
            <ActionButton onClick={() => onCopyText(text)} label="Copy" title="Copy  ⌘C">
              <CopyIcon />
            </ActionButton>
            <ActionButton onClick={() => onSearch(text)} label="Search for this">
              <SearchIcon />
            </ActionButton>
          </span>
        </ReaderFloatingSurface>

        <div
          aria-hidden="true"
          className="absolute top-full h-0 w-0 -translate-x-1/2 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-border-base/60"
          style={{
            left: `calc(50% + var(${READER_FLOATING_OVERLAY_ANCHOR_OFFSET_PROPERTY}, 0px))`,
          }}
        />
      </div>
    </ReaderFloatingOverlay>
  )
}

function ActionButton({
  children,
  onClick,
  label,
  title,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  title?: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className="size-8 rounded-full [&_svg]:size-4"
    >
      {children}
    </Button>
  )
}
