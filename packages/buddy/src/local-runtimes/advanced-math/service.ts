import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import z from "zod"
import { Global } from "../../storage/global"
import { resolveAdvancedMathRuntimeVersion } from "./version"

const ADVANCED_MATH_DIR = path.join(Global.Path.data, "advanced-math")
const ADVANCED_MATH_CACHE_DIR = path.join(Global.Path.cache, "advanced-math")
const ADVANCED_MATH_STATE_FILE = path.join(Global.Path.state, "advanced-math.json")
const BACKEND_ROOT = path.resolve(import.meta.dir, "../../..")
const DEFAULT_RELEASE_REPOSITORY = "prashantbhudwal/buddy-releases"
const ADVANCED_MATH_BUNDLE_DIR = "buddy-advanced-math"
const ADVANCED_MATH_EXECUTABLE =
  process.platform === "win32" ? "buddy-advanced-math.exe" : "buddy-advanced-math"
const SUPPORTED_LIBRARY_NAMES = [
  "math",
  "sympy",
  "numpy",
  "pandas",
  "xarray",
  "scipy",
  "matplotlib",
  "seaborn",
] as const
const IN_PROGRESS_STATES = new Set(["downloading", "installing", "repairing", "removing"])
const READY_STATE = "ready"
const DEFAULT_SELF_CHECK_TIMEOUT_MS = 60_000
const INSTALLED_RUNTIME_VERSION_KEY = "installedRuntimeVersion"
const LEGACY_INSTALLED_VERSION_KEY = "installedVersion"
const APP_VERSION_ENV = "BUDDY_APP_VERSION"
const NPM_PACKAGE_VERSION_ENV = "npm_package_version"
const DEFAULT_RELEASE_TAG_VERSION = "0.0.1"

const advancedMathRuntimeStateSchema = z.object({
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
  installedRuntimeVersion: z.string().optional(),
  installedChecksum: z.string().optional(),
  targetTriple: z.string(),
  executablePath: z.string().optional(),
  lastHealthyAt: z.string().optional(),
  lastError: z.string().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  progressMessage: z.string().optional(),
})

const pythonCalculatorRequestSchema = z.object({
  code: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  workingDirectory: z.string(),
  artifactDirectory: z.string(),
})

const pythonCalculatorResponseSchema = z.object({
  ok: z.boolean(),
  stdout: z.string().default(""),
  stderr: z.string().default(""),
  lastExpressionOutput: z.string().nullable().optional(),
  artifacts: z.array(z.string()).default([]),
  error: z.string().optional(),
})

export type AdvancedMathRuntimeStatus = z.infer<typeof advancedMathRuntimeStateSchema> & {
  ready: boolean
  supportedLibraries: readonly string[]
}

export type PythonCalculatorResponse = z.infer<typeof pythonCalculatorResponseSchema>
type PythonCalculatorAttachment = {
  type: "file"
  mime: "image/png"
  filename: string
  url: string
}

function currentTargetTriple() {
  if (process.platform === "darwin" && process.arch === "arm64") return "aarch64-apple-darwin"
  if (process.platform === "darwin" && process.arch === "x64") return "x86_64-apple-darwin"
  if (process.platform === "linux" && process.arch === "arm64") return "aarch64-unknown-linux-gnu"
  if (process.platform === "linux" && process.arch === "x64") return "x86_64-unknown-linux-gnu"
  if (process.platform === "win32" && process.arch === "x64") return "x86_64-pc-windows-msvc"
  throw new Error(`Unsupported advanced math runtime target: ${process.platform}/${process.arch}`)
}

function runtimeVersion() {
  return resolveAdvancedMathRuntimeVersion()
}

function releaseTagVersion() {
  const appVersion = process.env[APP_VERSION_ENV]?.trim()
  if (appVersion && appVersion.length > 0) return appVersion

  const packageVersion = process.env[NPM_PACKAGE_VERSION_ENV]?.trim()
  if (packageVersion && packageVersion.length > 0) return packageVersion

  return DEFAULT_RELEASE_TAG_VERSION
}

