import { z } from "zod"

export type TJsonPrimitive = string | number | boolean | null
export type TJsonValue = TJsonPrimitive | readonly TJsonValue[] | TJsonObject
export type TJsonObject = { readonly [key: string]: TJsonValue }

export type TPartTime = {
  start?: number
  end?: number
}

export type ToolState = {
  status: "pending" | "running" | "completed" | "error"
  input: TJsonObject
  metadata: TJsonObject
  attachments: ToolAttachment[]
  start?: number
  end?: number
  output?: string
  error?: string
  title?: string
}

export type ToolAttachment = {
  id: string
  mime: string
  url: string
  filename?: string
}

export type ToolInfo = {
  title: string
  subtitle?: string
  detail?: string
  summary?: string
  args?: string[]
}

const stringSchema = z.string()
const numberSchema = z.number()
const booleanSchema = z.boolean()

export const EMPTY_JSON_OBJECT: TJsonObject = {}

export function isRecord<TValue>(value: TValue): value is TValue & TJsonObject {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return false
  return Object.prototype.toString.call(value) === "[object Object]"
}

export function parseTJsonObject<TValue>(value: TValue): TJsonObject | undefined {
  return isRecord(value) ? value : undefined
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

export function parseTPartTime<TValue>(value: TValue): TPartTime | undefined {
  const record = parseTJsonObject(value)
  if (!record) return undefined
  const start = parseTNumber(record.start)
  const end = parseTNumber(record.end)
  return Object.assign(
    {},
    start !== undefined ? { start } : undefined,
    end !== undefined ? { end } : undefined,
  )
}

export function readString<TValue>(value: TValue): string | undefined {
  return parseTString(value)
}

export function readNonEmptyString<TValue>(value: TValue): string | undefined {
  const text = parseTString(value)
  if (text === undefined) return undefined
  const trimmed = text.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function readNonNegativeInt<TValue>(value: TValue): number | undefined {
  const numeric = parseTNumber(value)
  if (numeric === undefined || !Number.isInteger(numeric) || numeric < 0) return undefined
  return numeric
}
