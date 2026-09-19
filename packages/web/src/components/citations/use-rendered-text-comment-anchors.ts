import { useLayoutEffect, useState, type RefObject } from "react"
import type { Citation, CitationTextSelector } from "@buddy/citation-contract"
import type { StagedQuote } from "@/lib/citations/staged-quotes"
import { resolveRenderedTextRange } from "@/lib/citations/rendered-text"
import type { QuoteCommentAnchor } from "./quote-comment-markers"

const EMPTY_ANCHORS: readonly QuoteCommentAnchor[] = []
const MARKER_LAYER_SELECTOR = "[data-quote-comment-markers]"

function citationTextSelector(citation: Citation): CitationTextSelector | undefined {
  return citation.source.kind === "reading" ? undefined : citation.source.selector
}

function firstLineRect(range: Range): DOMRect | undefined {
  return Array.from(range.getClientRects()).find((rect) => rect.width > 0 && rect.height > 0)
}

function sameAnchors(
  current: readonly QuoteCommentAnchor[],
  next: readonly QuoteCommentAnchor[],
): boolean {
  return (
    current.length === next.length &&
    current.every((anchor, index) => {
      const other = next[index]
      return (
        other !== undefined &&
        other.quote === anchor.quote &&
        Math.round(other.top) === Math.round(anchor.top) &&
        Math.round(other.left) === Math.round(anchor.left)
      )
    })
  )
}

function isMarkerNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement
  return element?.closest(MARKER_LAYER_SELECTOR) != null
}

function isMarkerMutation(record: MutationRecord): boolean {
  if (isMarkerNode(record.target)) return true
  const changed = [...record.addedNodes, ...record.removedNodes]
  return changed.length > 0 && changed.every(isMarkerNode)
}

export function useRenderedTextCommentAnchors(input: {
  quotes: readonly StagedQuote[]
  overlayRef: RefObject<HTMLElement | null>
  textRootSelector: string
  markerOffset: number
}): readonly QuoteCommentAnchor[] {
  const { quotes, overlayRef, textRootSelector, markerOffset } = input
  const [anchors, setAnchors] = useState<readonly QuoteCommentAnchor[]>(EMPTY_ANCHORS)

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!overlay || quotes.length === 0) {
      setAnchors(EMPTY_ANCHORS)
      return
    }
    let frame: number | undefined
    const measure = () => {
      frame = undefined
      const root = overlay.querySelector<HTMLElement>(textRootSelector) ?? overlay
      const bounds = overlay.getBoundingClientRect()
      const left = bounds.width + markerOffset
      const next = quotes.flatMap((quote) => {
        const selector = citationTextSelector(quote.citation)
        const range = selector
          ? resolveRenderedTextRange(root, quote.citation.excerpt, selector)
          : undefined
        const rect = range ? firstLineRect(range) : undefined
        return rect ? [{ quote, top: rect.top - bounds.top + rect.height / 2, left }] : []
      })
      setAnchors((current) => (sameAnchors(current, next) ? current : next))
    }
    const schedule = () => {
      frame ??= requestAnimationFrame(measure)
    }
    measure()
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(overlay)
    const mutationObserver = new MutationObserver((records) => {
      if (records.some((record) => !isMarkerMutation(record))) schedule()
    })
    mutationObserver.observe(overlay, { subtree: true, childList: true, characterData: true })
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [markerOffset, overlayRef, quotes, textRootSelector])

  return anchors
}
