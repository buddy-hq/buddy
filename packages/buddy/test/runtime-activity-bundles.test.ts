import { describe, expect, test } from "bun:test"
import { compileRuntimeProfile } from "../src/learning/runtime/compiler.js"
import { getBuddyPersona } from "../src/personas/catalog.js"

describe("compileRuntimeProfile activity bundles", () => {
  test("keeps the full persona-appropriate activity set in Auto", () => {
    const runtimeProfile = compileRuntimeProfile({
      persona: getBuddyPersona("math-buddy"),
      workspaceState: "chat",
    })

    const bundleIds = runtimeProfile.capabilityEnvelope.activityBundles.map((bundle) => bundle.id)
    expect(bundleIds).toContain("learn-explanation")
    expect(bundleIds).toContain("practice-guided")
    expect(bundleIds).toContain("assess-mastery-check")
    expect(bundleIds).toContain("math-stepwise-solve")
    expect(bundleIds).not.toContain("code-debug-attempt")
    expect(runtimeProfile.capabilityEnvelope.activityBundles.find((bundle) => bundle.id === "learn-explanation")?.tools).toContain(
      "activity_explanation",
    )
  })

  test("filters activity bundles to the requested intent while preserving persona-specific variants", () => {
    const runtimeProfile = compileRuntimeProfile({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
      intentOverride: "practice",
    })

    expect(runtimeProfile.capabilityEnvelope.activityBundles.every((bundle) => bundle.intent === "practice")).toBe(true)
    expect(runtimeProfile.capabilityEnvelope.activityBundles.map((bundle) => bundle.id)).toEqual(
      expect.arrayContaining(["practice-guided", "practice-independent", "code-debug-attempt"]),
    )
    expect(runtimeProfile.capabilityEnvelope.activityBundles.map((bundle) => bundle.id)).not.toContain("assess-mastery-check")
    expect(runtimeProfile.capabilityEnvelope.activityBundles.find((bundle) => bundle.id === "code-debug-attempt")?.tools).toContain(
      "activity_debug_attempt",
    )
  })
})
