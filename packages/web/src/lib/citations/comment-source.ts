import type { CitationCommentSource } from "./comment-request"

export const CITATION_COMMENT_HIGHLIGHT_NAME = "buddy-citation-comment"

/** A rect outside every clipping boundary, so a detached comment editor hides itself. */
export function detachedCitationCommentRect(): DOMRect {
  return new DOMRect(-10_000, -10_000, 0, 0)
}

/** The last painted line of a range, where a pointer selection usually ends. */
export function lastRangeLineRect(range: Range): DOMRect | undefined {
  const rects = range.getClientRects()
  for (let index = rects.length - 1; index >= 0; index -= 1) {
    const rect = rects.item(index)
    if (rect && rect.width > 0 && rect.height > 0) return rect
  }
  return undefined
}

/** Keep a DOM range marked with the CSS Highlight API while its comment editor is open. */
export function rangeCitationCommentSource(input: {
  range: Range
  /** Subtree whose re-renders may replace the cited text nodes. */
  observe: Node
  /** Find the cited text again after a re-render replaced its nodes. */
  resolve: () => Range | undefined
  /** Main-document clipping context; defaults to the range's own element. */
  contextElement?: Element
  /** Map a rect from the range's document into top-level viewport coordinates. */
  toViewportRect?: (rect: DOMRect) => DOMRect
}): CitationCommentSource {
  const range = input.range.cloneRange()
  const intact = () =>
    !range.collapsed &&
    range.startContainer.isConnected &&
    range.endContainer.isConnected &&
    input.observe.contains(range.startContainer) &&
    input.observe.contains(range.endContainer)

  return {
    getBoundingClientRect() {
      const rect = lastRangeLineRect(range)
      if (!rect) return detachedCitationCommentRect()
      return input.toViewportRect ? input.toViewportRect(rect) : rect
    },
    get contextElement() {
      return (
        input.contextElement ??
        range.endContainer.parentElement ??
        range.endContainer.ownerDocument?.documentElement ??
        document.documentElement
      )
    },
    mark(onUnavailable) {
      const view = range.startContainer.ownerDocument?.defaultView
      const registry = view && "highlights" in view.CSS ? view.CSS.highlights : undefined
      let highlight: Highlight | undefined
      if (view && registry && "Highlight" in view) {
        highlight = registry.get(CITATION_COMMENT_HIGHLIGHT_NAME) ?? new view.Highlight()
        highlight.add(range)
        registry.set(CITATION_COMMENT_HIGHLIGHT_NAME, highlight)
      }
      let disposed = false
      const dispose = () => {
        if (disposed) return
        disposed = true
        observer.disconnect()
        if (!highlight) return
        highlight.delete(range)
        if (highlight.size === 0 && registry?.get(CITATION_COMMENT_HIGHLIGHT_NAME) === highlight) {
          registry.delete(CITATION_COMMENT_HIGHLIGHT_NAME)
        }
      }
      const observer = new MutationObserver(() => {
        if (intact()) return
        const repaired = input.resolve()
        if (!repaired) {
          dispose()
          onUnavailable()
          return
        }
        range.setStart(repaired.startContainer, repaired.startOffset)
        range.setEnd(repaired.endContainer, repaired.endOffset)
      })
      observer.observe(input.observe, { childList: true, subtree: true, characterData: true })
      return dispose
    },
  }
}
