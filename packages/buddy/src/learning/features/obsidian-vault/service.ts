import fsp from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import z from "zod"
import {
  type WorkspaceFileWatcherEventKind,
  type WorkspaceFileWatcherUpdate,
} from "@buddy/opencode-adapter/file-watcher"
import { subscribeNativeWorkspaceFileWatcher } from "@buddy/opencode-adapter/file-watcher-native"

const OBSIDIAN_DEFAULT_CONFIG_DIRECTORY = ".obsidian"
const OBSIDIAN_CONFIG_DIRECTORY_PREFIX = ".obsidian-"
const OBSIDIAN_CONFIG_MARKER_FILES = ["app.json", "core-plugins.json"] as const
const OBSIDIAN_INDEX_MAX_FILES = 100_000
const OBSIDIAN_INDEX_CACHE_MAX_VAULTS = 4
const OBSIDIAN_ALIAS_READ_CONCURRENCY = 16
const OBSIDIAN_FRONTMATTER_READ_LIMIT_BYTES = 64 * 1024
const MARKDOWN_EXTENSION = ".md"

const OBSIDIAN_WATCHER_IGNORE_PATTERNS = [
  "**/.buddy/**",
  "**/.git/**",
  "**/.obsidian*/**",
  "**/.trash/**",
] as const

const OBSIDIAN_SKIPPED_DIRECTORY_NAMES = new Set([
  ".buddy",
  ".git",
  ".trash",
  OBSIDIAN_DEFAULT_CONFIG_DIRECTORY,
])

const OBSIDIAN_IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
])

const OBSIDIAN_MEDIA_EXTENSIONS = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".ogg",
  ".pdf",
  ".wav",
  ".webm",
])

const obsidianAliasesSchema = z.object({
  aliases: z.union([z.string(), z.array(z.string())]).optional(),
})

type ObsidianVaultDetection = {
  detected: boolean
  configDirectories: string[]
}

type ObsidianVaultEntry = {
  path: string
  basename: string
  stem: string
  extension: string
}

type ObsidianVaultIndex = {
  aliases: Map<string, ObsidianVaultEntry[]>
  aliasesByPath: Map<string, string[]>
  byBasename: Map<string, ObsidianVaultEntry[]>
  byPath: Map<string, ObsidianVaultEntry>
  byStem: Map<string, ObsidianVaultEntry[]>
  configDirectories: ReadonlySet<string>
  partial: boolean
}

type ObsidianResolvedLinkKind = "file" | "image" | "markdown" | "media"

type ObsidianResolvedLink = {
  target: string
  status: "resolved" | "unresolved"
  path?: string
  fragment?: string
  kind?: ObsidianResolvedLinkKind
}

type ObsidianVaultIndexCacheEntry = {
  task: Promise<ObsidianVaultIndex>
  updateTask: Promise<void>
  close(): Promise<void>
}

const vaultIndexCache = new Map<string, ObsidianVaultIndexCacheEntry>()

function normalizedVaultPath(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/gu, "")
}

function normalizedLookupKey(value: string): string {
  return normalizedVaultPath(value).toLocaleLowerCase()
}

async function canonicalVaultDirectory(directory: string): Promise<string> {
  return await fsp.realpath(directory).catch(() => path.resolve(directory))
}

function appendLookupEntry(
  lookup: Map<string, ObsidianVaultEntry[]>,
  key: string,
  entry: ObsidianVaultEntry,
): void {
  const normalizedKey = normalizedLookupKey(key)
  if (!normalizedKey) return
  const existing = lookup.get(normalizedKey)
  if (existing) {
    existing.push(entry)
    return
  }
  lookup.set(normalizedKey, [entry])
}

function removeLookupEntry(
  lookup: Map<string, ObsidianVaultEntry[]>,
  key: string,
  entryPath: string,
): void {
  const normalizedKey = normalizedLookupKey(key)
  const existing = lookup.get(normalizedKey)
  if (!existing) return
  const remaining = existing.filter((entry) => entry.path !== entryPath)
  if (remaining.length > 0) {
    lookup.set(normalizedKey, remaining)
    return
  }
  lookup.delete(normalizedKey)
}

function isObsidianConfigDirectoryName(name: string): boolean {
  return (
    name === OBSIDIAN_DEFAULT_CONFIG_DIRECTORY || name.startsWith(OBSIDIAN_CONFIG_DIRECTORY_PREFIX)
  )
}

