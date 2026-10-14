import fsp from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { Schema } from "effect"
import { Agent, Model, Provider, Mcp, Skill, ConfigProvider } from "@buddy/opencode-adapter/config"
import { Permission } from "@buddy/opencode-adapter/plugin"
import { permissionRulesFromConfig } from "@buddy/transcript-contract/permission-rules"
import { toSessionPermissionRules } from "@buddy/opencode-adapter/gateway/permission"
import { Config } from "../config"
import { buildOpenCodeConfigOverlay, fingerprintOpenCodeConfig } from "../opencode/overlay-builder"
import { loadManagedSkillFile } from "../../learning/skill-management/service/documents"
import { InvalidError } from "../contract/errors"
import { configuredProviderID } from "../opencode/models"
import { parseConfigObject, parseConfigString } from "../parse-values"
import { syncOpenCodeHostConfig } from "./opencode-host-config"

export type NotebookConfigDiagnostic = { path: string; message: string }
export type NotebookRuntimePlan = Awaited<ReturnType<typeof buildNotebookRuntimePlan>>

export function runtimeConfigFingerprint<T>(value: T): string {
  return createHash("sha256").update(fingerprintOpenCodeConfig({}, value)).digest("hex")
}

function configuredModel(value: string | undefined, variant?: string): Model.Ref | undefined {
  if (value === undefined) return undefined
  try {
    const ref = Model.Ref.parse(value)
    const selected = { ...ref, providerID: Provider.ID.make(configuredProviderID(ref.providerID)) }
    if (variant) selected.variant = Model.VariantID.make(variant)
    return selected
  } catch {
    throw new InvalidError({ path: "model", message: `Invalid model reference: ${value}` })
  }
}

function configuredPermissions(permission: Config.Permission) {
  const rules = toSessionPermissionRules(permissionRulesFromConfig(permission))
  return Schema.decodeUnknownSync(Permission.Ruleset)(rules.map((rule) => Object.assign({}, rule, {
    resource: ["read", "edit", "external_directory"].includes(rule.action) ? rule.resource.replaceAll("\\", "/") : rule.resource,
  })))
}

function normalizeProvider(sourceID: string, info: NonNullable<Config.Info["provider"]>[string]): ConfigProvider.Info {
  const { headers, body, ...settings } = info.options ?? {}
  const headerRecord = parseConfigObject(headers)
  const parsedHeaders = headerRecord && Object.fromEntries(Object.entries(headerRecord).flatMap(([key, value]) => {
    const text = parseConfigString(value)
    return text === undefined ? [] : [[key, text]]
  }))
  const models = Object.fromEntries(Object.entries(info.models ?? {}).map(([id, model]) => {
    const interleaved = model.interleaved
    const field = parseConfigString(interleaved) ?? (parseConfigObject(interleaved) && parseConfigString(parseConfigObject(interleaved)?.field))
    const cost = model.cost
    return [id, {
      modelID: model.id, name: model.name, family: model.family,
      package: model.provider?.npm ? `aisdk:${model.provider.npm}` : sourceID === "google-vertex-anthropic" ? `aisdk:${info.npm ?? "@ai-sdk/google-vertex/anthropic"}` : undefined,
      settings: model.provider?.api ? { ...model.options, baseURL: model.provider.api } : model.options,
      headers: model.headers, compatibility: field ? { reasoningField: field } : undefined,
      capabilities: { tools: model.tool_call, input: model.modalities?.input, output: model.modalities?.output },
      variants: model.variants && Object.entries(model.variants).filter(([, options]) => !options.disabled).map(([id, { disabled: _disabled, ...options }]) => ({ id, settings: options })),
      cost: cost && [
        { input: cost.input, output: cost.output, cache: { read: cost.cache_read, write: cost.cache_write } },
        ...(cost.context_over_200k ? [{ tier: { type: "context", size: 200_000 }, input: cost.context_over_200k.input,
          output: cost.context_over_200k.output, cache: { read: cost.context_over_200k.cache_read, write: cost.context_over_200k.cache_write } }] : []),
      ],
      disabled: model.status === "deprecated" ? true : undefined,
      limit: model.limit && { context: Math.trunc(model.limit.context), input: model.limit.input === undefined ? undefined : Math.trunc(model.limit.input), output: Math.trunc(model.limit.output) },
    }]
  }))
  const azureBaseURL = sourceID === "azure-cognitive-services" && info.npm === "@ai-sdk/openai-compatible" && !info.api
    ? "https://${AZURE_COGNITIVE_SERVICES_RESOURCE_NAME}.cognitiveservices.azure.com/openai" : undefined
  return Schema.decodeUnknownSync(Schema.fromJsonString(ConfigProvider.Info))(JSON.stringify({ name: info.name,
    env: sourceID === "azure-cognitive-services" ? info.env?.filter((name) => name !== "AZURE_COGNITIVE_SERVICES_RESOURCE_NAME") : info.env,
    package: sourceID !== "google-vertex-anthropic" && info.npm ? `aisdk:${info.npm}` : undefined,
    settings: info.api || azureBaseURL ? { ...settings, baseURL: info.api ?? azureBaseURL } : settings,
    headers: parsedHeaders, body: parseConfigObject(body), models,
  }))
}

