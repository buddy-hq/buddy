type IndexedNotebookFilePath = {
  path: string
  foldedPath: string
  foldedName: string
}

type RankedNotebookFilePath = {
  path: string
  score: number
}

const DEFAULT_RANK_LIMIT = 20
const MAX_RANK_LIMIT = 50
const NOTEBOOK_SEARCH_SEPARATORS = /[\s_/\\-]+/gu
const SCORE_NAME_PREFIX = 1_000
const SCORE_NAME_SUBSTRING = 1_000_000
const SCORE_PATH_SUBSTRING = 1_000_000_000
const SCORE_TOKENS = 1_000_000_000_000
const SCORE_ABBREVIATION = 1_000_000_000_000_000
export const SCORE_PROVIDER = 2_000_000_000_000_000

// Normalized once per file list, so every keystroke only compares strings.
const indexedPathsByList = new WeakMap<readonly string[], readonly IndexedNotebookFilePath[]>()

/** Composed and lowercased, so a decomposed "café" on disk matches a typed "café". */
export function normalizeNotebookSearchText(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase()
}

function notebookSearchSeparators(): RegExp {
  return new RegExp(NOTEBOOK_SEARCH_SEPARATORS.source, "gu")
}

function foldNotebookSearchSeparators(value: string): string {
  return value.replace(notebookSearchSeparators(), "")
}

function scoreWithinBand(base: number, next: number, penalty: number): number {
  return base + Math.min(next - base - 1, penalty)
}

function indexNotebookFilePaths(paths: readonly string[]): readonly IndexedNotebookFilePath[] {
  const cached = indexedPathsByList.get(paths)
  if (cached) return cached
  const indexed = paths.map((path) => {
    const searchPath = normalizeNotebookSearchText(path.replaceAll("\\", "/"))
    const searchName = searchPath.slice(searchPath.lastIndexOf("/") + 1)
    return {
      path,
      foldedPath: foldNotebookSearchSeparators(searchPath),
      foldedName: foldNotebookSearchSeparators(searchName),
    }
  })
  indexedPathsByList.set(paths, indexed)
  return indexed
}

/**
 * Abbreviations such as "nbs" match a name's letters in order. Scores rank below every
 * substring match; undefined when the letters are missing or too scattered.
 */
function abbreviationScore(query: string, name: string): number | undefined {
  if (query.length < 3) return undefined
  let previousIndex = -1
  let gaps = 0
  for (const character of query) {
    const index = name.indexOf(character, previousIndex + 1)
    if (index < 0) return undefined
    if (previousIndex >= 0) gaps += index - previousIndex - 1
    previousIndex = index
  }
  if (gaps > query.length * 3) return undefined
  return SCORE_ABBREVIATION + gaps * 2 + name.length - query.length
}

function foldedSearchTokens(query: string): readonly string[] {
  const tokens: string[] = []
  for (const token of query.split(notebookSearchSeparators())) {
    const folded = foldNotebookSearchSeparators(token)
    if (folded) tokens.push(folded)
  }
  return tokens
}

function scoreSearchTokens(
  foldedQuery: string,
  foldedTokens: readonly string[],
  foldedName: string,
  foldedPath: string,
): number | undefined {
  if (foldedTokens.length === 0) return undefined
  let penalty = 0
  for (const token of foldedTokens) {
    const tokenIndex = foldedPath.indexOf(token)
    if (tokenIndex < 0) return abbreviationScore(foldedQuery, foldedName)
    penalty += tokenIndex
  }
  return scoreWithinBand(SCORE_TOKENS, SCORE_ABBREVIATION, penalty)
}

function scorePreparedNotebookSearch(
  foldedQuery: string,
  foldedTokens: readonly string[],
  foldedName: string,
  foldedPath: string,
): number | undefined {
  if (foldedName === foldedQuery) return 0
  if (foldedName.startsWith(foldedQuery)) {
    return scoreWithinBand(
      SCORE_NAME_PREFIX,
      SCORE_NAME_SUBSTRING,
      foldedName.length - foldedQuery.length,
    )
  }

  const nameIndex = foldedName.indexOf(foldedQuery)
  if (nameIndex >= 0) return scoreWithinBand(SCORE_NAME_SUBSTRING, SCORE_PATH_SUBSTRING, nameIndex)

  const pathIndex = foldedPath.indexOf(foldedQuery)
  if (pathIndex >= 0) return scoreWithinBand(SCORE_PATH_SUBSTRING, SCORE_TOKENS, pathIndex)

  return scoreSearchTokens(foldedQuery, foldedTokens, foldedName, foldedPath)
}

export function scoreNormalizedNotebookSearch(input: {
  query: string
  name: string
  path: string
}): number | undefined {
  const foldedQuery = foldNotebookSearchSeparators(input.query)
  if (!foldedQuery) return undefined
  return scorePreparedNotebookSearch(
    foldedQuery,
    foldedSearchTokens(input.query),
    foldNotebookSearchSeparators(input.name),
    foldNotebookSearchSeparators(input.path),
  )
}

function compareRankedPaths(left: RankedNotebookFilePath, right: RankedNotebookFilePath): number {
  if (left.score !== right.score) return left.score - right.score
  return left.path.localeCompare(right.path)
}

/** Filename matches first, then path matches, then abbreviations; keeps only the best `limit`. */
export function rankNotebookFilePaths(input: {
  query: string
  paths: readonly string[]
  limit?: number
}): string[] {
  const query = normalizeNotebookSearchText(input.query)
  if (!query) return []
  const foldedQuery = foldNotebookSearchSeparators(query)
  if (!foldedQuery) return []
  const limit = Math.min(MAX_RANK_LIMIT, Math.max(1, input.limit ?? DEFAULT_RANK_LIMIT))
  const foldedTokens = foldedSearchTokens(query)
  const ranked: RankedNotebookFilePath[] = []
  for (const entry of indexNotebookFilePaths(input.paths)) {
    const score = scorePreparedNotebookSearch(
      foldedQuery,
      foldedTokens,
      entry.foldedName,
      entry.foldedPath,
    )
    if (score === undefined) continue
    const candidate = { path: entry.path, score }
    const worst = ranked.at(-1)
    if (ranked.length >= limit && worst && compareRankedPaths(candidate, worst) >= 0) continue
    const index = ranked.findIndex((kept) => compareRankedPaths(candidate, kept) < 0)
    ranked.splice(index < 0 ? ranked.length : index, 0, candidate)
    if (ranked.length > limit) ranked.pop()
  }
  return ranked.map((match) => match.path)
}