async function directoryHasObsidianConfigMarkers(directory: string): Promise<boolean> {
  const markers = await Promise.all(
    OBSIDIAN_CONFIG_MARKER_FILES.map((fileName) =>
      fsp.stat(path.join(directory, fileName)).catch(() => undefined),
    ),
  )
  return markers.every((marker) => marker?.isFile())
}

export async function detectObsidianVault(directory: string): Promise<ObsidianVaultDetection> {
  const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => [])
  const hiddenEntries = entries.filter((entry) => entry.name.startsWith("."))
  const configDirectories: string[] = []

  for (const entry of hiddenEntries) {
    const candidate = path.join(directory, entry.name)
    const isDirectory =
      entry.isDirectory() ||
      (entry.isSymbolicLink() &&
        (await fsp
          .stat(candidate)
          .then((stats) => stats.isDirectory())
          .catch(() => false)))
    if (!isDirectory) continue
    if (
      isObsidianConfigDirectoryName(entry.name) ||
      (await directoryHasObsidianConfigMarkers(candidate))
    ) {
      configDirectories.push(entry.name)
    }
  }

  return {
    detected: configDirectories.length > 0,
    configDirectories: configDirectories.toSorted((left, right) => left.localeCompare(right)),
  }
}

function shouldSkipVaultDirectory(name: string, configDirectories: ReadonlySet<string>): boolean {
  return (
    configDirectories.has(name) ||
    OBSIDIAN_SKIPPED_DIRECTORY_NAMES.has(name) ||
    isObsidianConfigDirectoryName(name)
  )
}

async function listVaultEntries(
  directory: string,
  configDirectories: ReadonlySet<string>,
): Promise<{
  entries: ObsidianVaultEntry[]
  partial: boolean
}> {
  const directories = [directory]
  const entries: ObsidianVaultEntry[] = []
  let partial = false

  while (directories.length > 0 && !partial) {
    const currentDirectory = directories.shift()
    if (!currentDirectory) break
    const children = await fsp.readdir(currentDirectory, { withFileTypes: true }).catch(() => [])

    for (const child of children) {
      if (child.isDirectory()) {
        if (!shouldSkipVaultDirectory(child.name, configDirectories)) {
          directories.push(path.join(currentDirectory, child.name))
        }
        continue
      }
      if (!child.isFile()) continue

      const relativePath = normalizedVaultPath(
        path.relative(directory, path.join(currentDirectory, child.name)),
      )
      const extension = path.extname(child.name).toLocaleLowerCase()
      entries.push({
        path: relativePath,
        basename: child.name,
        stem: extension ? child.name.slice(0, -extension.length) : child.name,
        extension,
      })

      if (entries.length >= OBSIDIAN_INDEX_MAX_FILES) {
        partial = true
        break
      }
    }
  }

  return { entries, partial }
}

async function readFilePrefix(filePath: string): Promise<string> {
  const handle = await fsp.open(filePath, "r")
  try {
    const buffer = Buffer.alloc(OBSIDIAN_FRONTMATTER_READ_LIMIT_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).toString("utf8")
  } finally {
    await handle.close()
  }
}

function aliasesFromFrontmatter(source: string): string[] {
  try {
    const data: unknown = matter(source).data
    const parsed = obsidianAliasesSchema.safeParse(data)
    if (!parsed.success || parsed.data.aliases === undefined) return []
    return typeof parsed.data.aliases === "string" ? [parsed.data.aliases] : parsed.data.aliases
  } catch {
    return []
  }
}

async function readAliasesByPath(
  directory: string,
  entries: ObsidianVaultEntry[],
): Promise<Map<string, string[]>> {
  const aliasesByPath = new Map<string, string[]>()
  const markdownEntries = entries.filter((entry) => entry.extension === MARKDOWN_EXTENSION)
  let cursor = 0
  const workerCount = Math.min(OBSIDIAN_ALIAS_READ_CONCURRENCY, markdownEntries.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < markdownEntries.length) {
        const entry = markdownEntries[cursor]
        cursor += 1
        if (!entry) continue
        const source = await readFilePrefix(path.join(directory, entry.path)).catch(() => "")
        aliasesByPath.set(normalizedLookupKey(entry.path), aliasesFromFrontmatter(source))
      }
    }),
  )

  return aliasesByPath
}

