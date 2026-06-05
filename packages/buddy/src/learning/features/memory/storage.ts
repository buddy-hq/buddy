import fs from "node:fs/promises"
import { ulid } from "ulid"
import { writeJsonFileAtomic, writeTextFileAtomic } from "../../../storage/atomic-file"
import { rebuildLearnerMemoryIndex } from "./index-store"
import {
  parseLearnerMemoryRegistry,
  parseLearnerMemoryRegistryMarkdown,
  renderRegistryMarkdown,
  type LearnerMemoryRegistryParseResult,
} from "./memory-registry-markdown"
import {
  CandidateMemoryPatchSchema,
  LearnerEventSchema,
  LearnerMemorySchema,
  type CandidateMemoryPatch,
  type LearnerEvent,
  type LearnerMemory,
  type LearnerMemorySource,
  type LearnerMemoryType,
  type LearnerMemoryStatus,
  type LearnerMemoryRetentionType,
} from "./types"
import { LearnerMemoryPath } from "./paths"
import { LEARNER_MEMORY_STORAGE_TUNING } from "./tuning"

function retentionTypeForPedagogyKind(type: LearnerMemoryType): LearnerMemoryRetentionType {
  switch (type) {
    case "preference":
    case "constraint":
      return "procedural"
    case "evidence":
      return "flashbulb"
    case "project_context":
      return "episodic"
    case "goal":
    case "fragile_skill":
    case "misconception":
    case "open_loop":
      return "semantic"
  }
}

async function ensureLearnerMemoryLayout(directory: string): Promise<void> {
  await Promise.all([
    fs.mkdir(LearnerMemoryPath.root(directory), { recursive: true }),
    fs.mkdir(LearnerMemoryPath.eventsDirectory(directory), { recursive: true }),
    fs.mkdir(LearnerMemoryPath.evidenceDirectory(directory), { recursive: true }),
    fs.mkdir(LearnerMemoryPath.reportsDirectory(directory), { recursive: true }),
    fs.mkdir(LearnerMemoryPath.sessionSummariesDirectory(directory), { recursive: true }),
  ])
  await fs.rm(LearnerMemoryPath.memoriesDirectory(directory), { recursive: true, force: true })
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeJsonFileAtomic(filePath, value, LEARNER_MEMORY_STORAGE_TUNING.jsonIndentSpaces)
}

async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown
}

function eventYearMonth(createdAt: string): string {
  return createdAt.slice(0, LEARNER_MEMORY_STORAGE_TUNING.eventFileDateLength)
}

function createLearnerEvent(input: {
  type: LearnerEvent["type"]
  sourceKind: string
  searchableText: string
  payload?: Record<string, unknown>
  sessionId?: string
  projectPath?: string
  sourceId?: string
}): LearnerEvent {
  const createdAt = new Date().toISOString()
  return LearnerEventSchema.parse({
    id: `evt_${ulid()}`,
    schemaVersion: 1,
    type: input.type,
    createdAt,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.projectPath ? { projectPath: input.projectPath } : {}),
    sourceKind: input.sourceKind,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    payload: input.payload ?? {},
    searchableText: input.searchableText,
  })
}

async function appendLearnerEvent(directory: string, event: LearnerEvent): Promise<void> {
  await ensureLearnerMemoryLayout(directory)
  await fs.appendFile(
    LearnerMemoryPath.eventFile(directory, eventYearMonth(event.createdAt)),
    `${JSON.stringify(LearnerEventSchema.parse(event))}\n`,
    "utf8",
  )
  try {
    await rebuildLearnerMemoryIndex(directory)
  } catch (error) {
    await fs.rm(LearnerMemoryPath.indexFile(directory), { force: true }).catch(() => undefined)
    throw error
  }
}

async function readWorkingMemoryRegistry(
  directory: string,
): Promise<LearnerMemoryRegistryParseResult> {
  const markdown = await fs
    .readFile(LearnerMemoryPath.workingMemoryFile(directory), "utf8")
    .catch(() => "")
  return parseLearnerMemoryRegistry(markdown)
}

async function writeLearnerMemory(directory: string, memory: LearnerMemory): Promise<void> {
  await ensureLearnerMemoryLayout(directory)
  const parsedMemory = LearnerMemorySchema.parse(memory)
  const registry = await readWorkingMemoryRegistry(directory)
  const withoutExisting = registry.memories.filter(
    (candidate) => candidate.id !== parsedMemory.id,
  )
  await writeTextFileAtomic(
    LearnerMemoryPath.workingMemoryFile(directory),
    renderRegistryMarkdown([...withoutExisting, parsedMemory], {
      invalidBlocks: registry.invalidBlocks,
    }),
  )
  await rebuildLearnerMemoryIndex(directory)
}

