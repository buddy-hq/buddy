import { execFileSync, spawn } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs"
import { EventEmitter } from "node:events"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"
import { app } from "electron"
import treeKill from "tree-kill"
import { SIDECAR_BINARY_NAME, SIDECAR_USERNAME } from "./constants"
import { getUserShell, loadShellEnv, mergeShellEnv } from "./shell-env"

const CLI_INSTALL_DIR = ".buddy/bin"
const CLI_BINARY_NAME = "buddy"
const SQLITE_PROGRESS_PREFIX = "sqlite-migration:"
const SERVE_COMMAND = "serve"
const HOSTNAME_OPTION = "--hostname"
const PORT_OPTION = "--port"
const WATCH_OPTION = "--watch"
const ENV_FILE_OPTION = "--env-file"
const BUN_RUN_COMMAND = "run"
const BUN_EXECUTABLE = "bun"
const ADVANCED_MATH_LOCAL_ASSET_DIR_ENV = "BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR"
const STANDARDS_LOCAL_ASSET_DIR_ENV = "BUDDY_STANDARDS_LOCAL_ASSET_DIR"
const BUN_BE_BUN_ENV = "BUN_BE_BUN"
const ADVANCED_MATH_LOCAL_ASSET_PATH_SEGMENTS = ["dist", "advanced-math-runtime"] as const
const STANDARDS_LOCAL_ASSET_PATH_SEGMENTS = ["resources", "knowledge-graph"] as const
const RUNTIME_SUBDIRECTORIES = ["data", "cache", "config", "state"] as const
const OPENCODE_DATA_SUBDIRECTORY = "opencode"
const BUDDY_RUNTIME_DIRECTORY_NAME = ".buddy-runtime"
const BUDDY_RUNTIME_XDG_DIRECTORY_NAME = "xdg"
const BUNDLED_BACKEND_DIRECTORY_NAME = "backend"
const BUNDLED_MIGRATIONS_DIRECTORY_NAME = "migrations"
const BUDDY_MIGRATION_DIRECTORY_NAME = "buddy"
const DEVELOPMENT_BACKEND_PACKAGE_NAME = "buddy"
const DEVELOPMENT_BACKEND_ENTRYPOINT_PATH_SEGMENTS = ["src", "index.ts"] as const
const DEVELOPMENT_BACKEND_MIGRATION_PATH_SEGMENTS = ["migration"] as const
const DEFAULT_NOTEBOOK_HOME_SEGMENTS = ["Documents", "Buddy"] as const
const PATH_ENV_KEYS = ["PATH", "Path"] as const
const POSIX_SIDECAR_PATH_ENTRIES = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
] as const

export type SqliteMigrationProgress = { type: "InProgress"; value: number } | { type: "Done" }

export type TerminatedPayload = {
  code: number | null
  signal: number | null
}

export type CommandChild = {
  pid: number | undefined
  kill: () => void
}

function sidecarBinaryName() {
  return process.platform === "win32" ? `${SIDECAR_BINARY_NAME}.exe` : SIDECAR_BINARY_NAME
}

function resourcesDirectory() {
  if (app.isPackaged) {
    return process.resourcesPath
  }
  return path.join(import.meta.dirname, "../../resources")
}

function resolveAllowedDirectoryRoots(input: { home: string; runtimeRoot: string }) {
  const configuredRoots = [
    path.join(input.home, ...DEFAULT_NOTEBOOK_HOME_SEGMENTS),
    input.runtimeRoot,
  ]

  return Array.from(new Set(configuredRoots)).join(",")
}

function resolveDefaultNotebookHome(home: string) {
  return path.join(home, ...DEFAULT_NOTEBOOK_HOME_SEGMENTS)
}

export function getSidecarPath() {
  return path.join(resourcesDirectory(), sidecarBinaryName())
}

function getBundledBackendEntrypointPath() {
  const entrypoint = path.join(
    resourcesDirectory(),
    BUNDLED_BACKEND_DIRECTORY_NAME,
    `${SIDECAR_BINARY_NAME}.js`,
  )
  if (!existsSync(entrypoint)) {
    throw new Error(`Bundled Buddy backend entrypoint not found at ${entrypoint}`)
  }
  return entrypoint
}

