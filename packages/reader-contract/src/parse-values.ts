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

export function parseTFiniteNumber<TValue>(value: TValue): number | undefined {
  if (objectTag(value) !== OBJECT_NUMBER_TAG) return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
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

export function parseTNonNegativeInteger<TValue>(value: TValue): number | undefined {
  const numeric = parseTFiniteNumber(value)
  if (numeric === undefined) return undefined
  if (!Number.isInteger(numeric) || numeric < 0) return undefined
  return numeric
}
