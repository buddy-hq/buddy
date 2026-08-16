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
  return Object.assign(
    { kind: "url" as const, url: source.url },
    source.name ? { name: source.name } : undefined,
  )
}

export function foliateLocationToReaderRelocation(
  location: FoliateReaderLocation,
): ReaderRelocation | undefined {
  if (!location.cfi) return undefined
  return Object.assign(
    Object.assign(
      { anchor: legacyCfiPositionAnchor(location.cfi, location.index) },
      location.fraction !== undefined ? { fraction: location.fraction } : undefined,
      location.tocLabel ? { tocLabel: location.tocLabel } : undefined,
      location.pageLabel ? { pageLabel: location.pageLabel } : undefined,
    ),
    location.locationLabel ? { locationLabel: location.locationLabel } : undefined,
    location.currentPassageText ? { currentPassageText: location.currentPassageText } : undefined,
  )
}

export function foliateSelectionToReaderSelection(
  selection: FoliateReaderSelection,
): ReaderSelection {
  return Object.assign(
    {
      text: selection.text,
      anchor: legacyCfiTextAnchor(selection.cfi, selection.index),
      selectionKey: selection.selectionKey ?? createReaderRecordId("selection"),
    },
    selection.tocLabel ? { tocLabel: selection.tocLabel } : undefined,
    selection.pageLabel ? { pageLabel: selection.pageLabel } : undefined,
    selection.locationLabel ? { locationLabel: selection.locationLabel } : undefined,
  )
}
