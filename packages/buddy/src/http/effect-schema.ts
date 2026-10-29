import { Option, Schema, SchemaAST } from "effect"
import z from "zod"

type TEffectDecoder<TValue = unknown> = Schema.Decoder<TValue, never>
type TDecoded<S extends TEffectDecoder> = S["Type"]

const jsonBodyAsts = new WeakMap<SchemaAST.AST, SchemaAST.AST>()

function toJsonBodyAst(ast: SchemaAST.AST): SchemaAST.AST {
  const cached = jsonBodyAsts.get(ast)
  if (cached) return cached
  const jsonBody = rebuildJsonBodyAst(ast)
  jsonBodyAsts.set(ast, jsonBody)
  return jsonBody
}

function toJsonBodyPropertyAst(ast: SchemaAST.AST): SchemaAST.AST {
  if (!SchemaAST.isOptional(ast) || !SchemaAST.isUnion(ast)) return toJsonBodyAst(ast)
  const present = ast.types.filter((member) => !SchemaAST.isUndefined(member))
  if (present.length === 0 || present.length === ast.types.length) return toJsonBodyAst(ast)
  return new SchemaAST.Union(
    present.map(toJsonBodyAst),
    ast.mode,
    ast.annotations,
    ast.checks,
    ast.encoding,
    ast.context,
    ast.encodingChecks,
  )
}

function rebuildJsonBodyAst(ast: SchemaAST.AST): SchemaAST.AST {
  if (SchemaAST.isObjects(ast)) {
    return new SchemaAST.Objects(
      ast.propertySignatures.map(
        (property) =>
          new SchemaAST.PropertySignature(property.name, toJsonBodyPropertyAst(property.type)),
      ),
      ast.indexSignatures.map(
        (signature) =>
          new SchemaAST.IndexSignature(signature.parameter, toJsonBodyAst(signature.type)),
      ),
      ast.annotations,
      ast.checks,
      ast.encoding,
      ast.context,
      ast.encodingChecks,
    )
  }
  if (SchemaAST.isUnion(ast)) {
    return new SchemaAST.Union(
      ast.types.map(toJsonBodyAst),
      ast.mode,
      ast.annotations,
      ast.checks,
      ast.encoding,
      ast.context,
      ast.encodingChecks,
    )
  }
  if (SchemaAST.isArrays(ast)) {
    return new SchemaAST.Arrays(
      ast.isMutable,
      ast.elements.map(toJsonBodyAst),
      ast.rest.map(toJsonBodyAst),
      ast.annotations,
      ast.checks,
      ast.encoding,
      ast.context,
      ast.encodingChecks,
    )
  }
  if (SchemaAST.isSuspend(ast)) {
    return new SchemaAST.Suspend(
      () => toJsonBodyAst(ast.thunk()),
      ast.annotations,
      ast.checks,
      ast.encoding,
      ast.context,
    )
  }
  return ast
}

export function toOpenApiSchema<S extends TEffectDecoder>(schema: S) {
  return Schema.toStandardSchemaV1(
    Schema.make<Schema.Codec<S["Type"], S["Encoded"]>>(toJsonBodyAst(schema.ast)),
  )
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
