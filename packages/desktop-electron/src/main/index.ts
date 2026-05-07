import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { existsSync } from "node:fs"
import { createServer } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"
import { app, BrowserWindow, dialog } from "electron"
import type { Event } from "electron"
import electronUpdaterPackage from "electron-updater"
import type { InitStep, ServerReadyData, SqliteMigrationProgress } from "../preload/types"
import {
  createCustomMacUpdater,
  resolveCustomMacUpdaterOptions,
  resolveMacAppPath,
} from "./custom-mac-updater"
import {
  APP_PROTOCOL,
  CHANNEL,
  LOOPBACK_HOSTNAME,
  resolveAppId,
  resolveAppName,
  SIDECAR_HEALTH_TIMEOUT_MS,
  SIDECAR_USERNAME,
  UPDATER_ENABLED,
} from "./constants"
import type { CommandChild, TerminatedPayload } from "./cli"
import { checkAppExists, resolveAppPath, wslPath } from "./apps"
import { installCli } from "./cli"
import {
  registerIpcHandlers,
  sendDeepLinks,
  sendMenuCommand,
  sendSqliteMigrationProgress,
} from "./ipc"
import { initLogging, safelyWriteToStandardStream } from "./logging"
import { parseMarkdown } from "./markdown"
import { createMenu } from "./menu"
import {
  getDefaultServerUrl,
  getWslConfig,
  setDefaultServerUrl,
  setWslConfig,
  spawnLocalServer,
} from "./server"
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

app.setName(resolveAppName(app.isPackaged))
app.setPath("userData", join(app.getPath("appData"), resolveAppId(app.isPackaged)))

const logger = initLogging()
const initEmitter = new EventEmitter()

let initStep: InitStep = { phase: "server_waiting" }
let mainWindow: BrowserWindow | null = null
let sidecar: CommandChild | null = null
let updateReady = false
let readyUpdateVersion: string | undefined
let updaterEnabled = UPDATER_ENABLED
let customMacUpdater: ReturnType<typeof createCustomMacUpdater> | null = null
let checkUpdateTask:
  | Promise<{ updateAvailable: boolean; version?: string; failed?: boolean }>
  | undefined

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
    killSidecar()
  })

  app.on("will-quit", () => {
    killSidecar()
  })

  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      killSidecar()
      app.exit(0)
    })
  }

  void app.whenReady().then(async () => {
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
        killSidecar: () => killSidecar(),
        quit: () => app.quit(),
        ...resolveCustomMacUpdaterOptions(),
      })
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
  const sqliteDone = needsMigration ? defer<void>() : undefined
  let overlay: BrowserWindow | null = null

  try {
    const port = await getSidecarPort()
    const hostname = LOOPBACK_HOSTNAME
    const url = `http://${hostname}:${port}`
    const password = randomUUID()

    const { child, health, events } = await spawnLocalServer(hostname, port, password)
    sidecar = child
    wireSidecarLogs(events)

    serverReady.resolve({
      url,
      username: SIDECAR_USERNAME,
      password,
      isSidecar: true,
    })

    const sidecarReady = Promise.race([
      health.wait,
      delay(SIDECAR_HEALTH_TIMEOUT_MS).then(() => {
        throw new Error("Sidecar health check timed out")
      }),
    ])

    const loadingTask = (async () => {
      let sqliteMigrationCompleted = false

      events.on("sqlite", (progress: SqliteMigrationProgress) => {
        setInitStep({ phase: "sqlite_waiting" })
        if (overlay) sendSqliteMigrationProgress(overlay, progress)
        if (mainWindow) sendSqliteMigrationProgress(mainWindow, progress)
        if (progress.type === "Done") {
          sqliteMigrationCompleted = true
          sqliteDone?.resolve()
        }
      })

      if (needsMigration && sqliteDone) {
        await Promise.race([
          sqliteDone.promise,
          sidecarReady.then(() => {
            if (!sqliteMigrationCompleted) {
              logger.warn(
                "sqlite migration completion signal missing; continuing after sidecar readiness",
              )
            }
          }),
        ])
      }

      await sidecarReady
    })()

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

  killSidecar()
  app.quit()
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
      void installCli()
    },
    checkForUpdates: () => {
      void checkForUpdates(true)
    },
    reload: () => {
      mainWindow?.reload()
    },
    relaunch: () => {
      killSidecar()
      app.relaunch()
      app.exit(0)
    },
  })
}

registerIpcHandlers({
  killSidecar: () => killSidecar(),
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
})

function killSidecar() {
  if (!sidecar) return

  const pid = sidecar.pid
  sidecar.kill()
  sidecar = null

  if (pid && process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGTERM")
    } catch {
      // noop
    }
  }
}

function wireSidecarLogs(events: EventEmitter) {
  const mirrorToStdIo = !app.isPackaged && process.env.BUDDY_ELECTRON_DEV_SIDECAR_LOGS !== "0"

  events.on("stdout", (line: string) => {
    const message = line.trimEnd()
    if (message.length === 0) return
    logger.log(`[sidecar] ${message}`)
    if (mirrorToStdIo) {
      safelyWriteToStandardStream(
        process.stdout,
        `[sidecar] ${line.endsWith("\n") ? line : `${line}\n`}`,
      )
    }
  })

  events.on("stderr", (line: string) => {
    const message = line.trimEnd()
    if (message.length === 0) return
    logger.warn(`[sidecar] ${message}`)
    if (mirrorToStdIo) {
      safelyWriteToStandardStream(
        process.stderr,
        `[sidecar] ${line.endsWith("\n") ? line : `${line}\n`}`,
      )
    }
  })

  events.on("error", (message: string) => {
    logger.error("sidecar spawn error", message)
    if (mirrorToStdIo) {
      safelyWriteToStandardStream(process.stderr, `[sidecar:error] ${message}\n`)
    }
  })

  events.on("terminated", (payload: TerminatedPayload) => {
    logger.warn("sidecar terminated", payload)
    if (mirrorToStdIo) {
      safelyWriteToStandardStream(
        process.stderr,
        `[sidecar:terminated] code=${payload.code ?? "null"} signal=${payload.signal ?? "null"}\n`,
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

async function getSidecarPort() {
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

  // Keep the native electron-updater path for Windows today and for signed macOS builds later.
  autoUpdater.logger = logger
  autoUpdater.channel = "latest"
  autoUpdater.allowPrerelease = CHANNEL !== "prod"
  autoUpdater.allowDowngrade = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  return Promise.resolve(true)
}

async function checkUpdate() {
  if (!updaterEnabled) return { updateAvailable: false }
  if (process.platform === "darwin" && customMacUpdater) {
    return await customMacUpdater.checkForUpdate()
  }

  if (updateReady && readyUpdateVersion) {
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
      const result = await autoUpdater.checkForUpdates()
      const version = result?.updateInfo?.version
      if (result?.isUpdateAvailable === false || !version) {
        return { updateAvailable: false }
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

async function installUpdate() {
  if (process.platform === "darwin" && customMacUpdater) {
    await customMacUpdater.installUpdate()
    return
  }

  if (!updateReady) return
  killSidecar()
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
    buttons: ["Restart", "Later"],
    defaultId: 0,
    cancelId: 1,
  })

  if (response.response === 0) {
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
