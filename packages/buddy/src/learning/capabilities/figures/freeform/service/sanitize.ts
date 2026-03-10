const TEXT_HALO_STYLE =
  '<style data-buddy-text-halo="true">text:not([data-buddy-no-halo]){paint-order:stroke fill;stroke:#ffffff;stroke-opacity:0.92;stroke-width:4px;stroke-linejoin:round;stroke-linecap:round}</style>'

const EXECUTABLE_ELEMENT_NAMES = [
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
] as const

function sanitizeExternalReferenceAttribute(
  attributeName: string,
  rawValue: string,
): string {
  const quote =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue[0]
      : undefined
  const value = quote ? rawValue.slice(1, -1).trim() : rawValue.trim()

  if (
    value.startsWith("#") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return ` ${attributeName}=${quote ?? '"'}${value}${quote ?? '"'}`
  }

  return ""
}

function sanitizeStyleAttribute(rawValue: string): string {
  const quote =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue[0]
      : undefined
  const value = quote ? rawValue.slice(1, -1) : rawValue

  if (/@import\b|url\s*\(\s*['"]?\s*(?![#/])|url\s*\(\s*https?:|url\s*\(\s*data:/iu.test(value)) {
    return ""
  }

  return ` style=${quote ?? '"'}${value}${quote ?? '"'}`
}

function sanitizeTagAttributes(source: string): string {
  return source.replace(/<([A-Za-z_][\w:.-]*)(\s[^<>]*?)?(\/?)>/gu, (fullMatch, tagName, rawAttributes = "", selfClosing) => {
    if (fullMatch.startsWith("</")) return fullMatch

    let attributes = rawAttributes as string

    attributes = attributes.replace(/\s+on[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    attributes = attributes.replace(/\s+(href|xlink:href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu, (_, attributeName, rawValue) => {
      return sanitizeExternalReferenceAttribute(attributeName, rawValue)
    })
    attributes = attributes.replace(/\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/giu, (_, rawValue) => {
      return sanitizeStyleAttribute(rawValue)
    })

    return `<${tagName}${attributes}${selfClosing}>`
  })
}

function stripExecutableElements(source: string): string {
  let sanitized = source

  for (const name of EXECUTABLE_ELEMENT_NAMES) {
    const paired = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}\\s*>`, "giu")
    const selfClosing = new RegExp(`<${name}\\b[^>]*/>`, "giu")
    sanitized = sanitized.replace(paired, "")
    sanitized = sanitized.replace(selfClosing, "")
  }

  return sanitized
}

function sanitizeSvg(source: string): string {
  const withoutExecutableElements = stripExecutableElements(source)
  return sanitizeTagAttributes(withoutExecutableElements)
}

function applyTextHalo(source: string): string {
  if (!/<text\b/iu.test(source)) return source
  if (source.includes('data-buddy-text-halo="true"')) return source

  return source.replace(/<svg\b[^>]*>/iu, (match) => `${match}${TEXT_HALO_STYLE}`)
}

export {
  applyTextHalo,
  sanitizeSvg,
}
