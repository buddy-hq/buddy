import { describe, expect, test } from "bun:test"
import { LearnerService } from "../src/learning/learner/service.js"
import { tmpdir } from "./fixture/fixture"

describe("learner curriculum intent view", () => {
  test("builds factual snapshot and plan context for the requested intent", async () => {
    await using project = await tmpdir({ git: true })

    await LearnerService.patchWorkspace({
      directory: project.path,
      workspace: {
        projectConstraints: ["Only 30 minutes available today"],
        motivationContext: "Ship one real Tauri feature this week",
        localToolAvailability: ["bun", "tauri"],
      },
      profile: {
        motivationAnchors: ["You want this skill for the desktop app you are already building."],
        availableTimePatterns: ["Short evening sessions"],
      },
    })

    const committed = await LearnerService.replaceGoalSet({
      directory: project.path,
      scope: "topic",
      contextLabel: "Tauri IPC",
      learnerRequest: "I want to learn Tauri IPC through real features.",
      goals: [
        {
          statement:
            "At the end of this topic, you will be able to implement a Tauri IPC command that validates inputs and returns structured errors.",
          actionVerb: "implement",
          task: "Implement a Tauri IPC command that validates inputs and returns structured errors.",
          cognitiveLevel: "Application",
          howToTest: "Run the command with valid and invalid inputs and inspect the returned error shape.",
        },
      ],
    })

    await LearnerService.recordPracticeEvent({
      directory: project.path,
      goalIds: committed.goalIds,
      prompt: "Create a command that validates payload shape before saving settings.",
      learnerResponseSummary: "The learner got stuck deciding where validation belongs.",
      outcome: "stuck",
      targetComponents: ["identify which concepts are relevant", "plan a solution"],
      difficulty: "moderate",
      whyItMatters: "This mirrors the settings flow in the real app.",
      sessionId: "ses_practice",
    })

    const snapshot = await LearnerService.getWorkspaceSnapshot({
      directory: project.path,
      query: {
        persona: "code-buddy",
        intent: "practice",
        focusGoalIds: committed.goalIds,
      },
    })
    const planResult = await LearnerService.ensurePlanDecision({
      directory: project.path,
      query: {
        persona: "code-buddy",
        intent: "practice",
        focusGoalIds: committed.goalIds,
      },
    })

    expect(snapshot.constraintsSummary.some((item) => item.includes("30 minutes"))).toBe(true)
    expect(snapshot.goals.map((goal) => goal.id)).toEqual(expect.arrayContaining(committed.goalIds))
    expect(planResult.plan.suggestedActivity.length).toBeGreaterThan(0)
    expect(snapshot.activityBundles.every((bundle) => bundle.intent === "practice")).toBe(true)
    expect(snapshot.activityBundles.map((bundle) => bundle.id)).toEqual(
      expect.arrayContaining(["practice-guided", "practice-independent"]),
    )
    expect(snapshot.markdown).toContain("Constraints")
  })
})
