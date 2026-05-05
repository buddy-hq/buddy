import { afterEach, describe, expect, test } from "bun:test"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { app } from "../../src/index.ts"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../../src/learning/agent-execution/state/session-state"
import {
  createToolMermaidArtifact,
  readMermaidRepairRequest,
  storeMermaidV2RenderRecord,
} from "../../src/learning/features/diagrams/service/v2-store"
import { tmpdir } from "../helpers/tmpdir"

type RouteMessage = Awaited<ReturnType<typeof OpenCodeSession.messages>>[number]

afterEach(async () => {
  await OpenCodeInstance.disposeAll()
})

async function createSession(directory: string) {
  return OpenCodeInstance.provide({
    directory,
    fn: async () => {
      const session = await OpenCodeSession.create({})
      return session.id
    },
  })
}

async function seedAssistantMessage(input: {
  directory: string
  sessionID: string
  messageID: string
}): Promise<void> {
  await OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      await OpenCodeSession.updateMessage({
        id: MessageID.make(input.messageID),
        sessionID: SessionID.make(input.sessionID),
        role: "assistant",
        parentID: MessageID.make("msg_parent"),
        time: { created: Date.now(), completed: Date.now() },
        mode: "buddy",
        agent: "buddy",
        providerID: ProviderID.opencode,
        modelID: ModelID.make("claude-sonnet"),
        path: { cwd: input.directory, root: input.directory },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
          total: 0,
        },
      } satisfies RouteMessage["info"])
    },
  })
}

describe("mermaid repair routes", () => {
  test("starts one repair attempt and rejects the second attempt", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession(project.path)
    await seedAssistantMessage({
      directory: project.path,
      sessionID,
      messageID: "msg_tool",
    })
    writeTeachingSessionState(project.path, {
      sessionId: sessionID,
      persona: "buddy",
      currentSurface: "curriculum",
      teachingWorkspaceState: "inactive",
      focusGoalIds: [],
    })

    const artifact = await createToolMermaidArtifact({
      directory: project.path,
      sessionID,
      messageID: "msg_tool",
      callID: "call_tool",
      alt: "Test diagram",
      caption: "Original caption",
      source: "graph TD\nA-->B",
    })
    const failedRender = await storeMermaidV2RenderRecord(project.path, artifact.artifactID, {
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
          artifactID: artifact.artifactID,
          failedRenderKey: failedRender.renderKey,
        }),
      },
    )

    expect(firstResponse.status).toBe(200)
    const firstBody = (await firstResponse.json()) as {
      repairRequestID: string
      status: "running" | "exhausted"
      lastErrorMessage?: string
    }
    expect(firstBody.repairRequestID.startsWith("msg_buddy_mermaid_auto_repair_")).toBe(true)
    expect(firstBody.status).toBe("running")
    expect(firstBody.lastErrorMessage).toBeUndefined()

    const storedRequest = await readMermaidRepairRequest(project.path, firstBody.repairRequestID)
    expect(storedRequest.artifactID).toBe(artifact.artifactID)
    expect(storedRequest.failedRenderKey).toBe(failedRender.renderKey)

    const outboundPayload = readTeachingSessionState(project.path, sessionID)?.lastLlmOutbound
      ?.payload
    if (!outboundPayload) {
      throw new Error("Expected the transformed repair prompt payload to be traced.")
    }
    expect(outboundPayload).toMatchObject({
      messageID: firstBody.repairRequestID,
      agent: "buddy",
      model: {
        providerID: ProviderID.opencode,
        modelID: ModelID.make("claude-sonnet"),
      },
    })
    expect(outboundPayload).not.toHaveProperty("metadata")
    expect(outboundPayload).not.toHaveProperty("content")
    expect(outboundPayload.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining(
            'Use exactly this alt text in the render_mermaid call: "Test diagram".',
          ),
        }),
      ]),
    )
    expect(outboundPayload.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining(
            'Use exactly this caption in the render_mermaid call: "Original caption".',
          ),
        }),
      ]),
    )
    expect(outboundPayload.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Alt: Test diagram"),
        }),
      ]),
    )
    expect(outboundPayload.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Caption: Original caption"),
        }),
      ]),
    )

    const secondResponse = await app.request(
      `/api/session/${sessionID}/mermaid-repair-async?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": project.path,
        },
        body: JSON.stringify({
          artifactID: artifact.artifactID,
          failedRenderKey: failedRender.renderKey,
        }),
      },
    )

    expect(secondResponse.status).toBe(409)
    await expect(secondResponse.json()).resolves.toEqual({
      error: "Automatic Mermaid repair already used its single attempt.",
    })
  })

  test("rejects repairing an artifact from a different session", async () => {
    await using project = await tmpdir({ git: true })
    const ownerSessionID = await createSession(project.path)
    const otherSessionID = await createSession(project.path)

    const artifact = await createToolMermaidArtifact({
      directory: project.path,
      sessionID: ownerSessionID,
      messageID: "msg_owner",
      callID: "call_owner",
      alt: "Other session diagram",
      source: "graph TD\nA-->B",
    })
    const failedRender = await storeMermaidV2RenderRecord(project.path, artifact.artifactID, {
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
          artifactID: artifact.artifactID,
          failedRenderKey: failedRender.renderKey,
        }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Mermaid artifact was not found for this session.",
    })
  })

  test("rejects malformed artifact and repair request ids with 400 responses", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = await createSession(project.path)

    const startResponse = await app.request(
      `/api/session/${sessionID}/mermaid-repair-async?directory=${encodeURIComponent(project.path)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-buddy-directory": project.path,
        },
        body: JSON.stringify({
          artifactID: "not-a-valid-artifact-id",
          failedRenderKey: "not-a-valid-render-key",
        }),
      },
    )

    expect(startResponse.status).toBe(400)
    await expect(startResponse.json()).resolves.toEqual({
      error: "Invalid mermaid.v2 artifact id 'not-a-valid-artifact-id'.",
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
