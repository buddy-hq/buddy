import { promises as fs } from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import z from "zod"
import {
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_COVER_FILE_PREFIX,
  RESOURCE_PACK_FULL_TEXT_FILE_NAME,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_PREPARING_WARNING,
  RESOURCE_PACK_STATUS_ERROR,
  RESOURCE_PACK_STATUS_PREPARING,
  RESOURCE_PACK_STATUS_READY,
  RESOURCE_PACK_STATUS_UNSUPPORTED,
  RESOURCE_PACK_TOC_FILE_NAME,
  classifyResourcePath,
  ensureResourcePackWithBuildInput,
  resolveResourcePackFullTextMetadataFromRoot,
} from "../resource-packs"
import { writeJsonFileAtomic } from "../storage/atomic-file"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectManifestSchema,
  BuddyObjectNotFoundError,
  BuddyObjectPath,
  BuddyObjectUnavailableError,
  BuddyObjectViewResponseSchema,
  BuddyObjectValidationError,
  mapBuddyObjectRouteError,
  OBJECT_DERIVED_DIRECTORY_NAME,
  OBJECT_SOURCE_DIRECTORY_NAME,
  ResourceObjectSummarySchema,
  registerBuddyObjectKind,
  deleteObject,
  generateObjectID,
  isNodeErrorCode,
  listObjects,
  readObjectManifest,
  readJsonFile,
  writeObjectManifest,
  writeObjectRecord,
  type BuddyObjectManifest,
  type BuddyObjectSourceRef,
  type BuddyObjectViewResponse,
} from "../objects"
import { resolveBenchReadingResourceRelpath } from "../learning/features/bench/reading-resource"
import type { ReaderSourceValidity } from "@buddy/workspace-file-policy"
import { validateReaderSourcePath, type ReaderSourceValidation } from "./reader-source-validator"

const RESOURCE_ALIAS_DEFAULT = "resource" as const
const RESOURCE_ALIAS_REPLACE_REGEX = /[^a-z0-9._-]+/g
const RESOURCE_ALIAS_TRIM_REGEX = /^-+|-+$/g
const RESOURCE_SOURCE_MISSING_WARNING_PREFIX = "Resource source file not found: " as const
const RESOURCE_SOURCE_NOT_FILE_ERROR = "Resource path must point to a file." as const
const RESOURCE_SOURCE_PATH_REQUIRED_ERROR = "Resource path is required." as const
const RESOURCE_SOURCE_MANIFEST_STALE_WARNING =
  "Resource source metadata is missing or stale. Rebuild this resource." as const
const RESOURCE_STALE_WARNING = "Source file changed since last successful preparation." as const
const RESOURCE_ALIAS_INDEX_FILE_NAME = "aliases.json" as const
const RESOURCE_PACK_DIRECTORY_NAME = "pack" as const
const RESOURCE_PACK_STAGING_DIRECTORY_NAME = "pack-staging" as const
const RESOURCE_OBJECT_SOURCE_ROLE_MANAGED = "payload" as const
const RESOURCE_OBJECT_SOURCE_ROLE_ORIGINAL = "original" as const
const RESOURCE_READER_VIEW_ID = "reader" as const
const RESOURCE_SOURCE_VIEW_ID = "source" as const
const RESOURCE_LIBRARY_VIEW_ID = "library" as const

export type ResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

export type ResourceRecord = {
  objectID: string
  alias: string
  sourceRelpath: string
  sourceOriginRelpath?: string
  format: string
  status: ResourceStatus
  sourceValidity: ReaderSourceValidity
  extractionStatus: ResourceStatus
  warnings: string[]
  preparedAt?: string
  sourceMtimeMs?: number
  sourceSizeBytes?: number
  coverRelpath?: string
  title?: string
  author?: string
  packPath?: string
  fullTextPath?: string
  fullTextEstimatedTokens?: number
  fullTextCharacters?: number
  readerPath?: string
}

type ResourceUseResolution =
  | {
      ok: true
      record: ResourceRecord
      entrypointPath: string
      tocPath?: string
    }
  | {
      ok: false
      reason: "not_found" | "not_ready" | "invalid_pack"
      record?: ResourceRecord
    }

export type ResourceObjectKey = {
  directory: string
  resourceKey: string
}

export type ResourceObjectResolved = {
  objectID: string
  alias: string
  title: string | null
  status: ResourceStatus
  sourceValidity: ReaderSourceValidity
  extractionStatus: ResourceStatus
  managedSourceRef: BuddyObjectSourceRef
  originalSourceRef: BuddyObjectSourceRef | null
  objectPath: string
  entrypointPath: string | null
  tocPath: string | null
  packPath: string | null
  fullTextPath: string | null
  fullTextEstimatedTokens: number | null
  fullTextCharacters: number | null
  readerPath: string | null
  warnings: string[]
  format: string
  sourceMtimeMs: number | null
  sourceSizeBytes: number | null
  preparedAt: string | null
  coverRelpath: string | null
  author: string | null
}

type ResourceObjectPackBuildInput = {
  directory: string
  objectID: string
  generationID: string
  alias: string
  sourcePath: string
  derivedPackRoot: string
  metadataPath: string
  entrypointPath: string
  tocPath: string
  fullTextPath: string
  chunksDirPath: string
  pagesDirPath: string
}

type ResourceAliasIndex = Record<string, string>

type ResourcePackMetadataSnapshot = {
  format?: string
  status?: ResourceStatus
  warnings: string[]
  preparedAt?: string
  sourceMtimeMs?: number
  sourceSizeBytes?: number
  coverRelpath?: string
  title?: string
  author?: string
}

const inFlightResourcePreparation = new Map<string, Promise<void>>()
const resourceAliasIndexMutationTails = new Map<string, Promise<void>>()

function withResourceAliasIndexMutationLock<T>(
  directory: string,
  task: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(directory)
  const previous = resourceAliasIndexMutationTails.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const next = run.then(
    () => undefined,
    () => undefined,
  )
  resourceAliasIndexMutationTails.set(key, next)
  return run.finally(() => {
    if (resourceAliasIndexMutationTails.get(key) === next) {
      resourceAliasIndexMutationTails.delete(key)
    }
  })
}

export class ResourceValidationError extends Error {}
export class ResourceNotFoundError extends Error {}
export class ResourceAmbiguousAliasError extends ResourceValidationError {
  constructor(alias: string, objectIDs: string[]) {
    super(`Resource alias is ambiguous: ${alias} (${objectIDs.join(", ")})`)
    this.name = "ResourceAmbiguousAliasError"
  }
}

export async function listResources(directory: string): Promise<ResourceRecord[]> {
  const records = await listRegisteredResources(directory)
  return records.map(stripRegisteredResourceRecord)
}

export async function listRegisteredResources(directory: string): Promise<ResourceRecord[]> {
  const resources = await listResolvedResourceObjects({ directory })
  return resources
    .map(resourceResolvedToRegisteredRecord)
    .toSorted((left, right) => left.alias.localeCompare(right.alias))
}

