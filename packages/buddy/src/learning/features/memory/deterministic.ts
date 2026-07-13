import { createHash } from "node:crypto"
import path from "node:path"
import {
  appendLearnerEventOnce,
  createLearnerEvent,
  createLearnerMemoryRecord,
  upsertLearnerMemoryAtomically,
} from "./storage"
import { LearnerMemorySchema, type LearnerMemory, type LearnerMemoryType } from "./types"

const ACTIVE_MEMORY_STATUSES = new Set<LearnerMemory["status"]>(["active", "resolved", "stale"])
const DETERMINISTIC_MEMORY_EFFECT_EVENT_NAMESPACE = "deterministic_memory_effect"

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))]
}

function primaryTopicLabel(tags: readonly string[], fallback: string): string {
  const primaryTag = tags.find((tag) => tag.trim().length > 0)
  return primaryTag ? primaryTag.trim() : fallback.trim()
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, "/")
  const parts = normalized.split("/").filter(Boolean)
  return parts.at(-1) ?? path.basename(value)
}

function matchingDeterministicMemory(input: {
  memories: readonly LearnerMemory[]
  type: LearnerMemoryType
  title: string
  projectPath?: string
}): LearnerMemory | undefined {
  return input.memories.find(
    (memory) =>
      ACTIVE_MEMORY_STATUSES.has(memory.status) &&
      memory.type === input.type &&
      memory.title === input.title &&
      memory.projectPath === input.projectPath,
  )
}

function deterministicMemoryEffectEventID(sourceEventID: string): string {
  const digest = createHash("sha256")
    .update(`${DETERMINISTIC_MEMORY_EFFECT_EVENT_NAMESPACE}\u0000${sourceEventID}`)
    .digest("hex")
  return `evt_${DETERMINISTIC_MEMORY_EFFECT_EVENT_NAMESPACE}_${digest}`
}

async function upsertDeterministicLearnerMemory(input: {
  directory: string
  type: LearnerMemoryType
  title: string
  body: string
  tags: string[]
  projectPath?: string
  confidence: number
  sourceEventId: string
  reason: string
  strengthFloor: number
  status?: Extract<LearnerMemory["status"], "active" | "resolved">
}): Promise<LearnerMemory> {
  const result = await upsertLearnerMemoryAtomically({
    directory: input.directory,
    find: (memories) =>
      matchingDeterministicMemory({
        memories,
        type: input.type,
        title: input.title,
        projectPath: input.projectPath,
      }),
    create: () =>
      createLearnerMemoryRecord({
        type: input.type,
        title: input.title,
        body: input.body,
        tags: dedupeStrings(input.tags),
        projectPath: input.projectPath,
        confidence: input.confidence,
        strength: input.strengthFloor,
        status: input.status ?? "active",
        source: "deterministic",
        sourceEventIds: [input.sourceEventId],
      }),
    update: (existing) => {
      const now = new Date().toISOString()
      return LearnerMemorySchema.parse({
        ...existing,
        body: input.body,
        tags: dedupeStrings([...existing.tags, ...input.tags]),
        confidence: Math.max(existing.confidence, input.confidence),
        strength: Math.max(existing.strength, input.strengthFloor),
        status: input.status ?? (existing.status === "resolved" ? "resolved" : "active"),
        source: "deterministic",
        sourceEventIds: dedupeStrings([...existing.sourceEventIds, input.sourceEventId]),
        lastUsedAt: now,
        updatedAt: now,
      })
    },
  })
  await appendLearnerEventOnce(
    input.directory,
    createLearnerEvent({
      id: deterministicMemoryEffectEventID(input.sourceEventId),
      type: "memory_applied",
      projectPath: input.projectPath,
      sourceKind: "deterministic",
      sourceId: result.memory.id,
      searchableText: `Deterministic learner memory ${result.created ? "created" : "updated"}: ${result.memory.title}`,
      payload: {
        reason: input.reason,
        memoryId: result.memory.id,
        sourceEventId: input.sourceEventId,
      },
    }),
  )
  return result.memory
}