async function createLearnerMemory(input: {
  directory: string
  type: LearnerMemoryType
  title: string
  body: string
  tags: string[]
  projectPath?: string
  confidence?: number
  strength?: number
  status?: LearnerMemoryStatus
  source: LearnerMemorySource
  sourceEventIds?: string[]
  reason: string
}): Promise<LearnerMemory> {
  const now = new Date().toISOString()
  const memory = LearnerMemorySchema.parse({
    id: `mem_${ulid()}`,
    schemaVersion: 1,
    memoryType: retentionTypeForPedagogyKind(input.type),
    pedagogyKind: input.type,
    type: input.type,
    status: input.status ?? "active",
    pinned: false,
    title: input.title,
    body: input.body,
    tags: input.tags,
    ...(input.projectPath ? { projectPath: input.projectPath } : {}),
    confidence: input.confidence ?? 1,
    strength:
      input.strength ??
      (input.source === "learner_authored"
        ? LEARNER_MEMORY_STORAGE_TUNING.learnerAuthoredMemoryStrength
        : LEARNER_MEMORY_STORAGE_TUNING.defaultMemoryStrength),
    source: input.source,
    sourceEventIds: input.sourceEventIds ?? [],
    createdAt: now,
    updatedAt: now,
  })
  await writeLearnerMemory(input.directory, memory)
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_applied",
      sourceKind: input.source,
      sourceId: memory.id,
      searchableText: `Learner memory created: ${memory.title}`,
      payload: { reason: input.reason, memoryId: memory.id },
    }),
  )
  return memory
}

async function listLearnerMemories(directory: string): Promise<LearnerMemory[]> {
  await ensureLearnerMemoryLayout(directory)
  return (await readWorkingMemoryRegistry(directory)).memories
}

async function listConsolidatedLearnerMemories(directory: string): Promise<LearnerMemory[]> {
  await ensureLearnerMemoryLayout(directory)
  const markdown = await fs
    .readFile(LearnerMemoryPath.memoryRegistryFile(directory), "utf8")
    .catch(() => "")
  return parseLearnerMemoryRegistryMarkdown(markdown)
}

async function listSearchableLearnerMemories(directory: string): Promise<LearnerMemory[]> {
  const [workingMemories, consolidatedMemories] = await Promise.all([
    listLearnerMemories(directory),
    listConsolidatedLearnerMemories(directory),
  ])
  const workingIds = new Set(workingMemories.map((memory) => memory.id))
  return [
    ...workingMemories,
    ...consolidatedMemories.filter((memory) => !workingIds.has(memory.id)),
  ]
}

async function findLearnerMemory(input: {
  directory: string
  memoryId: string
}): Promise<LearnerMemory | undefined> {
  return (await listLearnerMemories(input.directory)).find(
    (candidate) => candidate.id === input.memoryId,
  )
}

async function writeCandidatePatches(
  directory: string,
  patches: readonly CandidateMemoryPatch[],
): Promise<void> {
  await ensureLearnerMemoryLayout(directory)
  const parsed = patches.map((patch) => CandidateMemoryPatchSchema.parse(patch))
  await writeJsonFile(LearnerMemoryPath.candidatePatchesFile(directory), parsed)
}

async function readCandidatePatches(directory: string): Promise<CandidateMemoryPatch[]> {
  const filePath = LearnerMemoryPath.candidatePatchesFile(directory)
  const raw = await readJsonFile(filePath).catch(() => [])
  return CandidateMemoryPatchSchema.array().parse(raw)
}

function memoryFromCandidate(input: {
  patch: CandidateMemoryPatch
  source: LearnerMemory["source"]
  projectPath?: string
}): LearnerMemory {
  const now = new Date().toISOString()
  return LearnerMemorySchema.parse({
    id: `mem_${ulid()}`,
    schemaVersion: 1,
    memoryType: retentionTypeForPedagogyKind(input.patch.memoryType),
    pedagogyKind: input.patch.memoryType,
    type: input.patch.memoryType,
    status: "active",
    pinned: false,
    title: input.patch.title,
    body: input.patch.body,
    tags: input.patch.tags,
    ...(input.projectPath ? { projectPath: input.projectPath } : {}),
    confidence: input.patch.confidence,
    strength: LEARNER_MEMORY_STORAGE_TUNING.defaultMemoryStrength,
    source: input.source,
    sourceEventIds: input.patch.sourceEventIds,
    createdAt: now,
    updatedAt: now,
  })
}

