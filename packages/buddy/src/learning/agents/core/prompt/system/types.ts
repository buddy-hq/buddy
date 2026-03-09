export type RuntimePromptSectionKind =
  | "persona-header"
  | "teaching-principles"
  | "tooling-guidance"
  | "workspace-state"
  | "explicit-overrides"
  | "buddy-capabilities"
  | "activity-capabilities"
  | "capability-query"
  | "selected-activity"
  | "learner-summary"
  | "progress-summary"
  | "feedback-summary"
  | "teaching-workspace"
  | "turn-cautions"

export type RuntimePromptSection = {
  kind: RuntimePromptSectionKind
  label: string
  text: string
}

export type LearningPromptBuild = {
  stableHeader: string
  turnContext: string
  stableHeaderSections: RuntimePromptSection[]
  turnContextSections: RuntimePromptSection[]
}

export type PromptInjectionCache = {
  stableHeaderSections: Record<string, string>
  turnContextSections: Record<string, string>
}

export type PromptInjectionPolicy = {
  forceInjectStableHeader?: boolean
  forceInjectTurnContext?: boolean
  forceStableHeaderKinds?: RuntimePromptSectionKind[]
  forceTurnContextKinds?: RuntimePromptSectionKind[]
  alwaysIncludeTurnContextKinds?: RuntimePromptSectionKind[]
}

export type PromptInjectionDecision = {
  injectStableHeader: boolean
  injectTurnContext: boolean
  stableHeader: string
  turnContext: string
  changedStableHeaderSectionKeys: string[]
  changedTurnContextSectionKeys: string[]
  cache: PromptInjectionCache
}

export type PromptInjectionPolicyMatrixEntry = {
  id: string
  description: string
  forceInjectStableHeader: boolean
  forceInjectTurnContext: boolean
  forceStableHeaderKinds: RuntimePromptSectionKind[]
  forceTurnContextKinds: RuntimePromptSectionKind[]
  alwaysIncludeTurnContextKinds: RuntimePromptSectionKind[]
}

export type PromptInjectionPolicyAudit = {
  matrixVersion: string
  triggerIDs: string[]
  matrix: PromptInjectionPolicyMatrixEntry[]
  appliedPolicy: {
    forceInjectStableHeader: boolean
    forceInjectTurnContext: boolean
    forceStableHeaderKinds: RuntimePromptSectionKind[]
    forceTurnContextKinds: RuntimePromptSectionKind[]
    alwaysIncludeTurnContextKinds: RuntimePromptSectionKind[]
  }
}

export type PromptInjectionAudit = PromptInjectionPolicyAudit & {
  decision: Pick<
    PromptInjectionDecision,
    "injectStableHeader" | "injectTurnContext" | "changedStableHeaderSectionKeys" | "changedTurnContextSectionKeys"
  >
}
