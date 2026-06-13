import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { app } from "../../src/index"
import {
  buildHtmlWidgetRuntimeUrl,
  buildHtmlWidgetSourceUrl,
  createHtmlWidgetArtifact,
  HtmlWidgetValidationError,
} from "../../src/learning/features/html-widgets/service/store"
import {
  HTML_WIDGET_KIND,
  HTML_WIDGET_RUNTIME_CSP,
  HtmlWidgetSourceResponseSchema,
  PresentHtmlWidgetOutputSchema,
} from "../../src/learning/features/html-widgets/service/types"
import {
  createToolContext,
  ensureBuddyPluginTools,
  requireTool,
  TEST_TOOL_MODEL,
} from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

describe("HTML widgets", () => {
  test("snapshots a self-contained HTML file and serves it through hardened runtime routes", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "widgets"), { recursive: true })
    const source = [
      "<!doctype html>",
      "<html>",
      "<head><title>Fractions</title></head>",
      "<body>",
      '<main><button type="button">1/2</button></main>',
      '<img alt="fraction bar" src="./fraction.png">',
      '<script>fetch("https://example.com/fractions.json")</script>',
      "</body>",
      "</html>",
    ].join("\n")
    await fs.writeFile(path.join(project.path, "widgets", "fractions.html"), source, "utf8")

    const widget = await OpenCodeInstance.provide({
      directory: project.path,
      fn: () =>
        createHtmlWidgetArtifact({
          directory: project.path,
          path: "widgets/fractions.html",
          title: "Fraction Builder",
          origin: {
            kind: "tool",
            sessionID: "ses_html_widget",
            messageID: "msg_html_widget",
            callID: "call_html_widget",
          },
        }),
    })

    expect(widget.kind).toBe(HTML_WIDGET_KIND)
    expect(widget.title).toBe("Fraction Builder")
    expect(widget.summary.viewport.preset).toBe("standard_16_10")
    expect(widget.summary.viewport.width).toBe(960)
    expect(widget.summary.viewport.height).toBe(600)
    expect(widget.summary.sourcePath).toBe("widgets/fractions.html")
    expect(widget.summary.warnings.map((warning) => warning.code)).toContain(
      "relative_asset_reference",
    )
    expect(widget.summary.warnings.map((warning) => warning.code)).toContain(
      "blocked_remote_reference",
    )

    const runtimeResponse = await app.request(
      buildHtmlWidgetRuntimeUrl({
        directory: project.path,
        artifactID: widget.artifactID,
      }),
    )
    expect(runtimeResponse.status).toBe(200)
    expect(runtimeResponse.headers.get("content-security-policy")).toBe(HTML_WIDGET_RUNTIME_CSP)
    expect(runtimeResponse.headers.get("content-security-policy")).toContain(
      "sandbox allow-scripts",
    )
    expect(runtimeResponse.headers.get("content-security-policy")).toContain("navigate-to 'none'")
    expect(runtimeResponse.headers.get("referrer-policy")).toBe("no-referrer")
    expect(runtimeResponse.headers.get("x-content-type-options")).toBe("nosniff")
    expect(await runtimeResponse.text()).toBe(source)

    const sourceResponse = await app.request(
      buildHtmlWidgetSourceUrl({
        directory: project.path,
        artifactID: widget.artifactID,
      }),
    )
    expect(sourceResponse.status).toBe(200)

    const listResponse = await app.request(
      `/api/artifacts?directory=${encodeURIComponent(project.path)}&kind=html-widget`,
    )
    expect(listResponse.status).toBe(200)
    const list = (await listResponse.json()) as {
      artifacts: Array<{ artifactID: string }>
    }
    expect(list.artifacts.map((entry) => entry.artifactID)).toContain(widget.artifactID)
  })

  test("registers present_html_widget and returns structured metadata", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "widgets"), { recursive: true })
    await fs.writeFile(
      path.join(project.path, "widgets", "quiz.html"),
      "<!doctype html><button>Start quiz</button>",
      "utf8",
    )
    await ensureBuddyPluginTools(project.path)

    const result = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        const presentHtmlWidget = requireTool(tools, "present_html_widget")

        return presentHtmlWidget.execute(
          {
            path: "widgets/quiz.html",
            title: "Quick Quiz",
            description: "Try one practice question.",
            viewportPreset: "compact_4_3",
          },
          createToolContext({
            sessionID: "ses_tool_html_widget",
            messageID: "msg_tool_html_widget",
            agent: "buddy",
          }),
        )
      },
    })

    expect(result.output).toContain('Presented HTML widget "Quick Quiz".')
    expect(result.metadata?.artifact).toBe("PresentHtmlWidgetOutput")
    const output = PresentHtmlWidgetOutputSchema.parse(result.metadata?.value)
    expect(output.kind).toBe(HTML_WIDGET_KIND)
    expect(output.title).toBe("Quick Quiz")
    expect(output.viewport.preset).toBe("compact_4_3")
    expect(output.viewport.width).toBe(640)
    expect(output.viewport.height).toBe(480)
    expect(output.sourcePath).toBe("widgets/quiz.html")

    const sourceResponse = await app.request(output.sourceUrl)
    expect(sourceResponse.status).toBe(200)
    const source = HtmlWidgetSourceResponseSchema.parse(await sourceResponse.json())
    expect(source.artifactID).toBe(output.artifactID)
    expect(source.source).toContain("<button>Start quiz</button>")
  })

  test("rejects non-HTML widget source files", async () => {
    await using project = await tmpdir({ git: true })
    await fs.mkdir(path.join(project.path, "widgets"), { recursive: true })
    await fs.writeFile(path.join(project.path, "widgets", "notes.txt"), "not html", "utf8")

    await expect(
      OpenCodeInstance.provide({
        directory: project.path,
        fn: () =>
          createHtmlWidgetArtifact({
            directory: project.path,
            path: "widgets/notes.txt",
            title: "Notes",
            origin: {
              kind: "tool",
              sessionID: "ses_invalid_html_widget",
              messageID: "msg_invalid_html_widget",
              callID: "call_invalid_html_widget",
            },
          }),
      }),
    ).rejects.toBeInstanceOf(HtmlWidgetValidationError)
  })
})
