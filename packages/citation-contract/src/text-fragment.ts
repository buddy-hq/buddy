import { CITATION_TEXT_CONTEXT_LENGTH, type CitationTextSelector } from "./index"

const TEXT_DIRECTIVE_DELIMITER = ":~:"
const WHOLE_QUOTE_MAX_WORDS = 8
const QUOTE_EDGE_WORDS = 4
const CONTEXT_WORDS = 3

function textWords(text: string): string[] {
  return text.split(/\s+/u).filter((word) => word.length > 0)
}

function encodeTextDirectiveTerm(term: string): string {
  return encodeURIComponent(term).replace(/-/gu, "%2D")
}

function prefixContext(prefix: string): string {
  const words = textWords(prefix)
  if (prefix.length >= CITATION_TEXT_CONTEXT_LENGTH) words.shift()
  return words.slice(-CONTEXT_WORDS).join(" ")
}

function suffixContext(suffix: string): string {
  const words = textWords(suffix)
  if (suffix.length >= CITATION_TEXT_CONTEXT_LENGTH) words.pop()
  return words.slice(0, CONTEXT_WORDS).join(" ")
}

function withoutTextDirective(url: string): string {
  const hashIndex = url.indexOf("#")
  if (hashIndex === -1) return url
  const directiveIndex = url.indexOf(TEXT_DIRECTIVE_DELIMITER, hashIndex)
  return directiveIndex === -1 ? url : url.slice(0, directiveIndex)
}

export function citationTextFragmentUrl(input: {
  url: string
  excerpt: string
  selector: CitationTextSelector
}): string {
  const base = withoutTextDirective(input.url)
  const quote = textWords(input.excerpt)
  if (quote.length === 0) return base
  const prefix = prefixContext(input.selector.prefix)
  const suffix = suffixContext(input.selector.suffix)
  const quoteTerms =
    quote.length <= WHOLE_QUOTE_MAX_WORDS
      ? [quote.join(" ")]
      : [quote.slice(0, QUOTE_EDGE_WORDS).join(" "), quote.slice(-QUOTE_EDGE_WORDS).join(" ")]
  const terms = [
    prefix ? `${encodeTextDirectiveTerm(prefix)}-` : undefined,
    ...quoteTerms.map(encodeTextDirectiveTerm),
    suffix ? `-${encodeTextDirectiveTerm(suffix)}` : undefined,
  ].filter((term) => term !== undefined)
  const directive = `${TEXT_DIRECTIVE_DELIMITER}text=${terms.join(",")}`
  return base.includes("#") ? `${base}${directive}` : `${base}#${directive}`
}
