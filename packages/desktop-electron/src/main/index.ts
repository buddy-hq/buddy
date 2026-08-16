import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { existsSync } from "node:fs"
import { readFile, unlink, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"
import { app, BrowserWindow, dialog, shell } from "electron"
import type { Event } from "electron"
import electronUpdaterPackage from "electron-updater"
import type { ProgressInfo } from "electron-updater"
import { BUDDY_ENV, XDG_ENV } from "@buddy/script/storage-env"
import type { InitStep, ServerReadyData } from "../preload/types"
import {
  BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV,
  BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV,
} from "../shared/backend-development-reload"
import {
  createCustomMacUpdater,
  parseMacInstallerResult,
  resolveCustomMacUpdaterOptions,
  resolveMacInstallerLogPath,
  resolveMacInstallerResultPath,
  resolveMacAppPath,
  type MacInstallerResult,
} from "./custom-mac-updater"
import {
  APP_PROTOCOL,
  BACKEND_HEALTH_TIMEOUT_MS,
  BACKEND_SERVER_USERNAME,
  CHANNEL,
  LOOPBACK_HOSTNAME,
  resolveAppId,
  resolveAppName,
  UPDATER_ENABLED,
} from "./constants"
import { checkAppExists, resolveAppPath, wslPath } from "./apps"
import { buildRuntimeEnvironment, installCli } from "./cli"
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand } from "./ipc"
import { initLogging, safelyWriteToStandardStream } from "./logging"
import {
  MAC_INSTALLER_FAILURE_BUTTONS,
  MAC_INSTALLER_FAILURE_MESSAGE,
  MAC_INSTALLER_FAILURE_TITLE,
  macInstallerFailureDetail,
} from "./mac-installer-failure-dialog"
import { parseMarkdown } from "./markdown"
import { exportMarkdownPdf } from "./markdown-pdf"
import { createMenu } from "./menu"
import {
  blockUpdateVersion,
  fetchRecoveryPolicy,
  findRecoveryTarget,
  isUpdateVersionBlocked,
  validateRecoveryTarget,
  type RecoveryTarget,
} from "./recovery-policy"
import { configureBackendRequestAuth, registerBackendRequestAuth } from "./backend-auth"
import {
  getDefaultServerUrl,
  getWslConfig,
  setDefaultServerUrl,
  setWslConfig,
  spawnLocalServer,
  type CommandChild,
  type TerminatedPayload,
} from "./server"
import { resolveOpenCodeSqlitePath } from "./storage-paths"
import {
  BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY,
  fetchSignedElectronUpdateManifest,
  RELEASE_REPOSITORY,
  RELEASE_REPOSITORY_NAME,
  RELEASE_REPOSITORY_OWNER,
  resolveLatestRingAssetUrl,
  resolveVersionedReleaseAssetUrls,
  SignedUpdateFetchError,
} from "./update-common"
import {
  createReadyUpdateStore,
  createUpdateCheckCoordinator,
  isReadyUpdateCurrent,
} from "./update-check-coordinator"
import { compareVersions } from "./recovery-policy-core"
import { watchBackendDevelopmentReloadSignal } from "./backend-development-reload"
import type {
  UpdateProgressErrorStage,
  UpdateProgressSnapshot,
  UpdateRing,
} from "../shared/update-state"
import { parseTErrorCode, parseTPortedAddress } from "../shared/parse-external"
import { UPDATE_RING_PREVIEW, createIdleUpdateProgress, isUpdateRing } from "../shared/update-state"
import { getUpdateRing, setUpdateRing as persistUpdateRing } from "./update-ring"
import {
  createWindowsUpdateFeedProviderOptions,
  startWindowsUpdateFeed,
  type WindowsUpdateFeed,
} from "./windows-update-feed"
import { resolveWindowsUpdateManifestFilename } from "../shared/release-asset-names"
import { createLoadingWindow, createMainWindow, setBackgroundColor, setDockIcon } from "./windows"

const { autoUpdater } = electronUpdaterPackage
const STARTUP_FAILURE_MESSAGE = "Buddy failed to start."
const UNKNOWN_STARTUP_FAILURE_DETAIL = "The local Buddy server did not become ready."
const LOADING_WINDOW_COMPLETE_TIMEOUT_MS = 5_000
const MAC_UPDATE_CACHE_DIRECTORY_NAME = "mac-updater"
const BUDDY_DOWNLOAD_URL = `https://github.com/${RELEASE_REPOSITORY}/releases/latest`
const WINDOWS_REMOTE_UPDATE_MANIFEST_FILENAME = resolveWindowsUpdateManifestFilename("x64")
const LEGACY_WINDOWS_UPDATE_MANIFEST_FILENAME = "latest.yml"
const PRIMARY_DIALOG_RESPONSE = 0
const SECONDARY_DIALOG_RESPONSE = 1
const STARTUP_FAILURE_UPDATE_CHECK_BUTTONS = ["Check for Update", "Quit"] as const
const STARTUP_FAILURE_UPDATE_INSTALL_BUTTONS = ["Install and Restart", "Quit"] as const
const STARTUP_FAILURE_UPDATE_MISSING_BUTTONS = ["Open Download Page", "Quit"] as const
const UPDATE_READY_RESTART_BUTTONS = ["Restart", "Later"] as const
const BLOCKED_UPDATE_DIALOG_MESSAGE = "No updates available at this time."

