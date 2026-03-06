import { describe, expect, test } from "bun:test"
import { buildPromptInjectionPolicy } from "../src/learning/runtime/prompt-injection-policy.js"
import type { TeachingSessionState } from "../src/learning/runtime/types.js"

function previousState(input?: {
  persona?: TeachingSessionState["persona"]
  intentOverride?: TeachingSessionState["intentOverride"]
  workspaceState?: TeachingSessionState["workspaceState"]
  focusGoalIds?: string[]
}): Pick<TeachingSessionState, "persona" | "intentOverride" | "workspaceState" | "focusGoalIds"> {
  return {
    persona: input?.persona ?? "code-buddy",
    intentOverride: input?.intentOverride,
    workspaceState: input?.workspaceState ?? "chat",
    focusGoalIds: input?.focusGoalIds ?? [],
  }
}

describe("buildPromptInjectionPolicy", () => {
  test("forces full snapshot when no previous runtime state exists", () => {
    const result = buildPromptInjectionPolicy({
      personaID: "code-buddy",
      workspaceState: "chat",
      focusGoalIds: [],
    })

    expect(result.audit.triggerIDs).toEqual(["baseline-turn", "no-previous-state"])
    expect(result.audit.appliedPolicy.forceInjectStableHeader).toBe(true)
    expect(result.audit.appliedPolicy.forceInjectTurnContext).toBe(true)
    expect(result.audit.appliedPolicy.alwaysIncludeTurnContextKinds).toContain("turn-cautions")
  })

  test("maps explicit activity bundle requests to selected-activity override forcing", () => {
    const result = buildPromptInjectionPolicy({
      previous: previousState({
        intentOverride: "learn",
      }),
      personaID: "code-buddy",
      intentOverride: "learn",
      workspaceState: "chat",
      focusGoalIds: [],
      requestedActivityBundleId: "code-debug-attempt",
    })

    expect(result.audit.triggerIDs).toEqual(["baseline-turn", "activity-bundle-explicit"])
    expect(result.audit.appliedPolicy.forceTurnContextKinds).toContain("selected-activity")
    expect(result.audit.appliedPolicy.forceTurnContextKinds).toContain("explicit-overrides")
    expect(result.audit.appliedPolicy.forceTurnContextKinds).toContain("activity-capabilities")
  })

  test("captures runtime identity shifts as explicit triggers", () => {
    const result = buildPromptInjectionPolicy({
      previous: previousState({
        persona: "buddy",
        intentOverride: "learn",
        workspaceState: "chat",
        focusGoalIds: ["goal_1"],
      }),
      personaID: "code-buddy",
      intentOverride: "practice",
      workspaceState: "interactive",
      focusGoalIds: ["goal_2"],
    })

    expect(result.audit.triggerIDs).toEqual([
      "baseline-turn",
      "persona-changed",
      "intent-changed",
      "workspace-state-changed",
      "focus-goals-changed",
    ])
    expect(result.audit.appliedPolicy.forceInjectStableHeader).toBe(true)
    expect(result.audit.appliedPolicy.forceStableHeaderKinds).toContain("tooling-guidance")
    expect(result.audit.appliedPolicy.forceTurnContextKinds).toContain("workspace-state")
    expect(result.audit.appliedPolicy.forceTurnContextKinds).toContain("learner-summary")
  })
})
