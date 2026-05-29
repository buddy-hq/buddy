import { describe, expect, test } from "bun:test"
import { MessageID, ModelID, ProviderID, SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX } from "../../src/learning/features/diagrams/service/v2-types"
import { RenderMermaidOutputSchema } from "../../src/learning/features/diagrams/service/v2-types"
import { readMermaidV2Artifact } from "../../src/learning/features/diagrams/service/v2-store"
import { tmpdir } from "../helpers/tmpdir"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"

const PLACEHOLDER_ARTIFACT_ID = "0".repeat(64)
const TEST_MESSAGE_MODEL = {
  providerID: ProviderID.openai,
  modelID: ModelID.make("gpt-5.4-mini"),
}

type RouteMessage = Awaited<ReturnType<typeof OpenCodeSession.messages>>[number]

async function seedRepairTurnMessages(input: {
  assistantMessageID: string
  directory: string
  repairRequestID: string
  sessionID: string
}) {
  const sessionID = SessionID.make(input.sessionID)
  const repairRequestID = MessageID.make(input.repairRequestID)
  await OpenCodeSession.updateMessage({
    id: repairRequestID,
    sessionID,
    role: "user",
    time: { created: Date.now() },
    agent: "buddy",
    model: TEST_MESSAGE_MODEL,
    tools: {},
  } satisfies RouteMessage["info"])
  await OpenCodeSession.updateMessage({
    id: MessageID.make(input.assistantMessageID),
    sessionID,
    role: "assistant",
    parentID: repairRequestID,
    time: { created: Date.now(), completed: Date.now() },
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
  } satisfies RouteMessage["info"])
  return OpenCodeSession.messages({ sessionID })
}

describe("render_mermaid tool", () => {
  test("creates a fresh artifact when a non-repair turn passes a missing repairOfArtifactID", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderMermaid = requireTool(tools, "render_mermaid")

        return renderMermaid.execute(
          {
            alt: "Placeholder repair id diagram",
            source: "flowchart LR\nA-->B",
            repairOfArtifactID: PLACEHOLDER_ARTIFACT_ID,
          },
          createToolContext({
            sessionID: "ses_mermaid",
            messageID: "msg_mermaid",
            agent: "buddy",
          }),
        )
      },
    })

    expect(result.output).toContain("Ignored repairOfArtifactID")
    const output = RenderMermaidOutputSchema.parse(result.metadata?.value)
    expect(output.supersedesArtifactID).toBeUndefined()

    const artifact = await readMermaidV2Artifact(project.path, output.artifactID)
    expect(artifact.source).toBe("flowchart LR\nA-->B")
    expect(artifact.supersedesArtifactID).toBeUndefined()
  })

  test("keeps auto-repair strict when the latest user turn requests a missing artifact", async () => {
    await using project = await tmpdir({ git: true })
    await ensureBuddyPluginTools(project.path)

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        async fn() {
          const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
          const renderMermaid = requireTool(tools, "render_mermaid")
          const sessionID = String((await OpenCodeSession.create({})).id)
          const assistantMessageID = "msg_mermaid_assistant"
          const context = createToolContext({
            sessionID,
            messageID: assistantMessageID,
            agent: "buddy",
          })
          context.messages = await seedRepairTurnMessages({
            assistantMessageID,
            directory: project.path,
            repairRequestID: `${MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX}test`,
            sessionID,
          })

          return renderMermaid.execute(
            {
              alt: "Missing repair target",
              source: "flowchart LR\nA-->B",
              repairOfArtifactID: PLACEHOLDER_ARTIFACT_ID,
            },
            context,
          )
        },
      }),
    ).rejects.toThrow("Use the exact artifact ID from the repair prompt")
  })
})
