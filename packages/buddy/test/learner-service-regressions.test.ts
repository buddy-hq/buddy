import { describe, expect, test } from "bun:test"
import { ulid } from "ulid"
import { LearnerService } from "../src/learning/learner/service.js"
import { hashDecisionInput } from "../src/learning/learner/artifacts/bridge.js"
import { LearnerArtifactStore } from "../src/learning/learner/artifacts/store.js"
import { tmpdir } from "./fixture/fixture"

describe("LearnerService regressions", () => {
  test("does not resolve open feedback from a learner completion claim alone", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.replaceGoalSet({
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

    await LearnerService.recordPracticeEvent({
      directory: project.path,
      goalIds: committed.goalIds,
      learnerResponseSummary: "I could not get the guard logic working.",
      outcome: "stuck",
      sessionId: "ses_feedback",
    })

    const workspace = await LearnerService.ensureWorkspaceContext(project.path)
    const now = new Date().toISOString()
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
      createdAt: now,
      updatedAt: now,
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

    expect(feedback.some((record) => record.kind === "feedback" && record.id === seededFeedbackId)).toBe(true)
    expect(learnerMessageEvidence.filter((record) => record.kind === "evidence" && record.sourceKind === "message")).toHaveLength(0)
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
          statement: "At the end of this topic, you will be able to explain when to use break and continue.",
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

    expect(messages.filter((record) => record.kind === "message" && record.role === "learner")).toHaveLength(2)
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

  test("reuses an existing plan decision for unchanged learner inputs", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.replaceGoalSet({
      directory: project.path,
      scope: "topic",
      contextLabel: "Closures",
      learnerRequest: "I want to reason about closure capture.",
      goals: [
        {
          statement: "At the end of this topic, you will be able to explain closure capture behavior.",
          actionVerb: "explain",
          task: "Explain closure capture behavior.",
          cognitiveLevel: "Comprehension",
          howToTest: "Describe closure capture outcomes in a few examples.",
        },
      ],
    })
    const workspace = await LearnerService.ensureWorkspaceContext(project.path)
    const snapshot = await LearnerService.getWorkspaceSnapshot({
      directory: project.path,
      query: {
        persona: "buddy",
        intent: "practice",
        focusGoalIds: committed.goalIds,
      },
    })
    const seededDecisionId = ulid()
    const seededHash = hashDecisionInput([
      workspace.workspaceId,
      "buddy",
      "practice",
      "",
      "",
      committed.goalIds.join(","),
      snapshot.decisionInputFingerprint,
    ].join("::"))
    await LearnerArtifactStore.upsertArtifact(project.path, "decision-plan", {
      id: seededDecisionId,
      kind: "decision-plan",
      decisionType: "plan",
      workspaceId: workspace.workspaceId,
      goalIds: committed.goalIds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      inputHash: seededHash,
      disposition: "apply",
      confidence: 0.8,
      rationale: ["Use guided practice to reinforce closure capture."],
      payload: {
        disposition: "apply",
        confidence: 0.8,
        suggestedActivity: "guided-practice",
        suggestedScaffoldingLevel: "guided",
        warmupGoalIds: [],
        alternatives: [],
        rationale: ["Use guided practice to reinforce closure capture."],
        riskFlags: [],
        followUpQuestions: [],
      },
      usedSmallModel: false,
    })

    const reused = await LearnerService.ensurePlanDecision({
      directory: project.path,
      query: {
        persona: "buddy",
        intent: "practice",
        focusGoalIds: committed.goalIds,
      },
    })
    const planArtifacts = await LearnerService.listArtifacts({
      directory: project.path,
      kind: "decision-plan",
    })

    expect(reused.decision?.id).toBe(seededDecisionId)
    expect(reused.plan.suggestedActivity).toBe("guided-practice")
    expect(planArtifacts.filter((record) => record.kind === "decision-plan")).toHaveLength(1)
  })

  test("scopes latest plan selection to the requested goal IDs", async () => {
    await using project = await tmpdir({ git: true })

    const closures = await LearnerService.replaceGoalSet({
      directory: project.path,
      scope: "topic",
      contextLabel: "Closures",
      learnerRequest: "I want to understand closures.",
      goals: [
        {
          statement: "At the end of this topic, you will be able to explain closure capture.",
          actionVerb: "explain",
          task: "Explain closure capture.",
          cognitiveLevel: "Comprehension",
          howToTest: "Describe closure capture in a few examples.",
        },
      ],
    })
    const pointers = await LearnerService.replaceGoalSet({
      directory: project.path,
      scope: "topic",
      contextLabel: "Pointers",
      learnerRequest: "I want to understand pointers.",
      goals: [
        {
          statement: "At the end of this topic, you will be able to explain pointer indirection.",
          actionVerb: "explain",
          task: "Explain pointer indirection.",
          cognitiveLevel: "Comprehension",
          howToTest: "Walk through pointer indirection with one example.",
        },
      ],
    })
    const workspace = await LearnerService.ensureWorkspaceContext(project.path)
    const olderTimestamp = new Date("2026-01-01T00:00:00.000Z").toISOString()
    const newerTimestamp = new Date("2026-02-01T00:00:00.000Z").toISOString()
    const closuresPlanId = ulid()
    const pointersPlanId = ulid()

    await LearnerArtifactStore.upsertArtifact(project.path, "decision-plan", {
      id: closuresPlanId,
      kind: "decision-plan",
      decisionType: "plan",
      workspaceId: workspace.workspaceId,
      goalIds: closures.goalIds,
      createdAt: olderTimestamp,
      updatedAt: olderTimestamp,
      inputHash: "closures-plan",
      disposition: "apply",
      confidence: 0.9,
      rationale: ["Use guided practice for closures."],
      payload: {
        disposition: "apply",
        confidence: 0.9,
        suggestedActivity: "guided-practice",
        suggestedScaffoldingLevel: "guided",
        warmupGoalIds: [],
        alternatives: [],
        rationale: ["Use guided practice for closures."],
        riskFlags: [],
        followUpQuestions: [],
      },
      usedSmallModel: false,
    })
    await LearnerArtifactStore.upsertArtifact(project.path, "decision-plan", {
      id: pointersPlanId,
      kind: "decision-plan",
      decisionType: "plan",
      workspaceId: workspace.workspaceId,
      goalIds: pointers.goalIds,
      createdAt: newerTimestamp,
      updatedAt: newerTimestamp,
      inputHash: "pointers-plan",
      disposition: "apply",
      confidence: 0.9,
      rationale: ["Use retrieval checks for pointers."],
      payload: {
        disposition: "apply",
        confidence: 0.9,
        suggestedActivity: "retrieval-check",
        suggestedScaffoldingLevel: "guided",
        warmupGoalIds: [],
        alternatives: [],
        rationale: ["Use retrieval checks for pointers."],
        riskFlags: [],
        followUpQuestions: [],
      },
      usedSmallModel: false,
    })

    const closuresSnapshot = await LearnerService.getWorkspaceSnapshot({
      directory: project.path,
      query: {
        persona: "buddy",
        intent: "practice",
        focusGoalIds: closures.goalIds,
      },
    })

    expect(closuresSnapshot.latestPlan?.id).toBe(closuresPlanId)
    expect(closuresSnapshot.markdown).toContain("Suggested activity: guided-practice")
    expect(closuresSnapshot.markdown).not.toContain("Suggested activity: retrieval-check")
  })
})
