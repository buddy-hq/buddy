import { describe, expect, test } from "bun:test"
import {
  buddyPiToolNamesForSession,
  forwardedBuddyPiToolNamesForSubagent,
} from "../../src/pi-backend/tools"
import { readProjectConfig } from "../../src/config/runtime/config-access"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import { resolveSubagentToolForwarding } from "../../src/learning/agent-execution/transforms/subagent-tool-forwarding"
import { writeTeachingSessionState } from "../../src/learning/agent-execution/state/session-state"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import { REGISTERED_BUDDY_PERSONAS } from "../../src/learning/personas/registry"
import { piRuntime } from "../../src/pi-backend/runtime"
import { tmpdir } from "../helpers/tmpdir"

const BUDDY_SESSION_ID = "ses_test_policy"

describe("PI subagent tool inheritance", () => {
  test("derives primary persona tools and subagents from enabled features", async () => {
    await using project = await tmpdir({ git: true })
    const buddyDefinition = REGISTERED_BUDDY_PERSONAS.find(
      (definition) => definition.id === "buddy",
    )
    if (!buddyDefinition) {
      throw new Error('Missing "buddy" persona definition')
    }

    const buddyPersona = getBuddyPersona("buddy")
    const sessionRuntime = resolveSessionRuntime({
      persona: {
        id: buddyPersona.id,
        features: buddyDefinition.features,
        defaultSurface: buddyPersona.defaultSurface,
      },
      teachingWorkspaceState: "inactive",
    })
    writeTeachingSessionState(project.path, {
      sessionId: BUDDY_SESSION_ID,
      persona: buddyPersona.id,
      currentSurface: buddyPersona.defaultSurface,
      teachingWorkspaceState: "inactive",
      sessionRuntime,
      focusGoalIds: [],
    })

    expect(sessionRuntime.access.tools.prepare_resource).toBe("allow")
    expect(sessionRuntime.access.subagents["question-set-author"]).toBe("allow")
    expect(sessionRuntime.access.subagents["flashcard-author"]).toBe("allow")
    expect(buddyPiToolNamesForSession(project.path, BUDDY_SESSION_ID)).toContain("task")
    expect(buddyPiToolNamesForSession(project.path, BUDDY_SESSION_ID)).not.toContain(
      "save_question_set",
    )
  })

  test("forwards parent tools and includes specialized subagent tools", () => {
    const parentTools = ["prepare_resource", "ingest_full_text"]
    const forwarded = forwardedBuddyPiToolNamesForSubagent({
      targetAgent: "question-set-author",
      parentToolNames: parentTools,
      configuredToolToggles: undefined,
      teachingWorkspaceState: "inactive",
    })

    // Should include parent tools
    expect(forwarded).toContain("prepare_resource")
    expect(forwarded).toContain("ingest_full_text")

    // Should include specialized tools for question-set-author
    expect(forwarded).toContain("save_question_set")
  })

  test("handles subagent tool forwarding with no parent tools", () => {
    const forwarded = forwardedBuddyPiToolNamesForSubagent({
      targetAgent: "question-set-author",
      parentToolNames: [],
      configuredToolToggles: undefined,
      teachingWorkspaceState: "inactive",
    })

    // Should contain specialized tool
    expect(forwarded).toContain("save_question_set")
    // Should not contain parent tools
    expect(forwarded).not.toContain("prepare_resource")
  })

  test("forwards parent tools and includes permission-based specialized tools for practice-agent", () => {
    const parentTools = ["prepare_resource"]
    const forwarded = forwardedBuddyPiToolNamesForSubagent({
      targetAgent: "practice-agent",
      parentToolNames: parentTools,
      configuredToolToggles: undefined,
      teachingWorkspaceState: "inactive",
    })

    // Should contain parent tools
    expect(forwarded).toContain("prepare_resource")
    // Should contain permission-based specialized tool
    expect(forwarded).toContain("learner_memory_search")
  })

  test("falls back to parent persona visibility when the parent user prompt omitted explicit tools", async () => {
    await using project = await tmpdir({ git: true })

    const readingDefinition = REGISTERED_BUDDY_PERSONAS.find(
      (definition) => definition.id === "reading-buddy",
    )
    if (!readingDefinition) {
      throw new Error('Missing "reading-buddy" persona definition')
    }

    const readingPersona = getBuddyPersona("reading-buddy")
    const sessionRuntime = resolveSessionRuntime({
      persona: {
        id: readingPersona.id,
        features: readingDefinition.features,
        defaultSurface: readingPersona.defaultSurface,
      },
      teachingWorkspaceState: "inactive",
    })
    writeTeachingSessionState(project.path, {
      sessionId: "ses_parent",
      persona: readingPersona.id,
      currentSurface: readingPersona.defaultSurface,
      teachingWorkspaceState: "inactive",
      sessionRuntime,
      focusGoalIds: [],
    })

    const originalGetSessionInfo = piRuntime.getSessionInfo.bind(piRuntime)
    const originalListMessages = piRuntime.listMessages.bind(piRuntime)
    const now = Date.now()

    try {
      piRuntime.getSessionInfo = async (_directory: string, sessionID: string) => {
        if (sessionID === "ses_child") {
          return {
            id: "ses_child",
            slug: "ses-child",
            projectID: "pi-project",
            directory: project.path,
            path: "/tmp/ses-child.jsonl",
            parentID: "ses_parent",
            title: "Child session",
            version: "pi",
            time: {
              created: now,
              updated: now,
            },
          }
        }

        return {
          id: "ses_parent",
          slug: "ses-parent",
          projectID: "pi-project",
          directory: project.path,
          path: "/tmp/ses-parent.jsonl",
          title: "Parent session",
          version: "pi",
          time: {
            created: now,
            updated: now,
          },
        }
      }
      piRuntime.listMessages = async (_directory: string, sessionID: string) => {
        if (sessionID !== "ses_parent") {
          return []
        }

        return [
          {
            info: {
              id: "msg_parent_user",
              sessionID: "ses_parent",
              role: "user",
              time: {
                created: now,
              },
              agent: "reading-buddy",
              model: {
                providerID: "pi",
                modelID: "unknown",
              },
            },
            parts: [],
          },
        ]
      }

      const forwarding = await resolveSubagentToolForwarding({
        currentTools: undefined,
        directory: project.path,
        projectConfig: await readProjectConfig(project.path),
        sessionID: "ses_child",
        targetAgent: "question-set-author",
      })

      expect(forwarding.toolOverrides?.prepare_resource).toBe(true)
      expect(forwarding.toolOverrides?.apply_patch).toBe(true)
      expect(forwarding.toolOverrides?.read).toBe(true)
      expect(forwarding.toolOverrides?.save_question_set).toBe(true)
      expect(forwarding.toolOverrides?.save_flashcard_deck).toBe(false)
    } finally {
      piRuntime.getSessionInfo = originalGetSessionInfo
      piRuntime.listMessages = originalListMessages
    }
  })
})
