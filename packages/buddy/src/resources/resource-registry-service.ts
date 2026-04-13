import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import {
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_PREPARING_WARNING,
  RESOURCE_PACK_PROCESSED_DIR_NAME,
  RESOURCE_PACK_ROOT_DIR,
  RESOURCE_PACK_STATUS_ERROR,
  RESOURCE_PACK_STATUS_PREPARING,
  RESOURCE_PACK_STATUS_READY,
  RESOURCE_PACK_STATUS_UNSUPPORTED,
  RESOURCE_PACK_TOC_FILE_NAME,
  classifyResourcePath,
  ensureResourcePack,
} from "../resource-packs"
import {
  resourceSourceSnapshotMatches,
  resourceSourceVersionMatches,
} from "../resource-packs/source-match"

const RESOURCE_PREPARATION_POLL_ATTEMPTS = 20
const RESOURCE_PREPARATION_POLL_DELAY_MS = 500
const RESOURCE_ALIAS_DEFAULT = "resource" as const
const LEGACY_RESOURCE_REGISTRY_FILENAME = "registry.json" as const
const RESOURCE_ALIAS_REPLACE_REGEX = /[^a-z0-9._-]+/g
const RESOURCE_ALIAS_TRIM_REGEX = /^-+|-+$/g
const RESOURCE_SOURCE_MISSING_WARNING_PREFIX = "Resource source file not found: " as const
const RESOURCE_SOURCE_NOT_FILE_ERROR = "Resource path must point to a file." as const
const RESOURCE_SOURCE_PATH_REQUIRED_ERROR = "Resource path is required." as const
const RESOURCE_PROCESSED_METADATA_MISSING_WARNING =
  "Resource metadata is missing. Run /resource rebuild." as const
const RESOURCE_STALE_WARNING = "Source file changed since last successful preparation." as const
const RESOURCE_SOURCE_MANIFEST_FILENAME = ".buddy-source.json" as const
const RESOURCE_IDENTITY_MANIFEST_FILENAME = ".buddy-resource.json" as const

export type ResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

export type ResourceRecord = {
  id: string
  alias: string
  sourceRelpath: string
  sourceOriginRelpath?: string
  format: string
  status: ResourceStatus
  warnings: string[]
  preparedAt?: string
  sourceMtimeMs?: number
  sourceSizeBytes?: number
  coverRelpath?: string
  title?: string
  author?: string
}

