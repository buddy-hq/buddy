import { describe, expect, test } from "bun:test"
import { resolveCapabilityProfile } from "../src/learning/resolve-capability-profile"
import { LearnerService } from "../src/learning/learner-model"
import { buildLearningSystemPrompt } from "../src/learning/prompt"
import { getBuddyPersona } from "../src/learning/personas"
import { tmpdir } from "./fixture/fixture"

describe("composeLearningSystemPrompt (learner store)", () => {
  test("injects learner-state context from the cross-notebook learner store", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.replaceGoalSet({
      directory: project.path,
      scope: "topic",
      contextLabel: "Tauri IPC",
      learnerRequest: "I want to learn Tauri IPC by shipping a small feature.",
      goals: [
        {
          statement:
            "At the end of this topic, you will be able to implement a Tauri command that validates inputs and returns structured errors to the UI.",
          actionVerb: "implement",
          task: "Implement a Tauri command that validates inputs and returns structured errors to the UI.",
          cognitiveLevel: "Application",
          howToTest: "Run a smoke test that exercises both valid and invalid inputs and inspects the error structure.",
        },
      ],
    })

    const snapshot = await LearnerService.getWorkspaceSnapshot({
      directory: project.path,
      query: {
        persona: "buddy",
        intent: "learn",
        focusGoalIds: committed.goalIds,
        workspaceState: "chat",
      },
    })
    const runtimeProfile = resolveCapabilityProfile({
      persona: getBuddyPersona("buddy"),
      workspaceState: "chat",
      intentOverride: "learn",
    })
    const activityBundle = runtimeProfile.capabilityEnvelope.activityBundles.find(
      (bundle) => bundle.id === "learn-worked-example",
    )

    const { systemContext, turnReminder } = await buildLearningSystemPrompt({
      directory: project.path,
      persona: runtimeProfile.persona,
      capabilityEnvelope: runtimeProfile.capabilityEnvelope,
      activityBundle,
      intent: "learn",
      learnerSnapshot: snapshot,
      focusGoalIds: committed.goalIds,
    })
    const system = [systemContext, turnReminder].filter(Boolean).join("\n\n")

    expect(system).toContain("<buddy_runtime_context>")
    expect(system).toContain("<buddy_capability_snapshot>")
    expect(system).toContain("<activity_capabilities>")
    expect(system).toContain("<selected_activity_bundle>")
    expect(system).toContain(
      "Direct Buddy tools: learner_assessment_record, learner_practice_record, learner_snapshot_read",
    )
    expect(system).toContain("Activity tools:")
    expect(system).toContain("activity_explanation")
    expect(system).toContain("activity_worked_example")
    expect(system).toContain("buddy-learn-worked-example")
    expect(system).toContain("buddy-learn-explanation")
    expect(system).toContain("implement a Tauri command that validates inputs")
    expect(system).toContain("State: chat")
  })
})
