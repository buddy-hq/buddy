import { describe, expect, test } from "bun:test"
import { compileRuntimeProfile } from "../../src/learning/runtime/compiler.js"
import { buildLearningSystemPrompt } from "../../src/learning/shared/compose-system-prompt.js"
import { getBuddyPersona } from "../../src/personas/catalog.js"
import { tmpdir } from "../fixture/fixture"
import { createDigest } from "./fixtures.ts"
import { expectAllowedTools, expectDeniedTools, expectPreferredHelpers, expectVisibleSurfaces } from "./scorers.ts"

describe("teaching eval harness", () => {
  test("code-buddy practice runtime keeps editor teaching and practice tools enabled", async () => {
    const profile = compileRuntimeProfile({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
    })

    expectVisibleSurfaces(profile, ["curriculum", "editor"])
    expectAllowedTools(profile, [
      "learner_snapshot_read",
      "learner_practice_record",
      "learner_assessment_record",
      "teaching_start_lesson",
      "teaching_checkpoint",
    ])
    expectPreferredHelpers(profile, ["practice-agent", "feedback-engine"])
  })

  test("buddy understand runtime denies recording tools and stays concept-first", async () => {
    const profile = compileRuntimeProfile({
      persona: getBuddyPersona("buddy"),
      workspaceState: "chat",
    })

    expectAllowedTools(profile, ["learner_snapshot_read", "learner_practice_record", "learner_assessment_record"])
    expectDeniedTools(profile, ["render_figure", "teaching_start_lesson"])
  })

  test("compiled prompt keeps runtime sections inspectable and practice-forward", async () => {
    await using project = await tmpdir({ git: true })

    const profile = compileRuntimeProfile({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
    })
    const digest = createDigest({
      constraintsSummary: ["Time: short session", "Environment: local editor available"],
    })

    const prompt = await buildLearningSystemPrompt({
      directory: project.path,
      runtimeProfile: profile,
      learnerDigest: digest,
      intentOverride: "practice",
      focusGoalIds: ["goal_1"],
      userContent: "Give me a focused practice task.",
      teachingContext: {
        active: true,
        sessionID: "ses_eval",
        lessonFilePath: "/tmp/lesson.ts",
        checkpointFilePath: "/tmp/checkpoint.ts",
        language: "ts",
        revision: 1,
      },
    })

    expect(prompt.stableHeaderSections.some((section) => section.label === "Persona Header")).toBe(true)
    expect(prompt.turnContextSections.some((section) => section.label === "Workspace State")).toBe(true)
    expect(prompt.turnContextSections.some((section) => section.label === "Teaching Workspace")).toBe(true)
    expect(prompt.turnContext).toContain("Intent override: practice")
    expect(prompt.turnContext).toContain("An interactive lesson workspace is active")
  })
})
