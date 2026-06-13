import { createHash } from "node:crypto"
import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ArtifactPath,
  generateArtifactID,
} from "../../../../../artifacts"
import { RenderFreeformFigureOutputSchema, type RenderFreeformFigureOutput } from "../types"
import { writeFreeformFigure } from "./io"
import { lintSvg } from "./lint"
import { applyTextHalo, sanitizeSvg } from "./sanitize"
import { escapeFigureMarkdownAlt, resolveFigureAlt } from "../../shared/presentation"
import type { FreeformFigureLintIssue } from "./types"

class FreeformFigureRenderError extends Error {
  readonly issues: readonly FreeformFigureLintIssue[]

  constructor(issues: readonly FreeformFigureLintIssue[]) {
    super(issues.map((issue) => issue.message).join(" "))
    this.name = "FreeformFigureRenderError"
    this.issues = issues
  }
}

function buildFreeformFigureURL(directory: string, artifactID: string): string {
  return `/api/artifacts/freeform-figure/${artifactID}/raw?directory=${encodeURIComponent(directory)}`
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

  const artifactID = generateArtifactID()
  const sourceHash = hashFreeformFigure(sanitizedSource)
  const alt = resolveFigureAlt({
    caption: input.caption,
    fallback: "Custom SVG figure",
  })
  const url = buildFreeformFigureURL(directory, artifactID)

  await writeFreeformFigure({
    directory,
    artifactID,
    svg: applyTextHalo(sanitizedSource),
    sourceHash,
    alt,
    ...(input.caption ? { caption: input.caption } : {}),
  })

  return RenderFreeformFigureOutputSchema.parse({
    artifactID,
    mime: "image/svg+xml",
    url,
    relativePath: `${ArtifactPath.relativeArtifactDirectory(
      ARTIFACT_KINDS.freeformFigure,
      artifactID,
    )}/${ARTIFACT_CONTENT_FILES.figureSvg}`,
    alt,
    ...(input.caption ? { caption: input.caption } : {}),
    markdown: `![${escapeFigureMarkdownAlt(alt)}](${url})`,
    repairAttempts: 0,
  })
}

export { FreeformFigureRenderError, renderFreeformFigure }
