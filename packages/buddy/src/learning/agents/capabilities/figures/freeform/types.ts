import z from "zod"

const nonEmptyString = z.string().trim().min(1)

const RenderFreeformFigureInputSchema = z.object({
  kind: z.literal("svg.v1"),
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  source: nonEmptyString,
})

const RenderFreeformFigureOutputSchema = z.object({
  figureID: z.string().length(64),
  mime: z.literal("image/svg+xml"),
  url: nonEmptyString,
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  markdown: nonEmptyString,
  repairAttempts: z.literal(0),
})

type RenderFreeformFigureInput = z.infer<typeof RenderFreeformFigureInputSchema>
type RenderFreeformFigureOutput = z.infer<typeof RenderFreeformFigureOutputSchema>

export {
  RenderFreeformFigureInputSchema,
  RenderFreeformFigureOutputSchema,
}

export type {
  RenderFreeformFigureInput,
  RenderFreeformFigureOutput,
}
