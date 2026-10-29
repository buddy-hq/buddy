import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { _electron, expect, test as base, type ElectronApplication, type Page } from "@playwright/test"
import treeKill from "tree-kill"
import z from "zod"
import { BUDDY_ENV, DEFAULT_NOTEBOOK_HOME_SEGMENTS, OPENCODE_ENV } from "@buddy/script/storage-env"
import { resolveElectronBin } from "../../scripts/electron-bin"
import { resolveDevRuntimeEnvironment } from "../../src/main/storage-paths"
import { createModelServer } from "./model-server"
import { createNotebook, scriptedConfig } from "./notebook"

const desktopDirectory = fileURLToPath(new URL("../../", import.meta.url))
const repositoryDirectory = path.resolve(desktopDirectory, "../..")
const execute = promisify(execFile)
const ignoredDirectories = new Set(["node_modules", "out", "dist", ".turbo", ".git", "test", "e2e"])
const sourceExtension = /\.(?:[cm]?[jt]sx?|css|html|jsonc?|sql|svg|png|wasm)$/u

async function newestSource(directory: string): Promise<number> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const times = await Promise.all(entries.map(async (entry) => {
    if (ignoredDirectories.has(entry.name) || entry.isSymbolicLink()) return 0
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return newestSource(filename)
    return sourceExtension.test(entry.name) ? (await fs.stat(filename)).mtimeMs : 0
  }))
  return Math.max(0, ...times)
}

async function ensureBuilt(env: NodeJS.ProcessEnv) {
  const artifacts = ["main/index.js", "main/backend-utility.js", "preload/index.cjs", "renderer/index.html", "renderer/loading.html"]
  const outputs = await Promise.all(artifacts.map((artifact) => fs.stat(path.join(desktopDirectory, "out", artifact)).then((stat) => stat.mtimeMs, () => 0)))
  const sources = await Promise.all([
    newestSource(path.join(repositoryDirectory, "packages")),
    newestSource(path.join(repositoryDirectory, "vendor/opencode/packages")),
    newestSource(path.join(repositoryDirectory, "script")),
    ...["package.json", "bun.lock", "tsconfig.json"].map((file) => fs.stat(path.join(repositoryDirectory, file)).then((stat) => stat.mtimeMs)),
  ])
  if (Math.min(...outputs) >= Math.max(...sources)) return
  const result = await execute("bun", ["run", "--cwd", desktopDirectory, "build"], { cwd: repositoryDirectory, env, maxBuffer: 32 * 1024 * 1024 })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
}

function isolatedEnvironment(root: string, userData: string, home: string) {
  const inheritedKeys = new Set(["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "windir", "COMSPEC", "ComSpec", "PATHEXT", "DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "LANG", "LC_ALL", "TZ"])
  const inherited = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => inheritedKeys.has(entry[0]) && entry[1] !== undefined))
  const runtime = resolveDevRuntimeEnvironment(userData)
  return {
    ...inherited,
    ...runtime,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(root, "appdata"),
    LOCALAPPDATA: path.join(root, "localappdata"),
    TMPDIR: path.join(root, "tmp"),
    TMP: path.join(root, "tmp"),
    TEMP: path.join(root, "tmp"),
    SHELL: process.platform === "win32" ? (inherited.ComSpec ?? inherited.COMSPEC ?? "cmd.exe") : "/bin/sh",
    ZDOTDIR: home,
    BUDDY_DEV_USER_DATA_DIR: userData,
    [BUDDY_ENV.TEST_HOME]: home,
    [BUDDY_ENV.TEST_XDG_ROOT]: root,
    [BUDDY_ENV.DISABLE_SKILL_ARTIFACT_FETCH]: "1",
    [OPENCODE_ENV.DISABLE_DEFAULT_PLUGINS]: "1",
    [OPENCODE_ENV.DISABLE_MODELS_FETCH]: "1",
    [OPENCODE_ENV.DISABLE_EXTERNAL_SKILLS]: "1",
    [OPENCODE_ENV.CLIENT]: "web",
    OPENCODE_TEST_HOME: home,
    NODE_OPTIONS: "",
    BUDDY_E2E_ROOT: root,
    BUDDY_E2E_NETWORK_GUARD: "",
    BUDDY_E2E_NETWORK_LOG: "",
  } satisfies Record<string, string>
}

