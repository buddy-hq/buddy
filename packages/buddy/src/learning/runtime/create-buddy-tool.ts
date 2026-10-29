import z from "zod"
import type {
  ToolCall,
  ToolApprovalRequest,
  ToolOutput,
  ToolAttachment,
} from "@buddy/agent-runtime/extension"
import {
  cloneToolPresentationDescriptor,
  type ToolPresentationDescriptor,
} from "@buddy/transcript-contract/tool-presentation"
import {
  ACTIVE_TEACHING_WORKSPACE,
  ADVANCED_MATH_RUNTIME,
  STANDARDS_RUNTIME,
  type BuddyToolConstraints,
  type BuddyToolRuntimeDependency,
} from "../runtime/tool-constraint-types"
import type { DynamicBuddyToolMetadata } from "./dynamic-tool-metadata"
import { BuddyObjectResultSchema } from "../../objects/result"
import {
  parseJsonObject,
  parseJsonValue,
  parsePromptBoolean,
  parsePromptString,
  type TJsonObject,
  type TJsonValue,
} from "../prompt/utils"

type TBuddyToolMetadata = { [key: string]: TJsonValue | undefined }

type BuddyToolPermissionRequest = ToolApprovalRequest

type BuddyToolAttachment = ToolAttachment

type BuddyToolExecuteResult<Metadata extends TBuddyToolMetadata = TBuddyToolMetadata> = Omit<
  ToolOutput,
  "metadata"
> & { metadata: Metadata }

type BuddyToolContext<Metadata extends TBuddyToolMetadata = TBuddyToolMetadata> = Omit<
  ToolCall,
  "metadata"
> & {
  extra?: TJsonObject
  metadata(input: { title?: string; metadata?: Metadata }): Promise<void>
}

type BuddyToolDefinition<
  Id extends string,
  Parameters extends z.ZodType,
  Metadata extends TBuddyToolMetadata,
> = {
  id: Id
  description: string
  parameters: Parameters
  streamInput?: boolean
  execute(
    args: z.infer<Parameters>,
    ctx: BuddyToolContext<Metadata>,
  ): Promise<BuddyToolExecuteResult<Metadata>> | BuddyToolExecuteResult<Metadata>
  normalizeInput?<TRaw>(rawArgs: TRaw): TRaw | TJsonObject
  formatValidationError?(error: z.ZodError): string
  constraints?: BuddyToolConstraints
  dynamic?: DynamicBuddyToolMetadata
  presentation: ToolPresentationDescriptor
  output?: BuddyToolOutputPolicy
  produces?: BuddyToolProducesPolicy
}

type BuddyToolOutputPolicy = {
  maxLines?: number
  maxBytes?: number
}

type BuddyToolProducesPolicy = {
  buddyObjectResult?: true
}

type BuddyTool<
  Id extends string = string,
  Parameters extends z.ZodType = z.ZodType,
  Metadata extends TBuddyToolMetadata = TBuddyToolMetadata,
> = {
  id: Id
  description: string
  parameters: Parameters
  streamInput?: boolean
  jsonSchema: TJsonObject
  constraints?: BuddyToolConstraints
  dynamic?: DynamicBuddyToolMetadata
  presentation: ToolPresentationDescriptor
  output?: BuddyToolOutputPolicy
  run<TRaw>(
    rawArgs: TRaw,
    ctx: BuddyToolContext<Metadata>,
  ): Promise<BuddyToolExecuteResult<Metadata>>
}

function createAbortError() {
  return new DOMException("Aborted", "AbortError")
}

function isNullJsonSchema<TValue>(value: TValue): boolean {
  const schema = parseJsonObject(value)
  return schema !== undefined && parsePromptString(schema.type) === "null"
}

function normalizeNullableAnyOf(schema: TJsonObject): TJsonObject {
  const anyOf = schema.anyOf
  if (!Array.isArray(anyOf) || anyOf.length !== 2) {
    return schema
  }

  const nullSchema = anyOf.find(isNullJsonSchema)
  const valueSchema = anyOf.find((item) => !isNullJsonSchema(item))
  const parsedValueSchema = parseJsonObject(valueSchema)
  const valueType =
    parsedValueSchema === undefined ? undefined : parsePromptString(parsedValueSchema.type)
  if (!nullSchema || parsedValueSchema === undefined || valueType === undefined) {
    return schema
  }

  const normalized: TJsonObject = Object.assign(
    {},
    schema,
    Object.fromEntries(
      Object.entries(parsedValueSchema).filter(([key]) => key !== "type" && key !== "description"),
    ),
    { type: [valueType, "null"] },
  )
  delete normalized.anyOf

  if (Array.isArray(normalized.enum) && !normalized.enum.includes(null)) {
    normalized.enum = [...normalized.enum, null]
  }

  return normalized
}

function normalizeZodJsonSchema(value: TJsonValue): TJsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeZodJsonSchema(item))
  }
  const schema = parseJsonObject(value)
  if (schema === undefined) {
    return value
  }
  const normalized: TJsonObject = Object.fromEntries(
    Object.entries(schema)
      .filter(([key, item]) => {
        return !(
          (key === "exclusiveMaximum" || key === "exclusiveMinimum") &&
          parsePromptBoolean(item) !== undefined
        )
      })
      .map(([key, item]) => [key, normalizeZodJsonSchema(item)]),
  )
  return normalizeNullableAnyOf(normalized)
}

