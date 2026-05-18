import { realpathSync } from "node:fs"
import path from "node:path"
import { Effect, Layer, ManagedRuntime } from "effect"
import * as OpenCodeAgent from "opencode/agent/agent"
import { InstanceRef } from "opencode/effect/instance-ref"
import { attach, makeRuntime } from "opencode/effect/run-service"
import * as OpenCodeToolRegistry from "opencode/tool/registry"
import * as OpenCodeTruncate from "opencode/tool/truncate"
import * as OpenCodeTool from "opencode/tool/tool"
import { Agent } from "./agent"
import { withConfigOverlay } from "./config"
import { withCurrentInstance } from "./effect-runtime"
import { Instance } from "./instance"
import { cloneToolUiMetadata, type ToolUiMetadata } from "./tool-ui-metadata"

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
type RegisteredCustomTool = {
  info: CustomToolInfo
  toolUi?: ToolUiMetadata
}
type RuntimeTool = Omit<OpenCodeTool.Def, "execute"> & {
  execute: (
    args: Parameters<OpenCodeTool.Def["execute"]>[0],
    ctx: Parameters<OpenCodeTool.Def["execute"]>[1],
  ) => Promise<OpenCodeTool.ExecuteResult>
}
type ToolDefTransformer = <TTool extends OpenCodeTool.Def>(input: {
  directory: string
  tool: TTool
}) => TTool
const customTools = new Map<string, Map<string, CustomToolInfo>>()
const customToolUiMetadata = new Map<string, Map<string, ToolUiMetadata>>()
const toolDefTransformers = new Set<ToolDefTransformer>()

const getInstanceDirectory = Effect.gen(function* () {
  const instance = yield* InstanceRef
  if (!instance) {
    return yield* Effect.die(new Error("InstanceRef not provided"))
  }
  return instance.directory
})

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

