import type {
  GeometryConstraint,
  GeometryFigureSpec,
  GeometryMarker,
} from "./types.js"

type FigureValidationIssue = {
  code: string
  message: string
}

type Vector = {
  x: number
  y: number
}

const POSITION_TOLERANCE_MIN = 0.05

function distanceSquared(
  pointA: GeometryFigureSpec["points"][number],
  pointB: GeometryFigureSpec["points"][number],
): number {
  const dx = pointA.x - pointB.x
  const dy = pointA.y - pointB.y
  return dx * dx + dy * dy
}

function subtract(
  from: GeometryFigureSpec["points"][number],
  to: GeometryFigureSpec["points"][number],
): Vector {
  return {
    x: to.x - from.x,
    y: to.y - from.y,
  }
}

function dot(a: Vector, b: Vector): number {
  return a.x * b.x + a.y * b.y
}

function cross(a: Vector, b: Vector): number {
  return a.x * b.y - a.y * b.x
}

function lengthSquared(vector: Vector): number {
  return dot(vector, vector)
}

function relationTolerance(segmentLengthSquared: number): number {
  return Math.max(POSITION_TOLERANCE_MIN, Math.sqrt(segmentLengthSquared) * 0.002)
}

function pointSegmentMetrics(
  point: GeometryFigureSpec["points"][number],
  from: GeometryFigureSpec["points"][number],
  to: GeometryFigureSpec["points"][number],
) {
  const segment = subtract(from, to)
  const segmentLengthSquared = lengthSquared(segment)
  const relative = subtract(from, point)

  if (segmentLengthSquared === 0) {
    return {
      segmentLengthSquared,
      crossDistance: Number.POSITIVE_INFINITY,
      position: Number.NaN,
    }
  }

  const segmentLength = Math.sqrt(segmentLengthSquared)
  const crossDistance = Math.abs(cross(relative, segment)) / segmentLength
  const position = dot(relative, segment) / segmentLengthSquared

  return {
    segmentLengthSquared,
    crossDistance,
    position,
  }
}

function validateConstraint(
  constraint: GeometryConstraint,
  points: Map<string, GeometryFigureSpec["points"][number]>,
): FigureValidationIssue[] {
  const point = points.get(constraint.point)
  if (!point) {
    return [
      {
        code: "UNKNOWN_CONSTRAINT_POINT",
        message: `Constraint references an unknown point '${constraint.point}'.`,
      },
    ]
  }

  if (constraint.type === "line-intersection") {
    const lineAFrom = points.get(constraint.lineAFrom)
    const lineATo = points.get(constraint.lineATo)
    const lineBFrom = points.get(constraint.lineBFrom)
    const lineBTo = points.get(constraint.lineBTo)

    if (!lineAFrom || !lineATo || !lineBFrom || !lineBTo) {
      return [
        {
          code: "INVALID_CONSTRAINT",
          message: `Constraint '${constraint.type}' references unknown supporting points.`,
        },
      ]
    }

    const dirA = subtract(lineAFrom, lineATo)
    const dirB = subtract(lineBFrom, lineBTo)
    const determinant = cross(dirA, dirB)
    if (Math.abs(determinant) <= 1e-9) {
      return [
        {
          code: "INVALID_CONSTRAINT",
          message: `Constraint '${constraint.type}' uses parallel or overlapping lines.`,
        },
      ]
    }

    const metricA = pointSegmentMetrics(point, lineAFrom, lineATo)
    const metricB = pointSegmentMetrics(point, lineBFrom, lineBTo)
    const tolerance = Math.max(
      relationTolerance(metricA.segmentLengthSquared),
      relationTolerance(metricB.segmentLengthSquared),
    )

    if (metricA.crossDistance > tolerance || metricB.crossDistance > tolerance) {
      return [
        {
          code: "BROKEN_CONSTRAINT",
          message: `Constraint '${constraint.type}' did not place point '${constraint.point}' on both supporting lines.`,
        },
      ]
    }

    return []
  }

  const from = points.get(constraint.from)
  const to = points.get(constraint.to)
  if (!from || !to) {
    return [
      {
        code: "INVALID_CONSTRAINT",
        message: `Constraint '${constraint.type}' references unknown supporting points.`,
      },
    ]
  }

  const metrics = pointSegmentMetrics(point, from, to)
  if (metrics.segmentLengthSquared === 0) {
    return [
      {
        code: "INVALID_CONSTRAINT",
        message: `Constraint '${constraint.type}' needs a non-zero support segment: ${constraint.from} -> ${constraint.to}.`,
      },
    ]
  }

  const tolerance = relationTolerance(metrics.segmentLengthSquared)
  const clampedPosition =
    metrics.position >= -tolerance && metrics.position <= 1 + tolerance

  if (metrics.crossDistance > tolerance || !clampedPosition) {
    return [
      {
        code: "BROKEN_CONSTRAINT",
        message: `Constraint '${constraint.type}' did not keep point '${constraint.point}' on segment ${constraint.from} -> ${constraint.to}.`,
      },
    ]
  }

  if (constraint.type === "point-on-segment") {
    return []
  }

  const source = points.get(constraint.source)
  if (!source) {
    return [
      {
        code: "INVALID_CONSTRAINT",
        message: `Constraint '${constraint.type}' references unknown point '${constraint.source}'.`,
      },
    ]
  }

  const sourceVector = subtract(point, source)
  const baseVector = subtract(from, to)
  const projectionError = Math.abs(dot(sourceVector, baseVector))
  const toleranceDot =
    Math.sqrt(lengthSquared(sourceVector) * lengthSquared(baseVector)) * 0.01

  if (projectionError > toleranceDot) {
    return [
      {
        code: "BROKEN_CONSTRAINT",
        message: `Constraint '${constraint.type}' did not place point '${constraint.point}' as a perpendicular foot from '${constraint.source}'.`,
      },
    ]
  }

  return []
}