export async function addResource(input: {
  directory: string
  sourcePath: string
  alias?: string
}): Promise<ResourceRecord> {
  const absoluteSourcePath = resolveInputSourcePath(input.directory, input.sourcePath)
  const sourceStat = await fs.stat(absoluteSourcePath).catch(() => undefined)
  if (!sourceStat) {
    throw new ResourceValidationError(
      `${RESOURCE_SOURCE_MISSING_WARNING_PREFIX}${input.sourcePath}`,
    )
  }
  if (!sourceStat.isFile()) {
    throw new ResourceValidationError(RESOURCE_SOURCE_NOT_FILE_ERROR)
  }
  const sourceValidation = await validateReaderSourcePath(absoluteSourcePath)
  if (sourceValidation.sourceValidity === "invalid") {
    throw new ResourceValidationError(
      sourceValidation.reason ?? "The reader source file is invalid.",
    )
  }

  const manifest = await createResourceObject({
    directory: input.directory,
    sourcePath: absoluteSourcePath,
    sourceStat,
    sourceValidation,
    requestedAlias: input.alias,
  })

  void prepareResourceObject({
    directory: input.directory,
    objectID: manifest.objectID,
  })

  return stripRegisteredResourceRecord(
    resourceResolvedToRegisteredRecord(
      await resolveResourceObjectByID({
        directory: input.directory,
        objectID: manifest.objectID,
      }),
    ),
  )
}

export async function getResourceByKey(
  directory: string,
  key: string,
): Promise<ResourceRecord | undefined> {
  const resource = await resolveResourceObjectByKey({ directory, resourceKey: key }).catch(
    (error: unknown) => {
      if (error instanceof ResourceNotFoundError) return undefined
      throw error
    },
  )
  return resource
    ? stripRegisteredResourceRecord(resourceResolvedToRegisteredRecord(resource))
    : undefined
}

export async function getRegisteredResourceByKey(
  directory: string,
  key: string,
): Promise<ResourceRecord | undefined> {
  const resource = await resolveResourceObjectByKey({ directory, resourceKey: key }).catch(
    (error: unknown) => {
      if (error instanceof ResourceNotFoundError) return undefined
      throw error
    },
  )
  return resource ? resourceResolvedToRegisteredRecord(resource) : undefined
}

export async function renameResource(input: {
  directory: string
  objectID: string
  alias: string
}): Promise<ResourceRecord> {
  return withResourceAliasIndexMutationLock(input.directory, () => renameResourceUnlocked(input))
}

async function renameResourceUnlocked(input: {
  directory: string
  objectID: string
  alias: string
}): Promise<ResourceRecord> {
  const resource = await resolveResourceObjectByID({
    directory: input.directory,
    objectID: input.objectID,
  })
  const normalizedAlias = normalizeAliasToken(input.alias)
  if (!normalizedAlias) {
    throw new ResourceValidationError("Resource alias is required.")
  }
  await assertAliasAvailable({
    directory: input.directory,
    alias: normalizedAlias,
    exceptObjectID: resource.objectID,
  })

  const manifest = await readResourceObjectManifest(input.directory, resource.objectID)
  const updated = BuddyObjectManifestSchema.parse({
    ...manifest,
    title: manifest.title === manifest.summary.alias ? normalizedAlias : manifest.title,
    updatedAt: new Date().toISOString(),
    summary: {
      ...manifest.summary,
      alias: normalizedAlias,
    },
  })
  await writeObjectManifest({ directory: input.directory, manifest: updated })
  await rebuildResourceAliasIndexUnlocked(input.directory)
  return stripRegisteredResourceRecord(
    resourceResolvedToRegisteredRecord(
      await resolveResourceObjectByID({
        directory: input.directory,
        objectID: resource.objectID,
      }),
    ),
  )
}

export async function rebuildResource(input: {
  directory: string
  objectID: string
}): Promise<ResourceRecord> {
  const resource = await resolveResourceObjectByID({
    directory: input.directory,
    objectID: input.objectID,
  })
  const activePreparation = inFlightResourcePreparation.get(
    preparationKey(input.directory, resource.objectID),
  )
  if (activePreparation) {
    await activePreparation.catch(() => undefined)
  }

  const generationID = generateObjectID()
  const manifest = await refreshManagedResourceSourceFromOriginal({
    directory: input.directory,
    manifest: await readResourceObjectManifest(input.directory, resource.objectID),
  })
  const preparing = BuddyObjectManifestSchema.parse({
    ...manifest,
    status: RESOURCE_PACK_STATUS_PREPARING,
    updatedAt: new Date().toISOString(),
    summary: {
      ...manifest.summary,
      sourceValidity: "unknown",
      extractionStatus: RESOURCE_PACK_STATUS_PREPARING,
      generationID,
      preparedAt: null,
      fullTextPath: null,
      fullTextEstimatedTokens: null,
      fullTextCharacters: null,
      warnings: [RESOURCE_PACK_PREPARING_WARNING],
    },
  })
  await writeObjectManifest({ directory: input.directory, manifest: preparing })

  void prepareResourceObject({
    directory: input.directory,
    objectID: resource.objectID,
    generationID,
  })

  return stripRegisteredResourceRecord(
    resourceResolvedToRegisteredRecord(
      await resolveResourceObjectByID({
        directory: input.directory,
        objectID: resource.objectID,
      }),
    ),
  )
}

export async function removeResource(input: {
  directory: string
  objectID: string
}): Promise<void> {
  const resource = await resolveResourceObjectByID({
    directory: input.directory,
    objectID: input.objectID,
  })
  const activePreparation = inFlightResourcePreparation.get(
    preparationKey(input.directory, resource.objectID),
  )
  if (activePreparation) {
    await activePreparation.catch(() => undefined)
  }
  await withResourceAliasIndexMutationLock(input.directory, () =>
    removeResourceUnlocked({
      directory: input.directory,
      objectID: resource.objectID,
    }),
  )
}

async function removeResourceUnlocked(input: {
  directory: string
  objectID: string
}): Promise<void> {
  const resource = await resolveResourceObjectByID({
    directory: input.directory,
    objectID: input.objectID,
  })
  await deleteObject({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.resource,
    objectID: resource.objectID,
  })
  await rebuildResourceAliasIndexUnlocked(input.directory)
}

export async function resolveResourceReference(input: {
  directory: string
  key: string
}): Promise<ResourceUseResolution> {
  const resource = await resolveResourceObjectByKey({
    directory: input.directory,
    resourceKey: input.key,
  }).catch((error: unknown) => {
    if (error instanceof ResourceNotFoundError) return undefined
    throw error
  })
  if (!resource) {
    return { ok: false, reason: "not_found" }
  }

  const record = stripRegisteredResourceRecord(resourceResolvedToRegisteredRecord(resource))
  if (record.status !== RESOURCE_PACK_STATUS_READY) {
    return { ok: false, reason: "not_ready", record }
  }
  if (!resource.entrypointPath) {
    return { ok: false, reason: "invalid_pack", record }
  }
  return {
    ok: true,
    record,
    entrypointPath: path.resolve(input.directory, resource.entrypointPath),
    ...(resource.tocPath ? { tocPath: path.resolve(input.directory, resource.tocPath) } : {}),
  }
}

