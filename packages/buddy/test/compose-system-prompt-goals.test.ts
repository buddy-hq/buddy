import { describe, expect, test } from "bun:test"
import { compileRuntimeProfile } from "../src/learning/runtime/compiler.js"
import { LearnerService } from "../src/learning/learner/service.js"
import { composeLearningSystemPrompt } from "../src/learning/shared/compose-system-prompt.js"
import { getBuddyPersona } from "../src/personas/catalog.js"
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

    const workspace = await LearnerService.ensureWorkspaceContext(project.path)
    const digest = await LearnerService.buildPromptContext({
      directory: project.path,
      query: {
        workspaceId: workspace.workspaceId,
        persona: "buddy",
        intent: "learn",
        focusGoalIds: committed.goalIds,
        tokenBudget: 1200,
      },
    })
    const runtimeProfile = compileRuntimeProfile({
      persona: getBuddyPersona("buddy"),
      workspaceState: "chat",
      intentOverride: "learn",
    })
    const activityBundle = runtimeProfile.capabilityEnvelope.activityBundles.find((bundle) => bundle.id === "learn-worked-example")

    const system = await composeLearningSystemPrompt({
      directory: project.path,
      runtimeProfile,
      learnerDigest: digest,
      activityBundle,
      intentOverride: "learn",
      focusGoalIds: committed.goalIds,
      userContent: "what skills and tools do you have",
    })

    expect(system).toContain("<buddy_turn_context>")
    expect(system).toContain("<buddy_capability_snapshot>")
    expect(system).toContain("<activity_capabilities>")
    expect(system).toContain("<selected_activity_bundle>")
    expect(system).toContain("Direct Buddy tools: learner_assessment_record, learner_practice_record, learner_snapshot_read")
    expect(system).toContain("Activity tools:")
    expect(system).toContain("activity_explanation")
    expect(system).toContain("activity_worked_example")
    expect(system).toContain("buddy-learn-worked-example")
    expect(system).toContain("buddy-learn-explanation")
    expect(system).toContain("implement a Tauri command that validates inputs")
    expect(system).toContain("State: chat")
  })
})