async function readSkillCatalog(roots: readonly string[]): Promise<Skill.Info[]> {
  const skills = new Map<string, Skill.Info>()
  async function scan(directory: string) {
    const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
      const filepath = path.join(directory, entry.name)
      if (entry.isDirectory()) { await scan(filepath); continue }
      if (!entry.isFile() || entry.name !== "SKILL.md") continue
      const document = await loadManagedSkillFile(filepath)
      if (!document) continue
      const skill = Schema.decodeUnknownSync(Skill.Info)({ id: document.name, name: document.name,
        path: filepath, description: document.description, content: document.content,
      })
      skills.set(skill.id, skill)
    }
  }
  for (const root of roots) await scan(root)
  return [...skills.values()]
}

export async function buildNotebookRuntimePlan(input: { config: Config.Info; directory: string }) {
  const overlay = await buildOpenCodeConfigOverlay(input)
  const diagnostics: NotebookConfigDiagnostic[] = []
  const agents = Object.entries(overlay.agent).map(([id, agent]) => ({ id, agent,
    name: agent.name === undefined ? undefined : Agent.Name.make(agent.name),
    model: configuredModel(agent.model ?? (agent.variant ? input.config.model : undefined), agent.variant), permissions: configuredPermissions(agent.permission ?? {}),
  }))
  const mcp = Object.entries(input.config.mcp ?? {}).flatMap(([name, server]) => {
    if (!("type" in server)) {
      if (server.enabled) throw new InvalidError({ path: `mcp.${name}`, message: "Enabled MCP server needs a local command or remote URL" })
      return []
    }
    const { enabled, timeout, ...definition } = server
    const oauth = server.type === "remote" ? server.oauth : undefined
    const mapped = { ...definition, disabled: enabled === undefined ? undefined : !enabled,
      timeout: timeout === undefined ? undefined : { catalog: timeout, execution: timeout } }
    if (server.type === "remote") Object.assign(mapped, { oauth: oauth === false ? false : oauth && {
      client_id: oauth.clientId, client_secret: oauth.clientSecret, scope: oauth.scope,
      callback_port: oauth.callbackPort, redirect_uri: oauth.redirectUri,
    } })
    const config = Schema.decodeUnknownSync(Schema.fromJsonString(Mcp.ServerConfig))(JSON.stringify(mapped))
    return [{ name, config }]
  })
  const providers = Object.entries(input.config.provider ?? {}).map(([id, legacy]) => ({
    id: Provider.ID.make(configuredProviderID(id)), config: normalizeProvider(id, legacy), whitelist: legacy.whitelist, blacklist: legacy.blacklist,
    disabledVariants: Object.fromEntries(Object.entries(legacy.models ?? {}).map(([modelID, model]) => [modelID,
      Object.entries(model.variants ?? {}).filter(([, variant]) => variant.disabled).map(([variantID]) => variantID),
    ])),
  }))
  const skills = await readSkillCatalog(overlay.skills?.paths ?? [])
  if (input.config.compaction) {
    for (const key of Object.keys(input.config.compaction)) diagnostics.push({ path: `compaction.${key}`,
      message: key === "prune" || key === "tail_turns" ? "OpenCode v2 does not support this compaction setting" : "OpenCode v2 supports this setting only in host config; notebook-specific policy has no public plugin editor",
    })
  }
  return {
    agents, permissions: configuredPermissions(overlay.permission), defaultAgent: overlay.default_agent,
    model: configuredModel(input.config.model), titleModel: configuredModel(input.config.small_model),
    mcp, providers, skills, commands: overlay.command,
    enabledProviders: input.config.enabled_providers?.map(configuredProviderID), disabledProviders: input.config.disabled_providers?.map(configuredProviderID),
    diagnostics,
  }
}

export async function readOpenCodeHostConfig(): Promise<{ file: string }> {
  return { file: await syncOpenCodeHostConfig() }
}
