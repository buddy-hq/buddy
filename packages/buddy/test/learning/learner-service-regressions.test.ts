import { describe, expect, test } from "bun:test"
import { ulid } from "ulid"
import { LearnerService } from "../../src/learning/learner-model"
import { LearnerArtifactStore } from "../../src/learning/learner-model"
import { tmpdir } from "../helpers/tmpdir"

const FIXED_TIMESTAMP = "2026-03-01T00:00:00.000Z"

describe("LearnerService regressions", () => {
  test("does not resolve open feedback from a learner self-report alone", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.replaceGoalSet({
      directory: project.path,
      scope: "topic",
      contextLabel: "Type narrowing",
      learnerRequest: "I want to get better at narrowing unknown values.",
      goals: [
        {
          statement:
            "At the end of this topic, you will be able to narrow unknown values with guards.",
          actionVerb: "narrow",
          task: "Narrow unknown values with guards.",
          cognitiveLevel: "Application",
          howToTest: "Write and run a function that safely narrows several unknown inputs.",
        },
      ],
    })

    await LearnerService.recordPracticeEvent({
      directory: project.path,
      goalIds: committed.goalIds,
      learnerResponseSummary: "I could not get the guard logic working.",
      outcome: "stuck",
      sessionId: "ses_feedback",
    })

    const workspace = await LearnerService.ensureWorkspaceContext(project.path)
    const seededFeedbackId = ulid()
    await LearnerArtifactStore.upsertArtifact(project.path, "feedback", {
      id: seededFeedbackId,
      kind: "feedback",
      workspaceId: workspace.workspaceId,
      goalIds: committed.goalIds,
      status: "open",
      sourceKind: "teacher-observation",
      strengths: [],
      gaps: ["Guard logic is still inconsistent."],
      guidance: ["Rebuild the type-guard branch structure and re-test."],
      requiredAction: "Fix guard branch coverage and rerun checks.",
      scaffoldingLevel: "guided",
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    })

    await LearnerService.recordLearnerMessageEvent({
      directory: project.path,
      content: "done",
      goalIds: committed.goalIds,
      sessionId: "ses_feedback",
    })

    const feedback = await LearnerService.listArtifacts({
      directory: project.path,
      kind: "feedback",
      status: "open",
      goalId: committed.goalIds[0],
    })
    const learnerMessageEvidence = await LearnerService.listArtifacts({
      directory: project.path,
      kind: "evidence",
      goalId: committed.goalIds[0],
    })

    expect(
      feedback.some((record) => record.kind === "feedback" && record.id === seededFeedbackId),
    ).toBe(true)
    expect(
      learnerMessageEvidence.filter(
        (record) => record.kind === "evidence" && record.sourceKind === "message",
      ),
    ).toHaveLength(0)
  })

  test("records repeated learner follow-ups in the same session without collapsing them", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.replaceGoalSet({
      directory: project.path,
      scope: "topic",
      contextLabel: "Loops",
      learnerRequest: "I want to get comfortable with loop control flow.",
      goals: [
        {
          statement:
            "At the end of this topic, you will be able to explain when to use break and continue.",
          actionVerb: "explain",
          task: "Explain when to use break and continue.",
          cognitiveLevel: "Comprehension",
          howToTest: "Describe the right control-flow choice for a few loop examples.",
        },
      ],
    })

    await LearnerService.recordLearnerMessageEvent({
      directory: project.path,
      content: "done",
      goalIds: committed.goalIds,
      sessionId: "ses_repeat",
    })
    await LearnerService.recordLearnerMessageEvent({
      directory: project.path,
      content: "done",
      goalIds: committed.goalIds,
      sessionId: "ses_repeat",
    })

    const messages = await LearnerService.listArtifacts({
      directory: project.path,
      kind: "message",
      goalId: committed.goalIds[0],
    })

    expect(
      messages.filter((record) => record.kind === "message" && record.role === "learner"),
    ).toHaveLength(2)
  })

  test("keeps active misconceptions scoped to the current workspace", async () => {
    await using projectA = await tmpdir({ git: true })
    await using projectB = await tmpdir({ git: true, preserveLearnerStore: true })

    const committedA = await LearnerService.replaceGoalSet({
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
    await LearnerService.recordLearnerMessageEvent({
      directory: projectA.path,
      content: "I am confused about pointer indirection.",
      goalIds: committedA.goalIds,
      sessionId: "ses_a",
    })

    const committedB = await LearnerService.replaceGoalSet({
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
    const snapshot = await LearnerService.getWorkspaceSnapshot({
      directory: projectB.path,
      query: {
        persona: "buddy",
        intent: "learn",
        focusGoalIds: committedB.goalIds,
      },
    })

    expect(snapshot.markdown).not.toContain("I am confused about pointer indirection.")
  })

  test("allows clearing workspace tags and motivation context", async () => {
    await using project = await tmpdir({ git: true })

    const seeded = await LearnerService.patchWorkspace({
      directory: project.path,
      workspace: {
        label: "Workspace",
        tags: ["tauri", "desktop"],
        motivationContext: "Ship one real feature this week",
        opportunities: ["learn rust"],
      },
    })
    expect(seeded.workspace.tags).toEqual(["tauri", "desktop"])
    expect(seeded.workspace.motivationContext).toBe("Ship one real feature this week")
    expect(seeded.workspace.opportunities).toEqual(["learn rust"])

    const cleared = await LearnerService.patchWorkspace({
      directory: project.path,
      workspace: {
        tags: [],
        motivationContext: "",
        opportunities: [],
      },
    })

    expect(cleared.workspace.tags).toEqual([])
    expect(cleared.workspace.motivationContext).toBeUndefined()
    expect(cleared.workspace.opportunities).toEqual([])
  })
})
