import z from "zod"
import {
  parseJsonArray,
  parseJsonObject,
  parseJsonValue,
  parsePromptBoolean,
  parsePromptFiniteNumber,
  parsePromptString,
  type TJsonArray,
  type TJsonObject,
  type TJsonValue,
} from "../../src/learning/prompt/utils"

export type { TJsonArray, TJsonObject, TJsonValue }
export {
  parseJsonArray,
  parseJsonObject,
  parseJsonValue,
  parsePromptBoolean,
  parsePromptFiniteNumber,
  parsePromptString,
}

export type TPluginToolObjectResult = {
  title?: string
  output: string
  metadata?: TJsonObject
  attachments?: TJsonArray
}

const pluginToolObjectResultSchema = z.object({
  title: z.string().optional(),
  output: z.string(),
  metadata: z.record(z.string(), z.json()).optional(),
  attachments: z.array(z.json()).optional(),
})

export function requireParsed<TValue>(value: TValue | undefined, label: string): TValue {
  if (value !== undefined) return value
  throw new Error(`Expected ${label}`)
}

export function requireJsonObject<TValue>(value: TValue, label = "JSON object"): TJsonObject {
  return requireParsed(parseJsonObject(value), label)
}

export function requireJsonArray<TValue>(value: TValue, label = "JSON array"): TJsonArray {
  return requireParsed(parseJsonArray(value), label)
}

export function requireJsonValue<TValue>(value: TValue, label = "JSON value"): TJsonValue {
  return requireParsed(parseJsonValue(value), label)
}

export function requireString<TValue>(value: TValue, label = "string"): string {
  return requireParsed(parsePromptString(value), label)
}

export function requireNumber<TValue>(value: TValue, label = "number"): number {
  return requireParsed(parsePromptFiniteNumber(value), label)
}

export function parseJsonText(text: string): TJsonValue {
  return requireJsonValue(JSON.parse(text), "JSON text")
}

export function parseJsonObjectText(text: string): TJsonObject {
  return requireJsonObject(JSON.parse(text), "JSON object text")
}

export function parseWithSchema<TParsed>(
  schema: z.ZodType<TParsed>,
  value: TJsonValue,
  label: string,
): TParsed {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`Expected ${label}: ${parsed.error.message}`)
  }
  return parsed.data
}

export function requireToolMetadata(result: TPluginToolObjectResult): TJsonObject {
  return requireJsonObject(result.metadata, "tool metadata")
}

export function requireToolObjectResult<TValue>(
  value: TValue,
  label = "tool result object",
): TPluginToolObjectResult {
  const parsed = pluginToolObjectResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`Expected ${label}`)
  }
  return parsed.data
}

export function parsePartText(part: TJsonValue): string | undefined {
  const object = parseJsonObject(part)
  if (object === undefined) return undefined
  return parsePromptString(object.text)
}

export function findPartContaining(parts: TJsonArray, needle: string): TJsonObject | undefined {
  for (const part of parts) {
    const object = parseJsonObject(part)
    if (object === undefined) continue
    const text = parsePromptString(object.text)
    if (text !== undefined && text.includes(needle)) return object
  }
  return undefined
}
