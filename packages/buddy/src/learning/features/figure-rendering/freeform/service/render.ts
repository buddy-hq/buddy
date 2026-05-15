import { createHash } from "node:crypto"
import { RenderFreeformFigureOutputSchema, type RenderFreeformFigureOutput } from "../types"
import { FreeformFigureRenderError } from "./errors"
import { writeFreeformFigure } from "./io"
import { lintSvg } from "./lint"
import { applyTextHalo, sanitizeSvg } from "./sanitize"
import { escapeFigureMarkdownAlt, resolveFigureAlt } from "../../shared/presentation"

function buildFreeformFigureURL(directory: string, figureID: string): string {
  return `/api/freeform-figures/${figureID}?directory=${encodeURIComponent(directory)}`
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
  const sanitizedIssues = lintSvg(sanitizedSource)
  if (sanitizedIssues.length > 0) {
    throw new FreeformFigureRenderError(sanitizedIssues)
  }

  const figureID = hashFreeformFigure(sanitizedSource)
  const alt = resolveFigureAlt({
    caption: input.caption,
    fallback: "Custom SVG figure",
  })
  const url = buildFreeformFigureURL(directory, figureID)

  await writeFreeformFigure(directory, figureID, applyTextHalo(sanitizedSource))

  return RenderFreeformFigureOutputSchema.parse({
    figureID,
    mime: "image/svg+xml",
    url,
    relativePath: `.buddy/freeform-figures/${figureID}.svg`,
    alt,
    ...(input.caption ? { caption: input.caption } : {}),
    markdown: `![${escapeFigureMarkdownAlt(alt)}](${url})`,
    repairAttempts: 0,
  })
}

export { renderFreeformFigure }
