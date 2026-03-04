import type { FigureValidationIssue } from "./validate.js"
import type { GeometryFigureSpec } from "./types.js"

function normalizeOptionalArray<T>(items: T[]): T[] | undefined {
  return items.length > 0 ? items : undefined
}

function repairGeometryFigureSpec(
  spec: GeometryFigureSpec,
  _issues: readonly FigureValidationIssue[],
): GeometryFigureSpec {
  const seenPointIDs = new Set<string>()
  const points = spec.points.filter((point) => {
    if (seenPointIDs.has(point.id)) {
      return false
    }

    seenPointIDs.add(point.id)
    return true
  })

  const pointMap = new Map(points.map((point) => [point.id, point]))

  const segments = normalizeOptionalArray(
    (spec.segments ?? []).filter((segment) => {
      const from = pointMap.get(segment.from)
      const to = pointMap.get(segment.to)
      if (!from || !to) return false
      return from.x !== to.x || from.y !== to.y
    }),
  )

  const polygons = normalizeOptionalArray(
    (spec.polygons ?? [])
      .map((polygon) => {
        const uniqueValidPointIDs: string[] = []
        const seenPolygonIDs = new Set<string>()

        for (const pointID of polygon.points) {
          if (!pointMap.has(pointID) || seenPolygonIDs.has(pointID)) {
            continue
          }

          seenPolygonIDs.add(pointID)
          uniqueValidPointIDs.push(pointID)
        }

        if (uniqueValidPointIDs.length < 3) {
          return undefined
        }

        return {
          ...polygon,
          points: uniqueValidPointIDs,
        }
      })
      .filter((polygon): polygon is NonNullable<typeof polygon> => polygon !== undefined),
  )

  const labels = normalizeOptionalArray(
    (spec.labels ?? []).filter((label) => label.text.trim().length > 0),
  )

  const constraints = normalizeOptionalArray(
    (spec.constraints ?? []).filter((constraint) => {
      const point = pointMap.get(constraint.point)
      if (!point) return false

      if (constraint.type === "point-on-segment" || constraint.type === "perpendicular-foot") {
        const from = pointMap.get(constraint.from)
        const to = pointMap.get(constraint.to)
        if (!from || !to) return false
        if (from.x === to.x && from.y === to.y) return false

        if (constraint.type === "perpendicular-foot") {
          return pointMap.has(constraint.source)
        }

        return true
      }

      const lineAFrom = pointMap.get(constraint.lineAFrom)
      const lineATo = pointMap.get(constraint.lineATo)
      const lineBFrom = pointMap.get(constraint.lineBFrom)
      const lineBTo = pointMap.get(constraint.lineBTo)

      if (!lineAFrom || !lineATo || !lineBFrom || !lineBTo) {
        return false
      }

      const dirAX = lineATo.x - lineAFrom.x
      const dirAY = lineATo.y - lineAFrom.y
      const dirBX = lineBTo.x - lineBFrom.x
      const dirBY = lineBTo.y - lineBFrom.y
      const determinant = dirAX * dirBY - dirAY * dirBX

      return Math.abs(determinant) > 1e-9
    }),
  )

  const markers = normalizeOptionalArray(
    (spec.markers ?? []).filter((marker) => {
      if (marker.type === "tick") {
        const from = pointMap.get(marker.from)
        const to = pointMap.get(marker.to)
        if (!from || !to) return false
        return from.x !== to.x || from.y !== to.y
      }

      const at = pointMap.get(marker.at)
      const first = pointMap.get(marker.type === "right-angle" ? marker.alongA : marker.from)
      const second = pointMap.get(marker.type === "right-angle" ? marker.alongB : marker.to)

      if (!at || !first || !second) {
        return false
      }

      const overlapsFirst = at.x === first.x && at.y === first.y
      const overlapsSecond = at.x === second.x && at.y === second.y
      const overlapsPeers = first.x === second.x && first.y === second.y

      return !overlapsFirst && !overlapsSecond && !overlapsPeers
    }),
  )

  return {
    canvas: spec.canvas,
    points,
    ...(segments ? { segments } : {}),
    ...(polygons ? { polygons } : {}),
    ...(labels ? { labels } : {}),
    ...(constraints ? { constraints } : {}),
    ...(markers ? { markers } : {}),
  }
}

export {
  repairGeometryFigureSpec,
}
