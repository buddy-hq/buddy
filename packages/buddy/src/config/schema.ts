import z from "zod"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"

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

  export const Info = z
    .object({
      $schema: openCodeInfoShape["$schema"],
      skills: openCodeInfoShape.skills,
      disabled_providers: openCodeInfoShape.disabled_providers,
      enabled_providers: openCodeInfoShape.enabled_providers,
      model: openCodeInfoShape.model,
      small_model: openCodeInfoShape.small_model,
      default_agent: openCodeInfoShape.default_agent,
      mode: openCodeInfoShape.mode,
      agent: openCodeInfoShape.agent,
      provider: openCodeInfoShape.provider,
      mcp: openCodeInfoShape.mcp,
      permission: openCodeInfoShape.permission,
      tools: openCodeInfoShape.tools,
    })
    .strict()

  export type Info = z.output<typeof Info>
}
