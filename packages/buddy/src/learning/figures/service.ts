import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import { FigurePath } from "./path.js"
import { repairGeometryFigureSpec } from "./repair.js"
import { renderGeometryFigure } from "./render.js"
import { resolveGeometryFigureSpec } from "./resolve.js"
import {
  RenderFigureInputSchema,
  RenderFigureOutputSchema,
  type GeometryFigureSpec,
  type RenderFigureInput,
  type RenderFigureOutput,
} from "./types.js"
import {
  validateGeometryFigureSpec,
  type FigureValidationIssue,
} from "./validate.js"

const MAX_TOTAL_ATTEMPTS = 3
const MAX_REPAIR_PASSES = 2

class FigureNotFoundError extends Error {
  constructor(figureID: string) {
    super(`Figure '${figureID}' was not found.`)
    this.name = "FigureNotFoundError"
  }
}

class FigureRenderError extends Error {
  readonly issues: readonly FigureValidationIssue[]

  constructor(issues: readonly FigureValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "))
    this.name = "FigureRenderError"
    this.issues = issues
  }
}

function normalizeGeometryFigureSpec(spec: GeometryFigureSpec): GeometryFigureSpec {
  return {
    canvas: {
      width: spec.canvas.width,
      height: spec.canvas.height,
      ...(typeof spec.canvas.padding === "number" ? { padding: spec.canvas.padding } : {}),
    },
    points: spec.points.map((point) => ({
      id: point.id,
      x: point.x,
      y: point.y,
      ...(point.label ? { label: point.label } : {}),
    })),
    ...(spec.segments && spec.segments.length > 0
      ? {
          segments: spec.segments.map((segment) => ({
            from: segment.from,
            to: segment.to,
            ...(segment.style ? { style: segment.style } : {}),
            ...(typeof segment.strokeWidth === "number" ? { strokeWidth: segment.strokeWidth } : {}),
            ...(segment.label ? { label: segment.label } : {}),
          })),
        }
      : {}),
    ...(spec.polygons && spec.polygons.length > 0
      ? {
          polygons: spec.polygons.map((polygon) => ({
            points: [...polygon.points],
            ...(polygon.fill ? { fill: polygon.fill } : {}),
            ...(polygon.outline ? { outline: polygon.outline } : {}),
            ...(polygon.label ? { label: polygon.label } : {}),
          })),
        }
      : {}),
    ...(spec.labels && spec.labels.length > 0
      ? {
          labels: spec.labels.map((label) => ({
            text: label.text,
            x: label.x,
            y: label.y,
          })),
        }
      : {}),
    ...(spec.constraints && spec.constraints.length > 0
      ? {
          constraints: spec.constraints.map((constraint) => {
            if (constraint.type === "point-on-segment") {
              return {
                type: constraint.type,
                point: constraint.point,
                from: constraint.from,
                to: constraint.to,
                ...(typeof constraint.position === "number" ? { position: constraint.position } : {}),
              }
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
          }),
        }
      : {}),
    ...(spec.markers && spec.markers.length > 0
      ? {
          markers: spec.markers.map((marker) => {
            if (marker.type === "tick") {
              return {
                type: marker.type,
                from: marker.from,
                to: marker.to,
                ...(typeof marker.count === "number" ? { count: marker.count } : {}),
              }
            }

            if (marker.type === "right-angle") {
              return {
                type: marker.type,
                at: marker.at,
                alongA: marker.alongA,
                alongB: marker.alongB,
              }
            }

            return {
              type: marker.type,
              at: marker.at,
              from: marker.from,
              to: marker.to,
              ...(marker.label ? { label: marker.label } : {}),
            }
          }),
        }
      : {}),
  }
}

function svgSanityIssues(svg: string): FigureValidationIssue[] {
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

function figureHash(input: { kind: RenderFigureInput["kind"]; spec: GeometryFigureSpec }): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

function escapeMarkdownAlt(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]")
}

async function writeFigure(directory: string, figureID: string, svg: string) {
  await fs.mkdir(FigurePath.root(directory), { recursive: true })
  await fs.writeFile(FigurePath.file(directory, figureID), svg, "utf8")
}

async function render(directory: string, input: RenderFigureInput): Promise<RenderFigureOutput> {
  const parsed = RenderFigureInputSchema.parse(input)
  let currentSpec = normalizeGeometryFigureSpec(parsed.spec)
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
          const svg = renderGeometryFigure(resolved.spec)
          const svgIssues = svgSanityIssues(svg)
          if (svgIssues.length === 0) {
            const figureID = figureHash({
              kind: parsed.kind,
              spec: resolved.spec,
            })
            await writeFigure(directory, figureID, svg)

            return RenderFigureOutputSchema.parse({
              figureID,
              mime: "image/svg+xml",
              url: `/api/figures/${figureID}?directory=${encodeURIComponent(directory)}`,
              alt: parsed.alt,
              ...(parsed.caption ? { caption: parsed.caption } : {}),
              markdown: `![${escapeMarkdownAlt(parsed.alt)}](/api/figures/${figureID}?directory=${encodeURIComponent(directory)})`,
              repairAttempts,
            })
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

async function read(directory: string, figureID: string): Promise<string> {
  const filepath = FigurePath.file(directory, figureID)

  try {
    return await fs.readFile(filepath, "utf8")
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new FigureNotFoundError(figureID)
    }
    throw error
  }
}

const FigureService = {
  read,
  render,
}

export {
  FigureNotFoundError,
  FigureRenderError,
  FigureService,
}
