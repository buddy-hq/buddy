import { Option, Schema } from "effect"
import z from "zod"

type Decoder<T = unknown> = Schema.Decoder<T, never>
type Decoded<S extends Decoder> = S["Type"]

export function toOpenApiSchema<S extends Decoder>(schema: S) {
  return Schema.toStandardSchemaV1(schema)
}

export function decodeSchema<S extends Decoder>(schema: S, value: unknown): Decoded<S> {
  return Schema.decodeUnknownSync(schema)(value)
}

export function safeDecodeSchema<S extends Decoder>(schema: S, value: unknown) {
  const decoded = Schema.decodeUnknownOption(schema)(value)
  return Option.isSome(decoded)
    ? ({ success: true, data: decoded.value } as const)
    : ({ success: false } as const)
}

export function zodFromEffectSchema<S extends Decoder>(schema: S): z.ZodType<Decoded<S>> {
  return z.unknown().transform((value, ctx) => {
    const decoded = safeDecodeSchema(schema, value)
    if (decoded.success) {
      return decoded.data
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid value",
    })
    return z.NEVER
  }) as z.ZodType<Decoded<S>>
}
