import { describe, expect, test } from "bun:test"
import { findSupersedingMermaidArtifactID } from "../src/components/chat/tools/render/mermaid/lib/supersession"

describe("mermaid supersession", () => {
  test("finds a later replacement artifact that supersedes the failed artifact", () => {
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
              metadata: {
                artifact: "RenderMermaidOutput",
                value: {
                  kind: "mermaid",
                  artifactID: "a".repeat(64),
                },
              },
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
              metadata: {
                artifact: "RenderMermaidOutput",
                value: {
                  kind: "mermaid",
                  artifactID: "b".repeat(64),
                  supersedesArtifactID: "a".repeat(64),
                },
              },
            },
          },
        ],
      },
    ]

    expect(findSupersedingMermaidArtifactID(messages, "a".repeat(64))).toBe("b".repeat(64))
    expect(findSupersedingMermaidArtifactID(messages, "b".repeat(64))).toBeUndefined()
  })
})
