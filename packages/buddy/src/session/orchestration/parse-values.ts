import z from "zod"
import {
  parseJsonObject,
  parsePromptBoolean,
  parsePromptFiniteNumber,
  parsePromptString,
  type TJsonObject,
} from "../../learning/prompt/utils"

export type TSessionJsonObject = TJsonObject

const sessionIntegerSchema = z.number().int()
const sessionJsonValidatorSchema = z.function({
  input: [z.literal("json")],
  output: z.json(),
})
const openCodeErrorPayloadSchema = z.object({
  name: z.string().optional(),
  message: z.string().optional(),
  data: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
})

export type TOpenCodeErrorPayload = {
  name?: string
  message?: string
  data?: {
    message?: string
  }
}

export function parseTSessionJsonObject<TValue>(value: TValue): TSessionJsonObject | undefined {
  return parseJsonObject(value)
}

export function parseTSessionString<TValue>(value: TValue): string | undefined {
  return parsePromptString(value)
}

export function parseTSessionNumber<TValue>(value: TValue): number | undefined {
  return parsePromptFiniteNumber(value)
}

export function parseTSessionBoolean<TValue>(value: TValue): boolean | undefined {
  return parsePromptBoolean(value)
}

export function parseTSessionInteger<TValue>(value: TValue): number | undefined {
  const parsed = sessionIntegerSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export type TSessionJsonValidator = (target: "json") => TSessionJsonObject

export function parseTSessionJsonValidator<TValue>(value: TValue): TSessionJsonValidator | undefined {
  const parsed = sessionJsonValidatorSchema.safeParse(value)
  if (!parsed.success) {
    return undefined
  }
  return (target) => parseTSessionJsonObject(parsed.data(target)) ?? {}
}

export function parseTOpenCodeErrorPayload<TValue>(value: TValue): TOpenCodeErrorPayload | undefined {
  const parsed = openCodeErrorPayloadSchema.safeParse(value)
  if (!parsed.success) {
    return undefined
  }
  return parsed.data
}
