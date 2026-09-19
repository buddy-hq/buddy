/** CSS Custom Highlight name used for a short-lived citation reveal. */
export const CITATION_HIGHLIGHT_NAME = "buddy-citation-target"
const CITATION_HIGHLIGHT_DURATION_MS = 2_400

/** Scroll to and temporarily mark a resolved citation range. */
export function revealCitationRange(range: Range, scrollTarget?: Element): void {
  const target = scrollTarget ?? range.startContainer.parentElement
  target?.scrollIntoView({ block: "center", behavior: "smooth" })
  const document = range.startContainer.ownerDocument
  const view = document?.defaultView
  const registry = view && "highlights" in view.CSS ? view.CSS.highlights : undefined
  if (view && registry && "Highlight" in view) {
    const highlight = new view.Highlight(range)
    registry.set(CITATION_HIGHLIGHT_NAME, highlight)
    view.setTimeout(() => {
      if (registry.get(CITATION_HIGHLIGHT_NAME) === highlight) {
        registry.delete(CITATION_HIGHLIGHT_NAME)
      }
    }, CITATION_HIGHLIGHT_DURATION_MS)
    return
  }
  const selection = document?.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  view?.setTimeout(() => {
    if (selection?.rangeCount === 1 && selection.getRangeAt(0) === range)
      selection.removeAllRanges()
  }, CITATION_HIGHLIGHT_DURATION_MS)
}
