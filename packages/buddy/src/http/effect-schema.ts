import { Option, Schema } from "effect"
import z from "zod"

type TEffectDecoder<TValue = unknown> = Schema.Decoder<TValue, never>
type TDecoded<S extends TEffectDecoder> = S["Type"]

export function toOpenApiSchema<S extends TEffectDecoder>(schema: S) {
  return Schema.toStandardSchemaV1(schema)
}

export function decodeSchema<S extends TEffectDecoder, TValue>(
  schema: S,
  value: TValue,
): TDecoded<S> {
  return Schema.decodeUnknownSync(schema)(value)
}

export function safeDecodeSchema<S extends TEffectDecoder, TValue>(schema: S, value: TValue) {
  const decoded = Schema.decodeUnknownOption(schema)(value)
  return Option.isSome(decoded)
    ? ({ success: true, data: decoded.value } as const)
    : ({ success: false } as const)
}

export function zodFromEffectSchema<S extends TEffectDecoder>(schema: S): z.ZodType<TDecoded<S>> {
  return z.unknown().transform((value, ctx): TDecoded<S> => {
    const decoded = safeDecodeSchema(schema, value)
    if (decoded.success) {
      return decoded.data
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid value",
    })
    return z.NEVER
  })
}
