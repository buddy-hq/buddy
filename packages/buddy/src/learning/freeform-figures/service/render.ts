import { createHash } from "node:crypto"
import {
  RenderFreeformFigureInputSchema,
  RenderFreeformFigureOutputSchema,
  type RenderFreeformFigureInput,
  type RenderFreeformFigureOutput,
} from "../types.js"
import { FreeformFigureRenderError } from "./errors.js"
import { writeFreeformFigure } from "./io.js"
import { lintSvg } from "./lint.js"
import { applyTextHalo, sanitizeSvg } from "./sanitize.js"

function escapeMarkdownAlt(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
}

function buildFreeformFigureURL(directory: string, figureID: string): string {
  return `/api/freeform-figures/${figureID}?directory=${encodeURIComponent(directory)}`
}

function hashFreeformFigure(input: { kind: RenderFreeformFigureInput["kind"]; source: string }): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

async function renderFreeformFigure(
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

  const figureID = hashFreeformFigure({
    kind: parsed.kind,
    source: sanitizedSource,
  })
  const url = buildFreeformFigureURL(directory, figureID)

  await writeFreeformFigure(directory, figureID, applyTextHalo(sanitizedSource))

  return RenderFreeformFigureOutputSchema.parse({
    figureID,
    mime: "image/svg+xml",
    url,
    alt: parsed.alt,
    ...(parsed.caption ? { caption: parsed.caption } : {}),
    markdown: `![${escapeMarkdownAlt(parsed.alt)}](${url})`,
    repairAttempts: 0,
  })
}

export { renderFreeformFigure }