function validateMarker(
  marker: GeometryMarker,
  points: Map<string, GeometryFigureSpec["points"][number]>,
): FigureValidationIssue[] {
  if (marker.type === "tick") {
    const from = points.get(marker.from)
    const to = points.get(marker.to)
    if (!from || !to) {
      return [
        {
          code: "INVALID_MARKER",
          message: `Tick marker references unknown points: ${marker.from}, ${marker.to}.`,
        },
      ]
    }

    if (distanceSquared(from, to) === 0) {
      return [
        {
          code: "INVALID_MARKER",
          message: `Tick marker references a zero-length segment: ${marker.from} -> ${marker.to}.`,
        },
      ]
    }

    return []
  }

  const at = points.get(marker.at)
  if (!at) {
    return [
      {
        code: "INVALID_MARKER",
        message: `Marker references an unknown point: ${marker.at}.`,
      },
    ]
  }

  const first = points.get(marker.type === "right-angle" ? marker.alongA : marker.from)
  const second = points.get(marker.type === "right-angle" ? marker.alongB : marker.to)

  if (!first || !second) {
    return [
      {
        code: "INVALID_MARKER",
        message: "Marker references unknown supporting points.",
      },
    ]
  }

  if (distanceSquared(at, first) === 0 || distanceSquared(at, second) === 0 || distanceSquared(first, second) === 0) {
    return [
      {
        code: "INVALID_MARKER",
        message: "Marker references overlapping points and cannot be rendered.",
      },
    ]
  }

  return []
}

function validateGeometryFigureSpec(spec: GeometryFigureSpec): FigureValidationIssue[] {
  const issues: FigureValidationIssue[] = []
  const points = new Map<string, GeometryFigureSpec["points"][number]>()

  for (const point of spec.points) {
    if (points.has(point.id)) {
      issues.push({
        code: "DUPLICATE_POINT_ID",
        message: `Point id '${point.id}' is duplicated.`,
      })
      continue
    }

    points.set(point.id, point)
  }

  for (const segment of spec.segments ?? []) {
    const from = points.get(segment.from)
    const to = points.get(segment.to)

    if (!from || !to) {
      issues.push({
        code: "UNKNOWN_SEGMENT_POINT",
        message: `Segment '${segment.from} -> ${segment.to}' references an unknown point.`,
      })
      continue
    }

    if (distanceSquared(from, to) === 0) {
      issues.push({
        code: "ZERO_LENGTH_SEGMENT",
        message: `Segment '${segment.from} -> ${segment.to}' has zero length.`,
      })
    }
  }

  for (const polygon of spec.polygons ?? []) {
    const uniqueIDs = new Set<string>()

    for (const pointID of polygon.points) {
      if (!points.has(pointID)) {
        issues.push({
          code: "UNKNOWN_POLYGON_POINT",
          message: `Polygon references an unknown point '${pointID}'.`,
        })
      } else {
        uniqueIDs.add(pointID)
      }
    }

    if (uniqueIDs.size < 3) {
      issues.push({
        code: "INVALID_POLYGON",
        message: "A polygon must reference at least three distinct points.",
      })
    }
  }

  for (const marker of spec.markers ?? []) {
    issues.push(...validateMarker(marker, points))
  }

  for (const constraint of spec.constraints ?? []) {
    issues.push(...validateConstraint(constraint, points))
  }

  return issues
}

export {
  validateGeometryFigureSpec,
}

export type {
  FigureValidationIssue,
}
