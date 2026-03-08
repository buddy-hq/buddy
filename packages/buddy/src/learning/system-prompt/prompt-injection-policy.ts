import type { TeachingIntentId, TeachingSessionState, WorkspaceState } from "../runtime/types.js"
import type {
  PromptInjectionPolicy,
  PromptInjectionPolicyAudit,
  PromptInjectionPolicyMatrixEntry,
  RuntimePromptSection,
} from "./types.js"

type PromptKind = RuntimePromptSection["kind"]

type PreviousRuntimeState = Pick<TeachingSessionState, "persona" | "intentOverride" | "workspaceState" | "focusGoalIds">

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

type MatrixEntry = PromptInjectionPolicyMatrixEntry & { id: PromptInjectionTriggerID }

function pushUnique<T>(target: T[], values: T[]) {
  const seen = new Set(target)
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    target.push(value)
  }
}

function sameStringArray(left: string[] | undefined, right: string[]): boolean {
  if (!left) return right.length === 0
  if (left.length !== right.length) return false

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }

  return true
}

function resolveTriggerIDs(input: {
  previous?: PreviousRuntimeState
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

    if (!sameStringArray(input.previous.focusGoalIds, input.focusGoalIds)) {
      triggerIDs.push("focus-goals-changed")
    }
  }

  if (input.requestedActivityBundleId) {
    triggerIDs.push("activity-bundle-explicit")
  }

  return triggerIDs
}

function createMatrixEntry(id: PromptInjectionTriggerID): MatrixEntry {
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

export function buildPromptInjectionPolicy(input: {
  previous?: PreviousRuntimeState
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
  const matrix: MatrixEntry[] = []

  const appliedPolicy = {
    forceInjectStableHeader: false,
    forceInjectTurnContext: false,
    forceStableHeaderKinds: [] as PromptKind[],
    forceTurnContextKinds: [] as PromptKind[],
    alwaysIncludeTurnContextKinds: [] as PromptKind[],
  }

  for (const triggerID of triggerIDs) {
    const entry = createMatrixEntry(triggerID)
    matrix.push(entry)

    if (entry.forceInjectStableHeader) {
      appliedPolicy.forceInjectStableHeader = true
    }

    if (entry.forceInjectTurnContext) {
      appliedPolicy.forceInjectTurnContext = true
    }

    pushUnique(appliedPolicy.forceStableHeaderKinds, entry.forceStableHeaderKinds)
    pushUnique(appliedPolicy.forceTurnContextKinds, entry.forceTurnContextKinds)
    pushUnique(appliedPolicy.alwaysIncludeTurnContextKinds, entry.alwaysIncludeTurnContextKinds)
  }

  return {
    policy: {
      forceInjectStableHeader: appliedPolicy.forceInjectStableHeader || undefined,
      forceInjectTurnContext: appliedPolicy.forceInjectTurnContext || undefined,
      forceStableHeaderKinds:
        appliedPolicy.forceStableHeaderKinds.length > 0 ? appliedPolicy.forceStableHeaderKinds : undefined,
      forceTurnContextKinds:
        appliedPolicy.forceTurnContextKinds.length > 0 ? appliedPolicy.forceTurnContextKinds : undefined,
      alwaysIncludeTurnContextKinds:
        appliedPolicy.alwaysIncludeTurnContextKinds.length > 0
          ? appliedPolicy.alwaysIncludeTurnContextKinds
          : undefined,
    },
    audit: {
      matrixVersion: PROMPT_INJECTION_MATRIX_VERSION,
      triggerIDs,
      matrix,
      appliedPolicy,
    },
  }
}
