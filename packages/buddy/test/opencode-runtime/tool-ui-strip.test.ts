import { describe, expect, test } from "bun:test"
import {
  stripBuddyToolUi,
  stripToolUiFromMessages,
  stripToolUiFromModelMessages,
} from "../../src/opencode-runtime/tool-ui-strip"

describe("tool-ui-strip", () => {
  test("stripBuddyToolUi removes buddy.toolUi and collapses empty buddy", () => {
    expect(
      stripBuddyToolUi({
        buddy: { toolUi: { presentation: "hidden-summary" } },
        other: 1,
      }),
    ).toEqual({ other: 1 })

    expect(stripBuddyToolUi({ buddy: { toolUi: { presentation: "default" } } })).toBeUndefined()
  })

  test("stripBuddyToolUi keeps other buddy fields", () => {
    expect(
      stripBuddyToolUi({
        buddy: { toolUi: { presentation: "default" }, other: "x" },
      }),
    ).toEqual({ buddy: { other: "x" } })
  })

  test("stripToolUiFromMessages strips tool part metadata and state metadata", () => {
    const messages = [
      {
        parts: [
          {
            type: "tool" as const,
            metadata: {
              buddy: { toolUi: { presentation: "hidden-summary" as const } },
            },
            state: {
              status: "completed",
              metadata: {
                buddy: { toolUi: { labels: { idle: "Idle" } } },
              },
            },
          },
        ],
      },
    ]

    stripToolUiFromMessages(messages)

    const part = messages[0]?.parts[0]
    expect(part?.type).toBe("tool")
    if (part?.type !== "tool") {
      throw new Error("expected tool part")
    }
    expect(part.metadata).toBeUndefined()
    expect(part.state.metadata?.buddy).toBeUndefined()
  })

  test("stripToolUiFromModelMessages removes toolUi from provider metadata nodes", () => {
    const messages = [
      {
        role: "assistant" as const,
        parts: [
          {
            callProviderMetadata: {
              buddy: { toolUi: { presentation: "hidden-summary" as const } },
            },
          },
        ],
      },
    ]

    const stripped = stripToolUiFromModelMessages(messages)
    const part = stripped[0]?.parts[0]
    expect(part).toBeDefined()
    if (!part || typeof part !== "object") {
      throw new Error("expected model message part")
    }
    expect("callProviderMetadata" in part).toBe(false)
  })
})
