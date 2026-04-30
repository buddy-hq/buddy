import fs from "node:fs/promises"
import {
  appendLearnerEvent,
  createLearnerEvent,
  decayLearnerMemory,
  listLearnerMemories,
  markLearnerMemoryStale,
  supersedeLearnerMemory,
} from "./storage"
import { rebuildLearnerMemoryIndex } from "./index-store"
import { regenerateLearnerMemoryMarkdown } from "./markdown"
import { LearnerMemoryPath } from "./paths"
import { LEARNER_MEMORY_MAINTENANCE_TUNING, MILLISECONDS_PER_DAY } from "./tuning"
import type { LearnerMemory } from "./types"

type LearnerMemoryMaintenanceReport = {
  decayedMemoryIds: string[]
  staleMemoryIds: string[]
  supersededMemoryIds: string[]
  repairedFiles: string[]
  indexPath: string
  workingSummaryPath: string
  workingMemoryPath: string
}

function canonicalKey(memory: LearnerMemory): string {
  return [memory.type, memory.tags[0] ?? "untagged", memory.title]
    .join(":")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
}

function ageDays(memory: LearnerMemory): number {
  const timestamp = Date.parse(memory.lastUsedAt ?? memory.updatedAt)
  if (Number.isNaN(timestamp)) return 0
  return Math.max(0, (Date.now() - timestamp) / MILLISECONDS_PER_DAY)
}

function decayAmount(memory: LearnerMemory): number {
  const days = ageDays(memory)
  if (
    days < LEARNER_MEMORY_MAINTENANCE_TUNING.decayMinAgeDays ||
    memory.pinned ||
    memory.memoryType === "flashbulb"
  ) {
    return 0
  }
  switch (memory.memoryType) {
    case "semantic":
      return Math.min(
        LEARNER_MEMORY_MAINTENANCE_TUNING.semanticMaxDecay,
        days / LEARNER_MEMORY_MAINTENANCE_TUNING.semanticDecayDivisorDays,
      )
    case "procedural":
      return Math.min(
        LEARNER_MEMORY_MAINTENANCE_TUNING.proceduralMaxDecay,
        days / LEARNER_MEMORY_MAINTENANCE_TUNING.proceduralDecayDivisorDays,
      )
    case "episodic":
      return Math.min(
        LEARNER_MEMORY_MAINTENANCE_TUNING.episodicMaxDecay,
        days / LEARNER_MEMORY_MAINTENANCE_TUNING.episodicDecayDivisorDays,
      )
  }
}

async function runDecayPass(directory: string): Promise<{
  decayedMemoryIds: string[]
  staleMemoryIds: string[]
}> {
  const decayedMemoryIds: string[] = []
  const staleMemoryIds: string[] = []
  const memories = await listLearnerMemories(directory)

  for (const memory of memories) {
    if (memory.status !== "active") continue
    const amount = decayAmount(memory)
    if (amount === 0) continue

    const decayed = await decayLearnerMemory({
      directory,
      memoryId: memory.id,
      reason: "Scheduled learner memory retention pass",
      amount,
    })
    if (!decayed) continue

    decayedMemoryIds.push(decayed.id)
    if (decayed.strength <= LEARNER_MEMORY_MAINTENANCE_TUNING.staleStrengthThreshold) {
      const stale = await markLearnerMemoryStale({
        directory,
        memoryId: decayed.id,
        reason: "Memory strength dropped below stale threshold",
      })
      if (stale) staleMemoryIds.push(stale.id)
    }
  }

  return { decayedMemoryIds, staleMemoryIds }
}

async function runConsolidationPass(directory: string): Promise<string[]> {
  const memories = (await listLearnerMemories(directory)).filter(
    (memory) => memory.status === "active",
  )
  const byKey = new Map<string, LearnerMemory[]>()

  for (const memory of memories) {
    const key = canonicalKey(memory)
    const existing = byKey.get(key) ?? []
    existing.push(memory)
    byKey.set(key, existing)
  }

  const supersededMemoryIds: string[] = []
  for (const duplicateGroup of byKey.values()) {
    if (duplicateGroup.length < LEARNER_MEMORY_MAINTENANCE_TUNING.duplicateGroupMinimumSize) {
      continue
    }

    const [winner, ...rest] = duplicateGroup.toSorted((left, right) => {
      const strengthOrder = right.strength - left.strength
      if (strengthOrder !== 0) return strengthOrder
      return right.updatedAt.localeCompare(left.updatedAt)
    })
    if (!winner) continue

    for (const memory of rest) {
      const superseded = await supersedeLearnerMemory({
        directory,
        memoryId: memory.id,
        supersededById: winner.id,
        reason: "Duplicate learner memory consolidated by canonical key",
      })
      if (superseded) supersededMemoryIds.push(superseded.id)
    }
  }

  return supersededMemoryIds
}

async function repairGeneratedLearnerMemoryFiles(directory: string): Promise<string[]> {
  const [workingSummaryExists, workingRegistryExists] = await Promise.all([
    fs
      .access(LearnerMemoryPath.workingSummaryFile(directory))
      .then(() => true)
      .catch(() => false),
    fs
      .access(LearnerMemoryPath.workingMemoryFile(directory))
      .then(() => true)
      .catch(() => false),
  ])

  if (workingSummaryExists && workingRegistryExists) return []

  await appendLearnerEvent(
    directory,
    createLearnerEvent({
      type: "memory_repaired",
      sourceKind: "maintenance",
      searchableText: "Learner working memory files checked for repair.",
      payload: { workingSummaryExists, workingRegistryExists },
    }),
  )
  return [
    ...(!workingSummaryExists ? [LearnerMemoryPath.workingSummaryFile(directory)] : []),
    ...(!workingRegistryExists ? [LearnerMemoryPath.workingMemoryFile(directory)] : []),
  ]
}

async function runLearnerMemoryMaintenance(
  directory: string,
): Promise<LearnerMemoryMaintenanceReport> {
  const { decayedMemoryIds, staleMemoryIds } = await runDecayPass(directory)
  const supersededMemoryIds = await runConsolidationPass(directory)
  const generatedRepairFiles = await repairGeneratedLearnerMemoryFiles(directory)
  const markdown = await regenerateLearnerMemoryMarkdown(directory)
  const index = await rebuildLearnerMemoryIndex(directory)

  return {
    decayedMemoryIds,
    staleMemoryIds,
    supersededMemoryIds,
    repairedFiles: generatedRepairFiles,
    indexPath: index.indexPath,
    workingSummaryPath: markdown.summaryPath,
    workingMemoryPath: markdown.registryPath,
  }
}

export { runLearnerMemoryMaintenance }
export type { LearnerMemoryMaintenanceReport }
