import { randomUUID } from "node:crypto"
import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import z from "zod"
import { writeJsonFileAtomic, writeTextFileAtomic } from "../storage/atomic-file"
import {
  BuddyObjectDuplicateIDError,
  BuddyObjectLoadException,
  BuddyObjectNotFoundError,
  BuddyObjectUnavailableError,
} from "./errors"
import {
  BuddyObjectIndexItemSchema,
  BuddyObjectLoadErrorSchema,
  BuddyObjectManifestSchema,
  BuddyObjectReadResponseSchema,
  BuddyObjectTombstoneSchema,
  type BuddyObjectIndexItem,
  type BuddyObjectLoadError as BuddyObjectLoadErrorRecord,
  type BuddyObjectManifest,
  type BuddyObjectReadResponse,
  type BuddyObjectTombstone,
} from "./manifest"
import {
  BUDDY_OBJECT_KIND_VALUES,
  BuddyObjectIDSchema,
  BuddyObjectKindSchema,
  OBJECT_DERIVED_DIRECTORY_NAME,
  OBJECT_MANIFEST_FILE_NAME,
  OBJECT_REVISIONS_DIRECTORY_NAME,
  OBJECT_SOURCE_DIRECTORY_NAME,
  OBJECT_STATE_DIRECTORY_NAME,
  type BuddyObjectKind,
} from "./kinds"
import { BuddyObjectPath } from "./path"

const OBJECT_STAGING_DIRECTORY_PREFIX = ".object-"
const OBJECT_STAGING_DIRECTORY_SUFFIX = ".tmp"

const BuddyObjectIndexCacheRecordSchema = z
  .object({
    kind: BuddyObjectKindSchema,
    status: BuddyObjectManifestSchema.shape.status,
    title: BuddyObjectManifestSchema.shape.title,
    objectPath: z.string().trim().min(1),
  })
  .strict()

const BuddyObjectIndexCacheSchema = z.record(BuddyObjectIDSchema, BuddyObjectIndexCacheRecordSchema)

type BuddyObjectIndexCache = z.infer<typeof BuddyObjectIndexCacheSchema>
type BuddyObjectIndexCacheRecord = z.infer<typeof BuddyObjectIndexCacheRecordSchema>

type BuddyObjectContentFile =
  | {
      relativePath: string
      content: string
      format: "text"
    }
  | {
      relativePath: string
      content: unknown
      format: "json"
    }
  | {
      relativePath: string
      sourcePath: string
      format: "copy"
    }

type BuddyObjectListResult = {
  objects: BuddyObjectIndexItem[]
  loadErrors: BuddyObjectLoadErrorRecord[]
}

type BuddyObjectResolveResult =
  | {
      status: "ready"
      manifest: BuddyObjectManifest
    }
  | {
      status: "unavailable"
      tombstone: BuddyObjectTombstone
    }
  | {
      status: "not_found"
    }
  | {
      status: "error"
      loadError: BuddyObjectLoadErrorRecord
    }

type ObjectDirectoryScanEntry =
  | {
      status: "ready"
      manifest: BuddyObjectManifest
      objectDirectory: string
    }
  | {
      status: "unavailable"
      tombstone: BuddyObjectTombstone
      objectDirectory: string
    }
  | {
      status: "ignored"
    }
  | {
      status: "error"
      loadError: BuddyObjectLoadErrorRecord
    }

type ObjectDirectoryScanResult = {
  ready: Array<{ manifest: BuddyObjectManifest; objectDirectory: string }>
  tombstones: Array<{ tombstone: BuddyObjectTombstone; objectDirectory: string }>
  loadErrors: BuddyObjectLoadErrorRecord[]
}

const objectIndexLocks = new Map<string, Promise<void>>()

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === code
  )
}

function generateObjectID(): string {
  return ulid()
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return false
    }
    throw error
  }
}

async function readJsonFile<T>(filePath: string, schema: z.ZodSchema<T>): Promise<T> {
  const text = await fs.readFile(filePath, "utf8")
  const parsed: unknown = JSON.parse(text)
  return schema.parse(parsed)
}

async function writeObjectContentFile(input: {
  objectDirectory: string
  file: BuddyObjectContentFile
}): Promise<void> {
  const targetPath = path.join(input.objectDirectory, input.file.relativePath)
  if (input.file.format === "copy") {
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    await fs.copyFile(input.file.sourcePath, targetPath)
    return
  }
  if (input.file.format === "json") {
    await writeJsonFileAtomic(targetPath, input.file.content)
    return
  }
  await writeTextFileAtomic(targetPath, input.file.content)
}