export async function resolveResourceObjectIDByKey(
  directory: string,
  key: string,
): Promise<string> {
  return (await resolveResourceObjectByKey({ directory, resourceKey: key })).objectID
}

export async function resolveResourceObjectByKey(
  input: ResourceObjectKey,
): Promise<ResourceObjectResolved> {
  const trimmed = input.resourceKey.trim()
  if (!trimmed) throw new ResourceNotFoundError(`Resource not found: ${input.resourceKey}`)

  if (BuddyObjectIDSchema.safeParse(trimmed).success) {
    const byID = await resolveResourceObjectByID({
      directory: input.directory,
      objectID: trimmed,
    }).catch((error: unknown) => {
      if (error instanceof ResourceNotFoundError || error instanceof BuddyObjectNotFoundError) {
        return undefined
      }
      throw error
    })
    if (byID) return byID
  }

  const aliasIndex = await readResourceAliasIndex(input.directory).catch(() =>
    rebuildResourceAliasIndex(input.directory),
  )
  const normalizedAlias = normalizeAliasToken(trimmed)
  const objectID = aliasIndex[normalizedAlias]
  if (objectID) {
    const resource = await resolveResourceObjectByID({
      directory: input.directory,
      objectID,
    }).catch((error: unknown) => {
      if (
        error instanceof BuddyObjectNotFoundError ||
        error instanceof BuddyObjectUnavailableError
      ) {
        return undefined
      }
      throw error
    })
    if (resource) return resource
  }

  const rebuilt = await rebuildResourceAliasIndex(input.directory)
  const rebuiltObjectID = rebuilt[normalizedAlias]
  if (!rebuiltObjectID) {
    const liveClaims = await findLiveResourceObjectIDsByAlias({
      directory: input.directory,
      alias: normalizedAlias,
    })
    if (liveClaims.length > 1) {
      throw new ResourceAmbiguousAliasError(normalizedAlias, liveClaims)
    }
    throw new ResourceNotFoundError(`Resource not found: ${input.resourceKey}`)
  }
  return resolveResourceObjectByID({
    directory: input.directory,
    objectID: rebuiltObjectID,
  })
}

export async function resolveResourceObjectByID(input: {
  directory: string
  objectID: string
}): Promise<ResourceObjectResolved> {
  const manifest = await readResourceObjectManifest(input.directory, input.objectID)
  return resourceManifestToResolved(input.directory, manifest)
}

export async function listResolvedResourceObjects(input: {
  directory: string
}): Promise<ResourceObjectResolved[]> {
  const listed = await listObjects({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.resource,
  })
  const resources = await Promise.all(
    listed.objects.map((object) =>
      resolveResourceObjectByID({
        directory: input.directory,
        objectID: object.objectID,
      }).catch((error: unknown) => {
        if (error instanceof ResourceNotFoundError) return undefined
        throw error
      }),
    ),
  )
  return resources
    .filter((resource): resource is ResourceObjectResolved => resource !== undefined)
    .toSorted((left, right) => left.alias.localeCompare(right.alias))
}

export async function resolveResourcePackPaths(input: {
  directory: string
  objectID: string
}): Promise<{
  packRoot: string
  resourceMarkdownPath: string | null
  tocPath: string | null
  fullTextPath: string | null
}> {
  const resource = await resolveResourceObjectByID(input)
  return {
    packRoot: resourcePackDisplayRootPath(input.objectID),
    resourceMarkdownPath: resource.entrypointPath,
    tocPath: resource.tocPath,
    fullTextPath: resource.fullTextPath,
  }
}

async function runResourceObjectPackBuild(input: ResourceObjectPackBuildInput): Promise<void> {
  const sourceStat = await fs.stat(input.sourcePath)
  const sourceRelpath =
    path.relative(input.directory, input.sourcePath) || path.basename(input.sourcePath)
  await ensureResourcePackWithBuildInput(
    {
      directory: input.directory,
      sourcePath: input.sourcePath,
      sourceRelpath,
      sourceStat,
      classification: classifyResourcePath(input.sourcePath, Number(sourceStat.size)),
      packPaths: {
        rootPath: input.derivedPackRoot,
        metadataPath: input.metadataPath,
        entrypointPath: input.entrypointPath,
        fullPath: input.fullTextPath,
        tocPath: input.tocPath,
        chunksDirPath: input.chunksDirPath,
        pagesDirPath: input.pagesDirPath,
      },
      objectID: input.objectID,
      resourceAlias: input.alias,
    },
    { waitForCompletion: true },
  )
}

export async function buildResourceObjectPack(
  input: ResourceObjectPackBuildInput,
): Promise<ResourceObjectResolved> {
  await runResourceObjectPackBuild(input)
  return resolveResourceObjectByID({
    directory: input.directory,
    objectID: input.objectID,
  })
}

