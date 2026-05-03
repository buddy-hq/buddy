import type { Config } from "@buddy/backend/config"
import type { PersonaDefinition } from "../shared/runtime-types"
import type { DynamicLearningToolCatalogEntry } from "./dynamic-tool-catalog"
import { allDynamicLearningToolCatalogEntries } from "./dynamic-tool-catalog"
import { toolMatchesRuntimeConstraints } from "../runtime/tool-constraints"

const MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER = 3
const BM25_K1 = 1.5
const BM25_B = 0.75
const EXACT_ID_SCORE_BOOST = 100
const EMPTY_QUERY_SCORE = 0

type DynamicLearningToolFilterReason = "persona" | "workspace" | "runtime" | "config"

type DynamicLearningToolFilteredEntry = {
  id: string
  title: string
  reason: DynamicLearningToolFilterReason
}

type DynamicLearningToolSearchMatch = {
  entry: DynamicLearningToolCatalogEntry
  score: number
  reasons: string[]
}

type DynamicLearningToolSearchInput = {
  query: string
  persona: PersonaDefinition
  configuredToolToggles?: Config.Info["tools"]
  limit?: number
}

type DynamicLearningToolSearchResult = {
  matches: DynamicLearningToolSearchMatch[]
  filtered: DynamicLearningToolFilteredEntry[]
}

type DynamicLearningToolSelectionInput = Omit<DynamicLearningToolSearchInput, "query" | "limit"> & {
  ids: readonly string[]
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
}

function searchText(entry: DynamicLearningToolCatalogEntry): string {
  return [
    entry.id,
    entry.id.replaceAll("_", " "),
    entry.title,
    entry.description,
    entry.searchText,
    ...entry.keywords,
  ].join(" ")
}

function termFrequencies(tokens: readonly string[]): Map<string, number> {
  const frequencies = new Map<string, number>()
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
  }
  return frequencies
}

function inverseDocumentFrequency(input: {
  term: string
  documents: readonly Map<string, number>[]
}): number {
  const documentsWithTerm = input.documents.filter((document) => document.has(input.term)).length
  return Math.log(
    1 + (input.documents.length - documentsWithTerm + 0.5) / (documentsWithTerm + 0.5),
  )
}

function bm25Score(input: {
  queryTokens: readonly string[]
  document: Map<string, number>
  documents: readonly Map<string, number>[]
  documentLength: number
  averageDocumentLength: number
}): number {
  let score = 0
  const uniqueQueryTokens = Array.from(new Set(input.queryTokens))

  for (const term of uniqueQueryTokens) {
    const frequency = input.document.get(term) ?? 0
    if (frequency === 0) continue

    const idf = inverseDocumentFrequency({
      term,
      documents: input.documents,
    })
    const denominator =
      frequency +
      BM25_K1 * (1 - BM25_B + BM25_B * (input.documentLength / input.averageDocumentLength))
    score += idf * ((frequency * (BM25_K1 + 1)) / denominator)
  }

  return score
}

function filterEntry(input: {
  entry: DynamicLearningToolCatalogEntry
  persona: PersonaDefinition
  configuredToolToggles?: Config.Info["tools"]
}): DynamicLearningToolFilterReason | undefined {
  if (input.configuredToolToggles?.[input.entry.id] === false) {
    return "config"
  }

  if (input.persona.tools.dynamic[input.entry.id] !== "allow") {
    return "persona"
  }

  if (!toolMatchesRuntimeConstraints(input.entry.tool)) {
    return "runtime"
  }

  return undefined
}

function matchReasons(input: {
  entry: DynamicLearningToolCatalogEntry
  queryTokens: readonly string[]
  exactID: boolean
}): string[] {
  const entryTokens = new Set(tokenize(searchText(input.entry)))
  const keywordMatches = input.entry.keywords.filter((keyword) =>
    input.queryTokens.some((token) => keyword.includes(token) || token.includes(keyword)),
  )
  const tokenMatches = input.queryTokens.filter((token) => entryTokens.has(token))

  return [
    input.exactID ? `Exact dynamic tool ID match: ${input.entry.id}` : undefined,
    keywordMatches.length > 0
      ? `Matched keywords: ${Array.from(new Set(keywordMatches)).join(", ")}`
      : undefined,
    tokenMatches.length > 0
      ? `Matched query terms: ${Array.from(new Set(tokenMatches)).join(", ")}`
      : undefined,
  ].filter((reason): reason is string => reason !== undefined)
}

function searchDynamicLearningTools(
  input: DynamicLearningToolSearchInput,
): DynamicLearningToolSearchResult {
  const entries = allDynamicLearningToolCatalogEntries()
  const queryTokens = tokenize(input.query)
  const filtered: DynamicLearningToolFilteredEntry[] = []
  const candidates: DynamicLearningToolCatalogEntry[] = []

  for (const entry of entries) {
    const reason = filterEntry({
      entry,
      persona: input.persona,
      configuredToolToggles: input.configuredToolToggles,
    })
    if (reason) {
      filtered.push({
        id: entry.id,
        title: entry.title,
        reason,
      })
      continue
    }
    candidates.push(entry)
  }

  const documentTokens = candidates.map((entry) => tokenize(searchText(entry)))
  const documents = documentTokens.map(termFrequencies)
  const averageDocumentLength =
    documentTokens.reduce((sum, tokens) => sum + tokens.length, 0) /
    Math.max(1, documentTokens.length)

  const matches = candidates
    .map((entry, index): DynamicLearningToolSearchMatch | undefined => {
      const exactID = input.query.trim().toLowerCase() === entry.id.toLowerCase()
      const score =
        (queryTokens.length === 0
          ? EMPTY_QUERY_SCORE
          : bm25Score({
              queryTokens,
              document: documents[index] ?? new Map<string, number>(),
              documents,
              documentLength: documentTokens[index]?.length ?? 0,
              averageDocumentLength,
            })) + (exactID ? EXACT_ID_SCORE_BOOST : 0)

      if (score <= 0) return undefined
      return {
        entry,
        score,
        reasons: matchReasons({ entry, queryTokens, exactID }),
      }
    })
    .filter((match): match is DynamicLearningToolSearchMatch => match !== undefined)
    .toSorted(
      (left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id),
    )
    .slice(0, input.limit ?? MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER)

  return {
    matches,
    filtered,
  }
}

function selectDynamicLearningToolsByID(
  input: DynamicLearningToolSelectionInput,
): DynamicLearningToolSearchResult {
  const requestedIDs = new Set(input.ids)
  const matches: DynamicLearningToolSearchMatch[] = []
  const filtered: DynamicLearningToolFilteredEntry[] = []

  for (const entry of allDynamicLearningToolCatalogEntries()) {
    if (!requestedIDs.has(entry.id)) continue

    const reason = filterEntry({
      entry,
      persona: input.persona,
      configuredToolToggles: input.configuredToolToggles,
    })
    if (reason) {
      filtered.push({
        id: entry.id,
        title: entry.title,
        reason,
      })
      continue
    }

    matches.push({
      entry,
      score: 0,
      reasons: [`Requested dynamic tool ID: ${entry.id}`],
    })
  }

  return {
    matches,
    filtered,
  }
}

export {
  MAX_DYNAMIC_TOOL_MATCHES_TO_REGISTER,
  searchDynamicLearningTools,
  selectDynamicLearningToolsByID,
}

export type {
  DynamicLearningToolFilteredEntry,
  DynamicLearningToolSelectionInput,
  DynamicLearningToolSearchInput,
  DynamicLearningToolSearchMatch,
  DynamicLearningToolSearchResult,
}
