import os from "node:os"
import path from "node:path"
import { installOpenCodeEnvironment } from "@buddy/opencode-adapter/host"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  BUDDY_HOME_DIRECTORY_NAME,
  BUDDY_OPENCODE_DB_FILENAME,
  BUDDY_OPENCODE_V1_DB_FILENAME,
  BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
  resolveConfiguredPath,
} from "../storage/constants"

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
  database: string
  v1Database: string
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

  return {
    data,
    cache: path.join(buddyCacheDirectory, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    config: configDirectory,
    state: path.join(buddyStateDirectory, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    tmp: temporaryDirectory,
    database: path.join(data, BUDDY_OPENCODE_DB_FILENAME),
    v1Database: path.join(data, BUDDY_OPENCODE_V1_DB_FILENAME),
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
    defaultGlobalConfig:
      resolveConfiguredPathFromEnvironment(
        input.environment[BUDDY_ENV.MANAGED_HOME_DIR],
        input.workingDirectory,
      ) ??
      path.join(
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
    },
  }
}

const environmentPlan = resolveOpenCodeEnvironmentPlan({
  environment: process.env,
  homeDirectory: os.homedir(),
  temporaryDirectory: os.tmpdir(),
  workingDirectory: process.cwd(),
})
export const BUDDY_TMP_DIR = environmentPlan.buddy.tmp

function resolveBuddyGlobalConfigDirectory() {
  return (
    resolveConfiguredPath(process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR]) ??
    environmentPlan.defaults.configDirectory
  )
}

export function openCodeRuntimePaths(): OpenCodeRuntimePaths {
  return openCodeRuntimePathsForPlan(
    environmentPlan.buddy.data,
    environmentPlan.buddy.cache,
    environmentPlan.buddy.state,
    environmentPlan.buddy.tmp,
    resolveBuddyGlobalConfigDirectory(),
  )
}

export function openCodeRuntimeEnvironment() {
  return {
    configDirectory: resolveBuddyGlobalConfigDirectory(),
    resolvePaths: openCodeRuntimePaths,
    xdgOverrides: environmentPlan.runtimeRoot ? environmentPlan.xdg : undefined,
  }
}

installOpenCodeEnvironment(openCodeRuntimeEnvironment())
