import { createHash } from "node:crypto"
import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { zstdDecompressSync } from "node:zlib"
import z from "zod"
import {
  KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
  KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
  KNOWLEDGE_GRAPH_DB_ENV,
  KNOWLEDGE_GRAPH_DB_FILENAME,
  KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
  parseKnowledgeGraphArtifactManifest,
  type KnowledgeGraphArtifactManifest,
} from "../../learning/knowledge-graph"
import { Global } from "../../storage/global"

const STANDARDS_DIR = path.join(Global.Path.data, "standards")
const STANDARDS_CACHE_DIR = path.join(Global.Path.cache, "standards")
const STANDARDS_STATE_FILE = path.join(Global.Path.state, "standards.json")
const BACKEND_ROOT = path.resolve(import.meta.dir, "../../..")
const DEFAULT_RELEASE_REPOSITORY = "prashantbhudwal/buddy"
const IN_PROGRESS_STATES = new Set(["downloading", "installing", "repairing", "removing"])
const READY_STATE = "ready"
const APP_VERSION_ENV = "BUDDY_APP_VERSION"
const NPM_PACKAGE_VERSION_ENV = "npm_package_version"
const DEFAULT_RELEASE_TAG_VERSION = "0.0.1"
const STANDARDS_ASSET_BASE_URL_ENV = "BUDDY_STANDARDS_ASSET_BASE_URL"
const STANDARDS_LOCAL_ASSET_DIR_ENV = "BUDDY_STANDARDS_LOCAL_ASSET_DIR"
const INSTALLED_DATASET_VERSION_KEY = "installedDatasetVersion"
const LEGACY_INSTALLED_VERSION_KEY = "installedVersion"
const MANIFEST_CACHE_FILENAME = KNOWLEDGE_GRAPH_MANIFEST_FILENAME
const CHECKSUM_CACHE_FILENAME = KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME
const DATABASE_CACHE_FILENAME = KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME

const standardsRuntimeStateSchema = z.object({
  enabled: z.boolean().default(false),
  state: z.enum([
    "not_installed",
    "downloading",
    "installing",
    "ready",
    "repairing",
    "removing",
    "error",
  ]),
  installedDatasetVersion: z.string().optional(),
  installedArchiveChecksum: z.string().optional(),
  databasePath: z.string().optional(),
  lastHealthyAt: z.string().optional(),
  lastError: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  progressMessage: z.string().optional(),
})

export type StandardsRuntimeStatus = z.infer<typeof standardsRuntimeStateSchema> & {
  ready: boolean
}

type StandardsProgressUpdate = {
  state?: "downloading" | "installing" | "repairing" | "removing"
  progressPercent: number
  progressMessage: string
}

