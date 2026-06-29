import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { spawn } from "node:child_process"
import {
  BUDDY_MINISIGN_PUBLIC_KEY,
  BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY,
  fetchSignedText,
  isAbsoluteUrl,
  resolveLatestReleaseAssetUrl,
  resolveReleaseAssetUrl,
  resolveVersionedReleaseAssetUrls,
  SignedUpdateFetchError,
} from "./update-common"
import { compareVersions } from "./recovery-policy-core"
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

type LoggerLike = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

type FileEntry = {
  url: string
  sha512: string
  size: number
}

type LatestManifest = {
  version: string
  files: FileEntry[]
}

type PendingMacUpdate = {
  version: string
  archivePath: string
}

type MacUpdaterResult = {
  blocked?: boolean
  updateAvailable: boolean
  version?: string
  failed?: boolean
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

type MacUpdateAvailabilityInput = {
  currentVersion: string
  expectedVersion?: string
  nextVersion: string
}

export function createCustomMacUpdater(options: CreateCustomMacUpdaterOptions) {
  let pendingUpdate: PendingMacUpdate | null = null
  let checkForUpdateTask: Promise<MacUpdaterResult> | undefined
  const checkForVersionTasks = new Map<string, Promise<MacUpdaterResult>>()

  return {
    async checkForUpdate(): Promise<MacUpdaterResult> {
      if (!options.packaged) {
        return { updateAvailable: false }
      }

      if (pendingUpdate) {
        if (options.isVersionBlocked?.(pendingUpdate.version)) {
          return { blocked: true, updateAvailable: false }
        }

        return {
          updateAvailable: true,
          version: pendingUpdate.version,
        }
      }

      checkForUpdateTask ??= checkManifestForUpdate({
        metadataUrls: [options.metadataUrl ?? resolveDefaultMacMetadataUrl()],
        options,
        pendingUpdate,
        setPendingUpdate: (update) => {
          pendingUpdate = update
        },
      })
        .catch((error) => {
          options.logger.error("custom mac update check failed", error)
          return { updateAvailable: false, failed: true }
        })
        .finally(() => {
          checkForUpdateTask = undefined
        })

      return await checkForUpdateTask
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
        expectedVersion: version,
        metadataUrls: options.metadataUrl
          ? [options.metadataUrl]
          : resolveMacRecoveryMetadataUrls(version),
        options,
        pendingUpdate,
        setPendingUpdate: (update) => {
          pendingUpdate = update
        },
      })
        .catch((error) => {
          options.logger.error("custom mac recovery update check failed", error)
          return { updateAvailable: false, failed: true }
        })
        .finally(() => {
          checkForVersionTasks.delete(version)
        })
      checkForVersionTasks.set(version, task)
      return await task
    },
    async installUpdate() {
      if (!pendingUpdate) {
        return
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
  expectedVersion?: string
  metadataUrls: readonly string[]
  options: CreateCustomMacUpdaterOptions
  pendingUpdate: PendingMacUpdate | null
  setPendingUpdate: (update: PendingMacUpdate) => void
}): Promise<MacUpdaterResult> {
  const metadata = await fetchLatestManifest(input.metadataUrls, input.options)
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
    return { updateAvailable: false }
  }

  if (input.options.isVersionBlocked?.(metadata.version)) {
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

  const entry = resolveArchiveEntry(metadata.version, metadata.files)
  if (!entry) {
    input.options.logger.warn("custom mac updater could not find a matching archive", {
      metadataUrls: input.metadataUrls,
    })
    return { updateAvailable: false, failed: true }
  }

  const archivePath = await ensureArchiveDownloaded(entry, metadata.version, input.options)
  input.setPendingUpdate({
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
      if (!fallbackUrl || !isMissingSignedManifest(error)) {
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
  const parsed = JSON.parse(content) as Partial<LatestManifest>

  if (typeof parsed.version !== "string" || !Array.isArray(parsed.files)) {
    throw new Error("Invalid macOS update manifest payload")
  }

  const files = parsed.files.filter(isFileEntry)
  if (files.length !== parsed.files.length) {
    throw new Error("Invalid macOS update manifest file entries")
  }

  return {
    version: parsed.version,
    files,
  }
}

function isFileEntry(value: unknown): value is FileEntry {
  if (!value || typeof value !== "object") {
    return false
  }

  const url = Reflect.get(value, "url")
  const sha512 = Reflect.get(value, "sha512")
  const size = Reflect.get(value, "size")
  return typeof url === "string" && typeof sha512 === "string" && typeof size === "number"
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

  const buffer = Buffer.from(await response.arrayBuffer())
  const digest = createHash(SHA512_HASH_ALGORITHM).update(buffer).digest("base64")
  if (digest !== entry.sha512) {
    throw new Error("Downloaded update archive failed sha512 verification")
  }

  await writeFile(archivePath, buffer)
  return archivePath
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
  const parsed: unknown = JSON.parse(content)
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid mac installer result payload")
  }

  const status = Reflect.get(parsed, "status")
  if (status !== "failed" && status !== "running" && status !== "succeeded") {
    throw new Error("Invalid mac installer result status")
  }

  const exitCode = Reflect.get(parsed, "exitCode")
  if (exitCode === undefined) {
    return { status }
  }

  if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
    throw new Error("Invalid mac installer result exitCode")
  }

  return { exitCode, status }
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

function resolveDefaultMacMetadataUrl(): string {
  return resolveLatestReleaseAssetUrl(resolveMacMetadataFilename())
}

export function resolveMacRecoveryMetadataUrls(version: string): readonly string[] {
  return resolveVersionedReleaseAssetUrls({
    legacyFilename: LEGACY_MACOS_UPDATE_MANIFEST_FILENAME,
    primaryFilename: resolveMacMetadataFilename(),
    version,
  })
}

function isMissingSignedManifest(error: unknown): boolean {
  return error instanceof SignedUpdateFetchError && error.status === 404
}
