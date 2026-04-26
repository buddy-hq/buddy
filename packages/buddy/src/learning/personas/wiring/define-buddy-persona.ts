import { definePromptTemplate } from "../../prompt/template/engine"
import type { BuddyPermissionInput, CoreAgentDefinition } from "../../agent-factories"
import BASE_PERSONA_PROMPT from "../prompts/base.p.md"
import { SMOKE_ASSESSMENT_TOOL_ID, SMOKE_PRACTICE_TOOL_ID } from "../../tools/dynamic-tool-ids"

type PersonaDomain = "general" | "coding" | "math"
type PersonaSurface = "curriculum" | "editor" | "figure" | "flashcard" | "question-set"
type ToolAccess = "inherit" | "allow" | "deny"
type SkillAccess = "inherit" | "allow" | "deny"
type SubagentAccess = "inherit" | "allow" | "deny" | "prefer"

type PersonaContextPolicyDefinition = {
  attachCurriculum: boolean
  attachProgress: boolean
  attachTeachingWorkspace: boolean
  attachTeachingPolicy: boolean
  attachFigureContext: boolean
}

type BuddyPersonaProfileDefinition<Id extends string = string> = {
  id: Id
  label: string
  description: string
  domain: PersonaDomain
  surfaces: readonly PersonaSurface[]
  defaultSurface: PersonaSurface
  hidden: boolean
  toolDefaults: Partial<Record<string, ToolAccess>>
  skillDefaults: Partial<Record<string, SkillAccess>>
  subagentDefaults: Partial<Record<string, SubagentAccess>>
  contextPolicy: PersonaContextPolicyDefinition
}

type PersonaRuntimeKind = "primary" | "build"

type PersonaRuntimeDefinition = Omit<
  CoreAgentDefinition,
  "mode" | "availableSubagents" | "prompt" | "description"
> & {
  kind: PersonaRuntimeKind
  prompt: string
  description?: string
  permission?: BuddyPermissionInput
}

type BuddyPersonaDefinitionInput<Id extends string> = BuddyPersonaProfileDefinition<Id> & {
  runtime: PersonaRuntimeDefinition
}

type DefinedBuddyPersona<Id extends string = string> = BuddyPersonaDefinitionInput<Id>

const DEFAULT_PRIMARY_PERSONA_PERMISSION = {
  question: "allow",
  plan_enter: "allow",
  todoread: "deny",
  todowrite: "deny",
  [SMOKE_PRACTICE_TOOL_ID]: "deny",
  [SMOKE_ASSESSMENT_TOOL_ID]: "deny",
} as const satisfies BuddyPermissionInput

export function defineBuddyPersona<const Id extends string>(
  input: BuddyPersonaDefinitionInput<Id>,
): DefinedBuddyPersona<Id> {
  if (!input.surfaces.includes(input.defaultSurface)) {
    throw new Error(
      `Persona "${input.id}" must include defaultSurface "${input.defaultSurface}" in surfaces`,
    )
  }

  const { runtime, ...profile } = input

  return {
    ...profile,
    surfaces: [...profile.surfaces],
    toolDefaults: { ...profile.toolDefaults },
    skillDefaults: { ...profile.skillDefaults },
    subagentDefaults: { ...profile.subagentDefaults },
    contextPolicy: { ...profile.contextPolicy },
    runtime: {
      ...runtime,
      prompt: definePromptTemplate({
        source: BASE_PERSONA_PROMPT,
        debugName: "base-persona-prompt",
      }).render({
        persona_overlay: runtime.prompt.trim(),
      }),
      ...(runtime.description ? { description: runtime.description } : {}),
      ...(runtime.permission ? { permission: runtime.permission } : {}),
    },
  }
}

export { DEFAULT_PRIMARY_PERSONA_PERMISSION }

export type {
  BuddyPersonaDefinitionInput,
  BuddyPersonaProfileDefinition,
  DefinedBuddyPersona,
  PersonaContextPolicyDefinition,
  PersonaRuntimeDefinition,
}
