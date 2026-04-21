import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import { LearnerService } from "../../src/learning/learner-model"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { tmpdir } from "../helpers/tmpdir"

describe("session route regressions", () => {
  test("does not record learner evidence when prompt validation fails", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.replaceGoalSet({
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
          howToTest: "Describe what a closure captures in a few examples.",
        },
      ],
    })

    const before = await LearnerService.listArtifacts({
      directory: project.path,
      kind: "evidence",
      goalId: committed.goalIds[0],
    })

    const response = await app.request("/api/session/ses_invalid/message", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: "Give me a practice task.",
        persona: "code-buddy",
        currentGoalIds: committed.goalIds,
        focusGoalIds: committed.goalIds,
      }),
    })

    expect(response.status).toBe(400)

    const after = await LearnerService.listArtifacts({
      directory: project.path,
      kind: "evidence",
      goalId: committed.goalIds[0],
    })

    expect(after).toEqual(before)
  })

  test("forwards abort even when no active status is cached", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_missing/abort", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toBe(true)
  })

  test("resolves /session/status as status endpoint instead of session-id route", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/status", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(Array.isArray(body)).toBe(false)
    expect(body.error).toBeUndefined()
  })
})
