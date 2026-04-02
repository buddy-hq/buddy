import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { spawn } from "node:child_process"
import { verifySignedMessage } from "./minisign"

const RELEASE_REPOSITORY = "prashantbhudwal/buddy"
const RELEASE_METADATA_URL = `https://github.com/${RELEASE_REPOSITORY}/releases/latest/download/latest-mac.json`
const BUDDY_UPDATE_METADATA_URL_ENV_KEY = "BUDDY_UPDATE_METADATA_URL"
const BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY = "BUDDY_UPDATE_PUBLIC_KEY"
const BUDDY_MINISIGN_PUBLIC_KEY = "RWTcBSYzKsK7Gf1M2w9kTDB2fvSRlsZejPWt+AaMGvGiNk3mxAW+Wh3f"
const MAC_ARCHIVE_NAMES: Record<string, string> = {
  arm64: "buddy-electron-mac-arm64.zip",
  x64: "buddy-electron-mac-x64.zip",
}
const UPDATE_CACHE_DIRECTORY_NAME = "custom-mac-updater"
const INSTALLER_SCRIPT_NAME = "mac-install-update.sh"
const INSTALLER_LOG_FILENAME = "update-installer.log"
const SHA512_HASH_ALGORITHM = "sha512"

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
  updateAvailable: boolean
  version?: string
  failed?: boolean
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
  killSidecar: () => void
  quit: () => void
  metadataUrl?: string
  publicKey?: string
}

export function createCustomMacUpdater(options: CreateCustomMacUpdaterOptions) {
  let pendingUpdate: PendingMacUpdate | null = null

  return {
    async checkForUpdate(): Promise<MacUpdaterResult> {
      if (!options.packaged) {
        return { updateAvailable: false }
      }

      if (pendingUpdate) {
        return {
          updateAvailable: true,
          version: pendingUpdate.version,
        }
      }

      try {
        const metadata = await fetchLatestManifest(options)
        if (!isUpdateAvailable(metadata.version, options.currentVersion)) {
          return { updateAvailable: false }
        }

        const entry = resolveArchiveEntry(metadata.files)
        if (!entry) {
          options.logger.warn(
            "custom mac updater could not find a matching archive in latest-mac.json",
          )
          return { updateAvailable: false, failed: true }
        }

        const archivePath = await ensureArchiveDownloaded(entry, metadata.version, options)
        pendingUpdate = {
          version: metadata.version,
          archivePath,
        }

        return {
          updateAvailable: true,
          version: metadata.version,
        }
      } catch (error) {
        options.logger.error("custom mac update check failed", error)
        return { updateAvailable: false, failed: true }
      }
    },
    async installUpdate() {
      if (!pendingUpdate) {
        return
      }

      const installerScriptPath = resolveInstallerScriptPath(options)
      const installerLogPath = join(options.logsPath, INSTALLER_LOG_FILENAME)

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
        ],
        {
          detached: true,
          stdio: "ignore",
        },
      )

      child.unref()
      options.killSidecar()
      options.quit()
    },
  }
}

async function fetchLatestManifest(options: CreateCustomMacUpdaterOptions) {
  const metadataUrl = options.metadataUrl ?? RELEASE_METADATA_URL
  const [manifestResponse, signatureResponse] = await Promise.all([
    fetch(metadataUrl, {
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
    fetch(`${metadataUrl}.sig`, {
      headers: {
        Accept: "text/plain, application/octet-stream;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
  ])

  if (!manifestResponse.ok) {
    throw new Error(
      `Failed to fetch latest-mac.json: ${manifestResponse.status} ${manifestResponse.statusText}`,
    )
  }

  if (!signatureResponse.ok) {
    throw new Error(
      `Failed to fetch latest-mac.json.sig: ${signatureResponse.status} ${signatureResponse.statusText}`,
    )
  }

  const [manifestText, signatureOuterText] = await Promise.all([
    manifestResponse.text(),
    signatureResponse.text(),
  ])

  const verified = await verifySignedMessage({
    message: Buffer.from(manifestText, "utf8"),
    publicKey: options.publicKey ?? BUDDY_MINISIGN_PUBLIC_KEY,
    signatureFileText: decodeTauriSignatureOuterText(signatureOuterText),
  })

  if (!verified) {
    throw new Error("Signed update manifest verification failed")
  }

  return parseLatestManifest(manifestText)
}

function parseLatestManifest(content: string): LatestManifest {
  const parsed = JSON.parse(content) as Partial<LatestManifest>

  if (typeof parsed.version !== "string" || !Array.isArray(parsed.files)) {
    throw new Error("Invalid latest-mac.json payload")
  }

  const files = parsed.files.filter(isFileEntry)
  if (files.length !== parsed.files.length) {
    throw new Error("Invalid latest-mac.json file entries")
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

function decodeTauriSignatureOuterText(signatureOuterText: string) {
  return Buffer.from(signatureOuterText.trim(), "base64").toString("utf8")
}

function resolveArchiveEntry(files: FileEntry[]) {
  const expectedName = MAC_ARCHIVE_NAMES[process.arch]
  if (!expectedName) {
    return null
  }

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

  const response = await fetch(resolveReleaseAssetUrl(entry.url, version))
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

function resolveReleaseAssetUrl(filename: string, version: string) {
  if (isAbsoluteUrl(filename)) {
    return filename
  }

  return `https://github.com/${RELEASE_REPOSITORY}/releases/download/v${version}/${filename}`
}

function isAbsoluteUrl(value: string) {
  return value.startsWith("https://") || value.startsWith("http://")
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

function isUpdateAvailable(nextVersion: string, currentVersion: string) {
  return nextVersion.length > 0 && nextVersion !== currentVersion
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