app.setName(resolveAppName(app.isPackaged))
if (process.platform === "win32") {
  app.setAppUserModelId(resolveAppId(app.isPackaged))
}
app.setPath("userData", join(app.getPath("appData"), resolveAppId(app.isPackaged)))

const logger = initLogging()
const initEmitter = new EventEmitter()

let initStep: InitStep = { phase: "server_waiting" }
let mainWindow: BrowserWindow | null = null
let backendUtility: CommandChild | null = null
let embeddedBackendConfig: EmbeddedBackendConfig | undefined
let applicationQuitting = false
let stopBackendDevelopmentReloadWatcher: (() => void) | undefined
let updaterEnabled = UPDATER_ENABLED
let customMacUpdater: ReturnType<typeof createCustomMacUpdater> | null = null
let updateProgress: UpdateProgressSnapshot = createIdleUpdateProgress(getUpdateRing())
let activeWindowsDownload:
  | {
      ring: UpdateRing
      version: string
    }
  | undefined

type UpdateCheckResult = {
  blocked?: boolean
  failed?: boolean
  recoveryTarget?: RecoveryTarget
  updateAvailable: boolean
  version?: string
}

type SignedWindowsUpdateFeed = WindowsUpdateFeed & {
  version: string
}

type EmbeddedBackendConfig = {
  environment: Readonly<Record<string, string>>
  hostname: string
  password: string
  port: number
}

const loadingComplete = defer<void>()
const serverReady = defer<ServerReadyData>()
const pendingDeepLinks: string[] = []
const readyUpdateStore = createReadyUpdateStore()
const updateCheckCoordinator = createUpdateCheckCoordinator<UpdateCheckResult>(runLatestUpdateCheck)

setupApplication()

function setupApplication() {
  ensureLoopbackNoProxy()
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>")

  if (app.isPackaged && !app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  app.on("second-instance", (_event: Event, argv: string[]) => {
    const urls = argv.filter((arg) => arg.startsWith(`${APP_PROTOCOL}://`))
    if (urls.length > 0) {
      emitDeepLinks(urls)
    }
    focusMainWindow()
  })

  app.on("open-url", (event: Event, url: string) => {
    event.preventDefault()
    emitDeepLinks([url])
    focusMainWindow()
  })

  app.on("before-quit", () => {
    beginApplicationShutdown()
    void killBackendUtility()
  })

  app.on("will-quit", () => {
    beginApplicationShutdown()
    void killBackendUtility()
  })

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      beginApplicationShutdown()
      void killBackendUtility().finally(() => app.exit(0))
    })
  }

  void app.whenReady().then(async () => {
    registerBackendRequestAuth()
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(APP_PROTOCOL)
    }
    if (process.platform === "darwin") {
      customMacUpdater = createCustomMacUpdater({
        currentVersion: app.getVersion(),
        packaged: app.isPackaged,
        execPath: process.execPath,
        cachePath: join(
          app.getPath("temp"),
          resolveAppId(app.isPackaged),
          MAC_UPDATE_CACHE_DIRECTORY_NAME,
        ),
        logsPath: app.getPath("logs"),
        appPath: resolveMacAppPath(process.execPath),
        appName: app.getName(),
        appRootPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
        logger,
        stopBackend: () => killBackendUtility(),
        quit: () => app.quit(),
        isVersionBlocked: (version) => isUpdateVersionBlocked(version),
        ...resolveCustomMacUpdaterOptions(),
      })
      await reportPreviousMacInstallerResult()
    }
    updaterEnabled = await setupAutoUpdater()
    setDockIcon()
    await initialize()
  })
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return
  pendingDeepLinks.push(...urls)
  if (mainWindow) {
    sendDeepLinks(mainWindow, urls)
  }
}