function runtimeStateDefaults() {
  return {
    enabled: false,
    state: "not_installed",
    targetTriple: currentTargetTriple(),
    progressPercent: undefined,
    progressMessage: undefined,
  } satisfies z.input<typeof advancedMathRuntimeStateSchema>
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
  const installedRuntimeVersion = readOptionalString(inputRecord, INSTALLED_RUNTIME_VERSION_KEY)
  const legacyInstalledVersion = readOptionalString(inputRecord, LEGACY_INSTALLED_VERSION_KEY)

  const parsed = advancedMathRuntimeStateSchema.safeParse({
    ...runtimeStateDefaults(),
    ...inputRecord,
    ...(installedRuntimeVersion
      ? {}
      : legacyInstalledVersion
        ? { installedRuntimeVersion: legacyInstalledVersion }
        : {}),
    targetTriple: currentTargetTriple(),
  })

  if (!parsed.success) {
    return advancedMathRuntimeStateSchema.parse(runtimeStateDefaults())
  }

  return parsed.data
}

function readRuntimeStateSync() {
  const raw = fs.readFileSync(ADVANCED_MATH_STATE_FILE, "utf8")
  return normalizeRuntimeState(JSON.parse(raw))
}

async function writeRuntimeState(state: z.infer<typeof advancedMathRuntimeStateSchema>) {
  await fsp.mkdir(path.dirname(ADVANCED_MATH_STATE_FILE), { recursive: true })
  await fsp.writeFile(ADVANCED_MATH_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

function releaseRepository() {
  return process.env.BUDDY_RELEASE_REPO?.trim() || DEFAULT_RELEASE_REPOSITORY
}

function releaseAssetBaseUrl() {
  const configured = process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL?.trim()
  if (configured) {
    return configured.replace(/\/+$/, "")
  }

  return `https://github.com/${releaseRepository()}/releases/download/v${releaseTagVersion()}`
}

function releaseBundleFilename() {
  return `${ADVANCED_MATH_EXECUTABLE}-v${runtimeVersion()}-${currentTargetTriple()}.zip`
}

function releaseChecksumFilename() {
  return `${releaseBundleFilename()}.sha256`
}

function installRoot() {
  return path.join(ADVANCED_MATH_DIR, runtimeVersion(), currentTargetTriple())
}

function installedBundleRoot() {
  return path.join(installRoot(), ADVANCED_MATH_BUNDLE_DIR)
}

function installedExecutablePath() {
  return path.join(installedBundleRoot(), ADVANCED_MATH_EXECUTABLE)
}

function cacheDownloadPath(filename: string) {
  return path.join(ADVANCED_MATH_CACHE_DIR, filename)
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return String(error)
}

function logRuntimeEvent(event: string, details?: Record<string, unknown>) {
  const suffix = details ? ` ${JSON.stringify(details)}` : ""
  console.error(`[advanced-math-runtime] ${event}${suffix}`)
}

type RuntimeProgressUpdate = {
  state?: "downloading" | "installing" | "repairing" | "removing"
  progressPercent: number
  progressMessage: string
}

function runtimeAssetUrl(filename: string) {
  return `${releaseAssetBaseUrl()}/${filename}`
}

function localDevelopmentAssetRoot() {
  const configured = process.env.BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR?.trim()
  if (configured) {
    return configured
  }

  return path.join(BACKEND_ROOT, "dist", "advanced-math-runtime")
}

function localDevelopmentAssetPath(filename: string) {
  return path.join(localDevelopmentAssetRoot(), currentTargetTriple(), filename)
}

function localDevelopmentAssetsExist() {
  return (
    !process.env.BUDDY_ADVANCED_MATH_ASSET_BASE_URL &&
    fs.existsSync(localDevelopmentAssetPath(releaseBundleFilename())) &&
    fs.existsSync(localDevelopmentAssetPath(releaseChecksumFilename()))
  )
}

async function downloadBytes(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download advanced math runtime asset: ${response.status} ${response.statusText}`,
    )
  }

  return new Uint8Array(await response.arrayBuffer())
}

async function downloadText(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download advanced math runtime checksum: ${response.status} ${response.statusText}`,
    )
  }

  return response.text()
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
    throw new Error("Advanced math runtime checksum asset is empty")
  }

  const [checksum] = firstLine.split(/\s+/)
  if (!checksum) {
    throw new Error("Advanced math runtime checksum asset is invalid")
  }

  return checksum.trim().toLowerCase()
}

