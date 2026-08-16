import { createHash } from "node:crypto"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectManifestSchema,
  BuddyObjectPath,
  FigureObjectSummarySchema,
  generateObjectID,
  writeObjectRecord,
  type BuddyObjectManifest,
} from "../../../../objects"
import { repairGeometryFigureSpec } from "./repair"
import { renderGeometryFigure as renderGeometryFigureSvg } from "./render"
import { resolveGeometryFigureSpec } from "./resolve"
import {
  type GeometryConstraint,
  type GeometryFigureSpec,
  type GeometryMarker,
  type GeometryPoint,
  type GeometryPolygon,
  type GeometrySegment,
} from "./types"
import { validateGeometryFigureSpec, type FigureValidationIssue } from "./validate"
import { escapeFigureMarkdownAlt, resolveFigureAlt } from "../shared/presentation"
const MAX_TOTAL_ATTEMPTS = 3
const MAX_REPAIR_PASSES = 2
const FIGURE_SVG_FILE_NAME = "figure.svg"
const FIGURE_RENDERED_VIEW_ID = "rendered"

class FigureRenderError extends Error {
  readonly issues: readonly FigureValidationIssue[]

  constructor(issues: readonly FigureValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "))
    this.name = "FigureRenderError"
    this.issues = issues
  }
}

type RenderGeometryFigureObjectOutput = {
  objectID: string
  revisionID: string
  mime: "image/svg+xml"
  rawUrl: string
  relativePath: string
  alt: string
  caption: string | null
  markdown: string
  repairAttempts: number
}

function normalizeGeometryCanvas(
  canvas: GeometryFigureSpec["canvas"],
): GeometryFigureSpec["canvas"] {
  return Object.assign(
    {
      width: canvas.width,
      height: canvas.height,
    },
    typeof canvas.padding === "number" ? { padding: canvas.padding } : undefined,
  )
}

function normalizeGeometryPoint(point: GeometryPoint): GeometryPoint {
  return Object.assign(
    {
      id: point.id,
      x: point.x,
      y: point.y,
    },
    point.label ? { label: point.label } : undefined,
  )
}

function normalizeGeometrySegment(segment: GeometrySegment): GeometrySegment {
  return Object.assign(
    {
      from: segment.from,
      to: segment.to,
    },
    segment.style ? { style: segment.style } : undefined,
    typeof segment.strokeWidth === "number" ? { strokeWidth: segment.strokeWidth } : undefined,
    segment.label ? { label: segment.label } : undefined,
  )
}

function normalizeGeometryPolygon(polygon: GeometryPolygon): GeometryPolygon {
  return Object.assign(
    {
      points: [...polygon.points],
    },
    polygon.fill ? { fill: polygon.fill } : undefined,
    polygon.outline ? { outline: polygon.outline } : undefined,
    polygon.label ? { label: polygon.label } : undefined,
  )
}

function normalizeGeometryConstraint(constraint: GeometryConstraint): GeometryConstraint {
  if (constraint.type === "point-on-segment") {
    return Object.assign(
      {
        type: constraint.type,
        point: constraint.point,
        from: constraint.from,
        to: constraint.to,
      },
      typeof constraint.position === "number" ? { position: constraint.position } : undefined,
    )
  }

  if (constraint.type === "perpendicular-foot") {
    return {
      type: constraint.type,
      point: constraint.point,
      source: constraint.source,
      from: constraint.from,
      to: constraint.to,
    }
  }

  return {
    type: constraint.type,
    point: constraint.point,
    lineAFrom: constraint.lineAFrom,
    lineATo: constraint.lineATo,
    lineBFrom: constraint.lineBFrom,
    lineBTo: constraint.lineBTo,
  }
}

function normalizeGeometryMarker(marker: GeometryMarker): GeometryMarker {
  if (marker.type === "tick") {
    return Object.assign(
      {
        type: marker.type,
        from: marker.from,
        to: marker.to,
      },
      typeof marker.count === "number" ? { count: marker.count } : undefined,
    )
  }

  if (marker.type === "right-angle") {
    return {
      type: marker.type,
      at: marker.at,
      alongA: marker.alongA,
      alongB: marker.alongB,
    }
  }

  return Object.assign(
    {
      type: marker.type,
      at: marker.at,
      from: marker.from,
      to: marker.to,
    },
    marker.label ? { label: marker.label } : undefined,
  )
}

