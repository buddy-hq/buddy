import type {
  GeometryConstraint,
  GeometryFigureSpec,
  GeometryPoint,
} from "./types.js"
import type { FigureValidationIssue } from "./validate.js"

type PointLookup = Map<string, GeometryPoint>
type Vector = {
  x: number
  y: number
}

const MAX_RESOLUTION_PASSES = 4
const PARALLEL_EPSILON = 1e-9
const POSITION_EPSILON = 1e-6

function subtract(from: GeometryPoint, to: GeometryPoint): Vector {
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

function clampUnit(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function interpolate(
  from: GeometryPoint,
  to: GeometryPoint,
  position: number,
): { x: number; y: number } {
  return {
    x: from.x + (to.x - from.x) * position,
    y: from.y + (to.y - from.y) * position,
  }
}

function projectToSegmentPosition(
  point: GeometryPoint,
  from: GeometryPoint,
  to: GeometryPoint,
): number | undefined {
  const segment = subtract(from, to)
  const segmentLengthSquared = lengthSquared(segment)
  if (segmentLengthSquared <= POSITION_EPSILON) return undefined

  const relative = subtract(from, point)
  return clampUnit(dot(relative, segment) / segmentLengthSquared)
}

function samePosition(
  point: GeometryPoint,
  target: { x: number; y: number },
): boolean {
  return (
    Math.abs(point.x - target.x) <= POSITION_EPSILON &&
    Math.abs(point.y - target.y) <= POSITION_EPSILON
  )
}

function updatePoint(
  points: PointLookup,
  pointID: string,
  target: { x: number; y: number },
): boolean {
  const point = points.get(pointID)
  if (!point) return false
  if (samePosition(point, target)) return false

  points.set(pointID, {
    ...point,
    x: target.x,
    y: target.y,
  })
  return true
}

function createIssueRecorder() {
  const issues: FigureValidationIssue[] = []
  const seen = new Set<string>()

  const record = (issue: FigureValidationIssue) => {
    const key = `${issue.code}:${issue.message}`
    if (seen.has(key)) return
    seen.add(key)
    issues.push(issue)
  }

  return {
    issues,
    record,
  }
}

function requirePoint(
  points: PointLookup,
  pointID: string,
  record: (issue: FigureValidationIssue) => void,
  context: string,
): GeometryPoint | undefined {
  const point = points.get(pointID)
  if (point) return point

  record({
    code: "UNKNOWN_CONSTRAINT_POINT",
    message: `${context} references unknown point '${pointID}'.`,
  })
  return undefined
}

function resolvePointOnSegment(
  constraint: Extract<GeometryConstraint, { type: "point-on-segment" }>,
  points: PointLookup,
  record: (issue: FigureValidationIssue) => void,
): boolean {
  const point = requirePoint(points, constraint.point, record, "Constraint")
  const from = requirePoint(points, constraint.from, record, "Constraint")
  const to = requirePoint(points, constraint.to, record, "Constraint")
  if (!point || !from || !to) return false

  const inferredPosition =
    typeof constraint.position === "number"
      ? constraint.position
      : projectToSegmentPosition(point, from, to)

  if (typeof inferredPosition !== "number") {
    record({
      code: "INVALID_CONSTRAINT",
      message: `Constraint '${constraint.type}' needs a non-zero support segment: ${constraint.from} -> ${constraint.to}.`,
    })
    return false
  }

  return updatePoint(points, constraint.point, interpolate(from, to, inferredPosition))
}

function resolvePerpendicularFoot(
  constraint: Extract<GeometryConstraint, { type: "perpendicular-foot" }>,
  points: PointLookup,
  record: (issue: FigureValidationIssue) => void,
): boolean {
  const point = requirePoint(points, constraint.point, record, "Constraint")
  const source = requirePoint(points, constraint.source, record, "Constraint")
  const from = requirePoint(points, constraint.from, record, "Constraint")
  const to = requirePoint(points, constraint.to, record, "Constraint")
  if (!point || !source || !from || !to) return false

  const projectedPosition = projectToSegmentPosition(source, from, to)
  if (typeof projectedPosition !== "number") {
    record({
      code: "INVALID_CONSTRAINT",
      message: `Constraint '${constraint.type}' needs a non-zero support segment: ${constraint.from} -> ${constraint.to}.`,
    })
    return false
  }

  return updatePoint(points, constraint.point, interpolate(from, to, projectedPosition))
}

function resolveLineIntersection(
  constraint: Extract<GeometryConstraint, { type: "line-intersection" }>,
  points: PointLookup,
  record: (issue: FigureValidationIssue) => void,
): boolean {
  const point = requirePoint(points, constraint.point, record, "Constraint")
  const lineAFrom = requirePoint(points, constraint.lineAFrom, record, "Constraint")
  const lineATo = requirePoint(points, constraint.lineATo, record, "Constraint")
  const lineBFrom = requirePoint(points, constraint.lineBFrom, record, "Constraint")
  const lineBTo = requirePoint(points, constraint.lineBTo, record, "Constraint")
  if (!point || !lineAFrom || !lineATo || !lineBFrom || !lineBTo) return false

  const dirA = subtract(lineAFrom, lineATo)
  const dirB = subtract(lineBFrom, lineBTo)
  const determinant = cross(dirA, dirB)

  if (Math.abs(determinant) <= PARALLEL_EPSILON) {
    record({
      code: "INVALID_CONSTRAINT",
      message: `Constraint '${constraint.type}' uses parallel or overlapping lines and cannot resolve point '${constraint.point}'.`,
    })
    return false
  }

  const delta = subtract(lineAFrom, lineBFrom)
  const t = cross(delta, dirB) / determinant
  const resolved = {
    x: lineAFrom.x + dirA.x * t,
    y: lineAFrom.y + dirA.y * t,
  }

  return updatePoint(points, constraint.point, resolved)
}

function resolveConstraint(
  constraint: GeometryConstraint,
  points: PointLookup,
  record: (issue: FigureValidationIssue) => void,
): boolean {
  if (constraint.type === "point-on-segment") {
    return resolvePointOnSegment(constraint, points, record)
  }

  if (constraint.type === "perpendicular-foot") {
    return resolvePerpendicularFoot(constraint, points, record)
  }

  return resolveLineIntersection(constraint, points, record)
}

function resolveGeometryFigureSpec(
  spec: GeometryFigureSpec,
): {
  spec: GeometryFigureSpec
  issues: FigureValidationIssue[]
} {
  if (!spec.constraints || spec.constraints.length === 0) {
    return { spec, issues: [] }
  }

  const points = new Map(
    spec.points.map((point) => [
      point.id,
      {
        ...point,
      },
    ]),
  )
  const { issues, record } = createIssueRecorder()

  for (let pass = 0; pass < MAX_RESOLUTION_PASSES; pass += 1) {
    let changed = false

    for (const constraint of spec.constraints) {
      changed = resolveConstraint(constraint, points, record) || changed
    }

    if (!changed) {
      break
    }
  }

  return {
    spec: {
      ...spec,
      points: spec.points.map((point) => points.get(point.id) ?? point),
    },
    issues,
  }
}

export {
  resolveGeometryFigureSpec,
}
