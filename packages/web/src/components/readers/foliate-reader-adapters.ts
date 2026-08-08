import {
  legacyCfiPositionAnchor,
  legacyCfiTextAnchor,
  type ReaderPositionAnchor,
  type ReaderTextAnchor,
} from "@buddy/reader-contract"
import type { FoliateNavigationTarget, FoliateTocItem } from "foliate-js/view.js"
import {
  SEARCH_SCOPE_BOOK,
  SEARCH_SCOPE_SECTION,
  type FoliateReaderLandmark,
  type FoliateReaderPreferences,
  type FoliateReaderSearchScope,
  type FoliateReaderSnapshot,
  type ReaderAnnotation as FoliateAnnotation,
  type ReaderAnnotationDialogState as FoliateAnnotationDialogState,
  type ReaderBookmark as FoliateBookmark,
  type ReaderSearchState as FoliateSearchState,
} from "./foliate-reader-types"
import {
  READER_ENGINE_FOLIATE,
  READER_SEARCH_SCOPE_DOCUMENT,
  READER_SEARCH_SCOPE_SECTION,
  type ReaderAnnotationEditorViewModel,
  type ReaderAnnotationViewModel,
  type ReaderBookmark,
  type ReaderCommonPreferences,
  type ReaderNavigationItem,
  type ReaderSearchScope,
  type ReaderSearchViewModel,
  type ReaderSnapshot,
  type ReaderThemeOption,
} from "./reader-types"
import { READER_THEMES } from "./foliate-reader-constants"
import {
  buildMetadataRows,
  getAnnotationColorId,
  getAnnotationStyle,
} from "./utils/foliate-helpers"

export function foliateTocItemsToReaderItems(items: FoliateTocItem[]): ReaderNavigationItem[] {
  return items.map((item) => ({
    id: item.href,
    label: item.label,
    subitems: foliateTocItemsToReaderItems(item.subitems ?? []),
  }))
}

function foliateLandmarksToReaderItems(
  landmarks: FoliateReaderLandmark[],
): ReaderNavigationItem[] {
  return landmarks.map((landmark) => ({
    id: landmark.href,
    label: landmark.label,
    ...(landmark.typeLabel ? { description: landmark.typeLabel } : {}),
    subitems: [],
  }))
}

export function foliateSnapshotToReaderSnapshot(
  snapshot: FoliateReaderSnapshot | null,
): ReaderSnapshot | null {
  if (!snapshot) return null
  return {
    engine: READER_ENGINE_FOLIATE,
    capabilities: {
      textFlow: !snapshot.isFixedLayout,
      pageLayouts: snapshot.isFixedLayout,
      search: true,
      outline: snapshot.toc.length > 0,
      pageLabels: snapshot.pageList.length > 0,
      textSelection: true,
      annotations: true,
    },
    title: snapshot.title,
    author: snapshot.author,
    formatLabel: snapshot.formatLabel,
    isFixedLayout: snapshot.isFixedLayout,
    toc: foliateTocItemsToReaderItems(snapshot.toc),
    pageList: foliateTocItemsToReaderItems(snapshot.pageList),
    landmarks: foliateLandmarksToReaderItems(snapshot.landmarks),
    metadata: buildMetadataRows(snapshot.metadata),
    ...(snapshot.coverUrl ? { coverUrl: snapshot.coverUrl } : {}),
    ...(snapshot.fileName ? { fileName: snapshot.fileName } : {}),
  }
}

export function foliateBookmarksToReaderBookmarks(
  bookmarks: FoliateBookmark[],
): ReaderBookmark[] {
  return bookmarks.map((bookmark) => ({
    id: bookmark.value,
    anchor: legacyCfiPositionAnchor(bookmark.value),
    label: bookmark.label,
    created: bookmark.created,
  }))
}

export function foliateAnnotationsToReaderAnnotations(
  annotations: FoliateAnnotation[],
): ReaderAnnotationViewModel[] {
  return annotations.map((annotation) => ({
    id: annotation.value,
    anchor: legacyCfiTextAnchor(annotation.value, annotation.index),
    text: annotation.text ?? "",
    note: annotation.note ?? "",
    style: getAnnotationStyle(annotation),
    color: getAnnotationColorId(annotation.color),
    created: annotation.created ?? "",
    modified: annotation.modified ?? annotation.created ?? "",
    ...(annotation.label ? { locationLabel: annotation.label } : {}),
  }))
}

export function foliateSearchToReaderSearch(search: FoliateSearchState): ReaderSearchViewModel {
  const activeResultId = search.rows.find(
    (row) => row.kind === "result" && row.cfi === search.activeResultCfi,
  )?.key
  return {
    query: search.query,
    scope:
      search.scope === SEARCH_SCOPE_BOOK
        ? READER_SEARCH_SCOPE_DOCUMENT
        : READER_SEARCH_SCOPE_SECTION,
    matchCase: search.matchCase,
    matchWholeWords: search.matchWholeWords,
    matchDiacritics: search.matchDiacritics,
    running: search.running,
    progress: search.progress,
    rows: search.rows.map((row) =>
      row.kind === "section"
        ? { id: row.key, kind: "section", label: row.label }
        : {
            id: row.key,
            kind: "result",
            result: {
              id: row.key,
              ...(row.label ? { label: row.label } : {}),
              anchor: legacyCfiTextAnchor(row.cfi),
              excerpt: row.excerpt,
            },
          },
    ),
    ...(activeResultId ? { activeResultId } : {}),
  }
}

export function readerSearchScopeToFoliateScope(
  scope: ReaderSearchScope,
): FoliateReaderSearchScope {
  return scope === READER_SEARCH_SCOPE_DOCUMENT ? SEARCH_SCOPE_BOOK : SEARCH_SCOPE_SECTION
}

export function foliateAnnotationDialogToReaderEditor(
  dialog: FoliateAnnotationDialogState | null,
): ReaderAnnotationEditorViewModel | null {
  if (!dialog) return null
  return {
    mode: dialog.mode,
    text: dialog.text,
    note: dialog.note,
    style: dialog.style,
    color: dialog.color,
  }
}

export function foliatePreferencesToReaderPreferences(
  preferences: FoliateReaderPreferences,
): ReaderCommonPreferences {
  return {
    themeId: preferences.themeId,
    reduceMotion: preferences.reduceMotion,
    autohideCursor: preferences.autohideCursor,
  }
}

export function foliateThemesToReaderThemes(): ReaderThemeOption[] {
  return READER_THEMES.map((theme) => ({
    id: theme.id,
    label: theme.label,
    contentBackground: theme.contentBackground,
    contentForeground: theme.contentForeground,
  }))
}

export function readerPositionAnchorToFoliateTarget(
  anchor: ReaderPositionAnchor,
): FoliateNavigationTarget {
  return anchor.kind === "cfi-position" ? anchor.cfi : anchor.pageIndex
}

export function readerTextAnchorToFoliateCfi(anchor: ReaderTextAnchor): string | undefined {
  return anchor.kind === "cfi-text" ? anchor.cfi : undefined
}