function normalizeGeometryFigureSpec(spec: GeometryFigureSpec): GeometryFigureSpec {
  return Object.assign(
    Object.assign(
      {
        canvas: normalizeGeometryCanvas(spec.canvas),
        points: spec.points.map(normalizeGeometryPoint),
      },
      spec.segments && spec.segments.length > 0
        ? { segments: spec.segments.map(normalizeGeometrySegment) }
        : undefined,
      spec.polygons && spec.polygons.length > 0
        ? { polygons: spec.polygons.map(normalizeGeometryPolygon) }
        : undefined,
      spec.labels && spec.labels.length > 0
        ? {
            labels: spec.labels.map((label) => ({
              text: label.text,
              x: label.x,
              y: label.y,
            })),
          }
        : undefined,
    ),
    spec.constraints && spec.constraints.length > 0
      ? { constraints: spec.constraints.map(normalizeGeometryConstraint) }
      : undefined,
    spec.markers && spec.markers.length > 0
      ? { markers: spec.markers.map(normalizeGeometryMarker) }
      : undefined,
  )
}

function validateGeometrySvgSanity(svg: string): FigureValidationIssue[] {
  const trimmed = svg.trim()
  const issues: FigureValidationIssue[] = []

  if (!trimmed.startsWith("<svg")) {
    issues.push({
      code: "INVALID_SVG",
      message: "The rendered SVG did not start with an <svg tag.",
    })
  }

  if (!trimmed.includes("</svg>")) {
    issues.push({
      code: "INVALID_SVG",
      message: "The rendered SVG did not contain a closing </svg> tag.",
    })
  }

  if (!trimmed.includes("viewBox=")) {
    issues.push({
      code: "INVALID_SVG",
      message: "The rendered SVG did not include a viewBox.",
    })
  }

  if (trimmed.length === 0) {
    issues.push({
      code: "INVALID_SVG",
      message: "The rendered SVG was empty.",
    })
  }

  return issues
}

function hashGeometryFigure(spec: GeometryFigureSpec): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: "geometry.v1" as const,
        spec,
      }),
    )
    .digest("hex")
}

function figureRevisionSvgPath(revisionID: string): string {
  return `revisions/${revisionID}/${FIGURE_SVG_FILE_NAME}`
}

function buildFigureObjectRawUrl(input: {
  directory: string
  objectID: string
  revisionID: string
}): string {
  return `/api/objects/figure/${input.objectID}/raw?directory=${encodeURIComponent(input.directory)}&revisionID=${encodeURIComponent(input.revisionID)}`
}

async function writeGeometryFigureObject(input: {
  directory: string
  objectID: string
  revisionID: string
  svg: string
  sourceHash: string
  alt: string
  caption?: string
  repairAttempts: number
  createdAt: string
}): Promise<BuddyObjectManifest & { summary: ReturnType<typeof FigureObjectSummarySchema.parse> }> {
  const sourceRoot = BuddyObjectPath.relativeObjectDirectory(
    BUDDY_OBJECT_KINDS.figure,
    input.objectID,
  )
  const manifest = BuddyObjectManifestSchema.safeExtend({
    summary: FigureObjectSummarySchema,
  }).parse(
    Object.assign(
      {
        version: 1,
        kind: BUDDY_OBJECT_KINDS.figure,
        objectID: input.objectID,
        title: input.alt,
        status: "ready",
        lifecycle: "revisioned",
        currentRevisionID: input.revisionID,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        sourceRefs: [
          {
            role: "payload",
            path: `${sourceRoot}/${figureRevisionSvgPath(input.revisionID)}`,
            displayPath: `${sourceRoot}/${figureRevisionSvgPath(input.revisionID)}`,
            workspacePath: null,
            mutable: false,
            copied: false,
            availability: "available",
            exists: true,
            contentHash: input.sourceHash,
          },
        ],
        views: [
          {
            viewID: FIGURE_RENDERED_VIEW_ID,
            label: "Figure",
            surfaces: ["inline", "bench", "library"],
            availability: { status: "available" },
            inline: {
              renderer: "figure",
              params: {
                renderer: "figure",
                figureKind: "geometry",
              },
            },
            bench: { resolver: "object-view" },
            library: { section: "diagrams" },
          },
        ],
        summary: {
          kind: BUDDY_OBJECT_KINDS.figure,
          caption: input.caption ?? null,
          renderStatus: "ready",
        },
      },
      input.caption ? { description: input.caption } : undefined,
    ),
  )
  await writeObjectRecord({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.figure,
    objectID: input.objectID,
    manifest,
    files: [
      {
        relativePath: figureRevisionSvgPath(input.revisionID),
        format: "text",
        content: input.svg,
      },
      {
        relativePath: `revisions/${input.revisionID}/figure-source.json`,
        format: "json",
        content: {
          sourceHash: input.sourceHash,
          repairAttempts: input.repairAttempts,
        },
      },
    ],
  })
  return manifest
}