export function mapResourceRouteError(error: unknown): Response | undefined {
  if (error instanceof ResourceValidationError || error instanceof BuddyObjectValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof ResourceNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return mapBuddyObjectRouteError(error)
}

registerBuddyObjectKind({
  kind: BUDDY_OBJECT_KINDS.resource,
  manifestSchema: BuddyObjectManifestSchema.safeExtend({
    summary: ResourceObjectSummarySchema,
  }),
  async readManifest(input) {
    return readResourceObjectManifest(input.directory, input.ref.objectID)
  },
  async readView(input) {
    return readResourceObjectView({
      directory: input.directory,
      objectID: input.ref.objectID,
      viewID: input.viewID,
    })
  },
  async resolveBenchView(input) {
    if (input.viewID !== RESOURCE_READER_VIEW_ID) {
      return {
        status: "blocked",
        reason: "unsupported_resource_view",
        message: `Unsupported resource Bench view: ${input.viewID}`,
      }
    }
    const resource = await resolveResourceObjectByID({
      directory: input.directory,
      objectID: input.ref.objectID,
    })
    if (!resource.readerPath) {
      return {
        status: "blocked",
        reason: "bench_reader_none",
        message: `Resource ${resource.alias} cannot be presented on Bench reading mode because it is not backed by a PDF or EPUB source.`,
      }
    }
    const validation = await validateReaderSourcePath(
      path.resolve(input.directory, resource.readerPath),
    )
    if (validation.sourceValidity !== "valid") {
      return {
        status: "blocked",
        reason: "invalid_reader_source",
        message: `Resource ${resource.alias} cannot be presented because its reader source is invalid: ${validation.reason ?? "validation failed"}`,
      }
    }
    return {
      status: "ready",
      target: {
        type: "object",
        ref: {
          kind: BUDDY_OBJECT_KINDS.resource,
          objectID: resource.objectID,
          revisionID: null,
          itemID: null,
        },
        viewID: RESOURCE_READER_VIEW_ID,
      },
    }
  },
  async delete(input) {
    await removeResource({
      directory: input.directory,
      objectID: input.ref.objectID,
    })
  },
})

async function readResourceObjectView(input: {
  directory: string
  objectID: string
  viewID: string
}): Promise<BuddyObjectViewResponse> {
  const resource = await resolveResourceObjectByID({
    directory: input.directory,
    objectID: input.objectID,
  })
  const ref = {
    kind: BUDDY_OBJECT_KINDS.resource,
    objectID: resource.objectID,
    revisionID: null,
    itemID: null,
  }
  if (input.viewID === RESOURCE_READER_VIEW_ID) {
    return BuddyObjectViewResponseSchema.parse({
      ref,
      viewID: RESOURCE_READER_VIEW_ID,
      title: resource.title ?? resource.alias,
      data: {
        renderer: "resource-reader",
        objectID: resource.objectID,
        alias: resource.alias,
        title: resource.title ?? resource.alias,
        status: resource.status,
        sourceValidity: resource.sourceValidity,
        extractionStatus: resource.extractionStatus,
        readerPath: resource.readerPath,
        packPath: resource.packPath,
        fullTextPath: resource.fullTextPath,
        warnings: resource.warnings,
      },
    })
  }
  if (input.viewID === RESOURCE_LIBRARY_VIEW_ID) {
    return BuddyObjectViewResponseSchema.parse({
      ref,
      viewID: RESOURCE_LIBRARY_VIEW_ID,
      title: resource.title ?? resource.alias,
      data: {
        renderer: "library",
        title: resource.title ?? resource.alias,
        subtitle: resource.format,
        badge: resource.status,
        thumbnailUrl: null,
        metrics: [
          { label: "alias", value: resource.alias },
          { label: "full_text_tokens", value: resource.fullTextEstimatedTokens },
        ],
      },
    })
  }
  if (input.viewID === RESOURCE_SOURCE_VIEW_ID) {
    const sourceRoot = path.posix.join(resource.objectPath, OBJECT_SOURCE_DIRECTORY_NAME)
    const sourcePath = resource.managedSourceRef.workspacePath ?? resource.managedSourceRef.path
    return BuddyObjectViewResponseSchema.parse({
      ref,
      viewID: RESOURCE_SOURCE_VIEW_ID,
      title: resource.title ?? resource.alias,
      data: {
        renderer: "source",
        sourceRoot,
        entryPath: path.posix.basename(sourcePath),
        files: [
          {
            path: path.posix.basename(sourcePath),
            kind: "file",
            ...(resource.sourceSizeBytes !== null ? { sizeBytes: resource.sourceSizeBytes } : {}),
          },
        ],
        content: null,
      },
    })
  }
  throw new BuddyObjectValidationError(`Unsupported resource view: ${input.viewID}`)
}

function stripRegisteredResourceRecord(record: ResourceRecord): ResourceRecord {
  return {
    objectID: record.objectID,
    alias: record.alias,
    sourceRelpath: record.sourceRelpath,
    ...(record.sourceOriginRelpath ? { sourceOriginRelpath: record.sourceOriginRelpath } : {}),
    format: record.format,
    status: record.status,
    sourceValidity: record.sourceValidity,
    extractionStatus: record.extractionStatus,
    warnings: record.warnings,
    ...(record.preparedAt ? { preparedAt: record.preparedAt } : {}),
    ...(record.sourceMtimeMs !== undefined ? { sourceMtimeMs: record.sourceMtimeMs } : {}),
    ...(record.sourceSizeBytes !== undefined ? { sourceSizeBytes: record.sourceSizeBytes } : {}),
    ...(record.coverRelpath ? { coverRelpath: record.coverRelpath } : {}),
    ...(record.title ? { title: record.title } : {}),
    ...(record.author ? { author: record.author } : {}),
    ...(record.packPath ? { packPath: record.packPath } : {}),
    ...(record.fullTextPath ? { fullTextPath: record.fullTextPath } : {}),
    ...(record.fullTextEstimatedTokens !== undefined
      ? { fullTextEstimatedTokens: record.fullTextEstimatedTokens }
      : {}),
    ...(record.fullTextCharacters !== undefined
      ? { fullTextCharacters: record.fullTextCharacters }
      : {}),
    ...(record.readerPath ? { readerPath: record.readerPath } : {}),
  }
}

function resourceResolvedToRegisteredRecord(resource: ResourceObjectResolved): ResourceRecord {
  const sourceRelpath = resource.managedSourceRef.workspacePath ?? resource.managedSourceRef.path
  const sourceOriginRelpath = resource.originalSourceRef?.workspacePath ?? undefined
  return {
    objectID: resource.objectID,
    alias: resource.alias,
    sourceRelpath,
    ...(sourceOriginRelpath ? { sourceOriginRelpath } : {}),
    format: resource.format,
    status: resource.status,
    sourceValidity: resource.sourceValidity,
    extractionStatus: resource.extractionStatus,
    warnings: resource.warnings,
    ...(resource.preparedAt ? { preparedAt: resource.preparedAt } : {}),
    ...(resource.sourceMtimeMs !== null ? { sourceMtimeMs: resource.sourceMtimeMs } : {}),
    ...(resource.sourceSizeBytes !== null ? { sourceSizeBytes: resource.sourceSizeBytes } : {}),
    ...(resource.coverRelpath ? { coverRelpath: resource.coverRelpath } : {}),
    ...(resource.title ? { title: resource.title } : {}),
    ...(resource.author ? { author: resource.author } : {}),
    ...(resource.packPath ? { packPath: resource.packPath } : {}),
    ...(resource.fullTextPath ? { fullTextPath: resource.fullTextPath } : {}),
    ...(resource.fullTextEstimatedTokens !== null
      ? { fullTextEstimatedTokens: resource.fullTextEstimatedTokens }
      : {}),
    ...(resource.fullTextCharacters !== null
      ? { fullTextCharacters: resource.fullTextCharacters }
      : {}),
    ...(resource.readerPath ? { readerPath: resource.readerPath } : {}),
  }
}

async function createResourceObject(input: {
  directory: string
  sourcePath: string
  sourceStat: Awaited<ReturnType<typeof fs.stat>>
  sourceValidation: ReaderSourceValidation
  requestedAlias?: string
}): Promise<BuddyObjectManifest> {
  return withResourceAliasIndexMutationLock(input.directory, () =>
    createResourceObjectUnlocked(input),
  )
}

async function createResourceObjectUnlocked(input: {
  directory: string
  sourcePath: string
  sourceStat: Awaited<ReturnType<typeof fs.stat>>
  sourceValidation: ReaderSourceValidation
  requestedAlias?: string
}): Promise<BuddyObjectManifest> {
  const objectID = generateObjectID()
  const fallbackAlias = path.basename(input.sourcePath, path.extname(input.sourcePath))
  const alias = await pickUniqueResourceAlias({
    directory: input.directory,
    requestedAlias: input.requestedAlias,
    fallbackAlias,
  })
  const sourceFilename = path.basename(input.sourcePath)
  const managedSourceDisplayPath = path.posix.join(
    BuddyObjectPath.relativeObjectDirectory(BUDDY_OBJECT_KINDS.resource, objectID),
    OBJECT_SOURCE_DIRECTORY_NAME,
    sourceFilename,
  )
  const sourceOriginRelpath = isPathInsideWorkspace(input.directory, input.sourcePath)
    ? relativeDisplayPath(input.directory, input.sourcePath)
    : undefined
  const originalSourceRef = buildOriginalSourceRef({
    sourcePath: input.sourcePath,
    sourceOriginRelpath,
    sourceStat: input.sourceStat,
  })
  const managedSourceRef = buildManagedSourceRef({
    managedSourceDisplayPath,
    sourceStat: input.sourceStat,
  })
  const generationID = generateObjectID()
  const now = new Date().toISOString()
  const classification = classifyResourcePath(input.sourcePath, Number(input.sourceStat.size))
  const manifest = BuddyObjectManifestSchema.parse({
    version: 1,
    kind: BUDDY_OBJECT_KINDS.resource,
    objectID,
    title: alias,
    status: RESOURCE_PACK_STATUS_PREPARING,
    lifecycle: "imported",
    createdAt: now,
    updatedAt: now,
    sourceRefs: originalSourceRef ? [originalSourceRef, managedSourceRef] : [managedSourceRef],
    views: buildResourceObjectViews(objectID),
    summary: ResourceObjectSummarySchema.parse({
      kind: BUDDY_OBJECT_KINDS.resource,
      alias,
      format: classification.format,
      sourceValidity: input.sourceValidation.sourceValidity,
      extractionStatus: RESOURCE_PACK_STATUS_PREPARING,
      generationID,
      preparedAt: null,
      fullTextPath: null,
      fullTextEstimatedTokens: null,
      fullTextCharacters: null,
      readerPath: null,
      warnings: [RESOURCE_PACK_PREPARING_WARNING],
    }),
  })

  await writeObjectRecord({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.resource,
    objectID,
    manifest,
    files: [
      {
        relativePath: path.join(OBJECT_SOURCE_DIRECTORY_NAME, sourceFilename),
        sourcePath: input.sourcePath,
        format: "copy",
      },
    ],
  })
  await rebuildResourceAliasIndexUnlocked(input.directory)
  return manifest
}

function buildResourceObjectViews(objectID: string): BuddyObjectManifest["views"] {
  const sourceRoot = path.posix.join(
    BuddyObjectPath.relativeObjectDirectory(BUDDY_OBJECT_KINDS.resource, objectID),
    OBJECT_SOURCE_DIRECTORY_NAME,
  )
  return [
    {
      viewID: RESOURCE_READER_VIEW_ID,
      label: "Reader",
      surfaces: ["bench", "context"],
      availability: { status: "available" },
      bench: { resolver: "object-view" },
      context: {
        toolID: "bench_read_context",
        refs: [{ label: "resource", value: objectID }],
      },
    },
    {
      viewID: RESOURCE_SOURCE_VIEW_ID,
      label: "Source",
      surfaces: ["source"],
      availability: { status: "available" },
      source: { sourceRoot },
    },
    {
      viewID: RESOURCE_LIBRARY_VIEW_ID,
      label: "Library",
      surfaces: ["library"],
      availability: { status: "available" },
      library: { section: "resources" },
    },
  ]
}

function buildOriginalSourceRef(input: {
  sourcePath: string
  sourceOriginRelpath?: string
  sourceStat: Awaited<ReturnType<typeof fs.stat>>
}): BuddyObjectSourceRef | null {
  if (!input.sourceOriginRelpath) return null
  return {
    role: RESOURCE_OBJECT_SOURCE_ROLE_ORIGINAL,
    path: input.sourceOriginRelpath,
    displayPath: input.sourceOriginRelpath,
    workspacePath: input.sourceOriginRelpath,
    mutable: false,
    copied: false,
    availability: "available",
    exists: true,
    sizeBytes: Number(input.sourceStat.size),
    modifiedAt: input.sourceStat.mtime.toISOString(),
  }
}

function buildManagedSourceRef(input: {
  managedSourceDisplayPath: string
  sourceStat: Awaited<ReturnType<typeof fs.stat>>
}): BuddyObjectSourceRef {
  return {
    role: RESOURCE_OBJECT_SOURCE_ROLE_MANAGED,
    path: input.managedSourceDisplayPath,
    displayPath: input.managedSourceDisplayPath,
    workspacePath: input.managedSourceDisplayPath,
    mutable: false,
    copied: true,
    availability: "available",
    exists: true,
    sizeBytes: Number(input.sourceStat.size),
    modifiedAt: input.sourceStat.mtime.toISOString(),
  }
}

async function prepareResourceObject(input: {
  directory: string
  objectID: string
  generationID?: string
}): Promise<void> {
  const key = preparationKey(input.directory, input.objectID)
  const existing = inFlightResourcePreparation.get(key)
  if (existing) return existing

  const task = prepareResourceObjectInternal(input)
    .catch(() => undefined)
    .finally(() => {
      inFlightResourcePreparation.delete(key)
    })

  inFlightResourcePreparation.set(key, task)
  return task
}

async function prepareResourceObjectInternal(input: {
  directory: string
  objectID: string
  generationID?: string
}): Promise<void> {
  const manifest = await readResourceObjectManifest(input.directory, input.objectID)
  const generationID = input.generationID ?? manifest.summary.generationID ?? generateObjectID()
  const sourcePath = managedSourceAbsolutePath(input.directory, manifest)
  const sourceValidation = await validateReaderSourcePath(sourcePath)
  if (sourceValidation.sourceValidity === "invalid") {
    const warning = sourceValidation.reason ?? "The reader source file is invalid."
    const invalid = BuddyObjectManifestSchema.parse({
      ...manifest,
      status: RESOURCE_PACK_STATUS_ERROR,
      updatedAt: new Date().toISOString(),
      summary: ResourceObjectSummarySchema.parse({
        ...manifest.summary,
        sourceValidity: "invalid",
        extractionStatus: RESOURCE_PACK_STATUS_ERROR,
        readerPath: null,
        warnings: [warning],
      }),
    })
    await writeObjectManifest({ directory: input.directory, manifest: invalid })
    return
  }
  const alias = manifest.summary.alias
  const packRoot = resourcePackRootPath(input.directory, input.objectID)
  const stagingPackRoot = resourcePackStagingRootPath({
    directory: input.directory,
    objectID: input.objectID,
    generationID,
  })

  await fs.rm(stagingPackRoot, { recursive: true, force: true })
  let promoted = false
  try {
    await runResourceObjectPackBuild({
      directory: input.directory,
      objectID: input.objectID,
      generationID,
      alias,
      sourcePath,
      derivedPackRoot: stagingPackRoot,
      metadataPath: path.join(stagingPackRoot, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
      entrypointPath: path.join(stagingPackRoot, RESOURCE_PACK_ENTRYPOINT_FILE_NAME),
      tocPath: path.join(stagingPackRoot, RESOURCE_PACK_TOC_FILE_NAME),
      fullTextPath: path.join(stagingPackRoot, RESOURCE_PACK_FULL_TEXT_FILE_NAME),
      chunksDirPath: path.join(stagingPackRoot, RESOURCE_PACK_CHUNKS_DIR_NAME),
      pagesDirPath: path.join(stagingPackRoot, RESOURCE_PACK_PAGES_DIR_NAME),
    })

    const metadata = await readResourcePackMetadataFromPackRoot(stagingPackRoot)
    const fullText = await resolveResourcePackFullTextMetadataFromRoot({
      directory: input.directory,
      packRootPath: stagingPackRoot,
      displayRootPath: resourcePackDisplayRootPath(input.objectID),
    })
    const sourceStat = await fs.stat(sourcePath)
    await withResourceAliasIndexMutationLock(input.directory, async () => {
      const current = await readResourceObjectManifest(input.directory, input.objectID).catch(
        () => undefined,
      )
      if (!current || current.summary.generationID !== generationID) {
        return
      }

      await fs.rm(packRoot, { recursive: true, force: true })
      await fs.mkdir(path.dirname(packRoot), { recursive: true })
      await fs.rename(stagingPackRoot, packRoot)
      promoted = true

      const readerPath = await resolveResourceReaderPath({
        directory: input.directory,
        managedSourceRef: current.sourceRefs.find(
          (ref) => ref.role === RESOURCE_OBJECT_SOURCE_ROLE_MANAGED,
        ),
        originalSourceRef:
          current.sourceRefs.find((ref) => ref.role === RESOURCE_OBJECT_SOURCE_ROLE_ORIGINAL) ??
          null,
      })
      const status = metadata?.status ?? RESOURCE_PACK_STATUS_ERROR
      const updated = BuddyObjectManifestSchema.parse({
        ...current,
        status,
        title: metadata?.title ?? current.title,
        updatedAt: new Date().toISOString(),
        sourceRefs: current.sourceRefs.map((ref) =>
          ref.role === RESOURCE_OBJECT_SOURCE_ROLE_MANAGED
            ? {
                ...ref,
                sizeBytes: Number(sourceStat.size),
                modifiedAt: sourceStat.mtime.toISOString(),
              }
            : ref,
        ),
        summary: ResourceObjectSummarySchema.parse({
          ...current.summary,
          format: metadata?.format ?? current.summary.format,
          sourceValidity: sourceValidation.sourceValidity,
          extractionStatus: status,
          generationID,
          preparedAt: metadata?.preparedAt ?? null,
          fullTextPath: fullText?.fullTextPath ?? null,
          fullTextEstimatedTokens: fullText?.fullTextEstimatedTokens ?? null,
          fullTextCharacters: fullText?.fullTextChars ?? null,
          readerPath,
          warnings: metadata?.warnings ?? [RESOURCE_SOURCE_MANIFEST_STALE_WARNING],
        }),
      })
      await writeObjectManifest({ directory: input.directory, manifest: updated })
      await rebuildResourceAliasIndexUnlocked(input.directory)
    })
  } finally {
    if (!promoted) {
      await fs.rm(stagingPackRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function readResourceObjectManifest(
  directory: string,
  objectID: string,
): Promise<
  BuddyObjectManifest & { summary: ReturnType<typeof ResourceObjectSummarySchema.parse> }
> {
  const manifest = await readObjectManifest({
    directory,
    kind: BUDDY_OBJECT_KINDS.resource,
    objectID,
  })
  return BuddyObjectManifestSchema.safeExtend({
    summary: ResourceObjectSummarySchema,
  }).parse(manifest)
}

async function resourceManifestToResolved(
  directory: string,
  manifest: BuddyObjectManifest & { summary: ReturnType<typeof ResourceObjectSummarySchema.parse> },
): Promise<ResourceObjectResolved> {
  const managedSourceRef = manifest.sourceRefs.find(
    (ref) => ref.role === RESOURCE_OBJECT_SOURCE_ROLE_MANAGED,
  )
  if (!managedSourceRef) {
    throw new ResourceValidationError(`Resource object ${manifest.objectID} has no managed source.`)
  }
  const originalSourceRef =
    manifest.sourceRefs.find((ref) => ref.role === RESOURCE_OBJECT_SOURCE_ROLE_ORIGINAL) ?? null
  const packRoot = resourcePackRootPath(directory, manifest.objectID)
  const entrypointPath = (await fileExists(path.join(packRoot, RESOURCE_PACK_ENTRYPOINT_FILE_NAME)))
    ? path.posix.join(
        resourcePackDisplayRootPath(manifest.objectID),
        RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
      )
    : null
  const tocPath = (await fileExists(path.join(packRoot, RESOURCE_PACK_TOC_FILE_NAME)))
    ? path.posix.join(resourcePackDisplayRootPath(manifest.objectID), RESOURCE_PACK_TOC_FILE_NAME)
    : null
  const metadata = await readResourcePackMetadataFromPackRoot(packRoot)
  const displayPackRoot = resourcePackDisplayRootPath(manifest.objectID)
  const coverRelpath = await resolveResourcePackCoverRelpath({
    directory,
    packRoot,
    displayPackRoot,
    metadataCoverRelpath: metadata?.coverRelpath,
  })
  const fullText = await resolveResourcePackFullTextMetadataFromRoot({
    directory,
    packRootPath: packRoot,
    displayRootPath: displayPackRoot,
  })
  const originalSourceChanged = await resourceOriginalSourceChanged({
    directory,
    originalSourceRef: originalSourceRef ?? null,
  })
  const status =
    manifest.status === RESOURCE_PACK_STATUS_READY && originalSourceChanged
      ? "stale"
      : (manifest.status as ResourceStatus)
  const warnings =
    manifest.status === RESOURCE_PACK_STATUS_READY && originalSourceChanged
      ? [...new Set([...manifest.summary.warnings, RESOURCE_STALE_WARNING])]
      : manifest.summary.warnings
  const readerPath = await resolveResourceReaderPath({
    directory,
    managedSourceRef,
    originalSourceRef: originalSourceRef ?? null,
  })
  return {
    objectID: manifest.objectID,
    alias: manifest.summary.alias,
    title: metadata?.title ?? (manifest.title === manifest.summary.alias ? null : manifest.title),
    status,
    sourceValidity: originalSourceChanged ? "unknown" : manifest.summary.sourceValidity,
    extractionStatus:
      manifest.status === RESOURCE_PACK_STATUS_READY && originalSourceChanged
        ? "stale"
        : manifest.summary.extractionStatus === RESOURCE_PACK_STATUS_PREPARING &&
            manifest.status !== RESOURCE_PACK_STATUS_PREPARING
          ? (manifest.status as ResourceStatus)
          : manifest.summary.extractionStatus,
    managedSourceRef,
    originalSourceRef,
    objectPath: BuddyObjectPath.relativeObjectDirectory(
      BUDDY_OBJECT_KINDS.resource,
      manifest.objectID,
    ),
    entrypointPath,
    tocPath,
    packPath: (await directoryExists(packRoot)) ? displayPackRoot : null,
    fullTextPath: fullText?.fullTextPath ?? null,
    fullTextEstimatedTokens:
      fullText?.fullTextEstimatedTokens ?? manifest.summary.fullTextEstimatedTokens,
    fullTextCharacters: fullText?.fullTextChars ?? manifest.summary.fullTextCharacters,
    readerPath,
    warnings,
    format: manifest.summary.format,
    sourceMtimeMs: metadata?.sourceMtimeMs ?? null,
    sourceSizeBytes: metadata?.sourceSizeBytes ?? null,
    preparedAt: manifest.summary.preparedAt,
    coverRelpath: coverRelpath ?? null,
    author: metadata?.author ?? null,
  }
}

async function resourceOriginalSourceChanged(input: {
  directory: string
  originalSourceRef: BuddyObjectSourceRef | null
}): Promise<boolean> {
  if (!input.originalSourceRef?.workspacePath) return false
  const originalPath = path.resolve(input.directory, input.originalSourceRef.workspacePath)
  const sourceStat = await fs.stat(originalPath).catch(() => undefined)
  if (!sourceStat?.isFile()) return true

  const recordedSize = input.originalSourceRef.sizeBytes
  const recordedMtime = input.originalSourceRef.modifiedAt
  if (recordedSize !== undefined && Number(sourceStat.size) !== recordedSize) return true
  if (recordedMtime && sourceStat.mtime.toISOString() !== recordedMtime) return true
  return false
}

async function refreshManagedResourceSourceFromOriginal(input: {
  directory: string
  manifest: BuddyObjectManifest & { summary: ReturnType<typeof ResourceObjectSummarySchema.parse> }
}): Promise<
  BuddyObjectManifest & { summary: ReturnType<typeof ResourceObjectSummarySchema.parse> }
> {
  const originalSourceRef =
    input.manifest.sourceRefs.find((ref) => ref.role === RESOURCE_OBJECT_SOURCE_ROLE_ORIGINAL) ??
    null
  if (!originalSourceRef?.workspacePath) return input.manifest

  const originalPath = path.resolve(input.directory, originalSourceRef.workspacePath)
  const sourceStat = await fs.stat(originalPath).catch(() => undefined)
  if (!sourceStat?.isFile()) return input.manifest

  const managedPath = managedSourceAbsolutePath(input.directory, input.manifest)
  await fs.copyFile(originalPath, managedPath)
  const managedStat = await fs.stat(managedPath)

  const sourceRefPatch = {
    availability: "available" as const,
    exists: true,
    sizeBytes: Number(sourceStat.size),
    modifiedAt: sourceStat.mtime.toISOString(),
  }
  const managedRefPatch = {
    availability: "available" as const,
    exists: true,
    sizeBytes: Number(managedStat.size),
    modifiedAt: managedStat.mtime.toISOString(),
  }

  return BuddyObjectManifestSchema.safeExtend({
    summary: ResourceObjectSummarySchema,
  }).parse({
    ...input.manifest,
    sourceRefs: input.manifest.sourceRefs.map((ref) => {
      if (ref.role === RESOURCE_OBJECT_SOURCE_ROLE_ORIGINAL) {
        return { ...ref, ...sourceRefPatch }
      }
      if (ref.role === RESOURCE_OBJECT_SOURCE_ROLE_MANAGED) {
        return { ...ref, ...managedRefPatch }
      }
      return ref
    }),
  })
}

async function readResourcePackMetadataFromPackRoot(
  packRoot: string,
): Promise<ResourcePackMetadataSnapshot | undefined> {
  const content = await fs
    .readFile(path.join(packRoot, RESOURCE_PACK_ENTRYPOINT_FILE_NAME), "utf8")
    .catch(() => undefined)
  if (!content) return undefined
  const parsed = matter(content)
  const data = parsed.data
  if (!isPlainObject(data)) return undefined
  return {
    format: stringValue(data, "format") || undefined,
    status: normalizeResourceStatus(stringValue(data, "status")),
    warnings: stringArrayValue(data, "warnings"),
    preparedAt: stringValue(data, "prepared_at") || undefined,
    sourceMtimeMs: numberValue(data, "source_mtime_ms"),
    sourceSizeBytes: numberValue(data, "source_size_bytes"),
    coverRelpath: stringValue(data, "cover_relpath") || undefined,
    title: stringValue(data, "title") || undefined,
    author: stringValue(data, "author") || undefined,
  }
}

async function resolveResourcePackCoverRelpath(input: {
  directory: string
  packRoot: string
  displayPackRoot: string
  metadataCoverRelpath: string | undefined
}): Promise<string | undefined> {
  if (input.metadataCoverRelpath) {
    const metadataCoverPath = path.resolve(input.directory, input.metadataCoverRelpath)
    if (await fileExists(metadataCoverPath)) {
      return input.metadataCoverRelpath
    }
  }

  const entries = await fs.readdir(input.packRoot, { withFileTypes: true }).catch(() => [])
  const cover = entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith(`${RESOURCE_PACK_COVER_FILE_PREFIX}.`),
    )
    .map((entry) => entry.name)
    .toSorted()[0]
  return cover ? path.posix.join(input.displayPackRoot, cover) : undefined
}

async function resolveResourceReaderPath(input: {
  directory: string
  managedSourceRef: BuddyObjectSourceRef | undefined
  originalSourceRef: BuddyObjectSourceRef | null
}): Promise<string | null> {
  const originalReader = input.originalSourceRef?.workspacePath
    ? await resolveBenchReadingResourceRelpath({
        directory: input.directory,
        sourceRelpath: input.originalSourceRef.workspacePath,
      })
    : undefined
  if (originalReader) return originalReader

  const managedReader = input.managedSourceRef?.workspacePath
    ? await resolveBenchReadingResourceRelpath({
        directory: input.directory,
        sourceRelpath: input.managedSourceRef.workspacePath,
      })
    : undefined
  return managedReader ?? null
}

async function readResourceAliasIndex(directory: string): Promise<ResourceAliasIndex> {
  return readJsonFile(resourceAliasIndexPath(directory), zodResourceAliasIndexSchema())
}

async function rebuildResourceAliasIndex(directory: string): Promise<ResourceAliasIndex> {
  return withResourceAliasIndexMutationLock(directory, () =>
    rebuildResourceAliasIndexUnlocked(directory),
  )
}

async function rebuildResourceAliasIndexUnlocked(directory: string): Promise<ResourceAliasIndex> {
  const listed = await listObjects({
    directory,
    kind: BUDDY_OBJECT_KINDS.resource,
  })
  const manifests = await Promise.all(
    listed.objects.map((object) =>
      readResourceObjectManifest(directory, object.objectID).catch(() => undefined),
    ),
  )
  const index: ResourceAliasIndex = {}
  const duplicateAliases = new Set<string>()
  for (const manifest of manifests) {
    if (!manifest) continue
    const alias = normalizeAliasToken(manifest.summary.alias)
    if (!alias) continue
    if (index[alias]) {
      duplicateAliases.add(alias)
      delete index[alias]
      continue
    }
    if (!duplicateAliases.has(alias)) {
      index[alias] = manifest.objectID
    }
  }
  await writeJsonFileAtomic(resourceAliasIndexPath(directory), index)
  return index
}

async function findLiveResourceObjectIDsByAlias(input: {
  directory: string
  alias: string
}): Promise<string[]> {
  const normalizedAlias = normalizeAliasToken(input.alias)
  if (!normalizedAlias) return []
  const listed = await listObjects({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.resource,
  })
  const manifests = await Promise.all(
    listed.objects.map((object) =>
      readResourceObjectManifest(input.directory, object.objectID).catch(() => undefined),
    ),
  )
  return manifests
    .filter(
      (
        manifest,
      ): manifest is BuddyObjectManifest & {
        summary: ReturnType<typeof ResourceObjectSummarySchema.parse>
      } =>
        manifest !== undefined && normalizeAliasToken(manifest.summary.alias) === normalizedAlias,
    )
    .map((manifest) => manifest.objectID)
    .toSorted()
}

async function assertAliasAvailable(input: {
  directory: string
  alias: string
  exceptObjectID?: string
}): Promise<void> {
  const claimedObjectIDs = await findLiveResourceObjectIDsByAlias({
    directory: input.directory,
    alias: input.alias,
  })
  const conflictingObjectID = claimedObjectIDs.find((objectID) => objectID !== input.exceptObjectID)
  if (conflictingObjectID) {
    throw new ResourceValidationError(`Resource alias already exists: ${input.alias}`)
  }
  await rebuildResourceAliasIndexUnlocked(input.directory)
}

async function pickUniqueResourceAlias(input: {
  directory: string
  requestedAlias?: string
  fallbackAlias: string
}): Promise<string> {
  const index = await rebuildResourceAliasIndexUnlocked(input.directory)
  const existingAliases = new Set(Object.keys(index))
  return pickResourceAlias({
    requestedAlias: input.requestedAlias,
    fallbackAlias: input.fallbackAlias,
    existingAliases,
  })
}

function zodResourceAliasIndexSchema() {
  return z.record(z.string().trim().min(1), BuddyObjectIDSchema)
}

function resourceAliasIndexPath(directory: string): string {
  return path.join(
    BuddyObjectPath.kindIndexRoot(directory, BUDDY_OBJECT_KINDS.resource),
    RESOURCE_ALIAS_INDEX_FILE_NAME,
  )
}

function managedSourceAbsolutePath(directory: string, manifest: BuddyObjectManifest): string {
  const sourceRef = manifest.sourceRefs.find(
    (ref) => ref.role === RESOURCE_OBJECT_SOURCE_ROLE_MANAGED,
  )
  if (!sourceRef?.workspacePath) {
    throw new ResourceValidationError(`Resource object ${manifest.objectID} has no managed source.`)
  }
  return path.resolve(directory, sourceRef.workspacePath)
}

function resourcePackRootPath(directory: string, objectID: string): string {
  return path.join(
    BuddyObjectPath.objectDirectory(directory, BUDDY_OBJECT_KINDS.resource, objectID),
    OBJECT_DERIVED_DIRECTORY_NAME,
    RESOURCE_PACK_DIRECTORY_NAME,
  )
}

function resourcePackStagingRootPath(input: {
  directory: string
  objectID: string
  generationID: string
}): string {
  return path.join(
    BuddyObjectPath.objectDirectory(input.directory, BUDDY_OBJECT_KINDS.resource, input.objectID),
    OBJECT_DERIVED_DIRECTORY_NAME,
    RESOURCE_PACK_STAGING_DIRECTORY_NAME,
    input.generationID,
  )
}

function resourcePackDisplayRootPath(objectID: string): string {
  return path.posix.join(
    BuddyObjectPath.relativeObjectDirectory(BUDDY_OBJECT_KINDS.resource, objectID),
    OBJECT_DERIVED_DIRECTORY_NAME,
    RESOURCE_PACK_DIRECTORY_NAME,
  )
}

function resolveInputSourcePath(directory: string, rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) throw new ResourceValidationError(RESOURCE_SOURCE_PATH_REQUIRED_ERROR)
  return path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(directory, trimmed)
}

function pickResourceAlias(input: {
  requestedAlias?: string
  fallbackAlias: string
  existingAliases: Set<string>
}): string {
  const requestedAlias = normalizeAliasToken(input.requestedAlias)
  const fallbackAlias = normalizeAliasToken(input.fallbackAlias) || RESOURCE_ALIAS_DEFAULT
  const baseAlias = requestedAlias || fallbackAlias
  if (!input.existingAliases.has(baseAlias)) return baseAlias

  let index = 2
  while (true) {
    const candidate = `${baseAlias}-${index}`
    if (!input.existingAliases.has(candidate)) return candidate
    index += 1
  }
}

function normalizeAliasToken(value: string | undefined): string {
  if (!value) return ""
  return value
    .trim()
    .toLowerCase()
    .replace(RESOURCE_ALIAS_REPLACE_REGEX, "-")
    .replace(RESOURCE_ALIAS_TRIM_REGEX, "")
}

function normalizeResourceStatus(value: string): ResourceStatus | undefined {
  if (value === RESOURCE_PACK_STATUS_PREPARING) return RESOURCE_PACK_STATUS_PREPARING
  if (value === RESOURCE_PACK_STATUS_READY) return RESOURCE_PACK_STATUS_READY
  if (value === RESOURCE_PACK_STATUS_UNSUPPORTED) return RESOURCE_PACK_STATUS_UNSUPPORTED
  if (value === RESOURCE_PACK_STATUS_ERROR) return RESOURCE_PACK_STATUS_ERROR
  if (value === "stale") return "stale"
  return undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringValue(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === "string" ? value.trim() : ""
}

function stringArrayValue(record: Record<string, unknown>, key: string): string[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    const single = typeof value === "string" ? value.trim() : ""
    return single ? [single] : []
  }
  return value.filter((entry): entry is string => typeof entry === "string")
}

function numberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

async function fileExists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then((stats) => stats.isFile())
    .catch((error: unknown) => {
      if (isNodeErrorCode(error, "ENOENT")) return false
      throw error
    })
}

async function directoryExists(directoryPath: string): Promise<boolean> {
  return fs
    .stat(directoryPath)
    .then((stats) => stats.isDirectory())
    .catch((error: unknown) => {
      if (isNodeErrorCode(error, "ENOENT")) return false
      throw error
    })
}

function isPathInsideWorkspace(directory: string, targetPath: string): boolean {
  return isPathInsideDirectory(path.resolve(directory), path.resolve(targetPath))
}

function isPathInsideDirectory(parentPath: string, targetPath: string): boolean {
  const relative = path.relative(parentPath, targetPath)
  return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function relativeDisplayPath(directory: string, targetPath: string): string {
  return path.relative(directory, targetPath).split(path.sep).join("/")
}

function preparationKey(directory: string, objectID: string): string {
  return `${path.resolve(directory)}::${objectID}`
}
