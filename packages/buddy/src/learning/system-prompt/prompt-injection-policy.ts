import type { PromptInjectionPolicy } from "./prompt-injection.js"
import type { RuntimePromptSection, TeachingIntentId, TeachingSessionState, WorkspaceState } from "./types.js"

type PromptKind = RuntimePromptSection["kind"]

export const PROMPT_INJECTION_MATRIX_VERSION = "v1"

export type PromptInjectionTriggerID =
  | "baseline-turn"
  | "no-previous-state"
  | "persona-changed"
  | "intent-changed"
  | "workspace-state-changed"
  | "focus-goals-changed"
  | "activity-bundle-explicit"

export type PromptInjectionMatrixRule = {
  description: string
  forceInjectStableHeader?: boolean
  forceInjectTurnContext?: boolean
  forceStableHeaderKinds?: PromptKind[]
  forceTurnContextKinds?: PromptKind[]
  alwaysIncludeTurnContextKinds?: PromptKind[]
}

export const PROMPT_INJECTION_CHANGE_MATRIX: Record<PromptInjectionTriggerID, PromptInjectionMatrixRule> = {
  "baseline-turn": {
    description: "Always include turn cautions so per-turn guardrails are present even on narrow diffs.",
    alwaysIncludeTurnContextKinds: ["turn-cautions"],
  },
  "no-previous-state": {
    description: "No runtime cache exists for this session turn; inject a full snapshot.",
    forceInjectStableHeader: true,
    forceInjectTurnContext: true,
  },
  "persona-changed": {
    description: "Persona changed; refresh stable identity instructions and runtime-facing context sections.",
    forceInjectStableHeader: true,
    forceTurnContextKinds: [
      "workspace-state",
      "explicit-overrides",
      "buddy-capabilities",
      "activity-capabilities",
      "learner-summary",
      "progress-summary",
      "feedback-summary",
    ],
  },
  "intent-changed": {
    description: "Intent override changed; refresh intent-scoped activity and learner guidance sections.",
    forceTurnContextKinds: [
      "explicit-overrides",
      "activity-capabilities",
      "selected-activity",
      "learner-summary",
      "progress-summary",
      "feedback-summary",
    ],
  },
  "workspace-state-changed": {
    description: "Workspace mode changed (chat/interactive); refresh workspace and capability routing sections.",
    forceStableHeaderKinds: ["tooling-guidance"],
    forceTurnContextKinds: [
      "workspace-state",
      "teaching-workspace",
      "buddy-capabilities",
      "activity-capabilities",
    ],
  },
  "focus-goals-changed": {
    description: "Focus goals changed; refresh goal-conditioned learner summaries and explicit override context.",
    forceTurnContextKinds: [
      "explicit-overrides",
      "learner-summary",
      "progress-summary",
      "feedback-summary",
    ],
  },
  "activity-bundle-explicit": {
    description: "An explicit activity bundle was requested for this turn; force bundle and override visibility.",
    forceTurnContextKinds: [
      "selected-activity",
      "explicit-overrides",
      "activity-capabilities",
    ],
  },
}

type MatrixEntry = {
  id: PromptInjectionTriggerID
  description: string
  forceInjectStableHeader: boolean
  forceInjectTurnContext: boolean
  forceStableHeaderKinds: PromptKind[]
  forceTurnContextKinds: PromptKind[]
  alwaysIncludeTurnContextKinds: PromptKind[]
}

export type PromptInjectionPolicyAudit = {
  matrixVersion: string
  triggerIDs: PromptInjectionTriggerID[]
  matrix: MatrixEntry[]
  appliedPolicy: {
    forceInjectStableHeader: boolean
    forceInjectTurnContext: boolean
    forceStableHeaderKinds: PromptKind[]
    forceTurnContextKinds: PromptKind[]
    alwaysIncludeTurnContextKinds: PromptKind[]
  }
}

