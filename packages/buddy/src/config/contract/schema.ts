import path from "node:path"
import z from "zod"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import {
  PERSONA_SURFACES,
  PERSONAS,
  PRIMARY_USES,
} from "@buddy/backend/learning/shared/teaching-vocabulary"
import { zodFromEffectSchema } from "../../http/effect-schema"
import { EXPERIMENTAL_FEATURE_ID } from "../../experimental-features/catalog"
import { resolveBuddyPersonaMetadata } from "../../learning/personas/wiring/persona-metadata"

export namespace ConfigSchema {
  const NOTEBOOK_HOME_PATH_ERROR_MESSAGE = "notebook_home must be an absolute path" as const
  const NonNegativeInteger = z.number().int().nonnegative()

  export const Mcp = zodFromEffectSchema(OpenCodeConfig.Mcp)
  export type Mcp = z.output<typeof Mcp>

  export const Skills = zodFromEffectSchema(OpenCodeConfig.Skills)
  export type Skills = z.output<typeof Skills>

  export const ModelID = zodFromEffectSchema(OpenCodeConfig.ModelID)
  export type ModelID = z.output<typeof ModelID>

  export const Provider = zodFromEffectSchema(OpenCodeConfig.Provider)
  export type Provider = z.output<typeof Provider>

  export type PermissionAction = OpenCodeConfig.PermissionAction
  export type PermissionRule = OpenCodeConfig.PermissionRule

  export const Permission = zodFromEffectSchema(OpenCodeConfig.Permission)
  export type Permission = z.output<typeof Permission>

  export const Agent = zodFromEffectSchema(OpenCodeConfig.Agent)
  export type Agent = z.output<typeof Agent>

  const TOOL_TOGGLE_MAP = z.record(z.string(), z.boolean()).optional()
  const BuddySurface = z.enum(PERSONA_SURFACES)
  const BuddyPersonaID = z.enum(PERSONAS)
  const DisabledMcp = z.object({ enabled: z.boolean() }).strict()
  const ExperimentalFeatures = z
    .object({
      [EXPERIMENTAL_FEATURE_ID.learnerMemory]: z.literal(true).optional(),
    })
    .strict()
    .optional()
  const LearnerMemory = z
    .object({
      master_enabled: z.boolean().optional(),
      enabled: z.boolean().optional(),
      auto_extract: z.boolean().optional(),
      min_user_messages: NonNegativeInteger.optional(),
      min_session_span_ms: NonNegativeInteger.optional(),
      active_burst_gap_ms: NonNegativeInteger.optional(),
      min_active_burst_messages: NonNegativeInteger.optional(),
      min_assistant_output_tokens: NonNegativeInteger.optional(),
      attention_threshold: NonNegativeInteger.optional(),
      approval_confidence_threshold: z.number().min(0).max(1).optional(),
      max_session_messages: NonNegativeInteger.optional(),
      auto_extract_delay_ms: NonNegativeInteger.optional(),
      max_extraction_calls_per_session: NonNegativeInteger.optional(),
      max_extraction_calls_per_day: NonNegativeInteger.optional(),
      default_context_memory_limit: NonNegativeInteger.optional(),
      extract_model: ModelID.optional(),
      consolidation_model: ModelID.optional(),
      min_startup_idle_ms: NonNegativeInteger.optional(),
      max_startup_session_age_ms: NonNegativeInteger.optional(),
      max_sessions_per_startup: NonNegativeInteger.optional(),
      startup_concurrency: NonNegativeInteger.optional(),
      max_raw_memories_for_consolidation: NonNegativeInteger.optional(),
      max_unused_stage_one_days: NonNegativeInteger.optional(),
    })
    .strict()
    .transform(({ master_enabled: _legacyMasterEnabled, ...learnerMemory }) => learnerMemory)
    .optional()
  const Compaction = z
    .object({
      auto: z.boolean().optional(),
      prune: z.boolean().optional(),
      tail_turns: NonNegativeInteger.optional(),
      preserve_recent_tokens: NonNegativeInteger.optional(),
      reserved: NonNegativeInteger.optional(),
    })
    .optional()
  const Personalization = z
    .object({
      primary_use: z.enum(PRIMARY_USES).optional(),
      preferred_name: z.string().optional(),
      occupation: z.string().optional(),
      more_about_you: z.string().optional(),
    })
    .strict()
    .optional()

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

  const PROJECT_INFO_SHAPE = {
    $schema: z.string().optional(),
    skills: Skills.optional(),
    disabled_providers: z.array(z.string()).optional(),
    enabled_providers: z.array(z.string()).optional(),
    model: ModelID.optional(),
    small_model: ModelID.optional(),
    default_persona: BuddyPersonaID.optional(),
    personas: Personas.optional(),
    agent: z.record(z.string(), Agent).optional(),
    provider: z.record(z.string(), Provider).optional(),
    mcp: z.record(z.string(), z.union([Mcp, DisabledMcp])).optional(),
    permission: Permission.optional(),
    compaction: Compaction,
    personalization: Personalization,
    tools: TOOL_TOGGLE_MAP,
    learner_memory: LearnerMemory,
    skills_external_vendor_roots_enabled: z.boolean().optional(),
    notebook_home: z.string().nullable().optional(),
  }

  const ProjectInfoBase = z.object(PROJECT_INFO_SHAPE).strict()
  type ProjectInfoBase = z.output<typeof ProjectInfoBase>

  function validateInfo(value: ProjectInfoBase, ctx: z.RefinementCtx): void {
      const profiles = resolveBuddyPersonaMetadata(value.personas)

      for (const personaID of PERSONAS) {
        const override = value.personas?.[personaID]
        if (!override) {
          continue
        }

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
  }

  export const ProjectInfo = ProjectInfoBase.superRefine(validateInfo)
  export type ProjectInfo = z.output<typeof ProjectInfo>

  export const Info = z
    .object({
      ...PROJECT_INFO_SHAPE,
      experimental_features: ExperimentalFeatures,
    })
    .strict()
    .superRefine(validateInfo)

  export type Info = z.output<typeof Info>
}
