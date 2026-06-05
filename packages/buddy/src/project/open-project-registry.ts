import { randomUUID } from "node:crypto"
import fsSync from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { parse as parseJsonc, type ParseError as JsoncParseError } from "jsonc-parser"
import { resolveGlobalConfigFile } from "../config/store/config-paths"
import { writeJsonFileAtomic, writeJsonFileAtomicSync } from "../storage/atomic-file"
import { withFileLock, withFileLockSync } from "../storage/file-lock"
import { Global } from "../storage/global"
import { resolveBuddyHomeState } from "./buddy-home"
import { resolveDirectory } from "./directory"
import { INBOX_NOTEBOOK_NAME } from "./notebook-constants"
import { projectUpdateErrorMessage } from "./orchestration/project-operations"

const OPEN_PROJECTS_FILENAME = "desktop-notebooks.json"
const REGISTRY_BACKUP_EXTENSION = "bak"
const REGISTRY_LOCK_EXTENSION = "lock"
const REGISTRY_CORRUPT_MARKER = "corrupt"
const JSON_INDENT_SPACES = 2

class OpenProjectRegistryError extends Error {
  status: 400 | 403 | 500

  constructor(status: 400 | 403 | 500, message: string) {
    super(message)
    this.name = "OpenProjectRegistryError"
    this.status = status
  }
}

type RegistryParseResult =
  | {
      ok: true
      directories: string[]
    }
  | {
      ok: false
    }

export type OpenProjectsRecoveryCandidate = {
  directory: string
  name: string
}

export type OpenProjectsRecoveryInspection = {
  needed: boolean
  candidates: OpenProjectsRecoveryCandidate[]
}

let writeQueue = Promise.resolve()
let registryDirectoriesCache: string[] | undefined

function registryPath() {
  return path.join(Global.Path.state, OPEN_PROJECTS_FILENAME)
}

function backupRegistryPath() {
  return `${registryPath()}.${REGISTRY_BACKUP_EXTENSION}`
}

function registryLockPath() {
  return `${registryPath()}.${REGISTRY_LOCK_EXTENSION}`
}

function corruptRegistryPath() {
  return path.join(
    Global.Path.state,
    `${path.basename(registryPath(), ".json")}.${REGISTRY_CORRUPT_MARKER}.${Date.now()}.${process.pid}.${randomUUID()}.json`,
  )
}

function normalizeRegistryDirectory(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const directory = resolveDirectory(trimmed)
  if (!directory || directory === "/") return undefined
  return directory
}

function normalizeRegistryDirectories(entries: unknown) {
  if (!Array.isArray(entries)) return []

  const unique = new Set<string>()
  const directories: string[] = []

  for (const entry of entries) {
    if (typeof entry !== "string") continue
    const normalized = normalizeRegistryDirectory(entry)
    if (!normalized || unique.has(normalized)) continue
    unique.add(normalized)
    directories.push(normalized)
  }

  return directories
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  )
}

function registryStorageError(action: string, error: unknown): OpenProjectRegistryError {
  const message = error instanceof Error ? error.message : String(error)
  return new OpenProjectRegistryError(
    500,
    `Buddy can't ${action} the notebook list. Check Buddy's storage permissions or restart Buddy, then open a notebook folder to add it back. ${message}`,
  )
}

function parseRegistryDirectories(raw: string): RegistryParseResult {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return { ok: false }
    }

    return {
      ok: true,
      directories: normalizeRegistryDirectories(parsed),
    }
  } catch {
    return { ok: false }
  }
}

function readConfiguredNotebookHomePath(): string | undefined {
  try {
    const configPath = resolveGlobalConfigFile()
    const rawConfig = fsSync.readFileSync(configPath, "utf8")
    const parseErrors: JsoncParseError[] = []
    const parsed: unknown = parseJsonc(rawConfig, parseErrors, { allowTrailingComma: true })
    if (parseErrors.length > 0 || !isRecord(parsed)) {
      return undefined
    }

    const configuredHome = parsed.notebook_home
    if (typeof configuredHome !== "string") {
      return undefined
    }

    return resolveBuddyHomeState(configuredHome).resolvedPath
  } catch {
    return undefined
  }
}