function currentLocalAssetChecksumState() {
  if (!localDevelopmentAssetsExist()) {
    return {
      present: false as const,
    }
  }

  try {
    return {
      present: true as const,
      checksum: parseChecksum(
        fs.readFileSync(localDevelopmentAssetPath(releaseChecksumFilename()), "utf8"),
      ),
    }
  } catch (error) {
    return {
      present: true as const,
      error: `Local advanced math runtime checksum is invalid: ${errorMessage(error)}`,
    }
  }
}

function nextStatus(
  state: z.infer<typeof advancedMathRuntimeStateSchema>,
): AdvancedMathRuntimeStatus {
  const currentVersion = runtimeVersion()
  const executableExists =
    typeof state.executablePath === "string" &&
    state.executablePath.length > 0 &&
    fs.existsSync(state.executablePath)
  const versionMatches = state.installedRuntimeVersion === currentVersion
  const localAssetState = currentLocalAssetChecksumState()
  const localAssetError =
    state.enabled && versionMatches && executableExists && localAssetState.present
      ? "error" in localAssetState
        ? localAssetState.error
        : state.installedChecksum === localAssetState.checksum
          ? undefined
          : "Installed advanced math runtime does not match the current local asset bundle"
      : undefined
  const ready =
    state.enabled &&
    state.state === READY_STATE &&
    versionMatches &&
    executableExists &&
    !localAssetError
  const effectiveState =
    state.enabled &&
    !IN_PROGRESS_STATES.has(state.state) &&
    !ready &&
    (state.state === READY_STATE || state.state === "error")
      ? "error"
      : state.state
  const effectiveError =
    effectiveState === "error"
      ? (localAssetError ??
        state.lastError ??
        (!versionMatches && state.installedRuntimeVersion
          ? `Installed advanced math runtime ${state.installedRuntimeVersion} does not match required version ${currentVersion}`
          : !executableExists && state.executablePath
            ? "Installed advanced math runtime executable is missing"
            : state.lastError))
      : state.lastError

  return {
    ...state,
    state: effectiveState,
    ...(effectiveError ? { lastError: effectiveError } : {}),
    ready,
    supportedLibraries: SUPPORTED_LIBRARY_NAMES,
  }
}

function sanitizedRuntimeEnv() {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    TMPDIR: process.env.TMPDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    SYSTEMROOT: process.env.SYSTEMROOT,
    WINDIR: process.env.WINDIR,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
  }
}

function selfCheckTimeoutMs() {
  const configured = Number.parseInt(
    process.env.BUDDY_ADVANCED_MATH_SELF_CHECK_TIMEOUT_MS ?? "",
    10,
  )
  if (Number.isFinite(configured) && configured > 0) {
    return configured
  }
  return DEFAULT_SELF_CHECK_TIMEOUT_MS
}

function waitForProcess(child: ChildProcess, stdoutChunks: Buffer[], stderrChunks: Buffer[]) {
  return new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
    stdout: string
    stderr: string
  }>((resolve, reject) => {
    child.on("error", reject)
    child.on("close", (code, signal) => {
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      })
    })
  })
}

function hasChildExited(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null
}

function waitForChildExit(child: ChildProcess) {
  if (hasChildExited(child)) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      child.off("close", onClose)
      child.off("error", onError)
    }

    const onClose = () => {
      cleanup()
      resolve()
    }

    const onError = (error: Error) => {
      cleanup()
      if (hasChildExited(child)) {
        resolve()
        return
      }
      reject(error)
    }

    child.once("close", onClose)
    child.once("error", onError)
  })
}

