import type { ReactNode } from "react"
import { CopyIcon, PencilLineIcon, SearchIcon } from "@/icons/app-icons"
import { Button } from "@buddy/ui"
import { DEFAULT_ANNOTATION_COLOR_ID } from "../foliate-reader-constants"
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
      className="-translate-x-1/2 -translate-y-full pb-2"
      x={x}
      y={y}
    >
      <div className="relative flex flex-col items-center">
        <ReaderFloatingSurface
          role="toolbar"
          className="flex-row items-center rounded-full px-3.5 py-2.5"
        >
          <ReaderAnnotationColorDots
            selected={DEFAULT_ANNOTATION_COLOR_ID}
            size="large"
            onSelect={onHighlight}
          />
          <span aria-hidden className="mx-3 h-7 w-px shrink-0 bg-border-weak-base" />

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
          className="absolute top-full h-0 w-0 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-border-base/60"
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
      className="size-9 rounded-full [&_svg]:size-[18px]"
    >
      {children}
    </Button>
  )
}
