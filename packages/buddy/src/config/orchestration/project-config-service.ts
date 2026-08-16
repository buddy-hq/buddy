import fsp from "node:fs/promises"
import path from "node:path"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { personaCatalogEntries } from "../../learning/personas/wiring/persona-metadata"
import { Config } from "../config.js"
import {
  isConfigValidationError,
  readProjectConfigFile,
  readProjectConfig,
  syncOpenCodeProjectConfig,
} from "../runtime/opencode-sync.js"
import { resolveProjectConfigContext, resolveProjectConfigFile } from "../store/config-paths.js"
import { InvalidError } from "../contract/errors.js"
import {
  parseCaughtErrorMessage,
  parseConfigObject,
  parseNodeErrorCode,
  type TConfigJsonObject,
  type TConfigJsonValue,
} from "../parse-values.js"

export async function listProjectPersonas(directory: string) {
  const config = await readProjectConfig(directory)
  return personaCatalogEntries({
    defaultPersona: config.default_persona,
    primaryUse: config.personalization?.primary_use,
    overrides: config.personas,
  })
}

export async function listProjectAgents(directory: string) {
  await syncOpenCodeProjectConfig(directory).catch((error) => {
    if (isConfigValidationError(error)) {
      throw error
    }
    throw new Error(
      `Failed to sync config before listing agents: ${parseCaughtErrorMessage(error)}`,
      { cause: error },
    )
  })

  const agents = await OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeAgent.list(),
  })

  return agents.map((agent) => ({
    name: agent.name,
    description: agent.description,
    mode: agent.mode,
    hidden: agent.hidden,
    model: agent.model,
    variant: agent.variant,
  }))
}

type ProjectConfigSnapshot = {
  filepath: string
  existed: boolean
  contents?: string
}

const projectConfigChangeLocks = new Map<string, Promise<void>>()

async function withProjectConfigChangeLock<T>(
  directory: string,
  task: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(await resolveProjectConfigPath(directory))
  const previous = projectConfigChangeLocks.get(key) ?? Promise.resolve()
  let releaseLock!: () => void
  const current = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  const queued = previous.finally(() => current)
  projectConfigChangeLocks.set(key, queued)
  await previous.catch(() => undefined)

  try {
    return await task()
  } finally {
    releaseLock()
    if (projectConfigChangeLocks.get(key) === queued) {
      projectConfigChangeLocks.delete(key)
    }
  }
}

async function resolveProjectConfigPath(directory: string): Promise<string> {
  const { configDirectory } = await resolveProjectConfigContext(directory)
  return resolveProjectConfigFile(configDirectory)
}

async function captureProjectConfigSnapshot(directory: string): Promise<ProjectConfigSnapshot> {
  const filepath = await resolveProjectConfigPath(directory)
  const contents = await fsp.readFile(filepath, "utf8").catch((error) => {
    if (parseNodeErrorCode(error) === "ENOENT") return undefined
    throw error
  })

  return {
    filepath,
    existed: contents !== undefined,
    contents,
  }
}

async function restoreProjectConfigSnapshot(snapshot: ProjectConfigSnapshot): Promise<void> {
  if (!snapshot.existed) {
    await fsp.rm(snapshot.filepath, { force: true })
    return
  }

  await fsp.mkdir(path.dirname(snapshot.filepath), { recursive: true })
  await fsp.writeFile(snapshot.filepath, snapshot.contents ?? "{}", "utf8")
}

async function applyAndSyncProjectConfigChange(input: {
  directory: string
  apply: () => Promise<void>
}) {
  return withProjectConfigChangeLock(input.directory, async () => {
    const snapshot = await captureProjectConfigSnapshot(input.directory)

    try {
      await input.apply()
      await syncOpenCodeProjectConfig(input.directory)
    } catch (error) {
      let recovered = true

      try {
        await restoreProjectConfigSnapshot(snapshot)
        await syncOpenCodeProjectConfig(input.directory, true)
      } catch {
        recovered = false
      }

      if (!recovered) {
        throw new Error(
          "Failed to apply project config change and failed to recover previous config",
          {
            cause: error,
          },
        )
      }

      throw error
    }
  })
}

export async function patchProjectConfig<TPayload>(input: {
  directory: string
  payload: TPayload
}) {
  await applyAndSyncProjectConfigChange({
    directory: input.directory,
    apply: async () => {
      const parsed = mergeAndValidateConfigPatch({
        current: await readProjectConfigFile(input.directory),
        patch: requireConfigPatchObject(input.payload),
        parse: (value) => Config.ProjectInfo.parse(value),
      })
      await Config.updateProject(input.directory, parsed)
    },
  })

  return readProjectConfig(input.directory)
}

export async function patchGlobalConfig<TPayload>(payload: TPayload) {
  return Config.mutateGlobal((current) =>
    mergeAndValidateConfigPatch({
      current,
      patch: requireConfigPatchObject(payload),
      parse: (value) => Config.Info.parse(value),
    }),
  )
}

const DELETE_PATCH_SENTINEL = Symbol("delete_patch_value")

type TConfigPatchResult = TConfigJsonValue | typeof DELETE_PATCH_SENTINEL

function requireConfigPatchObject<TPayload>(payload: TPayload): TConfigJsonObject {
  const patch = parseConfigObject(payload)
  if (patch === undefined) {
    throw new InvalidError({
      path: "<request>",
      message: "Config patch payload must be an object",
    })
  }
  return patch
}

function mergePatchValue(
  current: TConfigJsonValue | undefined,
  patch: TConfigJsonValue,
): TConfigPatchResult {
  if (patch === null) return DELETE_PATCH_SENTINEL
  const patchObject = parseConfigObject(patch)
  if (patchObject === undefined) return patch

  const currentObject = parseConfigObject(current)
  const base: TConfigJsonObject = currentObject === undefined ? {} : { ...currentObject }

  for (const [key, patchValue] of Object.entries(patchObject)) {
    if (patchValue === undefined) continue
    const merged = mergePatchValue(base[key], patchValue)
    if (merged === DELETE_PATCH_SENTINEL) {
      delete base[key]
      continue
    }
    base[key] = merged
  }

  return base
}

function mergeAndValidateConfigPatch<TConfig>(input: {
  current: TConfig
  patch: TConfigJsonObject
  parse: (value: TConfigJsonObject) => TConfig
}): TConfig {
  const merged = mergePatchValue(parseConfigObject(input.current), input.patch)
  const mergedObject = merged === DELETE_PATCH_SENTINEL ? undefined : parseConfigObject(merged)
  if (mergedObject === undefined) {
    throw new InvalidError({
      path: "<request>",
      message: "Config patch payload must resolve to an object",
    })
  }

  return input.parse(mergedObject)
}

export async function putProjectMcpConfig<TPayload>(input: {
  directory: string
  name: string
  payload: TPayload
}) {
  const parsed = Config.Mcp.parse(input.payload)
  await applyAndSyncProjectConfigChange({
    directory: input.directory,
    apply: () => Config.setProjectMcp(input.directory, input.name, parsed),
  })

  return readProjectConfig(input.directory)
}
