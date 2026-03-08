import fsp from "node:fs/promises"
import path from "node:path"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ZodError } from "zod"
import {
  configErrorMessage,
  isConfigValidationError,
  readProjectConfig,
  syncOpenCodeProjectConfig,
} from "../../config/compatibility.js"
import { Config } from "../../config/config.js"
import { personaCatalogEntries } from "../../personas/catalog.js"

export function mapOpenCodeAgents(
  agents: Array<{ name: string; description?: string; mode: string; hidden?: boolean }>,
) {
  return agents.map((agent) => ({
    name: agent.name,
    description: agent.description,
    mode: agent.mode,
    hidden: agent.hidden,
  }))
}

export function configRouteValidationResponse(error: unknown): Response | undefined {
  if (error instanceof ZodError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return undefined
}

export function parseConfigInfo(body: unknown) {
  return Config.Info.parse(body)
}

export function parseConfigMcp(body: unknown) {
  return Config.Mcp.parse(body)
}

export function mapConfigRouteError(error: unknown): Response | undefined {
  if (isConfigValidationError(error)) {
    return Response.json({ error: configErrorMessage(error) }, { status: 400 })
  }

  return configRouteValidationResponse(error)
}

export async function listProjectPersonas(directory: string) {
  const config = await readProjectConfig(directory)
  return personaCatalogEntries(config.personas)
}

export async function listProjectAgents(directory: string) {
  await syncOpenCodeProjectConfig(directory).catch((error) => {
    if (isConfigValidationError(error)) {
      throw error
    }
    throw new Error(
      `Failed to sync config before listing agents: ${String(error instanceof Error ? error.message : error)}`,
      { cause: error },
    )
  })
  const agents = await OpenCodeInstance.provide({
    directory,
    fn: () => OpenCodeAgent.list(),
  })

  return mapOpenCodeAgents(agents)
}

type ProjectConfigSnapshot = {
  filepath: string
  existed: boolean
  contents?: string
}

const projectConfigChangeLocks = new Map<string, Promise<void>>()

async function withProjectConfigChangeLock<T>(directory: string, task: () => Promise<T>): Promise<T> {
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

async function resolveProjectConfigFile(directory: string): Promise<string> {
  const { configDirectory } = await OpenCodeInstance.provide({
    directory: path.resolve(directory),
    fn: () => {
      const scopedDirectory = path.resolve(OpenCodeInstance.directory)
      const worktree = path.resolve(OpenCodeInstance.worktree)
      return {
        configDirectory: worktree !== "/" ? worktree : scopedDirectory,
      }
    },
  })

  const jsonc = path.join(configDirectory, "buddy.jsonc")
  const json = path.join(configDirectory, "buddy.json")
  if ((await fsp.stat(jsonc).catch(() => undefined))?.isFile()) return jsonc
  if ((await fsp.stat(json).catch(() => undefined))?.isFile()) return json
  return jsonc
}

async function captureProjectConfigSnapshot(directory: string): Promise<ProjectConfigSnapshot> {
  const filepath = await resolveProjectConfigFile(directory)
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
      await syncOpenCodeProjectConfig(input.directory)
    } catch (error) {
      let recoveryError: unknown

      try {
        await restoreProjectConfigSnapshot(snapshot)
        await syncOpenCodeProjectConfig(input.directory, true)
      } catch (syncError) {
        recoveryError = syncError
      }

      if (recoveryError !== undefined) {
        throw new Error("Failed to apply project config change and failed to recover previous config", {
          cause: {
            originalError: error,
            recoveryError,
          },
        })
      }

      throw error
    }
  })
}

export async function patchProjectConfig(input: {
  directory: string
  payload: unknown
}) {
  const parsed = parseConfigInfo(input.payload)
  await applyAndSyncProjectConfigChange({
    directory: input.directory,
    apply: () => Config.updateProject(input.directory, parsed),
  })
  return readProjectConfig(input.directory)
}

export async function putProjectMcpConfig(input: {
  directory: string
  name: string
  payload: unknown
}) {
  const parsed = parseConfigMcp(input.payload)
  await applyAndSyncProjectConfigChange({
    directory: input.directory,
    apply: () => Config.setProjectMcp(input.directory, input.name, parsed),
  })
  return readProjectConfig(input.directory)
}
