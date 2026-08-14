import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { app } from "../../src/index.ts"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import { writeLastLlmOutbound } from "../../src/learning/agent-execution/state/transform-state"
import { MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS } from "../../src/learning/features/diagrams/service/types"
import {
  createMermaidRepairRequest,
  createToolMermaidObject,
  readMermaidObject,
  readMermaidRepairRequest,
  storeMermaidObjectRenderRecord,
} from "../../src/learning/features/diagrams/service/store"
import { setSessionInteractionRuntimeOverrides } from "../../src/session/orchestration/interaction-actions"
import { tmpdir } from "../helpers/tmpdir"

const MERMAID_REPAIR_IDLE_TEST_POLL_INTERVAL_MULTIPLIER = 3
const MERMAID_REPAIR_TEST_PROVIDER_ID = "opencode"
const MERMAID_REPAIR_TEST_MODEL_ID = "claude-sonnet"

const completedRepairRequests = new Set<string>()
let nextSessionIndex = 0
let restoreSessionInteractionRuntime = () => {}

function repairRequestKey(input: { sessionID: string; repairRequestID: string }): string {
  return `${input.sessionID}:${input.repairRequestID}`
}

beforeEach(() => {
  completedRepairRequests.clear()
  restoreSessionInteractionRuntime = setSessionInteractionRuntimeOverrides({
    assertSessionExists: async () => undefined,
    createPromptTransform: ({ context }) => ({
      onTransform: async (body) => {
        const content = typeof body.content === "string" ? body.content : ""
        const transformed: Record<string, unknown> = {
          parts: [
            {
              type: "text",
              text: content,
            },
          ],
        }
        if (typeof body.messageID === "string") {
          transformed.messageID = body.messageID
        }
        if (typeof body.agent === "string") {
          transformed.agent = body.agent
        }
        if (body.model !== undefined) {
          transformed.model = body.model
        }
        if (typeof body.variant === "string") {
          transformed.variant = body.variant
        }
        writeLastLlmOutbound({
          directory: context.directory,
          sessionID: context.sessionID,
          kind: "message",
          payload: transformed,
        })
        return transformed
      },
    }),
    sendPromptAsync: async () => ({}),
    resolveMermaidRepairPromptRuntime: async () => ({
      agent: "buddy",
      model: {
        providerID: MERMAID_REPAIR_TEST_PROVIDER_ID,
        modelID: MERMAID_REPAIR_TEST_MODEL_ID,
      },
    }),
    hasCompletedMermaidRepairAssistantMessage: async (input) =>
      completedRepairRequests.has(repairRequestKey(input)),
    isMermaidRepairSessionIdle: async () => true,
  })
})

afterEach(() => {
  restoreSessionInteractionRuntime()
  restoreSessionInteractionRuntime = () => {}
})

async function createSession() {
  nextSessionIndex += 1
  return `ses_mermaid_repair_${nextSessionIndex}`
}

async function seedCompletedRepairTurn(input: {
  assistantMessageID: string
  directory: string
  repairRequestID: string
  sessionID: string
}): Promise<void> {
  completedRepairRequests.add(
    repairRequestKey({
      sessionID: input.sessionID,
      repairRequestID: input.repairRequestID,
    }),
  )
}

