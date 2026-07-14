import { describe, expect, test } from "bun:test"
import {
  shouldClearMarkdownMermaidObject,
  shouldDelayMarkdownMermaidSegment,
  shouldStartMarkdownMermaidAutoRepair,
} from "../src/components/markdown/markdown-mermaid-segment"
import { canContainMermaidBlock } from "../src/components/markdown/Markdown"
import { parseMarkdownSegments } from "../src/components/markdown/markdown-segments"
import type { ObjectMermaidReadSourceResponse } from "@buddy/sdk/types"

function createMermaidObject(
  overrides: Partial<ObjectMermaidReadSourceResponse> = {},
): ObjectMermaidReadSourceResponse {
  return {
    objectID: "object",
    revisionID: "revision",
    kind: "mermaid",
    title: "Mermaid diagram",
    origin: {
      kind: "markdown",
      sessionID: "ses_test",
      messageID: "msg_test",
      partID: "prt_test",
      segmentIndex: 1,
    },
    diagramType: "flowchart",
    alt: "Mermaid diagram",
    sourceHash: "hash",
    source: "flowchart TD\nA-->B",
    preflightRepairs: [],
    autoRepair: {
      status: "eligible",
      attempts: 0,
    },
    renderStatus: "error",
    repairOfObjectID: null,
    supersedesRevisionID: null,
    replacementRevisionID: null,
    ...overrides,
  }
}

describe("markdown mermaid segments", () => {
  test("extracts closed mermaid fences into stable segments", () => {
    const segments = parseMarkdownSegments("Before\n\n```mermaid\ngraph TD\nA-->B\n```\n\nAfter")

    expect(segments).toEqual([
      {
        kind: "html",
        markdown: "Before\n",
        segmentIndex: 0,
      },
      {
        kind: "mermaid",
        source: "graph TD\nA-->B",
        raw: "```mermaid\ngraph TD\nA-->B\n```",
        segmentIndex: 1,
      },
      {
        kind: "html",
        markdown: "\nAfter",
        segmentIndex: 2,
      },
    ])
  })

  test("preflight detection allows CommonMark-indented mermaid fences", () => {
    expect(canContainMermaidBlock("Before\n   ```mermaid\ngraph TD\nA-->B\n   ```")).toBe(true)
  })

  test("preserves line endings while applying CommonMark fence indentation", () => {
    const segments = parseMarkdownSegments("   ```mermaid\r\n   graph TD\r\n  A-->B\r\n   ```")

    expect(segments).toEqual([
      {
        kind: "mermaid",
        source: "graph TD\r\nA-->B",
        raw: "   ```mermaid\r\n   graph TD\r\n  A-->B\r\n   ```",
        segmentIndex: 0,
      },
    ])
  })

  test("keeps unclosed mermaid fences in html output", () => {
    const segments = parseMarkdownSegments("Start\n```mermaid\ngraph TD\nA-->B")

    expect(segments).toEqual([
      {
        kind: "html",
        markdown: "Start\n```mermaid\ngraph TD\nA-->B",
        segmentIndex: 0,
      },
    ])
  })

  test("keeps a completed mermaid segment ready while later prose streams", () => {
    expect(
      shouldDelayMarkdownMermaidSegment({
        isStreaming: true,
        readySourceIdentity: "message:mermaid:1\u0000graph TD\nA-->B",
        sourceIdentity: "message:mermaid:1\u0000graph TD\nA-->B",
      }),
    ).toBe(false)
  })

  test("delays a new streaming mermaid source until it stabilizes", () => {
    expect(
      shouldDelayMarkdownMermaidSegment({
        isStreaming: true,
        readySourceIdentity: "message:mermaid:1\u0000graph TD\nA-->B",
        sourceIdentity: "message:mermaid:1\u0000graph TD\nA-->C",
      }),
    ).toBe(true)
  })

  test("clears stale markdown mermaid objects when the source changes", () => {
    expect(
      shouldClearMarkdownMermaidObject({
        requestedSource: "graph TD\nA-->B",
        nextSource: "graph TD\nA-->C",
      }),
    ).toBe(true)
  })

  test("keeps markdown mermaid object state for the same source", () => {
    expect(
      shouldClearMarkdownMermaidObject({
        requestedSource: "graph TD\nA-->B",
        nextSource: "graph TD\nA-->B",
      }),
    ).toBe(false)
  })

  test("does not clear when preflight rewrites the object source for the same requested source", () => {
    expect(
      shouldClearMarkdownMermaidObject({
        requestedSource: "erDiagram\nA ||--o| B : one to many",
        nextSource: "erDiagram\nA ||--o| B : one to many",
      }),
    ).toBe(false)
  })

  test("starts inline auto repair for persisted failed renders when eligible", () => {
    expect(
      shouldStartMarkdownMermaidAutoRepair({
        object: createMermaidObject(),
        renderFailure: {
          message: "Failed before reload",
          persisted: true,
          renderKey: "render_key",
        },
      }),
    ).toBe(true)
  })
})
