import { Effect } from "effect"
import type z from "zod"
import { Tool, type ToolRuntimeServices } from "@buddy/opencode-adapter/tool"
import { cloneToolUiMetadata, type ToolUiMetadata } from "@buddy/opencode-adapter/tool-ui-metadata"
import {
  ACTIVE_TEACHING_WORKSPACE,
  ADVANCED_MATH_RUNTIME,
  STANDARDS_RUNTIME,
  type BuddyToolConstraints,
  type BuddyToolRuntimeDependency,
} from "../runtime/tool-constraint-types"
import type { DynamicBuddyToolMetadata } from "./dynamic-tool-metadata"

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

type BuddyToolDefinition<
  Id extends string,
  Parameters extends z.ZodType,
  Metadata extends BuddyToolMetadata,
> = {
  id: Id
  description: string
  parameters: Parameters
  execute(
    args: z.infer<Parameters>,
    ctx: BuddyToolContext<Metadata>,
  ): Promise<Tool.ExecuteResult<Metadata>> | Tool.ExecuteResult<Metadata>
  formatValidationError?(error: z.ZodError): string
  constraints?: BuddyToolConstraints
  dynamic?: DynamicBuddyToolMetadata
  ui?: ToolUiMetadata
}

type BuddyTool<
  Id extends string = string,
  Parameters extends z.ZodType = z.ZodType,
  Metadata extends BuddyToolMetadata = BuddyToolMetadata,
> = {
  id: Id
  description: string
  constraints?: BuddyToolConstraints
  dynamic?: DynamicBuddyToolMetadata
  ui?: ToolUiMetadata
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
>(definition: BuddyToolDefinition<Id, Parameters, Metadata>): BuddyTool<Id, Parameters, Metadata> {
  const clonedConstraints = cloneConstraints(definition.constraints)
  const clonedDynamic = cloneDynamicMetadata(definition.dynamic)
  const clonedUi = normalizeToolUiMetadata(definition)

  return {
    id: definition.id,
    description: definition.description,
    constraints: clonedConstraints,
    ...(clonedDynamic ? { dynamic: clonedDynamic } : {}),
    ...(clonedUi ? { ui: clonedUi } : {}),
    toTool(directory: string) {
      return Tool.define(
        definition.id,
        Effect.promise(async () => {
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

function cloneConstraints(
  constraints: BuddyToolConstraints | undefined,
): BuddyToolConstraints | undefined {
  if (!constraints) return undefined
  return {
    ...(constraints.teachingWorkspace ? { teachingWorkspace: constraints.teachingWorkspace } : {}),
    ...(constraints.runtime ? { runtime: constraints.runtime } : {}),
  }
}

function cloneDynamicMetadata(
  metadata: DynamicBuddyToolMetadata | undefined,
): DynamicBuddyToolMetadata | undefined {
  if (!metadata) return undefined

  return {
    title: metadata.title,
    useCase: metadata.useCase,
    keywords: [...metadata.keywords],
    ...(metadata.searchText ? { searchText: metadata.searchText } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
    ...(metadata.sideEffects ? { sideEffects: [...metadata.sideEffects] } : {}),
    ...(metadata.mutatesLearnerState !== undefined
      ? { mutatesLearnerState: metadata.mutatesLearnerState }
      : {}),
    ...(metadata.renderer ? { renderer: metadata.renderer } : {}),
  }
}

function normalizeToolUiMetadata(
  definition: BuddyToolDefinition<string, z.ZodType, Record<string, unknown>>,
): ToolUiMetadata | undefined {
  const presentation =
    definition.ui?.presentation ?? (definition.dynamic ? "hidden-summary" : undefined)
  const labels =
    definition.ui?.labels ??
    (definition.dynamic?.title
      ? {
          idle: definition.dynamic.title,
        }
      : undefined)

  if (!presentation && !labels?.idle && !labels?.running) return undefined
  return cloneToolUiMetadata({ presentation, labels })
}

export { createBuddyTool }
export { ACTIVE_TEACHING_WORKSPACE, ADVANCED_MATH_RUNTIME, STANDARDS_RUNTIME }

export { normalizeToolUiMetadata }

export type { BuddyTool, BuddyToolConstraints, BuddyToolContext, BuddyToolDefinition }
export type { BuddyToolRuntimeDependency }
export type { ToolUiMetadata }
