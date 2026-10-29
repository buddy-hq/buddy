import fsp from "node:fs/promises"
import path from "node:path"
import z from "zod"
import type { ModelSelection } from "@buddy/agent-runtime/common"
import type {
  NotebookDiagnostic,
  NotebookPlan,
  PlanProvider,
} from "@buddy/agent-runtime/notebook-plan"
import type { SkillSummary } from "@buddy/agent-runtime/catalog"
import { permissionRulesFromConfig } from "@buddy/transcript-contract/permission-rules"
import { Config } from "../config"
import { buildOpenCodeConfigOverlay } from "../opencode/overlay-builder"
import { resolveVendorSkillRoots } from "../opencode/skills"
import { loadManagedSkillFile } from "../../learning/skill-management/service/documents"
import { InvalidError } from "../contract/errors"
import { configuredProviderID } from "../opencode/models"
import { parseConfigObject, parseConfigString } from "../parse-values"
import { syncOpenCodeHostConfig } from "./opencode-host-config"
import { configSecretIds } from "../secrets/mcp-secrets"

function configuredModel(value: string | undefined, variant?: string): ModelSelection | undefined {
  if (value === undefined) return undefined
  const providerEnd = value.indexOf("/")
  const providerID = value.slice(0, providerEnd)
  const variantStart = value.indexOf("#", providerEnd + 1)
  const modelID = value.slice(providerEnd + 1, variantStart === -1 ? undefined : variantStart)
  const parsedVariant = variantStart === -1 ? undefined : value.slice(variantStart + 1)
  if (
    providerEnd <= 0 ||
    !modelID ||
    providerID.includes("#") ||
    (parsedVariant !== undefined && (!parsedVariant || parsedVariant.includes("#")))
  ) {
    throw new InvalidError({ path: "model", message: `Invalid model reference: ${value}` })
  }
  return {
    providerID: configuredProviderID(providerID),
    modelID,
    variant: variant || parsedVariant,
  }
}

const jsonObject = z.record(z.string(), z.json())

function normalizeProvider(
  sourceID: string,
  info: NonNullable<Config.Info["provider"]>[string],
): PlanProvider {
  const { headers, body, ...settings } = info.options ?? {}
  const headerRecord = parseConfigObject(headers)
  const parsedHeaders =
    headerRecord &&
    Object.fromEntries(
      Object.entries(headerRecord).flatMap(([key, value]) => {
        const text = parseConfigString(value)
        return text === undefined ? [] : [[key, text]]
      }),
    )
  const models = Object.fromEntries(
    Object.entries(info.models ?? {}).map(([id, model]) => {
      const interleaved = model.interleaved
      const field =
        parseConfigString(interleaved) ??
        (parseConfigObject(interleaved) && parseConfigString(parseConfigObject(interleaved)?.field))
      const cost = model.cost
      return [
        id,
        {
          modelID: model.id,
          name: model.name,
          family: model.family,
          npm: model.provider?.npm
            ? model.provider.npm
            : sourceID === "google-vertex-anthropic"
              ? (info.npm ?? "@ai-sdk/google-vertex/anthropic")
              : undefined,
          options: model.provider?.api
            ? { ...model.options, baseURL: model.provider.api }
            : model.options,
          headers: model.headers,
          reasoningField: field || undefined,
          capabilities: {
            tools: model.tool_call,
            input: model.modalities?.input,
            output: model.modalities?.output,
          },
          variants:
            model.variants &&
            Object.entries(model.variants)
              .filter(([, options]) => !options.disabled)
              .map(([id, { disabled: _disabled, ...options }]) => ({ id, settings: options })),
          disabledVariants: Object.entries(model.variants ?? {})
            .filter(([, variant]) => variant.disabled)
            .map(([variantID]) => variantID),
          costs: cost && [
            {
              input: cost.input,
              output: cost.output,
              cacheRead: cost.cache_read,
              cacheWrite: cost.cache_write,
            },
            ...(cost.context_over_200k
              ? [
                  {
                    fromContextTokens: 200_000,
                    input: cost.context_over_200k.input,
                    output: cost.context_over_200k.output,
                    cacheRead: cost.context_over_200k.cache_read,
                    cacheWrite: cost.context_over_200k.cache_write,
                  },
                ]
              : []),
          ],
          deprecated: model.status === "deprecated" ? true : undefined,
          limit: model.limit && {
            context: Math.trunc(model.limit.context),
            input: model.limit.input === undefined ? undefined : Math.trunc(model.limit.input),
            output: Math.trunc(model.limit.output),
          },
        },
      ]
    }),
  )
  const azureBaseURL =
    sourceID === "azure-cognitive-services" && info.npm === "@ai-sdk/openai-compatible" && !info.api
      ? "https://${AZURE_COGNITIVE_SERVICES_RESOURCE_NAME}.cognitiveservices.azure.com/openai"
      : undefined
  const providerSettings =
    info.api || azureBaseURL ? { ...settings, baseURL: info.api ?? azureBaseURL } : settings
  const providerBody = parseConfigObject(body)
  return {
    id: configuredProviderID(sourceID),
    name: info.name,
    env:
      sourceID === "azure-cognitive-services"
        ? info.env?.filter((name) => name !== "AZURE_COGNITIVE_SERVICES_RESOURCE_NAME")
        : info.env,
    npm: sourceID !== "google-vertex-anthropic" && info.npm ? info.npm : undefined,
    options: jsonObject.parse(
      Object.fromEntries(
        Object.entries(providerSettings).filter(([, value]) => value !== undefined),
      ),
    ),
    headers: parsedHeaders,
    body: providerBody && jsonObject.parse(providerBody),
    models,
    whitelist: info.whitelist,
    blacklist: info.blacklist,
  }
}

