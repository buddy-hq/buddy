import type { Session } from "@buddy/sdk"
import type { SessionInfo } from "@/state/chat-types"
import type { BenchObjectKind } from "@/lib/bench-navigation"
import type { BenchTabTarget } from "@/lib/bench-targets"
import type { ResourceFileExtension, ResourceViewStatus } from "@/state/resources-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { parseSubagentSession } from "@/lib/session-family"
import { abbreviationScore, normalizeNotebookSearchText } from "@/state/notebook-file-ranking"

export const NOTEBOOK_SEARCH_MIN_QUERY_LENGTH = 2
export const NOTEBOOK_SEARCH_MAX_QUERY_LENGTH = 200
export const NOTEBOOK_SEARCH_DEBOUNCE_MS = 225
export const NOTEBOOK_SEARCH_REMOTE_RESULT_LIMIT = 20
export const NOTEBOOK_SEARCH_TOTAL_RESULT_LIMIT = 50
export const NOTEBOOK_SEARCH_RECENT_RESULT_LIMIT = 6

/** The filter that keeps every kind — the state a search starts in. */
export const NOTEBOOK_SEARCH_FILTER_ALL = "all"

export const NOTEBOOK_SEARCH_RESULT_KINDS = [
  "thread",
  "source",
  "creation",
  "practice",
  "board",
  "note",
  "file",
  "tab",
] as const

export type NotebookSearchResultKind = (typeof NOTEBOOK_SEARCH_RESULT_KINDS)[number]
export type NotebookSearchFilter = typeof NOTEBOOK_SEARCH_FILTER_ALL | NotebookSearchResultKind

export const NOTEBOOK_SEARCH_COMMANDS = [
  { id: "new-note", title: "New note", kind: "note", keywords: "create write note" },
  { id: "open-notes", title: "All notes", kind: "note", keywords: "open browse notes library" },
  { id: "new-board", title: "New board", kind: "board", keywords: "create whiteboard draw board" },
  { id: "open-boards", title: "All boards", kind: "board", keywords: "open browse whiteboards" },
  { id: "open-files", title: "Files", kind: "file", keywords: "open browse workspace explorer" },
  {
    id: "open-resources",
    title: "Resources",
    kind: "source",
    keywords: "open browse books sources library",
  },
  {
    id: "open-practice",
    title: "Practice",
    kind: "practice",
    keywords: "open exercises flashcards study",
  },
  {
    id: "open-creations",
    title: "Creations",
    kind: "creation",
    keywords: "open diagrams widgets figures media",
  },
] as const
export type NotebookSearchCommandID = (typeof NOTEBOOK_SEARCH_COMMANDS)[number]["id"]
export type NotebookSearchCommand = (typeof NOTEBOOK_SEARCH_COMMANDS)[number]

export function searchNotebookCommands(input: {
  query: string
  filter: NotebookSearchFilter
  available: readonly NotebookSearchCommandID[]
}): NotebookSearchCommand[] {
  if (!input.query.trim()) return []
  const available = new Set(input.available)
  return NOTEBOOK_SEARCH_COMMANDS.flatMap((command) => {
    if (!available.has(command.id) || (input.filter !== "all" && command.kind !== input.filter))
      return []
    const score = scoreNotebookSearchText({
      query: input.query,
      title: command.title,
      keywords: command.keywords,
    })
    return score === undefined ? [] : [{ command, score }]
  })
    .toSorted((left, right) => left.score - right.score)
    .map(({ command }) => command)
}

export type NotebookSearchTarget =
  | { type: "thread"; sessionID: string }
  | { type: "object"; kind: BenchObjectKind; objectID: string }
  | {
      type: "resource"
      path: string
      name: string
      objectID?: string
      status?: ResourceViewStatus
    }
  | { type: "file"; path: string; viewer: "markdown" | "file" }
  | { type: "note"; relativePath: string; id?: string }
  | { type: "open-tab"; tabKey: string; target: BenchTabTarget }

export type NotebookSearchResourceVisual = {
  extension: ResourceFileExtension
  coverRelpath?: string
}

export type NotebookSearchResult = {
  id: string
  kind: NotebookSearchResultKind
  title: string
  /** Filename used for ranking a file hit that opens as a processed source. */
  matchTitle?: string
  /** Provider accepted this query in content that may be absent from the preview. */
  providerMatchedQuery?: string
  metadata: string
  keywords?: string
  updatedAtMs: number
  target: NotebookSearchTarget
  resourceVisual?: NotebookSearchResourceVisual
  /** The notebook file a Media object only wraps; a search that finds that file shows the file alone. */
  presentsFile?: string
}

type ScoredNotebookSearchResult = {
  result: NotebookSearchResult
  score: number
}