function getCustomToolUiMetadata(directory: string, toolID: string): ToolUiMetadata | undefined {
  return cloneToolUiMetadata(customToolUiMetadata.get(key(directory))?.get(toolID))
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

function applyToolDefTransformer<TTool extends OpenCodeTool.Def>(
  directory: string,
  tool: TTool,
): TTool {
  let next = tool
  for (const transform of toolDefTransformers) {
    next = transform({
      directory,
      tool: next,
    })
  }
  return next
}

function applyToolDefTransformers<TTool extends OpenCodeTool.Def>(
  directory: string,
  tools: readonly TTool[],
) {
  return tools.map((tool) => applyToolDefTransformer(directory, tool))
}

function toRuntimeTool(tool: OpenCodeTool.Def): RuntimeTool {
  return {
    ...tool,
    execute(args, ctx) {
      return Effect.runPromise(withCurrentInstance(tool.execute(args, ctx)))
    },
  }
}

function withRuntimeInstance(tool: OpenCodeTool.Def): OpenCodeTool.Def {
  return {
    ...tool,
    execute(args, ctx) {
      return withCurrentInstance(tool.execute(args, ctx))
    },
  }
}

async function resolveCustomToolInfo(tool: CustomToolInfo): Promise<OpenCodeTool.Info> {
  if ("init" in tool) {
    return tool
  }

  return customToolRuntime.runPromise(withCurrentInstance(attach(tool)))
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
  const originalNamed = service.named.bind(service)
  const originalTools = service.tools.bind(service)

  const ids: OpenCodeToolRegistry.Interface["ids"] = Effect.fn("BuddyToolRegistry.ids")(
    function* () {
      const directory = yield* getInstanceDirectory
      const base = yield* originalIds()
      const extra = getCustomToolInfos(directory).map((tool) => tool.id)
      return [...new Set([...base, ...extra])]
    },
  )

  const all: OpenCodeToolRegistry.Interface["all"] = Effect.fn("BuddyToolRegistry.all")(
    function* () {
      const directory = yield* getInstanceDirectory
      const base = yield* originalAll()
      const extra = yield* Effect.promise(() => customToolDefs(directory))
      return applyToolDefTransformers(directory, mergeToolDefs(base, extra))
    },
  )

  const named: OpenCodeToolRegistry.Interface["named"] = Effect.fn("BuddyToolRegistry.named")(
    function* () {
      const directory = yield* getInstanceDirectory
      const base = yield* originalNamed()
      return {
        task: applyToolDefTransformer(directory, base.task),
        read: applyToolDefTransformer(directory, base.read),
      }
    },
  )

  const tools: OpenCodeToolRegistry.Interface["tools"] = Effect.fn("BuddyToolRegistry.tools")(
    function* (model) {
      const directory = yield* getInstanceDirectory
      const base = yield* originalTools(model)
      const extra = yield* Effect.promise(() => customToolDefs(directory))
      return applyToolDefTransformers(directory, mergeToolDefs(base, extra))
    },
  )

  Object.defineProperties(service, {
    ids: { value: ids },
    all: { value: all },
    named: { value: named },
    tools: { value: tools },
  })
}

async function ensureRuntimePatched() {
  await withConfigOverlay(Instance.directory, () =>
    runtime.runPromise((svc) => withCurrentInstance(Effect.sync(() => ensurePatched(svc)))),
  )
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
  export function registerToolDefTransformer(transform: ToolDefTransformer) {
    toolDefTransformers.add(transform)
    return () => {
      toolDefTransformers.delete(transform)
    }
  }

  export async function register(input: RegisteredCustomTool | CustomToolInfo) {
    const directory = key(Instance.directory)
    const tools = customTools.get(directory) ?? new Map<string, CustomToolInfo>()
    const registration = "info" in input ? input : { info: input }
    tools.set(registration.info.id, registration.info)
    customTools.set(directory, tools)

    if (registration.toolUi) {
      const metadataByTool =
        customToolUiMetadata.get(directory) ?? new Map<string, ToolUiMetadata>()
      metadataByTool.set(
        registration.info.id,
        cloneToolUiMetadata(registration.toolUi) ?? registration.toolUi,
      )
      customToolUiMetadata.set(directory, metadataByTool)
    } else {
      const metadataByTool = customToolUiMetadata.get(directory)
      metadataByTool?.delete(registration.info.id)
      if (metadataByTool && metadataByTool.size === 0) {
        customToolUiMetadata.delete(directory)
      }
    }

    await ensureRuntimePatched()
  }

  export async function unregister(toolIDs: readonly string[]) {
    const directory = key(Instance.directory)
    const tools = customTools.get(directory)
    const metadataByTool = customToolUiMetadata.get(directory)
    if (!tools) return
    for (const toolID of toolIDs) {
      tools.delete(toolID)
      metadataByTool?.delete(toolID)
    }
    if (tools.size === 0) {
      customTools.delete(directory)
    }
    if (metadataByTool && metadataByTool.size === 0) {
      customToolUiMetadata.delete(directory)
    }
  }

  export function getToolUiMetadata(toolID: string, directory?: string) {
    if (directory) {
      return getCustomToolUiMetadata(directory, toolID)
    }

    try {
      return getCustomToolUiMetadata(Instance.directory, toolID)
    } catch {
      return undefined
    }
  }

  export async function ids() {
    await ensureRuntimePatched()
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => withCurrentInstance(svc.ids())),
    )
  }

  export async function all() {
    await ensureRuntimePatched()
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) => withCurrentInstance(svc.all())),
    )
  }

  export async function named() {
    await ensureRuntimePatched()
    return withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) =>
        withCurrentInstance(
          Effect.map(svc.named(), (named) => ({
            task: withRuntimeInstance(named.task),
            read: withRuntimeInstance(named.read),
          })),
        ),
      ),
    )
  }

  export async function tools(model: ToolModelInput, agent?: ToolAgentInput) {
    await ensureRuntimePatched()
    const resolvedAgent = await resolveToolAgent(agent)
    const tools = await withConfigOverlay(Instance.directory, () =>
      runtime.runPromise((svc) =>
        withCurrentInstance(
          svc.tools({
            ...model,
            agent: resolvedAgent,
          }),
        ),
      ),
    )
    return tools.map(toRuntimeTool)
  }
}
