import type { FreeformFigureLintIssue } from "./types"

function parserErrorMessage(document: Document): string | undefined {
  const parserError = document.querySelector("parsererror")
  if (!parserError) return undefined
  return parserError.textContent?.trim() || "The SVG markup could not be parsed."
}

function rootTagName(document: Document): string | undefined {
  const root = document.documentElement
  if (!root) return undefined
  if (typeof root.localName === "string" && root.localName.length > 0) return root.localName
  return root.tagName
}

function lintSvgWithoutDomParser(source: string): FreeformFigureLintIssue[] {
  const issues: FreeformFigureLintIssue[] = []
  const tagPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/?[A-Za-z_][\w:.-]*(?:\s[^<>]*?)?\/?>/giu
  const stack: string[] = []
  let cursor = 0
  let sawRoot = false

  for (const match of source.matchAll(tagPattern)) {
    const token = match[0]
    const index = match.index ?? 0
    const gap = source.slice(cursor, index)

    if (gap.includes("<")) {
      issues.push({
        code: "INVALID_SVG",
        message: "The SVG markup contains an invalid or unterminated tag.",
      })
      return issues
    }

    cursor = index + token.length

    if (token.startsWith("<!--") || token.startsWith("<?") || token.startsWith("<!DOCTYPE")) {
      continue
    }

    const nameMatch = token.match(/^<\/?\s*([A-Za-z_][\w:.-]*)/u)
    const rawName = nameMatch?.[1]
    if (!rawName) {
      issues.push({
        code: "INVALID_SVG",
        message: "The SVG markup contains an invalid tag name.",
      })
      return issues
    }

    const name = rawName.toLowerCase()
    const localName = name.split(":").at(-1)
    const closing = token.startsWith("</")
    const selfClosing = token.endsWith("/>")

    if (!sawRoot && !closing) {
      sawRoot = true
      if (localName !== "svg") {
        issues.push({
          code: "INVALID_SVG_ROOT",
          message: "The freeform figure must be a complete SVG document with an <svg> root element.",
        })
        return issues
      }
    }

    if (closing) {
      const current = stack.pop()
      if (current !== name) {
        issues.push({
          code: "INVALID_SVG",
          message: "The SVG markup contains mismatched closing tags.",
        })
        return issues
      }
      continue
    }

    if (!selfClosing) {
      stack.push(name)
    }
  }

  const tail = source.slice(cursor)
  if (tail.includes("<")) {
    issues.push({
      code: "INVALID_SVG",
      message: "The SVG markup contains an invalid or unterminated tag.",
    })
    return issues
  }

  if (!sawRoot) {
    issues.push({
      code: "INVALID_SVG_ROOT",
      message: "The freeform figure must be a complete SVG document with an <svg> root element.",
    })
    return issues
  }

  if (stack.length > 0) {
    issues.push({
      code: "INVALID_SVG",
      message: "The SVG markup is missing one or more closing tags.",
    })
  }

  return issues
}

function lintSvg(source: string): FreeformFigureLintIssue[] {
  const issues: FreeformFigureLintIssue[] = []
  const trimmed = source.trim()

  if (!trimmed) {
    return [
      {
        code: "EMPTY_SVG",
        message: "The SVG source was empty.",
      },
    ]
  }

  if (typeof DOMParser === "function") {
    try {
      const document = new DOMParser().parseFromString(trimmed, "image/svg+xml")
      const parseError = parserErrorMessage(document)
      if (parseError) {
        issues.push({
          code: "INVALID_SVG",
          message: parseError,
        })
        return issues
      }

      const tagName = rootTagName(document)
      if (tagName?.toLowerCase() !== "svg") {
        issues.push({
          code: "INVALID_SVG_ROOT",
          message: "The freeform figure must be a complete SVG document with an <svg> root element.",
        })
      }

      return issues
    } catch (error) {
      issues.push({
        code: "INVALID_SVG",
        message: `The SVG markup could not be parsed: ${String(error instanceof Error ? error.message : error)}`,
      })
      return issues
    }
  }

  return lintSvgWithoutDomParser(trimmed)
}

export { lintSvg }
