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
import { withLearnerMemoryMutationLock } from "./mutation-lock"
import { withRecoveredConsolidationPublication } from "./consolidation-publication"
import { listLearnerEventRecords } from "./evidence"

type CreateLearnerMemoryRecordInput = {
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
}

type AtomicLearnerMemoryUpsertResult = {
  created: boolean
  memory: LearnerMemory
}

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
  id?: string
  createdAt?: string
  type: LearnerEvent["type"]
  sourceKind: string
  searchableText: string
  payload?: Record<string, unknown>
  sessionId?: string
  projectPath?: string
  sourceId?: string
}): LearnerEvent {
  const createdAt = input.createdAt ?? new Date().toISOString()
  return LearnerEventSchema.parse(
    Object.assign(
      {
        id: input.id ?? `evt_${ulid()}`,
        schemaVersion: 1 as const,
        type: input.type,
        createdAt,
        sourceKind: input.sourceKind,
        payload: input.payload ?? {},
        searchableText: input.searchableText,
      },
      input.sessionId ? { sessionId: input.sessionId } : undefined,
      input.projectPath ? { projectPath: input.projectPath } : undefined,
      input.sourceId ? { sourceId: input.sourceId } : undefined,
    ),
  )
}

async function appendLearnerEventInternal(input: {
  directory: string
  event: LearnerEvent
  onlyIfMissing: boolean
}): Promise<void> {
  const parsedEvent = LearnerEventSchema.parse(input.event)
  await withLearnerMemoryMutationLock(input.directory, async () => {
    await ensureLearnerMemoryLayout(input.directory)
    const eventFile = LearnerMemoryPath.eventFile(
      input.directory,
      eventYearMonth(parsedEvent.createdAt),
    )
    const exists =
      input.onlyIfMissing &&
      (await listLearnerEventRecords(input.directory)).some(
        (record) => record.event.id === parsedEvent.id,
      )
    if (!exists) {
      await fs.appendFile(eventFile, `${JSON.stringify(parsedEvent)}\n`, "utf8")
    }
    try {
      await rebuildLearnerMemoryIndex(input.directory)
    } catch (error) {
      await fs
        .rm(LearnerMemoryPath.indexFile(input.directory), { force: true })
        .catch(() => undefined)
      throw error
    }
  })
}

async function appendLearnerEvent(directory: string, event: LearnerEvent): Promise<void> {
  await appendLearnerEventInternal({ directory, event, onlyIfMissing: false })
}

async function appendLearnerEventOnce(directory: string, event: LearnerEvent): Promise<void> {
  await appendLearnerEventInternal({ directory, event, onlyIfMissing: true })
}

async function readWorkingMemoryRegistry(
  directory: string,
): Promise<LearnerMemoryRegistryParseResult> {
  const markdown = await fs
    .readFile(LearnerMemoryPath.workingMemoryFile(directory), "utf8")
    .catch(() => "")
  return parseLearnerMemoryRegistry(markdown)
}

async function writeLearnerMemoryUnlocked(directory: string, memory: LearnerMemory): Promise<void> {
  await ensureLearnerMemoryLayout(directory)
  const parsedMemory = LearnerMemorySchema.parse(memory)
  const registry = await readWorkingMemoryRegistry(directory)
  const withoutExisting = registry.memories.filter((candidate) => candidate.id !== parsedMemory.id)
  await writeTextFileAtomic(
    LearnerMemoryPath.workingMemoryFile(directory),
    renderRegistryMarkdown([...withoutExisting, parsedMemory], {
      invalidBlocks: registry.invalidBlocks,
    }),
  )
  await rebuildLearnerMemoryIndex(directory)
}

async function writeLearnerMemory(directory: string, memory: LearnerMemory): Promise<void> {
  await withLearnerMemoryMutationLock(directory, () =>
    writeLearnerMemoryUnlocked(directory, memory),
  )
}

function createLearnerMemoryRecord(input: CreateLearnerMemoryRecordInput): LearnerMemory {
  const now = new Date().toISOString()
  return LearnerMemorySchema.parse(
    Object.assign(
      {
        id: `mem_${ulid()}`,
        schemaVersion: 1 as const,
        memoryType: retentionTypeForPedagogyKind(input.type),
        pedagogyKind: input.type,
        type: input.type,
        status: input.status ?? "active",
        pinned: false,
        title: input.title,
        body: input.body,
        tags: input.tags,
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
      },
      input.projectPath ? { projectPath: input.projectPath } : undefined,
    ),
  )
}