async function updateLearnerMemoryStatus(input: {
  directory: string
  memoryId: string
  status: LearnerMemoryStatus
  eventType: "memory_hidden" | "memory_rejected" | "memory_resolved" | "memory_stale"
  sourceKind: string
  reason: string
}): Promise<LearnerMemory | undefined> {
  const memory = await findLearnerMemory(input)
  if (!memory) return undefined

  const updated = LearnerMemorySchema.parse({
    ...memory,
    status: input.status,
    updatedAt: new Date().toISOString(),
  })
  await writeLearnerMemory(input.directory, updated)
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: input.eventType,
      sourceKind: input.sourceKind,
      sourceId: input.memoryId,
      searchableText: `Memory ${input.status}: ${memory.title}`,
      payload: { reason: input.reason },
    }),
  )
  return updated
}

async function hideLearnerMemory(input: {
  directory: string
  memoryId: string
  reason: string
}): Promise<LearnerMemory | undefined> {
  return updateLearnerMemoryStatus({
    ...input,
    status: "hidden",
    eventType: "memory_hidden",
    sourceKind: "debug",
  })
}

async function rejectLearnerMemory(input: {
  directory: string
  memoryId: string
  reason: string
  sourceKind?: string
}): Promise<LearnerMemory | undefined> {
  return updateLearnerMemoryStatus({
    ...input,
    status: "rejected",
    eventType: "memory_rejected",
    sourceKind: input.sourceKind ?? "learner_correction",
  })
}

async function resolveLearnerMemory(input: {
  directory: string
  memoryId: string
  reason: string
  sourceKind?: string
}): Promise<LearnerMemory | undefined> {
  return updateLearnerMemoryStatus({
    ...input,
    status: "resolved",
    eventType: "memory_resolved",
    sourceKind: input.sourceKind ?? "learner_correction",
  })
}

async function markLearnerMemoryStale(input: {
  directory: string
  memoryId: string
  reason: string
}): Promise<LearnerMemory | undefined> {
  return updateLearnerMemoryStatus({
    ...input,
    status: "stale",
    eventType: "memory_stale",
    sourceKind: "decay",
  })
}

async function editLearnerMemory(input: {
  directory: string
  memoryId: string
  title?: string
  body?: string
  tags?: string[]
  projectPath?: string
  reason: string
}): Promise<LearnerMemory | undefined> {
  const memory = await findLearnerMemory(input)
  if (!memory) return undefined

  const updated = LearnerMemorySchema.parse({
    ...memory,
    ...(input.title ? { title: input.title } : {}),
    ...(input.body ? { body: input.body } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.projectPath ? { projectPath: input.projectPath } : {}),
    updatedAt: new Date().toISOString(),
  })
  await writeLearnerMemory(input.directory, updated)
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_edited",
      sourceKind: "learner_correction",
      sourceId: input.memoryId,
      searchableText: `Memory edited: ${updated.title}`,
      payload: { reason: input.reason },
    }),
  )
  return updated
}

async function pinLearnerMemory(input: {
  directory: string
  memoryId: string
  pinned: boolean
  reason: string
}): Promise<LearnerMemory | undefined> {
  const memory = await findLearnerMemory(input)
  if (!memory) return undefined

  const updated = LearnerMemorySchema.parse({
    ...memory,
    pinned: input.pinned,
    strength: input.pinned
      ? Math.max(memory.strength, LEARNER_MEMORY_STORAGE_TUNING.learnerAuthoredMemoryStrength)
      : memory.strength,
    updatedAt: new Date().toISOString(),
  })
  await writeLearnerMemory(input.directory, updated)
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: input.pinned ? "memory_pinned" : "memory_unpinned",
      sourceKind: "learner_correction",
      sourceId: input.memoryId,
      searchableText: `Memory ${input.pinned ? "pinned" : "unpinned"}: ${memory.title}`,
      payload: { reason: input.reason, pinned: input.pinned },
    }),
  )
  return updated
}

