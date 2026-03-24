import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src/index.ts"
import {
  ensureMermaidToolsRegistered,
  MermaidArtifactService,
  MermaidRenderError,
} from "../../src/learning/capabilities"
import {
  MermaidArtifactManifestSchema,
  RenderMermaidOutputSchema,
  type RenderMermaidInput,
} from "../../src/learning/capabilities"
import { tmpdir } from "../helpers/tmpdir"
import { createToolContext, requireTool, TEST_TOOL_MODEL } from "../helpers/tools"

function baseMermaidInput(): RenderMermaidInput {
  return {
    kind: "mermaid.v1",
    alt: "Simple dependency flow",
    source: ["flowchart TD", "A[Start] --> B{Decision}", "B -->|Yes| C[Done]", "B -->|No| A"].join(
      "\n",
    ),
  }
}

describe("mermaid tools", () => {
  test("treats packet-beta as a known Mermaid diagram type during validation", async () => {
    const result = await MermaidArtifactService.validateSource("packet-beta\nINVALID_PACKET_BODY")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.diagnostics.join(" ")).not.toContain(
        "Unknown Mermaid diagram type: packet-beta",
      )
    }
  })

  test("renders and persists canonical Mermaid artifacts under .buddy/mermaid-artifacts", async () => {
    await using project = await tmpdir({ git: true })

    const execution = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureMermaidToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderMermaid = requireTool(tools, "render_mermaid")

        return renderMermaid.execute(
          baseMermaidInput(),
          createToolContext({
            sessionID: "ses_mermaid",
            messageID: "msg_mermaid",
            agent: "buddy",
          }),
        )
      },
    })

    const payload = RenderMermaidOutputSchema.parse(JSON.parse(execution.output))
    const artifactDirectory = path.join(
      project.path,
      ".buddy",
      "mermaid-artifacts",
      payload.artifactID,
    )
    const manifestPath = path.join(artifactDirectory, "manifest.json")
    const sourcePath = path.join(artifactDirectory, "diagram.mmd")

    const [manifestText, diagramSource] = await Promise.all([
      fs.readFile(manifestPath, "utf8"),
      fs.readFile(sourcePath, "utf8"),
    ])
    const manifest = MermaidArtifactManifestSchema.parse(JSON.parse(manifestText))

    expect(payload.artifactID).toMatch(/^[a-f0-9]{64}$/)
    expect(payload.mime).toBe("application/vnd.mermaid")
    expect(payload.repairAttempts).toBe(0)
    expect(payload.artifactUrl).toContain(`/api/mermaid-artifacts/${payload.artifactID}?directory=`)
    expect(payload.markdown).toContain("```mermaid")
    expect(diagramSource).toBe(payload.source)
    expect(manifest.artifactID).toBe(payload.artifactID)
    expect(manifest.sourceHash).toBe(MermaidArtifactService.hashSource(payload.source))
  })

  test("reads persisted Mermaid artifacts from the API route after tool execution", async () => {
    await using project = await tmpdir({ git: true })

    const payload = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureMermaidToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderMermaid = requireTool(tools, "render_mermaid")
        const result = await renderMermaid.execute(
          baseMermaidInput(),
          createToolContext({
            sessionID: "ses_route",
            messageID: "msg_route",
            agent: "buddy",
          }),
        )
        return RenderMermaidOutputSchema.parse(JSON.parse(result.output))
      },
    })

    const response = await app.request(payload.artifactUrl)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    expect(body.artifactID).toBe(payload.artifactID)
    expect(body.kind).toBe("mermaid.v1")
    expect(body.source).toBe(payload.source)
    expect(body.diagramType).toBe(payload.diagramType)
    expect(typeof body.createdAt).toBe("string")
  })

  test("lists persisted Mermaid artifacts for a workspace", async () => {
    await using project = await tmpdir({ git: true })

    const payload = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureMermaidToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderMermaid = requireTool(tools, "render_mermaid")
        const result = await renderMermaid.execute(
          baseMermaidInput(),
          createToolContext({
            sessionID: "ses_list",
            messageID: "msg_list",
            agent: "buddy",
          }),
        )
        return RenderMermaidOutputSchema.parse(JSON.parse(result.output))
      },
    })

    const response = await app.request(
      `/api/mermaid-artifacts?directory=${encodeURIComponent(project.path)}`,
    )
    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      artifacts: Array<Record<string, unknown>>
    }
    expect(body.artifacts).toHaveLength(1)
    expect(body.artifacts[0]?.artifactID).toBe(payload.artifactID)
    expect(body.artifacts[0]?.source).toBe(payload.source)
  })

  test("repairs wrapped and fenced Mermaid input with a deterministic repair log", async () => {
    await using project = await tmpdir({ git: true })

    const payload = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureMermaidToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderMermaid = requireTool(tools, "render_mermaid")

        const repairedInput: RenderMermaidInput = {
          kind: "mermaid.v1",
          alt: "Wrapped mermaid",
          source: [
            "Please draw this Mermaid diagram.",
            "```mermaid",
            "mermaid",
            "flowchart TD",
            'A["quoted node"] → B',
            "```",
            "Thanks.",
          ].join("\n"),
        }

        const result = await renderMermaid.execute(
          repairedInput,
          createToolContext({
            sessionID: "ses_repair",
            messageID: "msg_repair",
            agent: "buddy",
          }),
        )

        return RenderMermaidOutputSchema.parse(JSON.parse(result.output))
      },
    })

    expect(payload.repairAttempts).toBeGreaterThan(0)
    expect(payload.repairLog.length).toBeGreaterThan(0)
    expect(payload.source).not.toContain("```")
    expect(payload.source).toContain("-->")
    expect(payload.source).not.toContain("“")
  })

  test("creates distinct artifact ids when the same source is rendered with different metadata", async () => {
    await using project = await tmpdir({ git: true })

    const outputs = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        await ensureMermaidToolsRegistered(project.path)
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const renderMermaid = requireTool(tools, "render_mermaid")

        const first = RenderMermaidOutputSchema.parse(
          JSON.parse(
            (
              await renderMermaid.execute(
                {
                  kind: "mermaid.v1",
                  alt: "First alt",
                  source: "flowchart TD\nA --> B",
                },
                createToolContext({
                  sessionID: "ses_first",
                  messageID: "msg_first",
                  agent: "buddy",
                }),
              )
            ).output,
          ),
        )
        const second = RenderMermaidOutputSchema.parse(
          JSON.parse(
            (
              await renderMermaid.execute(
                {
                  kind: "mermaid.v1",
                  alt: "Second alt",
                  source: "flowchart TD\nA --> B",
                },
                createToolContext({
                  sessionID: "ses_second",
                  messageID: "msg_second",
                  agent: "buddy",
                }),
              )
            ).output,
          ),
        )

        return { first, second }
      },
    })

    expect(outputs.first.artifactID).not.toBe(outputs.second.artifactID)

    const [firstArtifact, secondArtifact] = await Promise.all([
      MermaidArtifactService.read(project.path, outputs.first.artifactID),
      MermaidArtifactService.read(project.path, outputs.second.artifactID),
    ])

    expect(firstArtifact.alt).toBe("First alt")
    expect(secondArtifact.alt).toBe("Second alt")
  })

  test("rejects malformed flowcharts that a heuristic fallback would otherwise accept", async () => {
    const result = await MermaidArtifactService.validateSource("flowchart TD\nA[")

    expect(result.ok).toBe(false)
  })

  test("fails invalid Mermaid input with diagnostics and writes no artifact", async () => {
    await using project = await tmpdir({ git: true })

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        async fn() {
          await ensureMermaidToolsRegistered(project.path)
          const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
          const renderMermaid = requireTool(tools, "render_mermaid")

          await renderMermaid.execute(
            {
              kind: "mermaid.v1",
              alt: "Invalid graph",
              source: "flowchart TD\nA -->",
            } satisfies RenderMermaidInput,
            createToolContext({
              sessionID: "ses_invalid",
              messageID: "msg_invalid",
              agent: "buddy",
            }),
          )
        },
      }),
    ).rejects.toBeInstanceOf(MermaidRenderError)

    const artifactEntries = await fs
      .readdir(path.join(project.path, ".buddy", "mermaid-artifacts"))
      .catch(() => [] as string[])
    expect(artifactEntries).toHaveLength(0)
  })
})
