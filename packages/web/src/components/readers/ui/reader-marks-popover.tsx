import { useMemo } from "react"
import { BookmarkIcon, PencilLineIcon, Trash2Icon } from "@/icons/app-icons"
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  cn,
} from "@buddy/ui"
import { formatReaderPositionAnchor } from "@buddy/reader-contract"
import type {
  ReaderAnnotationViewModel,
  ReaderBookmark,
  ReaderPositionAnchor,
} from "../reader-types"
import {
  READER_ANNOTATION_COLOR_OPTIONS,
  READER_ANNOTATION_STYLE_LABELS,
} from "./reader-ui-constants"
import { ReaderPanelHeader } from "./reader-panel"
import { ReaderToolbarButton } from "./reader-toolbar-button"

type ReaderMark =
  | { kind: "bookmark"; bookmark: ReaderBookmark; order: string }
  | { kind: "annotation"; annotation: ReaderAnnotationViewModel; order: string }

type ReaderMarksPopoverProps = {
  bookmarks: ReaderBookmark[]
  annotations: ReaderAnnotationViewModel[]
  bookmarkOrder: (bookmark: ReaderBookmark) => string
  annotationOrder: (annotation: ReaderAnnotationViewModel) => string
  onGoToBookmark: (target: ReaderPositionAnchor) => void
  onShowAnnotation: (annotation: ReaderAnnotationViewModel) => void
  onEditAnnotation: (annotation: ReaderAnnotationViewModel) => void
  onDeleteBookmark: (bookmarkId: string) => void
  onDeleteAnnotation: (annotationId: string) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function createdLabel(created: string): string {
  const createdDate = new Date(created)
  const today = new Date()
  return createdDate.toDateString() === today.toDateString()
    ? "Today"
    : createdDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function ReaderMarksPopover({
  bookmarks,
  annotations,
  bookmarkOrder,
  annotationOrder,
  onGoToBookmark,
  onShowAnnotation,
  onEditAnnotation,
  onDeleteBookmark,
  onDeleteAnnotation,
  open,
  onOpenChange,
}: ReaderMarksPopoverProps) {
  const marks = useMemo<ReaderMark[]>(
    () =>
      [
        ...bookmarks.map((bookmark) => ({
          kind: "bookmark" as const,
          bookmark,
          order: bookmarkOrder(bookmark),
        })),
        ...annotations.map((annotation) => ({
          kind: "annotation" as const,
          annotation,
          order: annotationOrder(annotation),
        })),
      ].toSorted((left, right) => left.order.localeCompare(right.order)),
    [annotationOrder, annotations, bookmarkOrder, bookmarks],
  )

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <ReaderToolbarButton
          icon={PencilLineIcon}
          label="Highlights & notes"
          active={Boolean(open)}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="flex h-[min(32rem,70vh)] w-80 flex-col overflow-hidden rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha p-0 shadow-xl"
      >
        <ReaderPanelHeader title="Highlights & notes" onClose={() => onOpenChange?.(false)} />
        <ScrollArea className="min-h-0 flex-1 p-2">
          {marks.length === 0 ? (
            <p className="px-2 py-4 text-sm text-text-weaker">
              Highlights, notes, and bookmarks appear here.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {marks.map((mark) =>
                mark.kind === "bookmark" ? (
                  <BookmarkRow
                    key={`bookmark:${mark.bookmark.id}`}
                    bookmark={mark.bookmark}
                    onGoTo={onGoToBookmark}
                    onDelete={onDeleteBookmark}
                  />
                ) : (
                  <AnnotationRow
                    key={`annotation:${mark.annotation.id}`}
                    annotation={mark.annotation}
                    onShow={onShowAnnotation}
                    onEdit={onEditAnnotation}
                    onDelete={onDeleteAnnotation}
                  />
                ),
              )}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function BookmarkRow(props: {
  bookmark: ReaderBookmark
  onGoTo: (target: ReaderPositionAnchor) => void
  onDelete: (bookmarkId: string) => void
}) {
  return (
    <div className="group flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 hover:bg-surface-base-hover">
      <BookmarkIcon className="mt-0.5 size-3.5 shrink-0 text-icon-weak-base" />
      <button
        type="button"
        onClick={() => props.onGoTo(props.bookmark.anchor)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-xs leading-snug text-text-weak">
          {props.bookmark.label}
        </span>
        <span className="mt-1 block text-[10px] text-text-weaker">
          {createdLabel(props.bookmark.created)}
        </span>
      </button>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-[10px] text-text-weaker">
          {formatReaderPositionAnchor(props.bookmark.anchor)}
        </span>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Delete bookmark"
          onClick={() => props.onDelete(props.bookmark.id)}
          className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <Trash2Icon />
        </Button>
      </span>
    </div>
  )
}

function AnnotationRow(props: {
  annotation: ReaderAnnotationViewModel
  onShow: (annotation: ReaderAnnotationViewModel) => void
  onEdit: (annotation: ReaderAnnotationViewModel) => void
  onDelete: (annotationId: string) => void
}) {
  const color = READER_ANNOTATION_COLOR_OPTIONS.find(
    (option) => option.id === props.annotation.color,
  )
  return (
    <div className="group flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 hover:bg-surface-base-hover">
      <span
        aria-hidden="true"
        className={cn("mt-1 size-2.5 shrink-0 rounded-full", color?.previewClassName)}
      />
      <button
        type="button"
        onClick={() => props.onShow(props.annotation)}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block text-[10px] uppercase tracking-wide text-text-weaker">
          {READER_ANNOTATION_STYLE_LABELS[props.annotation.style]}
        </span>
        <span
          className={cn(
            "mt-0.5 line-clamp-2 block rounded-sm text-xs leading-snug text-text-base",
            color?.washClassName,
          )}
        >
          {props.annotation.text}
        </span>
        {props.annotation.note ? (
          <span className="mt-1 block text-[11px] leading-snug text-text-weak">
            {props.annotation.note}
          </span>
        ) : null}
        <span className="mt-1 block text-[10px] text-text-weaker">
          {createdLabel(props.annotation.created)}
        </span>
      </button>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-[10px] text-text-weaker">
          {props.annotation.locationLabel ?? "—"}
        </span>
        <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Edit note"
            onClick={() => props.onEdit(props.annotation)}
          >
            <PencilLineIcon />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Delete annotation"
            onClick={() => props.onDelete(props.annotation.id)}
          >
            <Trash2Icon />
          </Button>
        </span>
      </span>
    </div>
  )
}
