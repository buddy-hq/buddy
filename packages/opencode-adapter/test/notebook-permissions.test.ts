import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Exit, Schema, Scope } from "effect"
import z from "zod"
import type { NotebookPlan } from "@buddy/agent-runtime/notebook-plan"
import { OpenCode } from "@opencode/client"
import type { AgentEditor } from "@opencode/plugin/promise/agent"
import type { Context as PluginContext } from "@opencode/plugin/promise/plugin"
import type { RpcHandlers } from "@opencode/plugin/promise/rpc"
import type { DeepMutable } from "@opencode/plugin/promise/types"
import { Agent } from "@opencode/schema/agent"
import { Location } from "@opencode/schema/location"
import type { Rpc } from "@opencode/schema/rpc"
import {
  evaluatePermission,
  permissionRulesFromConfig,
  toBuddyPermissionRules,
} from "@buddy/transcript-contract/permission-rules"
import { TEST_SANDBOX } from "../../../script/test-preload"
import {
  decodePermissions,
  NOTEBOOK_CONFIG_RPC,
  registerNotebookConfig,
  toLocationRelativeRules,
} from "../src/extension/notebook"
import type { OpenCodeHost } from "../src/host"
import { createCatalog } from "../src/runtime/catalog"
import { State } from "../../../vendor/opencode/packages/core/src/state"

function evaluate(
  rules: ReturnType<typeof decodePermissions>,
  permission: string,
  resource: string,
) {
  return evaluatePermission(permission, resource, toBuddyPermissionRules(rules)).action
}

test("home-relative file rules expand to the learner's home so their refusals still match", () => {
  const rules = decodePermissions(
    permissionRulesFromConfig({
      external_directory: { "*": "allow", "~/Private/*": "deny" },
      read: { "*": "allow", "~/Private/*": "deny" },
      edit: { "*": "allow", "$HOME/Private/*": "deny" },
    }),
    "/home/learner",
  )

  expect(evaluate(rules, "external_directory", "/home/learner/Private/*")).toBe("deny")
  expect(evaluate(rules, "read", "/home/learner/Private/a.txt")).toBe("deny")
  expect(evaluate(rules, "edit", "/home/learner/Private/a.txt")).toBe("deny")
  expect(evaluate(rules, "read", "/home/learner/Public/a.txt")).toBe("allow")
})

test("a bare home rule and Windows homes expand with the home's separators normalised", () => {
  expect(
    decodePermissions(
      permissionRulesFromConfig({ read: { "~": "deny", $HOME: "ask" } }),
      "/home/learner",
    ).map((rule) => rule.resource),
  ).toEqual(["/home/learner", "/home/learner"])
  expect(
    decodePermissions(
      permissionRulesFromConfig({ read: { "~\\Private\\*": "deny", "$HOME/Notes/*": "allow" } }),
      "C:\\Users\\learner",
    ).map((rule) => rule.resource),
  ).toEqual(["C:/Users/learner/Private/*", "C:/Users/learner/Notes/*"])
})

test("shell rules and other users' homes keep their text", () => {
  expect(
    decodePermissions(
      permissionRulesFromConfig({
        bash: { "~/scripts/*": "deny" },
        read: { "~other/*": "deny", "notes/~/*": "deny" },
      }),
      "/home/learner",
    ).map((rule) => rule.resource),
  ).toEqual(["~/scripts/*", "~other/*", "notes/~/*"])
})

test("legacy read refusals govern MCP resources while other servers keep the default allow", () => {
  const rules = decodePermissions(
    permissionRulesFromConfig({ read: { "*": "allow", "mcp:docs:*": "deny" } }),
  )

  expect(evaluate(rules, "opencode_read_mcp_resource", "docs:file:///a")).toBe("deny")
  expect(evaluate(rules, "opencode_list_mcp_resources", "docs")).toBe("deny")
  expect(evaluate(rules, "opencode_read_mcp_resource", "other:file:///a")).toBe("allow")
  expect(evaluate(rules, "opencode_list_mcp_resources", "other")).toBe("allow")
})