async function recordQuestionSetAttemptMemory(input: {
  directory: string
  eventId: string
  title: string
  groupType: string
  totalQuestions: number
  correctQuestions: number
  tags: string[]
  projectPath?: string
}): Promise<LearnerMemory> {
  const perfect = input.correctQuestions === input.totalQuestions
  const memoryType: LearnerMemoryType = perfect ? "evidence" : "fragile_skill"
  const memoryTitle = `${perfect ? "Question-set evidence" : "Question-set fragile skill"}: ${input.title}`
  const memoryBody = perfect
    ? `${input.title} is now demonstrated with a perfect ${input.groupType} question-set result (${input.correctQuestions}/${input.totalQuestions} correct).`
    : `${input.title} still needs reinforcement after a ${input.groupType} question-set result of ${input.correctQuestions}/${input.totalQuestions} correct.`

  return upsertDeterministicLearnerMemory({
    directory: input.directory,
    type: memoryType,
    title: memoryTitle,
    body: memoryBody,
    tags: dedupeStrings([input.title, ...input.tags]),
    projectPath: input.projectPath,
    confidence: perfect ? 0.86 : input.correctQuestions > 0 ? 0.8 : 0.9,
    sourceEventId: input.eventId,
    reason: "Question-set attempt recorded as deterministic learner evidence",
    strengthFloor: perfect ? 0.78 : input.correctQuestions > 0 ? 0.72 : 0.82,
  })
}

async function recordFlashcardReviewMemory(input: {
  directory: string
  eventId: string
  deckTitle: string
  tags: string[]
  rating: string
  previousState: string
  newState: string
  isLeech: boolean
  projectPath?: string
}): Promise<LearnerMemory | undefined> {
  const topic = primaryTopicLabel(input.tags, input.deckTitle)

  if (input.isLeech) {
    return upsertDeterministicLearnerMemory({
      directory: input.directory,
      type: "open_loop",
      title: `Flashcard review loop: ${topic}`,
      body: `${topic} now needs targeted review because flashcard outcomes have become leech-like (${input.previousState} -> ${input.newState}).`,
      tags: dedupeStrings([topic, input.deckTitle, ...input.tags]),
      projectPath: input.projectPath,
      confidence: 0.84,
      sourceEventId: input.eventId,
      reason: "Flashcard leech behavior recorded as a deterministic open review loop",
      strengthFloor: 0.82,
    })
  }

  if (input.rating === "again") {
    return upsertDeterministicLearnerMemory({
      directory: input.directory,
      type: "fragile_skill",
      title: `Flashcard fragile skill: ${topic}`,
      body: `${topic} remains fragile because the learner rated the flashcard again (${input.previousState} -> ${input.newState}).`,
      tags: dedupeStrings([topic, input.deckTitle, ...input.tags]),
      projectPath: input.projectPath,
      confidence: 0.76,
      sourceEventId: input.eventId,
      reason: "Flashcard again result recorded as deterministic fragile-skill evidence",
      strengthFloor: 0.74,
    })
  }

  if (input.newState === "review" && (input.rating === "good" || input.rating === "easy")) {
    return upsertDeterministicLearnerMemory({
      directory: input.directory,
      type: "evidence",
      title: `Flashcard evidence: ${topic}`,
      body: `${topic} showed stable flashcard recall with a ${input.rating} review result (${input.previousState} -> ${input.newState}).`,
      tags: dedupeStrings([topic, input.deckTitle, ...input.tags]),
      projectPath: input.projectPath,
      confidence: input.rating === "easy" ? 0.82 : 0.74,
      sourceEventId: input.eventId,
      reason: "Stable flashcard review recorded as deterministic evidence",
      strengthFloor: input.rating === "easy" ? 0.76 : 0.68,
    })
  }

  return undefined
}

async function recordCheckpointMemory(input: {
  directory: string
  eventId: string
  sessionID: string
  lessonFilePath: string
  revision: number
  changedSinceLastCheckpoint: boolean
  projectPath?: string
}): Promise<LearnerMemory | undefined> {
  if (!input.changedSinceLastCheckpoint) {
    return undefined
  }

  const lessonFile = basename(input.lessonFilePath)
  return upsertDeterministicLearnerMemory({
    directory: input.directory,
    type: "project_context",
    title: `Project context: ${lessonFile}`,
    body: `The learner made checkpointed progress in ${lessonFile} and the latest saved revision is ${input.revision}.`,
    tags: [lessonFile, input.sessionID, "teaching-checkpoint"],
    projectPath: input.projectPath,
    confidence: 0.68,
    sourceEventId: input.eventId,
    reason: "Checkpointed lesson progress recorded as deterministic project context",
    strengthFloor: 0.62,
  })
}

export { recordCheckpointMemory, recordFlashcardReviewMemory, recordQuestionSetAttemptMemory }
