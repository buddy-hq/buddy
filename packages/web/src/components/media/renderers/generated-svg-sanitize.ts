const EXECUTABLE_SVG_ELEMENT_NAMES = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
] as const

const HTML_CHARACTER_REFERENCES: Record<string, string> = {
  amp: "&",
  apos: "'",
  colon: ":",
  gt: ">",
  lt: "<",
  NewLine: "\n",
  quot: '"',
  Tab: "\t",
}

const HTML_CHARACTER_REFERENCE_PATTERN =
  /&(?:#x([\da-f]+)|#(\d+)|([A-Za-z][A-Za-z\d]+));?/giu
const UNSAFE_REFERENCE_SCHEME_PATTERN = /^(?:javascript:|data:text\/html)/iu
const MIN_URL_SCHEME_IGNORED_CODE_POINT = 0x00
const MAX_URL_SCHEME_SPACE_CODE_POINT = 0x20
const MIN_URL_SCHEME_CONTROL_CODE_POINT = 0x7f
const MAX_URL_SCHEME_CONTROL_CODE_POINT = 0x9f
const MAX_REFERENCE_DECODE_PASSES = 3

function decodeHtmlCharacterReference(
  match: string,
  hexValue: string | undefined,
  decimalValue: string | undefined,
  namedValue: string | undefined,
): string {
  const numericValue = hexValue
    ? Number.parseInt(hexValue, 16)
    : decimalValue
      ? Number.parseInt(decimalValue, 10)
      : undefined
  if (numericValue !== undefined) {
    try {
      return String.fromCodePoint(numericValue)
    } catch {
      return match
    }
  }

  if (namedValue !== undefined) {
    return HTML_CHARACTER_REFERENCES[namedValue] ?? match
  }

  return match
}

function decodeHtmlCharacterReferences(value: string): string {
  let decoded = value

  for (let pass = 0; pass < MAX_REFERENCE_DECODE_PASSES; pass += 1) {
    const next = decoded.replace(HTML_CHARACTER_REFERENCE_PATTERN, decodeHtmlCharacterReference)
    if (next === decoded) return decoded
    decoded = next
  }

  return decoded
}

function stripUrlSchemeIgnoredCodePoints(value: string): string {
  let result = ""

  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined) continue
    if (
      codePoint >= MIN_URL_SCHEME_IGNORED_CODE_POINT &&
      codePoint <= MAX_URL_SCHEME_SPACE_CODE_POINT
    ) {
      continue
    }
    if (
      codePoint >= MIN_URL_SCHEME_CONTROL_CODE_POINT &&
      codePoint <= MAX_URL_SCHEME_CONTROL_CODE_POINT
    ) {
      continue
    }

    result += character
  }

  return result
}

function canonicalizeReferenceValue(value: string): string {
  return stripUrlSchemeIgnoredCodePoints(decodeHtmlCharacterReferences(value).trim())
}

function isUnsafeReferenceValue(value: string): boolean {
  return UNSAFE_REFERENCE_SCHEME_PATTERN.test(canonicalizeReferenceValue(value))
}

function sanitizeReferenceAttribute(attributeName: string, rawValue: string): string {
  const quote =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue[0]
      : undefined
  const value = quote ? rawValue.slice(1, -1).trim() : rawValue.trim()

  if (isUnsafeReferenceValue(value)) {
    return ""
  }

  return ` ${attributeName}=${quote ?? '"'}${value}${quote ?? '"'}`
}

function sanitizeSvgTagAttributes(source: string): string {
  return source.replace(
    /<([A-Za-z_][\w:.-]*)(\s[^<>]*?)?(\/?)>/gu,
    (
      fullMatch: string,
      tagName: string,
      rawAttributes: string | undefined = "",
      selfClosing: string,
    ) => {
      if (fullMatch.startsWith("</")) return fullMatch

      let attributes = rawAttributes
      attributes = attributes.replace(/\s+on[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
      attributes = attributes.replace(
        /\s+(href|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu,
        (_: string, attributeName: string, rawValue: string) =>
          sanitizeReferenceAttribute(attributeName, rawValue),
      )

      return `<${tagName}${attributes}${selfClosing}>`
    },
  )
}

function stripExecutableSvgElements(source: string): string {
  let sanitized = source

  for (const name of EXECUTABLE_SVG_ELEMENT_NAMES) {
    const paired = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}\\s*>`, "giu")
    const selfClosing = new RegExp(`<${name}\\b[^>]*/>`, "giu")
    sanitized = sanitized.replace(paired, "")
    sanitized = sanitized.replace(selfClosing, "")
  }

  return sanitized
}

export function sanitizeGeneratedSvg(svg: string): string {
  const trimmed = sanitizeSvgTagAttributes(stripExecutableSvgElements(svg.trim()))
  if (typeof window === "undefined") {
    return trimmed
  }

  const document = new DOMParser().parseFromString(trimmed, "image/svg+xml")
  const root = document.documentElement
  if (!(root instanceof SVGSVGElement)) {
    return trimmed
  }

  for (const element of Array.from(
    root.querySelectorAll("script, iframe, object, embed, link, meta"),
  )) {
    element.remove()
  }

  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name)
        continue
      }
      if (["href", "xlink:href"].includes(name) && isUnsafeReferenceValue(value)) {
        element.removeAttribute(attribute.name)
      }
    }
  }

  return root.outerHTML.trim()
}
