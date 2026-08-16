import { z } from "zod"

export type TJsonPrimitive = string | number | boolean | null
export type TJsonValue = TJsonPrimitive | readonly TJsonValue[] | TJsonObject
export type TJsonObject = { readonly [key: string]: TJsonValue }

export type TBuddyRendererGlobals = {
  assetBaseUrl?: string
  deepLinks?: string[]
  devInstanceName?: string
  iconUrl?: string
  updaterEnabled?: boolean
  version?: string
}

export type TPortedAddress = {
  port: number
}

type TCallable = (...args: never[]) => void

const stringSchema = z.string()
const numberSchema = z.number()
const booleanSchema = z.boolean()
const functionSchema = z.function()
const buddyRendererGlobalsSchema = z.object({
  assetBaseUrl: z.string().optional(),
  deepLinks: z.array(z.string()).optional(),
  devInstanceName: z.string().optional(),
  iconUrl: z.string().optional(),
  updaterEnabled: z.boolean().optional(),
  version: z.string().optional(),
})

const OBJECT_FUNCTION_TAG = "[object Function]"
const OBJECT_ASYNC_FUNCTION_TAG = "[object AsyncFunction]"
const OBJECT_GENERATOR_FUNCTION_TAG = "[object GeneratorFunction]"
const OBJECT_OBJECT_TAG = "[object Object]"
const BUDDY_RENDERER_GLOBALS_KEY = "__BUDDY__"

function objectTag<TValue>(value: TValue): string {
  return Object.prototype.toString.call(value)
}

export function parseWithSchema<TSchema extends z.ZodType, TValue>(
  schema: TSchema,
  value: TValue,
): z.output<TSchema> | undefined {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseTString<TValue>(value: TValue): string | undefined {
  return parseWithSchema(stringSchema, value)
}

export function parseTNonEmptyString<TValue>(value: TValue): string | undefined {
  const text = parseTString(value)
  if (text === undefined || text.length === 0) return undefined
  return text
}

export function parseTNumber<TValue>(value: TValue): number | undefined {
  return parseWithSchema(numberSchema, value)
}

export function parseTBoolean<TValue>(value: TValue): boolean | undefined {
  return parseWithSchema(booleanSchema, value)
}

export function isFunctionValue<TValue>(value: TValue): value is TValue & TCallable {
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
  if (isFunctionValue(value)) return false
  return Object(value) === value
}

export function isRecord<TValue>(value: TValue): value is TValue & TJsonObject {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return false
  return objectTag(value) === OBJECT_OBJECT_TAG
}

export function parseTJsonObject<TValue>(value: TValue): TJsonObject | undefined {
  return isRecord(value) ? value : undefined
}

export function parseTPortedAddress<TValue>(value: TValue): TPortedAddress | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const port = parseTNumber(record.port)
  if (port === undefined) return undefined
  return { port }
}

export function parseTErrorCode<TValue>(value: TValue): string | undefined {
  if (!isObjectValue(value)) return undefined
  if (!("code" in value)) return undefined
  return parseTString(value.code)
}

export function readBuddyRendererGlobals<TValue>(source: TValue): TBuddyRendererGlobals | undefined {
  if (!isObjectValue(source)) return undefined
  if (!(BUDDY_RENDERER_GLOBALS_KEY in source)) return undefined
  const descriptor = Object.getOwnPropertyDescriptor(source, BUDDY_RENDERER_GLOBALS_KEY)
  return parseWithSchema(buddyRendererGlobalsSchema, descriptor?.value)
}