async function writeObjectRecord(input: {
  directory: string
  kind: BuddyObjectKind
  objectID: string
  manifest: BuddyObjectManifest
  files?: readonly BuddyObjectContentFile[]
}): Promise<void> {
  const objectID = BuddyObjectPath.sanitizeObjectID(input.objectID)
  const kindRoot = BuddyObjectPath.kindRoot(input.directory, input.kind)
  const targetDirectory = BuddyObjectPath.objectDirectory(input.directory, input.kind, objectID)
  await fs.mkdir(kindRoot, { recursive: true })

  const stagingDirectory = path.join(
    kindRoot,
    `${OBJECT_STAGING_DIRECTORY_PREFIX}${objectID}.${randomUUID()}${OBJECT_STAGING_DIRECTORY_SUFFIX}`,
  )
  await fs.mkdir(stagingDirectory)

  try {
    let replacingExistingObject = await pathExists(targetDirectory)
    if (replacingExistingObject) {
      try {
        await fs.cp(targetDirectory, stagingDirectory, { recursive: true, force: true })
      } catch (error) {
        if (isNodeErrorCode(error, "ENOENT")) {
          replacingExistingObject = false
        } else {
          throw error
        }
      }
    }

    for (const file of input.files ?? []) {
      await writeObjectContentFile({
        objectDirectory: stagingDirectory,
        file,
      })
    }
    await writeJsonFileAtomic(
      path.join(stagingDirectory, OBJECT_MANIFEST_FILE_NAME),
      input.manifest,
    )

    if (!replacingExistingObject) {
      await fs.rename(stagingDirectory, targetDirectory)
      await upsertObjectIndexRecord({
        directory: input.directory,
        manifest: input.manifest,
      })
      return
    }

    const backupDirectory = path.join(
      kindRoot,
      `${OBJECT_STAGING_DIRECTORY_PREFIX}${objectID}.${randomUUID()}.backup${OBJECT_STAGING_DIRECTORY_SUFFIX}`,
    )
    try {
      await fs.rename(targetDirectory, backupDirectory)
    } catch (error) {
      if (!isNodeErrorCode(error, "ENOENT")) {
        throw error
      }
    }

    try {
      await fs.rename(stagingDirectory, targetDirectory)
    } catch (error) {
      await fs.rename(backupDirectory, targetDirectory).catch(() => undefined)
      throw error
    }
    await fs.rm(backupDirectory, { recursive: true, force: true }).catch(() => undefined)
    await upsertObjectIndexRecord({
      directory: input.directory,
      manifest: input.manifest,
    })
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

async function writeObjectManifest(input: {
  directory: string
  manifest: BuddyObjectManifest
}): Promise<void> {
  await writeJsonFileAtomic(
    BuddyObjectPath.manifestFile(input.directory, input.manifest.kind, input.manifest.objectID),
    input.manifest,
  )
  await upsertObjectIndexRecord({
    directory: input.directory,
    manifest: input.manifest,
  })
}

async function readObjectManifest(input: {
  directory: string
  kind: BuddyObjectKind
  objectID: string
}): Promise<BuddyObjectManifest> {
  const objectID = BuddyObjectPath.sanitizeObjectID(input.objectID)
  try {
    const tombstonePath = BuddyObjectPath.tombstoneFile(input.directory, input.kind, objectID)
    if (await pathExists(tombstonePath)) {
      throw new BuddyObjectUnavailableError(objectID)
    }
    return await readJsonFile(
      BuddyObjectPath.manifestFile(input.directory, input.kind, objectID),
      BuddyObjectManifestSchema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw new BuddyObjectNotFoundError(objectID)
    }
    throw error
  }
}

async function readObjectTombstone(input: {
  directory: string
  kind: BuddyObjectKind
  objectID: string
}): Promise<BuddyObjectTombstone> {
  return readJsonFile(
    BuddyObjectPath.tombstoneFile(input.directory, input.kind, input.objectID),
    BuddyObjectTombstoneSchema,
  )
}

async function readObjectTextFile(input: {
  directory: string
  kind: BuddyObjectKind
  objectID: string
  relativePath: string
}): Promise<string> {
  const objectID = BuddyObjectPath.sanitizeObjectID(input.objectID)
  try {
    return await fs.readFile(
      BuddyObjectPath.objectFile(input.directory, input.kind, objectID, input.relativePath),
      "utf8",
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw new BuddyObjectNotFoundError(objectID)
    }
    throw error
  }
}

async function readObjectJsonFile<T>(input: {
  directory: string
  kind: BuddyObjectKind
  objectID: string
  relativePath: string
  schema: z.ZodSchema<T>
}): Promise<T> {
  const objectID = BuddyObjectPath.sanitizeObjectID(input.objectID)
  try {
    return await readJsonFile(
      BuddyObjectPath.objectFile(input.directory, input.kind, objectID, input.relativePath),
      input.schema,
    )
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      throw new BuddyObjectNotFoundError(objectID)
    }
    throw error
  }
}

async function collectKindDirectoryEntries(
  directory: string,
  kind: BuddyObjectKind,
): Promise<Dirent[]> {
  try {
    return await fs.readdir(BuddyObjectPath.kindRoot(directory, kind), { withFileTypes: true })
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return []
    }
    throw error
  }
}

