import fsp from "node:fs/promises"
import path from "node:path"
import { personaCatalogEntries } from "../../learning/personas/wiring/persona-metadata"
import { listBuddySubagentDefinitions } from "../../learning/subagent-manifest"
import { Config } from "../config.js"
import { readProjectConfig, readProjectConfigFile } from "../runtime/config-access.js"
import { resolveProjectConfigContext, resolveProjectConfigFile } from "../store/config-paths.js"
import { InvalidError } from "../contract/errors.js"

export async function listProjectPersonas(directory: string) {
  const config = await readProjectConfig(directory)
  return personaCatalogEntries(config.personas)
}

export async function listProjectAgents(directory: string) {
  const config = await readProjectConfig(directory)
  const personas = personaCatalogEntries(config.personas).map((persona) => {
    const entry: {
      name: string
      description?: string
      mode: string
      hidden: boolean
      model?: string
    } = {
      name: persona.id,
      description: persona.description,
      mode: "primary",
      hidden: persona.hidden,
    }
    if (config.model) entry.model = config.model
    return entry
  })
  const subagents = listBuddySubagentDefinitions().map((agent) => {
    const model = "model" in agent && typeof agent.model === "string" ? agent.model : config.model
    const entry: {
      name: string
      description?: string
      mode: string
      hidden: boolean
      model?: string
    } = {
      name: agent.key,
      description: agent.description,
      mode: "subagent",
      hidden: false,
    }
    if (model) entry.model = model
    return entry
  })

  return [...personas, ...subagents]
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
  const key = path.resolve(directory)
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
  const contents = await fsp.readFile(filepath, "utf8").catch((error: unknown) => {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") return undefined
    throw error
  })

  return {
    filepath,
    existed: typeof contents === "string",
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
    } catch (error) {
      try {
        await restoreProjectConfigSnapshot(snapshot)
      } catch {
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

export async function patchProjectConfig(input: { directory: string; payload: unknown }) {
  const parsed = mergeAndValidateConfigPatch({
    current: await readProjectConfigFile(input.directory),
    patch: input.payload,
  })
  await applyAndSyncProjectConfigChange({
    directory: input.directory,
    apply: () => Config.updateProject(input.directory, parsed),
  })

  return readProjectConfig(input.directory)
}

export async function patchGlobalConfig(payload: unknown) {
  const parsed = mergeAndValidateConfigPatch({
    current: await Config.getGlobal(),
    patch: payload,
  })

  return Config.updateGlobal(parsed)
}

const DELETE_PATCH_SENTINEL = Symbol("delete_patch_value")

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function mergePatchValue(current: unknown, patch: unknown): unknown | typeof DELETE_PATCH_SENTINEL {
  if (patch === null) return DELETE_PATCH_SENTINEL
  if (!isRecord(patch)) return patch

  const base = isRecord(current) ? { ...current } : {}

  for (const [key, patchValue] of Object.entries(patch)) {
    const merged = mergePatchValue(base[key], patchValue)
    if (merged === DELETE_PATCH_SENTINEL) {
      delete base[key]
      continue
    }
    base[key] = merged
  }

  return base
}

function mergeAndValidateConfigPatch(input: { current: Config.Info; patch: unknown }): Config.Info {
  if (!isRecord(input.patch)) {
    throw new InvalidError({
      path: "<request>",
      message: "Config patch payload must be an object",
    })
  }

  const merged = mergePatchValue(input.current, input.patch)
  if (!isRecord(merged)) {
    throw new InvalidError({
      path: "<request>",
      message: "Config patch payload must resolve to an object",
    })
  }

  return Config.Info.parse(merged)
}

export async function putProjectMcpConfig(input: {
  directory: string
  name: string
  payload: unknown
}) {
  const parsed = Config.Mcp.parse(input.payload)
  await applyAndSyncProjectConfigChange({
    directory: input.directory,
    apply: () => Config.setProjectMcp(input.directory, input.name, parsed),
  })

  return readProjectConfig(input.directory)
}