function toToolJsonSchema(id: string, parameters: z.ZodType) {
  const raw = parseJsonValue(z.toJSONSchema(parameters, { io: "input" }))
  const normalized = raw === undefined ? undefined : normalizeZodJsonSchema(raw)
  const schema = parseJsonObject(normalized)
  if (schema === undefined) {
    throw new Error(`Tool ${id} produced a non-object JSON Schema.`)
  }
  if (parsePromptString(schema.type) !== "object") {
    throw new Error(`Tool ${id} parameters must be a JSON Schema object.`)
  }

  const next: TJsonObject = { ...schema }
  delete next.$schema
  const defs = parseJsonObject(next.$defs)
  if (defs !== undefined) {
    next.definitions = defs
  }
  delete next.$defs
  return next
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

async function runBuddyTool<
  const Id extends string,
  Parameters extends z.ZodType,
  Metadata extends TBuddyToolMetadata,
  TRaw,
>(
  definition: BuddyToolDefinition<Id, Parameters, Metadata>,
  rawArgs: TRaw,
  ctx: BuddyToolContext<Metadata>,
): Promise<BuddyToolExecuteResult<Metadata>> {
  const normalizedArgs = definition.normalizeInput ? definition.normalizeInput(rawArgs) : rawArgs
  const parsed = definition.parameters.safeParse(normalizedArgs)
  if (!parsed.success) {
    const message = definition.formatValidationError
      ? definition.formatValidationError(parsed.error)
      : `The ${definition.id} tool was called with invalid arguments: ${parsed.error}.\nPlease rewrite the input so it satisfies the expected schema.`
    throw new Error(message, { cause: parsed.error })
  }

  ctx.abort.throwIfAborted()
  const result = await executeUntilAbort(ctx.abort, async () =>
    definition.execute(parsed.data, ctx),
  )
  validateProducedToolMetadata(definition, result)
  return result
}

function validateProducedToolMetadata<
  const Id extends string,
  Parameters extends z.ZodType,
  Metadata extends TBuddyToolMetadata,
>(
  definition: BuddyToolDefinition<Id, Parameters, Metadata>,
  result: BuddyToolExecuteResult<Metadata>,
): void {
  if (definition.produces?.buddyObjectResult !== true) {
    return
  }
  BuddyObjectResultSchema.parse(result.metadata.buddyObjectResult)
}

function createBuddyTool<
  const Id extends string,
  Parameters extends z.ZodType,
  Metadata extends TBuddyToolMetadata,
>(definition: BuddyToolDefinition<Id, Parameters, Metadata>): BuddyTool<Id, Parameters, Metadata> {
  const clonedConstraints = cloneConstraints(definition.constraints)
  const clonedDynamic = cloneDynamicMetadata(definition.dynamic)
  const presentation = cloneToolPresentationDescriptor(definition.presentation)
  const clonedOutput = cloneOutputPolicy(definition.output)
  const jsonSchema = toToolJsonSchema(definition.id, definition.parameters)

  const tool: BuddyTool<Id, Parameters, Metadata> = Object.assign(
    {
      id: definition.id,
      description: definition.description,
      parameters: definition.parameters,
      streamInput: definition.streamInput,
      jsonSchema,
      constraints: clonedConstraints,
      presentation,
      run<TRaw>(rawArgs: TRaw, ctx: BuddyToolContext<Metadata>) {
        return runBuddyTool(definition, rawArgs, ctx)
      },
    },
    clonedDynamic ? { dynamic: clonedDynamic } : undefined,
    clonedOutput ? { output: clonedOutput } : undefined,
  )
  return tool
}

function cloneOutputPolicy(
  policy: BuddyToolOutputPolicy | undefined,
): BuddyToolOutputPolicy | undefined {
  if (!policy) return undefined
  const cloned: BuddyToolOutputPolicy = Object.assign(
    {},
    policy.maxLines !== undefined ? { maxLines: policy.maxLines } : undefined,
    policy.maxBytes !== undefined ? { maxBytes: policy.maxBytes } : undefined,
  )
  return cloned
}

function cloneConstraints(
  constraints: BuddyToolConstraints | undefined,
): BuddyToolConstraints | undefined {
  if (!constraints) return undefined
  const cloned: BuddyToolConstraints = Object.assign(
    {},
    constraints.teachingWorkspace
      ? { teachingWorkspace: constraints.teachingWorkspace }
      : undefined,
    constraints.runtime ? { runtime: constraints.runtime } : undefined,
  )
  return cloned
}

function cloneDynamicMetadata(
  metadata: DynamicBuddyToolMetadata | undefined,
): DynamicBuddyToolMetadata | undefined {
  if (!metadata) return undefined

  const cloned: DynamicBuddyToolMetadata = Object.assign(
    Object.assign(
      {
        title: metadata.title,
        useCase: metadata.useCase,
        keywords: [...metadata.keywords],
      },
      metadata.searchText ? { searchText: metadata.searchText } : undefined,
      metadata.description ? { description: metadata.description } : undefined,
      metadata.sideEffects ? { sideEffects: [...metadata.sideEffects] } : undefined,
    ),
    metadata.mutatesLearnerState !== undefined
      ? { mutatesLearnerState: metadata.mutatesLearnerState }
      : undefined,
    metadata.renderer ? { renderer: metadata.renderer } : undefined,
  )
  return cloned
}

export { createBuddyTool }
export { ACTIVE_TEACHING_WORKSPACE, ADVANCED_MATH_RUNTIME, STANDARDS_RUNTIME }

export type {
  BuddyTool,
  BuddyToolAttachment,
  BuddyToolConstraints,
  BuddyToolContext,
  BuddyToolDefinition,
  BuddyToolExecuteResult,
  BuddyToolPermissionRequest,
}
export type { BuddyToolRuntimeDependency }
export type { ToolPresentationDescriptor }
