type IndexedNotebookFilePath = {
  path: string
  searchPath: string
  searchName: string
}

type RankedNotebookFilePath = {
  path: string
  score: number
}

const DEFAULT_RANK_LIMIT = 20
const MAX_RANK_LIMIT = 50

// Normalized once per file list, so every keystroke only compares strings.
const indexedPathsByList = new WeakMap<readonly string[], readonly IndexedNotebookFilePath[]>()

/** Composed and lowercased, so a decomposed "café" on disk matches a typed "café". */
export function normalizeNotebookSearchText(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase()
}

function indexNotebookFilePaths(paths: readonly string[]): readonly IndexedNotebookFilePath[] {
  const cached = indexedPathsByList.get(paths)
  if (cached) return cached
  const indexed = paths.map((path) => {
    const searchPath = normalizeNotebookSearchText(path.replaceAll("\\", "/"))
    return { path, searchPath, searchName: searchPath.slice(searchPath.lastIndexOf("/") + 1) }
  })
  indexedPathsByList.set(paths, indexed)
  return indexed
}

/**
 * Abbreviations such as "nbs" match a name's letters in order. Scores rank below every
 * substring match; undefined when the letters are missing or too scattered.
 */
export function abbreviationScore(query: string, name: string): number | undefined {
  if (query.length < 3 || query.includes(" ")) return undefined
  let previousIndex = -1
  let gaps = 0
  for (const character of query) {
    const index = name.indexOf(character, previousIndex + 1)
    if (index < 0) return undefined
    if (previousIndex >= 0) gaps += index - previousIndex - 1
    previousIndex = index
  }
  if (gaps > query.length * 3) return undefined
  return 100_000 + gaps * 2 + name.length - query.length
}

function scoreIndexedPath(
  query: string,
  tokens: readonly string[],
  entry: IndexedNotebookFilePath,
): number | undefined {
  const name = entry.searchName
  if (name === query) return 0
  if (name.startsWith(query)) return 10 + name.length - query.length

  const nameIndex = name.indexOf(query)
  if (nameIndex >= 0) return 30 + nameIndex

  const pathIndex = entry.searchPath.indexOf(query)
  if (pathIndex >= 0) return 60 + pathIndex

  let tokenScore = 100
  for (const token of tokens) {
    const tokenIndex = entry.searchPath.indexOf(token)
    if (tokenIndex < 0) return abbreviationScore(query, name)
    tokenScore += tokenIndex
  }
  return tokenScore
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
  const limit = Math.min(MAX_RANK_LIMIT, Math.max(1, input.limit ?? DEFAULT_RANK_LIMIT))
  const tokens = query.split(/\s+/u).filter(Boolean)
  const ranked: RankedNotebookFilePath[] = []
  for (const entry of indexNotebookFilePaths(input.paths)) {
    const score = scoreIndexedPath(query, tokens, entry)
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