test("a whole read permission asks for both MCP actions even after a general allow", () => {
  const rules = [
    ...decodePermissions(permissionRulesFromConfig("allow")),
    ...decodePermissions(permissionRulesFromConfig({ read: "ask" })),
  ]

  expect(evaluate(rules, "opencode_read_mcp_resource", "docs:file:///a")).toBe("ask")
  expect(evaluate(rules, "opencode_list_mcp_resources", "docs")).toBe("ask")
})

test.each(["mcp:*", "mcp:*:*"])("a legacy %s read rule governs both MCP actions", (resource) => {
  const rules = decodePermissions(permissionRulesFromConfig({ read: { [resource]: "deny" } }))

  expect(evaluate(rules, "opencode_read_mcp_resource", "docs:file:///a")).toBe("deny")
  expect(evaluate(rules, "opencode_list_mcp_resources", "docs")).toBe("deny")
})

test("a specific MCP resource refusal leaves listing and other resources allowed", () => {
  const rules = decodePermissions(
    permissionRulesFromConfig({ read: { "*": "allow", "mcp:docs:file:///a": "deny" } }),
  )

  expect(evaluate(rules, "opencode_read_mcp_resource", "docs:file:///a")).toBe("deny")
  expect(evaluate(rules, "opencode_read_mcp_resource", "docs:file:///b")).toBe("allow")
  expect(evaluate(rules, "opencode_list_mcp_resources", "docs")).toBe("allow")
})

test("later read rules override earlier MCP resource refusals", () => {
  const rules = decodePermissions(
    permissionRulesFromConfig({ read: { "mcp:docs:*": "deny", "*": "allow" } }),
  )

  expect(evaluate(rules, "opencode_read_mcp_resource", "docs:file:///a")).toBe("allow")
  expect(evaluate(rules, "opencode_list_mcp_resources", "docs")).toBe("allow")
})

test("repository file rules use notebook coordinates without shifting wildcards, absolute paths or shell rules", () => {
  const rules = decodePermissions(
    permissionRulesFromConfig({
      read: { "private/*": "deny", "docs/private/*": "deny", "*.env": "deny", "/abs/*": "deny" },
      edit: { "docs/private/*": "deny", docs: "ask" },
      bash: { "docs/private/*": "deny" },
    }),
  )
  const rewritten = toLocationRelativeRules(rules, {
    directory: "/repo/docs",
    projectDirectory: "/repo",
  })

  expect(rewritten.map((rule) => [rule.action, rule.resource, rule.effect])).toEqual([
    ["read", "../private/*", "deny"],
    ["read", "private/*", "deny"],
    ["read", "*.env", "deny"],
    ["read", "/abs/*", "deny"],
    ["edit", "private/*", "deny"],
    ["edit", ".", "ask"],
    ["shell", "docs/private/*", "deny"],
  ])
})

test.each(["/repo/docs", "/", "/elsewhere"])(
  "file rules stay unchanged when the project directory is %s",
  (projectDirectory) => {
    const rules = decodePermissions(
      permissionRulesFromConfig({ read: { "private/*": "deny" }, edit: { "docs/*": "ask" } }),
    )

    expect(toLocationRelativeRules(rules, { directory: "/repo/docs", projectDirectory })).toEqual(
      rules,
    )
  },
)

test("a repository private-file refusal still denies reads from a nested notebook", () => {
  const rules = toLocationRelativeRules(
    decodePermissions(permissionRulesFromConfig({ read: { "*": "allow", "private/*": "deny" } })),
    { directory: "/repo/docs", projectDirectory: "/repo" },
  )

  expect(evaluate(rules, "read", "../private/secret.txt")).toBe("deny")
})

function unexpectedDomain(): never {
  throw new Error("Unexpected notebook-config domain access")
}

function initialAgents() {
  return new Map<string, DeepMutable<Agent.Info>>([
    ["buddy", structuredClone(Agent.Info.default(Agent.ID.make("buddy")))],
  ])
}

function agentEditor(agents: Map<string, DeepMutable<Agent.Info>>): AgentEditor {
  return {
    list: () => [...agents.values()],
    get: (id) => agents.get(id),
    default() {},
    update(id, update) {
      const agent = agents.get(id)
      if (!agent) throw new Error(`Missing test agent: ${id}`)
      update(agent)
    },
    remove(id) {
      agents.delete(id)
    },
  }
}

