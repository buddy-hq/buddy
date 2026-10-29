import { Schema } from "effect"
import path from "node:path"
import fs from "node:fs"
import { createHash } from "node:crypto"
import { mergeDeep } from "remeda"
import z from "zod"
import type { ModelSelection } from "@buddy/agent-runtime/common"
import type { NotebookPlan } from "@buddy/agent-runtime/notebook-plan"
import { toSessionPermissionRules, type PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { ConfigProvider } from "@opencode/schema/config/provider"
import { Mcp } from "@opencode/schema/mcp"
import { Skill } from "@opencode/schema/skill"
import { Permission } from "@opencode/schema/permission"
import { Path as OpenCodeGlobalPath } from "@opencode/util/global"
import type { Context as PluginContext } from "@opencode/plugin/promise/plugin"
import type { Registration } from "@opencode/plugin/promise/registration"
import type { SkillEditor } from "@opencode/plugin/promise/skill"

function canonicalizeRuntimeConfigDirectory(directory: string): string {
  const canonical = fs.realpathSync.native(path.resolve(directory))
  return process.platform === "win32" ? canonical.toLowerCase() : canonical
}

function canonicalizeExistingRuntimeConfigDirectory(directory: string): string | undefined {
  try {
    return canonicalizeRuntimeConfigDirectory(directory)
  } catch (error) {
    const code = z.object({ code: z.string() }).safeParse(error).data?.code
    if (code === "ENOENT" || code === "ENOTDIR") return undefined
    throw error
  }
}

function stableSerialize<T>(value: T): string {
  if (value === null) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`
  if (value instanceof Object) {
    return `{${Object.entries(value).map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function runtimeConfigFingerprint<T>(value: T): string {
  return createHash("sha256").update(stableSerialize({ config: {}, overlay: value })).digest("hex")
}

function decodeModel(model: ModelSelection | undefined): Model.Ref | undefined {
  if (!model) return undefined
  const ref = { providerID: Provider.ID.make(model.providerID), id: Model.ID.make(model.modelID) }
  return model.variant === undefined ? Model.Ref.make(ref) : Model.Ref.make({ ...ref, variant: Model.VariantID.make(model.variant) })
}

const pathPermissionActions = new Set(["read", "edit", "external_directory"])
const homeResourcePrefixes = ["~/", "~\\", "$HOME/", "$HOME\\"]

function expandPermissionHome(resource: string, home: string): string {
  if (resource === "~" || resource === "$HOME") return home
  const prefix = homeResourcePrefixes.find((candidate) => resource.startsWith(candidate))
  if (prefix === undefined) return resource
  return (path.posix.isAbsolute(home) ? path.posix : path.win32).join(home, resource.slice(prefix.length))
}

export function decodePermissions(permissions: PermissionRuleset, home = OpenCodeGlobalPath.home): Permission.Ruleset {
  const rules = toSessionPermissionRules(permissions)
  return Schema.decodeUnknownSync(Permission.Ruleset)(rules.flatMap((input) => {
    const rule = Object.assign({}, input, { resource: pathPermissionActions.has(input.action) ? expandPermissionHome(input.resource, home).replaceAll("\\", "/") : input.resource })
    if (rule.action !== "read") return [rule]
    if (["*", "mcp:*", "mcp:*:*"].includes(rule.resource)) return [
      rule,
      { action: "opencode_list_mcp_resources", resource: "*", effect: rule.effect },
      { action: "opencode_read_mcp_resource", resource: "*", effect: rule.effect },
    ]
    const match = /^mcp:([^*:]+):(.*)$/.exec(rule.resource)
    const server = match?.[1]
    const resource = match?.[2]
    if (server === undefined || resource === undefined) return [rule]
    const read = { action: "opencode_read_mcp_resource", resource: `${server}:${resource}`, effect: rule.effect }
    if (resource !== "*") return [rule, read]
    return [rule, { action: "opencode_list_mcp_resources", resource: server, effect: rule.effect }, read]
  }))
}

export function toLocationRelativeRules(rules: Permission.Ruleset, location: { directory: string; projectDirectory: string }): Permission.Ruleset {
  const { directory, projectDirectory } = location
  if (path.parse(projectDirectory).root === projectDirectory || projectDirectory === directory) return rules
  const relative = path.relative(projectDirectory, directory)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return rules
  return rules.map((rule) => {
    if (!["read", "edit"].includes(rule.action) || path.isAbsolute(rule.resource) || rule.resource.startsWith("*")) return rule
    return { ...rule, resource: path.relative(directory, path.join(projectDirectory, rule.resource)).replaceAll("\\", "/") || "." }
  })
}

function decodeNotebookPlan(plan: NotebookPlan) {
  return {
    ...plan,
    agents: plan.agents.map((agent) => ({ id: agent.id, agent: { ...agent, options: agent.options && { ...agent.options }, top_p: agent.topP },
      name: agent.name === undefined ? undefined : Agent.Name.make(agent.name),
      model: decodeModel(agent.model), permissions: decodePermissions(agent.permissions),
    })),
    permissions: decodePermissions(plan.permissions), model: decodeModel(plan.model), titleModel: decodeModel(plan.titleModel),
    providers: plan.providers.map((provider) => ({
      id: Provider.ID.make(provider.id), whitelist: provider.whitelist, blacklist: provider.blacklist,
      disabledVariants: Object.fromEntries(Object.entries(provider.models).map(([id, model]) => [id, model.disabledVariants ?? []])),
      config: Schema.decodeUnknownSync(Schema.fromJsonString(ConfigProvider.Info))(JSON.stringify({
        name: provider.name, env: provider.env, package: provider.npm ? `aisdk:${provider.npm}` : undefined,
        settings: provider.options, headers: provider.headers, body: provider.body,
        models: Object.fromEntries(Object.entries(provider.models).map(([id, model]) => [id, {
          modelID: model.modelID, name: model.name, family: model.family,
          package: model.npm === undefined ? undefined : `aisdk:${model.npm}`, settings: model.options, headers: model.headers,
          compatibility: model.reasoningField ? { reasoningField: model.reasoningField } : undefined,
          capabilities: model.capabilities, variants: model.variants,
          cost: model.costs?.map((cost) => ({
            tier: cost.fromContextTokens === undefined ? undefined : { type: "context", size: cost.fromContextTokens },
            input: cost.input, output: cost.output, cache: { read: cost.cacheRead, write: cost.cacheWrite },
          })),
          disabled: model.deprecated, limit: model.limit,
        }])),
      })),
    })),
    mcp: plan.mcp.map((server) => {
      const { name, timeout, ...definition } = server
      const oauth = server.type === "remote" ? server.oauth : undefined
      const mapped = { ...definition, timeout: timeout === undefined ? undefined : { catalog: timeout, execution: timeout } }
      if (server.type === "remote") Object.assign(mapped, { oauth: oauth === false ? false : oauth && {
        client_id: oauth.clientId, client_secret: oauth.clientSecret, scope: oauth.scope,
        callback_port: oauth.callbackPort, redirect_uri: oauth.redirectUri,
      } })
      return { name, config: Schema.decodeUnknownSync(Schema.fromJsonString(Mcp.ServerConfig))(JSON.stringify(mapped)) }
    }),
    skills: plan.skills.map((skill) => Schema.decodeUnknownSync(Skill.Info)(skill)),
  }
}

const HIDDEN_OPENCODE_SKILLS = [
  { id: "opencode", path: "/builtin/opencode.md" },
  { id: "report", path: "/builtin/report.md" },
] as const
export function isSuppressedOpenCodeSkill(skill: { id: string; path: string }): boolean {
  return HIDDEN_OPENCODE_SKILLS.some((hiddenSkill) => hiddenSkill.id === skill.id && hiddenSkill.path === skill.path)
}
export function removeSuppressedOpenCodeSkills(editor: SkillEditor) {
  for (const skill of editor.list()) {
    if (isSuppressedOpenCodeSkill({ id: String(skill.id), path: String(skill.path) })) editor.remove(String(skill.id))
  }
}
export function isInsideSkillRoot(skillPath: string, roots: readonly string[]): boolean {
  return roots.some((root) => {
    const relative = path.relative(root, skillPath)
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  })
}
export const NOTEBOOK_CONFIG_RPC = {
  id: "buddy.notebook-config",
  methods: {
    sync: { input: z.object({ revision: z.string(), force: z.boolean().optional() }),
      output: z.object({ revision: z.string(), diagnostics: z.array(z.object({ path: z.string(), message: z.string() })) }),
      errors: { unavailable: z.object({ directory: z.string() }) },
    },
    ready: { input: z.object({}), output: z.object({ revision: z.string() }) },
  },
  events: {},
}

type NotebookRuntimeSnapshot = { plan: NotebookPlan; revision: string }
type NotebookDomainFingerprints = { provider?: string; model?: string; agent?: string; skill?: string; command?: string; mcp?: string }
type NotebookController = { location: PluginContext["location"]; preparing: boolean; sync: (revision: string, force?: boolean) => Promise<void> }
const snapshots = new Map<string, NotebookRuntimeSnapshot>()
const controllers = new Map<string, Set<NotebookController>>()

function publishNotebookRuntimeSnapshot(directory: string, plan: NotebookPlan): NotebookRuntimeSnapshot {
  decodeNotebookPlan(plan)
  const snapshot = { plan, revision: runtimeConfigFingerprint(plan) }
  snapshots.set(canonicalizeRuntimeConfigDirectory(directory), snapshot)
  return snapshot
}

function activeNotebookConfigLocations() {
  return [...controllers.entries()].flatMap(([directory, active]) => {
    if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return []
    return [...active].filter((controller) => !controller.preparing).map((controller) => ({ directory, location: controller.location, sync: controller.sync }))
  })
}
export async function registerNotebookConfig(ctx: PluginContext, notebookPlan: (directory: string) => Promise<NotebookPlan>): Promise<() => Promise<void>> {
  const directory = canonicalizeExistingRuntimeConfigDirectory(ctx.location.directory)
  if (directory === undefined) {
    console.warn(`[buddy] skipped notebook config for missing location ${ctx.location.directory}`)
    return async () => undefined
  }
  const controller: NotebookController = { location: ctx.location, preparing: true, sync: async (revision, force) => { await ctx.rpc(NOTEBOOK_CONFIG_RPC).sync({ revision, force }) } }
  const active = controllers.get(directory) ?? new Set<NotebookController>()
  active.add(controller)
  controllers.set(directory, active)
  const abort = new AbortController()
  let events: Promise<void> | undefined
  try {
    const prepared = snapshots.get(directory) ?? publishNotebookRuntimeSnapshot(directory, await notebookPlan(directory))
    controller.preparing = false
    let snapshot = { ...prepared, plan: decodeNotebookPlan(prepared.plan) }
    let applied: NotebookDomainFingerprints | undefined = {}
    let staleOrder = true
    let orderGeneration = 0
    let late: Registration[] = []
    const providerInputs = () => snapshot.plan.providers
    const integrationTransform: Parameters<PluginContext["integration"]["transform"]>[0] = (editor) => {
      for (const { id, config } of providerInputs()) {
        if (!editor.get(id)) editor.method.update({ integrationID: id, method: { type: "key", label: "Manually enter API Key" } })
        if (config.name !== undefined) editor.update(id, (integration) => { integration.name = config.name ?? integration.name })
        if (config.env !== undefined) editor.method.update({ integrationID: id, method: { type: "env", names: config.env } })
      }
    }
    const providerAliases = new Map<string, Set<string>>()
    const providerTransform = (seed: boolean): Parameters<PluginContext["provider"]["transform"]>[0] => (editor) => {
      for (const { id, config } of providerInputs()) {
        if (!seed && !editor.get(id)) continue
        editor.update(id, (provider) => {
          provider.activation = "enabled"
          provider.integrationID ??= Schema.decodeUnknownSync(Provider.Info)({ ...provider, integrationID: id }).integrationID
          if (config.name !== undefined) provider.name = config.name
          if (config.package !== undefined) provider.package = config.package
          if (!provider.package) provider.package = "aisdk:@ai-sdk/openai-compatible"
          if (config.settings !== undefined) provider.settings = mergeDeep(provider.settings ?? {}, config.settings)
          if (config.headers !== undefined) provider.headers = { ...provider.headers, ...config.headers }
          if (config.body !== undefined) provider.body = mergeDeep(provider.body ?? {}, config.body)
        })
        const source = editor.get(id)?.models
        const aliases = providerAliases.get(id) ?? new Set<string>()
        if (seed) aliases.clear()
        for (const [modelID, configModel] of Object.entries(config.models ?? {})) {
          if (configModel.modelID !== undefined && configModel.modelID !== modelID && !source?.has(modelID)) aliases.add(modelID)
        }
        providerAliases.set(id, aliases)
        for (const idModel of Object.keys(config.models ?? {})) editor.models.update(id, idModel, () => undefined)
      }
      if (seed) return
      for (const { provider } of editor.list()) {
        if ((snapshot.plan.enabledProviders !== undefined && !snapshot.plan.enabledProviders.includes(provider.id)) || snapshot.plan.disabledProviders?.includes(provider.id)) editor.remove(provider.id)
      }
    }
    const mcpTransform: Parameters<PluginContext["mcp"]["transform"]>[0] = (editor) => {
      for (const [name] of editor.list()) editor.remove(name)
      for (const { name, config } of snapshot.plan.mcp) editor.set(name, config)
    }
    await ctx.integration.transform(integrationTransform)
    await ctx.provider.transform(providerTransform(true))
    await ctx.mcp.transform(mcpTransform)

    async function installLateTransforms() {
      for (const registration of late) await registration.dispose()
      late = []
      late.push(await ctx.integration.transform(integrationTransform))
      late.push(await ctx.provider.transform(providerTransform(false)))
      late.push(await ctx.model.transform((editor) => {
        for (const { id, config, whitelist, blacklist, disabledVariants } of providerInputs()) {
          const models = Object.entries(config.models ?? {}).toSorted(([leftID, left], [rightID, right]) =>
            Number(left.modelID !== undefined && left.modelID !== leftID) - Number(right.modelID !== undefined && right.modelID !== rightID),
          )
          for (const [modelID, configModel] of models) {
            const target = configModel.modelID !== undefined && providerAliases.get(id)?.has(modelID) ? editor.get(id, configModel.modelID) : undefined
            editor.update(id, modelID, (model) => {
              if (target) {
                const { id: aliasID, providerID } = model
                Object.assign(model, structuredClone(target))
                model.id = aliasID
                model.providerID = providerID
                model.name = modelID
              }
              if (configModel.name !== undefined) model.name = configModel.name
              if (configModel.modelID !== undefined) model.modelID = configModel.modelID
              if (configModel.family !== undefined) model.family = configModel.family
              if (configModel.package !== undefined) model.package = configModel.package
              if (configModel.settings !== undefined) model.settings = mergeDeep(model.settings ?? {}, configModel.settings)
              if (configModel.headers !== undefined) model.headers = { ...model.headers, ...configModel.headers }
              if (configModel.body !== undefined) model.body = mergeDeep(model.body ?? {}, configModel.body)
              if (configModel.compatibility !== undefined) model.compatibility = { ...model.compatibility, ...configModel.compatibility }
              if (configModel.capabilities !== undefined) model.capabilities = { ...model.capabilities, ...Object.fromEntries(Object.entries(configModel.capabilities).filter(([, value]) => value !== undefined)) }
              if (configModel.limit !== undefined) model.limit = { ...model.limit, ...Object.fromEntries(Object.entries(configModel.limit).filter(([, value]) => value !== undefined)) }
              if (configModel.disabled !== undefined) model.enabled = !configModel.disabled
              for (const variant of configModel.variants ?? []) {
                model.variants ??= []
                let current = model.variants.find((item) => String(item.id) === variant.id)
                if (!current) { current = { id: variant.id }; model.variants.push(current) }
                if (variant.settings !== undefined) current.settings = mergeDeep(current.settings ?? {}, variant.settings)
                if (variant.headers !== undefined) current.headers = { ...current.headers, ...variant.headers }
                if (variant.body !== undefined) current.body = mergeDeep(current.body ?? {}, variant.body)
              }
              if (model.variants) model.variants = model.variants.filter((variant) => !disabledVariants[modelID]?.includes(String(variant.id)))
              if (configModel.cost !== undefined) model.cost = (Array.isArray(configModel.cost) ? configModel.cost : [configModel.cost]).map((cost) => Schema.decodeUnknownSync(Model.Cost)({ ...cost, cache: { read: cost.cache?.read ?? 0, write: cost.cache?.write ?? 0 } }))
            })
          }
          for (const model of editor.list(id)) if ((whitelist !== undefined && !whitelist.includes(String(model.id))) || blacklist?.includes(String(model.id))) editor.remove(id, String(model.id))
        }
        const selected = snapshot.plan.model
        if (selected) editor.default.set(selected.providerID, selected.id)
      }))
      late.push(await ctx.agent.transform((editor) => {
        const location = { directory: ctx.location.directory, projectDirectory: ctx.location.project.directory }
        for (const { id, agent, name, model, permissions } of snapshot.plan.agents) {
          if (agent.disable) { editor.remove(id); continue }
          editor.update(id, (current) => {
            if (name !== undefined) current.name = name
            if (model !== undefined) current.model = model
            if (agent.prompt !== undefined) current.system = agent.prompt
            if (agent.description !== undefined) current.description = agent.description
            if (agent.mode !== undefined) current.mode = agent.mode
            if (agent.hidden !== undefined) current.hidden = agent.hidden
            if (agent.color !== undefined) current.color = agent.color
            if (agent.steps !== undefined) current.steps = agent.steps
            const body = mergeDeep(current.request.body, agent.options ?? {})
            if (agent.temperature !== undefined) body.temperature = agent.temperature
            if (agent.top_p !== undefined) body.top_p = agent.top_p
            current.request.body = body
            current.permissions.push(...toLocationRelativeRules(permissions, location))
          })
        }
        const configuredTitle = snapshot.plan.agents.find((agent) => agent.id === "title")
        if (snapshot.plan.titleModel && !configuredTitle?.agent.disable && !configuredTitle?.model) editor.update("title", (agent) => { agent.model = snapshot.plan.titleModel })
        const permissions = toLocationRelativeRules(snapshot.plan.permissions, location).flatMap((rule) => {
          if (!["read", "edit"].includes(rule.action) || !path.isAbsolute(rule.resource)) return [rule]
          return [rule, { ...rule, resource: path.relative(ctx.location.directory, rule.resource).replaceAll("\\", "/") || "." }]
        })
        for (const agent of editor.list()) agent.permissions.splice(agent.permissions.length - (snapshot.plan.agents.find((item) => item.id === String(agent.id))?.permissions.length ?? 0), 0, ...permissions)
        if (snapshot.plan.defaultAgent) editor.default(snapshot.plan.defaultAgent)
      }))
      late.push(await ctx.skill.transform((editor) => {
        removeSuppressedOpenCodeSkills(editor)
        for (const skill of editor.list()) {
          let skillPath: string
          try { skillPath = fs.realpathSync.native(String(skill.path)) } catch { skillPath = String(skill.path) }
          if (isInsideSkillRoot(skillPath, snapshot.plan.excludedSkillRoots)) editor.remove(String(skill.id))
        }
        for (const skill of snapshot.plan.skills) {
          for (const existing of editor.list()) if (existing.name === skill.name) editor.remove(String(existing.id))
          editor.add(skill)
        }
      }))
      late.push(await ctx.command.transform((editor) => {
        for (const [name, command] of Object.entries(snapshot.plan.commands)) editor.add({ name, description: command.description,
          execute: async (input) => {
            await ctx.session.prompt({ ...input.prompt, sessionID: input.sessionID, delivery: input.delivery,
              text: command.template.replaceAll("$ARGUMENTS", input.prompt.text ?? ""),
            })
          },
        })
      }))
      late.push(await ctx.mcp.transform(mcpTransform))
    }

    await installLateTransforms()
    let synchronization = Promise.resolve()
    let lastSync: { result: z.output<typeof NOTEBOOK_CONFIG_RPC.methods.sync.output>; forced: boolean; orderGeneration: number } | undefined
    await ctx.rpc.register(NOTEBOOK_CONFIG_RPC, {
      async ready() {
        await synchronization
        return { revision: snapshot.revision }
      },
      async sync(input, rpc) {
        const previous = synchronization
        const gate = Promise.withResolvers<void>()
        synchronization = gate.promise
        await previous
        let applicationStarted = false
        try {
          if (lastSync?.result.revision === input.revision
            && snapshot.revision === input.revision
            && lastSync.orderGeneration === orderGeneration
            && (!input.force || lastSync.forced)) return lastSync.result
          lastSync = undefined
          const generation = orderGeneration
          const next = snapshots.get(directory)
          if (!next || next.revision !== input.revision) return rpc.error("unavailable", "Notebook config revision is unavailable", { directory })
          applicationStarted = true
          snapshot = { ...next, plan: decodeNotebookPlan(next.plan) }
          const fingerprints = {
            provider: runtimeConfigFingerprint([next.plan.providers, next.plan.enabledProviders, next.plan.disabledProviders]),
            model: runtimeConfigFingerprint(next.plan.model),
            agent: runtimeConfigFingerprint([next.plan.agents, next.plan.permissions, next.plan.defaultAgent, next.plan.titleModel]),
            skill: runtimeConfigFingerprint(next.plan.skills), command: runtimeConfigFingerprint(next.plan.commands), mcp: runtimeConfigFingerprint(next.plan.mcp),
          }
          if (staleOrder) {
            await installLateTransforms()
            staleOrder = generation !== orderGeneration
          } else {
            if (input.force || applied?.provider !== fingerprints.provider) {
              await ctx.integration.reload()
              await ctx.provider.reload()
              await ctx.model.reload()
            } else if (applied?.model !== fingerprints.model) await ctx.model.reload()
            if (input.force || applied?.agent !== fingerprints.agent) await ctx.agent.reload()
            if (input.force || applied?.skill !== fingerprints.skill) await ctx.skill.reload()
            if (input.force || applied?.command !== fingerprints.command) await ctx.command.reload()
            if (input.force || applied?.mcp !== fingerprints.mcp) await ctx.mcp.reload()
          }
          if (input.force || applied === undefined) await ctx.reference.reload()
          applied = fingerprints
          const result = { revision: next.revision, diagnostics: [...next.plan.diagnostics] }
          lastSync = { result, forced: input.force ?? false, orderGeneration: generation }
          return result
        } catch (cause) {
          if (applicationStarted) {
            applied = undefined
            lastSync = undefined
          }
          throw cause
        } finally { gate.resolve() }
      },
    })
    events = (async () => {
      for await (const event of ctx.event.subscribe({ signal: abort.signal })) if (event.type === "plugin.updated") {
        orderGeneration++
        staleOrder = true
      }
    })().catch((cause) => { if (!abort.signal.aborted) console.error("Notebook config subscription failed", cause) })
    return async () => {
      abort.abort()
      await events
      active.delete(controller)
      if (active.size === 0) { controllers.delete(directory); snapshots.delete(directory) }
    }
  } catch (cause) {
    abort.abort()
    await events
    active.delete(controller)
    if (active.size === 0) controllers.delete(directory)
    throw cause
  }
}
export function publishNotebookPlan(directory: string, plan: NotebookPlan): string {
  return publishNotebookRuntimeSnapshot(directory, plan).revision
}
export function activeNotebookDirectories(): string[] {
  return [...new Set(activeNotebookConfigLocations().map((entry) => entry.directory))]
}
export async function syncActiveNotebookLocations(directory: string, revision: string, options: { force?: boolean } = {}): Promise<void> {
  for (const location of activeNotebookConfigLocations().filter((entry) => entry.directory === directory)) {
    await location.sync(revision, options.force)
  }
}
