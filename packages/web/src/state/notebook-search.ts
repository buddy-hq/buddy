import type { Session } from "@buddy/sdk"
import type { SessionInfo } from "@/state/chat-types"
import type { BenchObjectKind } from "@/lib/bench-navigation"
import type { ResourceFileExtension, ResourceViewStatus } from "@/state/resources-query"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { parseSubagentSession } from "@/lib/session-family"

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
  "file",
] as const

export type NotebookSearchResultKind = (typeof NOTEBOOK_SEARCH_RESULT_KINDS)[number]
export type NotebookSearchFilter = typeof NOTEBOOK_SEARCH_FILTER_ALL | NotebookSearchResultKind

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

export type NotebookSearchResourceVisual = {
  extension: ResourceFileExtension
  coverRelpath?: string
}

export type NotebookSearchResult = {
  id: string
  kind: NotebookSearchResultKind
  title: string
  metadata: string
  keywords?: string
  updatedAtMs: number
  target: NotebookSearchTarget
  resourceVisual?: NotebookSearchResourceVisual
}

export type RemoteNotebookSearchResult = {
  sessions: SessionInfo[]
  files: string[]
  fileScanPartial: boolean
  failedProviders: Array<"threads" | "files">
}

type ScoredNotebookSearchResult = {
  result: NotebookSearchResult
  score: number
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function scoreNotebookSearchText(input: {
  query: string
  title: string
  metadata?: string
  keywords?: string
}): number | undefined {
  const query = normalizeSearchValue(input.query)
  if (!query) return 0

  const title = normalizeSearchValue(input.title)
  if (title === query) return 0
  if (title.startsWith(query)) return 10 + title.length - query.length

  const titleIndex = title.indexOf(query)
  if (titleIndex >= 0) return 30 + titleIndex

  const searchableText = normalizeSearchValue(
    `${input.title} ${input.metadata ?? ""} ${input.keywords ?? ""}`,
  )
  const textIndex = searchableText.indexOf(query)
  if (textIndex >= 0) return 60 + textIndex

  const tokens = query.split(/\s+/u).filter(Boolean)
  let tokenScore = 100
  for (const token of tokens) {
    const tokenIndex = searchableText.indexOf(token)
    if (tokenIndex < 0) return undefined
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
    if (input.filter !== NOTEBOOK_SEARCH_FILTER_ALL && result.kind !== input.filter) {
      continue
    }
    const score = scoreNotebookSearchText({
      query: input.query,
      title: result.title,
      metadata: result.metadata,
      keywords: result.keywords,
    })
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

export async function searchRemoteNotebookEntities(input: {
  directory: string
  query: string
  signal: AbortSignal
  /** Off where the caller cannot open a chat, so the provider is never asked. */
  includeThreads: boolean
}): Promise<RemoteNotebookSearchResult> {
  const query = input.query.trim().slice(0, NOTEBOOK_SEARCH_MAX_QUERY_LENGTH)
  if (query.length < NOTEBOOK_SEARCH_MIN_QUERY_LENGTH) {
    return {
      sessions: [],
      files: [],
      fileScanPartial: false,
      failedProviders: [],
    }
  }
  const client = getBuddyClient(input.directory)
  const sessionRequest = input.includeThreads
    ? client.session
        .list(
          {
            directory: input.directory,
            search: query,
            limit: NOTEBOOK_SEARCH_REMOTE_RESULT_LIMIT,
          },
          { signal: input.signal },
        )
        .then((response) =>
          requireBuddyData(response)
            .map(sessionInfoFromSearchResult)
            .filter((session) => parseSubagentSession(session).agent === undefined),
        )
    : Promise.resolve<SessionInfo[]>([])
  const fileRequest = client.find
    .notebookFiles(
      {
        directory: input.directory,
        query,
        limit: NOTEBOOK_SEARCH_REMOTE_RESULT_LIMIT,
      },
      { signal: input.signal },
    )
    .then(requireBuddyData)

  const [sessionResult, fileResult] = await Promise.allSettled([sessionRequest, fileRequest])
  if (input.signal.aborted) {
    const reason = input.signal.reason
    throw reason instanceof Error ? reason : new DOMException("Search aborted", "AbortError")
  }

  const failedProviders: RemoteNotebookSearchResult["failedProviders"] = []
  if (sessionResult.status === "rejected") failedProviders.push("threads")
  if (fileResult.status === "rejected") failedProviders.push("files")

  return {
    sessions: sessionResult.status === "fulfilled" ? sessionResult.value : [],
    files: fileResult.status === "fulfilled" ? fileResult.value.matches : [],
    fileScanPartial: fileResult.status === "fulfilled" ? fileResult.value.partial : false,
    failedProviders,
  }
}