function uniqueKinds(values: PromptKind[]): PromptKind[] {
  const seen = new Set<PromptKind>()
  const result: PromptKind[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function stringArrayEqual(left: string[] | undefined, right: string[]): boolean {
  if (!left) return right.length === 0
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function matrixEntry(id: PromptInjectionTriggerID): MatrixEntry {
  const rule = PROMPT_INJECTION_CHANGE_MATRIX[id]
  return {
    id,
    description: rule.description,
    forceInjectStableHeader: !!rule.forceInjectStableHeader,
    forceInjectTurnContext: !!rule.forceInjectTurnContext,
    forceStableHeaderKinds: rule.forceStableHeaderKinds ? [...rule.forceStableHeaderKinds] : [],
    forceTurnContextKinds: rule.forceTurnContextKinds ? [...rule.forceTurnContextKinds] : [],
    alwaysIncludeTurnContextKinds: rule.alwaysIncludeTurnContextKinds ? [...rule.alwaysIncludeTurnContextKinds] : [],
  }
}

function resolveTriggerIDs(input: {
  previous?: Pick<TeachingSessionState, "persona" | "intentOverride" | "workspaceState" | "focusGoalIds">
  personaID: string
  intentOverride?: TeachingIntentId
  workspaceState: WorkspaceState
  focusGoalIds: string[]
  requestedActivityBundleId?: string
}): PromptInjectionTriggerID[] {
  const triggerIDs: PromptInjectionTriggerID[] = ["baseline-turn"]

  if (!input.previous) {
    triggerIDs.push("no-previous-state")
  } else {
    if (input.previous.persona !== input.personaID) {
      triggerIDs.push("persona-changed")
    }
    if ((input.previous.intentOverride ?? undefined) !== (input.intentOverride ?? undefined)) {
      triggerIDs.push("intent-changed")
    }
    if (input.previous.workspaceState !== input.workspaceState) {
      triggerIDs.push("workspace-state-changed")
    }
    if (!stringArrayEqual(input.previous.focusGoalIds, input.focusGoalIds)) {
      triggerIDs.push("focus-goals-changed")
    }
  }

  if (input.requestedActivityBundleId) {
    triggerIDs.push("activity-bundle-explicit")
  }

  return triggerIDs
}

export function buildPromptInjectionPolicy(input: {
  previous?: Pick<TeachingSessionState, "persona" | "intentOverride" | "workspaceState" | "focusGoalIds">
  personaID: string
  intentOverride?: TeachingIntentId
  workspaceState: WorkspaceState
  focusGoalIds: string[]
  requestedActivityBundleId?: string
}): {
  policy: PromptInjectionPolicy
  audit: PromptInjectionPolicyAudit
} {
  const triggerIDs = resolveTriggerIDs(input)
  const matrix = triggerIDs.map((id) => matrixEntry(id))

  const forceInjectStableHeader = matrix.some((entry) => entry.forceInjectStableHeader)
  const forceInjectTurnContext = matrix.some((entry) => entry.forceInjectTurnContext)
  const forceStableHeaderKinds = uniqueKinds(matrix.flatMap((entry) => entry.forceStableHeaderKinds))
  const forceTurnContextKinds = uniqueKinds(matrix.flatMap((entry) => entry.forceTurnContextKinds))
  const alwaysIncludeTurnContextKinds = uniqueKinds(matrix.flatMap((entry) => entry.alwaysIncludeTurnContextKinds))

  return {
    policy: {
      forceInjectStableHeader: forceInjectStableHeader || undefined,
      forceInjectTurnContext: forceInjectTurnContext || undefined,
      forceStableHeaderKinds: forceStableHeaderKinds.length > 0 ? forceStableHeaderKinds : undefined,
      forceTurnContextKinds: forceTurnContextKinds.length > 0 ? forceTurnContextKinds : undefined,
      alwaysIncludeTurnContextKinds:
        alwaysIncludeTurnContextKinds.length > 0 ? alwaysIncludeTurnContextKinds : undefined,
    },
    audit: {
      matrixVersion: PROMPT_INJECTION_MATRIX_VERSION,
      triggerIDs,
      matrix,
      appliedPolicy: {
        forceInjectStableHeader,
        forceInjectTurnContext,
        forceStableHeaderKinds,
        forceTurnContextKinds,
        alwaysIncludeTurnContextKinds,
      },
    },
  }
}
