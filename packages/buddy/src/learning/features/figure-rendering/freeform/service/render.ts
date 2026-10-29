import { createHash } from "node:crypto"
import { XMLParser, XMLValidator } from "fast-xml-parser"
import { parseTJsonObject, parseTString } from "../../../../../http/parse"
import { BUDDY_OBJECT_KINDS, BuddyObjectPath, generateObjectID } from "../../../../../objects"
import { RenderFreeformFigureOutputSchema, type RenderFreeformFigureOutput } from "../types"
import {
  buildFreeformFigureObjectRawUrl,
  freeformFigureRevisionSvgPath,
  writeFreeformFigureObject,
} from "./io"
import { lintSvg } from "./lint"
import { applyTextHalo, EXECUTABLE_ELEMENT_NAMES, sanitizeSvg } from "./sanitize"
import { escapeFigureMarkdownAlt, resolveFigureAlt } from "../../shared/presentation"
import type { FreeformFigureLintIssue } from "./types"

const RASTER_IMAGE_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpeg|gif|webp|avif|apng|bmp|tiff|x-icon|vnd\.microsoft\.icon)(?:;|,)/u

class FreeformFigureRenderError extends Error {
  readonly issues: readonly FreeformFigureLintIssue[]

  constructor(issues: readonly FreeformFigureLintIssue[]) {
    super(issues.map((issue) => issue.message).join(" "))
    this.name = "FreeformFigureRenderError"
    this.issues = issues
  }
}

function assertSanitizedSvg(source: string): void {
  const markup = source.trimStart()
  const declarations =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE\b|<!ENTITY\b|<\?[\s\S]*?\?>/giu
  for (const match of markup.matchAll(declarations)) {
    const token = match[0]
    if (token.startsWith("<!--") || token.startsWith("<![CDATA[")) continue
    if (match.index === 0 && /^<\?xml\s/u.test(token)) continue

    const rejected = /^<!DOCTYPE/iu.test(token)
      ? "DOCTYPE declaration"
      : /^<!ENTITY/iu.test(token)
        ? "ENTITY declaration"
        : `processing instruction ${token}`
    throw new FreeformFigureRenderError([
      {
        code: "UNSAFE_SVG_DECLARATION",
        message: `The figure SVG contains a forbidden ${rejected}. Remove it; only a leading XML declaration is allowed.`,
      },
    ])
  }

  let parsed: unknown
  try {
    const validation = XMLValidator.validate(source)
    if (validation !== true) {
      throw new Error(validation.err.msg)
    }
    parsed = new XMLParser({
      preserveOrder: true,
      removeNSPrefix: false,
      ignoreAttributes: false,
      attributeNamePrefix: "",
      parseAttributeValue: false,
      htmlEntities: true,
    }).parse(source)
  } catch (error) {
    throw new FreeformFigureRenderError([
      {
        code: "INVALID_SVG",
        message: `The figure SVG isn't valid XML: ${error instanceof Error ? error.message : String(error)}`,
      },
    ])
  }

  const pending: unknown[] = [parsed]
  while (pending.length > 0) {
    const node = pending.pop()
    if (Array.isArray(node)) {
      for (const child of node) pending.push(child)
      continue
    }
    const element = parseTJsonObject(node)
    if (!element) continue

    const attributes = parseTJsonObject(element[":@"])
    if (attributes) {
      for (const [attributeName, value] of Object.entries(attributes)) {
        const localName = attributeName.slice(attributeName.lastIndexOf(":") + 1).toLowerCase()
        if (localName.startsWith("on")) {
          throw new FreeformFigureRenderError([
            {
              code: "EXECUTABLE_SVG_ATTRIBUTE",
              message: `The figure SVG contains event-handler attribute "${attributeName}" after sanitization. Remove this attribute.`,
            },
          ])
        }
        if (localName !== "href") continue
        const link = parseTString(value)
        if (link === undefined) continue
        const normalizedValue = link.trim().replace(/[\s\p{Cc}]/gu, "").toLowerCase()
        if (
          normalizedValue.startsWith("javascript:") ||
          (normalizedValue.startsWith("data:") &&
            !RASTER_IMAGE_DATA_URL_PATTERN.test(normalizedValue))
        ) {
          throw new FreeformFigureRenderError([
            {
              code: "UNSAFE_SVG_LINK",
              message: `The figure SVG contains unsafe link attribute "${attributeName}" after sanitization. Remove javascript: URLs and use only raster image data: URLs.`,
            },
          ])
        }
      }
    }

    for (const [tagName, children] of Object.entries(element)) {
      if (tagName === ":@") continue
      const localName = tagName.slice(tagName.lastIndexOf(":") + 1).toLowerCase()
      if (EXECUTABLE_ELEMENT_NAMES.some((name) => name === localName)) {
        throw new FreeformFigureRenderError([
          {
            code: "EXECUTABLE_SVG_ELEMENT",
            message: `The figure SVG contains an executable <${tagName}> element after sanitization.`,
          },
        ])
      }
      pending.push(children)
    }
  }
}

function hashFreeformFigure(source: string): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: "svg.v1" as const,
        source,
      }),
    )
    .digest("hex")
}

async function renderFreeformFigure(
  directory: string,
  input: {
    caption?: string
    source: string
  },
): Promise<RenderFreeformFigureOutput> {
  const source = input.source.trim()
  const issues = lintSvg(source)

  if (issues.length > 0) {
    throw new FreeformFigureRenderError(issues)
  }

  const sanitizedSource = sanitizeSvg(source)
  assertSanitizedSvg(sanitizedSource)
  const sanitizedIssues = lintSvg(sanitizedSource)
  if (sanitizedIssues.length > 0) {
    throw new FreeformFigureRenderError(sanitizedIssues)
  }

  const objectID = generateObjectID()
  const revisionID = generateObjectID()
  const sourceHash = hashFreeformFigure(sanitizedSource)
  const alt = resolveFigureAlt({
    caption: input.caption,
    fallback: "Custom SVG figure",
  })
  const rawUrl = buildFreeformFigureObjectRawUrl({ directory, objectID, revisionID })

  await writeFreeformFigureObject(
    Object.assign(
      {
        directory,
        objectID,
        revisionID,
        svg: applyTextHalo(sanitizedSource),
        sourceHash,
        alt,
        createdAt: new Date().toISOString(),
      },
      input.caption ? { caption: input.caption } : undefined,
    ),
  )

  return RenderFreeformFigureOutputSchema.parse({
    objectID,
    revisionID,
    mime: "image/svg+xml",
    rawUrl,
    relativePath: `${BuddyObjectPath.relativeObjectDirectory(
      BUDDY_OBJECT_KINDS.freeformFigure,
      objectID,
    )}/${freeformFigureRevisionSvgPath(revisionID)}`,
    alt,
    caption: input.caption ?? null,
    markdown: `![${escapeFigureMarkdownAlt(alt)}](${rawUrl})`,
    repairAttempts: 0,
  })
}

export { assertSanitizedSvg, FreeformFigureRenderError, renderFreeformFigure }
export type { RenderFreeformFigureOutput }
