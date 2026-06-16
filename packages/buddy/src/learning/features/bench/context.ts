import path from "node:path"
import z from "zod"

const BENCH_CONTEXT_REGISTRY_LIMIT = 512

const BenchContextSurfaceTypeSchema = z.enum([
  "reading",
  "markdown",
  "file",
  "whiteboard",
  "artifact",
])

const BenchContextArtifactKindSchema = z.enum([
  "none",
  "mermaid",
  "html-widget",
  "figure",
  "freeform-figure",
  "media-presentation",
  "question-set",
  "flashcard-deck",
])

const BenchContextStatusSchema = z.enum([
  "ready",
  "loading",
  "dirty",
  "error",
  "unavailable",
])

const BenchContextTargetSchema = z
  .object({
    type: BenchContextSurfaceTypeSchema,
    artifactKind: BenchContextArtifactKindSchema,
    title: z.string().nullable(),
    workspaceRoot: z.string(),
    path: z.string().nullable(),
    absolutePath: z.string().nullable(),
    resourceID: z.string().nullable(),
    artifactID: z.string().nullable(),
    itemID: z.string().nullable(),
    route: z.string(),
    status: BenchContextStatusSchema,
  })
  .strict()

const BenchContextRefSchema = z
  .object({
    kind: z.enum(["file", "artifact", "resource", "tool", "url"]),
    value: z.string(),
    note: z.string(),
  })
  .strict()

const BenchReadContextClosedOutputSchema = z
  .object({
    status: z.literal("closed"),
  })
  .strict()

const BenchReadContextOpenOutputSchema = z
  .object({
    status: z.literal("open"),
    target: BenchContextTargetSchema,
    metadata: z.array(z.string()),
    content: z.string(),
    refs: z.array(BenchContextRefSchema),
    hints: z.array(z.string()),
  })
  .strict()

const BenchReadContextOutputSchema = z.union([
  BenchReadContextClosedOutputSchema,
  BenchReadContextOpenOutputSchema,
])

const PublishBenchContextResponseSchema = z
  .object({
    revision: z.number().int().nonnegative(),
  })
  .strict()

const closedBenchContext = {
  status: "closed",
} as const

type BenchContextTarget = z.infer<typeof BenchContextTargetSchema>
type BenchReadContextOpenOutput = z.infer<typeof BenchReadContextOpenOutputSchema>
type BenchReadContextOutput = z.infer<typeof BenchReadContextOutputSchema>
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
}

class BenchContextSnapshotMissingError extends Error {
  constructor(input: { directory: string; sessionID: string }) {
    super(`Bench context has not been synchronized for session ${input.sessionID}.`)
    this.name = "BenchContextSnapshotMissingError"
  }
}

const benchContextRegistry = new Map<string, StoredBenchContextEntry>()

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

function publishBenchContext(input: {
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
  })
  evictOldestBenchContextEntriesIfNeeded()
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

function clearBenchContextRegistry(): void {
  benchContextRegistry.clear()
}

export {
  BenchContextArtifactKindSchema,
  BenchContextRefSchema,
  BenchContextSnapshotMissingError,
  BenchContextStatusSchema,
  BenchContextSurfaceTypeSchema,
  BenchContextTargetSchema,
  BenchReadContextClosedOutputSchema,
  BenchReadContextInputSchema,
  BenchReadContextOpenOutputSchema,
  BenchReadContextOutputSchema,
  PublishBenchContextResponseSchema,
  clearBenchContextRegistry,
  closedBenchContext,
  publishBenchContext,
  readBenchContext,
  readCurrentBenchContext,
}

const BenchReadContextInputSchema = z.object({}).strict()

export type {
  BenchContextTarget,
  BenchReadContextOpenOutput,
  BenchReadContextOutput,
  PublishBenchContextResponse,
  StoredBenchContextSnapshot,
}