async function upsertLearnerMemoryAtomically(input: {
  directory: string
  find: (memories: readonly LearnerMemory[]) => LearnerMemory | undefined
  create: () => LearnerMemory
  update: (memory: LearnerMemory) => LearnerMemory
}): Promise<AtomicLearnerMemoryUpsertResult> {
  return withLearnerMemoryMutationLock(input.directory, async () => {
    await ensureLearnerMemoryLayout(input.directory)
    const existing = input.find((await readWorkingMemoryRegistry(input.directory)).memories)
    const memory = LearnerMemorySchema.parse(existing ? input.update(existing) : input.create())
    if (existing && memory.id !== existing.id) {
      throw new Error(
        "An atomic learner-memory upsert cannot replace the selected memory identity.",
      )
    }
    await writeLearnerMemoryUnlocked(input.directory, memory)
    return { created: existing === undefined, memory }
  })
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
  const memory = createLearnerMemoryRecord(input)
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
  const markdown = await withRecoveredConsolidationPublication(directory, () =>
    fs.readFile(LearnerMemoryPath.memoryRegistryFile(directory), "utf8").catch(() => ""),
  )
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

type LearnerMemoryMutation = {
  previous: LearnerMemory
  updated: LearnerMemory
}

async function mutateLearnerMemory(input: {
  directory: string
  memoryId: string
  update: (memory: LearnerMemory) => LearnerMemory
}): Promise<LearnerMemoryMutation | undefined> {
  return withLearnerMemoryMutationLock(input.directory, async () => {
    const previous = await findLearnerMemory(input)
    if (!previous) return undefined

    const updated = LearnerMemorySchema.parse(input.update(previous))
    await writeLearnerMemoryUnlocked(input.directory, updated)
    return { previous, updated }
  })
}

async function writeCandidatePatches(
  directory: string,
  patches: readonly CandidateMemoryPatch[],
): Promise<void> {
  await withLearnerMemoryMutationLock(directory, async () => {
    await ensureLearnerMemoryLayout(directory)
    const parsed = patches.map((patch) => CandidateMemoryPatchSchema.parse(patch))
    await writeJsonFile(LearnerMemoryPath.candidatePatchesFile(directory), parsed)
  })
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
  return LearnerMemorySchema.parse(
    Object.assign(
      {
        id: `mem_${ulid()}`,
        schemaVersion: 1 as const,
        memoryType: retentionTypeForPedagogyKind(input.patch.memoryType),
        pedagogyKind: input.patch.memoryType,
        type: input.patch.memoryType,
        status: "active" as const,
        pinned: false,
        title: input.patch.title,
        body: input.patch.body,
        tags: input.patch.tags,
        confidence: input.patch.confidence,
        strength: LEARNER_MEMORY_STORAGE_TUNING.defaultMemoryStrength,
        source: input.source,
        sourceEventIds: input.patch.sourceEventIds,
        createdAt: now,
        updatedAt: now,
      },
      input.projectPath ? { projectPath: input.projectPath } : undefined,
    ),
  )
}

async function updateLearnerMemoryStatus(input: {
  directory: string
  memoryId: string
  status: LearnerMemoryStatus
  eventType: "memory_hidden" | "memory_rejected" | "memory_resolved" | "memory_stale"
  sourceKind: string
  reason: string
}): Promise<LearnerMemory | undefined> {
  const mutation = await mutateLearnerMemory({
    ...input,
    update: (memory) =>
      LearnerMemorySchema.parse({
        ...memory,
        status: input.status,
        updatedAt: new Date().toISOString(),
      }),
  })
  if (!mutation) return undefined
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: input.eventType,
      sourceKind: input.sourceKind,
      sourceId: input.memoryId,
      searchableText: `Memory ${input.status}: ${mutation.updated.title}`,
      payload: { reason: input.reason },
    }),
  )
  return mutation.updated
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
  const mutation = await mutateLearnerMemory({
    ...input,
    update: (memory) =>
      LearnerMemorySchema.parse(
        Object.assign(
          Object.assign(
            { ...memory },
            input.title ? { title: input.title } : undefined,
            input.body ? { body: input.body } : undefined,
            input.tags ? { tags: input.tags } : undefined,
          ),
          input.projectPath ? { projectPath: input.projectPath } : undefined,
          { updatedAt: new Date().toISOString() },
        ),
      ),
  })
  if (!mutation) return undefined
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_edited",
      sourceKind: "learner_correction",
      sourceId: input.memoryId,
      searchableText: `Memory edited: ${mutation.updated.title}`,
      payload: { reason: input.reason },
    }),
  )
  return mutation.updated
}

