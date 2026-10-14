import path from "node:path"
import type { Plugin } from "@opencode/plugin"
import type { OpenCode } from "@opencode/sdk"
import openCodeSdkPackage from "../../../vendor/opencode/packages/sdk/package.json"
import { Flock } from "@opencode/util/flock"
import { Path as OpenCodeGlobalPath } from "@opencode/util/global"

export { ClientError } from "@opencode/client"
export type * as OpenCodeTypes from "@opencode/client"
export type {
  LocationRef,
  OpenCodeEvent,
  PermissionEffect,
  PermissionReply,
  PermissionRequest,
  SessionInfo,
  SessionMessageInfo,
} from "@opencode/client"

export const OPENCODE_VERSION = openCodeSdkPackage.version
const OPENCODE_RELEASE_CHANNEL = "latest"

export type OpenCodeHost = OpenCode.Interface
export type OpenCodeLogEntry = OpenCode.LogEntry
export type OpenCodeLogOptions = OpenCode.LogOptions

export type OpenCodeHostPaths = {
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
}

export type OpenCodeHostOptions = {
  readonly clientName: string
  readonly paths: OpenCodeHostPaths
  readonly databasePath: string
  readonly plugins?: ReadonlyArray<Plugin.Plugin>
  readonly instances?: OpenCode.CreateOptions["instances"]
  readonly log?: OpenCodeLogOptions
  readonly fetchModels?: boolean
  readonly config?: OpenCode.CreateOptions["config"]
  readonly fs?: OpenCode.CreateOptions["fs"]
}

export function configureOpenCodeGlobalPaths(paths: OpenCodeHostPaths) {
  OpenCodeGlobalPath.data = paths.data
  OpenCodeGlobalPath.cache = paths.cache
  OpenCodeGlobalPath.config = paths.config
  OpenCodeGlobalPath.state = paths.state
  OpenCodeGlobalPath.tmp = paths.tmp
  OpenCodeGlobalPath.bin = path.join(paths.cache, "bin")
  OpenCodeGlobalPath.log = path.join(paths.data, "log")
  OpenCodeGlobalPath.repos = path.join(paths.data, "repos")
  Flock.setGlobal({ state: paths.state })
}

export async function createOpenCodeHost(options: OpenCodeHostOptions): Promise<OpenCodeHost> {
  configureOpenCodeGlobalPaths(options.paths)
  const { OpenCode } = await import("@opencode/sdk")
  return OpenCode.create({
    app: {
      name: options.clientName,
      version: OPENCODE_VERSION,
      channel: OPENCODE_RELEASE_CHANNEL,
    },
    database: { path: options.databasePath },
    config: { ...options.config, directory: options.paths.config },
    fs: options.fs,
    models: { fetch: options.fetchModels ?? true },
    plugins: options.plugins,
    instances: options.instances,
    log: options.log,
  })
}
