import { Effect, Schema } from "effect"
import z from "zod"
import { Tool, type ToolRuntimeServices } from "@buddy/opencode-adapter/tool"
import { cloneToolUiMetadata, type ToolUiMetadata } from "@buddy/opencode-adapter/tool-ui-metadata"
import { withCurrentInstance } from "@buddy/opencode-adapter/effect-runtime"
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
  output?: BuddyToolOutputPolicy
}

type BuddyToolOutputPolicy = {
  maxLines?: number
  maxBytes?: number
}

type BuddyTool<
  Id extends string = string,
  Parameters extends z.ZodType = z.ZodType,
  Metadata extends BuddyToolMetadata = BuddyToolMetadata,
> = {
  id: Id
  description: string
  parameters: Parameters
  constraints?: BuddyToolConstraints
  dynamic?: DynamicBuddyToolMetadata
  ui?: ToolUiMetadata
  output?: BuddyToolOutputPolicy
  run(rawArgs: unknown, ctx: BuddyToolContext<Metadata>): Promise<Tool.ExecuteResult<Metadata>>
  toTool(directory: string): Effect.Effect<
    Tool.Info<typeof Schema.Unknown, Metadata>,
    never,
    ToolRuntimeServices
  > & {
    id: Id
  }
}

function createAbortError() {
  return new DOMException("Aborted", "AbortError")
}

function isJsonSchemaObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeZodJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeZodJsonSchema(item))
  }
  if (!isJsonSchemaObject(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => {
        return !(
          (key === "exclusiveMaximum" || key === "exclusiveMinimum") &&
          typeof item === "boolean"
        )
      })
      .map(([key, item]) => [key, normalizeZodJsonSchema(item)]),
  )
}

function toToolJsonSchema(id: string, parameters: z.ZodType) {
  const raw = z.toJSONSchema(parameters, { io: "input" })
  const normalized = normalizeZodJsonSchema(raw)
  if (!isJsonSchemaObject(normalized)) {
    throw new Error(`Tool ${id} produced a non-object JSON Schema.`)
  }
  if (normalized.type !== "object") {
    throw new Error(`Tool ${id} parameters must be a JSON Schema object.`)
  }

  const schema = { ...normalized }
  delete schema.$schema
  if (isJsonSchemaObject(schema.$defs)) {
    schema.definitions = schema.$defs
  }
  delete schema.$defs
  return schema
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

function buddyToolContextFromEffectContext<Metadata extends BuddyToolMetadata>(
  directory: string,
  ctx: Tool.Context<Metadata>,
): BuddyToolContext<Metadata> {
  return {
    directory,
    sessionID: ctx.sessionID,
    messageID: ctx.messageID,
    agent: ctx.agent,
    abort: ctx.abort,
    ...(ctx.callID ? { callID: ctx.callID } : {}),
    ...(ctx.extra ? { extra: ctx.extra } : {}),
    messages: ctx.messages,
    metadata(input) {
      return Effect.runPromise(withCurrentInstance(ctx.metadata(input)))
    },
    ask(input) {
      return Effect.runPromise(withCurrentInstance(ctx.ask(input)))
    },
  }
}

async function runBuddyTool<
  const Id extends string,
  Parameters extends z.ZodType,
  Metadata extends BuddyToolMetadata,
>(
  definition: BuddyToolDefinition<Id, Parameters, Metadata>,
  rawArgs: unknown,
  ctx: BuddyToolContext<Metadata>,
): Promise<Tool.ExecuteResult<Metadata>> {
  const parsed = definition.parameters.safeParse(rawArgs)
  if (!parsed.success) {
    const message = definition.formatValidationError
      ? definition.formatValidationError(parsed.error)
      : `The ${definition.id} tool was called with invalid arguments: ${parsed.error}.\nPlease rewrite the input so it satisfies the expected schema.`
    throw new Error(message, { cause: parsed.error })
  }

  ctx.abort.throwIfAborted()
  return executeUntilAbort(ctx.abort, async () => definition.execute(parsed.data, ctx))
}

function createBuddyTool<
  const Id extends string,
  Parameters extends z.ZodType,
  Metadata extends BuddyToolMetadata,
>(definition: BuddyToolDefinition<Id, Parameters, Metadata>): BuddyTool<Id, Parameters, Metadata> {
  const clonedConstraints = cloneConstraints(definition.constraints)
  const clonedDynamic = cloneDynamicMetadata(definition.dynamic)
  const clonedUi = normalizeToolUiMetadata(definition)
  const clonedOutput = cloneOutputPolicy(definition.output)
  const jsonSchema = toToolJsonSchema(definition.id, definition.parameters)

  return {
    id: definition.id,
    description: definition.description,
    parameters: definition.parameters,
    constraints: clonedConstraints,
    ...(clonedDynamic ? { dynamic: clonedDynamic } : {}),
    ...(clonedUi ? { ui: clonedUi } : {}),
    ...(clonedOutput ? { output: clonedOutput } : {}),
    run(rawArgs, ctx) {
      return runBuddyTool(definition, rawArgs, ctx)
    },
    toTool(directory: string) {
      return Tool.define(
        definition.id,
        Effect.promise(async () => {
          return {
            ...definition,
            parameters: Schema.Unknown,
            jsonSchema,
            execute(args: unknown, ctx: Tool.Context<Metadata>) {
              const nextCtx = buddyToolContextFromEffectContext(directory, ctx)
              return Effect.promise(() => runBuddyTool(definition, args, nextCtx))
            },
          }
        }),
      )
    },
  }
}

function cloneOutputPolicy(
  policy: BuddyToolOutputPolicy | undefined,
): BuddyToolOutputPolicy | undefined {
  if (!policy) return undefined
  return {
    ...(policy.maxLines !== undefined ? { maxLines: policy.maxLines } : {}),
    ...(policy.maxBytes !== undefined ? { maxBytes: policy.maxBytes } : {}),
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
