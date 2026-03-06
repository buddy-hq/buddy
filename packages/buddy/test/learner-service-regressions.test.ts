import { describe, expect, test } from "bun:test"
import { LearnerService } from "../src/learning/learner/service.js"
import { tmpdir } from "./fixture/fixture"

describe("LearnerService regressions", () => {
  test("does not resolve open feedback from a learner completion claim alone", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.commitGoals({
      directory: project.path,
      scope: "topic",
      contextLabel: "Type narrowing",
      learnerRequest: "I want to get better at narrowing unknown values.",
      goals: [
        {
          statement: "At the end of this topic, you will be able to narrow unknown values with guards.",
          actionVerb: "narrow",
          task: "Narrow unknown values with guards.",
          cognitiveLevel: "Application",
          howToTest: "Write and run a function that safely narrows several unknown inputs.",
        },
      ],
    })

    await LearnerService.recordPractice({
      directory: project.path,
      goalIds: committed.goalIds,
      learnerResponseSummary: "I could not get the guard logic working.",
      outcome: "stuck",
      sessionId: "ses_feedback",
    })

    await LearnerService.observeLearnerMessage({
      directory: project.path,
      content: "done",
      goalIds: committed.goalIds,
      sessionId: "ses_feedback",
    })

    const workspace = await LearnerService.ensureWorkspaceContext(project.path)
    const state = await LearnerService.queryState({
      workspaceId: workspace.workspaceId,
      goalIds: committed.goalIds,
      conceptTags: [],
      includeDerived: true,
    })

    expect(state.feedback.some((record) => record.status === "open")).toBe(true)
    expect(state.evidence.filter((record) => record.sourceType === "learner-message").map((record) => record.outcome)).toEqual([
      "neutral",
    ])
  })

  test("records repeated learner follow-ups in the same session without collapsing them", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.commitGoals({
      directory: project.path,
      scope: "topic",
      contextLabel: "Loops",
      learnerRequest: "I want to get comfortable with loop control flow.",
      goals: [
        {
          statement: "At the end of this topic, you will be able to explain when to use break and continue.",
          actionVerb: "explain",
          task: "Explain when to use break and continue.",
          cognitiveLevel: "Comprehension",
          howToTest: "Describe the right control-flow choice for a few loop examples.",
        },
      ],
    })

    await LearnerService.observeLearnerMessage({
      directory: project.path,
      content: "done",
      goalIds: committed.goalIds,
      sessionId: "ses_repeat",
    })
    await LearnerService.observeLearnerMessage({
      directory: project.path,
      content: "done",
      goalIds: committed.goalIds,
      sessionId: "ses_repeat",
    })

    const workspace = await LearnerService.ensureWorkspaceContext(project.path)
    const state = await LearnerService.queryState({
      workspaceId: workspace.workspaceId,
      goalIds: committed.goalIds,
      conceptTags: [],
      includeDerived: true,
    })

    expect(state.evidence.filter((record) => record.sourceType === "learner-message")).toHaveLength(2)
  })

  test("keeps active misconceptions scoped to the current workspace", async () => {
    await using projectA = await tmpdir({ git: true })
    await using projectB = await tmpdir({ git: true, preserveLearnerStore: true })

    const committedA = await LearnerService.commitGoals({
      directory: projectA.path,
      scope: "topic",
      contextLabel: "Pointers",
      learnerRequest: "I want to understand pointer basics.",
      goals: [
        {
          statement: "At the end of this topic, you will be able to explain pointer indirection.",
          actionVerb: "explain",
          task: "Explain pointer indirection.",
          cognitiveLevel: "Comprehension",
          howToTest: "Walk through a pointer example and explain what each level references.",
        },
      ],
    })
    await LearnerService.observeLearnerMessage({
      directory: projectA.path,
      content: "I am confused about pointer indirection.",
      goalIds: committedA.goalIds,
      sessionId: "ses_a",
    })

    const committedB = await LearnerService.commitGoals({
      directory: projectB.path,
      scope: "topic",
      contextLabel: "Closures",
      learnerRequest: "I want to understand closures.",
      goals: [
        {
          statement: "At the end of this topic, you will be able to explain closure capture.",
          actionVerb: "explain",
          task: "Explain closure capture.",
          cognitiveLevel: "Comprehension",
          howToTest: "Describe what a closure captures in a few examples.",
        },
      ],
    })
    const workspaceB = await LearnerService.ensureWorkspaceContext(projectB.path)
    const digest = await LearnerService.queryForPrompt({
      directory: projectB.path,
      query: {
        workspaceId: workspaceB.workspaceId,
        persona: "buddy",
        intent: "learn",
        focusGoalIds: committedB.goalIds,
        tokenBudget: 1200,
      },
    })

    expect(digest.tier1.join("\n")).not.toContain("I am confused about pointer indirection.")
  })

  test("allows clearing workspace tags and motivation context", async () => {
    await using project = await tmpdir({ git: true })

    const seeded = await LearnerService.updateWorkspaceContext(project.path, {
      label: "Workspace",
      tags: ["tauri", "desktop"],
      motivationContext: "Ship one real feature this week",
      opportunities: ["learn rust"],
    })
    expect(seeded.tags).toEqual(["tauri", "desktop"])
    expect(seeded.motivationContext).toBe("Ship one real feature this week")
    expect(seeded.opportunities).toEqual(["learn rust"])

    const cleared = await LearnerService.updateWorkspaceContext(project.path, {
      tags: [],
      motivationContext: "",
      opportunities: [],
    })

    expect(cleared.tags).toEqual([])
    expect(cleared.motivationContext).toBeUndefined()
    expect(cleared.opportunities).toEqual([])
  })
})
