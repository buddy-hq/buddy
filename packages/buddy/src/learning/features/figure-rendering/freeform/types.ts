import z from "zod"
import { BuddyObjectIDSchema, nonEmptyString } from "../../../../objects"

const RenderFreeformFigureOutputSchema = z.object({
  objectID: BuddyObjectIDSchema,
  revisionID: BuddyObjectIDSchema,
  mime: z.literal("image/svg+xml"),
  rawUrl: nonEmptyString,
  relativePath: nonEmptyString,
  alt: nonEmptyString,
  caption: nonEmptyString.nullable(),
  markdown: nonEmptyString,
  repairAttempts: z.literal(0),
})

type RenderFreeformFigureOutput = z.infer<typeof RenderFreeformFigureOutputSchema>

export { RenderFreeformFigureOutputSchema }
export type { RenderFreeformFigureOutput }
