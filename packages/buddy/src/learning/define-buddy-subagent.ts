import type { BuddyPermissionInput, CoreAgentDefinition } from "./agent-factories"

type BuddySubagentRuntimeKind = "subagent" | "build"

type BuddySubagentDefinitionInput<Key extends string> = Omit<
  CoreAgentDefinition,
  "mode" | "availableSubagents" | "prompt"
> & {
  key: Key
  kind?: BuddySubagentRuntimeKind
  prompt: string
  permission?: BuddyPermissionInput
}

type DefinedBuddySubagent<Key extends string = string> = BuddySubagentDefinitionInput<Key>

export function defineBuddySubagent<const Key extends string>(
  input: BuddySubagentDefinitionInput<Key>,
): DefinedBuddySubagent<Key> {
  return {
    ...input,
    kind: input.kind ?? "subagent",
    prompt: input.prompt.trim(),
  }
}

export type { BuddySubagentDefinitionInput, DefinedBuddySubagent }