async function supersedeLearnerMemory(input: {
  directory: string
  memoryId: string
  supersededById: string
  reason: string
}): Promise<LearnerMemory | undefined> {
  const memory = await findLearnerMemory(input)
  if (!memory) return undefined

  const updated = LearnerMemorySchema.parse({
    ...memory,
    status: "stale",
    supersededById: input.supersededById,
    updatedAt: new Date().toISOString(),
  })
  await writeLearnerMemory(input.directory, updated)
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_superseded",
      sourceKind: "consolidation",
      sourceId: input.memoryId,
      searchableText: `Memory superseded: ${memory.title}`,
      payload: { reason: input.reason, supersededById: input.supersededById },
    }),
  )
  return updated
}

async function strengthenLearnerMemory(input: {
  directory: string
  memoryId: string
  sourceKind: string
  amount?: number
}): Promise<LearnerMemory | undefined> {
  const memory = await findLearnerMemory(input)
  if (!memory) return undefined

  const now = new Date().toISOString()
  const strength = Math.min(
    1,
    memory.strength + (input.amount ?? LEARNER_MEMORY_STORAGE_TUNING.memorySearchStrengthBoost),
  )
  const updated = LearnerMemorySchema.parse({
    ...memory,
    strength,
    lastUsedAt: now,
    updatedAt: now,
  })
  await writeLearnerMemory(input.directory, updated)
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_strengthened",
      sourceKind: input.sourceKind,
      sourceId: input.memoryId,
      searchableText: `Memory strengthened: ${memory.title}`,
      payload: {
        amount: input.amount ?? LEARNER_MEMORY_STORAGE_TUNING.memorySearchStrengthBoost,
        strength,
      },
    }),
  )
  return updated
}

async function decayLearnerMemory(input: {
  directory: string
  memoryId: string
  reason: string
  amount?: number
}): Promise<LearnerMemory | undefined> {
  const memory = await findLearnerMemory(input)
  if (!memory) return undefined

  const amount = input.amount ?? LEARNER_MEMORY_STORAGE_TUNING.memoryDecayAmount
  const strength = Math.max(0, memory.strength - amount)
  const updated = LearnerMemorySchema.parse({
    ...memory,
    strength,
    updatedAt: new Date().toISOString(),
  })
  await writeLearnerMemory(input.directory, updated)
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_decayed",
      sourceKind: "decay",
      sourceId: input.memoryId,
      searchableText: `Memory decayed: ${memory.title}`,
      payload: { reason: input.reason, amount, strength },
    }),
  )
  return updated
}

async function deleteLearnerMemory(input: {
  directory: string
  memoryId: string
  reason: string
}): Promise<boolean> {
  const memory = await findLearnerMemory(input)
  if (!memory) return false

  const memories = (await listLearnerMemories(input.directory)).filter(
    (candidate) => candidate.id !== input.memoryId,
  )
  const registry = await readWorkingMemoryRegistry(input.directory)
  await writeTextFileAtomic(
    LearnerMemoryPath.workingMemoryFile(input.directory),
    renderRegistryMarkdown(memories, { invalidBlocks: registry.invalidBlocks }),
  )
  await rebuildLearnerMemoryIndex(input.directory)
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_deleted",
      sourceKind: "learner_correction",
      sourceId: input.memoryId,
      searchableText: `Memory deleted: ${memory.title}`,
      payload: { reason: input.reason },
    }),
  )
  return true
}

async function resetLearnerMemory(input: { directory: string; reason: string }): Promise<void> {
  await ensureLearnerMemoryLayout(input.directory)
  await Promise.all([
    fs.rm(LearnerMemoryPath.workingMemoryFile(input.directory), { force: true }),
    fs.rm(LearnerMemoryPath.workingSummaryFile(input.directory), { force: true }),
  ])
  await rebuildLearnerMemoryIndex(input.directory)
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_reset",
      sourceKind: "learner_correction",
      searchableText: "Learner memory reset.",
      payload: { reason: input.reason },
    }),
  )
}

export {
  appendLearnerEvent,
  createLearnerEvent,
  createLearnerMemory,
  decayLearnerMemory,
  deleteLearnerMemory,
  editLearnerMemory,
  ensureLearnerMemoryLayout,
  findLearnerMemory,
  hideLearnerMemory,
  listConsolidatedLearnerMemories,
  listLearnerMemories,
  listSearchableLearnerMemories,
  markLearnerMemoryStale,
  memoryFromCandidate,
  pinLearnerMemory,
  readCandidatePatches,
  rejectLearnerMemory,
  resetLearnerMemory,
  resolveLearnerMemory,
  strengthenLearnerMemory,
  supersedeLearnerMemory,
  writeCandidatePatches,
  writeJsonFile,
  writeLearnerMemory,
}