function focusMainWindow() {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

function setUpdateProgress(snapshot: UpdateProgressSnapshot): void {
  updateProgress = {
    ...snapshot,
    percent: normalizeUpdatePercent(snapshot.percent),
  }
  mainWindow?.webContents.send("update-progress", updateProgress)
}

function getUpdateProgress(): UpdateProgressSnapshot {
  return updateProgress
}

function saveUpdateRing(ring: UpdateRing): void {
  if (!isUpdateRing(ring)) {
    throw new Error(`Invalid update ring: ${String(ring)}`)
  }

  persistUpdateRing(ring)
  const activeProgressStatus =
    updateProgress.status === "checking" ||
    updateProgress.status === "downloading" ||
    updateProgress.status === "installing"
  if (
    updateProgress.status === "idle" ||
    updateProgress.status === "error" ||
    (updateProgress.ring !== ring && !activeProgressStatus)
  ) {
    setUpdateProgress(createIdleUpdateProgress(ring))
  }
}

function normalizeUpdatePercent(percent: number | undefined): number | undefined {
  if (percent === undefined || !Number.isFinite(percent)) {
    return undefined
  }

  return Math.min(100, Math.max(0, percent))
}

function setUpdateIdle(ring: UpdateRing): void {
  setUpdateProgress(createIdleUpdateProgress(ring))
}

function setUpdateError(input: {
  ring: UpdateRing
  stage: UpdateProgressErrorStage
  version?: string
}): void {
  setUpdateProgress({
    errorStage: input.stage,
    ring: input.ring,
    status: "error",
    version: input.version,
  })
}

function setInitStep(step: InitStep) {
  initStep = step
  initEmitter.emit("step", step)
}

async function initialize() {
  let overlay: BrowserWindow | null = null

  try {
    const port = await getBackendPort()
    const hostname = LOOPBACK_HOSTNAME
    const url = `http://${hostname}:${port}`
    const password = randomUUID()
    const runtimeEnvironment = await buildRuntimeEnvironment(password, port)
    const needsMigration = !sqliteFileExists(runtimeEnvironment)

    embeddedBackendConfig = {
      environment: runtimeEnvironment,
      hostname,
      password,
      port,
    }
    const health = await startBackendUtility(embeddedBackendConfig)

    serverReady.resolve({
      isEmbeddedBackend: true,
      url,
      username: BACKEND_SERVER_USERNAME,
      password,
    })
    configureBackendRequestAuth({
      url,
      username: BACKEND_SERVER_USERNAME,
      password,
    })

    const backendReady = Promise.race([
      health.wait,
      delay(BACKEND_HEALTH_TIMEOUT_MS).then(() => {
        throw new Error("Backend health check timed out")
      }),
    ])

    const loadingTask = backendReady

    const windowGlobals = {
      updaterEnabled,
      deepLinks: pendingDeepLinks,
      version: app.getVersion(),
    }

    if (needsMigration) {
      const shouldShowLoading = await Promise.race([
        loadingTask.then(() => false),
        delay(1_000).then(() => true),
      ])

      if (shouldShowLoading) {
        overlay = createLoadingWindow(windowGlobals)
        await delay(1_000)
      }
    }

    await loadingTask
    startBackendDevelopmentReloadWatcher()
    setInitStep({ phase: "done" })

    if (overlay) {
      const loadingCompleted = await Promise.race([
        loadingComplete.promise.then(() => true),
        delay(LOADING_WINDOW_COMPLETE_TIMEOUT_MS).then(() => false),
      ])

      if (!loadingCompleted) {
        logger.warn("loading window completion signal timed out; continuing startup")
      }
    }

    mainWindow = createMainWindow(windowGlobals)
    wireMenu()

    if (overlay) {
      overlay.close()
    }
  } catch (error) {
    await handleInitializationFailure(error, overlay)
  }
}

async function handleInitializationFailure<TError>(
  error: TError,
  overlay: BrowserWindow | null,
) {
  logger.error("initialization failed", error)

  if (overlay && !overlay.isDestroyed()) {
    overlay.close()
  }

  await killBackendUtility()

  if (await offerStartupFailureUpdateRecovery(error)) {
    return
  }

  app.quit()
}

async function offerStartupFailureUpdateRecovery<TError>(error: TError): Promise<boolean> {
  if (!updaterEnabled) {
    await showStartupFailureDialog(error)
    return false
  }

  try {
    const response = await dialog.showMessageBox({
      type: "error",
      title: app.getName(),
      message: STARTUP_FAILURE_MESSAGE,
      detail: [
        startupFailureDetail(error),
        "",
        "Buddy can still check for an update without the local server running.",
      ].join("\n"),
      buttons: [...STARTUP_FAILURE_UPDATE_CHECK_BUTTONS],
      defaultId: PRIMARY_DIALOG_RESPONSE,
      cancelId: SECONDARY_DIALOG_RESPONSE,
    })

    if (response.response !== PRIMARY_DIALOG_RESPONSE) {
      return false
    }
  } catch {
    return false
  }

  const result = await checkStartupRecoveryUpdate()
  if (!result.updateAvailable) {
    await showStartupFailureUpdateMissingDialog(result.failed, result.blocked)
    return false
  }

  const response = await dialog.showMessageBox({
    type: "info",
    title: "Update Ready",
    message: `Buddy ${result.version ?? ""} is ready to install.`,
    detail: startupRecoveryInstallDetail(result.recoveryTarget),
    buttons: [...STARTUP_FAILURE_UPDATE_INSTALL_BUTTONS],
    defaultId: PRIMARY_DIALOG_RESPONSE,
    cancelId: SECONDARY_DIALOG_RESPONSE,
  })

  if (response.response !== PRIMARY_DIALOG_RESPONSE) {
    return false
  }

  await installUpdate()
  return true
}

async function checkStartupRecoveryUpdate(): Promise<UpdateCheckResult> {
  const policy = await fetchRecoveryPolicy({ logger })
  const target = policy
    ? findRecoveryTarget({
        channel: CHANNEL,
        currentVersion: app.getVersion(),
        platform: process.platform,
        policy,
      })
    : undefined

  if (!target) {
    return await checkUpdate()
  }

  const invalidReason = validateRecoveryTarget(target, app.getVersion())
  if (invalidReason) {
    logger.error("recovery policy target rejected", {
      currentVersion: app.getVersion(),
      invalidReason,
      targetVersion: target.targetVersion,
    })
    return { failed: true, updateAvailable: false }
  }

  if (target.blockVersion) {
    blockUpdateVersion(target.version)
  }

  const result = await checkUpdateForVersion(target.targetVersion)
  return {
    ...result,
    recoveryTarget: result.updateAvailable ? target : undefined,
  }
}

function startupRecoveryInstallDetail(target: RecoveryTarget | undefined): string {
  if (!target) {
    return "Install the update now to recover from this startup failure."
  }

  const action = target.mode === "downgrade" ? "rollback" : "recovery update"
  const reason = target.reason ? `\n\nReason: ${target.reason}` : ""
  return `Buddy will install the ${action} selected by the signed recovery policy.${reason}`
}

async function reportPreviousMacInstallerResult(): Promise<void> {
  const result = await consumePreviousMacInstallerResult()
  if (result?.status !== "failed") {
    return
  }

  const logPath = resolveMacInstallerLogPath(app.getPath("logs"))
  logger.error("previous mac installer failed", {
    exitCode: result.exitCode,
    logPath,
  })

  try {
    const response = await dialog.showMessageBox({
      type: "warning",
      title: MAC_INSTALLER_FAILURE_TITLE,
      message: MAC_INSTALLER_FAILURE_MESSAGE,
      detail: macInstallerFailureDetail(result, logPath),
      buttons: [...MAC_INSTALLER_FAILURE_BUTTONS],
      defaultId: PRIMARY_DIALOG_RESPONSE,
      cancelId: PRIMARY_DIALOG_RESPONSE,
    })

    if (response.response === SECONDARY_DIALOG_RESPONSE) {
      await openInstallerLog(logPath)
    }
  } catch (error) {
    logger.warn("failed to show mac installer failure dialog", error)
  }
}

async function consumePreviousMacInstallerResult(): Promise<MacInstallerResult | undefined> {
  const resultPath = resolveMacInstallerResultPath(app.getPath("logs"))
  let content: string

  try {
    content = await readFile(resultPath, "utf8")
  } catch (error) {
    if (!isNodeErrorCode(error, "ENOENT")) {
      logger.warn("failed to read mac installer result", error)
    }
    return undefined
  }

  let result: MacInstallerResult
  try {
    result = parseMacInstallerResult(content)
  } catch (error) {
    logger.warn("failed to parse mac installer result", error)
    await unlink(resultPath).catch((unlinkError) => {
      logger.warn("failed to clear invalid mac installer result", unlinkError)
    })
    return undefined
  }

  if (result.status === "running") {
    return undefined
  }

  await unlink(resultPath).catch((error) => {
    logger.warn("failed to clear mac installer result", error)
  })
  return result
}

async function openInstallerLog(logPath: string): Promise<void> {
  const error = await shell.openPath(logPath)
  if (error.length > 0) {
    logger.warn("failed to open mac installer log", { error, logPath })
  }
}

function isNodeErrorCode<TError>(error: TError, code: string): boolean {
  return error instanceof Error && parseTErrorCode(error) === code
}

async function showStartupFailureDialog<TError>(error: TError): Promise<void> {
  try {
    await dialog.showMessageBox({
      type: "error",
      title: app.getName(),
      message: STARTUP_FAILURE_MESSAGE,
      detail: startupFailureDetail(error),
    })
  } catch {
    // noop
  }
}

async function showStartupFailureUpdateMissingDialog(
  failed: boolean | undefined,
  blocked: boolean | undefined,
): Promise<void> {
  const response = await dialog.showMessageBox({
    type: failed ? "error" : "info",
    title: app.getName(),
    message: startupFailureUpdateMissingMessage(failed, blocked),
    detail: "You can still download the latest Buddy release manually.",
    buttons: [...STARTUP_FAILURE_UPDATE_MISSING_BUTTONS],
    defaultId: PRIMARY_DIALOG_RESPONSE,
    cancelId: SECONDARY_DIALOG_RESPONSE,
  })

  if (response.response === PRIMARY_DIALOG_RESPONSE) {
    await shell.openExternal(BUDDY_DOWNLOAD_URL)
  }
}

function startupFailureUpdateMissingMessage(
  failed: boolean | undefined,
  blocked: boolean | undefined,
): string {
  if (failed) return "Update check failed."
  if (blocked) return BLOCKED_UPDATE_DIALOG_MESSAGE
  return "No updates available."
}

function startupFailureDetail<TError>(error: TError) {
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  return UNKNOWN_STARTUP_FAILURE_DETAIL
}

function wireMenu() {
  if (!mainWindow) return

  createMenu({
    updaterEnabled,
    trigger: (id) => {
      if (mainWindow) {
        sendMenuCommand(mainWindow, id)
      }
    },
    installCli: () => {
      void installCli().catch((error) => {
        logger.error("Failed to install CLI", error)
      })
    },
    checkForUpdates: () => {
      void checkForUpdates(true)
    },
    reload: () => {
      mainWindow?.reload()
    },
    relaunch: () => {
      void killBackendUtility().finally(() => {
        app.relaunch()
        app.exit(0)
      })
    },
  })
}

registerIpcHandlers({
  killBackendUtility: () => killBackendUtility(),
  installCli: async () => installCli(),
  awaitInitialization: async (sendStep) => {
    sendStep(initStep)
    const listener = (step: InitStep) => sendStep(step)
    initEmitter.on("step", listener)

    try {
      return await serverReady.promise
    } finally {
      initEmitter.off("step", listener)
    }
  },
  getDefaultServerUrl: () => getDefaultServerUrl(),
  setDefaultServerUrl: (url) => setDefaultServerUrl(url),
  getWslConfig: () => Promise.resolve(getWslConfig()),
  setWslConfig: (config) => setWslConfig(config),
  getDisplayBackend: async () => null,
  setDisplayBackend: async () => undefined,
  parseMarkdown: async (markdown) => parseMarkdown(markdown),
  checkAppExists: async (appName) => checkAppExists(appName),
  resolveAppPath: async (appName) => resolveAppPath(appName),
  wslPath: async (inputPath, mode) => wslPath(inputPath, mode),
  loadingWindowComplete: () => loadingComplete.resolve(),
  runUpdater: async (alertOnFail) => checkForUpdates(alertOnFail),
  checkUpdate: async () => checkUpdate(),
  getUpdateProgress: () => getUpdateProgress(),
  getUpdateRing: () => getUpdateRing(),
  setUpdateRing: (ring) => saveUpdateRing(ring),
  installUpdate: async () => installUpdate(),
  setBackgroundColor: (color) => setBackgroundColor(color),
  exportMarkdownPdf: (input) => exportMarkdownPdf(input),
})

async function killBackendUtility() {
  if (!backendUtility) return

  const current = backendUtility
  backendUtility = null
  await current.kill()
}

async function startBackendUtility(config: EmbeddedBackendConfig) {
  const { child, health, events } = await spawnLocalServer(
    config.hostname,
    config.port,
    config.password,
    config.environment,
  )
  backendUtility = child
  wireBackendUtilityLogs(events)
  return health
}

function startBackendDevelopmentReloadWatcher() {
  const signalPath = process.env[BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV]
  const acknowledgementPath = process.env[BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV]
  if (app.isPackaged || !signalPath || stopBackendDevelopmentReloadWatcher) return

  stopBackendDevelopmentReloadWatcher = watchBackendDevelopmentReloadSignal({
    signalPath,
    onError: (error) => {
      logger.error("backend development reload failed", error)
    },
    onReload: async (generation) => {
      try {
        await restartBackendUtilityForDevelopment()
      } finally {
        if (acknowledgementPath) {
          await writeFile(acknowledgementPath, generation).catch((error) => {
            logger.error("backend development reload acknowledgement failed", error)
          })
        }
      }
    },
  })
  logger.log("backend development reload is active")
}

async function restartBackendUtilityForDevelopment() {
  const config = embeddedBackendConfig
  if (applicationQuitting || !config) return

  const startedAt = performance.now()
  logger.log("reloading backend utility after development build")
  await killBackendUtility()
  if (applicationQuitting) return

  try {
    const health = await startBackendUtility(config)
    await health.wait
    logger.log(`backend utility reloaded in ${Math.round(performance.now() - startedAt)}ms`)
  } catch (error) {
    await killBackendUtility()
    throw error
  }
}

function beginApplicationShutdown() {
  if (applicationQuitting) return
  applicationQuitting = true
  stopBackendDevelopmentReloadWatcher?.()
  stopBackendDevelopmentReloadWatcher = undefined
}

function wireBackendUtilityLogs(events: EventEmitter) {
  const mirrorToStdIo = !app.isPackaged && process.env.BUDDY_ELECTRON_DEV_BACKEND_LOGS !== "0"

  events.on("stdout", (line: string) => {
    const message = line.trimEnd()
    if (message.length === 0) return
    logger.log(`[backend] ${message}`)
    if (mirrorToStdIo) {
      safelyWriteToStandardStream(
        process.stdout,
        `[backend] ${line.endsWith("\n") ? line : `${line}\n`}`,
      )
    }
  })

  events.on("stderr", (line: string) => {
    const message = line.trimEnd()
    if (message.length === 0) return
    logger.warn(`[backend] ${message}`)
    if (mirrorToStdIo) {
      safelyWriteToStandardStream(
        process.stderr,
        `[backend] ${line.endsWith("\n") ? line : `${line}\n`}`,
      )
    }
  })

  events.on("error", (message: string) => {
    logger.error("backend utility spawn error", message)
    if (mirrorToStdIo) {
      safelyWriteToStandardStream(process.stderr, `[backend:error] ${message}\n`)
    }
  })

  events.on("terminated", (payload: TerminatedPayload) => {
    logger.warn("backend utility terminated", payload)
    if (mirrorToStdIo) {
      safelyWriteToStandardStream(
        process.stderr,
        `[backend:terminated] code=${payload.code ?? "null"} signal=${payload.signal ?? "null"}\n`,
      )
    }
  })
}

function ensureLoopbackNoProxy() {
  const loopbackHosts = ["127.0.0.1", "localhost", "::1"]

  const upsert = (key: string) => {
    const items = (process.env[key] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    for (const host of loopbackHosts) {
      if (items.some((item) => item.toLowerCase() === host)) continue
      items.push(host)
    }

    process.env[key] = items.join(",")
  }

  upsert("NO_PROXY")
  upsert("no_proxy")
}

async function getBackendPort() {
  const fromEnv = process.env.BUDDY_PORT
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10)
    if (!Number.isNaN(parsed)) return parsed
  }

  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, LOOPBACK_HOSTNAME, () => {
      const address = parseTPortedAddress(server.address())
      if (!address) {
        server.close()
        reject(new Error("Failed to allocate local port"))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

function sqliteFileExists(environment: Record<string, string>) {
  return existsSync(
    resolveOpenCodeSqlitePath({
      channel: CHANNEL,
      envBuddyDataDir: environment[BUDDY_ENV.DATA_DIR],
      envXdgDataHome: environment[XDG_ENV.DATA_HOME],
      home: homedir(),
      isPackaged: app.isPackaged,
      userDataPath: app.getPath("userData"),
    }),
  )
}

function setupAutoUpdater() {
  if (!UPDATER_ENABLED) return Promise.resolve(false)
  if (process.platform === "darwin") return Promise.resolve(true)

  // Windows keeps electron-updater for install mechanics after Buddy verifies the signed manifest.
  autoUpdater.logger = logger
  autoUpdater.channel = "latest"
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.on("download-progress", (info: ProgressInfo) => {
    if (!activeWindowsDownload) return
    setUpdateProgress({
      bytesPerSecond: info.bytesPerSecond,
      percent: info.percent,
      ring: activeWindowsDownload.ring,
      status: "downloading",
      totalBytes: info.total,
      transferredBytes: info.transferred,
      version: activeWindowsDownload.version,
    })
  })
  configureDefaultElectronUpdaterProvider()
  return Promise.resolve(true)
}

async function checkUpdate(): Promise<UpdateCheckResult> {
  if (!updaterEnabled) return { updateAvailable: false }
  return await updateCheckCoordinator.check(getUpdateRing())
}

async function runLatestUpdateCheck(ring: UpdateRing): Promise<UpdateCheckResult> {
  if (process.platform === "darwin" && customMacUpdater) {
    return await checkCustomMacUpdate(ring)
  }

  return await checkWindowsUpdate(ring)
}

function setReadyUpdate(ring: UpdateRing, version: string): void {
  readyUpdateStore.set({ ring, version })
}

async function checkCustomMacUpdate(ring: UpdateRing): Promise<UpdateCheckResult> {
  const updater = customMacUpdater
  if (!updater) {
    setUpdateIdle(ring)
    return { updateAvailable: false }
  }

  const previousReadyUpdate = readyUpdateStore.get()
  let downloadStarted = false
  setUpdateProgress({
    ring,
    status: "checking",
  })

  const result = await updater.checkForUpdate({
    onProgress: (progress) => {
      downloadStarted = true
      setUpdateProgress({
        bytesPerSecond: progress.bytesPerSecond,
        percent: progress.percent,
        ring,
        status: "downloading",
        totalBytes: progress.totalBytes,
        transferredBytes: progress.transferredBytes,
      })
    },
    ring,
  })

  if (result.updateAvailable) {
    setReadyUpdate(ring, result.version)
    setUpdateProgress({
      percent: 100,
      ring,
      status: "ready",
      version: result.version,
    })
    return result
  }

  const previousUpdateStillReady =
    previousReadyUpdate?.ring === ring && updater.isUpdateReady(previousReadyUpdate.version)
  if (!previousUpdateStillReady) {
    readyUpdateStore.take(ring)
  }

  if (result.failed) {
    const errorStage: UpdateProgressErrorStage = downloadStarted ? "download" : "check"
    setUpdateError(
      Object.assign(
        {
          ring,
          stage: errorStage,
        },
        !previousUpdateStillReady && previousReadyUpdate?.ring === ring
          ? { version: previousReadyUpdate.version }
          : undefined,
      ),
    )
    return result
  }

  setUpdateIdle(ring)
  return result
}

async function checkWindowsUpdate(ring: UpdateRing): Promise<UpdateCheckResult> {
  const previousReadyUpdate = readyUpdateStore.get()
  let signedFeed: SignedWindowsUpdateFeed | undefined
  let downloadStarted = false
  setUpdateProgress({
    ring,
    status: "checking",
  })

  try {
    signedFeed = await configureSignedWindowsUpdateFeed(undefined, ring)
    const version = signedFeed.version

    if (compareVersions(version, app.getVersion()) <= 0) {
      readyUpdateStore.take(ring)
      logger.info("normal update check ignored same or older version", {
        currentVersion: app.getVersion(),
        ring,
        version,
      })
      setUpdateIdle(ring)
      return { updateAvailable: false }
    }

    if (isUpdateVersionBlocked(version)) {
      readyUpdateStore.take(ring)
      logger.warn("update check suppressed blocked version", { version })
      setUpdateIdle(ring)
      return { blocked: true, updateAvailable: false }
    }

    if (isReadyUpdateCurrent(previousReadyUpdate, ring, version)) {
      setReadyUpdate(ring, version)
      setUpdateProgress({
        percent: 100,
        ring,
        status: "ready",
        version,
      })
      return { updateAvailable: true, version }
    }

    readyUpdateStore.take(ring)
    autoUpdater.allowPrerelease = ring === UPDATE_RING_PREVIEW
    autoUpdater.allowDowngrade = false

    const result = await autoUpdater.checkForUpdates()
    const resolvedVersion = result?.updateInfo?.version
    if (result?.isUpdateAvailable === false || !resolvedVersion) {
      setUpdateIdle(ring)
      return { updateAvailable: false }
    }

    if (resolvedVersion !== version) {
      logger.error("signed update manifest version mismatch", {
        resolvedVersion,
        signedManifestVersion: version,
      })
      setUpdateError({ ring, stage: "check", version: resolvedVersion })
      return { updateAvailable: false, failed: true }
    }

    downloadStarted = true
    activeWindowsDownload = { ring, version }
    setUpdateProgress({
      percent: 0,
      ring,
      status: "downloading",
      transferredBytes: 0,
      version,
    })
    await autoUpdater.downloadUpdate()
    setReadyUpdate(ring, version)
    setUpdateProgress({
      percent: 100,
      ring,
      status: "ready",
      version,
    })
    return {
      updateAvailable: true,
      version,
    }
  } catch (error) {
    logger.error("update check failed", error)
    const errorStage: UpdateProgressErrorStage = downloadStarted ? "download" : "check"
    setUpdateError(
      Object.assign(
        {
          ring,
          stage: errorStage,
        },
        signedFeed ? { version: signedFeed.version } : undefined,
      ),
    )
    return { updateAvailable: false, failed: true }
  } finally {
    activeWindowsDownload = undefined
    await closeWindowsUpdateFeed(signedFeed)
    configureDefaultElectronUpdaterProvider()
  }
}

async function checkUpdateForVersion(version: string): Promise<UpdateCheckResult> {
  if (!updaterEnabled) return { updateAvailable: false }

  return await updateCheckCoordinator.runExclusive(() => checkUpdateForVersionNow(version))
}

async function checkUpdateForVersionNow(version: string): Promise<UpdateCheckResult> {
  const ring = getUpdateRing()
  const macUpdater = process.platform === "darwin" ? customMacUpdater : null
  if (macUpdater) {
    readyUpdateStore.clear()
  } else {
    readyUpdateStore.take(ring)
  }
  setUpdateProgress({
    ring,
    status: "checking",
    version,
  })

  if (isUpdateVersionBlocked(version)) {
    logger.warn("recovery update target is blocked", { version })
    setUpdateIdle(ring)
    return { blocked: true, updateAvailable: false }
  }

  if (macUpdater) {
    const result = await macUpdater.checkForVersion(version)
    if (result.updateAvailable) {
      setReadyUpdate(ring, result.version)
      setUpdateProgress({
        percent: 100,
        ring,
        status: "ready",
        version: result.version,
      })
    } else if (result.failed) {
      setUpdateError({ ring, stage: "check", version })
    } else {
      setUpdateIdle(ring)
    }
    return result
  }

  let signedFeed: SignedWindowsUpdateFeed | undefined
  let downloadStarted = false
  try {
    signedFeed = await configureSignedWindowsUpdateFeed(version)
    autoUpdater.allowPrerelease = true
    autoUpdater.allowDowngrade = true

    const result = await autoUpdater.checkForUpdates()
    const resolvedVersion = result?.updateInfo?.version
    if (result?.isUpdateAvailable === false || !resolvedVersion) {
      setUpdateIdle(ring)
      return { updateAvailable: false }
    }

    if (resolvedVersion !== signedFeed.version) {
      logger.error("signed recovery update manifest version mismatch", {
        resolvedVersion,
        signedManifestVersion: signedFeed.version,
        targetVersion: version,
      })
      setUpdateError({ ring, stage: "check", version: resolvedVersion })
      return { failed: true, updateAvailable: false }
    }

    if (resolvedVersion !== version) {
      logger.error("recovery update version mismatch", {
        resolvedVersion,
        targetVersion: version,
      })
      setUpdateError({ ring, stage: "check", version: resolvedVersion })
      return { failed: true, updateAvailable: false }
    }

    downloadStarted = true
    activeWindowsDownload = { ring, version: resolvedVersion }
    setUpdateProgress({
      percent: 0,
      ring,
      status: "downloading",
      transferredBytes: 0,
      version: resolvedVersion,
    })
    await autoUpdater.downloadUpdate()
    setReadyUpdate(ring, resolvedVersion)
    setUpdateProgress({
      percent: 100,
      ring,
      status: "ready",
      version: resolvedVersion,
    })
    return {
      updateAvailable: true,
      version: resolvedVersion,
    }
  } catch (error) {
    logger.error("recovery update check failed", error)
    setUpdateError({
      ring,
      stage: downloadStarted ? "download" : "check",
      version,
    })
    return { failed: true, updateAvailable: false }
  } finally {
    activeWindowsDownload = undefined
    await closeWindowsUpdateFeed(signedFeed)
    configureDefaultElectronUpdaterProvider()
  }
}

async function configureSignedWindowsUpdateFeed(
  expectedVersion?: string,
  ring: UpdateRing = getUpdateRing(),
): Promise<SignedWindowsUpdateFeed> {
  const manifestUrls = await resolveSignedWindowsUpdateManifestUrls(expectedVersion, ring)
  const manifest = await fetchSignedWindowsUpdateManifest(manifestUrls)

  if (expectedVersion && manifest.version !== expectedVersion) {
    throw new Error(
      `Signed update manifest version mismatch: expected ${expectedVersion}, got ${manifest.version}`,
    )
  }

  const feed = await startWindowsUpdateFeed({
    content: manifest.content,
    version: manifest.version,
  })
  try {
    autoUpdater.setFeedURL(createWindowsUpdateFeedProviderOptions(feed))
  } catch (error) {
    await closeWindowsUpdateFeed(feed)
    throw error
  }

  return {
    ...feed,
    version: manifest.version,
  }
}

async function resolveSignedWindowsUpdateManifestUrls(
  expectedVersion?: string,
  ring: UpdateRing = getUpdateRing(),
): Promise<readonly string[]> {
  if (expectedVersion) {
    return resolveVersionedReleaseAssetUrls({
      legacyFilename: LEGACY_WINDOWS_UPDATE_MANIFEST_FILENAME,
      primaryFilename: WINDOWS_REMOTE_UPDATE_MANIFEST_FILENAME,
      version: expectedVersion,
    })
  }

  return [
    await resolveLatestRingAssetUrl({
      filename: WINDOWS_REMOTE_UPDATE_MANIFEST_FILENAME,
      ring,
    }),
  ]
}

async function fetchSignedWindowsUpdateManifest(
  manifestUrls: readonly string[],
): Promise<{ content: string; version: string }> {
  let lastError: unknown

  for (const [index, manifestUrl] of manifestUrls.entries()) {
    try {
      return await fetchSignedElectronUpdateManifest({
        publicKey: process.env[BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY]?.trim() || undefined,
        url: manifestUrl,
      })
    } catch (error) {
      lastError = error
      const fallbackUrl = manifestUrls[index + 1]
      if (!fallbackUrl || !isMissingSignedManifest(error)) {
        throw error
      }

      logger.warn("signed recovery update manifest missing; trying legacy manifest", {
        fallbackUrl,
        manifestUrl,
      })
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to fetch Windows update manifest")
}

function isMissingSignedManifest<TError>(error: TError): boolean {
  return error instanceof SignedUpdateFetchError && error.status === 404
}

async function closeWindowsUpdateFeed(feed: WindowsUpdateFeed | undefined): Promise<void> {
  if (!feed) return

  try {
    await feed.close()
  } catch (error) {
    logger.warn("failed to close windows update feed", error)
  }
}

function configureDefaultElectronUpdaterProvider() {
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.setFeedURL({
    channel: "latest",
    owner: RELEASE_REPOSITORY_OWNER,
    provider: "github",
    repo: RELEASE_REPOSITORY_NAME,
  })
}

async function installUpdate() {
  await updateCheckCoordinator.runExclusive(installReadyUpdate)
}

async function installReadyUpdate() {
  const ring = getUpdateRing()
  const readyUpdate = readyUpdateStore.get()
  if (readyUpdate?.ring !== ring) {
    setUpdateIdle(ring)
    throw new Error("No update is ready for the selected update ring")
  }

  if (process.platform === "darwin" && customMacUpdater) {
    setUpdateProgress({
      percent: 100,
      ring,
      status: "installing",
      version: readyUpdate.version,
    })
    try {
      await customMacUpdater.installUpdate(readyUpdate.version)
    } catch (error) {
      setUpdateError({ ring, stage: "install", version: readyUpdate.version })
      throw error
    }
    return
  }

  setUpdateProgress({
    percent: 100,
    ring,
    status: "installing",
    version: readyUpdate.version,
  })
  await killBackendUtility()
  autoUpdater.quitAndInstall()
}

async function checkForUpdates(alertOnFail: boolean) {
  if (!updaterEnabled) return

  const result = await checkUpdate()
  if (!result.updateAvailable) {
    if (result.failed) {
      if (!alertOnFail) return
      await dialog.showMessageBox({
        type: "error",
        title: "Update Error",
        message: "Update check failed.",
      })
      return
    }

    if (result.blocked) {
      if (!alertOnFail) return
      await dialog.showMessageBox({
        type: "info",
        title: "Buddy",
        message: BLOCKED_UPDATE_DIALOG_MESSAGE,
      })
      return
    }

    if (!alertOnFail) return
    await dialog.showMessageBox({
      type: "info",
      title: "Buddy",
      message: "No updates available.",
    })
    return
  }

  const response = await dialog.showMessageBox({
    type: "info",
    title: "Update Ready",
    message: `Buddy ${result.version ?? ""} downloaded. Restart now?`,
    buttons: [...UPDATE_READY_RESTART_BUTTONS],
    defaultId: PRIMARY_DIALOG_RESPONSE,
    cancelId: SECONDARY_DIALOG_RESPONSE,
  })

  if (response.response === PRIMARY_DIALOG_RESPONSE) {
    await installUpdate()
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function defer<TValue>() {
  let resolve!: (value: TValue) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<TValue>((res, rej) => {
    resolve = res
    reject = rej
  })

  return {
    promise,
    resolve,
    reject,
  }
}