function runtimeStateDefaults() {
  return {
    enabled: false,
    state: "not_installed",
    progressPercent: undefined,
    progressMessage: undefined,
  } satisfies z.input<typeof standardsRuntimeStateSchema>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function normalizeRuntimeState(input: unknown) {
  const inputRecord = isRecord(input) ? input : {}
  const installedDatasetVersion = readOptionalString(inputRecord, INSTALLED_DATASET_VERSION_KEY)
  const legacyInstalledVersion = readOptionalString(inputRecord, LEGACY_INSTALLED_VERSION_KEY)

  const parsed = standardsRuntimeStateSchema.safeParse({
    ...runtimeStateDefaults(),
    ...inputRecord,
    ...(installedDatasetVersion
      ? {}
      : legacyInstalledVersion
        ? { installedDatasetVersion: legacyInstalledVersion }
        : {}),
  })

  if (!parsed.success) {
    return standardsRuntimeStateSchema.parse(runtimeStateDefaults())
  }

  return parsed.data
}

function readRuntimeStateSync() {
  const raw = fs.readFileSync(STANDARDS_STATE_FILE, "utf8")
  return normalizeRuntimeState(JSON.parse(raw))
}

async function writeRuntimeState(state: z.infer<typeof standardsRuntimeStateSchema>) {
  await fsp.mkdir(path.dirname(STANDARDS_STATE_FILE), { recursive: true })
  await fsp.writeFile(STANDARDS_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

function releaseRepository() {
  return (
    process.env.BUDDY_REPO?.trim() ||
    process.env.GITHUB_REPOSITORY?.trim() ||
    DEFAULT_RELEASE_REPOSITORY
  )
}

function releaseTagVersion() {
  const appVersion = process.env[APP_VERSION_ENV]?.trim()
  if (appVersion && appVersion.length > 0) return appVersion

  const packageVersion = process.env[NPM_PACKAGE_VERSION_ENV]?.trim()
  if (packageVersion && packageVersion.length > 0) return packageVersion

  return DEFAULT_RELEASE_TAG_VERSION
}

function releaseAssetBaseUrl() {
  const configured = process.env[STANDARDS_ASSET_BASE_URL_ENV]?.trim()
  if (configured) {
    return configured.replace(/\/+$/, "")
  }

  return `https://github.com/${releaseRepository()}/releases/download/v${releaseTagVersion()}`
}

function runtimeAssetUrl(filename: string) {
  return `${releaseAssetBaseUrl()}/${filename}`
}

function localDevelopmentAssetRoot() {
  const configured = process.env[STANDARDS_LOCAL_ASSET_DIR_ENV]?.trim()
  if (configured) {
    return configured
  }

  return path.join(BACKEND_ROOT, "resources", "knowledge-graph")
}

function localDevelopmentAssetPath(filename: string) {
  return path.join(localDevelopmentAssetRoot(), filename)
}

function localDevelopmentAssetsExist() {
  return (
    !process.env[STANDARDS_ASSET_BASE_URL_ENV] &&
    fs.existsSync(localDevelopmentAssetPath(KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME)) &&
    fs.existsSync(localDevelopmentAssetPath(KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME)) &&
    fs.existsSync(localDevelopmentAssetPath(KNOWLEDGE_GRAPH_MANIFEST_FILENAME))
  )
}

function configuredKnowledgeGraphDatabasePath() {
  const configured = process.env[KNOWLEDGE_GRAPH_DB_ENV]?.trim()
  if (!configured || configured === "undefined") {
    return undefined
  }

  try {
    return path.resolve(decodeURIComponent(configured))
  } catch {
    return path.resolve(configured)
  }
}

function externalKnowledgeGraphDatabasePath() {
  const configured = configuredKnowledgeGraphDatabasePath()
  if (!configured) {
    return undefined
  }

  return fs.existsSync(configured) ? configured : undefined
}

function installRoot(version: string) {
  return path.join(STANDARDS_DIR, version)
}

function installedDatabasePath(version: string) {
  return path.join(installRoot(version), KNOWLEDGE_GRAPH_DB_FILENAME)
}

function cacheDownloadPath(filename: string) {
  return path.join(STANDARDS_CACHE_DIR, filename)
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return String(error)
}

function logStandardsEvent(event: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : ""
  console.error(`[standards-runtime] ${event}${suffix}`)
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

function parseChecksum(input: string) {
  const firstLine = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) {
    throw new Error("Standards runtime checksum asset is empty")
  }

  const [checksum] = firstLine.split(/\s+/)
  if (!checksum) {
    throw new Error("Standards runtime checksum asset is invalid")
  }

  return checksum.trim().toLowerCase()
}

function parseManifest(input: unknown): KnowledgeGraphArtifactManifest {
  const parsed = parseKnowledgeGraphArtifactManifest(input)
  if (!parsed) {
    throw new Error("Standards runtime manifest asset is invalid")
  }

  return parsed
}

async function downloadBytes(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download standards runtime asset: ${response.status} ${response.statusText}`,
    )
  }

  return new Uint8Array(await response.arrayBuffer())
}

async function downloadText(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download standards runtime asset: ${response.status} ${response.statusText}`,
    )
  }

  return response.text()
}

async function loadManifest(localSource: boolean) {
  if (localSource) {
    const raw = await fsp.readFile(
      localDevelopmentAssetPath(KNOWLEDGE_GRAPH_MANIFEST_FILENAME),
      "utf8",
    )
    return parseManifest(JSON.parse(raw))
  }

  const raw = await downloadText(runtimeAssetUrl(KNOWLEDGE_GRAPH_MANIFEST_FILENAME))
  return parseManifest(JSON.parse(raw))
}

function setKnowledgeGraphDatabaseEnv(databasePath: string | undefined) {
  if (databasePath) {
    process.env[KNOWLEDGE_GRAPH_DB_ENV] = databasePath
    return
  }

  if (process.env[KNOWLEDGE_GRAPH_DB_ENV] === runtimeState.databasePath) {
    delete process.env[KNOWLEDGE_GRAPH_DB_ENV]
  }
}

function nextStatus(state: z.infer<typeof standardsRuntimeStateSchema>): StandardsRuntimeStatus {
  const externalDatabasePath = externalKnowledgeGraphDatabasePath()
  const databaseExists =
    typeof state.databasePath === "string" &&
    state.databasePath.length > 0 &&
    fs.existsSync(state.databasePath)
  const versionExists =
    typeof state.installedDatasetVersion === "string" && state.installedDatasetVersion.length > 0

  const installerReady =
    state.enabled && state.state === READY_STATE && versionExists && databaseExists
  const ready = installerReady || externalDatabasePath !== undefined
  const effectiveState =
    state.enabled &&
    !IN_PROGRESS_STATES.has(state.state) &&
    !installerReady &&
    (state.state === READY_STATE || state.state === "error")
      ? "error"
      : state.state
  const effectiveError =
    effectiveState === "error"
      ? (state.lastError ??
        (!databaseExists && !externalDatabasePath
          ? "Installed standards database is missing"
          : undefined))
      : state.lastError

  return {
    ...state,
    ...(state.databasePath
      ? {}
      : externalDatabasePath
        ? { databasePath: externalDatabasePath }
        : {}),
    state: effectiveState,
    ...(effectiveError ? { lastError: effectiveError } : {}),
    ready,
  }
}

async function cleanupStaleInstallVersions(activeVersion: string) {
  if (!fs.existsSync(STANDARDS_DIR)) {
    return
  }

  const entries = await fsp.readdir(STANDARDS_DIR, { withFileTypes: true })
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() || entry.name === activeVersion) {
        return
      }

      await fsp.rm(path.join(STANDARDS_DIR, entry.name), { recursive: true, force: true })
    }),
  )
}

