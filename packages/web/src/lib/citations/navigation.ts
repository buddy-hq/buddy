import type { Citation, CitationTextSelector } from "@buddy/citation-contract"
import { resolveRenderedTextRange } from "@buddy/citation-contract/rendered-text"

export type CitationNavigationResult = boolean | "pending"
export type CitationNavigationHandler = (
  citation: Citation,
) => CitationNavigationResult | Promise<CitationNavigationResult>

const handlers = new Set<CitationNavigationHandler>()
let pendingCitation: Citation | undefined

export function resolveChatCitationTarget(
  container: ParentNode,
  input: {
    messageID: string
    partID: string
    excerpt: string
    selector: CitationTextSelector
  },
): { source: HTMLElement; range: Range | undefined } | undefined {
  const messageSelector = `[data-citation-message="${CSS.escape(input.messageID)}"]`
  const exact = container.querySelector<HTMLElement>(
    `${messageSelector}[data-citation-part="${CSS.escape(input.partID)}"]`,
  )
  if (exact) {
    return {
      source: exact,
      range: resolveRenderedTextRange(exact, input.excerpt, input.selector),
    }
  }
  let first: HTMLElement | undefined
  for (const source of container.querySelectorAll<HTMLElement>(
    `${messageSelector}[data-citation-part]`,
  )) {
    first ??= source
    const range = resolveRenderedTextRange(source, input.excerpt, input.selector)
    if (range) return { source, range }
  }
  return first ? { source: first, range: undefined } : undefined
}

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
