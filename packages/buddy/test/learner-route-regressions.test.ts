import { describe, expect, test } from "bun:test"
import { app } from "../src/index.ts"
import { LearnerService } from "../src/learning/learner/service.js"
import { writeTeachingSessionState } from "../src/learning/runtime/session-state.js"
import { tmpdir } from "./fixture/fixture"

describe("learner route regressions", () => {
  test("uses the session workspace state when building the curriculum view", async () => {
    await using project = await tmpdir({ git: true })

    writeTeachingSessionState(project.path, {
      sessionId: "ses_interactive",
      persona: "code-buddy",
      intentOverride: "practice",
      currentSurface: "editor",
      workspaceState: "interactive",
      focusGoalIds: [],
    })

    const chatResponse = await app.request("/api/learner/curriculum-view?persona=code-buddy&intent=practice", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })
    expect(chatResponse.status).toBe(200)
    const chatBody = (await chatResponse.json()) as {
      activityBundles: Array<{ id: string }>
    }
    expect(chatBody.activityBundles.map((bundle) => bundle.id)).not.toContain("code-debug-attempt")

    const interactiveResponse = await app.request(
      "/api/learner/curriculum-view?persona=code-buddy&intent=practice&sessionId=ses_interactive",
      {
        headers: {
          "x-buddy-directory": project.path,
        },
      },
    )
    expect(interactiveResponse.status).toBe(200)
    const interactiveBody = (await interactiveResponse.json()) as {
      activityBundles: Array<{ id: string }>
    }
    expect(interactiveBody.activityBundles.map((bundle) => bundle.id)).toContain("code-debug-attempt")
  })

  test("scopes progress and review projections to the requested workspace", async () => {
    await using projectA = await tmpdir({ git: true })
    await using projectB = await tmpdir({ git: true, preserveLearnerStore: true })

    const committedA = await LearnerService.commitGoals({
      directory: projectA.path,
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
    const committedB = await LearnerService.commitGoals({
      directory: projectB.path,
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

    await LearnerService.recordAssessment({
      directory: projectA.path,
      goalIds: committedA.goalIds,
      format: "concept-check",
      summary: "Explained closure capture correctly.",
      result: "demonstrated",
      sessionId: "ses_a",
    })
    await LearnerService.recordAssessment({
      directory: projectB.path,
      goalIds: committedB.goalIds,
      format: "concept-check",
      summary: "Explained pointer indirection correctly.",
      result: "demonstrated",
      sessionId: "ses_b",
    })

    const progressResponse = await app.request("/api/learner/progress", {
      headers: {
        "x-buddy-directory": projectA.path,
      },
    })
    expect(progressResponse.status).toBe(200)
    const progressBody = (await progressResponse.json()) as {
      progress: Array<{ goalId: string }>
    }
    expect(progressBody.progress.map((record) => record.goalId)).toContain(committedA.goalIds[0]!)
    expect(progressBody.progress.map((record) => record.goalId)).not.toContain(committedB.goalIds[0]!)

    const reviewResponse = await app.request("/api/learner/review", {
      headers: {
        "x-buddy-directory": projectA.path,
      },
    })
    expect(reviewResponse.status).toBe(200)
    const reviewBody = (await reviewResponse.json()) as {
      review: Array<{ goalId: string }>
    }
    expect(reviewBody.review.map((record) => record.goalId)).toContain(committedA.goalIds[0]!)
    expect(reviewBody.review.map((record) => record.goalId)).not.toContain(committedB.goalIds[0]!)
  })
})
