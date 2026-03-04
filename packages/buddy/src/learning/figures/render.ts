import type {
  GeometryFigureSpec,
  GeometryMarker,
  GeometryPoint,
} from "./types.js"

type PointLookup = Map<string, GeometryPoint>
type Vector = {
  x: number
  y: number
}

function escapeXML(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function pointRef(point: GeometryPoint): string {
  return `${formatNumber(point.x)} ${formatNumber(point.y)}`
}

function createPointLookup(spec: GeometryFigureSpec): PointLookup {
  return new Map(spec.points.map((point) => [point.id, point]))
}

function subtract(from: GeometryPoint, to: GeometryPoint): Vector {
  return {
    x: to.x - from.x,
    y: to.y - from.y,
  }
}

function length(vector: Vector): number {
  return Math.hypot(vector.x, vector.y)
}

function normalize(vector: Vector): Vector {
  const vectorLength = length(vector)
  if (vectorLength === 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: vector.x / vectorLength,
    y: vector.y / vectorLength,
  }
}

function scale(vector: Vector, amount: number): Vector {
  return {
    x: vector.x * amount,
    y: vector.y * amount,
  }
}

function add(point: GeometryPoint, vector: Vector): GeometryPoint {
  return {
    id: point.id,
    x: point.x + vector.x,
    y: point.y + vector.y,
    ...(point.label ? { label: point.label } : {}),
  }
}

function midpoint(pointA: GeometryPoint, pointB: GeometryPoint): GeometryPoint {
  return {
    id: `${pointA.id}-${pointB.id}`,
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
  }
}

function perpendicular(vector: Vector): Vector {
  return {
    x: -vector.y,
    y: vector.x,
  }
}

function angleOf(vector: Vector): number {
  return Math.atan2(vector.y, vector.x)
}

function shortestAngleDelta(startAngle: number, endAngle: number): number {
  let delta = endAngle - startAngle
  while (delta <= -Math.PI) delta += Math.PI * 2
  while (delta > Math.PI) delta -= Math.PI * 2
  return delta
}

function renderText(label: string, x: number, y: number, anchor = "middle"): string {
  return `<text x="${formatNumber(x)}" y="${formatNumber(y)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" text-anchor="${anchor}" fill="#0f172a" stroke="#ffffff" stroke-opacity="0.92" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill">${escapeXML(label)}</text>`
}

function renderRightAngleMarker(marker: Extract<GeometryMarker, { type: "right-angle" }>, points: PointLookup): string {
  const at = points.get(marker.at)!
  const alongA = points.get(marker.alongA)!
  const alongB = points.get(marker.alongB)!
  const size = 12
  const vectorA = normalize(subtract(at, alongA))
  const vectorB = normalize(subtract(at, alongB))
  const pointA = add(at, scale(vectorA, size))
  const pointB = add(pointA, scale(vectorB, size))
  const pointC = add(at, scale(vectorB, size))

  return `<polyline points="${pointRef(pointA)} ${pointRef(pointB)} ${pointRef(pointC)}" fill="none" stroke="#334155" stroke-width="1.5" />`
}

function renderTickMarker(marker: Extract<GeometryMarker, { type: "tick" }>, points: PointLookup): string {
  const from = points.get(marker.from)!
  const to = points.get(marker.to)!
  const segment = subtract(from, to)
  const direction = normalize(segment)
  const normal = normalize(perpendicular(direction))
  const mid = midpoint(from, to)
  const count = marker.count ?? 1
  const spacing = 8
  const halfLength = 5
  const centerOffsets =
    count === 1
      ? [0]
      : count === 2
        ? [-spacing / 2, spacing / 2]
        : [-spacing, 0, spacing]

  return centerOffsets
    .map((offset) => {
      const center = add(mid, scale(direction, offset))
      const start = add(center, scale(normal, -halfLength))
      const end = add(center, scale(normal, halfLength))
      return `<line x1="${formatNumber(start.x)}" y1="${formatNumber(start.y)}" x2="${formatNumber(end.x)}" y2="${formatNumber(end.y)}" stroke="#334155" stroke-width="1.5" />`
    })
    .join("")
}

function renderAngleArc(marker: Extract<GeometryMarker, { type: "angle-arc" }>, points: PointLookup): string {
  const at = points.get(marker.at)!
  const from = points.get(marker.from)!
  const to = points.get(marker.to)!
  const radius = 18
  const fromVector = normalize(subtract(at, from))
  const toVector = normalize(subtract(at, to))
  const startAngle = angleOf(fromVector)
  const delta = shortestAngleDelta(startAngle, angleOf(toVector))
  const endAngle = startAngle + delta
  const start = add(at, {
    x: Math.cos(startAngle) * radius,
    y: Math.sin(startAngle) * radius,
  })
  const end = add(at, {
    x: Math.cos(endAngle) * radius,
    y: Math.sin(endAngle) * radius,
  })
  const sweepFlag = delta >= 0 ? 1 : 0
  const midAngle = startAngle + delta / 2
  const labelPoint = add(at, {
    x: Math.cos(midAngle) * (radius + 12),
    y: Math.sin(midAngle) * (radius + 12),
  })
  const path = `<path d="M ${pointRef(start)} A ${formatNumber(radius)} ${formatNumber(radius)} 0 0 ${sweepFlag} ${pointRef(end)}" fill="none" stroke="#334155" stroke-width="1.5" />`

  if (!marker.label) {
    return path
  }

  return `${path}${renderText(marker.label, labelPoint.x, labelPoint.y)}`
}

function renderMarker(marker: GeometryMarker, points: PointLookup): string {
  if (marker.type === "right-angle") {
    return renderRightAngleMarker(marker, points)
  }

  if (marker.type === "tick") {
    return renderTickMarker(marker, points)
  }

  return renderAngleArc(marker, points)
}

function renderGeometryFigure(spec: GeometryFigureSpec): string {
  const width = spec.canvas.width
  const height = spec.canvas.height
  const padding = spec.canvas.padding ?? 24
  const totalWidth = width + padding * 2
  const totalHeight = height + padding * 2
  const points = createPointLookup(spec)

  const polygonElements = (spec.polygons ?? [])
    .map((polygon) => {
      const polygonPoints = polygon.points.map((pointID) => points.get(pointID)!)
      const shape = `<polygon points="${polygonPoints.map(pointRef).join(" ")}" fill="${polygon.fill === "shade" ? "#dbeafe" : "none"}" stroke="#1d4ed8" stroke-width="2" ${polygon.outline === "dashed" ? 'stroke-dasharray="6 4"' : ""} />`

      if (!polygon.label) {
        return shape
      }

      const centroid = polygonPoints.reduce(
        (accumulator, point) => ({
          x: accumulator.x + point.x / polygonPoints.length,
          y: accumulator.y + point.y / polygonPoints.length,
        }),
        { x: 0, y: 0 },
      )

      return `${shape}${renderText(polygon.label, centroid.x, centroid.y)}`
    })
    .join("")

  const segmentElements = (spec.segments ?? [])
    .map((segment) => {
      const from = points.get(segment.from)!
      const to = points.get(segment.to)!
      const line = `<line x1="${formatNumber(from.x)}" y1="${formatNumber(from.y)}" x2="${formatNumber(to.x)}" y2="${formatNumber(to.y)}" stroke="#0f172a" stroke-width="${formatNumber(segment.strokeWidth ?? 2)}" ${segment.style === "dashed" ? 'stroke-dasharray="6 4"' : ""} />`

      if (!segment.label) {
        return line
      }

      const mid = midpoint(from, to)
      const normal = normalize(perpendicular(subtract(from, to)))
      const labelPoint = add(mid, scale(normal, 12))

      return `${line}${renderText(segment.label, labelPoint.x, labelPoint.y)}`
    })
    .join("")

  const markerElements = (spec.markers ?? []).map((marker) => renderMarker(marker, points)).join("")

  const pointElements = spec.points
    .map((point) => {
      const circle = `<circle cx="${formatNumber(point.x)}" cy="${formatNumber(point.y)}" r="3.5" fill="#0f172a" />`
      const label = point.label ? renderText(point.label, point.x + 10, point.y - 8, "start") : ""
      return `${circle}${label}`
    })
    .join("")

  const labelElements = (spec.labels ?? [])
    .map((label) => renderText(label.text, label.x, label.y))
    .join("")

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(totalWidth)}" height="${formatNumber(totalHeight)}" viewBox="0 0 ${formatNumber(totalWidth)} ${formatNumber(totalHeight)}" role="img" aria-label="Geometry figure">`,
    `<rect x="0" y="0" width="${formatNumber(totalWidth)}" height="${formatNumber(totalHeight)}" rx="12" fill="#ffffff" />`,
    `<g transform="translate(${formatNumber(padding)}, ${formatNumber(padding)})" stroke-linecap="round" stroke-linejoin="round">`,
    polygonElements,
    segmentElements,
    markerElements,
    pointElements,
    labelElements,
    "</g>",
    "</svg>",
  ].join("")
}

export {
  renderGeometryFigure,
}
