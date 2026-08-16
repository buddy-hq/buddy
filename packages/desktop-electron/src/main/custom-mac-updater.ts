import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { spawn } from "node:child_process"
import { z } from "zod"
import {
  BUDDY_MINISIGN_PUBLIC_KEY,
  BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY,
  fetchSignedText,
  isAbsoluteUrl,
  resolveLatestRingAssetUrl,
  resolveReleaseAssetUrl,
  resolveVersionedReleaseAssetUrls,
  SignedUpdateFetchError,
} from "./update-common"
import { compareVersions } from "./recovery-policy-core"
import type { UpdateRing } from "../shared/update-state"
import { UPDATE_RING_STABLE } from "../shared/update-state"
import {
  resolveMacOsReleaseArtifactFilename,
  resolveMacOsUpdateManifestFilename,
} from "../shared/release-asset-names"

const BUDDY_UPDATE_METADATA_URL_ENV_KEY = "BUDDY_UPDATE_METADATA_URL"
const UPDATE_CACHE_DIRECTORY_NAME = "custom-mac-updater"
const INSTALLER_SCRIPT_NAME = "mac-install-update.sh"
const INSTALLER_LOG_FILENAME = "update-installer.log"
const INSTALLER_RESULT_FILENAME = "update-installer-result.json"
const SHA512_HASH_ALGORITHM = "sha512"
const LEGACY_MACOS_UPDATE_MANIFEST_FILENAME = "latest-mac.json"
const DOWNLOAD_PROGRESS_EMIT_INTERVAL_MS = 250

type LoggerLike = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

const FileEntrySchema = z.looseObject({
  url: z.string(),
  sha512: z.string(),
  size: z.number(),
})
const LatestManifestBoundarySchema = z.object({
  version: z.string(),
  files: z.array(z.unknown()),
})
const MacInstallerResultBoundarySchema = z.looseObject({
  status: z.unknown(),
  exitCode: z.unknown().optional(),
})
const MacInstallerStatusSchema = z.enum(["failed", "running", "succeeded"])
const MacInstallerExitCodeSchema = z.number().int()

type FileEntry = z.infer<typeof FileEntrySchema>
type LatestManifest = {
  version: string
  files: FileEntry[]
}

type PendingMacUpdate = {
  ring: UpdateRing
  version: string
  archivePath: string
}

type MacUpdaterResult =
  | {
      updateAvailable: true
      version: string
    }
  | {
      blocked?: boolean
      failed?: boolean
      updateAvailable: false
    }

export type MacUpdateDownloadProgress = {
  bytesPerSecond?: number
  percent?: number
  totalBytes?: number
  transferredBytes: number
}

type CheckForUpdateInput = {
  onProgress?: (progress: MacUpdateDownloadProgress) => void
  ring?: UpdateRing
}

export type MacInstallerResult = {
  exitCode?: number
  status: "failed" | "running" | "succeeded"
}

type CreateCustomMacUpdaterOptions = {
  currentVersion: string
  packaged: boolean
  execPath: string
  cachePath: string
  logsPath: string
  appPath: string
  appName: string
  appRootPath: string
  resourcesPath: string
  logger: LoggerLike
  stopBackend: () => Promise<void> | void
  quit: () => void
  isVersionBlocked?: (version: string) => boolean
  metadataUrl?: string
  publicKey?: string
}

type CustomMacUpdaterDependencies = {
  fetchManifest: (
    metadataUrls: readonly string[],
    options: CreateCustomMacUpdaterOptions,
  ) => Promise<LatestManifest>
  downloadArchive: (
    entry: FileEntry,
    version: string,
    options: CreateCustomMacUpdaterOptions,
    onProgress?: (progress: MacUpdateDownloadProgress) => void,
  ) => Promise<string>
}

type MacUpdateAvailabilityInput = {
  currentVersion: string
  expectedVersion?: string
  nextVersion: string
}

