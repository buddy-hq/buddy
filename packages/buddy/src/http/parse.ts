import z from "zod"

export type TJsonPrimitive = string | number | boolean | null
export type TJsonValue = TJsonPrimitive | readonly TJsonValue[] | TJsonObject
export type TJsonObject = { readonly [key: string]: TJsonValue }

const stringSchema = z.string()
const numberSchema = z.number()
const booleanSchema = z.boolean()

function isPlainObject<TValue>(value: TValue): value is TValue & TJsonObject {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return false
  return Object.prototype.toString.call(value) === "[object Object]"
}

export function parseTString<TValue>(value: TValue): string | undefined {
  const parsed = stringSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseTNumber<TValue>(value: TValue): number | undefined {
  const parsed = numberSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseTBoolean<TValue>(value: TValue): boolean | undefined {
  const parsed = booleanSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseTJsonObject<TValue>(value: TValue): TJsonObject | undefined {
  return isPlainObject(value) ? value : undefined
}

export function parseTJsonValue<TValue>(value: TValue): TJsonValue | undefined {
  if (value === null) return null
  const text = parseTString(value)
  if (text !== undefined) return text
  const numeric = parseTNumber(value)
  if (numeric !== undefined) return numeric
  const flag = parseTBoolean(value)
  if (flag !== undefined) return flag
  if (Array.isArray(value)) {
    const items: TJsonValue[] = []
    for (const entry of value) {
      const parsed = parseTJsonValue(entry)
      if (parsed === undefined) return undefined
      items.push(parsed)
    }
    return items
  }
  return parseTJsonObject(value)
}

export function parseTJsonText(text: string): TJsonValue | undefined {
  try {
    return parseTJsonValue(JSON.parse(text))
  } catch {
    return undefined
  }
}
