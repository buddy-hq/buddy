import z from "zod"

const nonEmptyString = z.string().trim().min(1)

const RenderFreeformFigureOutputSchema = z.object({
  figureID: z.string().length(64),
  mime: z.literal("image/svg+xml"),
  url: nonEmptyString,
  alt: nonEmptyString,
  caption: nonEmptyString.optional(),
  markdown: nonEmptyString,
  repairAttempts: z.literal(0),
})

type RenderFreeformFigureOutput = z.infer<typeof RenderFreeformFigureOutputSchema>

export { RenderFreeformFigureOutputSchema }

export type { RenderFreeformFigureOutput }