async function stopChildProcess(child: ChildProcess, timeoutMs = 5_000) {
  if (hasChildExited(child)) {
    return
  }

  const exitPromise = waitForChildExit(child)
  child.kill("SIGKILL")

  await Promise.race([
    exitPromise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error("Timed out waiting for advanced math runtime process to stop"))
      }, timeoutMs)
    }),
  ])
}

async function runSelfCheck(executablePath: string) {
  const timeoutMs = selfCheckTimeoutMs()
  const child = spawn(executablePath, ["self-check"], {
    env: sanitizedRuntimeEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  })
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })

  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill("SIGKILL")
  }, timeoutMs)

  const result = await waitForProcess(child, stdoutChunks, stderrChunks)
  clearTimeout(timeout)
  if (result.code !== 0) {
    const details =
      result.stderr.trim() ||
      result.stdout.trim() ||
      (timedOut
        ? `timed out after ${timeoutMs}ms`
        : result.signal
          ? `terminated by signal ${result.signal}`
          : `exit code ${result.code ?? "unknown"}`)
    throw new Error(`Advanced math runtime self-check failed: ${details}`)
  }
}

async function ensureExecutablePermissions(executablePath: string) {
  if (process.platform === "win32") return
  await fsp.chmod(executablePath, 0o755)
}