function isMainWindow(url: string) {
  return /^file:\/\/.*\/out\/renderer\/index\.html(?:[?#]|$)/u.test(url)
}

function windowPosition() {
  const value = process.env.BUDDY_E2E_WINDOW_POSITION ?? "2600,0"
  const parsed = z.tuple([z.coerce.number().int(), z.coerce.number().int()]).safeParse(value.split(","))
  if (!parsed.success) throw new Error("BUDDY_E2E_WINDOW_POSITION must contain two integer coordinates: x,y")
  return { x: parsed.data[0], y: parsed.data[1] }
}

async function mainWindow(electron: ElectronApplication): Promise<Page> {
  const select = async (page: Page) => {
    await page.waitForURL((url) => isMainWindow(url.href), { timeout: 60_000 })
    await page.waitForLoadState("domcontentloaded")
    return page
  }
  const existing = electron.windows().find((page) => isMainWindow(page.url()))
  if (existing) return select(existing)
  return new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(60_000)
    const cleanup = () => { electron.off("window", onWindow); signal.removeEventListener("abort", onAbort) }
    const onWindow = (page: Page) => {
      void select(page).then((main) => { cleanup(); resolve(main) }, () => undefined)
    }
    const onAbort = () => { cleanup(); reject(new Error(`Main window did not open. URLs: ${electron.windows().map((page) => page.url()).join(", ")}`)) }
    electron.on("window", onWindow)
    signal.addEventListener("abort", onAbort, { once: true })
    for (const page of electron.windows()) onWindow(page)
  })
}

export type BeforeLaunch = (input: {
  readonly root: string
  readonly home: string
  readonly userData: string
  readonly dataDirectory: string
  readonly stateDirectory: string
  readonly configDirectory: string
  readonly modelBaseURL: string
}) => Promise<void>

type AppOptions = {
  readonly beforeLaunch: BeforeLaunch | undefined
  readonly expectedBlockedHosts: readonly string[]
  readonly launchEnvironment: Readonly<Record<string, string>>
  readonly firstLaunchReady: ((page: Page) => Promise<void>) | undefined
}