function notebookHomeRecoveryRoots() {
  return Array.from(
    new Set(
      [readConfiguredNotebookHomePath(), resolveBuddyHomeState().resolvedPath].filter(
        (directory): directory is string => typeof directory === "string" && directory.length > 0,
      ),
    ),
  )
}

function sortRecoveredDirectories(directories: string[]) {
  const inboxName = INBOX_NOTEBOOK_NAME.toLowerCase()
  return directories.toSorted((left, right) => {
    const leftInbox = path.basename(left).toLowerCase() === inboxName
    const rightInbox = path.basename(right).toLowerCase() === inboxName
    if (leftInbox !== rightInbox) {
      return leftInbox ? -1 : 1
    }
    return path.basename(left).localeCompare(path.basename(right)) || left.localeCompare(right)
  })
}

async function scanManagedNotebookDirectories() {
  const directories: string[] = []

  for (const root of notebookHomeRecoveryRoots()) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue
      directories.push(path.join(root, entry.name))
    }
  }

  return sortRecoveredDirectories(normalizeRegistryDirectories(directories))
}

async function scanManagedNotebookRecoveryCandidates() {
  return (await scanManagedNotebookDirectories()).map((directory) => ({
    directory,
    name: path.basename(directory),
  }))
}

async function readRegistryBackupFile() {
  try {
    const raw = await fs.readFile(backupRegistryPath(), "utf8")
    const parsed = parseRegistryDirectories(raw)
    return parsed.ok ? parsed.directories : undefined
  } catch {
    return undefined
  }
}

function readRegistryBackupFileSync() {
  try {
    const raw = fsSync.readFileSync(backupRegistryPath(), "utf8")
    const parsed = parseRegistryDirectories(raw)
    return parsed.ok ? parsed.directories : undefined
  } catch {
    return undefined
  }
}

async function writeRegistryFileUnlocked(directories: string[]) {
  const normalized = normalizeRegistryDirectories(directories)
  await writeJsonFileAtomic(registryPath(), normalized, JSON_INDENT_SPACES)
  await writeJsonFileAtomic(backupRegistryPath(), normalized, JSON_INDENT_SPACES)
  registryDirectoriesCache = normalized
  return normalized
}

function writeRegistryFileSyncUnlocked(directories: string[]) {
  const normalized = normalizeRegistryDirectories(directories)
  writeJsonFileAtomicSync(registryPath(), normalized, JSON_INDENT_SPACES)
  writeJsonFileAtomicSync(backupRegistryPath(), normalized, JSON_INDENT_SPACES)
  registryDirectoriesCache = normalized
  return normalized
}

async function quarantineRegistryFile() {
  try {
    await fs.rename(registryPath(), corruptRegistryPath())
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return
    }
    throw registryStorageError("recover", error)
  }
}

function quarantineRegistryFileSync() {
  try {
    fsSync.renameSync(registryPath(), corruptRegistryPath())
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return
    }
    throw registryStorageError("recover", error)
  }
}

async function recoverRegistryFileUnlocked() {
  const backup = await readRegistryBackupFile()
  if (!backup) {
    await quarantineRegistryFile()
    registryDirectoriesCache = []
    return []
  }

  await quarantineRegistryFile()
  return writeRegistryFileUnlocked(backup)
}

function recoverRegistryFileSyncUnlocked() {
  const backup = readRegistryBackupFileSync()
  if (!backup) {
    quarantineRegistryFileSync()
    registryDirectoriesCache = []
    return []
  }

  quarantineRegistryFileSync()
  return writeRegistryFileSyncUnlocked(backup)
}

