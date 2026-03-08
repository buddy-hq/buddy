import z from "zod"
import { ACTIVITY_KINDS, SCAFFOLDING_LEVELS } from "../runtime/types.js"

export const SessionPlanSchema = z.object({
  warmupReviewGoalIds: z.array(z.string()).default([]),
  primaryGoalId: z.string().optional(),
  suggestedActivity: z.enum(ACTIVITY_KINDS),
  suggestedScaffoldingLevel: z.enum(SCAFFOLDING_LEVELS),
  alternatives: z.array(z.string()).default([]),
  rationale: z.array(z.string()).default([]),
  motivationHook: z.string().optional(),
  constraintsConsidered: z.array(z.string()).default([]),
  prerequisiteWarnings: z.array(z.string()).default([]),
})

export type SessionPlan = z.infer<typeof SessionPlanSchema>
