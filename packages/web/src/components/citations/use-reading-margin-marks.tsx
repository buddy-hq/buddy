import { useCallback, useMemo } from "react"
import type { Citation, ReadingCitationSource } from "@buddy/citation-contract"
import { filterStagedQuotes, useStagedQuotes } from "@/lib/citations/staged-quotes"
import type { ReaderMarginMark, ReaderMarginMarkPosition } from "@/components/readers/reader-types"
import { QUOTE_COMMENT_MARKER_SIZE_PX, QuoteCommentMarkers } from "./quote-comment-markers"

export function useReadingMarginMarks(ownsSource: (source: ReadingCitationSource) => boolean) {
  const stagedQuotes = useStagedQuotes()
  const quotes = useMemo(
    () =>
      filterStagedQuotes(
        stagedQuotes,
        (citation: Citation) => citation.source.kind === "reading" && ownsSource(citation.source),
      ),
    [stagedQuotes, ownsSource],
  )
  const quotesByID = useMemo(
    () => new Map(quotes.map((quote) => [quote.citation.id, quote])),
    [quotes],
  )
  const marginMarks = useMemo<readonly ReaderMarginMark[]>(
    () =>
      quotes.flatMap((quote) =>
        quote.citation.source.kind === "reading"
          ? [{ id: quote.citation.id, anchor: quote.citation.source.anchor }]
          : [],
      ),
    [quotes],
  )
  const renderMarginMarks = useCallback(
    (positions: readonly ReaderMarginMarkPosition[]) => (
      <QuoteCommentMarkers
        anchors={positions.flatMap((position) => {
          const quote = quotesByID.get(position.id)
          return quote
            ? [{ quote, top: position.y, left: position.x - QUOTE_COMMENT_MARKER_SIZE_PX / 2 }]
            : []
        })}
      />
    ),
    [quotesByID],
  )
  return { marginMarks, renderMarginMarks }
}
