import { readProjectConfig } from "../../config/runtime"
import {
  appendLearnerEvent,
  createLearnerEvent,
  listSearchableLearnerMemories,
  strengthenLearnerMemory,
} from "./storage"
import { recordLearnerMemoryStageOneUsageForCandidateIds } from "./stage-one-store"
import { readLearnerMemorySettings } from "./settings"
import { LEARNER_MEMORY_RETRIEVAL_TUNING, MILLISECONDS_PER_DAY } from "./tuning"
import type { LearnerMemory, RetrievalResult } from "./types"

const ACTIVE_RETRIEVAL_STATUSES: ReadonlySet<LearnerMemory["status"]> = new Set(
  LEARNER_MEMORY_RETRIEVAL_TUNING.activeRetrievalStatuses,
)

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= LEARNER_MEMORY_RETRIEVAL_TUNING.minimumTokenLength)
}

function tokenOverlapScore(queryTokens: readonly string[], memory: LearnerMemory): number {
  const memoryTokens = new Set(tokenize(`${memory.title} ${memory.body} ${memory.tags.join(" ")}`))
  return queryTokens.reduce((score, token) => score + (memoryTokens.has(token) ? 1 : 0), 0)
}

function memoryText(memory: LearnerMemory): string {
  return [
    memory.title,
    memory.body,
    memory.tags.join(" "),
    memory.type,
    memory.pedagogyKind,
    memory.memoryType,
  ].join(" ")
}

function bm25Score(input: {
  queryTokens: readonly string[]
  memory: LearnerMemory
  corpus: readonly LearnerMemory[]
}): number {
  const documents = input.corpus.map((memory) => tokenize(memoryText(memory)))
  const documentTokens = tokenize(memoryText(input.memory))
  if (documents.length === 0 || documentTokens.length === 0) return 0

  const averageLength = documents.reduce((sum, tokens) => sum + tokens.length, 0) / documents.length
  const frequencies = new Map<string, number>()
  for (const token of documentTokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
  }

  return input.queryTokens.reduce((score, token) => {
    const frequency = frequencies.get(token) ?? 0
    if (frequency === 0) return score

    const documentFrequency = documents.filter((tokens) => tokens.includes(token)).length
    const inverseDocumentFrequency = Math.log(
      1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5),
    )
    const denominator =
      frequency +
      LEARNER_MEMORY_RETRIEVAL_TUNING.bm25K1 *
        (1 -
          LEARNER_MEMORY_RETRIEVAL_TUNING.bm25B +
          LEARNER_MEMORY_RETRIEVAL_TUNING.bm25B * (documentTokens.length / averageLength))
    return (
      score +
      inverseDocumentFrequency *
        ((frequency * (LEARNER_MEMORY_RETRIEVAL_TUNING.bm25K1 + 1)) / denominator)
    )
  }, 0)
}

function projectScopeScore(memory: LearnerMemory, projectPath: string | undefined): number {
  if (!projectPath || !memory.projectPath) return 0
  return memory.projectPath === projectPath
    ? LEARNER_MEMORY_RETRIEVAL_TUNING.exactProjectMatchScore
    : LEARNER_MEMORY_RETRIEVAL_TUNING.crossProjectMismatchScore
}

function recencyScore(memory: LearnerMemory): number {
  if (!memory.lastUsedAt) return 0
  const usedAt = Date.parse(memory.lastUsedAt)
  if (Number.isNaN(usedAt)) return 0
  const ageMs = Date.now() - usedAt
  const recentMs = LEARNER_MEMORY_RETRIEVAL_TUNING.recentUseDays * MILLISECONDS_PER_DAY
  return ageMs >= 0 && ageMs <= recentMs ? LEARNER_MEMORY_RETRIEVAL_TUNING.recentUseScore : 0
}

function ageDays(memory: LearnerMemory): number {
  const timestamp = Date.parse(memory.lastUsedAt ?? memory.updatedAt)
  if (Number.isNaN(timestamp)) return 0
  return Math.max(0, (Date.now() - timestamp) / MILLISECONDS_PER_DAY)
}

function retentionDecayMultiplier(memory: LearnerMemory): number {
  const days = ageDays(memory)
  switch (memory.memoryType) {
    case "flashbulb":
      return 1
    case "semantic":
      return Math.exp(-days / LEARNER_MEMORY_RETRIEVAL_TUNING.semanticHalfLifeDays)
    case "procedural":
      return Math.exp(-days / LEARNER_MEMORY_RETRIEVAL_TUNING.proceduralHalfLifeDays)
    case "episodic":
      return Math.exp(-days / LEARNER_MEMORY_RETRIEVAL_TUNING.episodicHalfLifeDays)
  }
}