type RegisteredResourceRecord = ResourceRecord & {
  packKey: string
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

type ResourcePackMetadataSnapshot = {
  sourceRelpath?: string
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

type ResourceSourceManifest = {
  sourceOriginRelpath?: string
}

type ResourceIdentityManifest = {
  resourceID: string
}

type ResourceSourceSnapshot = {
  path: string
  mtimeMs: number
  sizeBytes: number
  atime: Date
  mtime: Date
}

const inFlightResourcePreparation = new Map<string, Promise<void>>()

export class ResourceValidationError extends Error {}
export class ResourceNotFoundError extends Error {}

export async function listResources(directory: string): Promise<ResourceRecord[]> {
  const records = await listRegisteredResources(directory)
  return records.map(stripRegisteredResourceRecord)
}

export async function listRegisteredResources(
  directory: string,
): Promise<RegisteredResourceRecord[]> {
  await removeLegacyResourceRegistryFile(directory)
  const aliases = await listResourceAliases(directory)
  const records = await Promise.all(
    aliases.map(async (alias) =>
      buildRegisteredResourceRecord({
        directory,
        alias,
      }),
    ),
  )
  return records.toSorted((left, right) => left.alias.localeCompare(right.alias))
}

export async function addResource(input: {
  directory: string
  sourcePath: string
  alias?: string
}): Promise<ResourceRecord> {
  await removeLegacyResourceRegistryFile(input.directory)
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

  const staged = await stageResourceSourcePath({
    directory: input.directory,
    sourcePath: absoluteSourcePath,
    requestedAlias: input.alias,
  })

  void prepareResource(input.directory, staged.alias)
  return stripRegisteredResourceRecord(
    await buildRegisteredResourceRecord({
      directory: input.directory,
      alias: staged.alias,
      forcePreparing: true,
    }),
  )
}

export async function getResourceByKey(
  directory: string,
  key: string,
): Promise<ResourceRecord | undefined> {
  const record = await findRegisteredResourceByKey(directory, key)
  return record ? stripRegisteredResourceRecord(record) : undefined
}

export async function getRegisteredResourceByKey(
  directory: string,
  key: string,
): Promise<RegisteredResourceRecord | undefined> {
  return findRegisteredResourceByKey(directory, key)
}

export async function renameResource(input: {
  directory: string
  resourceID: string
  alias: string
}): Promise<ResourceRecord> {
  const currentAlias = await resolveResourceAliasByKey(input.directory, input.resourceID)
  const activePreparation = inFlightResourcePreparation.get(
    preparationKey(input.directory, currentAlias),
  )
  if (activePreparation) {
    await activePreparation
  }

  const aliases = await listResourceAliases(input.directory)
  const alias = pickResourceAlias({
    requestedAlias: input.alias,
    fallbackAlias: currentAlias,
    existingAliases: new Set(aliases.filter((entry) => entry !== currentAlias)),
  })

  if (alias !== currentAlias) {
    const currentFolderPath = resourceFolderPath(input.directory, currentAlias)
    const nextFolderPath = resourceFolderPath(input.directory, alias)
    await fs.rename(currentFolderPath, nextFolderPath).catch((error: unknown) => {
      if (error instanceof Error) {
        throw new ResourceValidationError(error.message)
      }
      throw new ResourceValidationError(String(error))
    })
  }

  return stripRegisteredResourceRecord(
    await buildRegisteredResourceRecord({
      directory: input.directory,
      alias,
    }),
  )
}

export async function rebuildResource(input: {
  directory: string
  resourceID: string
}): Promise<ResourceRecord> {
  const alias = await resolveResourceAliasByKey(input.directory, input.resourceID)
  const activePreparation = inFlightResourcePreparation.get(preparationKey(input.directory, alias))
  if (activePreparation) {
    await activePreparation.catch(() => undefined)
  }
  const sourcePath = await resolvePrimarySourcePathForAlias(input.directory, alias)
  if (!sourcePath) {
    throw new ResourceValidationError(
      `${RESOURCE_SOURCE_MISSING_WARNING_PREFIX}${path.join(RESOURCE_PACK_ROOT_DIR, alias)}`,
    )
  }

  await fs.rm(resourceProcessedPath(input.directory, alias), { recursive: true, force: true })

  void prepareResource(input.directory, alias)
  return stripRegisteredResourceRecord(
    await buildRegisteredResourceRecord({
      directory: input.directory,
      alias,
      forcePreparing: true,
    }),
  )
}

export async function removeResource(input: {
  directory: string
  resourceID: string
}): Promise<void> {
  const alias = await resolveResourceAliasByKey(input.directory, input.resourceID)
  const activePreparation = inFlightResourcePreparation.get(preparationKey(input.directory, alias))
  if (activePreparation) {
    await activePreparation.catch(() => undefined)
  }
  await fs.rm(resourceFolderPath(input.directory, alias), { recursive: true, force: true })
}

export async function resolveResourceReference(input: {
  directory: string
  key: string
}): Promise<ResourceUseResolution> {
  const record = await findRegisteredResourceByKey(input.directory, input.key)
  if (!record) {
    return { ok: false, reason: "not_found" }
  }
  if (record.status !== RESOURCE_PACK_STATUS_READY) {
    return { ok: false, reason: "not_ready", record }
  }

  const processedPath = resourceProcessedPath(input.directory, record.packKey)
  const entrypointPath = path.join(processedPath, RESOURCE_PACK_ENTRYPOINT_FILE_NAME)
  const tocPath = path.join(processedPath, RESOURCE_PACK_TOC_FILE_NAME)
  const entryExists = await fileExists(entrypointPath)
  if (!entryExists) {
    return { ok: false, reason: "invalid_pack", record }
  }

  const tocExists = await fileExists(tocPath)
  return {
    ok: true,
    record,
    entrypointPath,
    ...(tocExists ? { tocPath } : {}),
  }
}

export async function resolveResourceIDByKey(directory: string, key: string): Promise<string> {
  const resources = await listRegisteredResources(directory)
  const entry = resources.find((record) => record.id === key || record.alias === key)
  if (!entry) {
    throw new ResourceNotFoundError(`Resource not found: ${key}`)
  }
  return entry.id
}

function stripRegisteredResourceRecord(record: RegisteredResourceRecord): ResourceRecord {
  return {
    id: record.id,
    alias: record.alias,
    sourceRelpath: record.sourceRelpath,
    ...(record.sourceOriginRelpath ? { sourceOriginRelpath: record.sourceOriginRelpath } : {}),
    format: record.format,
    status: record.status,
    warnings: record.warnings,
    ...(record.preparedAt ? { preparedAt: record.preparedAt } : {}),
    ...(record.sourceMtimeMs !== undefined ? { sourceMtimeMs: record.sourceMtimeMs } : {}),
    ...(record.sourceSizeBytes !== undefined ? { sourceSizeBytes: record.sourceSizeBytes } : {}),
    ...(record.coverRelpath ? { coverRelpath: record.coverRelpath } : {}),
    ...(record.title ? { title: record.title } : {}),
    ...(record.author ? { author: record.author } : {}),
  }
}

async function buildRegisteredResourceRecord(input: {
  directory: string
  alias: string
  forcePreparing?: boolean
}): Promise<RegisteredResourceRecord> {
  const identity = await ensureResourceIdentityManifestForAlias(input.directory, input.alias)
  const metadata = await readResourcePackMetadataForAlias(input.directory, input.alias)
  const sourceManifest = await readResourceSourceManifestForAlias(input.directory, input.alias)
  const sourcePath = await resolvePrimarySourcePathForAlias(
    input.directory,
    input.alias,
    metadata?.sourceRelpath,
  )
  if (!sourcePath) {
    return {
      id: identity.resourceID,
      alias: input.alias,
      sourceRelpath: path.join(RESOURCE_PACK_ROOT_DIR, input.alias),
      ...(sourceManifest?.sourceOriginRelpath
        ? { sourceOriginRelpath: sourceManifest.sourceOriginRelpath }
        : {}),
      format: metadata?.format ?? "unknown",
      status: "error",
      warnings: [
        `${RESOURCE_SOURCE_MISSING_WARNING_PREFIX}${path.join(RESOURCE_PACK_ROOT_DIR, input.alias)}`,
      ],
      packKey: input.alias,
      ...(metadata?.preparedAt ? { preparedAt: metadata.preparedAt } : {}),
      ...(metadata?.coverRelpath ? { coverRelpath: metadata.coverRelpath } : {}),
      ...(metadata?.title ? { title: metadata.title } : {}),
      ...(metadata?.author ? { author: metadata.author } : {}),
    }
  }

  const sourceStat = await fs.stat(sourcePath)
  const sourceRelpath = relativeDisplayPath(input.directory, sourcePath)
  const sourceMtimeMs = Number(sourceStat.mtimeMs)
  const sourceSizeBytes = Number(sourceStat.size)
  const classification = classifyResourcePath(sourcePath, Number(sourceStat.size))
  const originSnapshot = await resolveResourceOriginSnapshot({
    directory: input.directory,
    sourceManifest,
  })

  let status: ResourceStatus
  let warnings: string[]
  let preparedAt: string | undefined

  if (input.forcePreparing || hasInFlightPreparation(input.directory, input.alias)) {
    status = RESOURCE_PACK_STATUS_PREPARING
    warnings = [RESOURCE_PACK_PREPARING_WARNING]
    preparedAt = metadata?.preparedAt
  } else if (!metadata) {
    status = RESOURCE_PACK_STATUS_ERROR
    warnings = [RESOURCE_PROCESSED_METADATA_MISSING_WARNING]
  } else {
    status = metadata.status ?? RESOURCE_PACK_STATUS_ERROR
    warnings = [...metadata.warnings]
    preparedAt = metadata.preparedAt

    const sourceChanged = !resourceSourceSnapshotMatches({
      metadataSourcePath: metadata.sourceRelpath
        ? path.resolve(input.directory, metadata.sourceRelpath)
        : undefined,
      metadataSourceRelpath: metadata.sourceRelpath,
      metadataSourceMtimeMs: metadata.sourceMtimeMs,
      metadataSourceSizeBytes: metadata.sourceSizeBytes,
      sourcePath,
      sourceRelpath,
      sourceMtimeMs,
      sourceSizeBytes,
    })
    const originChanged =
      !!originSnapshot &&
      originSnapshot.path !== sourcePath &&
      !resourceSourceVersionMatches({
        metadataSourceMtimeMs: sourceMtimeMs,
        metadataSourceSizeBytes: sourceSizeBytes,
        sourceMtimeMs: originSnapshot.mtimeMs,
        sourceSizeBytes: originSnapshot.sizeBytes,
      })
    if (status === RESOURCE_PACK_STATUS_READY && (sourceChanged || originChanged)) {
      status = "stale"
      warnings = [RESOURCE_STALE_WARNING]
    }
  }

  return {
    id: identity.resourceID,
    alias: input.alias,
    sourceRelpath,
    ...(sourceManifest?.sourceOriginRelpath
      ? { sourceOriginRelpath: sourceManifest.sourceOriginRelpath }
      : {}),
    format: metadata?.format ?? classification.format,
    status,
    warnings,
    packKey: input.alias,
    ...(preparedAt ? { preparedAt } : {}),
    sourceMtimeMs,
    sourceSizeBytes,
    ...(metadata?.coverRelpath ? { coverRelpath: metadata.coverRelpath } : {}),
    ...(metadata?.title ? { title: metadata.title } : {}),
    ...(metadata?.author ? { author: metadata.author } : {}),
  }
}

async function prepareResource(directory: string, alias: string): Promise<void> {
  const key = preparationKey(directory, alias)
  const existing = inFlightResourcePreparation.get(key)
  if (existing) return existing

  const task = prepareResourceInternal(directory, alias)
    .catch(() => undefined)
    .finally(() => {
      inFlightResourcePreparation.delete(key)
    })

  inFlightResourcePreparation.set(key, task)
  return task
}

async function prepareResourceInternal(directory: string, alias: string): Promise<void> {
  const sourcePath = await resolvePrimarySourcePathForAlias(directory, alias)
  if (!sourcePath) {
    throw new ResourceValidationError(
      `${RESOURCE_SOURCE_MISSING_WARNING_PREFIX}${path.join(RESOURCE_PACK_ROOT_DIR, alias)}`,
    )
  }
  await syncStagedSourceWithOrigin({
    directory,
    alias,
    stagedSourcePath: sourcePath,
  })

  let resolution = await ensureResourcePack({ directory, sourcePath })
  if (resolution.status === RESOURCE_PACK_STATUS_PREPARING) {
    for (let attempt = 0; attempt < RESOURCE_PREPARATION_POLL_ATTEMPTS; attempt += 1) {
      await sleep(RESOURCE_PREPARATION_POLL_DELAY_MS)
      resolution = await ensureResourcePack({ directory, sourcePath })
      if (resolution.status !== RESOURCE_PACK_STATUS_PREPARING) {
        break
      }
    }
  }
}

export function mapResourceRouteError(error: unknown): Response | undefined {
  if (error instanceof ResourceValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof ResourceNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return undefined
}

async function readResourcePackMetadataForAlias(
  directory: string,
  alias: string,
): Promise<ResourcePackMetadataSnapshot | undefined> {
  const metadataPath = path.join(
    resourceProcessedPath(directory, alias),
    RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  )
  const content = await fs.readFile(metadataPath, "utf8").catch(() => undefined)
  if (!content) return undefined

  const parsed = matter(content)
  const data = parsed.data
  if (!isPlainObject(data)) return undefined

  const rawWarnings = data.warnings
  const warnings = Array.isArray(rawWarnings)
    ? rawWarnings.filter((entry): entry is string => typeof entry === "string")
    : typeof rawWarnings === "string" && rawWarnings.trim().length > 0
      ? [rawWarnings]
      : []

  return {
    sourceRelpath: stringValue(data, "source_relpath"),
    format: stringValue(data, "format") || undefined,
    status: normalizeResourceStatus(stringValue(data, "status")),
    warnings,
    preparedAt: stringValue(data, "prepared_at") || undefined,
    sourceMtimeMs: numberValue(data, "source_mtime_ms"),
    sourceSizeBytes: numberValue(data, "source_size_bytes"),
    coverRelpath: stringValue(data, "cover_relpath") || undefined,
    title: stringValue(data, "title") || undefined,
    author: stringValue(data, "author") || undefined,
  }
}

async function readResourceSourceManifestForAlias(
  directory: string,
  alias: string,
): Promise<ResourceSourceManifest | undefined> {
  const manifestPath = path.join(
    resourceFolderPath(directory, alias),
    RESOURCE_SOURCE_MANIFEST_FILENAME,
  )
  const content = await fs.readFile(manifestPath, "utf8").catch(() => undefined)
  if (!content) return undefined

  const parsed = safeParseJson(content)
  if (!isPlainObject(parsed)) return undefined

  const sourceOriginRelpath = stringValue(parsed, "sourceOriginRelpath")
  if (!sourceOriginRelpath) return undefined

  return {
    sourceOriginRelpath,
  }
}

async function resolveResourceOriginSnapshot(input: {
  directory: string
  sourceManifest?: ResourceSourceManifest
}): Promise<ResourceSourceSnapshot | undefined> {
  const sourceOriginRelpath = input.sourceManifest?.sourceOriginRelpath?.trim()
  if (!sourceOriginRelpath) return undefined

  const originPath = path.resolve(input.directory, sourceOriginRelpath)
  if (!isPathInsideWorkspace(input.directory, originPath)) {
    return undefined
  }

  const originStat = await fs.stat(originPath).catch(() => undefined)
  if (!originStat?.isFile()) return undefined

  return {
    path: originPath,
    mtimeMs: Number(originStat.mtimeMs),
    sizeBytes: Number(originStat.size),
    atime: originStat.atime,
    mtime: originStat.mtime,
  }
}

async function ensureResourceIdentityManifestForAlias(
  directory: string,
  alias: string,
): Promise<ResourceIdentityManifest> {
  const existing = await readResourceIdentityManifestForAlias(directory, alias)
  if (existing) return existing

  const created = {
    resourceID: randomUUID(),
  } satisfies ResourceIdentityManifest
  await writeResourceIdentityManifest({
    directory,
    alias,
    manifest: created,
  })
  return created
}

async function readResourceIdentityManifestForAlias(
  directory: string,
  alias: string,
): Promise<ResourceIdentityManifest | undefined> {
  const manifestPath = path.join(
    resourceFolderPath(directory, alias),
    RESOURCE_IDENTITY_MANIFEST_FILENAME,
  )
  const content = await fs.readFile(manifestPath, "utf8").catch(() => undefined)
  if (!content) return undefined

  const parsed = safeParseJson(content)
  if (!isPlainObject(parsed)) return undefined

  const resourceID = stringValue(parsed, "resourceID")
  if (!resourceID) return undefined

  return {
    resourceID,
  }
}

async function resolvePrimarySourcePathForAlias(
  directory: string,
  alias: string,
  preferredSourceRelpath?: string,
) {
  if (preferredSourceRelpath) {
    const preferredPath = path.resolve(directory, preferredSourceRelpath)
    const parentPath = path.resolve(resourceFolderPath(directory, alias))
    if (isPathInsideDirectory(parentPath, preferredPath) && (await fileExists(preferredPath))) {
      return preferredPath
    }
  }

  const folderPath = resourceFolderPath(directory, alias)
  const entries = await fs.readdir(folderPath, { withFileTypes: true }).catch(() => [])
  const files = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .toSorted((left, right) => left.localeCompare(right))

  const firstFile = files[0]
  if (!firstFile) return undefined
  return path.join(folderPath, firstFile)
}

async function stageResourceSourcePath(input: {
  directory: string
  sourcePath: string
  requestedAlias?: string
}): Promise<{ stagedPath: string; alias: string }> {
  const existingAlias = resourceAliasFromStagedSourcePath(input.directory, input.sourcePath)
  if (existingAlias) {
    return { stagedPath: input.sourcePath, alias: existingAlias }
  }

  const resourcesRootPath = resourceRootPath(input.directory)
  await fs.mkdir(resourcesRootPath, { recursive: true })

  const fallbackAlias = path.basename(input.sourcePath, path.extname(input.sourcePath))
  const alias = await pickUniqueResourceAlias({
    resourcesRootPath,
    requestedAlias: input.requestedAlias,
    fallbackAlias,
  })

  const destinationFolderPath = resourceFolderPath(input.directory, alias)
  await fs.mkdir(destinationFolderPath, { recursive: true })

  const destinationPath = await pickUniqueDestinationPath({
    destinationFolderPath,
    sourceFilename: path.basename(input.sourcePath),
  })

  await fs.copyFile(input.sourcePath, destinationPath)

  const sourceOriginRelpath = isPathInsideWorkspace(input.directory, input.sourcePath)
    ? relativeDisplayPath(input.directory, input.sourcePath)
    : undefined

  await writeResourceSourceManifest({
    directory: input.directory,
    alias,
    sourceOriginRelpath,
  })
  await writeResourceIdentityManifest({
    directory: input.directory,
    alias,
    manifest: {
      resourceID: randomUUID(),
    },
  })

  return {
    stagedPath: destinationPath,
    alias,
  }
}

async function syncStagedSourceWithOrigin(input: {
  directory: string
  alias: string
  stagedSourcePath: string
}) {
  const sourceManifest = await readResourceSourceManifestForAlias(input.directory, input.alias)
  const originSnapshot = await resolveResourceOriginSnapshot({
    directory: input.directory,
    sourceManifest,
  })
  if (!originSnapshot) return
  if (originSnapshot.path === input.stagedSourcePath) return

  const stagedSourceStat = await fs.stat(input.stagedSourcePath).catch(() => undefined)
  if (
    stagedSourceStat?.isFile() &&
    resourceSourceVersionMatches({
      metadataSourceMtimeMs: Number(stagedSourceStat.mtimeMs),
      metadataSourceSizeBytes: Number(stagedSourceStat.size),
      sourceMtimeMs: originSnapshot.mtimeMs,
      sourceSizeBytes: originSnapshot.sizeBytes,
    })
  ) {
    return
  }

  await fs.copyFile(originSnapshot.path, input.stagedSourcePath)
  await fs.utimes(input.stagedSourcePath, originSnapshot.atime, originSnapshot.mtime)
}

async function writeResourceSourceManifest(input: {
  directory: string
  alias: string
  sourceOriginRelpath?: string
}) {
  const manifestPath = path.join(
    resourceFolderPath(input.directory, input.alias),
    RESOURCE_SOURCE_MANIFEST_FILENAME,
  )
  const payload: ResourceSourceManifest = input.sourceOriginRelpath
    ? { sourceOriginRelpath: input.sourceOriginRelpath }
    : {}
  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2))
}

async function writeResourceIdentityManifest(input: {
  directory: string
  alias: string
  manifest: ResourceIdentityManifest
}) {
  const manifestPath = path.join(
    resourceFolderPath(input.directory, input.alias),
    RESOURCE_IDENTITY_MANIFEST_FILENAME,
  )
  await fs.writeFile(manifestPath, JSON.stringify(input.manifest, null, 2))
}

async function pickUniqueResourceAlias(input: {
  resourcesRootPath: string
  requestedAlias?: string
  fallbackAlias: string
}) {
  const entries = await fs.readdir(input.resourcesRootPath, { withFileTypes: true }).catch(() => [])
  const existingAliases = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  )

  return pickResourceAlias({
    requestedAlias: input.requestedAlias,
    fallbackAlias: input.fallbackAlias,
    existingAliases,
  })
}

