import { describe, expect, test } from "bun:test"
import { app } from "../src/index.ts"
import { LearnerService } from "../src/learning/learner/service.js"
import { readTeachingSessionState, writeTeachingSessionState } from "../src/learning/runtime/session-state.js"
import { tmpdir } from "./fixture/fixture"

describe("session route regressions", () => {
  test("returns 400 for malformed prompt JSON payloads", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_malformed/message", {
      method: "POST",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: "{\"content\":\"missing quote}",
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
      body: "{\"command\":\"/help\"",
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
      promptInjectionCache: {
        stableHeaderSections: {
          "persona-header:Persona Header": "old stable header",
        },
        turnContextSections: {
          "workspace-state:Workspace State": "old turn context",
        },
      },
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

    expect(response.ok).toBe(false)
    expect(readTeachingSessionState(project.path, "ses_missing")).toMatchObject({
      sessionId: "ses_missing",
      focusGoalIds: ["goal_prev"],
      promptInjectionCache: {
        stableHeaderSections: {
          "persona-header:Persona Header": "old stable header",
        },
        turnContextSections: {
          "workspace-state:Workspace State": "old turn context",
        },
      },
    })
  })

  test("does not record learner evidence when prompt validation fails", async () => {
    await using project = await tmpdir({ git: true })

    const committed = await LearnerService.commitGoals({
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

    const workspace = await LearnerService.ensureWorkspaceContext(project.path)
    const before = await LearnerService.queryState({
      workspaceId: workspace.workspaceId,
      goalIds: committed.goalIds,
      conceptTags: [],
      includeDerived: true,
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
        activityBundleId: "not-a-real-bundle",
        focusGoalIds: committed.goalIds,
      }),
    })

    expect(response.status).toBe(400)

    const after = await LearnerService.queryState({
      workspaceId: workspace.workspaceId,
      goalIds: committed.goalIds,
      conceptTags: [],
      includeDerived: true,
    })

    expect(after.evidence).toEqual(before.evidence)
  })
})
