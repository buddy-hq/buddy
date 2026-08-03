import { describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
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

  test("returns 400 for malformed async prompt JSON payloads", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_malformed/prompt_async", {
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

  test("restores the previous teaching state when prompt setup fails", async () => {
    await using project = await tmpdir({ git: true })

    writeTeachingSessionState(project.path, {
      sessionId: "ses_missing",
      persona: "buddy",
      currentSurface: "curriculum",
      teachingWorkspaceState: "inactive",
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

  test("does not create teaching state when an async prompt targets a missing session", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_missing_async/prompt_async", {
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
    expect(readTeachingSessionState(project.path, "ses_missing_async")).toBeUndefined()
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

  test("returns 404 when Bench context publication races with session deletion", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/bench/session/ses_deleted/context", {
      method: "PUT",
      headers: {
        "x-buddy-directory": project.path,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        lease: {
          instanceID: "bench-test-instance",
          generation: 1,
          leaseEpoch: 1,
        },
        publicationSequence: 1,
        idempotencyKey: "deleted-session-publication",
        value: { status: "closed" },
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Session not found",
    })
  })
})