async function restoreMissingRegistryFileUnlocked() {
  const backedUpDirectories = await readRegistryBackupFile()
  if (!backedUpDirectories) {
    registryDirectoriesCache = []
    return []
  }

  return writeRegistryFileUnlocked(backedUpDirectories)
}

function restoreMissingRegistryFileSyncUnlocked() {
  const backedUpDirectories = readRegistryBackupFileSync()
  if (!backedUpDirectories) {
    registryDirectoriesCache = []
    return []
  }

  return writeRegistryFileSyncUnlocked(backedUpDirectories)
}

async function readRegistryFileUnlocked() {
  try {
    const raw = await fs.readFile(registryPath(), "utf8")
    const parsed = parseRegistryDirectories(raw)
    if (parsed.ok) {
      registryDirectoriesCache = parsed.directories
      return parsed.directories
    }

    return recoverRegistryFileUnlocked()
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return restoreMissingRegistryFileUnlocked()
    }
    throw registryStorageError("read", error)
  }
}

function readRegistryFileSyncUnlocked() {
  try {
    const raw = fsSync.readFileSync(registryPath(), "utf8")
    const parsed = parseRegistryDirectories(raw)
    if (parsed.ok) {
      registryDirectoriesCache = parsed.directories
      return parsed.directories
    }

    return recoverRegistryFileSyncUnlocked()
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      return restoreMissingRegistryFileSyncUnlocked()
    }
    throw registryStorageError("read", error)
  }
}

async function registryFileIsReadableUnlocked() {
  try {
    const raw = await fs.readFile(registryPath(), "utf8")
    return parseRegistryDirectories(raw).ok
  } catch {
    return false
  }
}

async function backupRegistryFileIsReadableUnlocked() {
  return (await readRegistryBackupFile()) !== undefined
}

async function corruptRegistryFilesUnlocked() {
  const corruptPrefix = `${path.basename(registryPath(), ".json")}.${REGISTRY_CORRUPT_MARKER}.`
  return (await fs.readdir(Global.Path.state, { withFileTypes: true }).catch(() => []))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith(corruptPrefix) &&
        entry.name.endsWith(".json"),
    )
    .map((entry) => path.join(Global.Path.state, entry.name))
}

async function registryRecoveryIsNeededUnlocked() {
  if (await registryFileIsReadableUnlocked()) {
    return false
  }
  if (await backupRegistryFileIsReadableUnlocked()) {
    return false
  }
  return (await corruptRegistryFilesUnlocked()).length > 0
}

async function withRegistryLock<T>(task: () => Promise<T>) {
  try {
    return await withFileLock(registryLockPath(), task)
  } catch (error) {
    if (isOpenProjectRegistryError(error)) {
      throw error
    }
    throw registryStorageError("access", error)
  }
}

function withRegistryLockSync<T>(task: () => T) {
  try {
    return withFileLockSync(registryLockPath(), task)
  } catch (error) {
    if (isOpenProjectRegistryError(error)) {
      throw error
    }
    throw registryStorageError("access", error)
  }
}

function readRegistryFileSync() {
  return withRegistryLockSync(readRegistryFileSyncUnlocked)
}

function readRegistryCache() {
  if (registryDirectoriesCache !== undefined) {
    return registryDirectoriesCache
  }
  return readRegistryFileSync()
}

async function updateRegistry(mutator: (current: string[]) => Promise<string[]> | string[]) {
  const resultPromise = writeQueue.then(async () => {
    return withRegistryLock(async () => {
      const current = await readRegistryFileUnlocked()
      const next = normalizeRegistryDirectories(await mutator(current))
      return writeRegistryFileUnlocked(next)
    })
  })

  writeQueue = resultPromise.then(
    () => undefined,
    () => undefined,
  )

  return resultPromise
}

function requireRegistryDirectory(rawDirectory: string) {
  const directory = normalizeRegistryDirectory(rawDirectory)
  if (!directory) {
    throw new OpenProjectRegistryError(400, "Directory is required")
  }
  return directory
}

