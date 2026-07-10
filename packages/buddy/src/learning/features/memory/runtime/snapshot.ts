import fs from "node:fs/promises"
import { readProjectConfig } from "../../../../config/runtime/project-config.js"
import { listActiveGoals } from "../goals/storage"
import { LearnerMemoryPath } from "../paths"
import { readLearnerMemorySettings } from "../settings"
import { listLearnerMemories } from "../storage"
import { LEARNER_MEMORY_RUNTIME_TUNING } from "../tuning"
import type { LearnerMemory } from "../types"

type LearnerRuntimeSnapshot = {
  workspace: { label: string }
  goals: Array<{ id: string; statement: string; howToTest: string }>
  projectContext: Array<{ id: string; summary: string }>
  activeMisconceptions: Array<{ id: string; summary: string }>
  openFeedback: Array<{ id: string; requiredAction: string }>
  recentEvidence: Array<{ id: string; summary: string }>
  constraintsSummary: string[]
  baseMemorySummary: string[]
  defaultContextMemoryLimit: number
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  const parts = normalized.split("/").filter(Boolean)
  return parts.at(-1) ?? value
}

function memoryTimestamp(memory: LearnerMemory): number {
  const value = Date.parse(memory.lastUsedAt ?? memory.updatedAt)
  return Number.isNaN(value) ? 0 : value
}

function compareMemoryPriority(left: LearnerMemory, right: LearnerMemory): number {
  const pinOrder = Number(right.pinned) - Number(left.pinned)
  if (pinOrder !== 0) return pinOrder

  const strengthOrder = right.strength - left.strength
  if (strengthOrder !== 0) return strengthOrder

  const confidenceOrder = right.confidence - left.confidence
  if (confidenceOrder !== 0) return confidenceOrder

  const timestampOrder = memoryTimestamp(right) - memoryTimestamp(left)
  if (timestampOrder !== 0) return timestampOrder

  return left.id.localeCompare(right.id)
}

function prioritizedMemories(
  memories: readonly LearnerMemory[],
  predicate: (memory: LearnerMemory) => boolean,
  limit: number,
): LearnerMemory[] {
  return memories.filter(predicate).toSorted(compareMemoryPriority).slice(0, limit)
}

async function readBaseMemorySummary(directory: string): Promise<string[]> {
  const markdown = await fs
    .readFile(LearnerMemoryPath.summaryFile(directory), "utf8")
    .catch(() => "")
  return markdown
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => (line.startsWith("- ") ? line.slice(2).trim() : line))
    .filter(Boolean)
    .slice(0, LEARNER_MEMORY_RUNTIME_TUNING.baseMemorySummaryLineLimit)
}

async function buildLearnerRuntimeSnapshot(directory: string): Promise<LearnerRuntimeSnapshot> {
  const [projectConfig, activeGoals] = await Promise.all([
    readProjectConfig(directory).catch(() => undefined),
    listActiveGoals(directory).catch(() => []),
  ])
  const settings = projectConfig
    ? readLearnerMemorySettings(projectConfig)
    : {
        enabled: false,
        defaultContextMemoryLimit: LEARNER_MEMORY_RUNTIME_TUNING.baseMemorySummaryLineLimit,
      }
  const [memories, baseMemorySummary] = settings.enabled
    ? await Promise.all([
        listLearnerMemories(directory).catch(() => []),
        readBaseMemorySummary(directory).catch(() => []),
      ])
    : [[], []]
  const active = memories.filter((memory) => memory.status === "active")
  const goalRecords = activeGoals
    .slice(0, LEARNER_MEMORY_RUNTIME_TUNING.activeGoalLimit)
    .map((goal) => ({
      id: goal.id,
      statement: goal.statement,
      howToTest: goal.howToTest,
    }))
  const goalMemories = prioritizedMemories(
    active,
    (memory) => memory.type === "goal" || memory.type === "open_loop",
    Math.max(0, LEARNER_MEMORY_RUNTIME_TUNING.goalMemoryLimit - goalRecords.length),
  ).map((memory) => ({
    id: memory.id,
    statement: memory.title,
    howToTest: memory.body,
  }))

  return {
    workspace: {
      label: basename(directory),
    },
    goals: [...goalRecords, ...goalMemories],
    projectContext: prioritizedMemories(
      active,
      (memory) => memory.type === "project_context",
      LEARNER_MEMORY_RUNTIME_TUNING.projectContextLimit,
    ).map((memory) => ({
      id: memory.id,
      summary: memory.body,
    })),
    activeMisconceptions: prioritizedMemories(
      active,
      (memory) => memory.type === "misconception",
      LEARNER_MEMORY_RUNTIME_TUNING.misconceptionLimit,
    ).map((memory) => ({
      id: memory.id,
      summary: memory.body,
    })),
    openFeedback: prioritizedMemories(
      active,
      (memory) => memory.type === "fragile_skill" || memory.type === "open_loop",
      LEARNER_MEMORY_RUNTIME_TUNING.openFeedbackLimit,
    ).map((memory) => ({
      id: memory.id,
      requiredAction: memory.body,
    })),
    recentEvidence: prioritizedMemories(
      active,
      (memory) => memory.type === "evidence",
      LEARNER_MEMORY_RUNTIME_TUNING.recentEvidenceLimit,
    ).map((memory) => ({
      id: memory.id,
      summary: memory.body,
    })),
    constraintsSummary: prioritizedMemories(
      active,
      (memory) => memory.type === "preference" || memory.type === "constraint",
      LEARNER_MEMORY_RUNTIME_TUNING.constraintLimit,
    ).map((memory) => `${memory.title}: ${memory.body}`),
    baseMemorySummary,
    defaultContextMemoryLimit: settings.defaultContextMemoryLimit,
  }
}

export { buildLearnerRuntimeSnapshot }
export type { LearnerRuntimeSnapshot }