function addIndexEntry(
  index: ObsidianVaultIndex,
  entry: ObsidianVaultEntry,
  aliases: readonly string[],
): void {
  const pathKey = normalizedLookupKey(entry.path)
  index.byPath.set(pathKey, entry)
  appendLookupEntry(index.byBasename, entry.basename, entry)
  appendLookupEntry(index.byStem, entry.stem, entry)
  index.aliasesByPath.set(pathKey, [...aliases])
  for (const alias of aliases) appendLookupEntry(index.aliases, alias, entry)
}

function removeIndexEntry(index: ObsidianVaultIndex, entry: ObsidianVaultEntry): void {
  const pathKey = normalizedLookupKey(entry.path)
  index.byPath.delete(pathKey)
  removeLookupEntry(index.byBasename, entry.basename, entry.path)
  removeLookupEntry(index.byStem, entry.stem, entry.path)
  for (const alias of index.aliasesByPath.get(pathKey) ?? []) {
    removeLookupEntry(index.aliases, alias, entry.path)
  }
  index.aliasesByPath.delete(pathKey)
}

function removeIndexPath(index: ObsidianVaultIndex, relativePath: string): void {
  const pathKey = normalizedLookupKey(relativePath)
  const entries = Array.from(index.byPath.entries()).flatMap(([entryKey, entry]) =>
    entryKey === pathKey || entryKey.startsWith(`${pathKey}/`) ? [entry] : [],
  )
  for (const entry of entries) removeIndexEntry(index, entry)
}

async function buildObsidianVaultIndex(
  directory: string,
  detection: ObsidianVaultDetection,
): Promise<ObsidianVaultIndex> {
  const listed = await listVaultEntries(directory, new Set(detection.configDirectories))
  const aliasesByPath = await readAliasesByPath(directory, listed.entries)
  const index: ObsidianVaultIndex = {
    aliases: new Map(),
    aliasesByPath: new Map(),
    byBasename: new Map(),
    byPath: new Map(),
    byStem: new Map(),
    configDirectories: new Set(detection.configDirectories),
    partial: listed.partial,
  }

  for (const entry of listed.entries) {
    addIndexEntry(index, entry, aliasesByPath.get(normalizedLookupKey(entry.path)) ?? [])
  }

  return index
}

function relativeVaultPath(directory: string, absolutePath: string): string | undefined {
  const relativePath = path.relative(directory, path.resolve(absolutePath))
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return undefined
  }
  return normalizedVaultPath(relativePath)
}

function isIndexableVaultPath(
  relativePath: string,
  configDirectories: ReadonlySet<string>,
): boolean {
  const segments = relativePath.split("/")
  return !segments
    .slice(0, -1)
    .some((segment) => shouldSkipVaultDirectory(segment, configDirectories))
}

function vaultEntry(relativePath: string): ObsidianVaultEntry {
  const basename = path.posix.basename(relativePath)
  const extension = path.posix.extname(basename).toLocaleLowerCase()
  return {
    path: relativePath,
    basename,
    stem: extension ? basename.slice(0, -extension.length) : basename,
    extension,
  }
}

async function updateVaultIndex(
  directory: string,
  index: ObsidianVaultIndex,
  update: WorkspaceFileWatcherUpdate,
): Promise<"updated" | "rebuild"> {
  const relativePath = relativeVaultPath(directory, update.absolutePath)
  if (!relativePath || !isIndexableVaultPath(relativePath, index.configDirectories)) {
    return "updated"
  }

  if (update.event === "unlink") {
    removeIndexPath(index, relativePath)
    return "updated"
  }

  const stats = await fsp.lstat(update.absolutePath).catch(() => undefined)
  if (!stats) {
    removeIndexPath(index, relativePath)
    return "updated"
  }
  if (stats.isDirectory()) return "rebuild"
  if (!stats.isFile()) {
    removeIndexPath(index, relativePath)
    return "updated"
  }

  const existing = index.byPath.get(normalizedLookupKey(relativePath))
  if (!existing && index.byPath.size >= OBSIDIAN_INDEX_MAX_FILES) {
    index.partial = true
    return "updated"
  }

  const entry = vaultEntry(relativePath)
  const aliases =
    entry.extension === MARKDOWN_EXTENSION
      ? aliasesFromFrontmatter(await readFilePrefix(update.absolutePath).catch(() => ""))
      : []
  if (existing) removeIndexEntry(index, existing)
  addIndexEntry(index, entry, aliases)
  return "updated"
}

function closeVaultIndexEntry(entry: ObsidianVaultIndexCacheEntry): void {
  void entry.close().catch(() => undefined)
}

