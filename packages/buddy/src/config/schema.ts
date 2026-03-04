import z from "zod"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import { resolveBuddyModeProfiles } from "../modes/catalog.js"
import { BUDDY_MODE_IDS, BUDDY_SURFACES } from "../modes/types.js"

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
  const BuddySurface = z.enum(BUDDY_SURFACES)
  const BuddyModeID = z.enum(BUDDY_MODE_IDS)

  export const ModeOverride = z
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
  export type ModeOverride = z.infer<typeof ModeOverride>

  export const Modes = z
    .object({
      buddy: ModeOverride.optional(),
      "code-buddy": ModeOverride.optional(),
      "math-buddy": ModeOverride.optional(),
    })
    .strict()
  export type Modes = z.infer<typeof Modes>

  export const Info = z
    .object({
      $schema: openCodeInfoShape["$schema"],
      skills: openCodeInfoShape.skills,
      disabled_providers: openCodeInfoShape.disabled_providers,
      enabled_providers: openCodeInfoShape.enabled_providers,
      model: openCodeInfoShape.model,
      small_model: openCodeInfoShape.small_model,
      default_mode: BuddyModeID.optional(),
      modes: Modes.optional(),
      agent: openCodeInfoShape.agent,
      provider: openCodeInfoShape.provider,
      mcp: openCodeInfoShape.mcp,
      permission: openCodeInfoShape.permission,
      tools: openCodeInfoShape.tools,
    })
    .strict()
    .superRefine((value, ctx) => {
      const profiles = resolveBuddyModeProfiles(value.modes)

      for (const modeID of BUDDY_MODE_IDS) {
        const profile = profiles[modeID]
        if (profile.surfaces.includes(profile.defaultSurface)) {
          continue
        }

        ctx.addIssue({
          code: "custom",
          path: ["modes", modeID, "surfaces"],
          message: `defaultSurface "${profile.defaultSurface}" must remain available for ${modeID}`,
        })
      }

      if (value.default_mode && profiles[value.default_mode].hidden) {
        ctx.addIssue({
          code: "custom",
          path: ["default_mode"],
          message: `default_mode "${value.default_mode}" cannot point to a hidden mode`,
        })
      }

      if (BUDDY_MODE_IDS.every((modeID) => profiles[modeID].hidden)) {
        ctx.addIssue({
          code: "custom",
          path: ["modes"],
          message: "At least one Buddy mode must remain visible",
        })
      }
    })

  export type Info = z.output<typeof Info>
}