export function scoreNotebookSearchText(input: {
  query: string
  title: string
  metadata?: string
  keywords?: string
}): number | undefined {
  const query = normalizeNotebookSearchText(input.query)
  if (!query) return 0

  const title = normalizeNotebookSearchText(input.title)
  if (title === query) return 0
  if (title.startsWith(query)) return 10 + title.length - query.length

  const titleIndex = title.indexOf(query)
  if (titleIndex >= 0) return 30 + titleIndex

  const searchableText = normalizeNotebookSearchText(
    `${input.title} ${input.metadata ?? ""} ${input.keywords ?? ""}`,
  )
  const textIndex = searchableText.indexOf(query)
  if (textIndex >= 0) return 60 + textIndex

  const tokens = query.split(/\s+/u).filter(Boolean)
  let tokenScore = 100
  for (const token of tokens) {
    const tokenIndex = searchableText.indexOf(token)
    if (tokenIndex < 0) return abbreviationScore(query, title)
    tokenScore += tokenIndex
  }
  return tokenScore
}

function compareScoredResults(
  left: ScoredNotebookSearchResult,
  right: ScoredNotebookSearchResult,
): number {
  if (left.score !== right.score) return left.score - right.score
  if (left.result.updatedAtMs !== right.result.updatedAtMs) {
    return right.result.updatedAtMs - left.result.updatedAtMs
  }
  return left.result.title.localeCompare(right.result.title)
}

export function balanceNotebookSearchResults(
  scoredResults: readonly ScoredNotebookSearchResult[],
  limit: number = NOTEBOOK_SEARCH_TOTAL_RESULT_LIMIT,
): NotebookSearchResult[] {
  if (limit <= 0) return []
  const sorted = [...scoredResults].toSorted(compareScoredResults)
  const activeKinds = new Set(sorted.map((entry) => entry.result.kind)).size
  if (activeKinds === 0) return []

  const quotaPerKind = Math.max(1, Math.ceil(limit / activeKinds))
  const acceptedIDs = new Set<string>()
  const countByKind = new Map<NotebookSearchResultKind, number>()
  const balanced: NotebookSearchResult[] = []

  for (const entry of sorted) {
    const kindCount = countByKind.get(entry.result.kind) ?? 0
    if (kindCount >= quotaPerKind || acceptedIDs.has(entry.result.id)) continue
    acceptedIDs.add(entry.result.id)
    countByKind.set(entry.result.kind, kindCount + 1)
    balanced.push(entry.result)
    if (balanced.length === limit) return balanced
  }

  for (const entry of sorted) {
    if (acceptedIDs.has(entry.result.id)) continue
    acceptedIDs.add(entry.result.id)
    balanced.push(entry.result)
    if (balanced.length === limit) break
  }
  return balanced
}

export function searchNotebookResults(input: {
  query: string
  filter: NotebookSearchFilter
  results: readonly NotebookSearchResult[]
  limit?: number
}): NotebookSearchResult[] {
  const scored: ScoredNotebookSearchResult[] = []
  for (const result of input.results) {
    if (
      input.filter !== NOTEBOOK_SEARCH_FILTER_ALL &&
      (input.filter === "tab" ? result.target.type !== "open-tab" : result.kind !== input.filter)
    ) {
      continue
    }
    const textScore = scoreNotebookSearchText({
      query: input.query,
      title: result.matchTitle ?? result.title,
      // An open tab's "Open tab" label is presentation, not content; a page tab keeps its URL.
      metadata:
        result.kind === "file" ||
        (result.target.type === "open-tab" && result.target.target.type !== "browser") ||
        result.matchTitle !== undefined ||
        (result.target.type === "resource" && result.target.status === "unprocessed")
          ? undefined
          : result.metadata,
      keywords: result.keywords,
    })
    const score =
      textScore ?? (result.providerMatchedQuery === input.query.trim() ? 200 : undefined)
    if (score === undefined) continue
    scored.push({ result, score })
  }
  return balanceNotebookSearchResults(scored, input.limit ?? NOTEBOOK_SEARCH_TOTAL_RESULT_LIMIT)
}

function sessionInfoFromSearchResult(session: Session): SessionInfo {
  return {
    id: session.id,
    title: session.title,
    parentID: session.parentID,
    time: session.time,
    revert: session.revert,
  }
}

export async function searchNotebookThreads(input: {
  directory: string
  query: string
  signal: AbortSignal
}): Promise<SessionInfo[]> {
  const query = input.query.trim().slice(0, NOTEBOOK_SEARCH_MAX_QUERY_LENGTH)
  if (query.length < NOTEBOOK_SEARCH_MIN_QUERY_LENGTH) return []
  const response = await getBuddyClient(input.directory).session.list(
    {
      directory: input.directory,
      search: query,
      limit: NOTEBOOK_SEARCH_REMOTE_RESULT_LIMIT,
    },
    { signal: input.signal },
  )
  if (input.signal.aborted) {
    const reason = input.signal.reason
    throw reason instanceof Error ? reason : new DOMException("Search aborted", "AbortError")
  }
  return requireBuddyData(response)
    .map(sessionInfoFromSearchResult)
    .filter((session) => parseSubagentSession(session).agent === undefined)
}
