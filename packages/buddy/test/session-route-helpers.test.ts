import { describe, expect, test } from "bun:test"
import { readProjectConfig } from "../src/config/compatibility.js"
import { readTeachingSessionState, writeTeachingSessionState } from "../src/learning/runtime/session-state.js"
import { SessionTransformValidationError } from "../src/routes/session/errors.js"
import { isSessionNotFoundError } from "../src/routes/session/lookup.js"
import { restoreTeachingSessionState, writeLastLlmOutbound } from "../src/routes/session/state.js"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitCommandModel,
  hasExplicitModel,
  normalizePersonaTarget,
  resolveFocusGoalIds,
  resolveIntentOverride,
} from "../src/routes/session/targeting.js"
import { tmpdir } from "./fixture/fixture"

describe("session route helper modules", () => {
  test("normalizes persona target and validates persona/agent exclusivity", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)

    expect(() =>
      normalizePersonaTarget({
        body: { persona: "buddy", agent: "code-buddy" },
        config,
      })).toThrow('Provide either "persona" or "agent", not both')

    const target = normalizePersonaTarget({
      body: { persona: "buddy" },
      config,
    })
    expect(target.personaID).toBe("buddy")
    expect(target.includeBuddySystem).toBe(true)
    expect(typeof target.runtimeAgent).toBe("string")
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
      })).toThrow(SessionTransformValidationError)

    expect(
      resolveIntentOverride({
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
    expect(isSessionNotFoundError({ name: "NotFoundError", message: "Session not found: ses_1" })).toBe(true)
    expect(isSessionNotFoundError({ name: "NotFoundError", data: { message: "Session not found: ses_1" } })).toBe(
      true,
    )
    expect(isSessionNotFoundError({ name: "NotFoundError", message: "Different failure" })).toBe(false)
  })

  test("restores session state and records outbound payload traces", async () => {
    await using project = await tmpdir({ git: true })

    writeTeachingSessionState(project.path, {
      sessionId: "ses_helper",
      persona: "buddy",
      currentSurface: "curriculum",
      workspaceState: "chat",
      focusGoalIds: ["goal_1"],
      promptInjectionCache: {
        stableHeaderSections: {},
        turnContextSections: {},
      },
    })

    writeLastLlmOutbound({
      directory: project.path,
      sessionID: "ses_helper",
      kind: "command",
      payload: { command: "/help", system: "custom system" },
    })

    expect(readTeachingSessionState(project.path, "ses_helper")?.lastLlmOutbound?.kind).toBe("command")

    restoreTeachingSessionState({
      directory: project.path,
      sessionID: "ses_helper",
      previousState: undefined,
    })
    expect(readTeachingSessionState(project.path, "ses_helper")).toBeUndefined()
  })
})