async function extractRuntimeBundle(bundlePath: string, destinationDir: string) {
  await fsp.mkdir(path.dirname(destinationDir), { recursive: true })

  if (process.platform === "win32") {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${bundlePath.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`,
      ],
      {
        env: sanitizedRuntimeEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    const result = await waitForProcess(child, stdoutChunks, stderrChunks)
    if (result.code !== 0) {
      const details =
        result.stderr.trim() || result.stdout.trim() || `exit code ${result.code ?? "unknown"}`
      throw new Error(`Failed to extract advanced math runtime bundle: ${details}`)
    }
    return
  }

  const child = spawn("ditto", ["-x", "-k", bundlePath, destinationDir], {
    env: sanitizedRuntimeEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  })
  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })
  const result = await waitForProcess(child, stdoutChunks, stderrChunks)
  if (result.code !== 0) {
    const details =
      result.stderr.trim() || result.stdout.trim() || `exit code ${result.code ?? "unknown"}`
    throw new Error(`Failed to extract advanced math runtime bundle: ${details}`)
  }
}

async function installBundleFromRelease(
  reportProgress: (input: RuntimeProgressUpdate) => Promise<unknown>,
) {
  await fsp.mkdir(ADVANCED_MATH_CACHE_DIR, { recursive: true })

  const bundleName = releaseBundleFilename()
  const checksumName = releaseChecksumFilename()
  const localSource = localDevelopmentAssetsExist()
  logRuntimeEvent("install-start", {
    bundleName,
    checksumName,
    installRoot: installRoot(),
    localAssetRoot: localDevelopmentAssetRoot(),
    source: localSource ? "local" : "remote",
  })
  await reportProgress({
    state: localSource ? "installing" : "downloading",
    progressPercent: 15,
    progressMessage: localSource
      ? "Reading local runtime bundle..."
      : "Downloading runtime bundle...",
  })

  const bundleBytes = localSource
    ? await fsp.readFile(localDevelopmentAssetPath(bundleName))
    : await downloadBytes(runtimeAssetUrl(bundleName)).catch((error) => {
        throw new Error(
          `${errorMessage(error)}. If you are running Buddy from source, build the local advanced math runtime asset first.`,
        )
      })

  await reportProgress({
    state: localSource ? "installing" : "downloading",
    progressPercent: 30,
    progressMessage: localSource
      ? "Loading runtime checksum..."
      : "Downloading runtime checksum...",
  })

  const checksumText = localSource
    ? await fsp.readFile(localDevelopmentAssetPath(checksumName), "utf8")
    : await downloadText(runtimeAssetUrl(checksumName)).catch((error) => {
        throw new Error(
          `${errorMessage(error)}. If you are running Buddy from source, build the local advanced math runtime asset first.`,
        )
      })

  await reportProgress({
    state: "installing",
    progressPercent: 45,
    progressMessage: "Validating runtime bundle...",
  })
  const expectedChecksum = parseChecksum(checksumText)
  const actualChecksum = sha256(bundleBytes)
  if (actualChecksum !== expectedChecksum) {
    throw new Error(`Advanced math runtime checksum mismatch for ${bundleName}`)
  }

  const downloadPath = cacheDownloadPath(bundleName)
  const tempInstallRoot = `${installRoot()}.tmp-${process.pid}-${Date.now()}`
  await fsp.writeFile(downloadPath, bundleBytes)

  try {
    await fsp.rm(tempInstallRoot, { recursive: true, force: true })
    await reportProgress({
      state: "installing",
      progressPercent: 65,
      progressMessage: "Extracting runtime files...",
    })
    logRuntimeEvent("install-extracting", {
      bundlePath: downloadPath,
      destinationDir: tempInstallRoot,
    })
    await extractRuntimeBundle(downloadPath, tempInstallRoot)
    await reportProgress({
      state: "installing",
      progressPercent: 85,
      progressMessage: "Verifying runtime...",
    })
    logRuntimeEvent("install-running-self-check", {
      executablePath: path.join(
        tempInstallRoot,
        ADVANCED_MATH_BUNDLE_DIR,
        ADVANCED_MATH_EXECUTABLE,
      ),
    })
    await ensureExecutablePermissions(
      path.join(tempInstallRoot, ADVANCED_MATH_BUNDLE_DIR, ADVANCED_MATH_EXECUTABLE),
    )
    await runSelfCheck(
      path.join(tempInstallRoot, ADVANCED_MATH_BUNDLE_DIR, ADVANCED_MATH_EXECUTABLE),
    )
    await reportProgress({
      state: "installing",
      progressPercent: 95,
      progressMessage: "Finalizing installation...",
    })
    await fsp.rm(installRoot(), { recursive: true, force: true })
    await fsp.rename(tempInstallRoot, installRoot())
    await ensureExecutablePermissions(installedExecutablePath())
    await fsp.writeFile(cacheDownloadPath(checksumName), `${expectedChecksum}\n`, "utf8")
    logRuntimeEvent("install-finished", {
      executablePath: installedExecutablePath(),
      checksum: expectedChecksum,
    })
    return {
      checksum: expectedChecksum,
    }
  } finally {
    await fsp.rm(tempInstallRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

function dataUrlFromFile(filepath: string, mime: string) {
  const content = fs.readFileSync(filepath)
  return `data:${mime};base64,${content.toString("base64")}`
}

function calculatorAttachments(result: PythonCalculatorResponse): PythonCalculatorAttachment[] {
  return result.artifacts
    .filter((filepath) => filepath.toLowerCase().endsWith(".png") && fs.existsSync(filepath))
    .map((filepath) => ({
      type: "file" as const,
      mime: "image/png" as const,
      filename: path.basename(filepath),
      url: dataUrlFromFile(filepath, "image/png"),
    }))
}

let runtimeState = (() => {
  try {
    return readRuntimeStateSync()
  } catch {
    return advancedMathRuntimeStateSchema.parse(runtimeStateDefaults())
  }
})()

let runtimeOperation: Promise<AdvancedMathRuntimeStatus> | undefined
const activeCalculatorChildren = new Set<ChildProcess>()

async function setRuntimeState(next: z.infer<typeof advancedMathRuntimeStateSchema>) {
  runtimeState = advancedMathRuntimeStateSchema.parse(next)
  await writeRuntimeState(runtimeState)
  return nextStatus(runtimeState)
}

function currentStatus() {
  const status = nextStatus(runtimeState)
  if (runtimeOperation === undefined && IN_PROGRESS_STATES.has(status.state)) {
    return {
      ...status,
      state: "error" as const,
      lastError:
        status.lastError ?? "The previous advanced math runtime operation was interrupted.",
      progressPercent: undefined,
      progressMessage: undefined,
      ready: false,
    }
  }
  return status
}

function shouldAutoUpdate(): boolean {
  // Auto-update if:
  // 1. Runtime is enabled
  // 2. Version is out of date
  // 3. No operation is currently in progress
  // 4. Not already in an error state
  if (!runtimeState.enabled) return false
  if (runtimeOperation !== undefined) return false
  if (IN_PROGRESS_STATES.has(runtimeState.state)) return false
  if (runtimeState.state === "error") return false

  const versionMatches = runtimeState.installedRuntimeVersion === runtimeVersion()
  if (versionMatches) return false

  // Has a previous version installed that needs updating
  return (
    runtimeState.state === READY_STATE &&
    typeof runtimeState.installedRuntimeVersion === "string" &&
    runtimeState.installedRuntimeVersion.length > 0
  )
}

async function updateRuntimeState(input: Partial<z.infer<typeof advancedMathRuntimeStateSchema>>) {
  return setRuntimeState({
    ...runtimeState,
    ...input,
    targetTriple: currentTargetTriple(),
  })
}

async function reportRuntimeProgress(input: RuntimeProgressUpdate) {
  logRuntimeEvent("runtime-progress", input)
  return updateRuntimeState(input)
}

async function withRuntimeOperation(task: () => Promise<AdvancedMathRuntimeStatus>) {
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
        runtimeState.installedRuntimeVersion !== runtimeVersion() ||
        (typeof runtimeState.executablePath === "string" &&
          runtimeState.executablePath.length > 0 &&
          !fs.existsSync(runtimeState.executablePath)))
    await updateRuntimeState({
      enabled: true,
      state: repairing ? "repairing" : "downloading",
      lastError: undefined,
      installedRuntimeVersion: runtimeState.installedRuntimeVersion,
      executablePath: runtimeState.executablePath,
      progressPercent: 5,
      progressMessage: repairing
        ? "Preparing runtime repair..."
        : "Preparing runtime installation...",
    })

    try {
      const installation = await installBundleFromRelease(reportRuntimeProgress)
      return await setRuntimeState({
        enabled: true,
        state: READY_STATE,
        installedRuntimeVersion: runtimeVersion(),
        installedChecksum: installation.checksum,
        targetTriple: currentTargetTriple(),
        executablePath: installedExecutablePath(),
        lastHealthyAt: new Date().toISOString(),
        progressPercent: undefined,
        progressMessage: undefined,
      })
    } catch (error) {
      logRuntimeEvent("install-failed", {
        error: errorMessage(error),
      })
      return await setRuntimeState({
        ...runtimeState,
        enabled: true,
        state: "error",
        targetTriple: currentTargetTriple(),
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
      progressPercent: 15,
      progressMessage: "Stopping runtime processes...",
    })

    await Promise.all(Array.from(activeCalculatorChildren, (child) => stopChildProcess(child)))

    await reportRuntimeProgress({
      state: "removing",
      progressPercent: 60,
      progressMessage: "Removing installed runtime files...",
    })
    await fsp.rm(ADVANCED_MATH_DIR, { recursive: true, force: true })
    await reportRuntimeProgress({
      state: "removing",
      progressPercent: 85,
      progressMessage: "Clearing cached runtime assets...",
    })
    await fsp.rm(ADVANCED_MATH_CACHE_DIR, { recursive: true, force: true })

    return await setRuntimeState({
      enabled: false,
      state: "not_installed",
      targetTriple: currentTargetTriple(),
      progressPercent: undefined,
      progressMessage: undefined,
    })
  })
}

function calculatorTimeoutMs() {
  const configured = Number.parseInt(process.env.BUDDY_ADVANCED_MATH_TIMEOUT_MS ?? "", 10)
  return Number.isFinite(configured) && configured > 0 ? configured : 30_000
}

async function runPythonCalculator(
  code: string,
  abort?: AbortSignal,
): Promise<{ result: PythonCalculatorResponse; attachments: PythonCalculatorAttachment[] }> {
  let status = currentStatus()
  const versionMismatch = runtimeState.installedRuntimeVersion !== runtimeVersion()
  if ((!status.ready || versionMismatch) && runtimeState.enabled) {
    status = await installRuntime()
  }
  if (!status.ready || !runtimeState.executablePath) {
    throw new Error("Advanced math runtime is not installed")
  }

  const request = pythonCalculatorRequestSchema.parse({
    code,
    timeoutMs: calculatorTimeoutMs(),
    workingDirectory: await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-advanced-math-job-")),
    artifactDirectory: await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-advanced-math-artifacts-")),
  })

  const child = spawn(runtimeState.executablePath, ["execute"], {
    env: sanitizedRuntimeEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  })
  activeCalculatorChildren.add(child)

  const stdoutChunks: Buffer[] = []
  const stderrChunks: Buffer[] = []
  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })

  const timeout = setTimeout(() => {
    child.kill("SIGKILL")
  }, request.timeoutMs)

  const onAbort = () => {
    child.kill("SIGKILL")
  }
  abort?.addEventListener("abort", onAbort, { once: true })

  try {
    child.stdin?.end(`${JSON.stringify(request)}\n`)
    const result = await waitForProcess(child, stdoutChunks, stderrChunks)

    if (abort?.aborted) {
      throw new Error("Calculator execution aborted")
    }

    if (result.code !== 0) {
      const details =
        result.stderr.trim() || result.stdout.trim() || `exit code ${result.code ?? "unknown"}`
      throw new Error(`Calculator execution failed: ${details}`)
    }

    const parsed = pythonCalculatorResponseSchema.parse(JSON.parse(result.stdout || "{}"))
    return {
      result: parsed,
      attachments: calculatorAttachments(parsed),
    }
  } finally {
    clearTimeout(timeout)
    abort?.removeEventListener("abort", onAbort)
    activeCalculatorChildren.delete(child)
    await Promise.all([
      fsp.rm(request.workingDirectory, { recursive: true, force: true }),
      fsp.rm(request.artifactDirectory, { recursive: true, force: true }),
    ])
  }
}

function formatCalculatorOutput(result: PythonCalculatorResponse) {
  const sections: string[] = []

  const stdout = result.stdout.trim()
  if (stdout.length > 0) {
    sections.push(stdout)
  }

  const lastExpression = result.lastExpressionOutput?.trim()
  if (lastExpression && lastExpression !== "None") {
    sections.push(lastExpression)
  }

  const stderr = result.stderr.trim()
  if (stderr.length > 0) {
    sections.push(`stderr:\n${stderr}`)
  }

  if (sections.length === 0) {
    const plotCount = result.artifacts.length
    if (plotCount > 0) {
      sections.push(`Generated ${plotCount} plot${plotCount === 1 ? "" : "s"}.`)
    } else {
      sections.push("Execution completed with no output.")
    }
  }

  return sections.join("\n\n")
}

export const AdvancedMathRuntimeService = {
  supportedLibraries: SUPPORTED_LIBRARY_NAMES,
  getStatus() {
    // Trigger auto-update in background if needed
    if (shouldAutoUpdate()) {
      void installRuntime().catch((error) => {
        logRuntimeEvent("auto-update-failed", {
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
  async runCalculator(code: string, abort?: AbortSignal) {
    const execution = await runPythonCalculator(code, abort)
    if (!execution.result.ok) {
      throw new Error(
        execution.result.error?.trim() ||
          execution.result.stderr.trim() ||
          "Calculator execution failed",
      )
    }

    return {
      result: execution.result,
      output: formatCalculatorOutput(execution.result),
      attachments: execution.attachments,
    }
  },
  runtimeAssetInfo() {
    return {
      baseUrl: releaseAssetBaseUrl(),
      bundleFilename: releaseBundleFilename(),
      checksumFilename: releaseChecksumFilename(),
      installRoot: installRoot(),
      executablePath: installedExecutablePath(),
      targetTriple: currentTargetTriple(),
      version: runtimeVersion(),
      operationInProgress: runtimeOperation !== undefined,
    }
  },
}
