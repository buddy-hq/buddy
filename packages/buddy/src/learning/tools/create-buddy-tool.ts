import type z from "zod"
import { Tool } from "@buddy/opencode-adapter/tool"
import {
  ADVANCED_MATH_RUNTIME_DEPENDENCY,
  EDITOR_PERSONA_SURFACE,
  FIGURE_PERSONA_SURFACE,
  INTERACTIVE_WORKSPACE_STATE,
  STANDARDS_RUNTIME_DEPENDENCY,
  type BuddyToolCapabilityConstraints,
  type BuddyToolPersonaSurface,
  type BuddyToolWorkspaceState,
  type LearningToolRuntimeDependency,
} from "./tool-capability-constraints"

type BuddyToolMetadata = Record<string, unknown>
type BuddyToolContext<Metadata extends BuddyToolMetadata = BuddyToolMetadata> =
  Tool.Context<Metadata> & {
    directory: string
  }

type BuddyToolInitResult<Parameters extends z.ZodType, Metadata extends BuddyToolMetadata> = Omit<
  Awaited<ReturnType<Tool.Info<Parameters, Metadata>["init"]>>,
  "execute"
> & {
  execute(
    args: z.infer<Parameters>,
    ctx: BuddyToolContext<Metadata>,
  ): ReturnType<Awaited<ReturnType<Tool.Info<Parameters, Metadata>["init"]>>["execute"]>
}

type BuddyToolInit<Parameters extends z.ZodType, Metadata extends BuddyToolMetadata> =
  | BuddyToolInitResult<Parameters, Metadata>
  | ((
      ctx?: Tool.InitContext,
    ) =>
      | Promise<BuddyToolInitResult<Parameters, Metadata>>
      | BuddyToolInitResult<Parameters, Metadata>)

type BuddyTool<
  Id extends string = string,
  Parameters extends z.ZodType = z.ZodType,
  Metadata extends BuddyToolMetadata = BuddyToolMetadata,
> = {
  id: Id
  capability?: BuddyToolCapabilityConstraints
  toTool(directory: string): Tool.Info<Parameters, Metadata>
}

function createAbortError() {
  return new DOMException("Aborted", "AbortError")
}

function cloneCapabilityConstraints(
  capability: BuddyToolCapabilityConstraints | undefined,
): BuddyToolCapabilityConstraints {
  if (!capability) {
    return {}
  }

  return {
    ...(capability.surfaces ? { surfaces: [...capability.surfaces] } : {}),
    ...(capability.workspaceStates ? { workspaceStates: [...capability.workspaceStates] } : {}),
    ...(capability.runtimeDependency ? { runtimeDependency: capability.runtimeDependency } : {}),
  }
}

async function executeUntilAbort<T>(abort: AbortSignal, execute: () => Promise<T>) {
  abort.throwIfAborted()

  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(createAbortError())
    abort.addEventListener("abort", onAbort, { once: true })
  })

  try {
    const result = await Promise.race([execute(), aborted])
    abort.throwIfAborted()
    return result
  } finally {
    if (onAbort) {
      abort.removeEventListener("abort", onAbort)
    }
  }
}

function createBuddyTool<
  const Id extends string,
  Parameters extends z.ZodType,
  Metadata extends BuddyToolMetadata,
>(
  id: Id,
  init: BuddyToolInit<Parameters, Metadata>,
  capability?: BuddyToolCapabilityConstraints,
): BuddyTool<Id, Parameters, Metadata> {
  const clonedCapability = cloneCapabilityConstraints(capability)

  return {
    id,
    capability: clonedCapability,
    toTool(directory: string) {
      return Tool.define<Parameters, Metadata>(id, async (initCtx) => {
        const definition = typeof init === "function" ? await init(initCtx) : init

        return {
          ...definition,
          async execute(args, ctx) {
            const nextCtx: BuddyToolContext<Metadata> = {
              ...ctx,
              directory,
            }

            nextCtx.abort.throwIfAborted()
            return executeUntilAbort(nextCtx.abort, () => definition.execute(args, nextCtx))
          },
        }
      })
    },
  }
}

export { createBuddyTool }
export {
  ADVANCED_MATH_RUNTIME_DEPENDENCY,
  EDITOR_PERSONA_SURFACE,
  FIGURE_PERSONA_SURFACE,
  INTERACTIVE_WORKSPACE_STATE,
  STANDARDS_RUNTIME_DEPENDENCY,
}

export type {
  BuddyTool,
  BuddyToolCapabilityConstraints,
  BuddyToolContext,
  BuddyToolInit,
  BuddyToolPersonaSurface,
  BuddyToolWorkspaceState,
  LearningToolRuntimeDependency,
}
