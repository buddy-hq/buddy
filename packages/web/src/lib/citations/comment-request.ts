/**
 * Where a fresh citation's comment editor opens: beside the cited source text, which
 * stays marked while the editor is open.
 */
export type CitationCommentSource = {
  /** Top-level viewport rect of the cited text's last line. */
  getBoundingClientRect(): DOMRect
  /** Main-document element inside the source's scroll container, for clipping. */
  readonly contextElement: Element
  /** Mark the source text until the returned cleanup runs; report text that disappeared. */
  mark(onUnavailable: () => void): () => void
}

type CitationCommentRequest = {
  citationID: string
  source: CitationCommentSource | undefined
}

let pendingRequest: CitationCommentRequest | undefined

/** Ask the composer to open the comment editor once it renders this citation's chip. */
export function requestCitationComment(citationID: string, source?: CitationCommentSource): void {
  pendingRequest = { citationID, source }
}

/** Claim the pending comment request; returned once, and only for the requested citation. */
export function consumeCitationCommentRequest(
  citationID: string,
): { source: CitationCommentSource | undefined } | undefined {
  if (pendingRequest?.citationID !== citationID) return undefined
  const { source } = pendingRequest
  pendingRequest = undefined
  return { source }
}
