export type TJsonPrimitive = string | number | boolean | null
export type TJsonValue = TJsonPrimitive | readonly TJsonValue[] | TJsonObject
export type TJsonObject = { readonly [key: string]: TJsonValue }

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
