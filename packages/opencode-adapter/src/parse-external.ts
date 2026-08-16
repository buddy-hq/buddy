import { z } from "zod"

export type TJsonPrimitive = string | number | boolean | null

export type TJsonValue = TJsonPrimitive | TJsonValue[] | TJsonObject

export type TJsonObject = {
  [key: string]: TJsonValue | undefined
}

const stringSchema = z.string()
const booleanSchema = z.boolean()
const finiteNumberSchema = z.number().finite()
const functionSchema = z.function()

export function parseWithSchema<TOutput, TValue = TOutput>(
  schema: z.ZodType<TOutput>,
  value: TValue,
): TOutput | undefined {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseStringValue<TValue>(value: TValue): string | undefined {
  return parseWithSchema(stringSchema, value)
}

export function parseBooleanValue<TValue>(value: TValue): boolean | undefined {
  return parseWithSchema(booleanSchema, value)
}

export function parseFiniteNumber<TValue>(value: TValue): number | undefined {
  return parseWithSchema(finiteNumberSchema, value)
}

export function hasFunctionValue<TValue>(value: TValue): boolean {
  return functionSchema.safeParse(value).success
}

export function isJsonObject<TValue>(value: TValue): value is TValue & TJsonObject {
  return value instanceof Object && !Array.isArray(value) && !hasFunctionValue(value)
}

export function parseStringArray<TValue>(value: TValue): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed: string[] = []
  for (const entry of value) {
    const item = parseStringValue(entry)
    if (item === undefined) return undefined
    parsed.push(item)
  }
  return parsed
}

export function parseJsonValue<TValue>(value: TValue): TJsonValue | undefined {
  const asString = parseStringValue(value)
  if (asString !== undefined) return asString
  const asNumber = parseFiniteNumber(value)
  if (asNumber !== undefined) return asNumber
  const asBoolean = parseBooleanValue(value)
  if (asBoolean !== undefined) return asBoolean
  if (value === null) return null
  if (Array.isArray(value)) {
    const items: TJsonValue[] = []
    for (const item of value) {
      const parsed = parseJsonValue(item)
      if (parsed !== undefined) items.push(parsed)
    }
    return items
  }
  return parseJsonObject(value)
}

export function parseJsonObject<TValue>(value: TValue): TJsonObject | undefined {
  if (value === null || value === undefined) return undefined
  if (Array.isArray(value)) return undefined
  if (hasFunctionValue(value)) return undefined
  if (!(value instanceof Object)) return undefined
  if (
    value instanceof Date ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof Promise
  ) {
    return undefined
  }

  const result: TJsonObject = {}
  for (const [key, entry] of Object.entries(value)) {
    const parsed = parseJsonValue(entry)
    if (parsed !== undefined) result[key] = parsed
  }
  return result
}

export function parseJsonObjectFromText(value: string): TJsonObject | undefined {
  try {
    return parseJsonObject(JSON.parse(value))
  } catch {
    return undefined
  }
}

export function parseErrorCode<TError>(error: TError): string | undefined {
  if (!isJsonObject(error) && !(error instanceof Error)) return undefined
  if (!("code" in error)) return undefined
  return parseStringValue(error.code)
}
