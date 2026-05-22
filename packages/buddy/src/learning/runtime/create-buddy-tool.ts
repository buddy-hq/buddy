import crypto from "node:crypto"
import "../../pi-backend/opencode-environment"
import type { TSchema } from "typebox"
import z from "zod"
import type {
  AgentToolResult,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent"
import { Effect, Schema } from "effect"
import { Tool, type ToolRuntimeServices } from "@buddy/opencode-adapter/tool"
import { withCurrentInstance } from "@buddy/opencode-adapter/effect-runtime"
import {
  executeUntilAbort,
  livePiMessageID as livePiLeafMessageID,
  livePiSessionMessages,
} from "../../pi-backend/live-tool-context"
import { mapPiMessagesToBuddyMessages } from "../../pi-backend/mapper"
import { requestBuddyToolPermission } from "../../pi-backend/permissions"
import { buddySessionIDFromPi } from "../../pi-backend/session-ids"
import {
  ACTIVE_TEACHING_WORKSPACE,
  ADVANCED_MATH_RUNTIME,
  STANDARDS_RUNTIME,
  type BuddyToolConstraints,
  type BuddyToolRuntimeDependency,
} from "../runtime/tool-constraint-types"
import type { DynamicBuddyToolMetadata } from "./dynamic-tool-metadata"
import { typeboxSchemaFromJsonSchema } from "./json-schema-typebox"
import { normalizeToolCallArgs } from "./normalize-tool-call-args"
import { mergeToolResultMetadata } from "./tool-result-metadata"

type BuddyToolMetadata = Record<string, unknown>
type PiToolDefinition = ToolDefinition<TSchema, unknown>
type BuddyPermissionRequestInput = {
  permission: string
  patterns: string[]
  always?: string[]
  metadata?: Record<string, unknown>
}
type BuddyToolExecuteResult<Metadata extends BuddyToolMetadata = BuddyToolMetadata> = {
  title?: string
  output: string
  metadata?: Metadata
}
type ToolUiMetadata = {
  presentation?: "default" | "hidden-summary"
  labels?: {
    idle?: string
    running?: string
  }
}
type PiToolContext = ExtensionContext
type PiToolExtra = Record<string, unknown>
type PiToolOptions = {
  extra?: (context: PiToolContext | undefined) => PiToolExtra | undefined
}
type BuddyToolContext<Metadata extends BuddyToolMetadata = BuddyToolMetadata> = {
  directory: string
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  callID?: string
  extra?: Record<string, unknown>
  messages: ReturnType<typeof mapPiMessagesToBuddyMessages>
  metadata(input: { title?: string; metadata?: Metadata }): Promise<void>
  ask(input: BuddyPermissionRequestInput): Promise<void>
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
  ): Promise<BuddyToolExecuteResult<Metadata>> | BuddyToolExecuteResult<Metadata>
  formatValidationError?(error: z.ZodError): string
  constraints?: BuddyToolConstraints
  dynamic?: DynamicBuddyToolMetadata
  ui?: ToolUiMetadata
}

type BuddyTool<
  Id extends string = string,
  _Parameters extends z.ZodType = z.ZodType,
  _Metadata extends BuddyToolMetadata = BuddyToolMetadata,
> = {
  id: Id
  description: string
  constraints?: BuddyToolConstraints
  dynamic?: DynamicBuddyToolMetadata
  ui?: ToolUiMetadata
  toTool(directory: string): Effect.Effect<
    Tool.Info<typeof Schema.Unknown, BuddyToolMetadata>,
    never,
    ToolRuntimeServices
  > & {
    id: Id
  }
  toPiTool(directory: string, options?: PiToolOptions): PiToolDefinition
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
  return schema
}

function toPiToolResult<Metadata extends BuddyToolMetadata>(
  result: BuddyToolExecuteResult<Metadata>,
): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text: result.output }],
    details: mergeToolResultMetadata({
      title: result.title,
      metadata: result.metadata,
    }),
  }
}

function livePiSessionID(context: PiToolContext | undefined) {
  return context
    ? buddySessionIDFromPi(context.sessionManager.getSessionId())
    : `ses_${crypto.randomUUID().replaceAll("-", "")}`
}

function livePiMessageID(context: PiToolContext | undefined) {
  return livePiLeafMessageID(context)
}

function livePiMessages(directory: string, context: PiToolContext | undefined) {
  return mapPiMessagesToBuddyMessages({
    sessionID: String(livePiSessionID(context)),
    directory,
    messages: livePiSessionMessages(context),
    ...(context?.model ? { model: context.model } : {}),
  })
}

function emptyBuddyMessages(): ReturnType<typeof mapPiMessagesToBuddyMessages> {
  return []
}

function livePiModelExtra(model: PiToolContext["model"] | undefined): PiToolExtra | undefined {
  if (!model) return undefined
  return {
    model: {
      providerID: model.provider,
      id: model.id,
      limit: {
        context: model.contextWindow,
        input: model.contextWindow,
        output: model.maxTokens,
      },
    },
  }
}

function livePiSessionExtra(
  directory: string,
  context: PiToolContext | undefined,
): PiToolExtra | undefined {
  if (livePiSessionMessages(context).length === 0) {
    return undefined
  }
  return {
    sessionMessages: livePiMessages(directory, context),
  }
}

