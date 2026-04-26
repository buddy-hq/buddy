import { describe, expect, test } from "bun:test"
import { LearnerService } from "../../src/learning/learner-model"
import { tmpdir } from "../helpers/tmpdir"

describe("learner snapshot runtime context", () => {
  test("builds factual snapshot context without intent", async () => {
    await using project = await tmpdir({ git: true })

    await LearnerService.patchWorkspace({
      directory: project.path,
      workspace: {
        projectConstraints: ["Only 30 minutes available today"],
        motivationContext: "Ship one real desktop feature this week",
        localToolAvailability: ["bun", "electron"],
      },
      profile: {
        motivationAnchors: ["You want this skill for the desktop app you are already building."],
        availableTimePatterns: ["Short evening sessions"],
      },
    })

    const committed = await LearnerService.replaceGoalSet({
      directory: project.path,
      scope: "topic",
      contextLabel: "Electron desktop bridge",
      learnerRequest: "I want to learn the Electron desktop bridge through real features.",
      goals: [
        {
          statement:
            "At the end of this topic, you will be able to implement a desktop bridge command that validates inputs and returns structured errors.",
          actionVerb: "implement",
          task: "Implement a desktop bridge command that validates inputs and returns structured errors.",
          cognitiveLevel: "Application",
          howToTest:
            "Run the command with valid and invalid inputs and inspect the returned error shape.",
        },
      ],
    })

    await LearnerService.recordPracticeEvent({
      directory: project.path,
      goalIds: committed.goalIds,
      prompt: "Create a bridge command that validates payload shape before saving settings.",
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
        focusGoalIds: committed.goalIds,
      },
    })
    expect(snapshot.constraintsSummary.some((item) => item.includes("30 minutes"))).toBe(true)
    expect(snapshot.goals.map((goal) => goal.id)).toEqual(expect.arrayContaining(committed.goalIds))
    expect(snapshot.decisionInputFingerprint).not.toContain("intent:")
    expect(snapshot.decisionInputFingerprint).toContain("workspaceState:")
    expect(snapshot.decisionInputFingerprint).toContain("persona:code-buddy")
    expect(snapshot.markdown).toContain("Constraints")
  })
})
