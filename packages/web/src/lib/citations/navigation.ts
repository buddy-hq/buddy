import type { Citation } from "@buddy/citation-contract"

export type CitationNavigationResult = boolean | "pending"
export type CitationNavigationHandler = (
  citation: Citation,
) => CitationNavigationResult | Promise<CitationNavigationResult>

const handlers = new Set<CitationNavigationHandler>()
let pendingCitation: Citation | undefined

/** Register a mounted source surface that can reveal citations it owns. */
export function registerCitationNavigationHandler(handler: CitationNavigationHandler): () => void {
  handlers.add(handler)
  if (pendingCitation) {
    const candidate = pendingCitation
    void Promise.resolve()
      .then(() => handler(candidate))
      .then((result) => {
        if (result === true && pendingCitation === candidate) pendingCitation = undefined
      })
      .catch(() => undefined)
  }
  return () => handlers.delete(handler)
}

/** Ask mounted source surfaces to reveal a citation, newest surface first. */
export async function requestCitationNavigation(citation: Citation): Promise<boolean> {
  pendingCitation = citation
  for (const handler of [...handlers].toReversed()) {
    let result: CitationNavigationResult
    try {
      result = await handler(citation)
    } catch {
      continue
    }
    if (result === true) {
      if (pendingCitation === citation) pendingCitation = undefined
      return true
    }
    if (result === "pending") return true
  }
  if (pendingCitation === citation) pendingCitation = undefined
  return false
}