export function createCustomMacUpdater(
  options: CreateCustomMacUpdaterOptions,
  dependencies: CustomMacUpdaterDependencies = {
    downloadArchive: ensureArchiveDownloaded,
    fetchManifest: fetchLatestManifest,
  },
) {
  let pendingUpdate: PendingMacUpdate | null = null
  const checkForUpdateTasks = new Map<UpdateRing, Promise<MacUpdaterResult>>()
  const checkForVersionTasks = new Map<string, Promise<MacUpdaterResult>>()

  return {
    isUpdateReady(expectedVersion: string): boolean {
      return pendingUpdate?.version === expectedVersion
    },
    async checkForUpdate(input: CheckForUpdateInput = {}): Promise<MacUpdaterResult> {
      if (!options.packaged) {
        return { updateAvailable: false }
      }

      const ring = input.ring ?? UPDATE_RING_STABLE
      const existingTask = checkForUpdateTasks.get(ring)
      if (existingTask) {
        return await existingTask
      }

      const metadataUrl = options.metadataUrl ?? (await resolveDefaultMacMetadataUrl(ring))
      const task = checkManifestForUpdate({
        dependencies,
        metadataUrls: [metadataUrl],
        onProgress: input.onProgress,
        options,
        pendingUpdate,
        ring,
        setPendingUpdate: (update) => {
          pendingUpdate = update
        },
      })
        .catch((error): MacUpdaterResult => {
          options.logger.error("custom mac update check failed", error)
          return { updateAvailable: false, failed: true }
        })
        .finally(() => {
          checkForUpdateTasks.delete(ring)
        })

      checkForUpdateTasks.set(ring, task)
      return await task
    },
    async checkForVersion(version: string): Promise<MacUpdaterResult> {
      if (!options.packaged) {
        return { updateAvailable: false }
      }

      if (pendingUpdate?.version === version) {
        if (options.isVersionBlocked?.(pendingUpdate.version)) {
          return { blocked: true, updateAvailable: false }
        }

        return {
          updateAvailable: true,
          version: pendingUpdate.version,
        }
      }

      const existingTask = checkForVersionTasks.get(version)
      if (existingTask) {
        return await existingTask
      }

      const task = checkManifestForUpdate({
        dependencies,
        expectedVersion: version,
        metadataUrls: options.metadataUrl
          ? [options.metadataUrl]
          : resolveMacRecoveryMetadataUrls(version),
        options,
        pendingUpdate,
        ring: UPDATE_RING_STABLE,
        setPendingUpdate: (update) => {
          pendingUpdate = update
        },
      })
        .catch((error): MacUpdaterResult => {
          options.logger.error("custom mac recovery update check failed", error)
          return { updateAvailable: false, failed: true }
        })
        .finally(() => {
          checkForVersionTasks.delete(version)
        })
      checkForVersionTasks.set(version, task)
      return await task
    },
    async installUpdate(expectedVersion: string) {
      if (pendingUpdate?.version !== expectedVersion) {
        throw new Error(`No downloaded macOS update is ready for version ${expectedVersion}`)
      }

      const installerScriptPath = resolveInstallerScriptPath(options)
      const installerLogPath = resolveMacInstallerLogPath(options.logsPath)
      const installerResultPath = resolveMacInstallerResultPath(options.logsPath)

      options.logger.info("launching custom mac installer", {
        version: pendingUpdate.version,
        archivePath: pendingUpdate.archivePath,
      })

      const child = spawn(
        "/bin/bash",
        [
          installerScriptPath,
          String(process.pid),
          pendingUpdate.archivePath,
          options.appPath,
          options.appName,
          installerLogPath,
          installerResultPath,
        ],
        {
          detached: true,
          stdio: "ignore",
        },
      )

      await waitForInstallerLaunch(child)
      child.unref()
      await options.stopBackend()
      options.quit()
    },
  }
}

function waitForInstallerLaunch(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolveLaunch, rejectLaunch) => {
    child.once("spawn", resolveLaunch)
    child.once("error", rejectLaunch)
  })
}

async function checkManifestForUpdate(input: {
  dependencies: CustomMacUpdaterDependencies
  expectedVersion?: string
  metadataUrls: readonly string[]
  onProgress?: (progress: MacUpdateDownloadProgress) => void
  options: CreateCustomMacUpdaterOptions
  pendingUpdate: PendingMacUpdate | null
  ring: UpdateRing
  setPendingUpdate: (update: PendingMacUpdate | null) => void
}): Promise<MacUpdaterResult> {
  const metadata = await input.dependencies.fetchManifest(input.metadataUrls, input.options)
  if (input.expectedVersion !== undefined && metadata.version !== input.expectedVersion) {
    throw new Error(
      `Recovery manifest version mismatch: expected ${input.expectedVersion}, got ${metadata.version}`,
    )
  }

  if (
    !isMacUpdateAvailable({
      currentVersion: input.options.currentVersion,
      expectedVersion: input.expectedVersion,
      nextVersion: metadata.version,
    })
  ) {
    input.setPendingUpdate(null)
    return { updateAvailable: false }
  }

  if (input.options.isVersionBlocked?.(metadata.version)) {
    input.setPendingUpdate(null)
    input.options.logger.warn("custom mac updater suppressed blocked update", {
      version: metadata.version,
    })
    return { updateAvailable: false, blocked: true }
  }

  if (input.pendingUpdate?.version === metadata.version) {
    return {
      updateAvailable: true,
      version: input.pendingUpdate.version,
    }
  }

  input.setPendingUpdate(null)

  const entry = resolveArchiveEntry(metadata.version, metadata.files)
  if (!entry) {
    input.options.logger.warn("custom mac updater could not find a matching archive", {
      metadataUrls: input.metadataUrls,
    })
    return { updateAvailable: false, failed: true }
  }

  const archivePath = await input.dependencies.downloadArchive(
    entry,
    metadata.version,
    input.options,
    input.onProgress,
  )
  input.setPendingUpdate({
    ring: input.ring,
    version: metadata.version,
    archivePath,
  })

  return {
    updateAvailable: true,
    version: metadata.version,
  }
}

