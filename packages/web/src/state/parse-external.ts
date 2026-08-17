import { z } from "zod"

export type TBuddyConfigValue =
  | string
  | number
  | boolean
  | null
  | readonly TBuddyConfigValue[]
  | TBuddyConfigObject

export type TBuddyConfigObject = {
  readonly [key: string]: TBuddyConfigValue | undefined
}

const stringSchema = z.string()
const booleanSchema = z.boolean()
const finiteNumberSchema = z.number().finite()
const functionSchema = z.function()

export const EMPTY_BUDDY_CONFIG: TBuddyConfigObject = {}

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

export function parseOptionalStringField<TValue>(value: TValue): string | undefined | null {
  if (value === undefined) return undefined
  return parseStringValue(value) ?? null
}

export function parseFilteredStringArray<TValue>(value: TValue): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items: string[] = []
  for (const item of value) {
    const text = parseStringValue(item)
    if (text !== undefined) items.push(text)
  }
  return items
}

export function parseBuddyConfigValue<TValue>(value: TValue): TBuddyConfigValue | undefined {
  const asString = parseStringValue(value)
  if (asString !== undefined) return asString
  const asNumber = parseFiniteNumber(value)
  if (asNumber !== undefined) return asNumber
  const asBoolean = parseBooleanValue(value)
  if (asBoolean !== undefined) return asBoolean
  if (value === null) return null
  if (Array.isArray(value)) {
    const items: TBuddyConfigValue[] = []
    for (const item of value) {
      const parsed = parseBuddyConfigValue(item)
      if (parsed !== undefined) items.push(parsed)
    }
    return items
  }
  return parseBuddyConfigObject(value)
}

export function parseBuddyConfigObject<TValue>(value: TValue): TBuddyConfigObject | undefined {
  if (value === null || value === undefined) return undefined
  if (Array.isArray(value)) return undefined
  if (hasFunctionValue(value)) return undefined
  if (!(value instanceof Object)) return undefined
  if (value instanceof Date || value instanceof Map || value instanceof Set || value instanceof Promise) {
    return undefined
  }

  const result: { [key: string]: TBuddyConfigValue } = {}
  for (const [key, entry] of Object.entries(value)) {
    const parsed = parseBuddyConfigValue(entry)
    if (parsed !== undefined) result[key] = parsed
  }
  return result
}

export function stringifyCaughtError<TError>(error: TError): string {
  if (error instanceof Error) return error.message
  const text = parseStringValue(error)
  if (text !== undefined) return text
  try {
    const serialized = JSON.stringify(error)
    return parseStringValue(serialized) ?? String(error)
  } catch {
    return String(error)
  }
}

// Presence check only, matching origin's `typeof document === "undefined"` guards and the sibling
// browserWindow. An `instanceof Document` narrowing is realm-sensitive: it is false for a live
// document whose constructor came from another realm, and callers then silently no-op — the
// visibilitychange listener never attaches, and appearance/language never reach the document.
export function browserDocument(): Document | undefined {
  if (!("document" in globalThis)) return undefined
  return globalThis.document
}

export function browserWindow(): Window | undefined {
  if (!("window" in globalThis)) return undefined
  return globalThis.window
}

export function browserLocalStorage(): Storage | undefined {
  if (!("localStorage" in globalThis)) return undefined
  return globalThis.localStorage
}
