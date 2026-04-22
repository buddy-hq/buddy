import { Effect } from "effect"
import type z from "zod"
import { Tool, type ToolRuntimeServices } from "@buddy/opencode-adapter/tool"
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
type BuddyToolContext<Metadata extends BuddyToolMetadata = BuddyToolMetadata> = {
  directory: string
  sessionID: Tool.Context<Metadata>["sessionID"]
  messageID: Tool.Context<Metadata>["messageID"]
  agent: Tool.Context<Metadata>["agent"]
  abort: Tool.Context<Metadata>["abort"]
  callID?: Tool.Context<Metadata>["callID"]
  extra?: Tool.Context<Metadata>["extra"]
  messages: Tool.Context<Metadata>["messages"]
  metadata(input: { title?: string; metadata?: Metadata }): Promise<void>
  ask(input: Parameters<Tool.Context<Metadata>["ask"]>[0]): Promise<void>
}

type BuddyToolInitResult<Parameters extends z.ZodType, Metadata extends BuddyToolMetadata> = {
  description: string
  parameters: Parameters
  execute(
    args: z.infer<Parameters>,
    ctx: BuddyToolContext<Metadata>,
  ): Promise<Tool.ExecuteResult<Metadata>> | Tool.ExecuteResult<Metadata>
  formatValidationError?(error: z.ZodError): string
}

type BuddyToolInit<Parameters extends z.ZodType, Metadata extends BuddyToolMetadata> =
  | BuddyToolInitResult<Parameters, Metadata>
  | (() =>
      | Promise<BuddyToolInitResult<Parameters, Metadata>>
      | BuddyToolInitResult<Parameters, Metadata>)

type BuddyTool<
  Id extends string = string,
  Parameters extends z.ZodType = z.ZodType,
  Metadata extends BuddyToolMetadata = BuddyToolMetadata,
> = {
  id: Id
  capability?: BuddyToolCapabilityConstraints
  toTool(
    directory: string,
  ): Effect.Effect<Tool.Info<Parameters, Metadata>, never, ToolRuntimeServices> & { id: Id }
}

function createAbortError() {
  return new DOMException("Aborted", "AbortError")
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
      return Tool.define(
        id,
        Effect.promise(async () => {
          const definition = typeof init === "function" ? await init() : init

          return {
            ...definition,
            execute(args: z.infer<Parameters>, ctx: Tool.Context<Metadata>) {
              const nextCtx: BuddyToolContext<Metadata> = {
                directory,
                sessionID: ctx.sessionID,
                messageID: ctx.messageID,
                agent: ctx.agent,
                abort: ctx.abort,
                ...(ctx.callID ? { callID: ctx.callID } : {}),
                ...(ctx.extra ? { extra: ctx.extra } : {}),
                messages: ctx.messages,
                metadata(input) {
                  return Effect.runPromise(ctx.metadata(input))
                },
                ask(input) {
                  return Effect.runPromise(ctx.ask(input))
                },
              }

              return Effect.promise(async () => {
                nextCtx.abort.throwIfAborted()
                return executeUntilAbort(nextCtx.abort, async () =>
                  definition.execute(args, nextCtx),
                )
              })
            },
          }
        }),
      )
    },
  }
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

export { createBuddyTool }
export {
  ADVANCED_MATH_RUNTIME_DEPENDENCY,
  EDITOR_PERSONA_SURFACE,
  FIGURE_PERSONA_SURFACE,
  INTERACTIVE_WORKSPACE_STATE,
  STANDARDS_RUNTIME_DEPENDENCY,
}

export type { BuddyTool, BuddyToolContext, BuddyToolInit }
export type {
  BuddyToolCapabilityConstraints,
  BuddyToolPersonaSurface,
  BuddyToolWorkspaceState,
  LearningToolRuntimeDependency,
}