async function notebookController(
  directory: string,
  plan: NotebookPlan,
  options: {
    reloadAgent?: () => Promise<void>
    reloadMcp?: () => Promise<void>
    afterAgentTransform?: () => Promise<void>
  } = {},
) {
  const reloads = new Map<string, number>()
  const handlers = new Map<string, RpcHandlers<Rpc.PortableDefinition>[string]>()
  const agentTransforms = new Set<Parameters<PluginContext["agent"]["transform"]>[0]>()
  const agentScope = await Effect.runPromise(Scope.make())
  const agentState = State.create({ initial: initialAgents, editor: agentEditor })
  let pendingUpdate = Promise.withResolvers<{ handled: () => void } | undefined>()
  async function pluginUpdated() {
    const handled = Promise.withResolvers<void>()
    pendingUpdate.resolve({ handled: handled.resolve })
    await handled.promise
  }
  function prompt() {
    const agents = initialAgents()
    const editor = agentEditor(agents)
    for (const transform of agentTransforms) transform(editor)
    return agents.get("buddy")?.system
  }
  const client = OpenCode.make({
    baseUrl: "http://notebook.test",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        const method = new URL(request.url).pathname.split("/").at(-1)
        const body = z.object({ input: z.unknown() }).parse(await request.json())
        const handler = method && handlers.get(method)
        if (!handler) throw new Error(`Missing notebook-config handler: ${method}`)
        return Response.json({
          output: await handler(body.input, {
            signal: new AbortController().signal,
            error: unexpectedDomain,
          }),
        })
      },
      { preconnect: fetch.preconnect },
    ),
  })
  const rpc: PluginContext["rpc"] = Object.assign(client.rpc, {
    async register<D extends Rpc.PortableDefinition>(_definition: D, registered: RpcHandlers<D>) {
      for (const [name, handler] of Object.entries(registered)) handlers.set(name, handler)
      return {
        async dispose() {
          handlers.clear()
        },
        events: { async emit() {} },
      }
    },
  })
  const domain = (name: string) => ({
    async transform() {
      return { async dispose() {} }
    },
    async reload() {
      reloads.set(name, (reloads.get(name) ?? 0) + 1)
      if (name === "agent") {
        await options.reloadAgent?.()
        await Effect.runPromise(agentState.reload())
      }
      if (name === "mcp") await options.reloadMcp?.()
    },
  })
  const ctx: PluginContext = {
    location: Schema.decodeUnknownSync(Location.Info)({
      directory,
      project: { id: "prj_rootsync", directory, canonical: directory },
    }),
    rpc,
    integration: {
      ...client.integration,
      ...domain("integration"),
      get connection() {
        return unexpectedDomain()
      },
    },
    provider: { ...client.provider, ...domain("provider") },
    model: { ...client.model, ...domain("model") },
    agent: {
      ...client.agent,
      ...domain("agent"),
      async transform(transform) {
        agentTransforms.add(transform)
        const registration = await Effect.runPromise(
          Effect.provideService(agentState.transform(transform), Scope.Scope, agentScope),
        )
        await options.afterAgentTransform?.()
        return {
          async dispose() {
            agentTransforms.delete(transform)
            await Effect.runPromise(registration.dispose)
          },
        }
      },
    },
    skill: { ...client.skill, ...domain("skill") },
    command: { ...client.command, ...domain("command") },
    mcp: { ...client.mcp, ...domain("mcp") },
    reference: { ...client.reference, ...domain("reference") },
    event: {
      async *subscribe(options) {
        const stop = () => pendingUpdate.resolve(undefined)
        options?.signal?.addEventListener("abort", stop, { once: true })
        try {
          while (!options?.signal?.aborted) {
            const update = await pendingUpdate.promise
            if (!update) return
            pendingUpdate = Promise.withResolvers<{ handled: () => void } | undefined>()
            yield {
              id: "evt_plugin_updated",
              created: 0,
              type: "plugin.updated" as const,
              data: {},
            }
            update.handled()
          }
        } finally {
          options?.signal?.removeEventListener("abort", stop)
        }
      },
    },
    get app() {
      return unexpectedDomain()
    },
    get options() {
      return unexpectedDomain()
    },
    get aisdk() {
      return unexpectedDomain()
    },
    get experimental() {
      return unexpectedDomain()
    },
    get generate() {
      return unexpectedDomain()
    },
    get permission() {
      return unexpectedDomain()
    },
    get plugin() {
      return unexpectedDomain()
    },
    get session() {
      return unexpectedDomain()
    },
    get shell() {
      return unexpectedDomain()
    },
    get storage() {
      return unexpectedDomain()
    },
    get tool() {
      return unexpectedDomain()
    },
    get vcs() {
      return unexpectedDomain()
    },
    get websearch() {
      return unexpectedDomain()
    },
    get worktree() {
      return unexpectedDomain()
    },
  }
  const cleanup = await registerNotebookConfig(ctx, async () => plan)
  const host: OpenCodeHost = {
    ...client,
    sessions: client.session,
    events: client.event,
    plugin: Object.assign(async () => {}, client.plugin),
    async close() {},
    async [Symbol.asyncDispose]() {},
  }
  const catalog = createCatalog(host, {})
  const local = rpc(NOTEBOOK_CONFIG_RPC)
  await local.sync(await local.ready({}))
  return {
    catalog,
    local,
    reloads,
    prompt,
    pluginUpdated,
    agent: ctx.agent,
    cachedPrompt: () => agentState.get().get("buddy")?.system,
    async [Symbol.asyncDispose]() {
      try {
        await cleanup()
      } finally {
        await Effect.runPromise(Scope.close(agentScope, Exit.void))
      }
    },
  }
}

