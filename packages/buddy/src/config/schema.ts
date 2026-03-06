import z from "zod"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import { PERSONA_SURFACE_IDS, TEACHING_INTENT_IDS } from "../learning/runtime/types.js"
import { resolveBuddyPersonaProfiles } from "../personas/catalog.js"
import { PERSONA_IDS } from "../personas/types.js"

export namespace ConfigSchema {
  export const Mcp = OpenCodeConfig.Mcp
  export type Mcp = z.infer<typeof Mcp>

  export type PermissionAction = z.infer<typeof OpenCodeConfig.PermissionAction>
  export type PermissionRule = z.infer<typeof OpenCodeConfig.PermissionRule>

  export const Permission = OpenCodeConfig.Permission
  export type Permission = z.infer<typeof Permission>

  export const Agent = OpenCodeConfig.Agent
  export type Agent = z.output<typeof Agent>

  const openCodeInfoShape = OpenCodeConfig.Info.shape
  const BuddySurface = z.enum(PERSONA_SURFACE_IDS)
  const BuddyPersonaID = z.enum(PERSONA_IDS)
  const TeachingIntent = z.enum(TEACHING_INTENT_IDS)

  export const PersonaOverride = z
    .object({
      label: z.string().optional(),
      description: z.string().optional(),
      surfaces: z.array(BuddySurface).optional(),
      defaultSurface: BuddySurface.optional(),
      hidden: z.boolean().optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.defaultSurface && value.surfaces && !value.surfaces.includes(value.defaultSurface)) {
        ctx.addIssue({
          code: "custom",
          path: ["defaultSurface"],
          message: "defaultSurface must be included in surfaces",
        })
      }
    })
  export type PersonaOverride = z.infer<typeof PersonaOverride>

  export const Personas = z
    .object({
      buddy: PersonaOverride.optional(),
      "code-buddy": PersonaOverride.optional(),
      "math-buddy": PersonaOverride.optional(),
    })
    .strict()
  export type Personas = z.infer<typeof Personas>

  export const Info = z
    .object({
      $schema: openCodeInfoShape["$schema"],
      skills: openCodeInfoShape.skills,
      disabled_providers: openCodeInfoShape.disabled_providers,
      enabled_providers: openCodeInfoShape.enabled_providers,
      model: openCodeInfoShape.model,
      small_model: openCodeInfoShape.small_model,
      default_persona: BuddyPersonaID.optional(),
      default_intent: TeachingIntent.nullable().optional(),
      personas: Personas.optional(),
      agent: openCodeInfoShape.agent,
      provider: openCodeInfoShape.provider,
      mcp: openCodeInfoShape.mcp,
      permission: openCodeInfoShape.permission,
      tools: openCodeInfoShape.tools,
    })
    .strict()
    .superRefine((value, ctx) => {
      const profiles = resolveBuddyPersonaProfiles(value.personas)

      for (const personaID of PERSONA_IDS) {
        const profile = profiles[personaID]
        if (profile.surfaces.includes(profile.defaultSurface)) {
          continue
        }

        ctx.addIssue({
          code: "custom",
          path: ["personas", personaID, "surfaces"],
          message: `defaultSurface "${profile.defaultSurface}" must remain available for ${personaID}`,
        })
      }

      if (value.default_persona && profiles[value.default_persona].hidden) {
        ctx.addIssue({
          code: "custom",
          path: ["default_persona"],
          message: `default_persona "${value.default_persona}" cannot point to a hidden persona`,
        })
      }

      if (PERSONA_IDS.every((personaID) => profiles[personaID].hidden)) {
        ctx.addIssue({
          code: "custom",
          path: ["personas"],
          message: "At least one Buddy persona must remain visible",
        })
      }
    })

  export type Info = z.output<typeof Info>
}