async function scanObjectDirectory(input: {
  directory: string
  kind: BuddyObjectKind
  entryName: string
}): Promise<ObjectDirectoryScanEntry> {
  if (!BuddyObjectIDSchema.safeParse(input.entryName).success) {
    return { status: "ignored" }
  }

  const objectDirectory = BuddyObjectPath.objectDirectory(
    input.directory,
    input.kind,
    input.entryName,
  )
  const tombstonePath = BuddyObjectPath.tombstoneFile(input.directory, input.kind, input.entryName)
  const manifestPath = BuddyObjectPath.manifestFile(input.directory, input.kind, input.entryName)
  try {
    if (await pathExists(tombstonePath)) {
      const tombstone = await readJsonFile(tombstonePath, BuddyObjectTombstoneSchema)
      return { status: "unavailable", tombstone, objectDirectory }
    }
    if (!(await pathExists(manifestPath))) {
      return { status: "ignored" }
    }
    const manifest = await readJsonFile(manifestPath, BuddyObjectManifestSchema)
    return { status: "ready", manifest, objectDirectory }
  } catch (error) {
    const loadError = new BuddyObjectLoadException(input.kind, input.entryName, error)
    return {
      status: "error",
      loadError: BuddyObjectLoadErrorSchema.parse({
        kind: input.kind,
        objectID: input.entryName,
        path: objectDirectory,
        message: loadError.message,
      }),
    }
  }
}

function manifestToIndexCacheRecord(input: {
  directory: string
  manifest: BuddyObjectManifest
}): BuddyObjectIndexCacheRecord {
  return {
    kind: input.manifest.kind,
    status: input.manifest.status,
    title: input.manifest.title,
    objectPath: BuddyObjectPath.relativeObjectDirectory(
      input.manifest.kind,
      input.manifest.objectID,
    ),
  }
}

function manifestToIndexItem(input: {
  directory: string
  manifest: BuddyObjectManifest
}): BuddyObjectIndexItem {
  const surfaces = new Set(input.manifest.views.flatMap((view) => view.surfaces))
  const sourceRef = input.manifest.sourceRefs.find((ref) => ref.role === "authoring")
  const primaryView =
    input.manifest.views.find((view) => view.surfaces.includes("inline")) ??
    input.manifest.views.find((view) => view.surfaces.includes("bench")) ??
    input.manifest.views[0]

  return BuddyObjectIndexItemSchema.parse({
    kind: input.manifest.kind,
    objectID: input.manifest.objectID,
    title: input.manifest.title,
    status: input.manifest.status,
    lifecycle: input.manifest.lifecycle,
    sourceRoot: sourceRef?.workspacePath ?? sourceRef?.displayPath ?? null,
    primaryViewID: primaryView?.viewID ?? null,
    surfaces: [...surfaces].toSorted((left, right) => left.localeCompare(right)),
    hasLibraryView: input.manifest.views.some((view) => view.surfaces.includes("library")),
    updatedAt: input.manifest.updatedAt,
  })
}

async function readObjectIndexCache(directory: string): Promise<BuddyObjectIndexCache> {
  return readJsonFile(BuddyObjectPath.indexFile(directory), BuddyObjectIndexCacheSchema).catch(
    (error: unknown) => {
      if (isNodeErrorCode(error, "ENOENT")) {
        return {}
      }
      throw error
    },
  )
}

