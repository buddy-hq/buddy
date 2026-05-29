import { realpathSync } from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { InstanceRef } from "opencode/effect/instance-ref"
import { makeRuntime } from "opencode/effect/run-service"
import * as OpenCodeToolRegistry from "opencode/tool/registry"
import * as OpenCodeTool from "opencode/tool/tool"
import { Agent } from "./agent"
import { withConfigOverlay } from "./config"
import { withCurrentInstance } from "./effect-runtime"
import { Instance } from "./instance"
import { cloneToolUiMetadata, type ToolUiMetadata } from "./tool-ui-metadata"

const UNBOUNDED_OUTPUT_POLICY_LIMIT = Number.POSITIVE_INFINITY

const runtime = makeRuntime(OpenCodeToolRegistry.Service, OpenCodeToolRegistry.defaultLayer)
const patchedServices = new WeakSet<OpenCodeToolRegistry.Interface>()

type ToolModelInput = Omit<Parameters<OpenCodeToolRegistry.Interface["tools"]>[0], "agent">
type ToolAgentInfo = Awaited<ReturnType<typeof Agent.get>>
type ToolAgentInput = string | ToolAgentInfo
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
export type ToolOutputPolicy = {
  maxLines?: number
  maxBytes?: number
}

const toolDefTransformers = new Set<ToolDefTransformer>()
const customToolUiMetadata = new Map<string, Map<string, ToolUiMetadata>>()
const customToolOutputPolicies = new Map<string, Map<string, ToolOutputPolicy>>()

function directoryKey(directory: string) {
  const resolved = path.resolve(directory)
  try {
    return realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function getCustomToolUiMetadata(directory: string, toolID: string): ToolUiMetadata | undefined {
  return cloneToolUiMetadata(customToolUiMetadata.get(directoryKey(directory))?.get(toolID))
}

function cloneToolOutputPolicy(policy: ToolOutputPolicy | undefined): ToolOutputPolicy | undefined {
  if (!policy) return undefined
  return {
    ...(policy.maxLines !== undefined ? { maxLines: policy.maxLines } : {}),
    ...(policy.maxBytes !== undefined ? { maxBytes: policy.maxBytes } : {}),
  }
}

function getCustomToolOutputPolicy(
  directory: string,
  toolID: string,
): ToolOutputPolicy | undefined {
  return cloneToolOutputPolicy(customToolOutputPolicies.get(directoryKey(directory))?.get(toolID))
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function outputFitsPolicy(output: string, policy: ToolOutputPolicy) {
  const maxLines = policy.maxLines ?? UNBOUNDED_OUTPUT_POLICY_LIMIT
  const maxBytes = policy.maxBytes ?? UNBOUNDED_OUTPUT_POLICY_LIMIT
  if (Buffer.byteLength(output, "utf8") > maxBytes) return false
  return output.split("\n").length <= maxLines
}

function removeOutputPath(metadata: OpenCodeTool.ExecuteResult["metadata"]) {
  const next = { ...metadata }
  delete next.outputPath
  return next
}

function applyToolOutputPolicy<TTool extends OpenCodeTool.Def>(
  directory: string,
  tool: TTool,
): TTool {
  const policy = getCustomToolOutputPolicy(directory, tool.id)
  if (!policy) return tool

  const execute = tool.execute
  return {
    ...tool,
    execute(args, ctx) {
      return Effect.gen(function* () {
        const result = yield* execute(args, ctx)
        if (result.metadata.truncated !== true) {
          return result
        }

        const outputPath = readNonEmptyString(result.metadata.outputPath)
        if (!outputPath) {
          return result
        }

        const fullOutput = yield* Effect.promise(() => fsp.readFile(outputPath, "utf8")).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
        if (fullOutput === undefined) {
          return result
        }

        if (!outputFitsPolicy(fullOutput, policy)) {
          return result
        }

        return {
          ...result,
          output: fullOutput,
          metadata: {
            ...removeOutputPath(result.metadata),
            truncated: false,
          },
        }
      })
    },
  }
}

const getInstanceDirectory = Effect.gen(function* () {
  const instance = yield* InstanceRef
  if (!instance) {
    return yield* Effect.die(new Error("InstanceRef not provided"))
  }
  return instance.directory
})

function applyToolDefTransformer<TTool extends OpenCodeTool.Def>(
  directory: string,
  tool: TTool,
): TTool {
  let next = applyToolOutputPolicy(directory, tool)
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

function ensurePatched(service: OpenCodeToolRegistry.Interface) {
  if (patchedServices.has(service)) return
  patchedServices.add(service)

  const originalAll = service.all.bind(service)
  const originalNamed = service.named.bind(service)
  const originalTools = service.tools.bind(service)

  const all: OpenCodeToolRegistry.Interface["all"] = Effect.fn("BuddyToolRegistry.all")(
    function* () {
      const directory = yield* getInstanceDirectory
      const base = yield* originalAll()
      return applyToolDefTransformers(directory, base)
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
      return applyToolDefTransformers(directory, base)
    },
  )

  Object.defineProperties(service, {
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

  export async function prime() {
    await ensureRuntimePatched()
  }

  export type ToolUiRegistration = {
    id: string
    toolUi?: ToolUiMetadata
  }

  export type ToolOutputPolicyRegistration = {
    id: string
    outputPolicy?: ToolOutputPolicy
  }

  export function registerToolUiCatalog(directory: string, tools: readonly ToolUiRegistration[]) {
    const key = directoryKey(directory)
    const metadataByTool = customToolUiMetadata.get(key) ?? new Map<string, ToolUiMetadata>()

    for (const tool of tools) {
      if (tool.toolUi) {
        metadataByTool.set(tool.id, cloneToolUiMetadata(tool.toolUi) ?? tool.toolUi)
      } else {
        metadataByTool.delete(tool.id)
      }
    }

    if (metadataByTool.size === 0) {
      customToolUiMetadata.delete(key)
    } else {
      customToolUiMetadata.set(key, metadataByTool)
    }
  }

  export function unregisterToolUi(directory: string, toolIDs: readonly string[]) {
    const key = directoryKey(directory)
    const metadataByTool = customToolUiMetadata.get(key)
    if (!metadataByTool) return

    for (const toolID of toolIDs) {
      metadataByTool.delete(toolID)
    }

    if (metadataByTool.size === 0) {
      customToolUiMetadata.delete(key)
    }
  }

  export function registerToolOutputPolicyCatalog(
    directory: string,
    tools: readonly ToolOutputPolicyRegistration[],
  ) {
    const key = directoryKey(directory)
    const policiesByTool = customToolOutputPolicies.get(key) ?? new Map<string, ToolOutputPolicy>()

    for (const tool of tools) {
      const policy = cloneToolOutputPolicy(tool.outputPolicy)
      if (policy) {
        policiesByTool.set(tool.id, policy)
      } else {
        policiesByTool.delete(tool.id)
      }
    }

    if (policiesByTool.size === 0) {
      customToolOutputPolicies.delete(key)
    } else {
      customToolOutputPolicies.set(key, policiesByTool)
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
