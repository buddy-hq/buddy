import { describe, expect, test } from "bun:test"
import { app } from "../src/index.ts"
import { compileRuntimeProfile } from "../src/learning/runtime/compiler.js"
import { buildLearningSystemPrompt } from "../src/learning/shared/compose-system-prompt.js"
import { writeTeachingSessionState } from "../src/learning/runtime/session-state.js"
import { getBuddyPersona } from "../src/personas/catalog.js"
import type { LearnerPromptDigest } from "../src/learning/runtime/types.js"
import { tmpdir } from "./fixture/fixture"

function createDigest(): LearnerPromptDigest {
  return {
    coldStart: false,
    workspaceLabel: "Runtime repo",
    workspaceTags: ["tauri", "ipc"],
    relevantGoalIds: ["goal_1"],
    recommendedNextAction: "guided-practice",
    constraintsSummary: ["Time: short session"],
    openFeedbackActions: ["Retry the validation branch without hints."],
    sessionPlanSummary: ["Practice is the recommended next move."],
    alignmentSummary: ["Goal goal_1 still needs assessment coverage."],
    tier1: ["<learner_state>", "- goal_1", "</learner_state>"],
    tier2: ["Plan: practice next"],
    tier3: ["Why this matters: this maps to the real app flow."],
  }
}

describe("runtime inspector route", () => {
  test("returns the compiled runtime inspector snapshot for a session", async () => {
    await using project = await tmpdir({ git: true })

    const persona = getBuddyPersona("code-buddy")
    const learnerDigest = createDigest()
    const runtimeProfile = compileRuntimeProfile({
      persona,
      workspaceState: "interactive",
    })
    const promptBuild = await buildLearningSystemPrompt({
      directory: project.path,
      runtimeProfile,
      learnerDigest,
      intentOverride: "practice",
      focusGoalIds: ["goal_1"],
      userContent: "Give me one practice task.",
      teachingContext: {
        active: true,
        sessionID: "ses_runtime",
        lessonFilePath: "/tmp/lesson.ts",
        checkpointFilePath: "/tmp/checkpoint.ts",
        language: "ts",
        revision: 1,
      },
    })

    writeTeachingSessionState(project.path, {
      sessionId: "ses_runtime",
      persona: "code-buddy",
      intentOverride: "practice",
      currentSurface: "editor",
      workspaceState: "interactive",
      focusGoalIds: ["goal_1"],
      inspector: {
        runtimeAgent: runtimeProfile.runtimeAgent,
        capabilityEnvelope: runtimeProfile.capabilityEnvelope,
        learnerDigest,
        advisorySuggestions: ["Focus goals: goal_1"],
        stableHeader: promptBuild.stableHeader,
        turnContext: promptBuild.turnContext,
        stableHeaderSections: promptBuild.stableHeaderSections,
        turnContextSections: promptBuild.turnContextSections,
      },
    })

    const response = await app.request("/api/session/ses_runtime/runtime-inspector", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      intentOverride?: string
      focusGoalIds: string[]
      inspector: {
        runtimeAgent: string
        capabilityEnvelope: {
          tools: Record<string, string>
          skills: Record<string, string>
          activityBundles: Array<{
            id: string
          }>
        }
        stableHeaderSections: Array<{
          label: string
        }>
        turnContextSections: Array<{
          label: string
        }>
      }
    }

    expect(body.intentOverride).toBe("practice")
    expect(body.focusGoalIds).toEqual(["goal_1"])
    expect(body.inspector.runtimeAgent).toBe("code-buddy")
    expect(body.inspector.capabilityEnvelope.tools.practice_record).toBe("allow")
    expect(body.inspector.capabilityEnvelope.skills["buddy-practice-guided"]).toBe("allow")
    expect(body.inspector.capabilityEnvelope.activityBundles.map((bundle) => bundle.id)).toContain("code-debug-attempt")
    expect(body.inspector.stableHeaderSections.some((section) => section.label === "Persona Header")).toBe(true)
    expect(body.inspector.turnContextSections.some((section) => section.label === "Teaching Workspace")).toBe(true)
  })

  test("returns 204 when no runtime inspector state exists yet", async () => {
    await using project = await tmpdir({ git: true })

    const response = await app.request("/api/session/ses_missing/runtime-inspector", {
      headers: {
        "x-buddy-directory": project.path,
      },
    })

    expect(response.status).toBe(204)
  })
})
