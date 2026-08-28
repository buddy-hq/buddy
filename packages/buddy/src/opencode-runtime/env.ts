import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  BUDDY_HOME_DIRECTORY_NAME,
  BUDDY_OPENCODE_DB_FILENAME,
  BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
  OPENCODE_ENV,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
  resolveConfiguredPath,
} from "../storage/constants"

const DEFAULT_OPENCODE_CLIENT = "web"
const OPENCODE_ENABLE_FLAG = "1"
const MIGRATION_DIRECTORY_RELATIVE_PATH = "packages/buddy/migration"
const OPENCODE_BINARY_DIRECTORY_NAME = "bin"
const OPENCODE_LOG_DIRECTORY_NAME = "log"
const OPENCODE_REPOSITORIES_DIRECTORY_NAME = "repos"

export type OpenCodeEnvironmentPlanInput = {
  environment: Readonly<Record<string, string | undefined>>
  homeDirectory: string
  temporaryDirectory: string
  workingDirectory: string
}

export type OpenCodeRuntimePaths = {
  data: string
  cache: string
  config: string
  state: string
  tmp: string
  bin: string
  log: string
  repos: string
}

export type OpenCodeEnvironmentPlan = {
  runtimeRoot: string | undefined
  xdg: {
    data: string
    cache: string
    config: string
    state: string
  }
  buddy: {
    data: string
    cache: string
    state: string
    tmpParent: string
    tmp: string
    defaultGlobalConfig: string
  }
  openCode: OpenCodeRuntimePaths
  defaults: {
    configDirectory: string
    database: string
    disableExternalSkills: string
    client: string
    enableQuestionTool: string
    enableExa: string
  }
}

function resolveConfiguredPathFromEnvironment(
  value: string | undefined,
  workingDirectory: string,
): string | undefined {
  const configured = value?.trim()
  if (!configured || configured === "undefined") {
    return undefined
  }

  try {
    return path.resolve(workingDirectory, decodeURIComponent(configured))
  } catch {
    return path.resolve(workingDirectory, configured)
  }
}

function openCodeRuntimePathsForPlan(
  buddyDataDirectory: string,
  buddyCacheDirectory: string,
  buddyStateDirectory: string,
  temporaryDirectory: string,
  configDirectory: string,
): OpenCodeRuntimePaths {
  const data = path.join(buddyDataDirectory, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME)
  const cache = path.join(buddyCacheDirectory, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME)
  const state = path.join(buddyStateDirectory, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME)

  return {
    data,
    cache,
    config: configDirectory,
    state,
    tmp: temporaryDirectory,
    bin: path.join(cache, OPENCODE_BINARY_DIRECTORY_NAME),
    log: path.join(data, OPENCODE_LOG_DIRECTORY_NAME),
    repos: path.join(data, OPENCODE_REPOSITORIES_DIRECTORY_NAME),
  }
}

