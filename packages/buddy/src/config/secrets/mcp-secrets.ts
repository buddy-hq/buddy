import fs from "node:fs/promises"
import z from "zod"
import { parse as parseJsonc } from "jsonc-parser"
import { ConfigSchema } from "../contract/schema"
import { loadConfigText } from "../contract/document"
import { projectWebSafeConfig } from "../contract/web-safe"
import {
  parseConfigJsonValue,
  parseConfigObject,
  parseConfigString,
  parseNodeErrorCode,
  type TConfigJsonObject,
  type TConfigJsonValue,
} from "../parse-values"
import {
  resolveGlobalConfigFile,
  resolveProjectConfigContext,
  resolveProjectConfigFile,
} from "../store/config-paths"
import {
  deleteSecrets,
  readSecrets,
  SECRET_REFERENCE_PATTERN,
  secretReference,
  storeSecret,
} from "./secret-store"

const CONFIG_REFERENCE_PATTERN = /\{(?:env|file|secret):[^}]+\}/u
let configSaveTail = Promise.resolve()

export async function withMcpSecretConfigLock<T>(task: () => Promise<T>): Promise<T> {
  const previous = configSaveTail
  const { promise, resolve } = Promise.withResolvers<void>()
  configSaveTail = promise
  await previous
  try {
    return await task()
  } finally {
    resolve()
  }
}

const mcpSettingsEntry = z.union([
  ...ConfigSchema.Mcp.options.map((option) =>
    option.extend({ missingSecret: z.boolean().optional() }),
  ),
  z.object({ enabled: z.boolean(), missingSecret: z.boolean().optional() }).strict(),
])
const mcpSettingsFields = { mcp: z.record(z.string(), mcpSettingsEntry).optional() }
export const McpSettingsInfo = ConfigSchema.Info.safeExtend(mcpSettingsFields)
export const McpSettingsProjectInfo = ConfigSchema.ProjectInfo.safeExtend(mcpSettingsFields)

export function configSecretIds(value: TConfigJsonValue | undefined): Set<string> {
  const ids = new Set<string>()
  function collect(entry: TConfigJsonValue | undefined): void {
    const text = parseConfigString(entry)
    if (text !== undefined) {
      for (const match of text.matchAll(SECRET_REFERENCE_PATTERN)) ids.add(match[1])
    } else if (Array.isArray(entry)) {
      for (const child of entry) collect(child)
    } else {
      const record = parseConfigObject(entry)
      if (record) for (const child of Object.values(record)) collect(child)
    }
  }
  collect(value)
  return ids
}

export async function projectMcpSettingsConfig<TConfig>(
  config: TConfig,
): Promise<TConfigJsonObject> {
  const rawServers = parseConfigObject(parseConfigObject(config)?.mcp)
  const projected = projectWebSafeConfig(config)
  const servers = parseConfigObject(projected.mcp)
  if (!rawServers || !servers) return projected
  const secrets = await readSecrets()
  for (const [name, server] of Object.entries(rawServers)) {
    if ([...configSecretIds(server)].some((id) => !Object.hasOwn(secrets, id))) {
      servers[name] = { ...parseConfigObject(servers[name]), missingSecret: true }
    }
  }
  return projected
}

async function parseConfigSecretIds(text: string, filepath: string): Promise<Set<string>> {
  await loadConfigText(text, { path: filepath }, { resolveSubstitutions: false })
  return configSecretIds(parseConfigJsonValue(parseJsonc(text)))
}

export async function deleteUnusedMcpSecrets(input: {
  filepath: string
  before: string
}): Promise<void> {
  return withMcpSecretConfigLock(async () => {
    try {
      const previous = await parseConfigSecretIds(input.before, input.filepath)
      const next = await parseConfigSecretIds(
        await fs.readFile(input.filepath, "utf8"),
        input.filepath,
      )
      const removed = new Set([...previous].filter((id) => !next.has(id)))
      if (removed.size === 0) return

      const { listOpenProjects } = await import("../../project/open-project-registry")
      const registry = await listOpenProjects()
      if (registry.recovery?.needed) {
        console.warn("Failed to clean up unused MCP secrets after saving config", {
          path: input.filepath,
          reason: "notebook registry needs recovery",
        })
        return
      }
      const configPaths = new Set([input.filepath, resolveGlobalConfigFile()])
      for (const directory of registry.directories) {
        const context = await resolveProjectConfigContext(directory).catch((error) => {
          const code = parseNodeErrorCode(error)
          if (code === "ENOENT" || code === "ENOTDIR") return undefined
          throw error
        })
        if (context) configPaths.add(resolveProjectConfigFile(context.configDirectory))
      }
      for (const filepath of configPaths) {
        const text = await fs.readFile(filepath, "utf8").catch((error) => {
          if (parseNodeErrorCode(error) === "ENOENT") return "{}"
          throw error
        })
        const referenced = await parseConfigSecretIds(text, filepath)
        for (const id of referenced) removed.delete(id)
      }
      if (removed.size > 0) await deleteSecrets([...removed])
    } catch (error) {
      console.warn("Failed to clean up unused MCP secrets after saving config", {
        path: input.filepath,
        code: parseNodeErrorCode(error),
      })
    }
  })
}

function enteredSecret(
  value: TConfigJsonValue | undefined,
  current: TConfigJsonValue | undefined,
): string | undefined {
  const text = parseConfigString(value)
  if (
    text === undefined ||
    text === "" ||
    text === parseConfigString(current) ||
    CONFIG_REFERENCE_PATTERN.test(text)
  )
    return undefined
  return text
}

async function storeEnteredValues(
  values: TConfigJsonObject,
  current: TConfigJsonObject | undefined,
  keys: readonly string[],
): Promise<TConfigJsonObject> {
  const stored: TConfigJsonObject = { ...values }
  for (const key of keys) {
    const secret = enteredSecret(values[key], current?.[key])
    if (secret !== undefined) stored[key] = secretReference(await storeSecret(secret))
  }
  return stored
}

async function storeServerSecrets(
  server: TConfigJsonObject,
  current: TConfigJsonObject | undefined,
): Promise<TConfigJsonObject> {
  const stored: TConfigJsonObject = { ...server }
  for (const field of ["environment", "headers"]) {
    const values = parseConfigObject(server[field])
    if (values)
      stored[field] = await storeEnteredValues(
        values,
        parseConfigObject(current?.[field]),
        Object.keys(values),
      )
  }
  const oauth = parseConfigObject(server.oauth)
  if (oauth)
    stored.oauth = await storeEnteredValues(oauth, parseConfigObject(current?.oauth), [
      "clientSecret",
    ])
  return stored
}

export async function storeEnteredMcpSecrets<TCurrent>(
  next: TConfigJsonObject,
  current: TCurrent,
): Promise<TConfigJsonObject> {
  const servers = parseConfigObject(next.mcp)
  if (!servers) return next
  const currentServers = parseConfigObject(parseConfigObject(current)?.mcp)
  const mcp: TConfigJsonObject = {}
  for (const [name, entry] of Object.entries(servers)) {
    const server = parseConfigObject(entry)
    mcp[name] = server
      ? await storeServerSecrets(server, parseConfigObject(currentServers?.[name]))
      : entry
  }
  return { ...next, mcp }
}