async function createApp(options: AppOptions) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "buddy-ui-e2e-")))
  const home = path.join(root, "home")
  const userData = path.join(root, "user-data")
  const notebooks = path.join(home, ...DEFAULT_NOTEBOOK_HOME_SEGMENTS)
  const env = { ...options.launchEnvironment, ...isolatedEnvironment(root, userData, home) }
  const networkLog = path.join(root, "blocked-network.txt")
  const guard = path.join(root, "network-guard.cjs")
  const preload = path.join(root, "launch-preload.cjs")
  const applications = new Set<ElectronApplication>()
  const consoleLines: string[] = []
  let current: { electron: ElectronApplication; page: Page } | undefined
  let trace: { title: string; applications: Set<ElectronApplication>; completed: string[] } | undefined
  let model: Awaited<ReturnType<typeof createModelServer>> | undefined

  async function launch(ready?: (page: Page) => Promise<void>) {
    const electron = await _electron.launch({ executablePath: resolveElectronBin(desktopDirectory), args: ["--require", preload, desktopDirectory], cwd: desktopDirectory, env, artifactsDir: path.join(root, "playwright"), timeout: 60_000 })
    applications.add(electron)
    electron.process().stdout?.on("data", (chunk: Buffer) => consoleLines.push(chunk.toString()))
    electron.process().stderr?.on("data", (chunk: Buffer) => consoleLines.push(chunk.toString()))
    await electron.evaluate(({ app, BrowserWindow }, input) => {
      const move = (window: Electron.BrowserWindow) => window.setPosition(input.position.x, input.position.y, false)
      app.on("browser-window-created", (_event, window) => move(window))
      for (const window of BrowserWindow.getAllWindows()) move(window)
      if (app.getPath("userData") !== input.userData || process.env.HOME !== input.home || process.env.USERPROFILE !== input.home) throw new Error("Electron did not retain the isolated home and userData")
      if (app.getPath("logs") !== input.logs || app.getPath("sessionData") !== input.sessionData) throw new Error("Electron did not retain its isolated logs and Chromium state")
    }, { position: windowPosition(), userData, home, logs: path.join(root, "logs"), sessionData: path.join(root, "session-data") })
    if (trace) {
      await electron.context().tracing.start({ title: trace.title, screenshots: true, snapshots: true, sources: true })
      trace.applications.add(electron)
    }
    const page = await mainWindow(electron)
    page.on("console", (message) => consoleLines.push(`[renderer:${message.type()}] ${message.text()}`))
    page.on("pageerror", (error) => consoleLines.push(`[renderer:error] ${error.message}`))
    current = { electron, page }
    if (ready) await ready(page)
    else await expect(page.getByRole("button", { name: "New notebook", exact: true })).toBeVisible()
    const guardedProcesses = await electron.evaluate(({ app }) => {
      const backend = app.getAppMetrics().find((metric) => metric.type === "Utility" && (metric.name === "Buddy backend" || metric.serviceName === "Buddy backend"))
      if (!backend) throw new Error("The isolated Buddy backend utility is missing from Electron's process metrics")
      return [process.pid, backend.pid]
    })
    const guarded = (await fs.readFile(`${networkLog}.loaded`, "utf8")).trim().split("\n").map(Number)
    expect(guarded, "Network guards must be active in the main and backend processes").toEqual(expect.arrayContaining(guardedProcesses))
    return current
  }

  function running() {
    if (!current) throw new Error("The fixture has no running app")
    return current
  }

  try {
    await Promise.all([home, userData, notebooks, env.TMPDIR, env.APPDATA, env.LOCALAPPDATA, path.join(root, "session-data"), path.join(root, "logs")].map((directory) => fs.mkdir(directory, { recursive: true })))
    await ensureBuilt(env)
    await execute("bun", ["build", fileURLToPath(new URL("./network-guard.ts", import.meta.url)), "--target=node", "--format=cjs", `--outfile=${guard}`], { cwd: desktopDirectory, env })
    await execute("bun", ["build", fileURLToPath(new URL("./launch-preload.ts", import.meta.url)), "--target=node", "--format=cjs", "--external=electron", `--outfile=${preload}`], { cwd: desktopDirectory, env })
    env.BUDDY_E2E_NETWORK_GUARD = guard
    env.BUDDY_E2E_NETWORK_LOG = networkLog
    model = await createModelServer()
    const notebook = await createNotebook(notebooks, model.baseURL)
    const seedNotebook = await createNotebook(notebooks, model.baseURL, "Seed notebook")
    const runtime = resolveDevRuntimeEnvironment(userData)
    const stateDirectory = runtime[BUDDY_ENV.STATE_DIR]
    const configDirectory = runtime[BUDDY_ENV.GLOBAL_CONFIG_DIR]
    await fs.mkdir(stateDirectory, { recursive: true })
    await fs.mkdir(configDirectory, { recursive: true })
    await fs.writeFile(path.join(userData, "buddy.onboarding.dat"), JSON.stringify({ "buddy.onboarding.v1": JSON.stringify({ state: { setupCompleted: true }, version: 3 }) }))
    await fs.writeFile(path.join(stateDirectory, "desktop-notebooks.json"), JSON.stringify([seedNotebook.directory]))
    await fs.writeFile(path.join(configDirectory, "buddy.jsonc"), JSON.stringify(scriptedConfig(model.baseURL), null, 2))
    await options.beforeLaunch?.({ root, home, userData, dataDirectory: runtime[BUDDY_ENV.DATA_DIR], stateDirectory, configDirectory, modelBaseURL: model.baseURL })
    await launch(options.firstLaunchReady)
    return {
      root, home, userData, notebook, model, consoleLines,
      get page() { return running().page },
      get electron() { return running().electron },
      async stubOpenDirectory(directory: string) {
        const relative = path.relative(root, directory)
        if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Directory picker must stay inside the fixture root")
        await running().electron.evaluate(({ dialog }, selected) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
        }, directory)
      },
      async reload() {
        const { electron, page } = running()
        const window = await electron.browserWindow(page)
        const loaded = page.waitForEvent("domcontentloaded")
        await window.evaluate((window) => window.webContents.reload())
        await loaded
        await expect(page.getByRole("textbox", { name: "Ask Buddy", exact: true })).toBeVisible()
      },
      async restart() {
        const { electron } = running()
        if (trace?.applications.has(electron)) {
          const saved = path.join(root, `restart-trace-${randomUUID()}.zip`)
          await electron.context().tracing.stop({ path: saved })
          trace.applications.delete(electron)
          trace.completed.push(saved)
        }
        await electron.close()
        applications.delete(electron)
        current = undefined
        await launch()
      },
      async terminate(signal: NodeJS.Signals) {
        if (process.platform === "win32") throw new Error("Signal-based restart requires POSIX process signals")
        const { electron } = running()
        const pid = electron.process().pid
        if (!pid) throw new Error("The fixture's Electron main process has no PID")
        if (trace?.applications.has(electron)) {
          const saved = path.join(root, `restart-trace-${randomUUID()}.zip`)
          await electron.context().tracing.stop({ path: saved })
          trace.applications.delete(electron)
          trace.completed.push(saved)
        }
        const { stdout } = await execute("ps", ["-A", "-o", "pid=,ppid="])
        const processes = stdout.trim().split("\n").map((line) =>
          z.tuple([z.coerce.number().int().positive(), z.coerce.number().int().nonnegative()]).parse(line.trim().split(/\s+/u)),
        )
        const descendants = new Set([pid])
        let previousSize = 0
        while (previousSize !== descendants.size) {
          previousSize = descendants.size
          for (const [child, parent] of processes) if (descendants.has(parent)) descendants.add(child)
        }
        const exited = electron.waitForEvent("close")
        await new Promise<void>((resolve, reject) => {
          treeKill(pid, signal, (error) => error ? reject(error) : resolve())
        })
        await exited
        await expect.poll(() => [...descendants].filter((child) => {
          try { process.kill(child, 0); return true }
          catch (error) {
            if (z.object({ code: z.literal("ESRCH") }).safeParse(error).success) return false
            throw error
          }
        }), { message: "The signaled Electron process tree must exit before relaunch" }).toEqual([])
        applications.delete(electron)
        current = undefined
        await launch()
      },
      async startTrace(title: string) {
        trace = { title, applications: new Set(), completed: [] }
        const { electron } = running()
        await electron.context().tracing.start({ title, screenshots: true, snapshots: true, sources: true })
        trace.applications.add(electron)
      },
      async stopTrace(outputPath: string | undefined) {
        if (!trace) return []
        const paths: string[] = []
        for (const [index, saved] of trace.completed.entries()) {
          if (outputPath) {
            const destination = outputPath.replace(/\.zip$/u, `-${index}.zip`)
            await fs.mkdir(path.dirname(destination), { recursive: true })
            await fs.copyFile(saved, destination)
            paths.push(destination)
          }
          await fs.rm(saved)
        }
        for (const [index, electron] of [...trace.applications].entries()) {
          if (!applications.has(electron)) continue
          const destination = outputPath?.replace(/\.zip$/u, `-${index + trace.completed.length}.zip`)
          await electron.context().tracing.stop(destination ? { path: destination } : {})
          if (destination) paths.push(destination)
        }
        trace = undefined
        return paths
      },
      async assertHealthy() {
        model?.assertHealthy()
        const blocked = await fs.readFile(networkLog, "utf8").catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return ""
          throw error
        })
        const expected = new Set(options.expectedBlockedHosts.map((host) => `Blocked non-loopback connection: ${host}`))
        const unexpected = blocked.split("\n").filter((line) => {
          if (line === "" || expected.has(line)) return false
          const prefix = "Blocked Chromium request: "
          if (!line.startsWith(prefix)) return true
          try {
            return !options.expectedBlockedHosts.includes(new URL(line.slice(prefix.length)).hostname)
          } catch {
            return true
          }
        }).join("\n")
        expect(unexpected, "The app must only connect to loopback during UI E2E tests").toBe("")
      },
      async close() {
        try {
          for (const electron of applications) await electron.close()
        } finally {
          try { await model?.close() }
          finally {
            if (process.env.BUDDY_E2E_KEEP === "1") console.log(`Kept UI E2E root: ${root}`)
            else await fs.rm(root, { recursive: true, force: true })
          }
        }
      },
    }
  } catch (error) {
    try { for (const electron of applications) await electron.close() }
    finally {
      await model?.close()
      if (process.env.BUDDY_E2E_KEEP === "1") console.log(`Kept UI E2E root: ${root}`)
      else await fs.rm(root, { recursive: true, force: true })
    }
    throw error
  }
}

