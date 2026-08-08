import {
  legacyCfiPositionAnchor,
  legacyCfiTextAnchor,
  type ReaderRelocation,
} from "@buddy/reader-contract"
import type {
  FoliateReaderLocation,
  FoliateReaderSelection,
  FoliateReaderSource,
} from "./foliate-reader-types"
import { createReaderRecordId } from "./reader-storage"
import {
  READER_ENGINE_FOLIATE,
  READER_ENGINE_PDF,
  isPdfReaderSource,
  type ReaderEngineKind,
  type ReaderSelection,
  type ReaderSource,
} from "./reader-types"

export function documentReaderEngine(source: ReaderSource | null): ReaderEngineKind {
  return isPdfReaderSource(source) ? READER_ENGINE_PDF : READER_ENGINE_FOLIATE
}

export function readerSourceToFoliateSource(
  source: ReaderSource | null,
): FoliateReaderSource | null {
  if (!source) return null
  if (source.kind === "file") return { kind: "file", file: source.file }
  if (source.kind === "blob") {
    return { kind: "blob", blob: source.blob, name: source.name }
  }
  return {
    kind: "url",
    url: source.url,
    ...(source.name ? { name: source.name } : {}),
  }
}

export function foliateLocationToReaderRelocation(
  location: FoliateReaderLocation,
): ReaderRelocation | undefined {
  if (!location.cfi) return undefined
  return {
    anchor: legacyCfiPositionAnchor(location.cfi, location.index),
    ...(location.fraction !== undefined ? { fraction: location.fraction } : {}),
    ...(location.tocLabel ? { tocLabel: location.tocLabel } : {}),
    ...(location.pageLabel ? { pageLabel: location.pageLabel } : {}),
    ...(location.locationLabel ? { locationLabel: location.locationLabel } : {}),
    ...(location.currentPassageText ? { currentPassageText: location.currentPassageText } : {}),
  }
}

export function foliateSelectionToReaderSelection(
  selection: FoliateReaderSelection,
): ReaderSelection {
  return {
    text: selection.text,
    anchor: legacyCfiTextAnchor(selection.cfi, selection.index),
    selectionKey: selection.selectionKey ?? createReaderRecordId("selection"),
    ...(selection.tocLabel ? { tocLabel: selection.tocLabel } : {}),
    ...(selection.pageLabel ? { pageLabel: selection.pageLabel } : {}),
    ...(selection.locationLabel ? { locationLabel: selection.locationLabel } : {}),
  }
}
