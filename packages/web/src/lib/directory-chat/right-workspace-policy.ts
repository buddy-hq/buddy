import type { RightWorkspaceSelector } from "@/state/ui-preferences"

type ResolveRightWorkspaceSelectorInput = {
  workspaceOpen: boolean
  hasBenchTarget: boolean
  activeSelector: RightWorkspaceSelector | undefined
  fallbackSelector: RightWorkspaceSelector
  fallbackSelectorSuppressed: boolean
}

export function resolveRightWorkspaceSelector(
  input: ResolveRightWorkspaceSelectorInput,
): RightWorkspaceSelector | undefined {
  if (!input.workspaceOpen) return undefined
  if (input.hasBenchTarget) return input.activeSelector
  if (input.activeSelector) return input.activeSelector
  return input.fallbackSelectorSuppressed ? undefined : input.fallbackSelector
}