function invalidateVaultIndexEntry(directory: string, entry: ObsidianVaultIndexCacheEntry): void {
  if (vaultIndexCache.get(directory) !== entry) return
  vaultIndexCache.delete(directory)
  closeVaultIndexEntry(entry)
}

function cacheVaultIndexEntry(directory: string, entry: ObsidianVaultIndexCacheEntry): void {
  vaultIndexCache.set(directory, entry)
  while (vaultIndexCache.size > OBSIDIAN_INDEX_CACHE_MAX_VAULTS) {
    const oldest = vaultIndexCache.entries().next().value
    if (!oldest) return
    invalidateVaultIndexEntry(oldest[0], oldest[1])
  }
}

function touchVaultIndexEntry(directory: string, entry: ObsidianVaultIndexCacheEntry): void {
  if (vaultIndexCache.get(directory) !== entry) return
  vaultIndexCache.delete(directory)
  vaultIndexCache.set(directory, entry)
}

function enqueueVaultIndexUpdate(
  directory: string,
  entry: ObsidianVaultIndexCacheEntry,
  update: WorkspaceFileWatcherUpdate,
): Promise<void> {
  entry.updateTask = entry.updateTask
    .then(async () => {
      const index = await entry.task
      if ((await updateVaultIndex(directory, index, update)) === "rebuild") {
        invalidateVaultIndexEntry(directory, entry)
      }
    })
    .catch((error: unknown) => {
      invalidateVaultIndexEntry(directory, entry)
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Obsidian vault index update failed: ${message}`)
    })
  return entry.updateTask
}

function createObsidianVaultIndexEntry(directory: string): ObsidianVaultIndexCacheEntry {
  let entry: ObsidianVaultIndexCacheEntry
  const detectionTask = detectObsidianVault(directory)
  const subscriptionTask = detectionTask.then(async (detection) =>
    subscribeNativeWorkspaceFileWatcher({
      directory,
      ignore: [
        ...OBSIDIAN_WATCHER_IGNORE_PATTERNS,
        ...detection.configDirectories.map((name) => `**/${name}/**`),
      ],
      onError(error) {
        invalidateVaultIndexEntry(directory, entry)
        console.warn(`Obsidian vault watcher failed: ${error.message}`)
      },
      onUpdate(update) {
        void enqueueVaultIndexUpdate(directory, entry, update)
      },
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Obsidian vault watcher unavailable: ${message}`)
      return undefined
    }),
  )
  const task = Promise.all([detectionTask, subscriptionTask])
    .then(([detection]) => buildObsidianVaultIndex(directory, detection))
    .catch((error: unknown) => {
      invalidateVaultIndexEntry(directory, entry)
      throw error
    })
  entry = {
    task,
    updateTask: task.then(() => undefined),
    async close() {
      await (await subscriptionTask)?.unsubscribe()
    },
  }
  return entry
}

async function getObsidianVaultIndex(directory: string): Promise<ObsidianVaultIndex> {
  const normalizedDirectory = await canonicalVaultDirectory(directory)
  let entry = vaultIndexCache.get(normalizedDirectory)
  if (!entry) {
    entry = createObsidianVaultIndexEntry(normalizedDirectory)
    cacheVaultIndexEntry(normalizedDirectory, entry)
  } else {
    touchVaultIndexEntry(normalizedDirectory, entry)
  }
  const index = await entry.task
  await entry.updateTask
  return index
}

function parseObsidianTarget(target: string): { file: string; fragment?: string } {
  const normalized = target.trim()
  const fragmentStart = normalized.indexOf("#")
  if (fragmentStart < 0) {
    return { file: normalized }
  }
  const fragment = normalized.slice(fragmentStart + 1).trim()
  return {
    file: normalized.slice(0, fragmentStart).trim(),
    ...(fragment ? { fragment } : {}),
  }
}

function selectBestEntry(
  candidates: ObsidianVaultEntry[] | undefined,
): ObsidianVaultEntry | undefined {
  return candidates?.toSorted((left, right) => {
    return left.path.length - right.path.length || left.path.localeCompare(right.path)
  })[0]
}

function directPathCandidates(file: string, documentPath: string): string[] {
  const normalizedFile = normalizedVaultPath(file)
  if (!normalizedFile) return [normalizedVaultPath(documentPath)]

  const documentDirectory = path.posix.dirname(normalizedVaultPath(documentPath))
  const relativeCandidate = normalizedVaultPath(
    path.posix.join(documentDirectory === "." ? "" : documentDirectory, normalizedFile),
  )
  const candidates = [relativeCandidate, normalizedFile]
  if (!path.posix.extname(normalizedFile)) {
    candidates.push(
      `${relativeCandidate}${MARKDOWN_EXTENSION}`,
      `${normalizedFile}${MARKDOWN_EXTENSION}`,
    )
  }
  return Array.from(new Set(candidates))
}

function resolveEntryFromIndex(
  index: ObsidianVaultIndex,
  file: string,
  documentPath: string,
): ObsidianVaultEntry | undefined {
  for (const candidate of directPathCandidates(file, documentPath)) {
    const direct = index.byPath.get(normalizedLookupKey(candidate))
    if (direct) return direct
  }

  const basename = path.posix.basename(normalizedVaultPath(file))
  const extension = path.posix.extname(basename)
  if (extension) {
    return selectBestEntry(index.byBasename.get(normalizedLookupKey(basename)))
  }

  return (
    selectBestEntry(index.byStem.get(normalizedLookupKey(basename))) ??
    selectBestEntry(index.aliases.get(normalizedLookupKey(file)))
  )
}

function resolvedLinkKind(entry: ObsidianVaultEntry): ObsidianResolvedLinkKind {
  if (entry.extension === MARKDOWN_EXTENSION) return "markdown"
  if (OBSIDIAN_IMAGE_EXTENSIONS.has(entry.extension)) return "image"
  if (OBSIDIAN_MEDIA_EXTENSIONS.has(entry.extension)) return "media"
  return "file"
}

async function resolvedEntryStillExists(
  directory: string,
  entry: ObsidianVaultEntry,
): Promise<boolean> {
  return fsp.stat(path.join(directory, entry.path)).then(
    (stats) => stats.isFile(),
    () => false,
  )
}

async function resolveTargetsWithIndex(input: {
  directory: string
  documentPath: string
  targets: string[]
  index: ObsidianVaultIndex
}): Promise<ObsidianResolvedLink[]> {
  const links: (ObsidianResolvedLink | undefined)[] = Array.from({
    length: input.targets.length,
  })
  let cursor = 0
  const workerCount = Math.min(OBSIDIAN_ALIAS_READ_CONCURRENCY, input.targets.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < input.targets.length) {
        const linkIndex = cursor
        cursor += 1
        const target = input.targets[linkIndex]
        if (!target) continue
        const parsed = parseObsidianTarget(target)
        const entry = resolveEntryFromIndex(input.index, parsed.file, input.documentPath)
        if (!entry || !(await resolvedEntryStillExists(input.directory, entry))) {
          if (entry) removeIndexEntry(input.index, entry)
          links[linkIndex] = { target, status: "unresolved" }
          continue
        }
        links[linkIndex] = {
          target,
          status: "resolved",
          path: entry.path,
          kind: resolvedLinkKind(entry),
          ...(parsed.fragment ? { fragment: parsed.fragment } : {}),
        }
      }
    }),
  )

  return links.filter((link): link is ObsidianResolvedLink => link !== undefined)
}

export async function resolveObsidianVaultLinks(input: {
  directory: string
  documentPath: string
  targets: string[]
}): Promise<{ links: ObsidianResolvedLink[]; partial: boolean }> {
  const uniqueTargets = Array.from(
    new Set(input.targets.map((target) => target.trim()).filter(Boolean)),
  )
  const index = await getObsidianVaultIndex(input.directory)
  const links = await resolveTargetsWithIndex({ ...input, targets: uniqueTargets, index })

  return {
    links,
    partial: index.partial,
  }
}

export function clearObsidianVaultIndexCache(): void {
  for (const entry of vaultIndexCache.values()) closeVaultIndexEntry(entry)
  vaultIndexCache.clear()
}

export async function invalidateObsidianVaultIndex(directory: string): Promise<void> {
  const normalizedDirectory = await canonicalVaultDirectory(directory)
  const entry = vaultIndexCache.get(normalizedDirectory)
  if (entry) invalidateVaultIndexEntry(normalizedDirectory, entry)
}

export async function updateObsidianVaultIndex(input: {
  directory: string
  path: string
  event: WorkspaceFileWatcherEventKind
}): Promise<void> {
  const directory = await canonicalVaultDirectory(input.directory)
  const entry = vaultIndexCache.get(directory)
  if (!entry) return
  await enqueueVaultIndexUpdate(directory, entry, {
    absolutePath: path.resolve(directory, input.path),
    event: input.event,
  })
}

export type { ObsidianResolvedLink, ObsidianResolvedLinkKind, ObsidianVaultDetection }
