import z from "zod"

export type TConfigJsonValue =
  | string
  | number
  | boolean
  | null
  | TConfigJsonValue[]
  | TConfigJsonObject

export type TConfigJsonObject = {
  [key: string]: TConfigJsonValue | undefined
}

export type TConfiguredModel = {
  providerID: string
  modelID: string
}

const PERMISSION_ACTIONS = ["ask", "allow", "deny"] as const
export type TPermissionAction = (typeof PERMISSION_ACTIONS)[number]

const stringSchema = z.string()
const permissionActionSchema = z.enum(PERMISSION_ACTIONS)
const configJsonValueSchema: z.ZodType<TConfigJsonValue> = z.json()

export function parseConfigString<TValue>(value: TValue): string | undefined {
  const parsed = stringSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parsePermissionAction<TValue>(value: TValue): TPermissionAction | undefined {
  const parsed = permissionActionSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseConfigJsonValue<TValue>(value: TValue): TConfigJsonValue | undefined {
  const parsed = configJsonValueSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export function parseConfigObject<TValue>(value: TValue): TConfigJsonObject | undefined {
  if (!isConfigObject(value)) return undefined
  return value
}

export function parseCaughtErrorMessage<TError>(error: TError): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function parseNodeErrorCode<TError>(error: TError): string | undefined {
  if (error instanceof Error && "code" in error) {
    return parseConfigString(error.code)
  }

  const record = parseConfigObject(error)
  if (record === undefined) return undefined
  return parseConfigString(record.code)
}

function isConfigObject<TValue>(value: TValue): value is TValue & TConfigJsonObject {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return false
  return value instanceof Object
}