export function resolveOpenCodeEnvironmentPlan(
  input: OpenCodeEnvironmentPlanInput,
): OpenCodeEnvironmentPlan {
  const runtimeRoot = resolveConfiguredPathFromEnvironment(
    input.environment[BUDDY_ENV.RUNTIME_ROOT],
    input.workingDirectory,
  )
  const xdg = runtimeRoot
    ? {
        data: path.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.data),
        cache: path.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.cache),
        config: path.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.config),
        state: path.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.state),
      }
    : {
        data:
          resolveConfiguredPathFromEnvironment(
            input.environment[XDG_ENV.DATA_HOME],
            input.workingDirectory,
          ) ?? path.resolve(input.homeDirectory, ...XDG_DEFAULT_SEGMENTS.data),
        cache:
          resolveConfiguredPathFromEnvironment(
            input.environment[XDG_ENV.CACHE_HOME],
            input.workingDirectory,
          ) ?? path.resolve(input.homeDirectory, ...XDG_DEFAULT_SEGMENTS.cache),
        config:
          resolveConfiguredPathFromEnvironment(
            input.environment[XDG_ENV.CONFIG_HOME],
            input.workingDirectory,
          ) ?? path.resolve(input.homeDirectory, ...XDG_DEFAULT_SEGMENTS.config),
        state:
          resolveConfiguredPathFromEnvironment(
            input.environment[XDG_ENV.STATE_HOME],
            input.workingDirectory,
          ) ?? path.resolve(input.homeDirectory, ...XDG_DEFAULT_SEGMENTS.state),
      }
  const tmpParent = runtimeRoot
    ? path.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.tmp, BUDDY_APP_NAME)
    : path.join(input.temporaryDirectory, BUDDY_APP_NAME)
  const buddy = {
    data:
      resolveConfiguredPathFromEnvironment(
        input.environment[BUDDY_ENV.DATA_DIR],
        input.workingDirectory,
      ) ?? path.join(xdg.data, BUDDY_APP_NAME),
    cache:
      resolveConfiguredPathFromEnvironment(
        input.environment[BUDDY_ENV.CACHE_DIR],
        input.workingDirectory,
      ) ?? path.join(xdg.cache, BUDDY_APP_NAME),
    state:
      resolveConfiguredPathFromEnvironment(
        input.environment[BUDDY_ENV.STATE_DIR],
        input.workingDirectory,
      ) ?? path.join(xdg.state, BUDDY_APP_NAME),
    tmpParent,
    tmp: path.join(tmpParent, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    defaultGlobalConfig: path.join(
      resolveConfiguredPathFromEnvironment(
        input.environment[BUDDY_ENV.TEST_HOME],
        input.workingDirectory,
      ) ?? input.homeDirectory,
      BUDDY_HOME_DIRECTORY_NAME,
    ),
  }
  const configDirectory =
    resolveConfiguredPathFromEnvironment(
      input.environment[BUDDY_ENV.GLOBAL_CONFIG_DIR],
      input.workingDirectory,
    ) ?? buddy.defaultGlobalConfig
  const openCode = openCodeRuntimePathsForPlan(
    buddy.data,
    buddy.cache,
    buddy.state,
    buddy.tmp,
    configDirectory,
  )

  return {
    runtimeRoot,
    xdg,
    buddy,
    openCode,
    defaults: {
      configDirectory: buddy.defaultGlobalConfig,
      database: BUDDY_OPENCODE_DB_FILENAME,
      disableExternalSkills: OPENCODE_ENABLE_FLAG,
      client: DEFAULT_OPENCODE_CLIENT,
      enableQuestionTool: OPENCODE_ENABLE_FLAG,
      enableExa: OPENCODE_ENABLE_FLAG,
    },
  }
}

const environmentPlan = resolveOpenCodeEnvironmentPlan({
  environment: process.env,
  homeDirectory: os.homedir(),
  temporaryDirectory: os.tmpdir(),
  workingDirectory: process.cwd(),
})
const runtimeRootPath = environmentPlan.runtimeRoot
const BUDDY_XDG_DATA_HOME = environmentPlan.xdg.data
const BUDDY_XDG_CACHE_HOME = environmentPlan.xdg.cache
const BUDDY_XDG_CONFIG_HOME = environmentPlan.xdg.config
const BUDDY_XDG_STATE_HOME = environmentPlan.xdg.state
const BUDDY_TMP_PARENT_DIR = environmentPlan.buddy.tmpParent
export const BUDDY_TMP_DIR = environmentPlan.buddy.tmp
export const BUDDY_DEFAULT_GLOBAL_CONFIG_DIR = environmentPlan.defaults.configDirectory
const BUDDY_DATA_DIR = environmentPlan.buddy.data
const BUDDY_CACHE_DIR = environmentPlan.buddy.cache
const BUDDY_STATE_DIR = environmentPlan.buddy.state

let openCodeGlobal: typeof import("@buddy/opencode-adapter/global").Global | undefined