async function writeObjectIndexCache(input: {
  directory: string
  cache: BuddyObjectIndexCache
}): Promise<void> {
  await writeJsonFileAtomic(BuddyObjectPath.indexFile(input.directory), input.cache)
}

function withObjectIndexLock<T>(directory: string, task: () => Promise<T>): Promise<T> {
  const key = path.resolve(directory)
  const previous = objectIndexLocks.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const next = run.then(
    () => undefined,
    () => undefined,
  )
  objectIndexLocks.set(key, next)
  return run.finally(() => {
    if (objectIndexLocks.get(key) === next) {
      objectIndexLocks.delete(key)
    }
  })
}

async function upsertObjectIndexRecord(input: {
  directory: string
  manifest: BuddyObjectManifest
}): Promise<void> {
  await withObjectIndexLock(input.directory, async () => {
    const cache = await readObjectIndexCache(input.directory).catch(() => ({}))
    const next = {
      ...cache,
      [input.manifest.objectID]: manifestToIndexCacheRecord(input),
    }
    await writeObjectIndexCache({
      directory: input.directory,
      cache: BuddyObjectIndexCacheSchema.parse(next),
    })
  })
}

async function removeObjectIndexRecord(input: {
  directory: string
  objectID: string
}): Promise<void> {
  const objectID = BuddyObjectPath.sanitizeObjectID(input.objectID)
  await withObjectIndexLock(input.directory, async () => {
    const cache = await readObjectIndexCache(input.directory).catch(() => ({}))
    const next = { ...cache }
    delete next[objectID]
    await writeObjectIndexCache({
      directory: input.directory,
      cache: BuddyObjectIndexCacheSchema.parse(next),
    })
  })
}

async function scanObjectDirectories(input: {
  directory: string
  kinds: readonly BuddyObjectKind[]
}): Promise<ObjectDirectoryScanResult> {
  const allResults = await Promise.all(
    input.kinds.map(async (kind) => {
      const entries = await collectKindDirectoryEntries(input.directory, kind)
      return Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map((entry) =>
            scanObjectDirectory({
              directory: input.directory,
              kind,
              entryName: entry.name,
            }),
          ),
      )
    }),
  )

  const ready: Array<{ manifest: BuddyObjectManifest; objectDirectory: string }> = []
  const tombstones: Array<{ tombstone: BuddyObjectTombstone; objectDirectory: string }> = []
  const loadErrors: BuddyObjectLoadErrorRecord[] = []

  for (const result of allResults.flat()) {
    if (result.status === "ready") {
      ready.push({ manifest: result.manifest, objectDirectory: result.objectDirectory })
    } else if (result.status === "unavailable") {
      tombstones.push({ tombstone: result.tombstone, objectDirectory: result.objectDirectory })
    } else if (result.status === "error") {
      loadErrors.push(result.loadError)
    }
  }

  return { ready, tombstones, loadErrors }
}

function buildObjectListFromScan(input: {
  directory: string
  scanned: ObjectDirectoryScanResult
}): { list: BuddyObjectListResult; cache: BuddyObjectIndexCache } {
  const liveByID = new Map<
    string,
    Array<{ manifest: BuddyObjectManifest; objectDirectory: string }>
  >()
  for (const entry of input.scanned.ready) {
    const current = liveByID.get(entry.manifest.objectID) ?? []
    current.push(entry)
    liveByID.set(entry.manifest.objectID, current)
  }

  const tombstonedIDs = new Set(input.scanned.tombstones.map((entry) => entry.tombstone.objectID))
  const cache: BuddyObjectIndexCache = {}
  const objects: BuddyObjectIndexItem[] = []
  const loadErrors = [...input.scanned.loadErrors]

  for (const [objectID, entries] of liveByID) {
    if (tombstonedIDs.has(objectID)) {
      continue
    }
    if (entries.length > 1) {
      const error = new BuddyObjectDuplicateIDError(objectID)
      loadErrors.push(
        ...entries.map((entry) =>
          BuddyObjectLoadErrorSchema.parse({
            kind: entry.manifest.kind,
            objectID,
            path: entry.objectDirectory,
            message: error.message,
          }),
        ),
      )
      continue
    }
    const entry = entries[0]
    if (!entry) continue
    cache[objectID] = manifestToIndexCacheRecord({
      directory: input.directory,
      manifest: entry.manifest,
    })
    objects.push(manifestToIndexItem({ directory: input.directory, manifest: entry.manifest }))
  }

  return {
    cache,
    list: {
      objects: objects.toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      loadErrors: loadErrors.toSorted((left, right) => {
        const leftID = left.objectID ?? ""
        const rightID = right.objectID ?? ""
        return leftID.localeCompare(rightID) || left.message.localeCompare(right.message)
      }),
    },
  }
}

