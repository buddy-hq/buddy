import { z } from "zod"

const SKILL_TOGGLE_ACTIONS = ["allow", "deny", "ask", "inherit"] as const

export const createSkillBodySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  examplePrompt: z.string().trim().optional(),
  content: z.string().trim().min(1),
})

export const toggleSkillBodySchema = z
  .object({
    action: z.enum(SKILL_TOGGLE_ACTIONS).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => value.action !== undefined || value.enabled !== undefined, {
    message: "action or enabled is required",
  })

export const skillsSettingsBodySchema = z.object({
  externalVendorRootsEnabled: z.boolean(),
})

export type ToggleSkillBody = z.infer<typeof toggleSkillBodySchema>
