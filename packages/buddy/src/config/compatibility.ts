import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { mergeDeep } from "remeda"
import { setConfigOverlay } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { BUDDY_AGENT_OVERLAY } from "../agent/overlay.js"
import { Config, InvalidError, JsonError } from "./config.js"

type BuddyConfig = Awaited<ReturnType<typeof Config.getProject>>

export type OpenCodeConfigOverlay = {
  permission: Config.Permission & {
    curriculum_read: "deny"
    curriculum_update: "deny"
    teaching_start_lesson: "deny"
    teaching_checkpoint: "deny"
    teaching_add_file: "deny"
    teaching_set_lesson: "deny"
    teaching_restore_checkpoint: "deny"
  }
  model?: BuddyConfig["model"]
  small_model?: BuddyConfig["small_model"]
  default_agent?: string
  disabled_providers?: BuddyConfig["disabled_providers"]
  enabled_providers?: BuddyConfig["enabled_providers"]
  provider?: BuddyConfig["provider"]
  skills?: {
    paths: string[]
  }
  mcp?: BuddyConfig["mcp"]
  agent: Record<string, Config.Agent>
}

const openCodeConfigFingerprint = new Map<string, string>()
const openCodeConfigSyncInFlight = new Map<string, Promise<void>>()

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`
}

async function resolveOpenCodeSkillPaths(config: BuddyConfig): Promise<string[] | undefined> {
  const paths = Array.isArray(config.skills?.paths)
    ? config.skills.paths.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : []
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex")
  const codexRoots = [
    path.join(codexHome, "skills"),
    path.join(codexHome, "skills", ".system"),
  ]

  for (const candidate of codexRoots) {
    const stats = await fs.stat(candidate).catch(() => undefined)
    if (!stats?.isDirectory()) continue
    if (paths.includes(candidate)) continue
    paths.push(candidate)
  }

  return paths.length > 0 ? paths : undefined
}

function mergeBuddyAgentConfig(base: Config.Agent, override: Config.Agent): Config.Agent {
  const merged: Config.Agent = {
    ...base,
    ...override,
  }

  merged.steps = override.steps ?? base.steps
  merged.maxSteps = override.maxSteps ?? base.maxSteps

  if (base.options || override.options) {
    merged.options = mergeDeep(base.options ?? {}, override.options ?? {})
  }

  if (base.permission || override.permission) {
    merged.permission = mergePermissionConfig(base.permission ?? {}, override.permission ?? {})
  }

  return merged
}

function permissionRuleEntries(rule: Config.PermissionRule): Array<[string, Config.PermissionAction]> {
  if (typeof rule === "string") {
    return [["*", rule]]
  }

  return Object.entries(rule)
}

function mergePermissionRule(base: Config.PermissionRule, override: Config.PermissionRule): Config.PermissionRule {
  const ordered = new Map<string, Config.PermissionAction>()

  for (const [pattern, action] of [...permissionRuleEntries(base), ...permissionRuleEntries(override)]) {
    if (ordered.has(pattern)) {
      ordered.delete(pattern)
    }
    ordered.set(pattern, action)
  }

  if (ordered.size === 1) {
    const wildcard = ordered.get("*")
    if (wildcard) {
      return wildcard
    }
  }

  return Object.fromEntries(ordered)
}

function mergePermissionConfig(base: Config.Permission, override: Config.Permission): Config.Permission {
  const merged: Config.Permission = { ...base }

  for (const [permission, rule] of Object.entries(override)) {
    const existing = merged[permission]
    merged[permission] = existing ? mergePermissionRule(existing, rule) : rule
  }

  return merged
}

export function isConfigValidationError(error: unknown): boolean {
  return error instanceof JsonError || error instanceof InvalidError
}

export function configErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return "Invalid config"
}

export function parseConfiguredModel(
  value: unknown,
): {
  providerID: string
  modelID: string
} | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const separator = trimmed.indexOf("/")
  if (separator <= 0 || separator >= trimmed.length - 1) return undefined

  return {
    providerID: trimmed.slice(0, separator),
    modelID: trimmed.slice(separator + 1),
  }
}

export function buildAgentOverlay(agentOverlay: Record<string, Config.Agent>): Record<string, Config.Agent> {
  const merged: Record<string, Config.Agent> = { ...BUDDY_AGENT_OVERLAY }

  for (const [name, agent] of Object.entries(agentOverlay)) {
    const baseAgent = merged[name]
    merged[name] = baseAgent ? mergeBuddyAgentConfig(baseAgent, agent) : agent
  }

  return merged
}

export function resolveConfiguredAgentKey(
  name: string,
  agentOverlay: Record<string, Config.Agent>,
): string {
  if (name in agentOverlay) {
    return name
  }

  const matches = Object.entries(agentOverlay)
    .filter(([, agent]) => agent.name === name)
    .map(([key]) => key)

  return matches.length === 1 ? matches[0]! : name
}

export async function readProjectConfig(directory: string): Promise<BuddyConfig> {
  return Config.getProject(directory)
}

export async function buildOpenCodeConfigOverlay(config: BuddyConfig): Promise<OpenCodeConfigOverlay> {
  const skillPaths = await resolveOpenCodeSkillPaths(config)
  const agentOverlay = buildAgentOverlay(config.agent ?? {})
  const defaultAgent =
    typeof config.default_agent === "string" && config.default_agent.trim().length > 0
      ? resolveConfiguredAgentKey(config.default_agent, agentOverlay)
      : undefined

  return {
    permission: {
      ...(config.permission ?? {}),
      curriculum_read: "deny" as const,
      curriculum_update: "deny" as const,
      teaching_start_lesson: "deny" as const,
      teaching_checkpoint: "deny" as const,
      teaching_add_file: "deny" as const,
      teaching_set_lesson: "deny" as const,
      teaching_restore_checkpoint: "deny" as const,
    },
    ...(config.model ? { model: config.model } : {}),
    ...(config.small_model ? { small_model: config.small_model } : {}),
    ...(defaultAgent ? { default_agent: defaultAgent } : {}),
    ...(config.disabled_providers ? { disabled_providers: config.disabled_providers } : {}),
    ...(config.enabled_providers ? { enabled_providers: config.enabled_providers } : {}),
    ...(config.provider ? { provider: config.provider } : {}),
    ...(skillPaths ? { skills: { paths: skillPaths } } : {}),
    ...(config.mcp ? { mcp: config.mcp } : {}),
    agent: {
      ...agentOverlay,
    },
  }
}

export async function syncOpenCodeProjectConfig(directory: string, force = false): Promise<void> {
  const existing = openCodeConfigSyncInFlight.get(directory)
  if (existing) return existing

  const task = (async () => {
    const config = await readProjectConfig(directory)
    const overlay = await buildOpenCodeConfigOverlay(config)
    setConfigOverlay(directory, overlay)
    const nextFingerprint = stableSerialize({
      config,
      overlay,
    })
    const previousFingerprint = openCodeConfigFingerprint.get(directory)
    if (!force && previousFingerprint === nextFingerprint) {
      return
    }

    // Dispose the OpenCode instance so it re-bootstraps fresh on next request.
    // We do NOT call PATCH /config on the vendored OpenCode because that triggers
    // Config.update which writes config.json to the project root (config pollution).
    await OpenCodeInstance.provide({
      directory,
      fn: async () => {
        await OpenCodeInstance.dispose()
      },
    })

    openCodeConfigFingerprint.set(directory, nextFingerprint)
  })().finally(() => {
    openCodeConfigSyncInFlight.delete(directory)
  })

  openCodeConfigSyncInFlight.set(directory, task)
  return task
}
