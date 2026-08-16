type TemplateSegment =
  | {
      kind: "literal"
      value: string
    }
  | {
      kind: "placeholder"
      name: string
    }

const DELIMITER_OPEN = "{{" as const
const DELIMITER_CLOSE = "}}" as const
const DELIMITER_ESCAPE_OPEN = "{{{{" as const
const DELIMITER_ESCAPE_CLOSE = "}}}}" as const
const LITERAL_OPEN = "{{" as const
const LITERAL_CLOSE = "}}" as const
const CARRIAGE_RETURN_NEWLINE = "\r\n" as const
const CARRIAGE_RETURN = "\r" as const
const NEWLINE = "\n" as const
const SURROGATE_PAIR_WIDTH = 2
const CODE_POINT_MAX_UTF16_SINGLE = 0xffff
const HTML_ENTITY_PATTERN = /&(?:#(\d+)|#x([\da-fA-F]+)|([a-zA-Z][\da-zA-Z]+));/g
const TAG_NAME_PATTERN = /<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g

const RENDERED_MARKDOWN_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
])

const HTML_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["quot", '"'],
])

type TemplateParseErrorKind =
  | "empty-placeholder"
  | "nested-placeholder"
  | "unmatched-closing-delimiter"
  | "unterminated-placeholder"

export class PromptTemplateParseError extends Error {
  readonly kind: TemplateParseErrorKind
  readonly start: number

  constructor(input: { kind: TemplateParseErrorKind; start: number }) {
    super(buildTemplateParseErrorMessage(input))
    this.name = "PromptTemplateParseError"
    this.kind = input.kind
    this.start = input.start
  }
}

type TemplateRenderErrorKind = "duplicate-value" | "extra-value" | "missing-value"

export class PromptTemplateRenderError extends Error {
  readonly kind: TemplateRenderErrorKind
  readonly variableName: string

  constructor(input: { kind: TemplateRenderErrorKind; name: string }) {
    super(buildTemplateRenderErrorMessage(input))
    this.name = "PromptTemplateRenderError"
    this.kind = input.kind
    this.variableName = input.name
  }
}

type TemplateVariables = Readonly<Record<string, string>> | ReadonlyArray<readonly [string, string]>

function buildTemplateParseErrorMessage(input: { kind: TemplateParseErrorKind; start: number }) {
  if (input.kind === "empty-placeholder") {
    return `template placeholder at position ${input.start} is empty`
  }
  if (input.kind === "nested-placeholder") {
    return `template placeholder starting at position ${input.start} contains a nested ${DELIMITER_OPEN}`
  }
  if (input.kind === "unmatched-closing-delimiter") {
    return `template contains an unmatched ${DELIMITER_CLOSE} at position ${input.start}`
  }
  return `template placeholder starting at position ${input.start} is missing ${DELIMITER_CLOSE}`
}

function buildTemplateRenderErrorMessage(input: { kind: TemplateRenderErrorKind; name: string }) {
  if (input.kind === "duplicate-value") {
    return `template value "${input.name}" was provided more than once`
  }
  if (input.kind === "extra-value") {
    return `template value "${input.name}" is not used by this template`
  }
  return `template placeholder "${input.name}" is missing a value`
}

function toVariableMap(input: TemplateVariables): Map<string, string> {
  const map = new Map<string, string>()
  if (Array.isArray(input)) {
    for (const [name, value] of input) {
      if (map.has(name)) {
        throw new PromptTemplateRenderError({
          kind: "duplicate-value",
          name,
        })
      }
      map.set(name, value)
    }
    return map
  }

  for (const [name, value] of Object.entries(input)) {
    map.set(name, value)
  }
  return map
}

function pushLiteral(segments: TemplateSegment[], literal: string) {
  if (literal.length === 0) {
    return
  }

  const previous = segments.at(-1)
  if (previous?.kind === "literal") {
    previous.value = `${previous.value}${literal}`
    return
  }

  segments.push({
    kind: "literal",
    value: literal,
  })
}

function nextCursor(source: string, cursor: number): number {
  const codePoint = source.codePointAt(cursor)
  if (codePoint === undefined) {
    return source.length
  }
  return codePoint > CODE_POINT_MAX_UTF16_SINGLE ? cursor + SURROGATE_PAIR_WIDTH : cursor + 1
}

function parsePlaceholder(source: string, start: number): readonly [string, number] {
  const placeholderStart = start + DELIMITER_OPEN.length
  let cursor = placeholderStart

  while (cursor < source.length) {
    const rest = source.slice(cursor)
    if (rest.startsWith(DELIMITER_OPEN)) {
      throw new PromptTemplateParseError({
        kind: "nested-placeholder",
        start,
      })
    }
    if (rest.startsWith(DELIMITER_CLOSE)) {
      const placeholder = source.slice(placeholderStart, cursor).trim()
      if (placeholder.length === 0) {
        throw new PromptTemplateParseError({
          kind: "empty-placeholder",
          start,
        })
      }

      return [placeholder, cursor + DELIMITER_CLOSE.length]
    }
    cursor = nextCursor(source, cursor)
  }

  throw new PromptTemplateParseError({
    kind: "unterminated-placeholder",
    start,
  })
}

function normalizeLineEndings(source: string): string {
  if (!source.includes(CARRIAGE_RETURN)) {
    return source
  }

  return source.replaceAll(CARRIAGE_RETURN_NEWLINE, NEWLINE).replaceAll(CARRIAGE_RETURN, NEWLINE)
}