function getBundledBuddyMigrationDir() {
  const migrationDir = path.join(
    resourcesDirectory(),
    BUNDLED_MIGRATIONS_DIRECTORY_NAME,
    BUDDY_MIGRATION_DIRECTORY_NAME,
  )
  if (!existsSync(migrationDir)) {
    throw new Error(`Bundled Buddy migration directory not found at ${migrationDir}`)
  }
  return migrationDir
}

function resolveDevelopmentBackendRoot() {
  if (app.isPackaged) return undefined

  const candidates = [
    path.resolve(app.getAppPath(), "..", DEVELOPMENT_BACKEND_PACKAGE_NAME),
    path.resolve(process.cwd(), "..", DEVELOPMENT_BACKEND_PACKAGE_NAME),
  ]

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, ...DEVELOPMENT_BACKEND_ENTRYPOINT_PATH_SEGMENTS))) {
      return candidate
    }
  }

  return undefined
}

function resolveDevelopmentEnvFilePath(backendRoot: string) {
  const envFilePath = path.resolve(backendRoot, "..", "..", ".env")
  return existsSync(envFilePath) ? `${ENV_FILE_OPTION}=${envFilePath}` : undefined
}

function getBuddyMigrationDir() {
  const backendRoot = resolveDevelopmentBackendRoot()
  if (backendRoot) {
    const migrationDir = path.join(backendRoot, ...DEVELOPMENT_BACKEND_MIGRATION_PATH_SEGMENTS)
    if (existsSync(migrationDir)) {
      return migrationDir
    }
  }

  return getBundledBuddyMigrationDir()
}

async function buildRuntimeEnvironment(password: string, port: number) {
  const runtimeRoot = resolveBuddyRuntimeRoot()
  const xdgDataHome = path.join(runtimeRoot, "data")
  const home = os.homedir()
  const base = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )

  ensureRuntimeDirectories(runtimeRoot, xdgDataHome)

  const environment: Record<string, string> = {
    ...base,
    [BUN_BE_BUN_ENV]: "1",
    BUDDY_SERVER_USERNAME: SIDECAR_USERNAME,
    BUDDY_SERVER_PASSWORD: password,
    OPENCODE_SERVER_USERNAME: SIDECAR_USERNAME,
    OPENCODE_SERVER_PASSWORD: password,
    BUDDY_APP_VERSION: app.getVersion(),
    BUDDY_MIGRATION_DIR: getBuddyMigrationDir(),
    BUDDY_DIRECTORY_BASE: resolveDefaultNotebookHome(home),
    BUDDY_ALLOWED_DIRECTORY_ROOTS: resolveAllowedDirectoryRoots({
      home,
      runtimeRoot,
    }),
    BUDDY_RUNTIME_ROOT: runtimeRoot,
    XDG_DATA_HOME: xdgDataHome,
    XDG_CACHE_HOME: path.join(runtimeRoot, "cache"),
    XDG_CONFIG_HOME: path.join(runtimeRoot, "config"),
    XDG_STATE_HOME: path.join(runtimeRoot, "state"),
    PORT: String(port),
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_CLIENT: "desktop-electron",
  }

  const advancedMathAssetDir = resolveDevelopmentAdvancedMathAssetDir()
  if (advancedMathAssetDir) {
    environment[ADVANCED_MATH_LOCAL_ASSET_DIR_ENV] = advancedMathAssetDir
  }

  const standardsAssetDir = resolveDevelopmentStandardsAssetDir()
  if (standardsAssetDir) {
    environment[STANDARDS_LOCAL_ASSET_DIR_ENV] = standardsAssetDir
  }

  return environment
}

function resolveBuddyRuntimeRoot() {
  return path.join(os.homedir(), BUDDY_RUNTIME_DIRECTORY_NAME, BUDDY_RUNTIME_XDG_DIRECTORY_NAME)
}

function ensureRuntimeDirectories(runtimeRoot: string, xdgDataHome: string) {
  mkdirSync(runtimeRoot, { recursive: true })

  for (const segment of RUNTIME_SUBDIRECTORIES) {
    mkdirSync(path.join(runtimeRoot, segment), { recursive: true })
  }

  mkdirSync(path.join(xdgDataHome, OPENCODE_DATA_SUBDIRECTORY), { recursive: true })
}