async function pickUniqueDestinationPath(input: {
  destinationFolderPath: string
  sourceFilename: string
}) {
  const extension = path.extname(input.sourceFilename)
  const baseName = path.basename(input.sourceFilename, extension)
  let index = 1

  while (true) {
    const candidateName =
      index === 1 ? `${baseName}${extension}` : `${baseName}-${index}${extension}`
    const candidatePath = path.join(input.destinationFolderPath, candidateName)
    const exists = await fileExists(candidatePath)
    if (!exists) return candidatePath
    index += 1
  }
}

async function resolveResourceAliasByKey(directory: string, key: string): Promise<string> {
  const trimmed = key.trim()
  if (!trimmed) throw new ResourceNotFoundError(`Resource not found: ${key}`)

  const directAliasPath = resourceFolderPath(directory, trimmed)
  if (await directoryExists(directAliasPath)) {
    return trimmed
  }

  const record = await findRegisteredResourceByKey(directory, trimmed)
  if (!record) {
    throw new ResourceNotFoundError(`Resource not found: ${key}`)
  }
  return record.alias
}

async function findRegisteredResourceByKey(
  directory: string,
  key: string,
): Promise<RegisteredResourceRecord | undefined> {
  const records = await listRegisteredResources(directory)
  return records.find((record) => record.id === key || record.alias === key)
}