type App = Awaited<ReturnType<typeof createApp>>

export const test = base.extend<{ recordTrace: void }, { buddy: App } & AppOptions>({
  beforeLaunch: [undefined, { scope: "worker", option: true }],
  expectedBlockedHosts: [[], { scope: "worker", option: true }],
  launchEnvironment: [{}, { scope: "worker", option: true }],
  firstLaunchReady: [undefined, { scope: "worker", option: true }],
  buddy: [async ({ playwright: _playwright, beforeLaunch, expectedBlockedHosts, launchEnvironment, firstLaunchReady }, use) => {
    const buddy = await createApp({ beforeLaunch, expectedBlockedHosts, launchEnvironment, firstLaunchReady })
    try { await use(buddy) }
    finally { await buddy.close() }
  }, { scope: "worker", timeout: 300_000 }],
  recordTrace: [async ({ buddy }, use, testInfo) => {
    await buddy.startTrace(testInfo.title)
    let completed = false
    try {
      await use()
      await buddy.assertHealthy()
      completed = true
    } finally {
      const failed = !completed || testInfo.status !== testInfo.expectedStatus
      const traces = await buddy.stopTrace(failed ? testInfo.outputPath("trace.zip") : undefined)
      for (const trace of traces) await testInfo.attach("trace", { path: trace, contentType: "application/zip" })
      if (failed) {
        await testInfo.attach("app-log", { body: buddy.consoleLines.join(""), contentType: "text/plain" })
        await testInfo.attach("model-requests", { body: JSON.stringify(buddy.model.requests, null, 2), contentType: "application/json" })
      }
    }
  }, { auto: true }],
})

export { expect } from "@playwright/test"
