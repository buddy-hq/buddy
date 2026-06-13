import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import {
  ARTIFACT_CONTENT_DIRECTORIES,
  ARTIFACT_KINDS,
  ArtifactPath,
} from "../../src/artifacts"
import {
  createToolMermaidArtifact,
  readMermaidRenderRecord,
  storeMermaidRenderRecord,
} from "../../src/learning/features/diagrams/service/store"
import { tmpdir } from "../helpers/tmpdir"

const RENDER_INPUT = {
  themeSignature: "theme",
  rendererVersion: "1.0.0",
  renderConfigVersion: 1,
  contrastAdjustments: [],
}
const UNSAFE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" onclick="alert('xss')">
  <script>alert('xss')</script>
  <a href="javascript:alert('xss')"><text>Unsafe</text></a>
  <a xlink:href="java&#x0a;script&#58;alert('xss')"><text>Encoded unsafe</text></a>
  <a href="data&#58;text/html,alert('xss')"><text>HTML data</text></a>
  <foreignObject width="100" height="40">
    <div xmlns="http://www.w3.org/1999/xhtml" onmouseover="alert('xss')">Label</div>
  </foreignObject>
</svg>`

describe("Mermaid render record sanitization", () => {
  test("sanitizes rendered SVGs on write and legacy reload", async () => {
    await using project = await tmpdir({ git: true })
    const artifact = await createToolMermaidArtifact({
      directory: project.path,
      sessionID: "ses_mermaid_sanitize",
      messageID: "msg_mermaid_sanitize",
      callID: "call_mermaid_sanitize",
      alt: "Unsafe diagram",
      source: "flowchart LR\nA-->B",
    })

    const stored = await storeMermaidRenderRecord(project.path, artifact.artifactID, {
      ...RENDER_INPUT,
      status: "rendered",
      svg: UNSAFE_SVG,
    })

    expect(stored.status).toBe("rendered")
    if (stored.status !== "rendered") return
    expect(stored.svg).not.toContain("<script")
    expect(stored.svg).not.toContain("onclick=")
    expect(stored.svg).not.toContain("onmouseover=")
    expect(stored.svg).not.toContain("javascript:")
    expect(stored.svg).not.toContain("java&#x0a;script")
    expect(stored.svg).not.toContain("data&#58;text/html")
    expect(stored.svg).toContain("<foreignObject")

    await fs.writeFile(
      ArtifactPath.artifactFile(
        project.path,
        ARTIFACT_KINDS.mermaid,
        artifact.artifactID,
        path.join(
          ARTIFACT_CONTENT_DIRECTORIES.mermaidRenders,
          `${stored.renderKey}.json`,
        ),
      ),
      `${JSON.stringify({ ...stored, svg: UNSAFE_SVG }, null, 2)}\n`,
      "utf8",
    )
    const reloaded = await readMermaidRenderRecord(
      project.path,
      artifact.artifactID,
      stored.renderKey,
    )

    expect(reloaded.status).toBe("rendered")
    if (reloaded.status !== "rendered") return
    expect(reloaded.svg).not.toContain("<script")
    expect(reloaded.svg).not.toContain("onclick=")
    expect(reloaded.svg).not.toContain("onmouseover=")
    expect(reloaded.svg).not.toContain("javascript:")
    expect(reloaded.svg).not.toContain("java&#x0a;script")
    expect(reloaded.svg).not.toContain("data&#58;text/html")
    expect(reloaded.svg).toContain("<foreignObject")
  })
})
