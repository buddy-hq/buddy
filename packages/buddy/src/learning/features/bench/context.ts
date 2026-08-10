import path from "node:path"
import z from "zod"
import { BuddyObjectRefSchema, nonEmptyString } from "../../../objects"

const BENCH_CONTEXT_REGISTRY_LIMIT = 512
const BENCH_CONTEXT_HISTORY_LIMIT = 512
const BENCH_TARGET_KEY_PART_SEPARATOR = "\u0000"
const BENCH_TARGET_KEY_NULL_PART = "\u2400"
const BENCH_DRAWER_KIND_VALUES = [
  "search",
  "sources",
  "practice",
  "creations",
  "boards",
  "files",
  "skills",
] as const

const BenchContextStatusSchema = z.enum(["ready", "loading", "dirty", "error", "unavailable"])
const BenchDrawerKindSchema = z.enum(BENCH_DRAWER_KIND_VALUES)

const WorkspaceFileBenchTargetSchema = z
  .object({
    type: z.literal("workspace-file"),
    path: nonEmptyString,
    viewer: z.enum(["markdown", "file"]),
  })
  .strict()

const ObjectBenchTargetSchema = z
  .object({
    type: z.literal("object"),
    ref: BuddyObjectRefSchema,
    viewID: nonEmptyString,
  })
  .strict()

const BenchTargetSchema = z.discriminatedUnion("type", [
  WorkspaceFileBenchTargetSchema,
  ObjectBenchTargetSchema,
])

const PublishedWorkspaceFileBenchContextTargetSchema = z
  .object({
    type: z.literal("workspace-file"),
    title: nonEmptyString,
    workspaceRoot: nonEmptyString,
    path: nonEmptyString,
    absolutePath: nonEmptyString,
    route: nonEmptyString,
    status: BenchContextStatusSchema,
  })
  .strict()

const PublishedObjectBenchContextTargetSchema = z
  .object({
    type: z.literal("object"),
    title: nonEmptyString,
    workspaceRoot: nonEmptyString,
    ref: BuddyObjectRefSchema,
    viewID: nonEmptyString,
    route: nonEmptyString,
    status: BenchContextStatusSchema,
  })
  .strict()

const BenchContextTargetSchema = z.discriminatedUnion("type", [
  PublishedWorkspaceFileBenchContextTargetSchema,
  PublishedObjectBenchContextTargetSchema,
])

const BenchContextRefSchema = z
  .object({
    kind: z.enum(["file", "object", "resource", "tool", "url"]),
    value: z.string(),
    note: z.string(),
  })
  .strict()

const BenchDrawerContextSchema = z
  .object({
    kind: BenchDrawerKindSchema,
    presentation: z.literal("drawer"),
  })
  .strict()

const BenchTabSummarySchema = z
  .object({
    tabKey: nonEmptyString,
    title: nonEmptyString,
    target: BenchTargetSchema,
  })
  .strict()

const BenchReadContextClosedOutputSchema = z
  .object({
    status: z.literal("closed"),
  })
  .strict()

const BenchReadContextVisibleOutputSchema = z
  .object({
    status: z.literal("open"),
    visibility: z.literal("visible"),
    mode: z.enum(["docked", "floating"]),
    selectedTabKey: nonEmptyString,
    tabs: z.array(BenchTabSummarySchema),
    targetKey: nonEmptyString,
    target: BenchContextTargetSchema,
    drawer: BenchDrawerContextSchema.nullable(),
    metadata: z.array(z.string()),
    content: z.string(),
    refs: z.array(BenchContextRefSchema),
    hints: z.array(z.string()),
  })
  .strict()

const BenchReadContextParkedOutputSchema = z
  .object({
    status: z.literal("open"),
    visibility: z.literal("parked"),
    mode: z.enum(["docked", "floating"]),
    selectedTabKey: nonEmptyString,
    tabs: z.array(BenchTabSummarySchema),
    drawer: z.null(),
  })
  .strict()

const BenchReadContextOutputSchema = z.union([
  BenchReadContextClosedOutputSchema,
  BenchReadContextVisibleOutputSchema,
  BenchReadContextParkedOutputSchema,
])

const PublishBenchContextResponseSchema = z
  .object({
    revision: z.number().int().nonnegative(),
  })
  .strict()

const BenchClientLeaseIdentitySchema = z
  .object({
    instanceID: z.string().min(1),
    generation: z.number().int().nonnegative(),
    leaseEpoch: z.number().int().nonnegative(),
  })
  .strict()

const PublishBenchContextInputSchema = z
  .object({
    lease: BenchClientLeaseIdentitySchema,
    publicationSequence: z.number().int().positive(),
    idempotencyKey: z.string().min(1),
    value: BenchReadContextOutputSchema,
  })
  .strict()

const closedBenchContext = {
  status: "closed",
} as const