async function rebuildObjectIndex(directory: string): Promise<BuddyObjectListResult> {
  const scanned = await scanObjectDirectories({
    directory,
    kinds: BUDDY_OBJECT_KIND_VALUES,
  })
  const built = buildObjectListFromScan({ directory, scanned })
  await withObjectIndexLock(directory, async () => {
    await writeObjectIndexCache({
      directory,
      cache: BuddyObjectIndexCacheSchema.parse(built.cache),
    })
  })
  return built.list
}

async function listObjects(input: {
  directory: string
  kind?: BuddyObjectKind
}): Promise<BuddyObjectListResult> {
  const scanned = await scanObjectDirectories({
    directory: input.directory,
    kinds: BUDDY_OBJECT_KIND_VALUES,
  })
  const listed = buildObjectListFromScan({ directory: input.directory, scanned }).list
  if (!input.kind) {
    return listed
  }
  return {
    objects: listed.objects.filter((object) => object.kind === input.kind),
    loadErrors: listed.loadErrors.filter(
      (error) => error.kind === null || error.kind === input.kind,
    ),
  }
}

async function readObject(input: {
  directory: string
  kind: BuddyObjectKind
  objectID: string
}): Promise<BuddyObjectReadResponse> {
  const objectID = BuddyObjectPath.sanitizeObjectID(input.objectID)
  const tombstonePath = BuddyObjectPath.tombstoneFile(input.directory, input.kind, objectID)
  if (await pathExists(tombstonePath)) {
    return BuddyObjectReadResponseSchema.parse({
      status: "unavailable",
      tombstone: await readObjectTombstone({
        directory: input.directory,
        kind: input.kind,
        objectID,
      }),
    })
  }

  try {
    return BuddyObjectReadResponseSchema.parse({
      status: "ready",
      manifest: await readObjectManifest({
        directory: input.directory,
        kind: input.kind,
        objectID,
      }),
    })
  } catch (error) {
    if (error instanceof BuddyObjectNotFoundError) {
      throw error
    }
    const loadError = new BuddyObjectLoadException(input.kind, objectID, error)
    return BuddyObjectReadResponseSchema.parse({
      status: "error",
      loadError: {
        kind: input.kind,
        objectID,
        path: BuddyObjectPath.objectDirectory(input.directory, input.kind, objectID),
        message: loadError.message,
      },
    })
  }
}

async function resolveObjectByID(input: {
  directory: string
  objectID: string
}): Promise<BuddyObjectResolveResult> {
  const objectID = BuddyObjectPath.sanitizeObjectID(input.objectID)
  const cache = await readObjectIndexCache(input.directory).catch(() => undefined)
  const cached = cache?.[objectID]
  const results = await Promise.all(
    BUDDY_OBJECT_KIND_VALUES.map((kind) =>
      scanObjectDirectory({
        directory: input.directory,
        kind,
        entryName: objectID,
      }),
    ),
  )
  const tombstones = results.filter((result) => result.status === "unavailable")
  if (tombstones.length > 0) {
    const tombstone = tombstones.toSorted((left, right) =>
      left.tombstone.kind.localeCompare(right.tombstone.kind),
    )[0]?.tombstone
    if (tombstone) {
      if (cached) await rebuildObjectIndex(input.directory)
      return { status: "unavailable", tombstone }
    }
  }

  const live = results.filter((result) => result.status === "ready")
  if (live.length > 1) {
    if (cached) await rebuildObjectIndex(input.directory)
    return {
      status: "error",
      loadError: BuddyObjectLoadErrorSchema.parse({
        kind: null,
        objectID,
        path: BuddyObjectPath.objectRoot(input.directory),
        message: new BuddyObjectDuplicateIDError(objectID).message,
      }),
    }
  }
  const entry = live[0]
  if (entry) {
    const expectedCacheRecord = manifestToIndexCacheRecord({
      directory: input.directory,
      manifest: entry.manifest,
    })
    if (
      !cached ||
      cached.kind !== expectedCacheRecord.kind ||
      cached.status !== expectedCacheRecord.status ||
      cached.title !== expectedCacheRecord.title ||
      cached.objectPath !== expectedCacheRecord.objectPath
    ) {
      await rebuildObjectIndex(input.directory)
    }
    return { status: "ready", manifest: entry.manifest }
  }

  const loadError = results.find((result) => result.status === "error")?.loadError
  if (loadError) {
    if (cached) await rebuildObjectIndex(input.directory)
    return { status: "error", loadError }
  }

  if (cache === undefined || cached) {
    await rebuildObjectIndex(input.directory)
  }
  return { status: "not_found" }
}