function findRepoPath(relativePath: string): string | undefined {
  const searchRoots = [process.cwd(), path.dirname(process.execPath)]

  for (const root of searchRoots) {
    let current = path.resolve(root)

    while (true) {
      const candidate = path.join(current, relativePath)
      if (fs.existsSync(candidate)) {
        return candidate
      }

      const parent = path.dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
  }

  return undefined
}

function applyOptionalPathEnv(name: string, resolvedPath: string | undefined) {
  const current = process.env[name]

  if (current && current !== "undefined") {
    return
  }

  if (resolvedPath) {
    process.env[name] = resolvedPath
    return
  }

  delete process.env[name]
}

function openCodeRuntimePaths(configDirectory: string): OpenCodeRuntimePaths {
  return openCodeRuntimePathsForPlan(
    BUDDY_DATA_DIR,
    BUDDY_CACHE_DIR,
    BUDDY_STATE_DIR,
    BUDDY_TMP_DIR,
    configDirectory,
  )
}

function configureOpenCodeGlobalPaths(configDirectory: string) {
  const runtimePaths = openCodeRuntimePaths(configDirectory)
  for (const directory of [
    runtimePaths.data,
    runtimePaths.cache,
    runtimePaths.config,
    runtimePaths.state,
    runtimePaths.tmp,
    runtimePaths.bin,
    runtimePaths.log,
    runtimePaths.repos,
  ]) {
    fs.mkdirSync(directory, { recursive: true })
  }

  if (openCodeGlobal) {
    openCodeGlobal.Path.data = runtimePaths.data
    openCodeGlobal.Path.cache = runtimePaths.cache
    openCodeGlobal.Path.config = runtimePaths.config
    openCodeGlobal.Path.state = runtimePaths.state
    openCodeGlobal.Path.tmp = runtimePaths.tmp
    openCodeGlobal.Path.bin = runtimePaths.bin
    openCodeGlobal.Path.log = runtimePaths.log
    openCodeGlobal.Path.repos = runtimePaths.repos
  }
}

export function configureOpenCodeEnvironment() {
  const buddyConfigDir =
    resolveConfiguredPath(process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR]) ??
    environmentPlan.defaults.configDirectory

  if (runtimeRootPath) {
    process.env[XDG_ENV.DATA_HOME] = BUDDY_XDG_DATA_HOME
    process.env[XDG_ENV.CACHE_HOME] = BUDDY_XDG_CACHE_HOME
    process.env[XDG_ENV.CONFIG_HOME] = BUDDY_XDG_CONFIG_HOME
    process.env[XDG_ENV.STATE_HOME] = BUDDY_XDG_STATE_HOME
  }
  process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR] = buddyConfigDir
  process.env[OPENCODE_ENV.CONFIG_DIR] = buddyConfigDir
  process.env[OPENCODE_ENV.DB] = environmentPlan.defaults.database
  process.env[OPENCODE_ENV.DISABLE_EXTERNAL_SKILLS] ||=
    environmentPlan.defaults.disableExternalSkills
  process.env[OPENCODE_ENV.CLIENT] ||= environmentPlan.defaults.client
  process.env[OPENCODE_ENV.ENABLE_QUESTION_TOOL] ||= environmentPlan.defaults.enableQuestionTool
  process.env[OPENCODE_ENV.ENABLE_EXA] ||= environmentPlan.defaults.enableExa
  applyOptionalPathEnv(BUDDY_ENV.MIGRATION_DIR, findRepoPath(MIGRATION_DIRECTORY_RELATIVE_PATH))
  configureOpenCodeGlobalPaths(buddyConfigDir)
}

function applyTemporaryEnvironment(environment: Record<string, string>): () => void {
  const previous = new Map<string, string | undefined>()

  for (const [name, value] of Object.entries(environment)) {
    previous.set(name, process.env[name])
    process.env[name] = value
  }

  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name]
        continue
      }

      process.env[name] = value
    }
  }
}

function openCodeImportEnvironment() {
  return {
    [XDG_ENV.DATA_HOME]: BUDDY_DATA_DIR,
    [XDG_ENV.CACHE_HOME]: BUDDY_CACHE_DIR,
    [XDG_ENV.CONFIG_HOME]: BUDDY_TMP_PARENT_DIR,
    [XDG_ENV.STATE_HOME]: BUDDY_STATE_DIR,
    TMPDIR: BUDDY_TMP_PARENT_DIR,
    TMP: BUDDY_TMP_PARENT_DIR,
    TEMP: BUDDY_TMP_PARENT_DIR,
  }
}

configureOpenCodeEnvironment()

const restoreOpenCodeImportEnvironment = applyTemporaryEnvironment(openCodeImportEnvironment())
try {
  const { Global } = await import("@buddy/opencode-adapter/global")
  openCodeGlobal = Global
} finally {
  restoreOpenCodeImportEnvironment()
}
configureOpenCodeEnvironment()