type BenchTarget = z.infer<typeof BenchTargetSchema>
type WorkspaceFileBenchTarget = z.infer<typeof WorkspaceFileBenchTargetSchema>
type ObjectBenchTarget = z.infer<typeof ObjectBenchTargetSchema>
type BenchClientLeaseIdentity = z.infer<typeof BenchClientLeaseIdentitySchema>
type BenchContextTarget = z.infer<typeof BenchContextTargetSchema>
type BenchDrawerContext = z.infer<typeof BenchDrawerContextSchema>
type BenchTabSummary = z.infer<typeof BenchTabSummarySchema>
type BenchReadContextOpenOutput = z.infer<typeof BenchReadContextVisibleOutputSchema>
type BenchReadContextParkedOutput = z.infer<typeof BenchReadContextParkedOutputSchema>
type BenchReadContextOutput = z.infer<typeof BenchReadContextOutputSchema>
type PublishBenchContextInput = z.infer<typeof PublishBenchContextInputSchema>
type PublishBenchContextResponse = z.infer<typeof PublishBenchContextResponseSchema>

type StoredBenchContextSnapshot = {
  revision: number
  value: BenchReadContextOutput
}

type StoredBenchContextEntry = {
  key: string
  directory: string
  sessionID: string
  snapshot: StoredBenchContextSnapshot
  acceptedWrites: Map<string, StoredBenchContextWrite>
  lastSequenceByLeaseKey: Map<string, number>
}

type StoredBenchContextWrite = {
  idempotencyKey: string
  leaseKey: string
  publicationSequence: number
  revision: number
}

type BenchContextSnapshotListener = (snapshot: StoredBenchContextSnapshot) => void

class BenchContextSnapshotMissingError extends Error {
  constructor(input: { directory: string; sessionID: string }) {
    super(`Bench context has not been synchronized for session ${input.sessionID}.`)
    this.name = "BenchContextSnapshotMissingError"
  }
}

class BenchContextWriteConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BenchContextWriteConflictError"
  }
}

const benchContextRegistry = new Map<string, StoredBenchContextEntry>()
const benchContextSnapshotListeners = new Map<string, Set<BenchContextSnapshotListener>>()

function benchContextRegistryKey(input: { directory: string; sessionID: string }): string {
  return `${path.resolve(input.directory)}::${input.sessionID}`
}

function touchBenchContextEntry(entry: StoredBenchContextEntry): void {
  benchContextRegistry.delete(entry.key)
  benchContextRegistry.set(entry.key, entry)
}

function evictOldestBenchContextEntriesIfNeeded(): void {
  while (benchContextRegistry.size > BENCH_CONTEXT_REGISTRY_LIMIT) {
    const oldest = benchContextRegistry.keys().next().value
    if (typeof oldest !== "string") return
    benchContextRegistry.delete(oldest)
  }
}

function benchContextLeaseKey(lease: BenchClientLeaseIdentity): string {
  return [lease.instanceID, String(lease.generation), String(lease.leaseEpoch)].join("\u0000")
}

function setBoundedContextHistoryEntry<Value>(
  history: Map<string, Value>,
  key: string,
  value: Value,
): void {
  history.delete(key)
  history.set(key, value)
  while (history.size > BENCH_CONTEXT_HISTORY_LIMIT) {
    const oldestKey = history.keys().next().value
    if (typeof oldestKey !== "string") return
    history.delete(oldestKey)
  }
}

function publishSequencedBenchContext(input: {
  directory: string
  sessionID: string
  body: PublishBenchContextInput
}): StoredBenchContextSnapshot {
  const body = PublishBenchContextInputSchema.parse(input.body)
  const key = benchContextRegistryKey(input)
  const current = benchContextRegistry.get(key)
  const accepted = current?.acceptedWrites.get(body.idempotencyKey)
  if (accepted) {
    if (
      accepted.leaseKey !== benchContextLeaseKey(body.lease) ||
      accepted.publicationSequence !== body.publicationSequence
    ) {
      throw new BenchContextWriteConflictError(
        "Bench context idempotency key was already used with different lease or sequence.",
      )
    }
    if (current) {
      setBoundedContextHistoryEntry(current.acceptedWrites, body.idempotencyKey, accepted)
      touchBenchContextEntry(current)
      return current.snapshot
    }
  }

  const leaseKey = benchContextLeaseKey(body.lease)
  const lastSequence = current?.lastSequenceByLeaseKey.get(leaseKey) ?? 0
  if (body.publicationSequence <= lastSequence) {
    throw new BenchContextWriteConflictError(
      "Bench context publication sequence is older than the accepted snapshot.",
    )
  }

  const snapshot = publishBenchContextSnapshot({
    directory: input.directory,
    sessionID: input.sessionID,
    value: body.value,
  })
  const entry = benchContextRegistry.get(key)
  if (!entry) return snapshot

  setBoundedContextHistoryEntry(entry.lastSequenceByLeaseKey, leaseKey, body.publicationSequence)
  setBoundedContextHistoryEntry(entry.acceptedWrites, body.idempotencyKey, {
    idempotencyKey: body.idempotencyKey,
    leaseKey,
    publicationSequence: body.publicationSequence,
    revision: snapshot.revision,
  })
  return snapshot
}