async function renderGeometryFigure(
  directory: string,
  input: {
    caption?: string
    spec: GeometryFigureSpec
  },
): Promise<RenderGeometryFigureObjectOutput> {
  let currentSpec = normalizeGeometryFigureSpec(input.spec)
  let repairAttempts = 0
  let lastIssues: FigureValidationIssue[] = []

  for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt += 1) {
    const resolved = resolveGeometryFigureSpec(currentSpec)
    if (resolved.issues.length > 0) {
      lastIssues = resolved.issues
    } else {
      const validationIssues = validateGeometryFigureSpec(resolved.spec)
      if (validationIssues.length === 0) {
        try {
          const svg = renderGeometryFigureSvg(resolved.spec)
          const svgIssues = validateGeometrySvgSanity(svg)
          if (svgIssues.length === 0) {
            const objectID = generateObjectID()
            const revisionID = generateObjectID()
            const sourceHash = hashGeometryFigure(resolved.spec)
            const alt = resolveFigureAlt({
              caption: input.caption,
              fallback: "Geometry figure",
            })
            const createdAt = new Date().toISOString()
            await writeGeometryFigureObject(
              Object.assign(
                {
                  directory,
                  objectID,
                  revisionID,
                  svg,
                  sourceHash,
                  alt,
                  repairAttempts,
                  createdAt,
                },
                input.caption ? { caption: input.caption } : undefined,
              ),
            )
            const rawUrl = buildFigureObjectRawUrl({ directory, objectID, revisionID })
            const relativePath = `${BuddyObjectPath.relativeObjectDirectory(
              BUDDY_OBJECT_KINDS.figure,
              objectID,
            )}/${figureRevisionSvgPath(revisionID)}`

            return {
              objectID,
              revisionID,
              mime: "image/svg+xml",
              rawUrl,
              relativePath,
              alt,
              caption: input.caption ?? null,
              markdown: `![${escapeFigureMarkdownAlt(alt)}](${rawUrl})`,
              repairAttempts,
            }
          }

          lastIssues = svgIssues
        } catch (error) {
          const message = String(error instanceof Error ? error.message : error)
          lastIssues = [
            {
              code: "RENDER_FAILED",
              message: `The figure could not be rendered: ${message}`,
            },
          ]
        }
      } else {
        lastIssues = validationIssues
      }
    }

    if (repairAttempts >= MAX_REPAIR_PASSES) {
      break
    }

    const beforeRepair = JSON.stringify(currentSpec)
    const repaired = normalizeGeometryFigureSpec(repairGeometryFigureSpec(currentSpec, lastIssues))
    const afterRepair = JSON.stringify(repaired)

    if (beforeRepair === afterRepair) {
      break
    }

    currentSpec = repaired
    repairAttempts += 1
  }

  throw new FigureRenderError(lastIssues)
}

export {
  buildFigureObjectRawUrl,
  FIGURE_RENDERED_VIEW_ID,
  figureRevisionSvgPath,
  FigureRenderError,
  renderGeometryFigure,
}
export type { RenderGeometryFigureObjectOutput }
