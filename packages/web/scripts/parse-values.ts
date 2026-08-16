export type TJsonPrimitive = string | number | boolean | null
export type TJsonValue = TJsonPrimitive | readonly TJsonValue[] | TJsonObject
export type TJsonObject = { readonly [key: string]: TJsonValue }

const OBJECT_STRING_TAG = "[object String]"

function objectTag<TValue>(value: TValue): string {
  return Object.prototype.toString.call(value)
}

export function parseTString<TValue>(value: TValue): string | undefined {
  return objectTag(value) === OBJECT_STRING_TAG ? `${value}` : undefined
}

export function stringifyCaughtError<TError>(error: TError): string {
  if (error instanceof Error) return error.message
  const text = parseTString(error)
  if (text !== undefined) return text
  return String(error)
}
