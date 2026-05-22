import { afterEach, describe, expect, test } from "bun:test"
import { readProjectConfig } from "../../src/config/runtime/config-access"
import { resolveSessionRuntime } from "../../src/learning/access/resolve-session-runtime"
import {
  clearAllTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { resolveSubagentToolForwarding } from "../../src/learning/agent-execution/transforms/subagent-tool-forwarding"
import { REGISTERED_BUDDY_PERSONAS } from "../../src/learning/personas/registry"
import { getBuddyPersona } from "../../src/learning/personas/wiring/persona-profiles"
import type { BuddyMessageWithParts, BuddySessionInfo } from "../../src/pi-backend/contracts"
import { piRuntime } from "../../src/pi-backend/runtime"
import { tmpdir } from "../helpers/tmpdir"

const TEST_TIME = 1_715_000_000_000
const CHILD_SESSION_ID = "ses_child_forwarding"
const PARENT_SESSION_ID = "ses_parent_forwarding"

const originalGetSessionInfo = piRuntime.getSessionInfo.bind(piRuntime)
const originalListMessages = piRuntime.listMessages.bind(piRuntime)

function buddySessionInfo(input: {
  directory: string
  id: string
  parentID?: string
}): BuddySessionInfo {
  return {
    id: input.id,
    slug: input.id,
    projectID: "proj_test",
    directory: input.directory,
    ...(input.parentID ? { parentID: input.parentID } : {}),
    title: input.id,
    version: "test",
    time: {
      created: TEST_TIME,
      updated: TEST_TIME,
    },
  }
}

function userMessage(input: {
  agent: string
  sessionID: string
  tools?: Record<string, boolean>
}): BuddyMessageWithParts {
  return {
    info: {
      id: `msg_${input.sessionID}`,
      sessionID: input.sessionID,
      role: "user",
      time: {
        created: TEST_TIME,
      },
      agent: input.agent,
      model: {
        providerID: "openai",
        modelID: "gpt-5",
      },
      ...(input.tools ? { tools: input.tools } : {}),
    },
    parts: [],
  }
}

afterEach(() => {
  clearAllTeachingSessionState()
  Reflect.set(piRuntime, "getSessionInfo", originalGetSessionInfo)
  Reflect.set(piRuntime, "listMessages", originalListMessages)
})

describe("resolveSubagentToolForwarding", () => {
  test("inherits the parent runtime tool set instead of broadening partial prompt overrides", async () => {
    await using project = await tmpdir({ git: true })
    const projectConfig = await readProjectConfig(project.path)
    const personaDefinition = REGISTERED_BUDDY_PERSONAS.find(
      (definition) => definition.id === "reading-buddy",
    )
    if (!personaDefinition) {
      throw new Error('Missing "reading-buddy" persona definition')
    }

    const persona = getBuddyPersona("reading-buddy", projectConfig.personas)
    const parentRuntime = resolveSessionRuntime({
      persona: {
        id: persona.id,
        features: personaDefinition.features,
        defaultSurface: persona.defaultSurface,
      },
      teachingWorkspaceState: "inactive",
      configuredToolToggles: projectConfig.tools,
    })

    writeTeachingSessionState(project.path, {
      sessionId: PARENT_SESSION_ID,
      persona: persona.id,
      currentSurface: persona.defaultSurface,
      teachingWorkspaceState: "inactive",
      sessionRuntime: {
        ...parentRuntime,
        access: {
          ...parentRuntime.access,
          tools: {
            ...parentRuntime.access.tools,
            goal_state: "deny",
          },
        },
      },
      focusGoalIds: [],
    })

    Reflect.set(
      piRuntime,
      "getSessionInfo",
      async (directory: string, sessionID: string): Promise<BuddySessionInfo> => {
        if (sessionID === CHILD_SESSION_ID) {
          return buddySessionInfo({
            directory,
            id: CHILD_SESSION_ID,
            parentID: PARENT_SESSION_ID,
          })
        }

        return buddySessionInfo({
          directory,
          id: PARENT_SESSION_ID,
        })
      },
    )
    Reflect.set(
      piRuntime,
      "listMessages",
      async (_directory: string, sessionID: string): Promise<BuddyMessageWithParts[]> => {
        if (sessionID !== PARENT_SESSION_ID) {
          return []
        }

        return [
          userMessage({
            sessionID,
            agent: "reading-buddy",
            tools: {
              prepare_resource: true,
            },
          }),
        ]
      },
    )

    const forwarding = await resolveSubagentToolForwarding({
      currentTools: undefined,
      directory: project.path,
      projectConfig,
      sessionID: CHILD_SESSION_ID,
      targetAgent: "question-set-author",
    })

    expect(forwarding.toolOverrides?.prepare_resource).toBe(true)
    expect(forwarding.toolOverrides?.goal_state).toBe(false)
    expect(forwarding.toolOverrides?.save_question_set).toBe(true)
  })
})
