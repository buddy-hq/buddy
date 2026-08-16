export type TJsonPrimitive = string | number | boolean | null
export type TJsonValue = TJsonPrimitive | readonly TJsonValue[] | TJsonObject
export type TJsonObject = { readonly [key: string]: TJsonValue }

export type TPortedAddress = {
  port: number
}

type TCallable = (...args: never[]) => void

const OBJECT_STRING_TAG = "[object String]"
const OBJECT_NUMBER_TAG = "[object Number]"
const OBJECT_BOOLEAN_TAG = "[object Boolean]"
const OBJECT_FUNCTION_TAG = "[object Function]"
const OBJECT_ASYNC_FUNCTION_TAG = "[object AsyncFunction]"
const OBJECT_GENERATOR_FUNCTION_TAG = "[object GeneratorFunction]"
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

export function hasFunctionValue<TValue>(value: TValue): value is TValue & TCallable {
  const tag = objectTag(value)
  return (
    tag === OBJECT_FUNCTION_TAG ||
    tag === OBJECT_ASYNC_FUNCTION_TAG ||
    tag === OBJECT_GENERATOR_FUNCTION_TAG
  )
}

export function isObjectValue<TValue>(value: TValue): value is TValue & object {
  if (value === null || value === undefined) return false
  if (hasFunctionValue(value)) return false
  return Object(value) === value
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

export function parseTJsonArray<TValue>(value: TValue): readonly TJsonValue[] | undefined {
  const parsed = parseTJsonValue(value)
  return Array.isArray(parsed) ? parsed : undefined
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

export function parseTPortedAddress<TValue>(value: TValue): TPortedAddress | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const port = parseTNumber(record.port)
  if (port === undefined) return undefined
  return { port }
}

export function stringifyCaughtError<TError>(error: TError): string {
  if (error instanceof Error) return error.message
  const text = parseTString(error)
  if (text !== undefined) return text
  return String(error)
}
