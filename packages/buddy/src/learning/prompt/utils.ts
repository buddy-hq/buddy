import z from "zod"

export type TJsonValue = string | number | boolean | null | TJsonValue[] | TJsonObject
export type TJsonObject = { [key: string]: TJsonValue }
export type TJsonArray = TJsonValue[]
export type TPromptPart = TJsonObject
export type TMessagePromptBody = TJsonObject

const jsonValueSchema: z.ZodType<TJsonValue> = z.json()
const jsonObjectSchema: z.ZodType<TJsonObject> = z.record(z.string(), jsonValueSchema)
const jsonArraySchema: z.ZodType<TJsonArray> = z.array(jsonValueSchema)
const jsonStringSchema = z.string()
const jsonFiniteNumberSchema = z.number().finite()
const jsonBooleanSchema = z.boolean()
const jsonStringListSchema = z.array(jsonStringSchema)

export function parseJsonValue<T>(value: T): TJsonValue | undefined {
  const parsed = jsonValueSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseJsonObject<T>(value: T): TJsonObject | undefined {
  const parsed = jsonObjectSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseJsonArray<T>(value: T): TJsonArray | undefined {
  const parsed = jsonArraySchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parsePromptString<T>(value: T): string | undefined {
  const parsed = jsonStringSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseNonEmptyPromptString<T>(value: T): string | undefined {
  const parsed = parsePromptString(value)
  if (parsed === undefined) return undefined
  const trimmed = parsed.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function parsePromptFiniteNumber<T>(value: T): number | undefined {
  const parsed = jsonFiniteNumberSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parsePromptBoolean<T>(value: T): boolean | undefined {
  const parsed = jsonBooleanSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parsePromptStringList<T>(value: T): string[] | undefined {
  const parsed = jsonStringListSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parsePromptSafeInteger<T>(value: T): number | undefined {
  const parsed = parsePromptFiniteNumber(value)
  if (parsed === undefined || !Number.isSafeInteger(parsed)) return undefined
  return parsed
}

export function hasText(value: string | undefined | null): value is string {
  return value !== undefined && value !== null && value.trim().length > 0
}
