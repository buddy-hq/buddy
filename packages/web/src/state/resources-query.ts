import { queryOptions, type QueryClient } from "@tanstack/react-query"
import {
  inspectReaderSourceBytes,
  readerSourceFormatFromPath,
} from "@buddy/workspace-file-policy"
import { getBuddyClient } from "@/lib/buddy-client"
import { buildProjectFileRawParameters } from "@/lib/project-file-raw-url"
import { findWorkspaceFiles } from "@/state/chat-actions"
import { loadResources, type ResourceRecord } from "@/state/resource-actions"
import {
  fileExtensionFromPath,
  fileNameFromPath,
  normalizeRelativePath,
} from "@/lib/workspace-file-paths"

const RESOURCE_QUERY_KEY_ROOT = "resources"
const RESOURCE_PROCESSED_QUERY_KEY = "processed"
const RESOURCE_COVER_QUERY_KEY = "cover"
const RESOURCE_READING_BLOB_QUERY_KEY = "reading-blob"
const RESOURCE_FILE_EXTENSION_PDF = "pdf"
const RESOURCE_FILE_EXTENSION_EPUB = "epub"
const RESOURCE_RECORD_KEY_PREFIX = "record:"
const RESOURCE_QUERY_AUTO_REFRESH_INTERVAL_MS = 1500
const RESOURCE_DISCOVERY_LIMIT = 200
const RESOURCE_STATUS_PREPARING = "preparing"
const RESOURCE_COVER_STALE_TIME_MS = 5 * 60 * 1000
const READING_BLOB_STALE_TIME_MS = 30 * 60 * 1000
const READER_SOURCE_PREFIX_BYTES = 1024

const RESOURCE_DISCOVERY_EXTENSIONS: ReadonlyArray<string> = [
  RESOURCE_FILE_EXTENSION_PDF,
  RESOURCE_FILE_EXTENSION_EPUB,
]

export type ResourceFileExtension = "pdf" | "epub"

type DiscoveredResource = {
  path: string
  name: string
  extension: ResourceFileExtension
}

export type ResourceViewStatus = ResourceRecord["status"] | "unprocessed"

export type ResourceListItem = {
  key: string
  path: string
  name: string
  extension: ResourceFileExtension
  status: ResourceViewStatus
  objectID?: string
  coverRelpath?: string
  title?: string
  author?: string
}

export type ResourceDirectoryData = {
  items: ResourceListItem[]
  processed: ResourceRecord[]
}

function isResourceFilePath(path: string) {
  const extension = fileExtensionFromPath(path)
  return extension === RESOURCE_FILE_EXTENSION_PDF || extension === RESOURCE_FILE_EXTENSION_EPUB
}

function toDiscoveredResource(path: string): DiscoveredResource | undefined {
  const normalizedPath = normalizeRelativePath(path)
  if (!normalizedPath) return undefined

  const extension = fileExtensionFromPath(normalizedPath)
  if (!isResourceFilePath(normalizedPath)) return undefined

  if (extension !== RESOURCE_FILE_EXTENSION_PDF && extension !== RESOURCE_FILE_EXTENSION_EPUB) {
    return undefined
  }

  return {
    path: normalizedPath,
    name: fileNameFromPath(normalizedPath),
    extension,
  }
}

async function discoverWorkspaceResources(directory: string): Promise<DiscoveredResource[]> {
  if (!directory) return []

  const matches = await Promise.all(
    RESOURCE_DISCOVERY_EXTENSIONS.map(async (extension) =>
      findWorkspaceFiles(directory, `.${extension}`, {
        includeDirectories: false,
        limit: RESOURCE_DISCOVERY_LIMIT,
      }),
    ),
  )

  const discovered = new Map<string, DiscoveredResource>()
  for (const matchGroup of matches) {
    for (const match of matchGroup) {
      const resource = toDiscoveredResource(match)
      if (!resource) continue
      discovered.set(resource.path, resource)
    }
  }

  return [...discovered.values()].toSorted((left, right) => left.path.localeCompare(right.path))
}

function normalizeRenderableResourcePath(path: string | undefined) {
  if (!path) return undefined

  const normalized = normalizeRelativePath(path)
  if (!normalized) return undefined

  return isResourceFilePath(normalized) ? normalized : undefined
}

function buildProcessedResourceByPath(records: ResourceRecord[]) {
  const map: Record<string, ResourceRecord> = {}

  for (const record of records) {
    const sourceRelpath = normalizeRelativePath(record.sourceRelpath)
    if (sourceRelpath) {
      map[sourceRelpath] = record
    }

    if (record.sourceOriginRelpath) {
      const sourceOriginRelpath = normalizeRelativePath(record.sourceOriginRelpath)
      if (sourceOriginRelpath) {
        map[sourceOriginRelpath] = record
      }
    }
  }

  return map
}

