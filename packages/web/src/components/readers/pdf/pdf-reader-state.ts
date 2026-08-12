import type { ReaderRelocation } from "@buddy/reader-contract"

/**
 * A staged selection belongs to the page it was taken from. Scrolling inside that
 * page moves the reader's position on every frame, and dropping the selection
 * there would wipe a passage the reader is still reading around — the overlay
 * follows the page instead. Leaving the page is what ends the selection.
 */
export function shouldDismissPdfSelectionForRelocation(
  previous: ReaderRelocation | null,
  next: ReaderRelocation,
): boolean {
  if (previous === null) return false
  if (previous.anchor.kind !== "pdf-position" || next.anchor.kind !== "pdf-position") {
    return previous.anchor.kind !== next.anchor.kind
  }
  return previous.anchor.pageIndex !== next.anchor.pageIndex
}
