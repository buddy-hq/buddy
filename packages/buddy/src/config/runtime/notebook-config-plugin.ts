import { Schema } from "effect"
import path from "node:path"
import fs from "node:fs"
import { mergeDeep } from "remeda"
import z from "zod"
import { Model, Provider } from "@buddy/opencode-adapter/config"
import type { OpenCodeHost } from "@buddy/opencode-adapter/host"
import type { PluginContext, Registration } from "@buddy/opencode-adapter/plugin"
import { removeSuppressedOpenCodeSkills } from "../../opencode-runtime/hidden-opencode-skills"
import { canonicalizeExistingRuntimeConfigDirectory, canonicalizeRuntimeConfigDirectory } from "../store/directories"
import { buildNotebookRuntimePlan, runtimeConfigFingerprint, type NotebookRuntimePlan } from "./notebook-runtime-plan"
import { readProjectConfig } from "./project-config"

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

export type NotebookRuntimeSnapshot = { plan: NotebookRuntimePlan; revision: string }
type NotebookDomainFingerprints = { provider?: string; model?: string; agent?: string; skill?: string; command?: string; mcp?: string }
type NotebookController = { location: PluginContext["location"]; preparing: boolean; sync: (revision: string, force?: boolean) => Promise<void> }
const snapshots = new Map<string, NotebookRuntimeSnapshot>()
const controllers = new Map<string, Set<NotebookController>>()

export function publishNotebookRuntimeSnapshot(directory: string, plan: NotebookRuntimePlan): NotebookRuntimeSnapshot {
  const snapshot = { plan, revision: runtimeConfigFingerprint(plan) }
  snapshots.set(canonicalizeRuntimeConfigDirectory(directory), snapshot)
  return snapshot
}

export async function awaitNotebookRuntime(client: Pick<OpenCodeHost, "rpc">, directory: string): Promise<void> {
  await client.rpc.call({ rpcID: NOTEBOOK_CONFIG_RPC.id, method: "ready", input: {}, location: { directory } })
}

export function activeNotebookConfigLocations() {
  return [...controllers.entries()].flatMap(([directory, active]) => {
    if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return []
    return [...active].filter((controller) => !controller.preparing).map((controller) => ({ directory, location: controller.location, sync: controller.sync }))
  })
}

export async function registerNotebookConfig(ctx: PluginContext): Promise<() => Promise<void>> {
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
    const prepared = snapshots.get(directory) ?? publishNotebookRuntimeSnapshot(directory, await buildNotebookRuntimePlan({ config: await readProjectConfig(directory), directory }))
    controller.preparing = false
    let snapshot = prepared
    let applied: NotebookDomainFingerprints = {}
    let staleOrder = true
    let late: Registration[] = []
    const providerInputs = () => snapshot.plan.providers
    const integrationTransform: Parameters<PluginContext["integration"]["transform"]>[0] = (editor) => {
      for (const { id, config } of providerInputs()) {
        if (!editor.get(id)) editor.method.update({ integrationID: id, method: { type: "key", label: "Manually enter API Key" } })
        if (config.name !== undefined) editor.update(id, (integration) => { integration.name = config.name ?? integration.name })
        if (config.env !== undefined) editor.method.update({ integrationID: id, method: { type: "env", names: config.env } })
      }
    }
    const providerTransform = (seed: boolean): Parameters<PluginContext["provider"]["transform"]>[0] => (editor) => {
      for (const { id, config } of providerInputs()) {
        if (!seed && !editor.get(id)) continue
        editor.update(id, (provider) => {
          provider.activation = "enabled"
          provider.integrationID ??= Schema.decodeUnknownSync(Provider.Info)({ ...provider, integrationID: id }).integrationID
          if (config.name !== undefined) provider.name = config.name
          if (config.package !== undefined) provider.package = config.package
          if (config.settings !== undefined) provider.settings = mergeDeep(provider.settings ?? {}, config.settings)
          if (config.headers !== undefined) provider.headers = { ...provider.headers, ...config.headers }
          if (config.body !== undefined) provider.body = mergeDeep(provider.body ?? {}, config.body)
        })
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
          for (const [modelID, configModel] of Object.entries(config.models ?? {})) {
            editor.update(id, modelID, (model) => {
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
            current.permissions.push(...permissions)
          })
        }
        const configuredTitle = snapshot.plan.agents.find((agent) => agent.id === "title")
        if (snapshot.plan.titleModel && !configuredTitle?.agent.disable && !configuredTitle?.model) editor.update("title", (agent) => { agent.model = snapshot.plan.titleModel })
        const permissions = snapshot.plan.permissions.flatMap((rule) => {
          if (!["read", "edit"].includes(rule.action) || !path.isAbsolute(rule.resource)) return [rule]
          return [rule, { ...rule, resource: path.relative(ctx.location.directory, rule.resource).replaceAll("\\", "/") || "." }]
        })
        for (const agent of editor.list()) agent.permissions.splice(agent.permissions.length - (snapshot.plan.agents.find((item) => item.id === String(agent.id))?.permissions.length ?? 0), 0, ...permissions)
        if (snapshot.plan.defaultAgent) editor.default(snapshot.plan.defaultAgent)
      }))
      late.push(await ctx.skill.transform((editor) => {
        removeSuppressedOpenCodeSkills(editor)
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
        try {
          const next = snapshots.get(directory)
          if (!next || next.revision !== input.revision) return rpc.error("unavailable", "Notebook config revision is unavailable", { directory })
          snapshot = next
          const fingerprints = {
            provider: runtimeConfigFingerprint([next.plan.providers, next.plan.enabledProviders, next.plan.disabledProviders]),
            model: runtimeConfigFingerprint(next.plan.model),
            agent: runtimeConfigFingerprint([next.plan.agents, next.plan.permissions, next.plan.defaultAgent, next.plan.titleModel]),
            skill: runtimeConfigFingerprint(next.plan.skills), command: runtimeConfigFingerprint(next.plan.commands), mcp: runtimeConfigFingerprint(next.plan.mcp),
          }
          if (staleOrder) {
            await installLateTransforms()
            staleOrder = false
          } else {
            if (input.force || applied.provider !== fingerprints.provider) {
              await ctx.integration.reload()
              await ctx.provider.reload()
              await ctx.model.reload()
            } else if (applied.model !== fingerprints.model) await ctx.model.reload()
            if (input.force || applied.agent !== fingerprints.agent) await ctx.agent.reload()
            if (input.force || applied.skill !== fingerprints.skill) await ctx.skill.reload()
            if (input.force || applied.command !== fingerprints.command) await ctx.command.reload()
            if (input.force || applied.mcp !== fingerprints.mcp) await ctx.mcp.reload()
          }
          if (input.force) await ctx.reference.reload()
          applied = fingerprints
          return { revision: next.revision, diagnostics: next.plan.diagnostics }
        } finally { gate.resolve() }
      },
    })
    events = (async () => {
      for await (const event of ctx.event.subscribe({ signal: abort.signal })) if (event.type === "plugin.updated") staleOrder = true
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
