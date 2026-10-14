type ToolParameterSchema = {
  readonly type?: string
  readonly description?: string
  readonly enum?: readonly unknown[]
  readonly anyOf?: readonly ToolParameterSchema[]
  readonly properties?: Readonly<Record<string, ToolParameterSchema>>
  readonly required?: readonly string[]
  readonly items?: ToolParameterSchema
  readonly minItems?: number
  readonly maxItems?: number
  readonly minimum?: number
  readonly maximum?: number
}

export type ToolSignatureTokenRole =
  | "tool"
  | "field"
  | "optional"
  | "type"
  | "literal"
  | "punctuation"

export type ToolSignatureToken = {
  readonly role: ToolSignatureTokenRole
  readonly text: string
}

export type ToolSignatureLine =
  | {
      readonly id: number
      readonly kind: "code"
      readonly depth: number
      readonly tokens: readonly (ToolSignatureToken & { readonly id: number })[]
    }
  | { readonly id: number; readonly kind: "note"; readonly depth: number; readonly text: string }
  | { readonly id: number; readonly kind: "gap" }

type ToolSignatureType = {
  readonly head: readonly ToolSignatureToken[]
  readonly body?: ToolParameterSchema
  readonly tail: readonly ToolSignatureToken[]
}

type ToolSignatureWriter = {
  readonly code: (depth: number, tokens: readonly ToolSignatureToken[]) => void
  readonly note: (depth: number, text: string) => void
  readonly gap: () => void
}

function token(role: ToolSignatureTokenRole, text: string): ToolSignatureToken {
  return { role, text }
}

function joinUnion(options: readonly (readonly ToolSignatureToken[])[]) {
  return options.flatMap((option, index) =>
    index === 0 ? option : [token("punctuation", " | "), ...option],
  )
}

function formatRange(min: number | undefined, max: number | undefined, unit: string) {
  if (min !== undefined && max !== undefined) return `${min}–${max}${unit}.`
  if (min !== undefined) return `At least ${min}${unit}.`
  if (max !== undefined) return `At most ${max}${unit}.`
  return undefined
}

function formatPropertyRange(property: ToolParameterSchema) {
  if (property.type === "array") return formatRange(property.minItems, property.maxItems, " items")
  return formatRange(property.minimum, property.maximum, "")
}

function inlineType(schema: ToolParameterSchema) {
  const type = signatureType(schema)
  return type.body ? [token("type", "object")] : [...type.head, ...type.tail]
}

function signatureType(schema: ToolParameterSchema): ToolSignatureType {
  if (schema.enum) {
    return {
      head: joinUnion(schema.enum.map((value) => [token("literal", JSON.stringify(value))])),
      tail: [],
    }
  }
  if (schema.anyOf) return { head: joinUnion(schema.anyOf.map(inlineType)), tail: [] }
  switch (schema.type) {
    case "string":
    case "boolean":
    case "null":
      return { head: [token("type", schema.type)], tail: [] }
    case "number":
    case "integer":
      return { head: [token("type", "number")], tail: [] }
    case "array": {
      const item = signatureType(schema.items ?? {})
      return {
        head: [token("type", "Array"), token("punctuation", "<"), ...item.head],
        body: item.body,
        tail: [...item.tail, token("punctuation", ">")],
      }
    }
    case "object":
      if (Object.keys(schema.properties ?? {}).length === 0) {
        return { head: [token("punctuation", "{}")], tail: [] }
      }
      return { head: [token("punctuation", "{")], body: schema, tail: [token("punctuation", "}")] }
    default:
      return { head: [token("type", "unknown")], tail: [] }
  }
}

function writeFields(writer: ToolSignatureWriter, schema: ToolParameterSchema, depth: number) {
  const required = new Set(schema.required ?? [])
  Object.entries(schema.properties ?? {}).forEach(([name, property], index) => {
    const notes: string[] = []
    const description = property.description?.trim()
    if (description) notes.push(description)
    const range = formatPropertyRange(property)
    if (range) notes.push(range)

    if (index > 0 && notes.length > 0) writer.gap()
    for (const note of notes) writer.note(depth, note)

    const field = [
      token("field", name),
      ...(required.has(name) ? [] : [token("optional", "?")]),
      token("punctuation", ": "),
    ]
    const type = signatureType(property)
    if (!type.body) {
      writer.code(depth, [...field, ...type.head, ...type.tail, token("punctuation", ",")])
      return
    }
    writer.code(depth, [...field, ...type.head])
    writeFields(writer, type.body, depth + 1)
    writer.code(depth, [...type.tail, token("punctuation", ",")])
  })
}

export function formatToolSignature(name: string, parametersJson: string) {
  const schema: ToolParameterSchema = JSON.parse(parametersJson)
  const lines: ToolSignatureLine[] = []
  const writer: ToolSignatureWriter = {
    code: (depth, tokens) =>
      lines.push({
        id: lines.length,
        kind: "code",
        depth,
        tokens: tokens.map((part, position) => ({ ...part, id: position })),
      }),
    note: (depth, text) => lines.push({ id: lines.length, kind: "note", depth, text }),
    gap: () => lines.push({ id: lines.length, kind: "gap" }),
  }
  writer.code(0, [token("tool", name), token("punctuation", "({")])
  writeFields(writer, schema, 1)
  writer.code(0, [token("punctuation", "})")])
  return lines
}
