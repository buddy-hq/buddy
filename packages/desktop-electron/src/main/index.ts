import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { existsSync } from "node:fs"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { app, BrowserWindow, dialog, shell } from "electron"
import type { Event } from "electron"
import electronUpdaterPackage from "electron-updater"
import type { InitStep, ServerReadyData } from "../preload/types"
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
import { installCli } from "./cli"
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand } from "./ipc"
import { initLogging, safelyWriteToStandardStream } from "./logging"
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
import {
  BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY,
  fetchSignedElectronUpdateManifest,
  isAbsoluteUrl,
  RELEASE_REPOSITORY,
  RELEASE_REPOSITORY_NAME,
  RELEASE_REPOSITORY_OWNER,
  resolveLatestReleaseAssetUrl,
  resolveLatestPrereleaseAssetUrl,
  resolveReleaseAssetUrl,
} from "./update-common"
import { createLoadingWindow, createMainWindow, setBackgroundColor, setDockIcon } from "./windows"

const { autoUpdater } = electronUpdaterPackage
const BUDDY_RUNTIME_DIRECTORY_NAME = ".buddy-runtime"
const BUDDY_RUNTIME_XDG_DIRECTORY_NAME = "xdg"
const XDG_DATA_DIRECTORY_NAME = "data"
const OPENCODE_DATA_DIRECTORY_NAME = "opencode"
const OPENCODE_DB_FILENAME = "opencode.db"
const STARTUP_FAILURE_MESSAGE = "Buddy failed to start."
const UNKNOWN_STARTUP_FAILURE_DETAIL = "The local Buddy server did not become ready."
const LOADING_WINDOW_COMPLETE_TIMEOUT_MS = 5_000
const MAC_UPDATE_CACHE_DIRECTORY_NAME = "mac-updater"
const WINDOWS_UPDATE_MANIFEST_CACHE_DIRECTORY_NAME = "windows-updater"
const WINDOWS_UPDATE_MANIFEST_FILENAME = "latest.yml"
const BUDDY_DOWNLOAD_URL = `https://github.com/${RELEASE_REPOSITORY}/releases/latest`
const PRIMARY_DIALOG_RESPONSE = 0
const SECONDARY_DIALOG_RESPONSE = 1
const STARTUP_FAILURE_UPDATE_CHECK_BUTTONS = ["Check for Update", "Quit"] as const
const STARTUP_FAILURE_UPDATE_INSTALL_BUTTONS = ["Install and Restart", "Quit"] as const
const STARTUP_FAILURE_UPDATE_MISSING_BUTTONS = ["Open Download Page", "Quit"] as const
const MAC_INSTALLER_FAILURE_BUTTONS = ["OK", "Open Log"] as const
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
let updateReady = false
let readyUpdateVersion: string | undefined
let updaterEnabled = UPDATER_ENABLED
let customMacUpdater: ReturnType<typeof createCustomMacUpdater> | null = null
let checkUpdateTask: Promise<UpdateCheckResult> | undefined

type UpdateCheckResult = {
  blocked?: boolean
  failed?: boolean
  recoveryTarget?: RecoveryTarget
  updateAvailable: boolean
  version?: string
}