function publishBenchContextSnapshot(input: {
  directory: string
  sessionID: string
  value: BenchReadContextOutput
}): StoredBenchContextSnapshot {
  const key = benchContextRegistryKey(input)
  const current = benchContextRegistry.get(key)
  const snapshot = {
    revision: (current?.snapshot.revision ?? 0) + 1,
    value: BenchReadContextOutputSchema.parse(input.value),
  } satisfies StoredBenchContextSnapshot

  touchBenchContextEntry({
    key,
    directory: path.resolve(input.directory),
    sessionID: input.sessionID,
    snapshot,
    acceptedWrites: current?.acceptedWrites ?? new Map(),
    lastSequenceByLeaseKey: current?.lastSequenceByLeaseKey ?? new Map(),
  })
  evictOldestBenchContextEntriesIfNeeded()
  for (const listener of benchContextSnapshotListeners.get(key) ?? []) {
    listener(snapshot)
  }
  return snapshot
}

function readBenchContext(input: {
  directory: string
  sessionID: string
}): StoredBenchContextSnapshot {
  const key = benchContextRegistryKey(input)
  const entry = benchContextRegistry.get(key)
  if (!entry) {
    throw new BenchContextSnapshotMissingError(input)
  }
  touchBenchContextEntry(entry)
  return entry.snapshot
}

function readCurrentBenchContext(input: {
  directory: string
  sessionID: string
}): BenchReadContextOutput {
  return readBenchContext(input).value
}

function subscribeBenchContext(
  input: {
    directory: string
    sessionID: string
  },
  listener: BenchContextSnapshotListener,
): () => void {
  const key = benchContextRegistryKey(input)
  const listeners = benchContextSnapshotListeners.get(key) ?? new Set()
  listeners.add(listener)
  benchContextSnapshotListeners.set(key, listeners)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      benchContextSnapshotListeners.delete(key)
    }
  }
}

function clearBenchContextRegistry(): void {
  benchContextRegistry.clear()
  benchContextSnapshotListeners.clear()
}

function benchTargetKey(target: BenchTarget): string {
  const parsed = BenchTargetSchema.parse(target)
  if (parsed.type === "workspace-file") {
    return ["workspace-file", parsed.viewer, encodeURIComponent(parsed.path)].join(
      BENCH_TARGET_KEY_PART_SEPARATOR,
    )
  }

  return [
    "object",
    parsed.ref.kind,
    encodeURIComponent(parsed.ref.objectID),
    parsed.ref.revisionID ? encodeURIComponent(parsed.ref.revisionID) : BENCH_TARGET_KEY_NULL_PART,
    parsed.ref.itemID ? encodeURIComponent(parsed.ref.itemID) : BENCH_TARGET_KEY_NULL_PART,
    encodeURIComponent(parsed.viewID),
  ].join(BENCH_TARGET_KEY_PART_SEPARATOR)
}

const BenchReadContextInputSchema = z
  .object({
    responseFormat: z
      .enum(["context_only", "context_and_bench_screenshot", "bench_screenshot_only"])
      .describe(
        "Use context_only unless the Bench's visual appearance matters. context_and_bench_screenshot returns the context, temporary PNG path, and capture receipt. bench_screenshot_only returns only the temporary PNG path and capture receipt.",
      ),
    tabSearch: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Search every open Bench tab by title, path, tab key, one-based tab number such as 'tab 3', object kind, or object identifier. Omit to return the selected tab and recently opened tab summaries. Searching never focuses or reveals a tab and has no effect with bench_screenshot_only.",
      ),
  })
  .strict()

export {
  BENCH_CONTEXT_HISTORY_LIMIT,
  BENCH_DRAWER_KIND_VALUES,
  BenchContextRefSchema,
  BenchContextSnapshotMissingError,
  BenchContextStatusSchema,
  BenchContextTargetSchema,
  BenchContextWriteConflictError,
  BenchDrawerContextSchema,
  BenchDrawerKindSchema,
  BenchClientLeaseIdentitySchema,
  PublishBenchContextInputSchema,
  BenchReadContextClosedOutputSchema,
  BenchReadContextInputSchema,
  BenchReadContextParkedOutputSchema,
  BenchReadContextVisibleOutputSchema,
  BenchReadContextOutputSchema,
  BenchTabSummarySchema,
  BenchTargetSchema,
  ObjectBenchTargetSchema,
  PublishedObjectBenchContextTargetSchema,
  PublishedWorkspaceFileBenchContextTargetSchema,
  PublishBenchContextResponseSchema,
  WorkspaceFileBenchTargetSchema,
  benchTargetKey,
  clearBenchContextRegistry,
  closedBenchContext,
  publishSequencedBenchContext,
  readBenchContext,
  readCurrentBenchContext,
  subscribeBenchContext,
}

export type {
  BenchClientLeaseIdentity,
  BenchContextTarget,
  BenchDrawerContext,
  BenchReadContextOpenOutput,
  BenchReadContextParkedOutput,
  BenchReadContextOutput,
  BenchTabSummary,
  PublishBenchContextInput,
  BenchTarget,
  ObjectBenchTarget,
  PublishBenchContextResponse,
  StoredBenchContextSnapshot,
  WorkspaceFileBenchTarget,
}
