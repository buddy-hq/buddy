import z from "zod"

const finiteNumber = z.number().refine(Number.isFinite, "Must be a finite number")
const positiveFiniteNumber = finiteNumber.refine((value) => value > 0, "Must be a positive number")
const nonNegativeFiniteNumber = finiteNumber.refine((value) => value >= 0, "Must be a non-negative number")
const nonEmptyString = z.string().trim().min(1)

const GeometryPointSchema = z.object({
  id: nonEmptyString,
  x: finiteNumber,
  y: finiteNumber,
  label: nonEmptyString.optional(),
})

const GeometrySegmentSchema = z.object({
  from: nonEmptyString,
  to: nonEmptyString,
  style: z.enum(["solid", "dashed"]).optional(),
  strokeWidth: positiveFiniteNumber.optional(),
  label: nonEmptyString.optional(),
})

const GeometryPolygonSchema = z.object({
  points: z.array(nonEmptyString).min(3),
  fill: z.enum(["none", "shade"]).optional(),
  outline: z.enum(["solid", "dashed"]).optional(),
  label: nonEmptyString.optional(),
})

const GeometryLabelSchema = z.object({
  text: nonEmptyString,
  x: finiteNumber,
  y: finiteNumber,
})

const unitIntervalNumber = finiteNumber.refine(
  (value) => value >= 0 && value <= 1,
  "Must be between 0 and 1",
)

const GeometryConstraintSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("point-on-segment"),
    point: nonEmptyString,
    from: nonEmptyString,
    to: nonEmptyString,
    position: unitIntervalNumber.optional(),
  }),
  z.object({
    type: z.literal("perpendicular-foot"),
    point: nonEmptyString,
    source: nonEmptyString,
    from: nonEmptyString,
    to: nonEmptyString,
  }),
  z.object({
    type: z.literal("line-intersection"),
    point: nonEmptyString,
    lineAFrom: nonEmptyString,
    lineATo: nonEmptyString,
    lineBFrom: nonEmptyString,
    lineBTo: nonEmptyString,
  }),
])

const GeometryMarkerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("right-angle"),
    at: nonEmptyString,
    alongA: nonEmptyString,
    alongB: nonEmptyString,
  }),
  z.object({
    type: z.literal("tick"),
    from: nonEmptyString,
    to: nonEmptyString,
    count: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  }),
  z.object({
    type: z.literal("angle-arc"),
    at: nonEmptyString,
    from: nonEmptyString,
    to: nonEmptyString,
    label: nonEmptyString.optional(),
  }),
])

const GeometryFigureSpecSchema = z.object({
  canvas: z.object({
    width: positiveFiniteNumber,
    height: positiveFiniteNumber,
    padding: nonNegativeFiniteNumber.optional(),
  }),
  points: z.array(GeometryPointSchema).min(1),
  segments: z.array(GeometrySegmentSchema).optional(),
  polygons: z.array(GeometryPolygonSchema).optional(),
  labels: z.array(GeometryLabelSchema).optional(),
  constraints: z.array(GeometryConstraintSchema).optional(),
  markers: z.array(GeometryMarkerSchema).optional(),
})

const RenderFigureInputSchema = z.object({
  kind: z.literal("geometry.v1"),
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  spec: GeometryFigureSpecSchema,
})

const RenderFigureOutputSchema = z.object({
  figureID: z.string().length(64),
  mime: z.literal("image/svg+xml"),
  url: nonEmptyString,
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  markdown: nonEmptyString,
  repairAttempts: z.number().int().nonnegative().max(2),
})

type GeometryPoint = z.infer<typeof GeometryPointSchema>
type GeometrySegment = z.infer<typeof GeometrySegmentSchema>
type GeometryPolygon = z.infer<typeof GeometryPolygonSchema>
type GeometryLabel = z.infer<typeof GeometryLabelSchema>
type GeometryConstraint = z.infer<typeof GeometryConstraintSchema>
type GeometryMarker = z.infer<typeof GeometryMarkerSchema>
type GeometryFigureSpec = z.infer<typeof GeometryFigureSpecSchema>
type RenderFigureInput = z.infer<typeof RenderFigureInputSchema>
type RenderFigureOutput = z.infer<typeof RenderFigureOutputSchema>

export {
  GeometryConstraintSchema,
  GeometryFigureSpecSchema,
  GeometryLabelSchema,
  GeometryMarkerSchema,
  GeometryPointSchema,
  GeometryPolygonSchema,
  GeometrySegmentSchema,
  RenderFigureInputSchema,
  RenderFigureOutputSchema,
}

export type {
  GeometryConstraint,
  GeometryFigureSpec,
  GeometryLabel,
  GeometryMarker,
  GeometryPoint,
  GeometryPolygon,
  GeometrySegment,
  RenderFigureInput,
  RenderFigureOutput,
}
