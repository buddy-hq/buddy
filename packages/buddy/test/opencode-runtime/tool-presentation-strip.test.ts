import { describe, expect, test } from "bun:test"
import {
  stripBuddyToolPresentation,
  stripToolPresentationFromMessages,
  stripToolPresentationFromModelMessages,
} from "../../src/opencode-runtime/tool-presentation-strip"
import { parseJsonObject } from "../helpers/parse"

describe("tool-presentation-strip", () => {
  test("removes buddy.presentation and collapses empty buddy metadata", () => {
    expect(
      stripBuddyToolPresentation({
        buddy: { presentation: { archetype: "activity" } },
        other: 1,
      }),
    ).toEqual({ other: 1 })

    expect(
      stripBuddyToolPresentation({ buddy: { presentation: { archetype: "activity" } } }),
    ).toBeUndefined()
  })

  test("keeps other buddy fields", () => {
    expect(
      stripBuddyToolPresentation({
        buddy: { presentation: { archetype: "activity" }, other: "x" },
      }),
    ).toEqual({ buddy: { other: "x" } })
  })

  test("strips tool-part and state presentation metadata", () => {
    const messages = [
      {
        parts: [
          {
            type: "tool" as const,
            metadata: {
              buddy: { presentation: { archetype: "activity" } },
            },
            state: {
              status: "completed",
              metadata: {
                buddy: { presentation: { archetype: "activity" } },
              },
            },
          },
        ],
      },
    ]

    stripToolPresentationFromMessages(messages)

    const part = messages[0]?.parts[0]
    expect(part?.type).toBe("tool")
    if (part?.type !== "tool") {
      throw new Error("expected tool part")
    }
    expect(part.metadata).toBeUndefined()
    expect(part.state.metadata?.buddy).toBeUndefined()
  })

  test("strips presentation from provider metadata nodes", () => {
    const messages = [
      {
        role: "assistant" as const,
        parts: [
          {
            callProviderMetadata: {
              buddy: { presentation: { archetype: "activity" } },
            },
          },
        ],
      },
    ]

    const stripped = stripToolPresentationFromModelMessages(messages)
    const part = stripped[0]?.parts[0]
    expect(part).toBeDefined()
    const parsedPart = parseJsonObject(part)
    if (parsedPart === undefined) {
      throw new Error("expected model message part")
    }
    expect("callProviderMetadata" in parsedPart).toBe(false)
  })
})
