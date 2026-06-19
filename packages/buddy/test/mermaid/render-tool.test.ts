import { describe, expect, test } from "bun:test"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { BUDDY_OBJECT_KINDS, BuddyObjectResultSchema } from "../../src/objects"
import { MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX } from "../../src/learning/features/diagrams/service/types"
import {
  createMermaidRepairRequest,
  readMermaidObject,
  readMermaidRepairRequest,
  storeMermaidObjectRenderRecord,
} from "../../src/learning/features/diagrams/service/store"
import { renderMermaidTool } from "../../src/learning/features/diagrams/tools/render-mermaid"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { tmpdir } from "../helpers/tmpdir"
import { createBuddyToolContext } from "../helpers/tools"

const PLACEHOLDER_OBJECT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const TEST_MESSAGE_MODEL = {
  providerID: ProviderID.openai,
  modelID: ModelID.make("gpt-5.4-mini"),
}

type ToolMessage = BuddyToolContext["messages"][number]

function seedRepairTurnMessages(input: {
  assistantMessageID: string
  directory: string
  repairRequestID: string
  sessionID: string
}): ToolMessage[] {
  const createdAt = Date.now()
  return [
    {
      info: {
        id: MessageID.make(input.repairRequestID),
        sessionID: SessionID.make(input.sessionID),
        role: "user",
        time: { created: createdAt },
        agent: "buddy",
        model: TEST_MESSAGE_MODEL,
        tools: {},
      },
      parts: [],
    },
    {
      info: {
        id: MessageID.make(input.assistantMessageID),
        sessionID: SessionID.make(input.sessionID),
        role: "assistant",
        parentID: MessageID.make(input.repairRequestID),
        time: { created: createdAt, completed: createdAt },
        mode: "buddy",
        agent: "buddy",
        providerID: TEST_MESSAGE_MODEL.providerID,
        modelID: TEST_MESSAGE_MODEL.modelID,
        path: { cwd: input.directory, root: input.directory },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
          total: 0,
        },
      },
      parts: [],
    },
  ]
}

describe("render_mermaid tool", () => {
  test(
    "creates a fresh object when a non-repair turn passes a missing repairOfObjectID",
    async () => {
      await using project = await tmpdir({ git: true })

      const result = await renderMermaidTool.run(
        {
          alt: "Placeholder repair id diagram",
          source: "flowchart LR\nA-->B",
          repairOfObjectID: PLACEHOLDER_OBJECT_ID,
        },
        createBuddyToolContext({
          directory: project.path,
          sessionID: "ses_mermaid",
          messageID: "msg_mermaid",
          agent: "buddy",
        }),
      )

      expect(result.output).toContain("Ignored repairOfObjectID")
      const objectResult = BuddyObjectResultSchema.parse(result.metadata?.buddyObjectResult)
      expect(objectResult.primaryRef?.kind).toBe(BUDDY_OBJECT_KINDS.mermaid)
      const objectID = objectResult.primaryRef?.objectID ?? ""

      const object = await readMermaidObject({
        directory: project.path,
        objectID,
      })
      expect(object.source).toBe("flowchart LR\nA-->B")
      expect(object.repairOfObjectID).toBeNull()
      expect(object.supersedesRevisionID).toBeNull()
    },
    10_000,
  )

  test("keeps auto-repair strict when the latest user turn requests a missing object", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = "ses_mermaid_repair_strict"
    const assistantMessageID = "msg_mermaid_assistant"
    const repairRequestID = `${MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX}test`
    const context = createBuddyToolContext({
        directory: project.path,
      sessionID,
      messageID: repairRequestID,
      agent: "buddy",
    })
    context.messages = seedRepairTurnMessages({
      assistantMessageID,
      directory: project.path,
      repairRequestID,
      sessionID,
    })

    await expect(
      renderMermaidTool.run(
        {
          alt: "Missing repair target",
          source: "flowchart LR\nA-->B",
          repairOfObjectID: PLACEHOLDER_OBJECT_ID,
        },
        context,
      ),
    ).rejects.toThrow("Use the exact object ID from the repair prompt")
  })

  test("marks the parent repair request succeeded when repair runs from assistant message context", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = "ses_mermaid_repair_success"
    const original = await renderMermaidTool.run(
      {
        alt: "Broken original",
        source: "flowchart LR\nA-->B",
      },
      createBuddyToolContext({
        directory: project.path,
        sessionID,
        messageID: "msg_original_assistant",
        agent: "buddy",
      }),
    )
    const originalObjectResult = BuddyObjectResultSchema.parse(
      original.metadata?.buddyObjectResult,
    )
    const originalObjectID = originalObjectResult.primaryRef?.objectID
    const originalRevisionID = originalObjectResult.primaryRef?.revisionID
    if (!originalObjectID || !originalRevisionID) {
      throw new Error("Expected original Mermaid object and revision IDs.")
    }
    const failedRender = await storeMermaidObjectRenderRecord(
      project.path,
      originalObjectID,
      {
        status: "failed",
        errorMessage: "Parse error on line 2",
        renderConfigVersion: 1,
        rendererVersion: "11.12.0",
        themeSignature: '{"backgroundBase":"#fff"}',
      },
    )
    const repairRequest = await createMermaidRepairRequest({
      directory: project.path,
      sessionID,
      objectID: originalObjectID,
      revisionID: originalRevisionID,
      failedRenderKey: failedRender.renderKey,
    })
    const assistantMessageID = "msg_repair_assistant"
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID,
      messageID: assistantMessageID,
      agent: "buddy",
    })
    context.messages = seedRepairTurnMessages({
      assistantMessageID,
      directory: project.path,
      repairRequestID: repairRequest.repairRequestID,
      sessionID,
    })

    const repaired = await renderMermaidTool.run(
      {
        alt: "Repaired diagram",
        source: "flowchart LR\nA[Start]-->B[Done]",
        repairOfObjectID: originalObjectID,
      },
      context,
    )
    const repairedObjectResult = BuddyObjectResultSchema.parse(
      repaired.metadata?.buddyObjectResult,
    )
    const repairedRevisionID = repairedObjectResult.primaryRef?.revisionID
    if (!repairedRevisionID) {
      throw new Error("Expected repaired Mermaid revision ID.")
    }
    const storedRequest = await readMermaidRepairRequest(
      project.path,
      repairRequest.repairRequestID,
    )
    if (!storedRequest.replacementRevisionID) {
      throw new Error("Expected repair request replacement revision ID.")
    }
    const result = {
      objectID: originalObjectID,
      repairedRevisionID,
      requestStatus: storedRequest.status,
      replacementRevisionID: storedRequest.replacementRevisionID,
    }

    expect(result.requestStatus).toBe("succeeded")
    expect(result.replacementRevisionID).toBe(result.repairedRevisionID)
    const object = await readMermaidObject({
      directory: project.path,
      objectID: result.objectID,
    })
    expect(object.autoRepair.status).toBe("succeeded")
    expect(object.replacementRevisionID).toBe(result.repairedRevisionID)
  })
})
