import type { BuddyPermissionInput, CoreAgentDefinition } from "../../agent-factories"

type PersonaIntent = "learn" | "practice" | "assess" | "auto"
type PersonaDomain = "general" | "coding" | "math"
type PersonaSurface = "curriculum" | "editor" | "figure" | "question-set"
type ToolAccess = "inherit" | "allow" | "deny"
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
  defaultIntent: PersonaIntent
  surfaces: readonly PersonaSurface[]
  defaultSurface: PersonaSurface
  hidden: boolean
  toolDefaults: Partial<Record<string, ToolAccess>>
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
} as const satisfies BuddyPermissionInput

export function composePersonaPrompt(...parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n\n")
}

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
    subagentDefaults: { ...profile.subagentDefaults },
    contextPolicy: { ...profile.contextPolicy },
    runtime: {
      ...runtime,
      prompt: runtime.prompt.trim(),
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
