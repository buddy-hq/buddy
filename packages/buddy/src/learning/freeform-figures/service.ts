import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { FreeformFigurePath } from "./path.js"
import {
  RenderFreeformFigureInputSchema,
  RenderFreeformFigureOutputSchema,
  type RenderFreeformFigureInput,
  type RenderFreeformFigureOutput,
} from "./types.js"

type FreeformFigureLintIssue = {
  code: string
  message: string
}

class FreeformFigureNotFoundError extends Error {
  constructor(figureID: string) {
    super(`Freeform figure '${figureID}' was not found.`)
    this.name = "FreeformFigureNotFoundError"
  }
}

class FreeformFigureRenderError extends Error {
  readonly issues: readonly FreeformFigureLintIssue[]

  constructor(issues: readonly FreeformFigureLintIssue[]) {
    super(issues.map((issue) => issue.message).join(" "))
    this.name = "FreeformFigureRenderError"
    this.issues = issues
  }
}

function escapeMarkdownAlt(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
}

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

function figureHash(input: { kind: RenderFreeformFigureInput["kind"]; source: string }): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

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

async function writeFigure(directory: string, figureID: string, svg: string) {
  await fs.mkdir(FreeformFigurePath.root(directory), { recursive: true })
  await fs.writeFile(FreeformFigurePath.file(directory, figureID), svg, "utf8")
}

async function render(
  directory: string,
  input: RenderFreeformFigureInput,
): Promise<RenderFreeformFigureOutput> {
  const parsed = RenderFreeformFigureInputSchema.parse(input)
  const source = parsed.source.trim()
  const issues = lintSvg(source)

  if (issues.length > 0) {
    throw new FreeformFigureRenderError(issues)
  }

  const sanitizedSource = sanitizeSvg(source)
  const sanitizedIssues = lintSvg(sanitizedSource)

  if (sanitizedIssues.length > 0) {
    throw new FreeformFigureRenderError(sanitizedIssues)
  }

  const figureID = figureHash({
    kind: parsed.kind,
    source: sanitizedSource,
  })

  await writeFigure(directory, figureID, applyTextHalo(sanitizedSource))

  return RenderFreeformFigureOutputSchema.parse({
    figureID,
    mime: "image/svg+xml",
    url: `/api/freeform-figures/${figureID}?directory=${encodeURIComponent(directory)}`,
    alt: parsed.alt,
    ...(parsed.caption ? { caption: parsed.caption } : {}),
    markdown: `![${escapeMarkdownAlt(parsed.alt)}](/api/freeform-figures/${figureID}?directory=${encodeURIComponent(directory)})`,
    repairAttempts: 0,
  })
}

async function read(directory: string, figureID: string): Promise<string> {
  const filepath = FreeformFigurePath.file(directory, figureID)

  try {
    return await fs.readFile(filepath, "utf8")
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new FreeformFigureNotFoundError(figureID)
    }
    throw error
  }
}

const FreeformFigureService = {
  read,
  render,
}

export {
  FreeformFigureNotFoundError,
  FreeformFigureRenderError,
  FreeformFigureService,
}

export type {
  FreeformFigureLintIssue,
}
