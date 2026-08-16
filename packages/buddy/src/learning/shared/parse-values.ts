import z from "zod"
import { parseNodeErrorCode, parsePermissionAction } from "../../config/parse-values"
import {
  parseJsonObject,
  parseJsonValue,
  parsePromptString,
  type TJsonObject,
  type TJsonValue,
} from "../prompt/utils"

export type TLearningJsonObject = TJsonObject
export type TLearningJsonValue = TJsonValue

export type TExplicitModel = {
  providerID: string
  modelID: string
}

export type TOpenCodeErrorPayload = {
  name?: string
  message?: string
  data?: {
    message?: string
  }
}

const openCodeErrorPayloadSchema = z.object({
  name: z.string().optional(),
  message: z.string().optional(),
  data: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
})

export function parseTLearningJsonObject<TValue>(value: TValue): TLearningJsonObject | undefined {
  return parseJsonObject(value)
}

export function parseTLearningJsonValue<TValue>(value: TValue): TLearningJsonValue | undefined {
  return parseJsonValue(value)
}

export function parseTExplicitModel<TValue>(value: TValue): TExplicitModel | undefined {
  const record = parseJsonObject(value)
  if (record === undefined) return undefined
  const providerID = parsePromptString(record.providerID)
  const modelID = parsePromptString(record.modelID)
  if (providerID === undefined || modelID === undefined) return undefined
  return { providerID, modelID }
}

export function parseTErrorMessage<TError>(error: TError): string {
  if (error instanceof Error) return error.message
  const text = parsePromptString(error)
  if (text !== undefined) return text
  return String(error)
}

export function parseTNodeErrorCode<TError>(error: TError): string | undefined {
  return parseNodeErrorCode(error)
}

export function parseTOpenCodeErrorPayload<TError>(error: TError): TOpenCodeErrorPayload | undefined {
  if (error instanceof Error) {
    const parsed = openCodeErrorPayloadSchema.safeParse(error)
    const dataMessage = parsed.success ? parsed.data.data?.message : undefined
    return Object.assign(
      {
        name: error.name,
        message: error.message,
      },
      dataMessage !== undefined ? { data: { message: dataMessage } } : undefined,
    )
  }

  const parsed = openCodeErrorPayloadSchema.safeParse(error)
  if (!parsed.success) return undefined
  return parsed.data
}

export function parseTPermissionAction<TValue>(value: TValue) {
  return parsePermissionAction(value)
}

export function parseTJsonTextValue(source: string): TLearningJsonValue | undefined {
  try {
    return parseJsonValue(JSON.parse(source))
  } catch {
    return undefined
  }
}