export function resourceFileExtensionFromFormat(format: string): ResourceFileExtension | undefined {
  if (format === RESOURCE_FILE_EXTENSION_PDF) return RESOURCE_FILE_EXTENSION_PDF
  if (format === RESOURCE_FILE_EXTENSION_EPUB) return RESOURCE_FILE_EXTENSION_EPUB
  return undefined
}

function buildResourceListItemFromProcessedRecord(
  record: ResourceRecord,
): ResourceListItem | undefined {
  const readerPath = normalizeRenderableResourcePath(record.readerPath)
  const sourceOriginPath = normalizeRenderableResourcePath(record.sourceOriginRelpath)
  const sourcePath = normalizeRenderableResourcePath(record.sourceRelpath)
  const resolvedPath = readerPath ?? sourceOriginPath ?? sourcePath
  if (!resolvedPath) return undefined

  const extension =
    (isResourceFilePath(resolvedPath) ? fileExtensionFromPath(resolvedPath) : undefined) ??
    resourceFileExtensionFromFormat(record.format)
  if (extension !== RESOURCE_FILE_EXTENSION_PDF && extension !== RESOURCE_FILE_EXTENSION_EPUB) {
    return undefined
  }

  return {
    key: `${RESOURCE_RECORD_KEY_PREFIX}${record.objectID}`,
    path: resolvedPath,
    name: fileNameFromPath(resolvedPath) || record.alias,
    extension,
    status: record.status,
    objectID: record.objectID,
    ...(record.coverRelpath ? { coverRelpath: record.coverRelpath } : {}),
    ...(record.title ? { title: record.title } : {}),
    ...(record.author ? { author: record.author } : {}),
  }
}

function buildResourceListItems(input: {
  discovered: DiscoveredResource[]
  processed: ResourceRecord[]
}) {
  const processedByPath = buildProcessedResourceByPath(input.processed)
  const discoveredPaths = new Set(input.discovered.map((resource) => resource.path))
  const items: ResourceListItem[] = []
  const seenPaths = new Set<string>()
  const seenObjectIDs = new Set<string>()

  for (const discoveredResource of input.discovered) {
    const mapped = processedByPath[discoveredResource.path]
    const preferredPath = normalizeRenderableResourcePath(mapped?.sourceOriginRelpath)
    const shouldSkipDiscoveredResource =
      !!mapped?.objectID &&
      (seenObjectIDs.has(mapped.objectID) ||
        (preferredPath !== undefined &&
          preferredPath !== discoveredResource.path &&
          discoveredPaths.has(preferredPath)))
    if (shouldSkipDiscoveredResource) {
      seenPaths.add(discoveredResource.path)
      continue
    }

    items.push({
      key: discoveredResource.path,
      path: discoveredResource.path,
      name: discoveredResource.name,
      extension: discoveredResource.extension,
      status: mapped?.status ?? "unprocessed",
      ...(mapped ? { objectID: mapped.objectID } : {}),
      ...(mapped?.coverRelpath ? { coverRelpath: mapped.coverRelpath } : {}),
      ...(mapped?.title ? { title: mapped.title } : {}),
      ...(mapped?.author ? { author: mapped.author } : {}),
    })
    seenPaths.add(discoveredResource.path)
    if (mapped?.objectID) {
      seenObjectIDs.add(mapped.objectID)
    }
  }

  for (const record of input.processed) {
    const item = buildResourceListItemFromProcessedRecord(record)
    if (!item) continue
    if (seenPaths.has(item.path)) continue

    items.push(item)
    seenPaths.add(item.path)
    seenObjectIDs.add(record.objectID)
  }

  return items.toSorted((left, right) => left.path.localeCompare(right.path))
}

export type ResourceReadingTarget = {
  path: string
  name: string
  objectID?: string
  status?: ResourceViewStatus
}

export const RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT = "current" as const
export const RESOURCE_OPEN_SESSION_PREFERENCE_LINKED = "linked" as const

export type ResourceOpenSessionPreference =
  | typeof RESOURCE_OPEN_SESSION_PREFERENCE_CURRENT
  | typeof RESOURCE_OPEN_SESSION_PREFERENCE_LINKED

export type ResourceOpenOptions = {
  sessionPreference?: ResourceOpenSessionPreference
}

function toResourceReadingTarget(item: ResourceListItem): ResourceReadingTarget {
  return {
    path: item.path,
    name: item.name,
    ...(item.objectID ? { objectID: item.objectID } : {}),
    status: item.status,
  }
}

export function findProcessedResourceByKey(
  processed: ResourceRecord[],
  resourceKey: string,
): ResourceRecord | undefined {
  return processed.find((entry) => entry.alias === resourceKey || entry.objectID === resourceKey)
}

/** Same path/name resolution as the Sources catalog (`buildResourceListItems`). */
export function resolveResourceReadingTarget(
  record: ResourceRecord,
  items: ResourceListItem[],
): ResourceReadingTarget | undefined {
  const fromList = items.find((item) => item.objectID === record.objectID)
  if (fromList) {
    return toResourceReadingTarget(fromList)
  }

  const item = buildResourceListItemFromProcessedRecord(record)
  return item ? toResourceReadingTarget(item) : undefined
}