export async function readSkillCatalog(
  roots: readonly string[],
  diagnostics: NotebookDiagnostic[],
): Promise<SkillSummary[]> {
  const skills = new Map<string, SkillSummary>()
  const scannedDirectories = new Set<string>()
  async function scan(directory: string) {
    const realpath = await fsp.realpath(directory).catch(() => undefined)
    if (realpath === undefined || scannedDirectories.has(realpath)) return
    scannedDirectories.add(realpath)
    const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
      const filepath = path.join(directory, entry.name)
      const target = entry.isSymbolicLink()
        ? await fsp.stat(filepath).catch(() => undefined)
        : entry
      if (target?.isDirectory()) {
        await scan(filepath)
        continue
      }
      if (!target?.isFile() || entry.name !== "SKILL.md") continue
      try {
        const document = await loadManagedSkillFile(filepath)
        if (!document) continue
        const skill = {
          id: document.name,
          name: document.name,
          path: filepath,
          description: document.description,
          content: document.content,
        }
        skills.set(skill.id, skill)
      } catch (error) {
        const firstLine = (error instanceof Error ? error.message : String(error)).split(
          /\r?\n/,
          1,
        )[0]
        diagnostics.push({
          path: filepath,
          message: `Skipped skill: its frontmatter is not valid YAML (${firstLine})`,
        })
      }
    }
  }
  for (const root of roots) await scan(root)
  return [...skills.values()]
}
export async function buildNotebookRuntimePlan(input: {
  config: Config.Info
  directory: string
}): Promise<NotebookPlan> {
  const overlay = await buildOpenCodeConfigOverlay(input)
  const diagnostics: NotebookDiagnostic[] = []
  const agents = Object.entries(overlay.agent).map(([id, agent]) => ({
    id,
    disable: agent.disable,
    name: agent.name,
    model: configuredModel(
      agent.model ?? (agent.variant ? input.config.model : undefined),
      agent.variant,
    ),
    prompt: agent.prompt,
    description: agent.description,
    mode: agent.mode,
    hidden: agent.hidden,
    color: agent.color,
    steps: agent.steps,
    options: agent.options,
    temperature: agent.temperature,
    topP: agent.top_p,
    permissions: permissionRulesFromConfig(agent.permission ?? {}),
  }))
  const mcp = Object.entries(input.config.mcp ?? {}).flatMap(([name, server]) => {
    if (configSecretIds(server).size > 0) return []
    if (!("type" in server)) {
      if (server.enabled)
        throw new InvalidError({
          path: `mcp.${name}`,
          message: "Enabled MCP server needs a local command or remote URL",
        })
      return []
    }
    const { enabled, ...definition } = server
    return [{ name, ...definition, disabled: enabled === undefined ? undefined : !enabled }]
  })
  const providers = Object.entries(input.config.provider ?? {}).map(([id, legacy]) =>
    normalizeProvider(id, legacy),
  )
  const skills = await readSkillCatalog(overlay.skills?.paths ?? [], diagnostics)
  const excludedSkillRoots =
    input.config.skills_external_vendor_roots_enabled === true
      ? []
      : (
          await Promise.all(
            (
              await resolveVendorSkillRoots(input.directory)
            ).map((root) => fsp.realpath(root).catch(() => undefined)),
          )
        ).filter((root) => root !== undefined)
  if (input.config.compaction) {
    for (const key of Object.keys(input.config.compaction))
      diagnostics.push({
        path: `compaction.${key}`,
        message:
          key === "prune" || key === "tail_turns"
            ? "OpenCode v2 does not support this compaction setting"
            : "OpenCode v2 supports this setting only in host config; notebook-specific policy has no public plugin editor",
      })
  }
  return {
    agents,
    permissions: permissionRulesFromConfig(overlay.permission),
    defaultAgent: overlay.default_agent,
    model: configuredModel(input.config.model),
    titleModel: configuredModel(input.config.small_model),
    mcp,
    providers,
    skills,
    excludedSkillRoots,
    commands: overlay.command,
    enabledProviders: input.config.enabled_providers?.map(configuredProviderID),
    disabledProviders: input.config.disabled_providers?.map(configuredProviderID),
    diagnostics,
  }
}
export async function readOpenCodeHostConfig(): Promise<{ file: string }> {
  return { file: await syncOpenCodeHostConfig() }
}
