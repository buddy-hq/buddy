import { useState, useRef } from "react"
import type {
  ReaderAnnotation,
  ReaderAnnotationDialogState,
  ReaderAnnotationPopoverState,
  ReaderSelectionAction,
  ReaderSelectionToolbarState,
  ReaderBookmark,
} from "../foliate-reader-types"
import { ANNOTATION_STYLE_HIGHLIGHT } from "../foliate-reader-constants"
import {
  getAnnotationAtValue,
  getAnnotationColorValue,
  getBookmarkAtLocation,
} from "../utils/foliate-helpers"

export interface UseFoliateAnnotationsReturn {
  annotations: ReaderAnnotation[]
  setAnnotations: React.Dispatch<React.SetStateAction<ReaderAnnotation[]>>
  bookmarks: ReaderBookmark[]
  setBookmarks: React.Dispatch<React.SetStateAction<ReaderBookmark[]>>
  selectionActionRef: React.MutableRefObject<ReaderSelectionAction | null>
  selectionToolbar: ReaderSelectionToolbarState | null
  setSelectionToolbar: React.Dispatch<React.SetStateAction<ReaderSelectionToolbarState | null>>
  annotationPopover: ReaderAnnotationPopoverState | null
  setAnnotationPopover: React.Dispatch<React.SetStateAction<ReaderAnnotationPopoverState | null>>
  annotationDialog: ReaderAnnotationDialogState | null
  setAnnotationDialog: React.Dispatch<React.SetStateAction<ReaderAnnotationDialogState | null>>
  openSelectionToolbar: (action: ReaderSelectionAction) => void
  openAnnotationPopover: (value: string, range: Range) => void
  openAnnotationDialog: (annotation?: ReaderAnnotation) => void
  createOrUpdateAnnotation: (nextDialog: any) => Promise<void>
  deleteAnnotationValue: (value: string) => Promise<void>
  toggleBookmark: () => Promise<void>
  resetTransientUi: () => void
}

export function useFoliateAnnotations(
  viewRef: React.MutableRefObject<any>,
  locationRef: React.MutableRefObject<any>,
  bookmarksRef: React.MutableRefObject<ReaderBookmark[]>,
  toAnnotationDialogState: (annotation?: ReaderAnnotation) => any,
  getOverlayPosition: (range: Range, container: HTMLElement) => { x: number; y: number },
  rootRef: React.MutableRefObject<HTMLElement | null>,
): UseFoliateAnnotationsReturn {
  const selectionActionRef = useRef<ReaderSelectionAction | null>(null)
  const [selectionToolbar, setSelectionToolbar] = useState<ReaderSelectionToolbarState | null>(null)
  const [annotationPopover, setAnnotationPopover] = useState<ReaderAnnotationPopoverState | null>(
    null,
  )
  const [annotationDialog, setAnnotationDialog] = useState<ReaderAnnotationDialogState | null>(null)
  const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([])
  const [bookmarks, setBookmarks] = useState<ReaderBookmark[]>([])

  const resetTransientUi = () => {
    selectionActionRef.current = null
    setSelectionToolbar(null)
    setAnnotationPopover(null)
    setAnnotationDialog(null)
  }

  const openSelectionToolbar = (action: ReaderSelectionAction) => {
    selectionActionRef.current = action
    setAnnotationPopover(null)
    setSelectionToolbar({
      text: action.text,
      cfi: action.cfi,
      x: action.x,
      y: action.y,
    })
  }

  const openAnnotationPopover = (value: string, range: Range) => {
    const container = rootRef.current
    if (!container) return
    const position = getOverlayPosition(range, container)
    selectionActionRef.current = null
    setSelectionToolbar(null)
    setAnnotationPopover({
      value,
      x: position.x,
      y: position.y,
    })
  }

  const openAnnotationDialog = (annotation?: ReaderAnnotation) => {
    if (annotation) {
      setAnnotationDialog(toAnnotationDialogState(annotation))
    } else {
      const selectionAction = selectionActionRef.current
      setAnnotationDialog({
        mode: "create",
        value: selectionAction?.cfi ?? "",
        text: selectionAction?.text ?? "",
        note: "",
        style: ANNOTATION_STYLE_HIGHLIGHT,
        color: "amber",
      })
    }
    setSelectionToolbar(null)
    setAnnotationPopover(null)
  }

  const createOrUpdateAnnotation = async (nextDialog: any) => {
    const view = viewRef.current
    if (!view) return

    if (nextDialog.mode === "create") {
      const selectionAction = selectionActionRef.current
      if (!selectionAction) return
      const now = new Date().toISOString()
      const annotation: ReaderAnnotation = {
        value: selectionAction.cfi,
        text: selectionAction.text,
        note: nextDialog.note.trim(),
        style: nextDialog.style,
        color: getAnnotationColorValue(nextDialog.color),
        created: now,
        modified: now,
      }
      const info = await view.addAnnotation(annotation)
      if (info) {
        annotation.index = info.index
        annotation.label = info.label
      }
      setAnnotations((current) =>
        [...current, annotation].sort((a, b) => a.value.localeCompare(b.value)),
      )
      setAnnotationDialog(null)
      setSelectionToolbar(null)
      return
    }

    const existing = getAnnotationAtValue(annotations, nextDialog.value)
    if (!existing) return
    const updated: ReaderAnnotation = {
      ...existing,
      note: nextDialog.note.trim(),
      style: nextDialog.style,
      color: getAnnotationColorValue(nextDialog.color),
      modified: new Date().toISOString(),
    }
    await view.deleteAnnotation(existing)
    const info = await view.addAnnotation(updated)
    if (info) {
      updated.index = info.index
      updated.label = info.label
    }
    setAnnotations((current) =>
      current.map((annotation) => (annotation.value === updated.value ? updated : annotation)),
    )
    setAnnotationDialog(null)
    setAnnotationPopover(null)
  }

  const deleteAnnotationValue = async (value: string) => {
    const view = viewRef.current
    const annotation = getAnnotationAtValue(annotations, value)
    if (!view || !annotation) return
    await view.deleteAnnotation(annotation)
    setAnnotations((current) => current.filter((entry) => entry.value !== value))
    setAnnotationDialog(null)
    setAnnotationPopover(null)
  }

  const toggleBookmark = async () => {
    const cfi = locationRef.current.cfi
    if (!cfi) return
    const existing = getBookmarkAtLocation(bookmarksRef.current, cfi)
    if (existing) {
      setBookmarks((current) => current.filter((bookmark) => bookmark.value !== cfi))
      return
    }
    const bookmark: ReaderBookmark = {
      value: cfi,
      label: locationRef.current.tocLabel ?? locationRef.current.pageLabel ?? cfi,
      created: new Date().toISOString(),
    }
    setBookmarks((current) => [...current, bookmark].sort((a, b) => a.value.localeCompare(b.value)))
  }

  return {
    annotations,
    setAnnotations,
    bookmarks,
    setBookmarks,
    selectionActionRef,
    selectionToolbar,
    setSelectionToolbar,
    annotationPopover,
    setAnnotationPopover,
    annotationDialog,
    setAnnotationDialog,
    openSelectionToolbar,
    openAnnotationPopover,
    openAnnotationDialog,
    createOrUpdateAnnotation,
    deleteAnnotationValue,
    toggleBookmark,
    resetTransientUi,
  }
}
