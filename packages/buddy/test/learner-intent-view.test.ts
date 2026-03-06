import { describe, expect, test } from "bun:test"
import { LearnerService } from "../src/learning/learner/service.js"
import { tmpdir } from "./fixture/fixture"

describe("learner curriculum intent view", () => {
  test("includes session plan, constraints, alignment, and open feedback actions", async () => {
    await using project = await tmpdir({ git: true })

    const workspace = await LearnerService.ensureWorkspaceContext(project.path)
    await LearnerService.updateWorkspaceContext(project.path, {
      projectConstraints: ["Only 30 minutes available today"],
      motivationContext: "Ship one real Tauri feature this week",
      localToolAvailability: ["bun", "tauri"],
    })
    await LearnerService.updateLearnerConstraints({
      motivationAnchors: ["You want this skill for the desktop app you are already building."],
      availableTimePatterns: ["Short evening sessions"],
    })

    const committed = await LearnerService.commitGoals({
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

    await LearnerService.recordPractice({
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

    const view = await LearnerService.getCurriculumView(project.path, {
      workspaceId: workspace.workspaceId,
      persona: "code-buddy",
      intent: "practice",
      focusGoalIds: committed.goalIds,
      tokenBudget: 1200,
    })

    expect(view.sessionPlan.suggestedActivity.length).toBeGreaterThan(0)
    expect(view.constraintsSummary.some((item) => item.includes("30 minutes"))).toBe(true)
    expect(view.openFeedbackActions.length).toBeGreaterThan(0)
    expect(view.actions.length).toBeGreaterThan(0)
    expect(view.actions.some((action) => action.actionId === "resolve-feedback")).toBe(true)
    expect(view.actions.some((action) => action.activityBundleId === "practice-guided")).toBe(true)
    expect(view.activityBundles.every((bundle) => bundle.intent === "practice")).toBe(true)
    expect(view.activityBundles.map((bundle) => bundle.id)).toEqual(
      expect.arrayContaining(["practice-guided", "practice-independent"]),
    )
    expect(view.alignmentSummary.recommendations.length).toBeGreaterThan(0)
    expect(view.markdown).toContain("Activity Bundles")
    expect(view.markdown).toContain("Constraints & Opportunities")
  })
})
