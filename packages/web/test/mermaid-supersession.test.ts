import { describe, expect, test } from "bun:test"
import { findSupersedingMermaidRevisionID } from "../src/components/media/renderers/mermaid/lib/supersession"

const MERMAID_OBJECT_ID = "object_1"

function createMermaidObjectResult(revisionID: string) {
  const ref = {
    kind: "mermaid",
    objectID: MERMAID_OBJECT_ID,
    revisionID,
    itemID: null,
  } as const

  return {
    buddyObjectResult: {
      version: 1,
      status: "ok",
      reason: null,
      message: "Rendered Mermaid diagram.",
      primaryRef: ref,
      objects: [
        {
          kind: "mermaid",
          objectID: MERMAID_OBJECT_ID,
          title: "Mermaid diagram",
          status: "ready",
          lifecycle: "revisioned",
          sourceRoot: null,
        },
      ],
      presentations: [
        {
          ref,
          viewID: "rendered",
          surface: "inline",
          data: {
            renderer: "mermaid",
            source: "graph TD\nA-->B",
            svgUrl: null,
            alt: "Mermaid diagram",
            caption: null,
            renderStatus: "ready",
            failedRenderKey: null,
          },
          autoOpen: null,
        },
      ],
    },
  }
}

describe("mermaid supersession", () => {
  test("finds a later replacement revision that supersedes the failed revision", () => {
    const messages = [
      {
        info: {
          id: "msg_old",
          role: "assistant",
          sessionID: "session_1",
          agent: "buddy",
          providerID: "openai",
          modelID: "gpt-5.5",
          time: { created: 1 },
        },
        parts: [
          {
            id: "part_old",
            type: "tool",
            tool: "render_mermaid",
            sessionID: "session_1",
            messageID: "msg_old",
            callID: "call_old",
            state: {
              status: "completed",
              input: {},
              output: "",
              title: "Mermaid diagram queued",
              time: { start: 1, end: 2 },
              metadata: createMermaidObjectResult("revision_a"),
            },
          },
        ],
      },
      {
        info: {
          id: "msg_new",
          role: "assistant",
          sessionID: "session_1",
          agent: "buddy",
          providerID: "openai",
          modelID: "gpt-5.5",
          time: { created: 2 },
        },
        parts: [
          {
            id: "part_new",
            type: "tool",
            tool: "render_mermaid",
            sessionID: "session_1",
            messageID: "msg_new",
            callID: "call_new",
            state: {
              status: "completed",
              input: {},
              output: "",
              title: "Mermaid diagram queued",
              time: { start: 2, end: 3 },
              metadata: createMermaidObjectResult("revision_b"),
            },
          },
        ],
      },
    ]

    expect(findSupersedingMermaidRevisionID(messages, MERMAID_OBJECT_ID, "revision_a")).toBe(
      "revision_b",
    )
    expect(
      findSupersedingMermaidRevisionID(messages, MERMAID_OBJECT_ID, "revision_b"),
    ).toBeUndefined()
    expect(findSupersedingMermaidRevisionID(messages, "other_object", "revision_b")).toBeUndefined()
  })

  test("does not supersede cards without a concrete current revision", () => {
    const messages = [
      {
        info: {
          id: "msg_new",
          role: "assistant",
          sessionID: "session_1",
          agent: "buddy",
          providerID: "openai",
          modelID: "gpt-5.5",
          time: { created: 1 },
        },
        parts: [
          {
            id: "part_new",
            type: "tool",
            tool: "render_mermaid",
            sessionID: "session_1",
            messageID: "msg_new",
            callID: "call_new",
            state: {
              status: "completed",
              input: {},
              output: "",
              title: "Mermaid diagram queued",
              time: { start: 1, end: 2 },
              metadata: createMermaidObjectResult("revision_b"),
            },
          },
        ],
      },
    ]

    expect(findSupersedingMermaidRevisionID(messages, MERMAID_OBJECT_ID, null)).toBeUndefined()
  })
})