async function pinLearnerMemory(input: {
  directory: string
  memoryId: string
  pinned: boolean
  reason: string
}): Promise<LearnerMemory | undefined> {
  const mutation = await mutateLearnerMemory({
    ...input,
    update: (memory) =>
      LearnerMemorySchema.parse({
        ...memory,
        pinned: input.pinned,
        strength: input.pinned
          ? Math.max(memory.strength, LEARNER_MEMORY_STORAGE_TUNING.learnerAuthoredMemoryStrength)
          : memory.strength,
        updatedAt: new Date().toISOString(),
      }),
  })
  if (!mutation) return undefined
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: input.pinned ? "memory_pinned" : "memory_unpinned",
      sourceKind: "learner_correction",
      sourceId: input.memoryId,
      searchableText: `Memory ${input.pinned ? "pinned" : "unpinned"}: ${mutation.updated.title}`,
      payload: { reason: input.reason, pinned: input.pinned },
    }),
  )
  return mutation.updated
}

async function supersedeLearnerMemory(input: {
  directory: string
  memoryId: string
  supersededById: string
  reason: string
}): Promise<LearnerMemory | undefined> {
  const mutation = await mutateLearnerMemory({
    ...input,
    update: (memory) =>
      LearnerMemorySchema.parse({
        ...memory,
        status: "stale",
        supersededById: input.supersededById,
        updatedAt: new Date().toISOString(),
      }),
  })
  if (!mutation) return undefined
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_superseded",
      sourceKind: "consolidation",
      sourceId: input.memoryId,
      searchableText: `Memory superseded: ${mutation.updated.title}`,
      payload: { reason: input.reason, supersededById: input.supersededById },
    }),
  )
  return mutation.updated
}

async function strengthenLearnerMemory(input: {
  directory: string
  memoryId: string
  sourceKind: string
  amount?: number
}): Promise<LearnerMemory | undefined> {
  const mutation = await mutateLearnerMemory({
    ...input,
    update: (memory) => {
      const now = new Date().toISOString()
      return LearnerMemorySchema.parse({
        ...memory,
        strength: Math.min(
          1,
          memory.strength +
            (input.amount ?? LEARNER_MEMORY_STORAGE_TUNING.memorySearchStrengthBoost),
        ),
        lastUsedAt: now,
        updatedAt: now,
      })
    },
  })
  if (!mutation) return undefined
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_strengthened",
      sourceKind: input.sourceKind,
      sourceId: input.memoryId,
      searchableText: `Memory strengthened: ${mutation.updated.title}`,
      payload: {
        amount: input.amount ?? LEARNER_MEMORY_STORAGE_TUNING.memorySearchStrengthBoost,
        strength: mutation.updated.strength,
      },
    }),
  )
  return mutation.updated
}

async function decayLearnerMemory(input: {
  directory: string
  memoryId: string
  reason: string
  amount?: number
}): Promise<LearnerMemory | undefined> {
  const amount = input.amount ?? LEARNER_MEMORY_STORAGE_TUNING.memoryDecayAmount
  const mutation = await mutateLearnerMemory({
    ...input,
    update: (memory) =>
      LearnerMemorySchema.parse({
        ...memory,
        strength: Math.max(0, memory.strength - amount),
        updatedAt: new Date().toISOString(),
      }),
  })
  if (!mutation) return undefined
  await appendLearnerEvent(
    input.directory,
    createLearnerEvent({
      type: "memory_decayed",
      sourceKind: "decay",
      sourceId: input.memoryId,
      searchableText: `Memory decayed: ${mutation.updated.title}`,
      payload: { reason: input.reason, amount, strength: mutation.updated.strength },
    }),
  )
  return mutation.updated
}

async function deleteLearnerMemory(input: {
  directory: string
  memoryId: string
  reason: string
}): Promise<boolean> {
  const memory = await withLearnerMemoryMutationLock(input.directory, async () => {
    const current = await findLearnerMemory(input)
    if (!current) return undefined

    const memories = (await listLearnerMemories(input.directory)).filter(
      (candidate) => candidate.id !== input.memoryId,
    )
    const registry = await readWorkingMemoryRegistry(input.directory)
    await writeTextFileAtomic(
      LearnerMemoryPath.workingMemoryFile(input.directory),
      renderRegistryMarkdown(memories, { invalidBlocks: registry.invalidBlocks }),
    )
    await rebuildLearnerMemoryIndex(input.directory)
    return current
  })
  if (!memory) return false
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
  await withLearnerMemoryMutationLock(input.directory, async () => {
    await ensureLearnerMemoryLayout(input.directory)
    await Promise.all([
      fs.rm(LearnerMemoryPath.workingMemoryFile(input.directory), { force: true }),
      fs.rm(LearnerMemoryPath.workingSummaryFile(input.directory), { force: true }),
    ])
    await rebuildLearnerMemoryIndex(input.directory)
  })
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
  appendLearnerEventOnce,
  appendLearnerEvent,
  createLearnerMemoryRecord,
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
  upsertLearnerMemoryAtomically,
  writeCandidatePatches,
  writeJsonFile,
  writeLearnerMemory,
}