const loadingComplete = defer<void>()
const serverReady = defer<ServerReadyData>()
const pendingDeepLinks: string[] = []

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
  })

  app.on("before-quit", () => {
    void killBackendUtility()
  })

  app.on("will-quit", () => {
    void killBackendUtility()
  })

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      void killBackendUtility().finally(() => app.exit(0))
    })
  }

  void app.whenReady().then(async () => {
    registerBackendRequestAuth()
    app.setAsDefaultProtocolClient(APP_PROTOCOL)
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

function setInitStep(step: InitStep) {
  initStep = step
  initEmitter.emit("step", step)
}

async function initialize() {
  const needsMigration = !sqliteFileExists()
  let overlay: BrowserWindow | null = null

  try {
    const port = await getBackendPort()
    const hostname = LOOPBACK_HOSTNAME
    const url = `http://${hostname}:${port}`
    const password = randomUUID()

    const { child, health, events } = await spawnLocalServer(hostname, port, password)
    backendUtility = child
    wireBackendUtilityLogs(events)

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

async function handleInitializationFailure(error: unknown, overlay: BrowserWindow | null) {
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

async function offerStartupFailureUpdateRecovery(error: unknown): Promise<boolean> {
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
      type: "error",
      title: "Update Install Failed",
      message: "Buddy could not finish installing the previous update.",
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

function macInstallerFailureDetail(result: MacInstallerResult, logPath: string): string {
  const exitCode =
    result.exitCode === undefined ? "" : `\n\nInstaller exit code: ${result.exitCode}`
  return `The updater helper reported a failure after Buddy quit.${exitCode}\n\nLog file: ${logPath}`
}

async function openInstallerLog(logPath: string): Promise<void> {
  const error = await shell.openPath(logPath)
  if (error.length > 0) {
    logger.warn("failed to open mac installer log", { error, logPath })
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && Reflect.get(error, "code") === code
}

async function showStartupFailureDialog(error: unknown): Promise<void> {
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

function startupFailureDetail(error: unknown) {
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
      void installCli().catch((error: unknown) => {
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
      const address = server.address()
      if (!address || typeof address !== "object") {
        server.close()
        reject(new Error("Failed to allocate local port"))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

function sqliteFileExists() {
  const runtimeXdgDataHome = join(
    homedir(),
    BUDDY_RUNTIME_DIRECTORY_NAME,
    BUDDY_RUNTIME_XDG_DIRECTORY_NAME,
    XDG_DATA_DIRECTORY_NAME,
  )
  const xdgDataHome =
    process.env.XDG_DATA_HOME && process.env.XDG_DATA_HOME.length > 0
      ? process.env.XDG_DATA_HOME
      : runtimeXdgDataHome

  return existsSync(join(xdgDataHome, OPENCODE_DATA_DIRECTORY_NAME, OPENCODE_DB_FILENAME))
}

function setupAutoUpdater() {
  if (!UPDATER_ENABLED) return Promise.resolve(false)
  if (process.platform === "darwin") return Promise.resolve(true)

  // Windows keeps electron-updater for install mechanics after Buddy verifies the signed manifest.
  autoUpdater.logger = logger
  autoUpdater.channel = "latest"
  autoUpdater.allowPrerelease = CHANNEL !== "prod"
  autoUpdater.allowDowngrade = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  configureDefaultElectronUpdaterProvider()
  return Promise.resolve(true)
}

async function checkUpdate() {
  if (!updaterEnabled) return { updateAvailable: false }
  if (process.platform === "darwin" && customMacUpdater) {
    return await customMacUpdater.checkForUpdate()
  }

  if (updateReady && readyUpdateVersion) {
    if (isUpdateVersionBlocked(readyUpdateVersion)) {
      return { blocked: true, updateAvailable: false }
    }

    return {
      updateAvailable: true,
      version: readyUpdateVersion,
    }
  }

  if (checkUpdateTask) {
    return await checkUpdateTask
  }

  checkUpdateTask = (async () => {
    try {
      const signedManifestVersion = await configureSignedWindowsUpdateFeed()
      const result = await autoUpdater.checkForUpdates()
      const version = result?.updateInfo?.version
      if (result?.isUpdateAvailable === false || !version) {
        return { updateAvailable: false }
      }

      if (version !== signedManifestVersion) {
        logger.error("signed update manifest version mismatch", {
          resolvedVersion: version,
          signedManifestVersion,
        })
        return { updateAvailable: false, failed: true }
      }

      if (isUpdateVersionBlocked(version)) {
        logger.warn("update check suppressed blocked version", { version })
        return { blocked: true, updateAvailable: false }
      }

      await autoUpdater.downloadUpdate()
      updateReady = true
      readyUpdateVersion = version
      return {
        updateAvailable: true,
        version,
      }
    } catch (error) {
      logger.error("update check failed", error)
      return { updateAvailable: false, failed: true }
    } finally {
      checkUpdateTask = undefined
    }
  })()

  return await checkUpdateTask
}

async function checkUpdateForVersion(version: string): Promise<UpdateCheckResult> {
  if (!updaterEnabled) return { updateAvailable: false }

  if (isUpdateVersionBlocked(version)) {
    logger.warn("recovery update target is blocked", { version })
    return { blocked: true, updateAvailable: false }
  }

  if (process.platform === "darwin" && customMacUpdater) {
    return await customMacUpdater.checkForVersion(version)
  }

  try {
    const signedManifestVersion = await configureSignedWindowsUpdateFeed(version)
    const result = await autoUpdater.checkForUpdates()
    const resolvedVersion = result?.updateInfo?.version
    if (result?.isUpdateAvailable === false || !resolvedVersion) {
      return { updateAvailable: false }
    }

    if (resolvedVersion !== signedManifestVersion) {
      logger.error("signed recovery update manifest version mismatch", {
        resolvedVersion,
        signedManifestVersion,
        targetVersion: version,
      })
      return { failed: true, updateAvailable: false }
    }

    if (resolvedVersion !== version) {
      logger.error("recovery update version mismatch", {
        resolvedVersion,
        targetVersion: version,
      })
      return { failed: true, updateAvailable: false }
    }

    await autoUpdater.downloadUpdate()
    updateReady = true
    readyUpdateVersion = resolvedVersion
    return {
      updateAvailable: true,
      version: resolvedVersion,
    }
  } catch (error) {
    logger.error("recovery update check failed", error)
    return { failed: true, updateAvailable: false }
  } finally {
    configureDefaultElectronUpdaterProvider()
  }
}

async function configureSignedWindowsUpdateFeed(expectedVersion?: string): Promise<string> {
  const manifestUrl = await resolveSignedWindowsUpdateManifestUrl(expectedVersion)
  const manifest = await fetchSignedElectronUpdateManifest({
    publicKey: process.env[BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY]?.trim() || undefined,
    url: manifestUrl,
  })

  if (expectedVersion && manifest.version !== expectedVersion) {
    throw new Error(
      `Signed update manifest version mismatch: expected ${expectedVersion}, got ${manifest.version}`,
    )
  }

  const cacheDirectory = join(
    app.getPath("temp"),
    resolveAppId(app.isPackaged),
    WINDOWS_UPDATE_MANIFEST_CACHE_DIRECTORY_NAME,
    expectedVersion ?? "latest",
  )
  await mkdir(cacheDirectory, { recursive: true })
  await writeFile(
    join(cacheDirectory, WINDOWS_UPDATE_MANIFEST_FILENAME),
    absolutizeElectronUpdateManifestUrls(manifest.content, manifest.version),
    "utf8",
  )

  autoUpdater.setFeedURL({
    channel: "latest",
    provider: "generic",
    url: toFileDirectoryUrl(cacheDirectory),
  })

  return manifest.version
}

async function resolveSignedWindowsUpdateManifestUrl(expectedVersion?: string): Promise<string> {
  if (expectedVersion) {
    return resolveReleaseAssetUrl(expectedVersion, WINDOWS_UPDATE_MANIFEST_FILENAME)
  }

  if (CHANNEL !== "prod") {
    return await resolveLatestPrereleaseAssetUrl(WINDOWS_UPDATE_MANIFEST_FILENAME)
  }

  return resolveLatestReleaseAssetUrl(WINDOWS_UPDATE_MANIFEST_FILENAME)
}

function toFileDirectoryUrl(directory: string): string {
  const url = pathToFileURL(directory).toString()
  return url.endsWith("/") ? url : `${url}/`
}

function absolutizeElectronUpdateManifestUrls(content: string, version: string): string {
  return content
    .split(/\r?\n/u)
    .map((line) => absolutizeElectronUpdateManifestUrlLine(line, version))
    .join("\n")
}

function absolutizeElectronUpdateManifestUrlLine(line: string, version: string): string {
  const match = line.match(/^(\s*(?:-\s*)?(?:url|path):\s*)(.+?)(\s*)$/u)
  if (!match) return line

  const [, prefix, rawValue, suffix] = match
  const quote =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue[0]
      : undefined
  const value = quote ? rawValue.slice(1, -1) : rawValue
  if (isAbsoluteUrl(value)) return line

  const absoluteUrl = resolveReleaseAssetUrl(version, value)
  return `${prefix}${quote ?? ""}${absoluteUrl}${quote ?? ""}${suffix}`
}

function configureDefaultElectronUpdaterProvider() {
  autoUpdater.setFeedURL({
    channel: "latest",
    owner: RELEASE_REPOSITORY_OWNER,
    provider: "github",
    repo: RELEASE_REPOSITORY_NAME,
  })
}

async function installUpdate() {
  if (process.platform === "darwin" && customMacUpdater) {
    await customMacUpdater.installUpdate()
    return
  }

  if (!updateReady) return
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

function defer<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return {
    promise,
    resolve,
    reject,
  }
}
