import path from "node:path"
import z from "zod"
import { BuddyObjectRefSchema, nonEmptyString } from "../../../objects"

const BENCH_CONTEXT_REGISTRY_LIMIT = 512

const BenchContextStatusSchema = z.enum(["ready", "loading", "dirty", "error", "unavailable"])

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

type BenchTarget = z.infer<typeof BenchTargetSchema>
type WorkspaceFileBenchTarget = z.infer<typeof WorkspaceFileBenchTargetSchema>
type ObjectBenchTarget = z.infer<typeof ObjectBenchTargetSchema>
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

function benchTargetFromContextTarget(target: BenchContextTarget): BenchTarget {
  if (target.type === "object") {
    return BenchTargetSchema.parse({
      type: "object",
      ref: target.ref,
      viewID: target.viewID,
    })
  }
  return BenchTargetSchema.parse({
    type: "workspace-file",
    path: target.path,
    viewer: target.path.toLowerCase().endsWith(".md") ? "markdown" : "file",
  })
}

const BenchReadContextInputSchema = z.object({}).strict()

export {
  BenchContextRefSchema,
  BenchContextSnapshotMissingError,
  BenchContextStatusSchema,
  BenchContextTargetSchema,
  BenchReadContextClosedOutputSchema,
  BenchReadContextInputSchema,
  BenchReadContextOpenOutputSchema,
  BenchReadContextOutputSchema,
  BenchTargetSchema,
  ObjectBenchTargetSchema,
  PublishedObjectBenchContextTargetSchema,
  PublishedWorkspaceFileBenchContextTargetSchema,
  PublishBenchContextResponseSchema,
  WorkspaceFileBenchTargetSchema,
  benchTargetFromContextTarget,
  clearBenchContextRegistry,
  closedBenchContext,
  publishBenchContext,
  readBenchContext,
  readCurrentBenchContext,
}

export type {
  BenchContextTarget,
  BenchReadContextOpenOutput,
  BenchReadContextOutput,
  BenchTarget,
  ObjectBenchTarget,
  PublishBenchContextResponse,
  StoredBenchContextSnapshot,
  WorkspaceFileBenchTarget,
}