async function fetchLatestManifest(
  metadataUrls: readonly string[],
  options: CreateCustomMacUpdaterOptions,
): Promise<LatestManifest> {
  let lastError: unknown

  for (const [index, metadataUrl] of metadataUrls.entries()) {
    try {
      const manifestText = await fetchSignedText({
        publicKey: options.publicKey ?? BUDDY_MINISIGN_PUBLIC_KEY,
        url: metadataUrl,
      })
      return parseLatestManifest(manifestText)
    } catch (error) {
      lastError = error
      const fallbackUrl = metadataUrls[index + 1]
      if (!fallbackUrl || !(error instanceof Error) || !isMissingSignedManifest(error)) {
        throw error
      }

      options.logger.warn("custom mac recovery manifest missing; trying legacy manifest", {
        fallbackUrl,
        metadataUrl,
      })
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch macOS update manifest")
}

function parseLatestManifest(content: string): LatestManifest {
  const manifest = LatestManifestBoundarySchema.safeParse(JSON.parse(content))
  if (!manifest.success) {
    throw new Error("Invalid macOS update manifest payload")
  }

  const files = z.array(FileEntrySchema).safeParse(manifest.data.files)
  if (!files.success) {
    throw new Error("Invalid macOS update manifest file entries")
  }

  return {
    version: manifest.data.version,
    files: files.data,
  }
}

function resolveArchiveEntry(version: string, files: FileEntry[]) {
  if (process.arch !== "arm64" && process.arch !== "x64") {
    return null
  }

  const expectedName = resolveMacOsReleaseArtifactFilename(version, process.arch, "zip")

  return files.find((file) => resolveArchiveName(file.url) === expectedName) ?? null
}

async function ensureArchiveDownloaded(
  entry: FileEntry,
  version: string,
  options: CreateCustomMacUpdaterOptions,
  onProgress?: (progress: MacUpdateDownloadProgress) => void,
) {
  const directory = join(options.cachePath, UPDATE_CACHE_DIRECTORY_NAME, version)
  await mkdir(directory, { recursive: true })

  const archiveName = resolveArchiveName(entry.url)
  const archivePath = join(directory, archiveName)
  if (await isExistingArchiveValid(archivePath, entry.sha512)) {
    return archivePath
  }

  const response = await fetch(resolveMacReleaseAssetUrl(entry.url, version))
  if (!response.ok) {
    throw new Error(`Failed to download update archive: ${response.status} ${response.statusText}`)
  }

  const buffer = await readDownloadBuffer(response, entry.size, onProgress)
  const digest = createHash(SHA512_HASH_ALGORITHM).update(buffer).digest("base64")
  if (digest !== entry.sha512) {
    throw new Error("Downloaded update archive failed sha512 verification")
  }

  await writeFile(archivePath, buffer)
  return archivePath
}

async function readDownloadBuffer(
  response: Response,
  totalBytes: number,
  onProgress: ((progress: MacUpdateDownloadProgress) => void) | undefined,
): Promise<Buffer> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    emitDownloadProgress({
      onProgress,
      startTime: Date.now(),
      totalBytes,
      transferredBytes: buffer.byteLength,
    })
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  const startTime = Date.now()
  let nextEmitAt = 0
  let transferredBytes = 0

  while (true) {
    const result = await reader.read()
    if (result.done) {
      break
    }

    chunks.push(result.value)
    transferredBytes += result.value.byteLength

    const now = Date.now()
    if (now >= nextEmitAt || transferredBytes >= totalBytes) {
      emitDownloadProgress({
        onProgress,
        startTime,
        totalBytes,
        transferredBytes,
      })
      nextEmitAt = now + DOWNLOAD_PROGRESS_EMIT_INTERVAL_MS
    }
  }

  emitDownloadProgress({
    onProgress,
    startTime,
    totalBytes,
    transferredBytes,
  })

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
}

function emitDownloadProgress(input: {
  onProgress: ((progress: MacUpdateDownloadProgress) => void) | undefined
  startTime: number
  totalBytes: number
  transferredBytes: number
}): void {
  const totalBytes = input.totalBytes > 0 ? input.totalBytes : undefined
  const elapsedSeconds = Math.max((Date.now() - input.startTime) / 1_000, 0.001)
  input.onProgress?.({
    bytesPerSecond: Math.round(input.transferredBytes / elapsedSeconds),
    percent: totalBytes ? (input.transferredBytes / totalBytes) * 100 : undefined,
    totalBytes,
    transferredBytes: input.transferredBytes,
  })
}

async function isExistingArchiveValid(archivePath: string, expectedSha512: string) {
  try {
    await access(archivePath)
  } catch {
    return false
  }

  const digest = createHash(SHA512_HASH_ALGORITHM)
    .update(await readFile(archivePath))
    .digest("base64")
  return digest === expectedSha512
}

function resolveMacReleaseAssetUrl(filename: string, version: string) {
  if (isAbsoluteUrl(filename)) {
    return filename
  }

  return resolveReleaseAssetUrl(version, filename)
}

function resolveArchiveName(value: string) {
  if (!isAbsoluteUrl(value)) {
    return value
  }

  try {
    const parsed = new URL(value)
    const segments = parsed.pathname.split("/")
    return segments[segments.length - 1] ?? value
  } catch {
    return value
  }
}

function resolveInstallerScriptPath(options: CreateCustomMacUpdaterOptions) {
  if (options.packaged) {
    return join(options.resourcesPath, INSTALLER_SCRIPT_NAME)
  }

  return join(options.appRootPath, "resources", INSTALLER_SCRIPT_NAME)
}

export function resolveMacInstallerLogPath(logsPath: string) {
  return join(logsPath, INSTALLER_LOG_FILENAME)
}

export function resolveMacInstallerResultPath(logsPath: string) {
  return join(logsPath, INSTALLER_RESULT_FILENAME)
}

export function parseMacInstallerResult(content: string): MacInstallerResult {
  const parsed = MacInstallerResultBoundarySchema.safeParse(JSON.parse(content))
  if (!parsed.success) {
    throw new Error("Invalid mac installer result payload")
  }

  const status = MacInstallerStatusSchema.safeParse(parsed.data.status)
  if (!status.success) {
    throw new Error("Invalid mac installer result status")
  }

  const exitCode = parsed.data.exitCode
  if (exitCode === undefined) {
    return { status: status.data }
  }

  const parsedExitCode = MacInstallerExitCodeSchema.safeParse(exitCode)
  if (!parsedExitCode.success) {
    throw new Error("Invalid mac installer result exitCode")
  }

  return { exitCode: parsedExitCode.data, status: status.data }
}

export function isMacUpdateAvailable(input: MacUpdateAvailabilityInput) {
  if (input.nextVersion.length === 0) {
    return false
  }

  if (input.expectedVersion !== undefined) {
    return input.nextVersion === input.expectedVersion
  }

  return compareVersions(input.nextVersion, input.currentVersion) > 0
}

export function resolveMacAppPath(execPath: string) {
  return resolve(execPath, "..", "..", "..")
}

export function resolveCustomMacUpdaterOptions() {
  return {
    metadataUrl: process.env[BUDDY_UPDATE_METADATA_URL_ENV_KEY]?.trim() || undefined,
    publicKey: process.env[BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY]?.trim() || undefined,
  }
}

function resolveMacMetadataFilename(): string {
  if (process.arch !== "arm64" && process.arch !== "x64") {
    throw new Error(`Unsupported macOS update architecture: ${process.arch}`)
  }

  return resolveMacOsUpdateManifestFilename(process.arch)
}

export async function resolveDefaultMacMetadataUrl(
  ring: UpdateRing = UPDATE_RING_STABLE,
): Promise<string> {
  return await resolveLatestRingAssetUrl({
    filename: resolveMacMetadataFilename(),
    ring,
  })
}

export function resolveMacRecoveryMetadataUrls(version: string): readonly string[] {
  return resolveVersionedReleaseAssetUrls({
    legacyFilename: LEGACY_MACOS_UPDATE_MANIFEST_FILENAME,
    primaryFilename: resolveMacMetadataFilename(),
    version,
  })
}

function isMissingSignedManifest(error: Error): boolean {
  return error instanceof SignedUpdateFetchError && error.status === 404
}
