export type PdfTextMatchOptions = {
  matchCase: boolean
  matchWholeWords: boolean
  matchDiacritics: boolean
}

export type PdfTextMatch = {
  startOffset: number
  endOffset: number
  pre: string
  match: string
  post: string
}

const SEARCH_EXCERPT_CONTEXT_LENGTH = 48
const COMBINING_MARK_PATTERN = /\p{M}/u
const WORD_CHARACTER_PATTERN = /[\p{L}\p{M}\p{N}_]/u

type NormalizedText = {
  text: string
  sourceStarts: number[]
  sourceEnds: number[]
}

function normalizeText(
  value: string,
  options: Pick<PdfTextMatchOptions, "matchCase" | "matchDiacritics">,
): NormalizedText {
  const normalizedParts: string[] = []
  const sourceStarts: number[] = []
  const sourceEnds: number[] = []
  let sourceStart = 0

  for (const sourceCharacter of value) {
    const sourceEnd = sourceStart + sourceCharacter.length
    const decomposed = options.matchDiacritics
      ? sourceCharacter
      : sourceCharacter.normalize("NFD")
    for (const character of decomposed) {
      if (!options.matchDiacritics && COMBINING_MARK_PATTERN.test(character)) {
        const previousIndex = sourceEnds.length - 1
        if (previousIndex >= 0) sourceEnds[previousIndex] = sourceEnd
        continue
      }
      const normalizedCharacter = options.matchCase ? character : character.toLowerCase()
      normalizedParts.push(normalizedCharacter)
      for (let codeUnitIndex = 0; codeUnitIndex < normalizedCharacter.length; codeUnitIndex += 1) {
        sourceStarts.push(sourceStart)
        sourceEnds.push(sourceEnd)
      }
    }
    sourceStart = sourceEnd
  }

  return { text: normalizedParts.join(""), sourceStarts, sourceEnds }
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && WORD_CHARACTER_PATTERN.test(value)
}

function codePointBefore(value: string, offset: number): string | undefined {
  if (offset <= 0) return undefined
  const finalCodeUnit = value.charCodeAt(offset - 1)
  const hasSurrogatePair =
    finalCodeUnit >= 0xdc00 &&
    finalCodeUnit <= 0xdfff &&
    offset >= 2 &&
    value.charCodeAt(offset - 2) >= 0xd800 &&
    value.charCodeAt(offset - 2) <= 0xdbff
  return value.slice(hasSurrogatePair ? offset - 2 : offset - 1, offset)
}

function codePointAt(value: string, offset: number): string | undefined {
  if (offset < 0 || offset >= value.length) return undefined
  const codePoint = value.codePointAt(offset)
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint)
}

function hasWholeWordBoundaries(text: string, start: number, end: number): boolean {
  return !isWordCharacter(codePointBefore(text, start)) && !isWordCharacter(codePointAt(text, end))
}

export function findPdfTextMatches(
  sourceText: string,
  query: string,
  options: PdfTextMatchOptions,
): PdfTextMatch[] {
  if (!query) return []
  const source = normalizeText(sourceText, options)
  const normalizedQuery = normalizeText(query, options).text
  if (!normalizedQuery) return []

  const matches: PdfTextMatch[] = []
  let searchOffset = 0
  while (searchOffset <= source.text.length - normalizedQuery.length) {
    const normalizedStart = source.text.indexOf(normalizedQuery, searchOffset)
    if (normalizedStart < 0) break
    const normalizedEnd = normalizedStart + normalizedQuery.length
    searchOffset = Math.max(normalizedEnd, normalizedStart + 1)
    const sourceStart = source.sourceStarts[normalizedStart]
    const sourceEnd = source.sourceEnds[normalizedEnd - 1]
    if (sourceStart === undefined || sourceEnd === undefined) continue
    if (options.matchWholeWords && !hasWholeWordBoundaries(sourceText, sourceStart, sourceEnd)) {
      continue
    }
    matches.push({
      startOffset: sourceStart,
      endOffset: sourceEnd,
      pre: sourceText.slice(Math.max(0, sourceStart - SEARCH_EXCERPT_CONTEXT_LENGTH), sourceStart),
      match: sourceText.slice(sourceStart, sourceEnd),
      post: sourceText.slice(sourceEnd, sourceEnd + SEARCH_EXCERPT_CONTEXT_LENGTH),
    })
  }

  return matches
}
