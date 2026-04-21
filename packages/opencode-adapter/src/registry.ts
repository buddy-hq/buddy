import { realpathSync } from "node:fs"
import path from "node:path"
import { Effect, Layer, ManagedRuntime } from "effect"
import * as OpenCodeAgent from "opencode/agent/agent"
import { attach, makeRuntime } from "opencode/effect/run-service"
import { Instance } from "opencode/project/instance"
import * as OpenCodeToolRegistry from "opencode/tool/registry"
import * as OpenCodeTruncate from "opencode/tool/truncate"
import * as OpenCodeTool from "opencode/tool/tool"
import { Agent } from "./agent"

const runtime = makeRuntime(OpenCodeToolRegistry.Service, OpenCodeToolRegistry.defaultLayer)
const customToolRuntime = ManagedRuntime.make(
  Layer.mergeAll(OpenCodeAgent.defaultLayer, OpenCodeTruncate.defaultLayer),
)
const patchedServices = new WeakSet<OpenCodeToolRegistry.Interface>()

type ToolModelInput = Omit<Parameters<OpenCodeToolRegistry.Interface["tools"]>[0], "agent">
type ToolAgentInfo = Awaited<ReturnType<typeof Agent.get>>
type ToolAgentInput = string | ToolAgentInfo
type DeferredToolInfo = Effect.Effect<
  OpenCodeTool.Info,
  never,
  OpenCodeAgent.Service | OpenCodeTruncate.Service
> & {
  id: string
}
type CustomToolInfo = OpenCodeTool.Info | DeferredToolInfo
type RuntimeTool = Omit<OpenCodeTool.Def, "execute"> & {
  execute: (
    args: Parameters<OpenCodeTool.Def["execute"]>[0],
    ctx: Parameters<OpenCodeTool.Def["execute"]>[1],
  ) => Promise<OpenCodeTool.ExecuteResult>
}
const customTools = new Map<string, Map<string, CustomToolInfo>>()

function key(directory: string) {
  const resolved = path.resolve(directory)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function getCustomToolInfos(directory: string) {
  return [...(customTools.get(key(directory))?.values() ?? [])]
}

function mergeToolDefs(base: readonly OpenCodeTool.Def[], extra: readonly OpenCodeTool.Def[]) {
  const merged = new Map<string, OpenCodeTool.Def>()
  for (const tool of base) {
    merged.set(tool.id, tool)
  }
  for (const tool of extra) {
    merged.set(tool.id, tool)
  }
  return [...merged.values()]
}

function toRuntimeTool(tool: OpenCodeTool.Def): RuntimeTool {
  return {
    ...tool,
    execute(args, ctx) {
      return Effect.runPromise(tool.execute(args, ctx))
    },
  }
}

async function resolveCustomToolInfo(tool: CustomToolInfo): Promise<OpenCodeTool.Info> {
  if ("init" in tool) {
    return tool
  }

  return customToolRuntime.runPromise(attach(tool))
}

async function customToolDefs(directory: string): Promise<OpenCodeTool.Def[]> {
  const tools = await Promise.all(getCustomToolInfos(directory).map(resolveCustomToolInfo))
  return Promise.all(tools.map((tool) => Effect.runPromise(OpenCodeTool.init(tool))))
}

function ensurePatched(service: OpenCodeToolRegistry.Interface) {
  if (patchedServices.has(service)) return
  patchedServices.add(service)

  const originalIds = service.ids.bind(service)
  const originalAll = service.all.bind(service)
  const originalTools = service.tools.bind(service)

  const ids: OpenCodeToolRegistry.Interface["ids"] = Effect.fn("BuddyToolRegistry.ids")(
    function* () {
      const base = yield* originalIds()
      const extra = getCustomToolInfos(Instance.directory).map((tool) => tool.id)
      return [...new Set([...base, ...extra])]
    },
  )

  const all: OpenCodeToolRegistry.Interface["all"] = Effect.fn("BuddyToolRegistry.all")(
    function* () {
      const base = yield* originalAll()
      const extra = yield* Effect.promise(() => customToolDefs(Instance.directory))
      return mergeToolDefs(base, extra)
    },
  )

  const tools: OpenCodeToolRegistry.Interface["tools"] = Effect.fn("BuddyToolRegistry.tools")(
    function* (model) {
      const base = yield* originalTools(model)
      const extra = yield* Effect.promise(() => customToolDefs(Instance.directory))
      return mergeToolDefs(base, extra)
    },
  )

  Object.defineProperties(service, {
    ids: { value: ids },
    all: { value: all },
    tools: { value: tools },
  })
}

async function ensureRuntimePatched() {
  await runtime.runPromise((svc) => Effect.sync(() => ensurePatched(svc)))
}

async function resolveToolAgent(agent?: ToolAgentInput): Promise<ToolAgentInfo> {
  if (typeof agent === "string") {
    return Agent.get(agent)
  }

  if (agent) {
    return agent
  }

  return Agent.get(await Agent.defaultAgent())
}

export namespace ToolRegistry {
  export async function register(info: CustomToolInfo) {
    const directory = key(Instance.directory)
    const tools = customTools.get(directory) ?? new Map<string, CustomToolInfo>()
    tools.set(info.id, info)
    customTools.set(directory, tools)
    await ensureRuntimePatched()
  }

  export async function unregister(toolIDs: readonly string[]) {
    const tools = customTools.get(key(Instance.directory))
    if (!tools) return
    for (const toolID of toolIDs) {
      tools.delete(toolID)
    }
    if (tools.size === 0) {
      customTools.delete(key(Instance.directory))
    }
  }

  export async function ids() {
    await ensureRuntimePatched()
    return runtime.runPromise((svc) => svc.ids())
  }

  export async function all() {
    await ensureRuntimePatched()
    return runtime.runPromise((svc) => svc.all())
  }

  export async function named() {
    await ensureRuntimePatched()
    return runtime.runPromise((svc) => svc.named())
  }

  export async function tools(model: ToolModelInput, agent?: ToolAgentInput) {
    await ensureRuntimePatched()
    const resolvedAgent = await resolveToolAgent(agent)
    const tools = await runtime.runPromise((svc) =>
      svc.tools({
        ...model,
        agent: resolvedAgent,
      }),
    )
    return tools.map(toRuntimeTool)
  }
}
