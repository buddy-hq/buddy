import { Type, type TSchema } from "typebox"

type JsonSchemaObject = Record<string, unknown>

function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function jsonSchemaType(value: JsonSchemaObject): string | undefined {
  return typeof value.type === "string" ? value.type : undefined
}

function schemaDescription(value: JsonSchemaObject): string | undefined {
  return typeof value.description === "string" ? value.description : undefined
}

function unescapeJsonPointer(segment: string) {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~")
}

function resolveJsonPointer(root: JsonSchemaObject, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return undefined
  }

  let current: unknown = root
  for (const segment of ref.slice(2).split("/").map(unescapeJsonPointer)) {
    if (!isJsonSchemaObject(current) || !(segment in current)) {
      return undefined
    }
    current = current[segment]
  }

  return current
}

function literalSchema(value: unknown): TSchema {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return Type.Literal(value)
  }
  if (value === null) return Type.Null()
  return Type.Unknown()
}

function unionSchema(items: readonly TSchema[]): TSchema {
  if (items.length === 0) return Type.Unknown()
  if (items.length === 1) return items[0] ?? Type.Unknown()
  return Type.Union([...items])
}

function typeboxObjectFromJsonSchema(value: JsonSchemaObject, root: JsonSchemaObject): TSchema {
  const properties = isJsonSchemaObject(value.properties) ? value.properties : {}
  const required = new Set(stringArray(value.required))
  const typeboxProperties: Record<string, TSchema> = {}

  for (const [key, property] of Object.entries(properties)) {
    const propertySchema = typeboxSchemaFromJsonSchema(property, root)
    typeboxProperties[key] = required.has(key) ? propertySchema : Type.Optional(propertySchema)
  }

  const description = schemaDescription(value)
  return Type.Object(typeboxProperties, {
    ...(description ? { description } : {}),
    additionalProperties: value.additionalProperties === true,
  })
}

export function typeboxSchemaFromJsonSchema(
  value: unknown,
  root?: JsonSchemaObject,
): TSchema {
  if (!isJsonSchemaObject(value)) return Type.Unknown()

  const schemaRoot = root ?? value

  if (typeof value.$ref === "string") {
    const resolved = resolveJsonPointer(schemaRoot, value.$ref)
    if (resolved !== undefined && resolved !== value) {
      return typeboxSchemaFromJsonSchema(resolved, schemaRoot)
    }
  }

  if ("const" in value) return literalSchema(value.const)
  if (Array.isArray(value.enum)) {
    return unionSchema(value.enum.map((item) => literalSchema(item)))
  }
  if (Array.isArray(value.anyOf)) {
    return unionSchema(value.anyOf.map((item) => typeboxSchemaFromJsonSchema(item, schemaRoot)))
  }
  if (Array.isArray(value.oneOf)) {
    return unionSchema(value.oneOf.map((item) => typeboxSchemaFromJsonSchema(item, schemaRoot)))
  }

  const description = schemaDescription(value)
  switch (jsonSchemaType(value)) {
    case "string":
      return Type.String(description ? { description } : {})
    case "number":
      return Type.Number(description ? { description } : {})
    case "integer":
      return Type.Integer(description ? { description } : {})
    case "boolean":
      return Type.Boolean(description ? { description } : {})
    case "null":
      return Type.Null()
    case "array":
      return Type.Array(
        typeboxSchemaFromJsonSchema(value.items, schemaRoot),
        description ? { description } : {},
      )
    case "object":
      return typeboxObjectFromJsonSchema(value, schemaRoot)
    default:
      return Type.Unknown()
  }
}
