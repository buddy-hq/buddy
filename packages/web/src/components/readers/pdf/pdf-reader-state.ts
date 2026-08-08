import { readerPositionAnchorEquals, type ReaderRelocation } from "@buddy/reader-contract"

export function shouldDismissPdfSelectionForRelocation(
  previous: ReaderRelocation | null,
  next: ReaderRelocation,
): boolean {
  return previous !== null && !readerPositionAnchorEquals(previous.anchor, next.anchor)
}
