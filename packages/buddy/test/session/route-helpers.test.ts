import { describe, expect, test } from "bun:test"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import {
  restoreTeachingSessionState,
  writeLastLlmOutbound,
} from "../../src/learning/agent-execution/state/transform-state"
import {
  captureSessionSystemPrompt,
  readCapturedSessionSystemPrompt,
} from "../../src/opencode-runtime/system-prompt-capture"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitCommandModel,
  hasExplicitModel,
  normalizePersonaTarget,
  resolveFocusGoalIds,
  resolveIntent,
} from "../../src/learning/shared/targeting"
import { isSessionNotFoundError, SessionTransformValidationError } from "../../src/session"
import { tmpdir } from "../helpers/tmpdir"

describe("session route helper modules", () => {
  test("normalizes persona target and validates persona/agent exclusivity", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    expect(() =>
      normalizePersonaTarget({
        body: { persona: "buddy", agent: "code-buddy" },
        config,
      }),
    ).toThrow('Provide either "persona" or "agent", not both')

    const target = normalizePersonaTarget({
      body: { persona: "buddy" },
      config,
    })
    expect(target.personaID).toBe("buddy")
    expect(target.includeBuddySystem).toBe(true)
    expect(typeof target.agent).toBe("string")
  })

  test("parses intent/focus-goal overrides and rejects legacy runtime fields", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    expect(
      resolveFocusGoalIds({
        focusGoalIds: ["goal_1", "  ", 123],
      }),
    ).toEqual(["goal_1"])

    expect(() =>
      assertNoLegacyRuntimeOverrides({
        focusGoalIds: ["goal_1"],
        activityBundleId: "legacy",
      }),
    ).toThrow(SessionTransformValidationError)

    expect(
      resolveIntent({
        body: { intent: "practice" },
        config,
      }),
    ).toBe("practice")
  })

  test("detects explicit model payloads", () => {
    expect(hasExplicitModel({ providerID: "openai", modelID: "gpt-5" })).toBe(true)
    expect(hasExplicitModel({ providerID: "openai" })).toBe(false)
    expect(hasExplicitCommandModel("/help")).toBe(true)
    expect(hasExplicitCommandModel("")).toBe(false)
  })

  test("detects opencode-style not-found errors", () => {
    expect(
      isSessionNotFoundError({ name: "NotFoundError", message: "Session not found: ses_1" }),
    ).toBe(true)
    expect(
      isSessionNotFoundError({
        name: "NotFoundError",
        data: { message: "Session not found: ses_1" },
      }),
    ).toBe(true)
    expect(isSessionNotFoundError({ name: "NotFoundError", message: "Different failure" })).toBe(
      false,
    )
  })

  test("restores session state and records outbound payload traces", async () => {
    await using project = await tmpdir({ git: true })

    writeTeachingSessionState(project.path, {
      sessionId: "ses_helper",
      persona: "buddy",
      intent: "auto",
      currentSurface: "curriculum",
      workspaceState: "chat",
      focusGoalIds: ["goal_1"],
    })

    writeLastLlmOutbound({
      directory: project.path,
      sessionID: "ses_helper",
      kind: "command",
      payload: { command: "/help", system: "custom system" },
    })

    expect(readTeachingSessionState(project.path, "ses_helper")?.lastLlmOutbound?.kind).toBe(
      "command",
    )

    restoreTeachingSessionState({
      directory: project.path,
      sessionID: "ses_helper",
      previousState: undefined,
    })
    expect(readTeachingSessionState(project.path, "ses_helper")).toBeUndefined()
  })

  test("reads captured system prompt by session ID when directory key differs", async () => {
    await using project = await tmpdir({ git: true })

    await captureSessionSystemPrompt({
      directory: project.path,
      sessionID: "ses_capture_fallback",
      fullSystemPrompt: "captured prompt",
    })

    const captured = await readCapturedSessionSystemPrompt({
      directory: `${project.path}/nested/path`,
      sessionID: "ses_capture_fallback",
    })

    expect(captured).toBe("captured prompt")
  })
})
