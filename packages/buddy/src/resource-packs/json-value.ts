import z from "zod"

export type TJsonValue = string | number | boolean | null | TJsonValue[] | TJsonObject
export type TJsonObject = { [key: string]: TJsonValue }
export type TJsonArray = TJsonValue[]

const jsonValueSchema: z.ZodType<TJsonValue> = z.json()
const jsonObjectSchema: z.ZodType<TJsonObject> = z.record(z.string(), jsonValueSchema)
const jsonArraySchema: z.ZodType<TJsonArray> = z.array(jsonValueSchema)
const jsonStringSchema = z.string()
const jsonNumberSchema = z.number()

export function parseTJsonObject<TValue>(value: TValue): TJsonObject | undefined {
  const parsed = jsonObjectSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseTJsonArray<TValue>(value: TValue): TJsonArray | undefined {
  const parsed = jsonArraySchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseTString<TValue>(value: TValue): string | undefined {
  const parsed = jsonStringSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseTNonEmptyString<TValue>(value: TValue): string | undefined {
  const parsed = parseTString(value)
  if (parsed === undefined) return undefined
  return parsed.length > 0 ? parsed : undefined
}

export function parseTNumber<TValue>(value: TValue): number | undefined {
  const parsed = jsonNumberSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