async function installBundleFromRelease(
  reportProgress: (input: StandardsProgressUpdate) => Promise<unknown>,
) {
  await fsp.mkdir(STANDARDS_CACHE_DIR, { recursive: true })

  const localSource = localDevelopmentAssetsExist()
  logStandardsEvent("install-start", {
    source: localSource ? "local" : "remote",
    localAssetRoot: localDevelopmentAssetRoot(),
    archiveName: KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
    checksumName: KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
    manifestName: KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
  })

  await reportProgress({
    state: localSource ? "installing" : "downloading",
    progressPercent: 15,
    progressMessage: localSource
      ? "Reading local standards bundle..."
      : "Downloading standards bundle...",
  })

  const bundleBytes = localSource
    ? await fsp.readFile(localDevelopmentAssetPath(KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME))
    : await downloadBytes(runtimeAssetUrl(KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME)).catch((error) => {
        throw new Error(
          `${errorMessage(error)}. If you are running Buddy from source, provide local standards assets first.`,
        )
      })

  await reportProgress({
    state: localSource ? "installing" : "downloading",
    progressPercent: 30,
    progressMessage: localSource
      ? "Loading standards checksum..."
      : "Downloading standards checksum...",
  })

  const checksumText = localSource
    ? await fsp.readFile(
        localDevelopmentAssetPath(KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME),
        "utf8",
      )
    : await downloadText(runtimeAssetUrl(KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME)).catch(
        (error) => {
          throw new Error(
            `${errorMessage(error)}. If you are running Buddy from source, provide local standards assets first.`,
          )
        },
      )

  await reportProgress({
    state: localSource ? "installing" : "downloading",
    progressPercent: 45,
    progressMessage: localSource
      ? "Loading standards manifest..."
      : "Downloading standards manifest...",
  })

  const manifest = await loadManifest(localSource).catch((error) => {
    throw new Error(
      `${errorMessage(error)}. If you are running Buddy from source, provide local standards assets first.`,
    )
  })

  await reportProgress({
    state: "installing",
    progressPercent: 60,
    progressMessage: "Validating standards bundle...",
  })

  const expectedChecksum = parseChecksum(checksumText)
  if (expectedChecksum !== manifest.archiveChecksum) {
    throw new Error(
      `Standards runtime checksum mismatch between checksum file and manifest for ${KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME}`,
    )
  }

  const actualChecksum = sha256(bundleBytes)
  if (actualChecksum !== expectedChecksum) {
    throw new Error(
      `Standards runtime checksum mismatch for ${KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME}`,
    )
  }

  const databaseBytes = zstdDecompressSync(bundleBytes)
  const databaseChecksum = sha256(databaseBytes)
  if (databaseChecksum !== manifest.databaseChecksum) {
    throw new Error(
      `Standards runtime database checksum mismatch: expected ${manifest.databaseChecksum}, got ${databaseChecksum}`,
    )
  }

  await reportProgress({
    state: "installing",
    progressPercent: 80,
    progressMessage: "Writing standards database...",
  })

  const datasetInstallRoot = installRoot(manifest.version)
  const tempInstallRoot = `${datasetInstallRoot}.tmp-${process.pid}-${Date.now()}`
  const datasetDatabasePath = path.join(tempInstallRoot, KNOWLEDGE_GRAPH_DB_FILENAME)
  const datasetManifestPath = path.join(tempInstallRoot, KNOWLEDGE_GRAPH_MANIFEST_FILENAME)

  await fsp.writeFile(cacheDownloadPath(DATABASE_CACHE_FILENAME), bundleBytes)
  await fsp.writeFile(cacheDownloadPath(CHECKSUM_CACHE_FILENAME), checksumText, "utf8")
  await fsp.writeFile(
    cacheDownloadPath(MANIFEST_CACHE_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  )

  try {
    await fsp.rm(tempInstallRoot, { recursive: true, force: true })
    await fsp.mkdir(tempInstallRoot, { recursive: true })
    await fsp.writeFile(datasetDatabasePath, databaseBytes)
    await fsp.writeFile(datasetManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
    await fsp.rm(datasetInstallRoot, { recursive: true, force: true })
    await fsp.mkdir(path.dirname(datasetInstallRoot), { recursive: true })
    await fsp.rename(tempInstallRoot, datasetInstallRoot)
    await cleanupStaleInstallVersions(manifest.version)
    return {
      manifest,
      checksum: expectedChecksum,
      databasePath: installedDatabasePath(manifest.version),
    }
  } finally {
    await fsp.rm(tempInstallRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

let runtimeState = (() => {
  try {
    return readRuntimeStateSync()
  } catch {
    return standardsRuntimeStateSchema.parse(runtimeStateDefaults())
  }
})()

let runtimeOperation: Promise<StandardsRuntimeStatus> | undefined

async function setRuntimeState(next: z.infer<typeof standardsRuntimeStateSchema>) {
  runtimeState = standardsRuntimeStateSchema.parse(next)
  await writeRuntimeState(runtimeState)
  const status = nextStatus(runtimeState)
  setKnowledgeGraphDatabaseEnv(status.ready ? status.databasePath : undefined)
  return status
}

function currentStatus() {
  const status = nextStatus(runtimeState)
  if (runtimeOperation === undefined && IN_PROGRESS_STATES.has(status.state)) {
    const interruptedStatus = {
      ...status,
      state: "error" as const,
      lastError: status.lastError ?? "The previous standards runtime operation was interrupted.",
      progressPercent: undefined,
      progressMessage: undefined,
      ready: false,
    }
    setKnowledgeGraphDatabaseEnv(undefined)
    return interruptedStatus
  }

  setKnowledgeGraphDatabaseEnv(status.ready ? status.databasePath : undefined)
  return status
}

function shouldAutoRepair() {
  if (!runtimeState.enabled) return false
  if (runtimeOperation !== undefined) return false
  if (IN_PROGRESS_STATES.has(runtimeState.state)) return false
  if (runtimeState.state === "error") return false

  const status = nextStatus(runtimeState)
  return !status.ready
}

async function updateRuntimeState(input: Partial<z.infer<typeof standardsRuntimeStateSchema>>) {
  return setRuntimeState({
    ...runtimeState,
    ...input,
  })
}

async function reportRuntimeProgress(input: StandardsProgressUpdate) {
  logStandardsEvent("runtime-progress", input)
  return updateRuntimeState(input)
}

async function withRuntimeOperation(task: () => Promise<StandardsRuntimeStatus>) {
  if (runtimeOperation) {
    return runtimeOperation
  }

  runtimeOperation = task().finally(() => {
    runtimeOperation = undefined
  })
  return runtimeOperation
}

async function installRuntime() {
  return withRuntimeOperation(async () => {
    if (currentStatus().ready) {
      return currentStatus()
    }

    const repairing =
      runtimeState.enabled &&
      (!!runtimeState.lastError ||
        runtimeState.state === "error" ||
        !runtimeState.databasePath ||
        !fs.existsSync(runtimeState.databasePath))

    await updateRuntimeState({
      enabled: true,
      state: repairing ? "repairing" : "downloading",
      lastError: undefined,
      installedDatasetVersion: runtimeState.installedDatasetVersion,
      databasePath: runtimeState.databasePath,
      progressPercent: 5,
      progressMessage: repairing
        ? "Preparing standards repair..."
        : "Preparing standards installation...",
    })

    try {
      const installation = await installBundleFromRelease(reportRuntimeProgress)
      return await setRuntimeState({
        enabled: true,
        state: READY_STATE,
        installedDatasetVersion: installation.manifest.version,
        installedArchiveChecksum: installation.checksum,
        databasePath: installation.databasePath,
        lastHealthyAt: new Date().toISOString(),
        progressPercent: undefined,
        progressMessage: undefined,
      })
    } catch (error) {
      logStandardsEvent("install-failed", {
        error: errorMessage(error),
      })
      return await setRuntimeState({
        ...runtimeState,
        enabled: true,
        state: "error",
        lastError: errorMessage(error),
        progressPercent: undefined,
        progressMessage: undefined,
      })
    }
  })
}

async function removeRuntime() {
  return withRuntimeOperation(async () => {
    await updateRuntimeState({
      enabled: false,
      state: "removing",
      lastError: undefined,
      progressPercent: 20,
      progressMessage: "Removing installed standards files...",
    })

    await fsp.rm(STANDARDS_DIR, { recursive: true, force: true })

    await reportRuntimeProgress({
      state: "removing",
      progressPercent: 85,
      progressMessage: "Clearing standards cache...",
    })

    await fsp.rm(STANDARDS_CACHE_DIR, { recursive: true, force: true })
    setKnowledgeGraphDatabaseEnv(undefined)

    return await setRuntimeState({
      enabled: false,
      state: "not_installed",
      installedDatasetVersion: undefined,
      installedArchiveChecksum: undefined,
      databasePath: undefined,
      progressPercent: undefined,
      progressMessage: undefined,
    })
  })
}

export const StandardsRuntimeService = {
  getStatus() {
    if (shouldAutoRepair()) {
      void installRuntime().catch((error) => {
        logStandardsEvent("auto-repair-failed", {
          error: errorMessage(error),
        })
      })
    }

    return Promise.resolve(currentStatus())
  },
  getStatusSync() {
    return currentStatus()
  },
  isReady() {
    return currentStatus().ready
  },
  isOperationInProgress() {
    return IN_PROGRESS_STATES.has(runtimeState.state)
  },
  async install() {
    return installRuntime()
  },
  async remove() {
    return removeRuntime()
  },
  runtimeAssetInfo() {
    return {
      baseUrl: releaseAssetBaseUrl(),
      archiveFilename: KNOWLEDGE_GRAPH_DB_ARCHIVE_FILENAME,
      checksumFilename: KNOWLEDGE_GRAPH_ARCHIVE_CHECKSUM_FILENAME,
      manifestFilename: KNOWLEDGE_GRAPH_MANIFEST_FILENAME,
      localAssetRoot: localDevelopmentAssetRoot(),
      operationInProgress: runtimeOperation !== undefined,
    }
  },
}
