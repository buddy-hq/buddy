import { z } from "zod"

export type TJsonPrimitive = string | number | boolean | null
export type TJsonValue = TJsonPrimitive | readonly TJsonValue[] | TJsonObject
export type TJsonObject = { readonly [key: string]: TJsonValue }

type TCallable = (...args: never[]) => void

const stringSchema = z.string()
const numberSchema = z.number()
const booleanSchema = z.boolean()
const functionSchema = z.function()

const OBJECT_FUNCTION_TAG = "[object Function]"
const OBJECT_ASYNC_FUNCTION_TAG = "[object AsyncFunction]"
const OBJECT_GENERATOR_FUNCTION_TAG = "[object GeneratorFunction]"
const OBJECT_OBJECT_TAG = "[object Object]"

function objectTag<TValue>(value: TValue): string {
  return Object.prototype.toString.call(value)
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

export function isStringValue<TValue>(value: TValue): value is TValue & string {
  return parseTString(value) !== undefined
}

export function isBooleanValue<TValue>(value: TValue): value is TValue & boolean {
  return parseTBoolean(value) !== undefined
}

export function hasFunctionValue<TValue>(value: TValue): value is TValue & TCallable {
  const tag = objectTag(value)
  if (
    tag === OBJECT_FUNCTION_TAG ||
    tag === OBJECT_ASYNC_FUNCTION_TAG ||
    tag === OBJECT_GENERATOR_FUNCTION_TAG
  ) {
    return true
  }
  return functionSchema.safeParse(value).success
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

export function parseTErrorCode<TError>(error: TError): string | undefined {
  if (!isObjectValue(error)) return undefined
  if (!("code" in error)) return undefined
  return parseTString(error.code)
}

export function stringifyCaughtError<TError>(error: TError): string {
  if (error instanceof Error) return error.message
  const text = parseTString(error)
  if (text !== undefined) return text
  return String(error)
}

export function readTString(record: TJsonObject, key: string): string | undefined {
  return parseTString(record[key])
}

export function readTBoolean(record: TJsonObject, key: string): boolean | undefined {
  return parseTBoolean(record[key])
}

export function readTNumber(record: TJsonObject, key: string): number | undefined {
  return parseTNumber(record[key])
}