function sameDirectorySet(left: string[], right: string[]) {
  if (left.length !== right.length) return false

  const leftSet = new Set(left)
  if (leftSet.size !== left.length) return false

  for (const entry of right) {
    if (!leftSet.has(entry)) return false
  }

  return true
}

export async function listOpenProjects() {
  return withRegistryLock(async () => {
    const directories = await readRegistryFileUnlocked()
    const recoveryNeeded = await registryRecoveryIsNeededUnlocked()
    return {
      directories,
      ...(recoveryNeeded ? { recovery: { needed: true } } : {}),
    }
  })
}

export async function openProjectRegistryEntry(rawDirectory: string) {
  const directory = requireRegistryDirectory(rawDirectory)

  try {
    await OpenCodeProject.fromDirectory(directory)
  } catch (error) {
    throw new OpenProjectRegistryError(400, projectUpdateErrorMessage(error))
  }

  await updateRegistry((current) =>
    current.includes(directory) ? current : [directory, ...current],
  )
  return directory
}

export async function closeOpenProjectRegistryEntry(rawDirectory: string) {
  const directory = requireRegistryDirectory(rawDirectory)

  await updateRegistry((current) => current.filter((entry) => entry !== directory))
  return directory
}

export async function reorderOpenProjectRegistryEntries(rawDirectories: string[]) {
  const directories = normalizeRegistryDirectories(rawDirectories)
  return updateRegistry((current) => {
    if (!sameDirectorySet(current, directories)) {
      throw new OpenProjectRegistryError(
        400,
        "Directory order must match the current open-project set",
      )
    }
    return directories
  })
}

export async function setOpenProjectRegistryEntries(rawDirectories: string[]) {
  const directories = normalizeRegistryDirectories(rawDirectories)
  for (const directory of directories) {
    try {
      await OpenCodeProject.fromDirectory(directory)
    } catch (error) {
      throw new OpenProjectRegistryError(400, projectUpdateErrorMessage(error))
    }
  }

  return updateRegistry(() => directories)
}

export async function inspectOpenProjectRegistryRecovery(): Promise<OpenProjectsRecoveryInspection> {
  return withRegistryLock(async () => {
    await readRegistryFileUnlocked()
    const needed = await registryRecoveryIsNeededUnlocked()
    if (!needed) {
      return {
        needed: false,
        candidates: [],
      }
    }

    return {
      needed: true,
      candidates: await scanManagedNotebookRecoveryCandidates(),
    }
  })
}

export async function restoreOpenProjectRegistryRecovery(rawDirectories: string[]) {
  const directories = normalizeRegistryDirectories(rawDirectories)
  for (const directory of directories) {
    let stats: fsSync.Stats
    try {
      stats = await fs.stat(directory)
    } catch {
      throw new OpenProjectRegistryError(400, `Notebook folder not found: ${directory}`)
    }
    if (!stats.isDirectory()) {
      throw new OpenProjectRegistryError(400, `Notebook folder not found: ${directory}`)
    }
  }

  return updateRegistry(() => directories)
}

export async function startFreshOpenProjectRegistryRecovery() {
  return updateRegistry(() => [])
}

export function isDirectoryInOpenProjectRegistry(directory: string): boolean {
  const normalizedDirectory = normalizeRegistryDirectory(directory)
  if (!normalizedDirectory) {
    return false
  }

  try {
    return readRegistryCache().includes(normalizedDirectory)
  } catch (error) {
    if (isOpenProjectRegistryError(error)) {
      return false
    }
    throw error
  }
}

export function isOpenProjectRegistryError(error: unknown): error is OpenProjectRegistryError {
  return error instanceof OpenProjectRegistryError
}

export function mapOpenProjectRegistryError(error: unknown): Response | undefined {
  if (!isOpenProjectRegistryError(error)) return undefined
  return Response.json({ error: error.message }, { status: error.status })
}