function notebookPlan(prompt: string): NotebookPlan {
  return {
    agents: [{ id: "buddy", prompt, permissions: [] }],
    permissions: [],
    providers: [],
    mcp: [],
    skills: [],
    excludedSkillRoots: [],
    commands: {},
    diagnostics: [],
  }
}

async function notebookDirectory(prefix: string): Promise<string> {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(TEST_SANDBOX.root, prefix)))
  return process.platform === "win32" ? directory.toLowerCase() : directory
}

test("a root settings sync reaches shared and chat controllers and reloads the shared copy once", async () => {
  const directory = await notebookDirectory("root-settings-sync-")
  await using shared = await notebookController(directory, notebookPlan("Before"))
  await using chat = await notebookController(directory, notebookPlan("Before"))
  const revision = await shared.catalog.publishNotebookPlan(directory, notebookPlan("After"))

  await shared.catalog.syncActiveNotebookLocations(directory, revision, { force: true })
  await shared.catalog.syncNotebookLocation(directory, revision, { force: true })

  expect(await shared.local.ready({})).toEqual({ revision })
  expect(await chat.local.ready({})).toEqual({ revision })
  for (const controller of [shared, chat]) {
    expect(Object.fromEntries(controller.reloads)).toEqual({
      integration: 1,
      provider: 1,
      model: 1,
      agent: 1,
      skill: 1,
      command: 1,
      mcp: 1,
      reference: 1,
    })
  }
})

test("forcing a revision once upgrades its sync and forcing it again reloads nothing", async () => {
  const directory = await notebookDirectory("forced-settings-sync-")
  await using controller = await notebookController(directory, notebookPlan("Current"))
  const { revision } = await controller.local.ready({})
  const first = await controller.local.sync({ revision, force: true })
  const reloads = Object.fromEntries(controller.reloads)
  expect(reloads).toEqual({
    integration: 1,
    provider: 1,
    model: 1,
    agent: 1,
    skill: 1,
    command: 1,
    mcp: 1,
    reference: 1,
  })

  expect(await controller.local.sync({ revision, force: true })).toEqual(first)
  expect(await controller.local.sync({ revision, force: false })).toEqual(first)
  expect(Object.fromEntries(controller.reloads)).toEqual(reloads)
})

