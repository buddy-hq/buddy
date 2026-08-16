export type TJsonPrimitive = string | number | boolean | null
export type TJsonValue = TJsonPrimitive | readonly TJsonValue[] | TJsonObject
export type TJsonObject = { readonly [key: string]: TJsonValue }

const OBJECT_STRING_TAG = "[object String]"
const OBJECT_NUMBER_TAG = "[object Number]"
const OBJECT_BOOLEAN_TAG = "[object Boolean]"
const OBJECT_OBJECT_TAG = "[object Object]"

function objectTag<TValue>(value: TValue): string {
  return Object.prototype.toString.call(value)
}

export function parseTString<TValue>(value: TValue): string | undefined {
  return objectTag(value) === OBJECT_STRING_TAG ? `${value}` : undefined
}

export function parseTNumber<TValue>(value: TValue): number | undefined {
  if (objectTag(value) !== OBJECT_NUMBER_TAG) return undefined
  return Number(value)
}

export function parseTBoolean<TValue>(value: TValue): boolean | undefined {
  if (objectTag(value) !== OBJECT_BOOLEAN_TAG) return undefined
  return Boolean(value)
}

export function isJsonObject<TValue>(value: TValue): value is TValue & TJsonObject {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return false
  return objectTag(value) === OBJECT_OBJECT_TAG
}

export function parseTJsonObject<TValue>(value: TValue): TJsonObject | undefined {
  return isJsonObject(value) ? value : undefined
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

export function parseTStringArray<TValue>(value: TValue): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items: string[] = []
  for (const entry of value) {
    const text = parseTString(entry)
    if (text === undefined) return undefined
    items.push(text)
  }
  return items
}
