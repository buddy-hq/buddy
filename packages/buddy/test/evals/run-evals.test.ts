import { describe, expect, test } from "bun:test"
import { buildLearningSystemPrompt } from "../../src/learning/prompt"
import { resolveCapabilityProfile } from "../../src/learning/resolve-capability-profile"
import { getBuddyPersona } from "../../src/learning/personas"
import { LearnerService } from "../../src/learning/learner-model"
import { tmpdir } from "../fixture/fixture"
import { expectAllowedTools, expectDeniedTools, expectPreferredHelpers, expectVisibleSurfaces } from "./scorers.ts"

describe("teaching eval harness", () => {
  test("code-buddy practice runtime keeps editor teaching and practice tools enabled", async () => {
    const profile = resolveCapabilityProfile({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
      intent: "auto",
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
    const profile = resolveCapabilityProfile({
      persona: getBuddyPersona("buddy"),
      workspaceState: "chat",
      intent: "auto",
    })

    expectAllowedTools(profile, ["learner_snapshot_read", "learner_practice_record", "learner_assessment_record"])
    expectDeniedTools(profile, ["render_figure", "teaching_start_lesson"])
  })

  test("compiled prompt keeps runtime sections inspectable and practice-forward", async () => {
    await using project = await tmpdir({ git: true })

    const profile = resolveCapabilityProfile({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
      intent: "practice",
    })
    const snapshot = await LearnerService.getWorkspaceSnapshot({
      directory: project.path,
      query: {
        persona: "code-buddy",
        intent: "practice",
        focusGoalIds: ["goal_1"],
        workspaceState: "interactive",
      },
    })

    const prompt = await buildLearningSystemPrompt({
      directory: project.path,
      persona: profile.persona,
      capabilityEnvelope: profile.capabilityEnvelope,
      intent: "practice",
      learnerSnapshot: snapshot,
      focusGoalIds: ["goal_1"],
      teachingContext: {
        active: true,
        sessionID: "ses_eval",
        lessonFilePath: "/tmp/lesson.ts",
        checkpointFilePath: "/tmp/checkpoint.ts",
        language: "ts",
        revision: 1,
      },
    })

    expect(prompt.systemContext).toContain("<buddy_runtime_header>")
    expect(prompt.systemContext).toContain("<workspace_state>")
    expect(prompt.systemContext).toContain("<teaching_workspace>")
    expect(prompt.systemContext).toContain("Intent focus: practice")
    expect(prompt.systemContext).toContain("An interactive lesson workspace is active")
    expect(prompt.turnReminder).toBeUndefined()
  })

  test("compiled prompt emits a transition reminder when intent/persona shift execution focus", async () => {
    await using project = await tmpdir({ git: true })

    const profile = resolveCapabilityProfile({
      persona: getBuddyPersona("code-buddy"),
      workspaceState: "interactive",
      intent: "practice",
    })
    const snapshot = await LearnerService.getWorkspaceSnapshot({
      directory: project.path,
      query: {
        persona: "code-buddy",
        intent: "practice",
        focusGoalIds: ["goal_1"],
        workspaceState: "interactive",
      },
    })

    const prompt = await buildLearningSystemPrompt({
      directory: project.path,
      persona: profile.persona,
      capabilityEnvelope: profile.capabilityEnvelope,
      intent: "practice",
      learnerSnapshot: snapshot,
      focusGoalIds: ["goal_1"],
      teachingContext: {
        active: true,
        sessionID: "ses_eval_transition",
        lessonFilePath: "/tmp/lesson.ts",
        checkpointFilePath: "/tmp/checkpoint.ts",
        language: "ts",
        revision: 1,
      },
      priorTurn: {
        persona: "buddy",
        intent: "learn",
        workspaceState: "chat",
      },
    })

    expect(prompt.turnReminder).toContain("Teaching focus switch: concept-first -> execution-focused")
    expect(prompt.turnReminder).toContain("Persona switch: buddy -> code-buddy")
    expect(prompt.turnReminder).toContain("Intent switch: learn -> practice")
  })
})