describe("mermaid repair routes", () => {
  test("rejects automatic repair without creating session work", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession()
    writeTeachingSessionState(project.path, {
      sessionId: sessionID,
      persona: "buddy",
      currentSurface: "curriculum",
      teachingWorkspaceState: "inactive",
      focusGoalIds: [],
    })

    const object = await createToolMermaidObject({
      directory: project.path,
      sessionID,
      messageID: "msg_tool",
      callID: "call_tool",
      alt: "Test diagram",
      caption: "Original caption",
      source: "graph TD\nA-->B",
    })
    const failedRender = await storeMermaidObjectRenderRecord(project.path, object.objectID, {
      status: "failed",
      errorMessage: "Parse error on line 2",
      renderConfigVersion: 1,
      rendererVersion: "11.12.0",
      themeSignature: '{"backgroundBase":"#fff"}',
    })

    const firstResponse = await app.request(
      `/api/session/${sessionID}/mermaid-repair-async?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": project.path,
        },
        body: JSON.stringify({
          objectID: object.objectID,
          failedRenderKey: failedRender.renderKey,
        }),
      },
    )

    expect(firstResponse.status).toBe(503)
    await expect(firstResponse.json()).resolves.toEqual({
      error: "Automatic Mermaid repair is temporarily disabled.",
    })
    expect(readTeachingSessionState(project.path, sessionID)?.lastLlmOutbound).toBeUndefined()

    const storedObject = await readMermaidObject({
      directory: project.path,
      objectID: object.objectID,
    })
    expect(storedObject.autoRepair).toEqual({ status: "eligible", attempts: 0 })
  })

  test("rejects repairing an object from a different session", async () => {
    await using project = await tmpdir({ git: true })
    const ownerSessionID = await createSession()
    const otherSessionID = await createSession()

    const object = await createToolMermaidObject({
      directory: project.path,
      sessionID: ownerSessionID,
      messageID: "msg_owner",
      callID: "call_owner",
      alt: "Other session diagram",
      source: "graph TD\nA-->B",
    })
    const failedRender = await storeMermaidObjectRenderRecord(project.path, object.objectID, {
      status: "failed",
      errorMessage: "Parse error on line 2",
      renderConfigVersion: 1,
      rendererVersion: "11.12.0",
      themeSignature: '{"backgroundBase":"#fff"}',
    })

    const response = await app.request(
      `/api/session/${otherSessionID}/mermaid-repair-async?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": project.path,
        },
        body: JSON.stringify({
          objectID: object.objectID,
          failedRenderKey: failedRender.renderKey,
        }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Mermaid object was not found for this session.",
    })
  })

  test("exhausts running repair after the repair turn completes without replacement", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession()

    const object = await createToolMermaidObject({
      directory: project.path,
      sessionID,
      messageID: "msg_tool",
      callID: "call_tool",
      alt: "Unrepaired diagram",
      source: "graph TD\nA-->B",
    })
    const failedRender = await storeMermaidObjectRenderRecord(project.path, object.objectID, {
      status: "failed",
      errorMessage: "Parse error on line 2",
      renderConfigVersion: 1,
      rendererVersion: "11.12.0",
      themeSignature: '{"backgroundBase":"#fff"}',
    })
    const request = await createMermaidRepairRequest({
      directory: project.path,
      sessionID,
      objectID: object.objectID,
      revisionID: object.revisionID,
      failedRenderKey: failedRender.renderKey,
      createdAt: new Date(
        Date.now() -
          MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS * MERMAID_REPAIR_IDLE_TEST_POLL_INTERVAL_MULTIPLIER,
      ).toISOString(),
    })
    await seedCompletedRepairTurn({
      assistantMessageID: "msg_repair_assistant_done",
      directory: project.path,
      repairRequestID: request.repairRequestID,
      sessionID,
    })

    const response = await app.request(
      `/api/session/${sessionID}/mermaid-repair/${request.repairRequestID}?directory=${encodeURIComponent(project.path)}`,
      {
        method: "GET",
        headers: {
          "x-buddy-directory": project.path,
        },
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      repairRequestID: request.repairRequestID,
      status: "exhausted",
      lastErrorMessage:
        "Automatic Mermaid repair completed without creating a replacement diagram.",
    })
    const storedRequest = await readMermaidRepairRequest(project.path, request.repairRequestID)
    expect(storedRequest.status).toBe("exhausted")
    const updatedObject = await readMermaidObject({
      directory: project.path,
      objectID: object.objectID,
    })
    expect(updatedObject.autoRepair.status).toBe("exhausted")
  })

  test("does not exhaust a newer Mermaid revision from an older repair request", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession()
    const original = await createToolMermaidObject({
      directory: project.path,
      sessionID,
      messageID: "msg_original",
      callID: "call_original",
      alt: "Original diagram",
      source: "graph TD\nA-->B",
    })
    const failedRender = await storeMermaidObjectRenderRecord(project.path, original.objectID, {
      status: "failed",
      errorMessage: "Parse error",
      renderConfigVersion: 1,
      rendererVersion: "11.12.0",
      themeSignature: '{"backgroundBase":"#fff"}',
    })
    const request = await createMermaidRepairRequest({
      directory: project.path,
      sessionID,
      objectID: original.objectID,
      revisionID: original.revisionID,
      failedRenderKey: failedRender.renderKey,
      createdAt: new Date(
        Date.now() -
          MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS * MERMAID_REPAIR_IDLE_TEST_POLL_INTERVAL_MULTIPLIER,
      ).toISOString(),
    })
    const newer = await createToolMermaidObject({
      directory: project.path,
      sessionID,
      messageID: "msg_newer",
      callID: "call_newer",
      alt: "Newer diagram",
      source: "graph TD\nA-->C",
      repairOfObjectID: original.objectID,
    })
    await seedCompletedRepairTurn({
      assistantMessageID: "msg_old_repair_complete",
      directory: project.path,
      repairRequestID: request.repairRequestID,
      sessionID,
    })

    const response = await app.request(
      `/api/session/${sessionID}/mermaid-repair/${request.repairRequestID}?directory=${encodeURIComponent(project.path)}`,
      { headers: { "x-buddy-directory": project.path } },
    )
    expect(response.status).toBe(200)
    expect((await readMermaidRepairRequest(project.path, request.repairRequestID)).status).toBe(
      "exhausted",
    )
    const current = await readMermaidObject({
      directory: project.path,
      objectID: original.objectID,
    })
    expect(current.revisionID).toBe(newer.revisionID)
    expect(current.autoRepair.status).not.toBe("exhausted")
  })

  test("rejects malformed object and repair request ids with 400 responses", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession()

    const startResponse = await app.request(
      `/api/session/${sessionID}/mermaid-repair-async?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": project.path,
        },
        body: JSON.stringify({
          objectID: "not-a-valid-object-id",
          failedRenderKey: "not-a-valid-render-key",
        }),
      },
    )

    expect(startResponse.status).toBe(400)
    await expect(startResponse.json()).resolves.toEqual({
      error: "Invalid Buddy object id 'not-a-valid-object-id'.",
    })

    const statusResponse = await app.request(
      `/api/session/${sessionID}/mermaid-repair/not-a-valid-repair-request?directory=${encodeURIComponent(project.path)}`,
      {
        method: "GET",
        headers: {
          "x-buddy-directory": project.path,
        },
      },
    )

    expect(statusResponse.status).toBe(400)
    await expect(statusResponse.json()).resolves.toEqual({
      error: "Invalid Mermaid repair request id 'not-a-valid-repair-request'.",
    })
  })
})