async function loadResourceDirectoryData(directory: string): Promise<ResourceDirectoryData> {
  if (!directory) {
    return {
      items: [],
      processed: [],
    }
  }

  const [discovered, processed] = await Promise.all([
    discoverWorkspaceResources(directory),
    loadResources(directory),
  ])

  return {
    items: buildResourceListItems({ discovered, processed }),
    processed,
  }
}

async function loadProjectFileBlob(directory: string, filepath: string) {
  const response = await getBuddyClient(directory).explorer.file.raw(
    buildProjectFileRawParameters(filepath),
    {
      parseAs: "blob",
    },
  )

  if (!response.response?.ok) {
    return null
  }

  return response.data ?? null
}

async function loadProjectFileBlobOrThrow(directory: string, filepath: string) {
  const response = await getBuddyClient(directory).explorer.file.raw(
    buildProjectFileRawParameters(filepath),
    {
      parseAs: "blob",
    },
  )

  if (!response.response?.ok || !response.data) {
    const message =
      response.error instanceof Error
        ? response.error.message
        : `Request failed (${response.response?.status ?? "no response"})`
    throw new Error(message)
  }

  const prefix = new Uint8Array(
    await response.data.slice(0, READER_SOURCE_PREFIX_BYTES).arrayBuffer(),
  )
  const inspection = inspectReaderSourceBytes({ path: filepath, bytes: prefix })
  if (inspection.sourceValidity === "invalid") {
    throw new Error(inspection.reason ?? "The reader source file is invalid.")
  }
  const format = readerSourceFormatFromPath(filepath)
  if (format && response.data.type === "application/octet-stream") {
    throw new Error(
      `The .${format} file failed document validation and cannot be opened in the reader.`,
    )
  }

  return response.data
}

export function resourcesQueryKey(directory: string) {
  return [RESOURCE_QUERY_KEY_ROOT, directory]
}

export function processedResourcesQueryKey(directory: string) {
  return [RESOURCE_QUERY_KEY_ROOT, RESOURCE_PROCESSED_QUERY_KEY, directory]
}

export function resourceCoverQueryKey(directory: string, coverRelpath: string) {
  return [RESOURCE_QUERY_KEY_ROOT, RESOURCE_COVER_QUERY_KEY, directory, coverRelpath]
}

export function readingResourceBlobQueryKey(directory: string, resourcePath: string) {
  return [RESOURCE_QUERY_KEY_ROOT, RESOURCE_READING_BLOB_QUERY_KEY, directory, resourcePath]
}

export function isSupportedReadingResourcePath(path: string) {
  return isResourceFilePath(path)
}

export function resourcesQueryOptions(directory: string) {
  return queryOptions({
    queryKey: resourcesQueryKey(directory),
    queryFn: () => loadResourceDirectoryData(directory),
    refetchInterval: (query) =>
      query.state.data?.processed.some((resource) => resource.status === RESOURCE_STATUS_PREPARING)
        ? RESOURCE_QUERY_AUTO_REFRESH_INTERVAL_MS
        : false,
    refetchIntervalInBackground: true,
  })
}

export function processedResourcesQueryOptions(directory: string) {
  return queryOptions({
    queryKey: processedResourcesQueryKey(directory),
    queryFn: () => loadResources(directory),
    refetchInterval: (query) =>
      query.state.data?.some((resource) => resource.status === RESOURCE_STATUS_PREPARING)
        ? RESOURCE_QUERY_AUTO_REFRESH_INTERVAL_MS
        : false,
    refetchIntervalInBackground: true,
  })
}

export function resourceCoverQueryOptions(directory: string, coverRelpath: string) {
  return queryOptions({
    queryKey: resourceCoverQueryKey(directory, coverRelpath),
    queryFn: () => loadProjectFileBlob(directory, coverRelpath),
    staleTime: RESOURCE_COVER_STALE_TIME_MS,
  })
}

export function readingResourceBlobQueryOptions(directory: string, resourcePath: string) {
  return queryOptions({
    queryKey: readingResourceBlobQueryKey(directory, resourcePath),
    queryFn: () => loadProjectFileBlobOrThrow(directory, resourcePath),
    staleTime: READING_BLOB_STALE_TIME_MS,
    retry: false,
  })
}

export async function invalidateResourcesQueries(queryClient: QueryClient, directory: string) {
  if (!directory) return

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: resourcesQueryKey(directory),
    }),
    queryClient.invalidateQueries({
      queryKey: processedResourcesQueryKey(directory),
    }),
    queryClient.invalidateQueries({
      queryKey: [RESOURCE_QUERY_KEY_ROOT, RESOURCE_COVER_QUERY_KEY, directory],
    }),
    queryClient.invalidateQueries({
      queryKey: [RESOURCE_QUERY_KEY_ROOT, RESOURCE_READING_BLOB_QUERY_KEY, directory],
    }),
  ])
}
