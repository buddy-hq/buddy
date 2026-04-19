import path from "node:path"
import z from "zod"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import {
  PERSONA_SURFACES,
  INTENTS,
  PERSONAS,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import { resolveBuddyPersonaProfiles } from "../../learning/personas/wiring/persona.orchestration"

export namespace ConfigSchema {
  const NOTEBOOK_HOME_PATH_ERROR_MESSAGE = "notebook_home must be an absolute path" as const

  export const Mcp = OpenCodeConfig.Mcp
  export type Mcp = z.infer<typeof Mcp>

  export type PermissionAction = z.infer<typeof OpenCodeConfig.PermissionAction>
  export type PermissionRule = z.infer<typeof OpenCodeConfig.PermissionRule>

  export const Permission = OpenCodeConfig.Permission
  export type Permission = z.infer<typeof Permission>

  export const Agent = OpenCodeConfig.Agent
  export type Agent = z.output<typeof Agent>

  const openCodeInfoShape = OpenCodeConfig.Info.shape
  const TOOL_TOGGLE_MAP = z.record(z.string(), z.boolean()).optional()
  const BuddySurface = z.enum(PERSONA_SURFACES)
  const BuddyPersonaID = z.enum(PERSONAS)
  const TeachingIntent = z.enum(INTENTS)

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
      if (
        value.defaultSurface &&
        value.surfaces &&
        !value.surfaces.includes(value.defaultSurface)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["defaultSurface"],
          message: "defaultSurface must be included in surfaces",
        })
      }
    })
  export type PersonaOverride = z.infer<typeof PersonaOverride>

  const PERSONA_OVERRIDE_SHAPE = Object.fromEntries(
    PERSONAS.map((personaID) => [personaID, PersonaOverride.optional()]),
  ) as Record<(typeof PERSONAS)[number], z.ZodOptional<typeof PersonaOverride>>

  export const Personas = z.object(PERSONA_OVERRIDE_SHAPE).strict()
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
      compaction: openCodeInfoShape.compaction,
      tools: TOOL_TOGGLE_MAP,
      skills_external_vendor_roots_enabled: z.boolean().optional(),
      notebook_home: z.string().nullable().optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      const profiles = resolveBuddyPersonaProfiles(value.personas)

      for (const personaID of PERSONAS) {
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

      if (PERSONAS.every((personaID) => profiles[personaID].hidden)) {
        ctx.addIssue({
          code: "custom",
          path: ["personas"],
          message: "At least one Buddy persona must remain visible",
        })
      }

      if (typeof value.notebook_home === "string") {
        const notebookHomePath = value.notebook_home.trim()
        if (!path.isAbsolute(notebookHomePath)) {
          ctx.addIssue({
            code: "custom",
            path: ["notebook_home"],
            message: NOTEBOOK_HOME_PATH_ERROR_MESSAGE,
          })
        }
      }
    })

  export type Info = z.output<typeof Info>
}
