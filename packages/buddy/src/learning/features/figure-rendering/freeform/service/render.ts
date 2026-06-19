import { createHash } from "node:crypto"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  generateObjectID,
} from "../../../../../objects"
import { RenderFreeformFigureOutputSchema, type RenderFreeformFigureOutput } from "../types"
import {
  buildFreeformFigureObjectRawUrl,
  freeformFigureRevisionSvgPath,
  writeFreeformFigureObject,
} from "./io"
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

  const objectID = generateObjectID()
  const revisionID = generateObjectID()
  const sourceHash = hashFreeformFigure(sanitizedSource)
  const alt = resolveFigureAlt({
    caption: input.caption,
    fallback: "Custom SVG figure",
  })
  const rawUrl = buildFreeformFigureObjectRawUrl({ directory, objectID, revisionID })

  await writeFreeformFigureObject({
    directory,
    objectID,
    revisionID,
    svg: applyTextHalo(sanitizedSource),
    sourceHash,
    alt,
    ...(input.caption ? { caption: input.caption } : {}),
    createdAt: new Date().toISOString(),
  })

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

export { FreeformFigureRenderError, renderFreeformFigure }
export type { RenderFreeformFigureOutput }
