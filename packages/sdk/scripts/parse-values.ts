export type TJsonPrimitive = string | number | boolean | null
export type TJsonValue = TJsonPrimitive | readonly TJsonValue[] | TJsonObject
export type TJsonObject = { readonly [key: string]: TJsonValue }

type TCallable = (...args: never[]) => void

const OBJECT_FUNCTION_TAG = "[object Function]"
const OBJECT_ASYNC_FUNCTION_TAG = "[object AsyncFunction]"
const OBJECT_GENERATOR_FUNCTION_TAG = "[object GeneratorFunction]"
const OBJECT_OBJECT_TAG = "[object Object]"

function objectTag<TValue>(value: TValue): string {
  return Object.prototype.toString.call(value)
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
