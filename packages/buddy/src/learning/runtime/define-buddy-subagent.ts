import type { BuddyPermissionInput, CoreAgentDefinition } from "../agent-factories"
import type { BuddyTool } from "../runtime/create-buddy-tool"
import type { BuddySkill } from "./define-buddy-skill"

type BuddySubagentRuntimeKind = "subagent" | "build"

type BuddySubagentDefinitionInput<Key extends string> = Omit<
  CoreAgentDefinition,
  "mode" | "availableSubagents" | "prompt"
> & {
  key: Key
  kind?: BuddySubagentRuntimeKind
  prompt: string
  permission?: BuddyPermissionInput
  tools?: readonly BuddyTool[]
  skills?: readonly BuddySkill[]
  subagents?: readonly DefinedBuddySubagent[]
}

type DefinedBuddySubagent<Key extends string = string> = BuddySubagentDefinitionInput<Key>

export function defineBuddySubagent<const Key extends string>(
  input: BuddySubagentDefinitionInput<Key>,
): DefinedBuddySubagent<Key> {
  return {
    ...input,
    kind: input.kind ?? "subagent",
    prompt: input.prompt.trim(),
    tools: [...(input.tools ?? [])],
    skills: [...(input.skills ?? [])],
    subagents: [...(input.subagents ?? [])],
  }
}

export type { BuddySubagentDefinitionInput, DefinedBuddySubagent }