function resolveDevelopmentAdvancedMathAssetDir() {
  if (app.isPackaged) return undefined

  const appPathCandidate = path.resolve(
    app.getAppPath(),
    "..",
    "buddy",
    ...ADVANCED_MATH_LOCAL_ASSET_PATH_SEGMENTS,
  )
  if (existsSync(appPathCandidate)) {
    return appPathCandidate
  }

  const cwdCandidate = path.resolve(
    process.cwd(),
    "..",
    "buddy",
    ...ADVANCED_MATH_LOCAL_ASSET_PATH_SEGMENTS,
  )
  if (existsSync(cwdCandidate)) {
    return cwdCandidate
  }

  return undefined
}

function resolveDevelopmentStandardsAssetDir() {
  if (app.isPackaged) return undefined

  const appPathCandidate = path.resolve(
    app.getAppPath(),
    "..",
    "buddy",
    ...STANDARDS_LOCAL_ASSET_PATH_SEGMENTS,
  )
  if (existsSync(appPathCandidate)) {
    return appPathCandidate
  }

  const cwdCandidate = path.resolve(
    process.cwd(),
    "..",
    "buddy",
    ...STANDARDS_LOCAL_ASSET_PATH_SEGMENTS,
  )
  if (existsSync(cwdCandidate)) {
    return cwdCandidate
  }

  return undefined
}

function killStaleDevelopmentSidecars(runtimeRoot: string) {
  if (app.isPackaged || process.platform === "win32") return

  const sidecarPath = getSidecarPath()
  const backendRoot = resolveDevelopmentBackendRoot()
  const developmentEntrypoint = backendRoot
    ? path.join(backendRoot, ...DEVELOPMENT_BACKEND_ENTRYPOINT_PATH_SEGMENTS)
    : undefined
  const currentPid = process.pid

  try {
    const output = execFileSync("ps", ["eww", "-ax"], {
      encoding: "utf8",
    })

    for (const line of output.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed.includes(`BUDDY_RUNTIME_ROOT=${runtimeRoot}`)) continue
      const matchesBundledSidecar = trimmed.includes(sidecarPath)
      const matchesDevelopmentSidecar = developmentEntrypoint
        ? trimmed.includes(BUN_EXECUTABLE) && trimmed.includes(developmentEntrypoint)
        : false
      if (!matchesBundledSidecar && !matchesDevelopmentSidecar) continue

      const pidText = trimmed.split(/\s+/, 1)[0]
      const pid = Number.parseInt(pidText, 10)
      if (Number.isNaN(pid) || pid === currentPid) continue

      try {
        treeKill(pid)
      } catch {
        // noop
      }
    }
  } catch {
    // noop
  }
}

export async function serve(hostname: string, port: number, password: string) {
  const backendRoot = resolveDevelopmentBackendRoot()
  const command = backendRoot ? BUN_EXECUTABLE : getSidecarPath()
  const entrypoint = backendRoot
    ? path.join(backendRoot, ...DEVELOPMENT_BACKEND_ENTRYPOINT_PATH_SEGMENTS)
    : getBundledBackendEntrypointPath()
  const envFileArgument = backendRoot ? resolveDevelopmentEnvFilePath(backendRoot) : undefined
  const args = [
    ...(envFileArgument ? [envFileArgument] : []),
    BUN_RUN_COMMAND,
    ...(backendRoot ? [WATCH_OPTION] : []),
    entrypoint,
    SERVE_COMMAND,
    HOSTNAME_OPTION,
    hostname,
    PORT_OPTION,
    String(port),
  ]

  const shell = process.platform === "win32" ? null : getUserShell()
  const env = await buildRuntimeEnvironment(password, port)
  killStaleDevelopmentSidecars(env.BUDDY_RUNTIME_ROOT)
  const envs = ensureSidecarCommandPath(shell ? mergeShellEnv(loadShellEnv(shell), env) : env)

  const child = spawn(command, args, {
    cwd: backendRoot ?? undefined,
    env: envs,
    detached: app.isPackaged && process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  const events = new EventEmitter()
  const exit = new Promise<TerminatedPayload>((resolve) => {
    child.on("exit", (code, signal) => {
      void signal
      resolve({ code: code ?? null, signal: null })
    })
    child.on("error", (error: Error) => {
      events.emit("error", error.message)
    })
  })

  if (child.stdout) {
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      if (handleSqliteProgress(events, line)) return
      events.emit("stdout", `${line}\n`)
    })
  }

  if (child.stderr) {
    readline.createInterface({ input: child.stderr }).on("line", (line) => {
      if (handleSqliteProgress(events, line)) return
      events.emit("stderr", `${line}\n`)
    })
  }

  exit.then((payload) => {
    events.emit("terminated", payload)
  })

  const wrappedChild: CommandChild = {
    pid: child.pid,
    kill: () => {
      if (!child.pid) return
      treeKill(child.pid)
    },
  }

  return {
    child: wrappedChild,
    exit,
    events,
  }
}