test("a forced rollback restores the snapshot and captured transforms after a partial settings failure", async () => {
  const directory = await notebookDirectory("failed-settings-rollback-")
  const planA = notebookPlan("A")
  const failure = new Error("Injected agent reload failure")
  let rejectReload = false
  await using controller = await notebookController(directory, planA, {
    async reloadAgent() {
      if (!rejectReload) return
      rejectReload = false
      throw failure
    },
  })
  const { revision: revisionA } = await controller.local.ready({})
  await controller.local.sync({ revision: revisionA, force: true })
  expect(controller.prompt()).toBe("A")

  const revisionB = await controller.catalog.publishNotebookPlan(directory, notebookPlan("B"))
  rejectReload = true
  await expect(controller.local.sync({ revision: revisionB, force: true })).rejects.toMatchObject({
    reason: "Transport",
    cause: failure,
  })
  expect(await controller.local.ready({})).toEqual({ revision: revisionB })
  expect(controller.prompt()).toBe("B")

  expect(await controller.catalog.publishNotebookPlan(directory, planA)).toBe(revisionA)
  expect(await controller.local.sync({ revision: revisionA, force: true })).toMatchObject({
    revision: revisionA,
  })
  expect({ ...(await controller.local.ready({})), prompt: controller.prompt() }).toEqual({
    revision: revisionA,
    prompt: "A",
  })
})

test("an ordinary restoration reloads all domains after agent state rebuilt for a failed plan", async () => {
  const directory = await notebookDirectory("ordinary-settings-rollback-")
  const planA = notebookPlan("A")
  const failure = new Error("Injected MCP reload failure")
  let rejectMcp = false
  await using controller = await notebookController(directory, planA, {
    async reloadMcp() {
      if (!rejectMcp) return
      rejectMcp = false
      throw failure
    },
  })
  const { revision: revisionA } = await controller.local.ready({})
  expect(controller.cachedPrompt()).toBe("A")
  const revisionB = await controller.catalog.publishNotebookPlan(directory, {
    ...notebookPlan("B"),
    mcp: [{ name: "new", type: "remote", url: "https://example.test/mcp" }],
  })
  rejectMcp = true
  await expect(controller.local.sync({ revision: revisionB })).rejects.toMatchObject({
    reason: "Transport",
    cause: failure,
  })
  expect(controller.reloads.get("agent")).toBe(1)
  expect(controller.cachedPrompt()).toBe("B")
  const reloads = new Map(controller.reloads)

  expect(await controller.catalog.publishNotebookPlan(directory, planA)).toBe(revisionA)
  expect(await controller.local.sync({ revision: revisionA })).toMatchObject({
    revision: revisionA,
  })
  expect(await controller.local.ready({})).toEqual({ revision: revisionA })
  expect(controller.cachedPrompt()).toBe("A")
  for (const domain of [
    "integration",
    "provider",
    "model",
    "agent",
    "skill",
    "command",
    "mcp",
    "reference",
  ]) {
    expect(controller.reloads.get(domain)).toBe((reloads.get(domain) ?? 0) + 1)
  }
})

test.each([false, true])(
  "a plugin update restores notebook precedence at the unchanged revision with force %s",
  async (force) => {
    const directory = await notebookDirectory("settings-plugin-precedence-")
    await using controller = await notebookController(directory, notebookPlan("A"))
    const { revision } = await controller.local.ready({})
    await controller.local.sync({ revision, force: true })
    expect(controller.prompt()).toBe("A")

    await controller.agent.transform((editor) =>
      editor.update("buddy", (agent) => {
        agent.system = "Other plugin prompt"
      }),
    )
    expect(controller.prompt()).toBe("Other plugin prompt")
    await controller.pluginUpdated()
    await controller.local.sync({ revision, force })

    expect(controller.prompt()).toBe("A")
  },
)

test("a plugin update during awaited transform registration is repaired on the next settings sync", async () => {
  const directory = await notebookDirectory("settings-plugin-generation-")
  const registered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  let pauseRegistration = false
  await using controller = await notebookController(directory, notebookPlan("A"), {
    async afterAgentTransform() {
      if (!pauseRegistration) return
      registered.resolve()
      await resume.promise
    },
  })
  await controller.pluginUpdated()
  const revision = await controller.catalog.publishNotebookPlan(directory, notebookPlan("B"))
  pauseRegistration = true
  const syncing = controller.local.sync({ revision })
  try {
    await registered.promise
    pauseRegistration = false
    await controller.agent.transform((editor) =>
      editor.update("buddy", (agent) => {
        agent.system = "Other plugin prompt"
      }),
    )
    await controller.pluginUpdated()
  } finally {
    resume.resolve()
  }
  await syncing
  expect(controller.prompt()).toBe("Other plugin prompt")

  await controller.local.sync({ revision })

  expect(controller.prompt()).toBe("B")
})
