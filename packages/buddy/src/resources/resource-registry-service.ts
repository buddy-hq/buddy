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
import { resourceSourceSnapshotMatches } from "../resource-packs/source-match"

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

export type ResourceStatus = "preparing" | "ready" | "unsupported" | "error" | "stale"

export type ResourceRecord = {
  id: string
  alias: string
  sourceRelpath: string
  format: string
  status: ResourceStatus
  warnings: string[]
  packKey?: string
  preparedAt?: string
  sourceMtimeMs?: number
  sourceSizeBytes?: number
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
}

const inFlightResourcePreparation = new Map<string, Promise<void>>()

export class ResourceValidationError extends Error {}
export class ResourceNotFoundError extends Error {}

export async function listResources(directory: string): Promise<ResourceRecord[]> {
  await removeLegacyResourceRegistryFile(directory)
  const aliases = await listResourceAliases(directory)
  const records = await Promise.all(
    aliases.map(async (alias) =>
      buildResourceRecord({
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
  return buildResourceRecord({
    directory: input.directory,
    alias: staged.alias,
    forcePreparing: true,
  })
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

  return buildResourceRecord({
    directory: input.directory,
    alias,
  })
}

export async function rebuildResource(input: {
  directory: string
  resourceID: string
}): Promise<ResourceRecord> {
  const alias = await resolveResourceAliasByKey(input.directory, input.resourceID)
  const sourcePath = await resolvePrimarySourcePathForAlias(input.directory, alias)
  if (!sourcePath) {
    throw new ResourceValidationError(
      `${RESOURCE_SOURCE_MISSING_WARNING_PREFIX}${path.join(RESOURCE_PACK_ROOT_DIR, alias)}`,
    )
  }

  void prepareResource(input.directory, alias)
  return buildResourceRecord({
    directory: input.directory,
    alias,
    forcePreparing: true,
  })
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
  const record = await findResourceByKey(input.directory, input.key)
  if (!record) {
    return { ok: false, reason: "not_found" }
  }
  if (record.status !== RESOURCE_PACK_STATUS_READY || !record.packKey) {
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
  const resources = await listResources(directory)
  const entry = resources.find((record) => record.id === key || record.alias === key)
  if (!entry) {
    throw new ResourceNotFoundError(`Resource not found: ${key}`)
  }
  return entry.id
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

async function buildResourceRecord(input: {
  directory: string
  alias: string
  forcePreparing?: boolean
}): Promise<ResourceRecord> {
  const metadata = await readResourcePackMetadataForAlias(input.directory, input.alias)
  const sourcePath = await resolvePrimarySourcePathForAlias(
    input.directory,
    input.alias,
    metadata?.sourceRelpath,
  )
  if (!sourcePath) {
    return {
      id: input.alias,
      alias: input.alias,
      sourceRelpath: path.join(RESOURCE_PACK_ROOT_DIR, input.alias),
      format: metadata?.format ?? "unknown",
      status: "error",
      warnings: [
        `${RESOURCE_SOURCE_MISSING_WARNING_PREFIX}${path.join(RESOURCE_PACK_ROOT_DIR, input.alias)}`,
      ],
      packKey: input.alias,
      ...(metadata?.preparedAt ? { preparedAt: metadata.preparedAt } : {}),
    }
  }

  const sourceStat = await fs.stat(sourcePath)
  const sourceRelpath = relativeDisplayPath(input.directory, sourcePath)
  const sourceMtimeMs = Number(sourceStat.mtimeMs)
  const sourceSizeBytes = Number(sourceStat.size)
  const classification = classifyResourcePath(sourcePath, Number(sourceStat.size))

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
    if (status === RESOURCE_PACK_STATUS_READY && sourceChanged) {
      status = "stale"
      warnings = [RESOURCE_STALE_WARNING]
    }
  }

  return {
    id: input.alias,
    alias: input.alias,
    sourceRelpath,
    format: metadata?.format ?? classification.format,
    status,
    warnings,
    packKey: input.alias,
    ...(preparedAt ? { preparedAt } : {}),
    sourceMtimeMs,
    sourceSizeBytes,
  }
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

  if (isPathInsideWorkspace(input.directory, input.sourcePath)) {
    await moveFile(input.sourcePath, destinationPath)
  } else {
    await fs.copyFile(input.sourcePath, destinationPath)
  }

  return {
    stagedPath: destinationPath,
    alias,
  }
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

async function moveFile(sourcePath: string, destinationPath: string) {
  if (sourcePath === destinationPath) return
  await fs.rename(sourcePath, destinationPath).catch(async () => {
    await fs.copyFile(sourcePath, destinationPath)
    await fs.rm(sourcePath, { force: true })
  })
}

async function resolveResourceAliasByKey(directory: string, key: string): Promise<string> {
  const trimmed = key.trim()
  if (!trimmed) throw new ResourceNotFoundError(`Resource not found: ${key}`)

  const directAliasPath = resourceFolderPath(directory, trimmed)
  if (await directoryExists(directAliasPath)) {
    return trimmed
  }

  const record = await findResourceByKey(directory, trimmed)
  if (!record) {
    throw new ResourceNotFoundError(`Resource not found: ${key}`)
  }
  return record.alias
}

async function findResourceByKey(
  directory: string,
  key: string,
): Promise<ResourceRecord | undefined> {
  const records = await listResources(directory)
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