async function listResourceAliases(directory: string): Promise<string[]> {
  const entries = await fs
    .readdir(resourceRootPath(directory), { withFileTypes: true })
    .catch(() => [])
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

async function removeLegacyResourceRegistryFile(directory: string) {
  const legacyRegistryPath = path.join(
    resourceRootPath(directory),
    LEGACY_RESOURCE_REGISTRY_FILENAME,
  )
  await fs.rm(legacyRegistryPath, { force: true }).catch(() => undefined)
}

function resourceAliasFromStagedSourcePath(directory: string, sourcePath: string) {
  const relpath = relativeDisplayPath(directory, sourcePath).split(path.sep).join("/")
  const segments = relpath.split("/")
  if (segments.length < 3) return undefined
  if (segments[0] !== RESOURCE_PACK_ROOT_DIR) return undefined
  if (segments[2] === RESOURCE_PACK_PROCESSED_DIR_NAME) return undefined
  return segments[1]?.trim() || undefined
}

function resourceRootPath(directory: string) {
  return path.join(directory, RESOURCE_PACK_ROOT_DIR)
}

function resourceFolderPath(directory: string, alias: string) {
  return path.join(resourceRootPath(directory), alias)
}

function resourceProcessedPath(directory: string, alias: string) {
  return path.join(resourceFolderPath(directory, alias), RESOURCE_PACK_PROCESSED_DIR_NAME)
}

function resolveInputSourcePath(directory: string, rawPath: string) {
  const trimmed = rawPath.trim()
  if (!trimmed) throw new ResourceValidationError(RESOURCE_SOURCE_PATH_REQUIRED_ERROR)
  return path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(directory, trimmed)
}

function pickResourceAlias(input: {
  requestedAlias?: string
  fallbackAlias: string
  existingAliases: Set<string>
}) {
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

function normalizeAliasToken(value: string | undefined) {
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
  return undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function stringValue(value: Record<string, unknown>, key: string) {
  const entry = value[key]
  return typeof entry === "string" ? entry : ""
}

function numberValue(value: Record<string, unknown>, key: string) {
  const entry = value[key]
  if (typeof entry === "number") return entry
  if (typeof entry === "string" && entry.trim().length > 0) {
    const parsed = Number(entry)
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function relativeDisplayPath(directory: string, filePath: string) {
  const relpath = path.relative(directory, filePath)
  return relpath.length > 0 ? relpath : path.basename(filePath)
}

function preparationKey(directory: string, alias: string) {
  return `${path.resolve(directory)}::${alias}`
}

function hasInFlightPreparation(directory: string, alias: string) {
  return inFlightResourcePreparation.has(preparationKey(directory, alias))
}

function isPathInsideWorkspace(directory: string, candidatePath: string) {
  return isPathInsideDirectory(path.resolve(directory), path.resolve(candidatePath))
}

function isPathInsideDirectory(parentPath: string, candidatePath: string) {
  const relativePath = path.relative(parentPath, candidatePath)
  if (relativePath === "") return true
  return !relativePath.startsWith("..") && !path.isAbsolute(relativePath)
}

async function fileExists(filepath: string) {
  return fs
    .stat(filepath)
    .then((entry) => entry.isFile())
    .catch(() => false)
}

async function directoryExists(filepath: string) {
  return fs
    .stat(filepath)
    .then((entry) => entry.isDirectory())
    .catch(() => false)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}