async function deleteObject(input: {
  directory: string
  kind: BuddyObjectKind
  objectID: string
  reason?: BuddyObjectTombstone["reason"]
}): Promise<void> {
  const objectID = BuddyObjectPath.sanitizeObjectID(input.objectID)
  const manifest = await readObjectManifest({
    directory: input.directory,
    kind: input.kind,
    objectID,
  }).catch((error: unknown) => {
    if (error instanceof BuddyObjectUnavailableError) {
      return undefined
    }
    throw error
  })

  const tombstone = BuddyObjectTombstoneSchema.parse({
    version: 1,
    kind: input.kind,
    objectID,
    deletedAt: new Date().toISOString(),
    ...(manifest?.title ? { title: manifest.title } : {}),
    ...(input.reason ? { reason: input.reason } : { reason: "user_deleted" }),
  })
  await writeJsonFileAtomic(
    BuddyObjectPath.tombstoneFile(input.directory, input.kind, objectID),
    tombstone,
  )

  await Promise.all(
    [
      OBJECT_SOURCE_DIRECTORY_NAME,
      OBJECT_REVISIONS_DIRECTORY_NAME,
      OBJECT_DERIVED_DIRECTORY_NAME,
      OBJECT_STATE_DIRECTORY_NAME,
    ].map((segment) =>
      fs.rm(BuddyObjectPath.objectFile(input.directory, input.kind, objectID, segment), {
        recursive: true,
        force: true,
      }),
    ),
  )
  await fs.rm(BuddyObjectPath.manifestFile(input.directory, input.kind, objectID), {
    force: true,
  })
  await removeObjectIndexRecord({
    directory: input.directory,
    objectID,
  })
}

async function garbageCollectObjectKindOrphans(input: {
  directory: string
  kind: BuddyObjectKind
}): Promise<void> {
  const entries = await collectKindDirectoryEntries(input.directory, input.kind)
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<void> => {
        const kindRoot = BuddyObjectPath.kindRoot(input.directory, input.kind)
        if (
          entry.name.startsWith(OBJECT_STAGING_DIRECTORY_PREFIX) &&
          entry.name.endsWith(OBJECT_STAGING_DIRECTORY_SUFFIX)
        ) {
          await fs.rm(path.join(kindRoot, entry.name), { recursive: true, force: true })
          return
        }
        if (!BuddyObjectIDSchema.safeParse(entry.name).success) {
          return
        }
        const manifestPath = BuddyObjectPath.manifestFile(input.directory, input.kind, entry.name)
        const tombstonePath = BuddyObjectPath.tombstoneFile(input.directory, input.kind, entry.name)
        if ((await pathExists(manifestPath)) || (await pathExists(tombstonePath))) {
          return
        }
        await fs.rm(BuddyObjectPath.objectDirectory(input.directory, input.kind, entry.name), {
          recursive: true,
          force: true,
        })
      }),
  )
}

export {
  BuddyObjectIndexCacheRecordSchema,
  BuddyObjectIndexCacheSchema,
  deleteObject,
  garbageCollectObjectKindOrphans,
  generateObjectID,
  isNodeErrorCode,
  listObjects,
  readJsonFile,
  readObject,
  readObjectJsonFile,
  readObjectManifest,
  readObjectTextFile,
  rebuildObjectIndex,
  resolveObjectByID,
  upsertObjectIndexRecord,
  writeObjectManifest,
  writeObjectRecord,
}
export type {
  BuddyObjectContentFile,
  BuddyObjectIndexCache,
  BuddyObjectIndexCacheRecord,
  BuddyObjectListResult,
  BuddyObjectResolveResult,
}
