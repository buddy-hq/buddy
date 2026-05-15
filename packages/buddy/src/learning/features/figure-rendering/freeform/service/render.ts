import { createHash } from "node:crypto"
import { RenderFreeformFigureOutputSchema, type RenderFreeformFigureOutput } from "../types"
import { FreeformFigureRenderError } from "./errors"
import { writeFreeformFigure } from "./io"
import { lintSvg } from "./lint"
import { applyTextHalo, sanitizeSvg } from "./sanitize"

function escapeMarkdownAlt(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
}

function buildFreeformFigureURL(directory: string, figureID: string): string {
  return `/api/freeform-figures/${figureID}?directory=${encodeURIComponent(directory)}`
}

function hashFreeformFigure(input: { kind: "svg.v1"; source: string }): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

async function renderFreeformFigure(
  directory: string,
  input: {
    kind: "svg.v1"
    alt: string
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
  const sanitizedIssues = lintSvg(sanitizedSource)
  if (sanitizedIssues.length > 0) {
    throw new FreeformFigureRenderError(sanitizedIssues)
  }

  const figureID = hashFreeformFigure({
    kind: input.kind,
    source: sanitizedSource,
  })
  const url = buildFreeformFigureURL(directory, figureID)

  await writeFreeformFigure(directory, figureID, applyTextHalo(sanitizedSource))

  return RenderFreeformFigureOutputSchema.parse({
    figureID,
    mime: "image/svg+xml",
    url,
    relativePath: `.buddy/freeform-figures/${figureID}.svg`,
    alt: input.alt,
    ...(input.caption ? { caption: input.caption } : {}),
    markdown: `![${escapeMarkdownAlt(input.alt)}](${url})`,
    repairAttempts: 0,
  })
}

export { renderFreeformFigure }