function mergePiExtras(...extras: Array<PiToolExtra | undefined>) {
  const merged = Object.assign({}, ...extras.filter((extra): extra is PiToolExtra => !!extra))
  return Object.keys(merged).length > 0 ? merged : undefined
}

function createBuddyTool<
  const Id extends string,
  Parameters extends z.ZodType,
  Metadata extends BuddyToolMetadata,
>(definition: BuddyToolDefinition<Id, Parameters, Metadata>): BuddyTool<Id, Parameters, Metadata> {
  const clonedConstraints = cloneConstraints(definition.constraints)
  const clonedDynamic = cloneDynamicMetadata(definition.dynamic)
  const clonedUi = normalizeToolUiMetadata(definition)
  const jsonSchema = toToolJsonSchema(definition.id, definition.parameters)
  const piParameters = typeboxSchemaFromJsonSchema(jsonSchema)

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
            parameters: Schema.Unknown,
            jsonSchema,
            execute(args: unknown, ctx: Tool.Context<Metadata>) {
              const nextCtx: BuddyToolContext<Metadata> = {
                directory,
                sessionID: ctx.sessionID,
                messageID: ctx.messageID,
                agent: ctx.agent,
                abort: ctx.abort,
                ...(ctx.callID ? { callID: ctx.callID } : {}),
                ...(ctx.extra ? { extra: ctx.extra } : {}),
                messages: emptyBuddyMessages(),
                metadata(input) {
                  return Effect.runPromise(withCurrentInstance(ctx.metadata(input)))
                },
                ask(input) {
                  return Effect.runPromise(
                    withCurrentInstance(
                      ctx.ask({
                        permission: input.permission,
                        patterns: [...input.patterns],
                        always: [...(input.always ?? [])],
                        metadata: input.metadata ?? {},
                      }),
                    ),
                  )
                },
              }

              return Effect.promise(async () => {
                const parsed = definition.parameters.safeParse(normalizeToolCallArgs(args))
                if (!parsed.success) {
                  const message = definition.formatValidationError
                    ? definition.formatValidationError(parsed.error)
                    : `The ${definition.id} tool was called with invalid arguments: ${parsed.error}.\nPlease rewrite the input so it satisfies the expected schema.`
                  throw new Error(message, { cause: parsed.error })
                }

                nextCtx.abort.throwIfAborted()
                const result = await executeUntilAbort(nextCtx.abort, async () =>
                  definition.execute(parsed.data, nextCtx),
                )
                return {
                  title: result.title ?? definition.id,
                  metadata: result.metadata ?? {},
                  output: result.output,
                }
              })
            },
          }
        }),
      )
    },
    toPiTool(directory: string, options?: PiToolOptions) {
      return {
        name: definition.id,
        label: definition.dynamic?.title ?? definition.id,
        description: definition.description,
        promptSnippet: definition.description,
        parameters: piParameters,
        async execute(toolCallId, args, signal, onUpdate, context) {
          const abort = signal ?? new AbortController().signal
          const parsed = definition.parameters.safeParse(normalizeToolCallArgs(args))
          if (!parsed.success) {
            const message = definition.formatValidationError
              ? definition.formatValidationError(parsed.error)
              : `The ${definition.id} tool was called with invalid arguments: ${parsed.error}.\nPlease rewrite the input so it satisfies the expected schema.`
            throw new Error(message, { cause: parsed.error })
          }

          abort.throwIfAborted()
          const extra = mergePiExtras(
            livePiModelExtra(context?.model),
            livePiSessionExtra(directory, context),
            options?.extra?.(context),
          )
          const result = await executeUntilAbort(abort, async () =>
            definition.execute(parsed.data, {
              directory,
              sessionID: livePiSessionID(context),
              messageID: livePiMessageID(context),
              agent: "buddy",
              abort,
              callID: toolCallId,
              messages: livePiMessages(directory, context),
              metadata: async (input) => {
                if (!input.metadata && !input.title) return
                onUpdate?.({
                  content: [],
                  details: mergeToolResultMetadata({
                    title: input.title,
                    metadata: input.metadata,
                  }),
                })
              },
              ...(extra ? { extra } : {}),
              ask: async (input) => {
                await requestBuddyToolPermission({
                  directory,
                  sessionID: livePiSessionID(context),
                  messageID: livePiMessageID(context),
                  toolCallID: toolCallId,
                  permission: input.permission,
                  patterns: [...input.patterns],
                  always: [...(input.always ?? [])],
                  metadata: input.metadata ?? {},
                  signal: abort,
                })
              },
            }),
          )
          return toPiToolResult(result)
        },
      }
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
  return {
    ...(presentation ? { presentation } : {}),
    ...(labels ? { labels } : {}),
  }
}

export { createBuddyTool }
export { ACTIVE_TEACHING_WORKSPACE, ADVANCED_MATH_RUNTIME, STANDARDS_RUNTIME }

export { normalizeToolUiMetadata }

export type {
  BuddyTool,
  BuddyToolConstraints,
  BuddyToolContext,
  BuddyToolDefinition,
  PiToolDefinition,
}
export type { BuddyToolRuntimeDependency }
export type { ToolUiMetadata }