function decodeHtmlEntity(input: string): string {
  return input.replace(
    HTML_ENTITY_PATTERN,
    (
      match: string,
      decimal: string | undefined,
      hexadecimal: string | undefined,
      named: string | undefined,
    ) => {
      if (decimal !== undefined) {
        const codePoint = Number.parseInt(decimal, 10)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
      }

      if (hexadecimal !== undefined) {
        const codePoint = Number.parseInt(hexadecimal, 16)
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
      }

      return named !== undefined ? (HTML_ENTITIES.get(named) ?? match) : match
    },
  )
}

function tagNames(source: string): string[] {
  return [...source.matchAll(TAG_NAME_PATTERN)].map((match) => match[1]?.toLowerCase() ?? "")
}

function looksLikeRenderedMarkdown(source: string): boolean {
  const tags = tagNames(source)
  if (tags.length === 0) {
    return false
  }

  const firstTag = tags[0]
  if (!RENDERED_MARKDOWN_TAGS.has(firstTag)) {
    return false
  }

  return tags.every((tag) => RENDERED_MARKDOWN_TAGS.has(tag))
}

function normalizeRenderedMarkdown(source: string): string {
  const trimmed = source.trim()
  if (!trimmed.startsWith("<") || !trimmed.includes("</") || !looksLikeRenderedMarkdown(trimmed)) {
    return source
  }

  return decodeHtmlEntity(
    trimmed
      .replaceAll(/<\/p>\s*<p>/g, "\n\n")
      .replaceAll(/<p>/g, "")
      .replaceAll(/<\/p>/g, "")
      .replaceAll(/<br\s*\/?>/g, "\n")
      .replaceAll("<code>", "`")
      .replaceAll("</code>", "`")
      .replaceAll(/<[^>]+>/g, ""),
  )
}

export class PromptTemplate {
  private readonly placeholders: ReadonlySet<string>
  private readonly segments: readonly TemplateSegment[]

  private constructor(input: {
    placeholders: ReadonlySet<string>
    segments: readonly TemplateSegment[]
  }) {
    this.placeholders = input.placeholders
    this.segments = input.segments
  }

  static parse(source: string): PromptTemplate {
    const placeholders = new Set<string>()
    const segments: TemplateSegment[] = []
    let literalStart = 0
    let cursor = 0

    while (cursor < source.length) {
      const rest = source.slice(cursor)

      if (rest.startsWith(DELIMITER_ESCAPE_OPEN)) {
        pushLiteral(segments, source.slice(literalStart, cursor))
        pushLiteral(segments, LITERAL_OPEN)
        cursor += DELIMITER_ESCAPE_OPEN.length
        literalStart = cursor
        continue
      }

      if (rest.startsWith(DELIMITER_ESCAPE_CLOSE)) {
        pushLiteral(segments, source.slice(literalStart, cursor))
        pushLiteral(segments, LITERAL_CLOSE)
        cursor += DELIMITER_ESCAPE_CLOSE.length
        literalStart = cursor
        continue
      }

      if (rest.startsWith(DELIMITER_OPEN)) {
        pushLiteral(segments, source.slice(literalStart, cursor))
        const [placeholder, next] = parsePlaceholder(source, cursor)
        placeholders.add(placeholder)
        segments.push({
          kind: "placeholder",
          name: placeholder,
        })
        cursor = next
        literalStart = cursor
        continue
      }

      if (rest.startsWith(DELIMITER_CLOSE)) {
        throw new PromptTemplateParseError({
          kind: "unmatched-closing-delimiter",
          start: cursor,
        })
      }

      cursor = nextCursor(source, cursor)
    }

    pushLiteral(segments, source.slice(literalStart))

    return new PromptTemplate({
      placeholders,
      segments,
    })
  }

  placeholderNames(): readonly string[] {
    return [...this.placeholders].toSorted((left, right) => left.localeCompare(right))
  }

  render(variables: TemplateVariables): string {
    const valueMap = toVariableMap(variables)

    for (const placeholder of this.placeholders) {
      if (!valueMap.has(placeholder)) {
        throw new PromptTemplateRenderError({
          kind: "missing-value",
          name: placeholder,
        })
      }
    }

    for (const variableName of valueMap.keys()) {
      if (!this.placeholders.has(variableName)) {
        throw new PromptTemplateRenderError({
          kind: "extra-value",
          name: variableName,
        })
      }
    }

    let rendered = ""
    for (const segment of this.segments) {
      if (segment.kind === "literal") {
        rendered = `${rendered}${segment.value}`
        continue
      }

      const value = valueMap.get(segment.name)
      if (value === undefined) {
        throw new PromptTemplateRenderError({
          kind: "missing-value",
          name: segment.name,
        })
      }

      rendered = `${rendered}${value}`
    }

    return rendered
  }
}

export function parsePromptTemplate(source: string): PromptTemplate {
  return PromptTemplate.parse(source)
}

type PromptTemplateDefinition = {
  source: string
  debugName: string
}

export function definePromptTemplate(input: PromptTemplateDefinition): PromptTemplate {
  const normalized = normalizeLineEndings(normalizeRenderedMarkdown(input.source))
  try {
    return parsePromptTemplate(normalized)
  } catch (error) {
    if (error instanceof PromptTemplateParseError) {
      throw new Error(`embedded template "${input.debugName}" is invalid: ${error.message}`, {
        cause: error,
      })
    }
    throw error
  }
}
