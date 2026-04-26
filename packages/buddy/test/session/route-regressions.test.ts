import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import { LearnerService } from "../../src/learning/learner-model"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { tmpdir } from "../helpers/tmpdir"

describe("session route regressions", () => {
  test("returns 400 for malformed prompt JSON payloads", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_malformed/message", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: '{"content":"missing quote}',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    })
  })

  test("returns 400 for malformed command JSON payloads", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_malformed/command", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: '{"command":"/help"',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    })
  })

  test("restores the previous teaching state when prompt setup fails", async () => {
    await using project = await tmpdir({ git: true })

    writeTeachingSessionState(project.path, {
      sessionId: "ses_missing",
      persona: "buddy",
      currentSurface: "curriculum",
      workspaceState: "chat",
      focusGoalIds: ["goal_prev"],
    })

    const response = await app.request("/api/session/ses_missing/message", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: "Help me understand closures.",
        persona: "buddy",
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Session not found",
    })
    expect(readTeachingSessionState(project.path, "ses_missing")).toMatchObject({
      sessionId: "ses_missing",
      focusGoalIds: ["goal_prev"],
    })
  })

  test("does not create teaching state when a prompt targets a missing session", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_missing_new/message", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: "Teach me closures.",
        persona: "buddy",
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Session not found",
    })
    expect(readTeachingSessionState(project.path, "ses_missing_new")).toBeUndefined()
  })

  test("does not create teaching state when a command targets a missing session", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_missing_cmd/command", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        command: "/help",
        persona: "buddy",
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Session not found",
    })
    expect(readTeachingSessionState(project.path, "ses_missing_cmd")).toBeUndefined()
  })

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