function scoreMemory(input: {
  queryTokens: readonly string[]
  memory: LearnerMemory
  corpus: readonly LearnerMemory[]
  projectPath?: string
}): RetrievalResult {
  const lexical = tokenOverlapScore(input.queryTokens, input.memory)
  const bm25 = bm25Score({
    queryTokens: input.queryTokens,
    memory: input.memory,
    corpus: input.corpus,
  })
  const project = projectScopeScore(input.memory, input.projectPath)
  const confidence = input.memory.confidence
  const effectiveStrength =
    input.memory.strength *
    retentionDecayMultiplier(input.memory) *
    LEARNER_MEMORY_RETRIEVAL_TUNING.maxStrengthScore
  const recency = recencyScore(input.memory)
  const pinned = input.memory.pinned ? LEARNER_MEMORY_RETRIEVAL_TUNING.pinnedScore : 0
  const openLoop =
    input.memory.type === "open_loop" ? LEARNER_MEMORY_RETRIEVAL_TUNING.openLoopScore : 0
  const procedural =
    input.memory.memoryType === "procedural" ? LEARNER_MEMORY_RETRIEVAL_TUNING.proceduralScore : 0
  const flashbulb =
    input.memory.memoryType === "flashbulb" ? LEARNER_MEMORY_RETRIEVAL_TUNING.flashbulbScore : 0
  const stale = input.memory.status === "stale" ? LEARNER_MEMORY_RETRIEVAL_TUNING.staleScore : 0
  const score =
    bm25 +
    lexical +
    pinned +
    project +
    openLoop +
    procedural +
    flashbulb +
    stale +
    confidence +
    effectiveStrength +
    recency
  const reasons = [
    bm25 > 0 ? `bm25:${bm25.toFixed(2)}` : "bm25:0",
    lexical > 0 ? `lexical:${lexical}` : "lexical:0",
    pinned > 0 ? `pinned:${pinned}` : "pinned:0",
    project !== 0 ? `project:${project}` : "project:0",
    openLoop > 0 ? `open_loop:${openLoop}` : "open_loop:0",
    procedural > 0 ? `procedural:${procedural}` : "procedural:0",
    flashbulb > 0 ? `flashbulb:${flashbulb}` : "flashbulb:0",
    stale !== 0 ? `stale:${stale}` : "stale:0",
    `confidence:${confidence.toFixed(2)}`,
    `effective_strength:${effectiveStrength.toFixed(2)}`,
    recency > 0 ? `recent:${recency.toFixed(2)}` : "recent:0",
  ]

  return {
    memory: input.memory,
    score,
    reasons,
  }
}

async function searchLearnerMemory(input: {
  directory: string
  query: string
  projectPath?: string
  limit?: number
  recordUsage?: boolean
}): Promise<RetrievalResult[]> {
  const queryTokens = tokenize(input.query)
  const memories = await listSearchableLearnerMemories(input.directory)
  const settings = readLearnerMemorySettings(await readProjectConfig(input.directory))
  const limit = input.limit ?? settings.defaultContextMemoryLimit
  const results = memories
    .filter((memory) => ACTIVE_RETRIEVAL_STATUSES.has(memory.status))
    .map((memory) =>
      scoreMemory({ queryTokens, memory, corpus: memories, projectPath: input.projectPath }),
    )
    .filter((result) => result.score > 0 && !result.reasons.includes("bm25:0"))
    .toSorted((left, right) => right.score - left.score)
    .slice(0, limit)

  if (input.recordUsage && results.length > 0) {
    await appendLearnerEvent(
      input.directory,
      createLearnerEvent({
        type: "memory_used",
        sourceKind: "learner_memory_search",
        searchableText: `Learner memory search: ${input.query}`,
        payload: {
          query: input.query,
          memoryIds: results.map((result) => result.memory.id),
        },
      }),
    )
    await Promise.all(
      results.map((result) =>
        strengthenLearnerMemory({
          directory: input.directory,
          memoryId: result.memory.id,
          sourceKind: "learner_memory_search",
        }),
      ),
    )
    await recordLearnerMemoryStageOneUsageForCandidateIds({
      directory: input.directory,
      candidateIds: results.flatMap((result) => result.memory.sourceEventIds),
    })
  }

  return results
}

export { searchLearnerMemory }