function ensureSidecarCommandPath(env: Record<string, string>) {
  if (process.platform === "win32") {
    return env
  }

  const pathKey = pathKeyForEnvironment(env)
  const values = new Set(
    splitPathValue(env[pathKey] ?? "").map((entry) => normalizePathEntry(entry)),
  )
  const nextEntries = splitPathValue(env[pathKey] ?? "")

  for (const entry of POSIX_SIDECAR_PATH_ENTRIES) {
    const normalized = normalizePathEntry(entry)
    if (values.has(normalized)) continue
    values.add(normalized)
    nextEntries.push(entry)
  }

  env[pathKey] = nextEntries.join(path.delimiter)
  if (pathKey === "PATH") {
    delete env.Path
  } else {
    delete env.PATH
  }
  return env
}

function pathKeyForEnvironment(env: Record<string, string>) {
  for (const key of PATH_ENV_KEYS) {
    const value = env[key]
    if (typeof value === "string" && value.trim().length > 0) {
      return key
    }
  }
  return PATH_ENV_KEYS[0]
}

function splitPathValue(value: string) {
  return value
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function normalizePathEntry(entry: string) {
  return process.platform === "win32" ? entry.toLowerCase() : entry
}

function handleSqliteProgress(events: EventEmitter, line: string) {
  const stripped = line.startsWith(SQLITE_PROGRESS_PREFIX)
    ? line.slice(SQLITE_PROGRESS_PREFIX.length).trim()
    : null

  if (!stripped) return false

  if (stripped === "done") {
    events.emit("sqlite", { type: "Done" } satisfies SqliteMigrationProgress)
    return true
  }

  const value = Number.parseInt(stripped, 10)
  if (!Number.isNaN(value)) {
    events.emit("sqlite", { type: "InProgress", value } satisfies SqliteMigrationProgress)
    return true
  }

  return false
}

export async function installCli() {
  if (process.platform === "win32") {
    throw new Error("CLI installation is only supported on macOS and Linux")
  }

  const source = getSidecarPath()
  if (!existsSync(source)) {
    throw new Error(`Sidecar binary not found at ${source}`)
  }

  const installRoot = path.join(os.homedir(), CLI_INSTALL_DIR)
  mkdirSync(installRoot, { recursive: true })

  const destination = path.join(installRoot, CLI_BINARY_NAME)
  copyFileSync(source, destination)
  chmodSync(destination, 0o755)

  return destination
}

export function syncCli() {
  if (!app.isPackaged) return
  if (process.platform === "win32") return
  const installPath = getCliInstallPath()
  if (!installPath) return

  let version = ""
  try {
    version = execFileSync(installPath, ["--version"], { windowsHide: true }).toString().trim()
  } catch {
    return
  }

  const cli = parseVersion(version)
  const appVersion = parseVersion(app.getVersion())
  if (!cli || !appVersion) return
  if (compareVersions(cli, appVersion) >= 0) return
  void installCli().catch(() => undefined)
}

function getCliInstallPath() {
  const home = process.env.HOME
  if (!home) return null
  return path.join(home, CLI_INSTALL_DIR, CLI_BINARY_NAME)
}

function parseVersion(value: string) {
  const parts = value
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
  if (parts.some((part) => Number.isNaN(part))) return null
  return parts
}

function compareVersions(a: number[], b: number[]) {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left > right) return 1
    if (left < right) return -1
  }
  return 0
}
