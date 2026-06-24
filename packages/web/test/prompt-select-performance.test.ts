import { describe, expect, test } from "bun:test"

import {
  getPromptSelectPerformanceSummary,
  PROMPT_SELECT_ANALYSIS_TURN_WINDOW,
  PROMPT_SELECT_MERMAID_RENDER_THRESHOLD,
} from "../src/components/prompt/prompt-select-performance"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
} from "./test-utils"

function createTextMessage(input: { id: string; role: "user" | "assistant"; text: string }) {
  const info =
    input.role === "user"
      ? createUserMessageInfo({
          id: input.id,
          sessionID: "session-1",
        })
      : createAssistantMessageInfo({
          id: input.id,
          sessionID: "session-1",
        })

  return createMessageWithParts(info, [
    {
      id: `${input.id}:part`,
      sessionID: "session-1",
      messageID: input.id,
      type: "text",
      text: input.text,
    },
  ])
}

describe("prompt select performance", () => {
  test("keeps radix selects for normal chats", () => {
    const summary = getPromptSelectPerformanceSummary([
      createTextMessage({
        id: "user-1",
        role: "user",
        text: "Can you explain Green's theorem in plain language?",
      }),
      createTextMessage({
        id: "assistant-1",
        role: "assistant",
        text: "Sure. Green's theorem relates a line integral around a closed curve to a double integral over the region inside it.",
      }),
    ])

    expect(summary.shouldPreferNativeSelects).toBe(false)
  })

  test("keeps radix selects for very long plain-text chats", () => {
    const longPlainText = Array.from({ length: 4_500 }, () => "plain-text-token").join(" ")

    const summary = getPromptSelectPerformanceSummary([
      createTextMessage({
        id: "user-1",
        role: "user",
        text: "Give me a long prose answer with no equations or diagrams.",
      }),
      createTextMessage({
        id: "assistant-1",
        role: "assistant",
        text: longPlainText,
      }),
    ])

    expect(summary.analyzedTextLength).toBeGreaterThan(50_000)
    expect(summary.mathSignalCount).toBe(0)
    expect(summary.mermaidSignalCount).toBe(0)
    expect(summary.shouldPreferNativeSelects).toBe(false)
  })

  test("prefers native selects for long math-heavy chats", () => {
    const heavyMathChunk = Array.from(
      { length: 420 },
      () =>
        String.raw`$$\mathcal{L}_{\text{QED}} = \bar{\psi}(i\gamma^\mu \partial_\mu - m)\psi - \frac{1}{4}F_{\mu\nu}F^{\mu\nu}$$`,
    ).join("\n\n")

    const summary = getPromptSelectPerformanceSummary([
      createTextMessage({
        id: "user-1",
        role: "user",
        text: "Dump the advanced field theory reference sheet.",
      }),
      createTextMessage({
        id: "assistant-1",
        role: "assistant",
        text: heavyMathChunk,
      }),
    ])

    expect(summary.mathSignalCount).toBeGreaterThanOrEqual(400)
    expect(summary.renderHeavySignalScore).toBeGreaterThan(0)
    expect(summary.shouldPreferNativeSelects).toBe(true)
  })

  test("keeps radix selects for moderately mermaid-heavy chats", () => {
    const mermaidBlock = [
      "```mermaid",
      "flowchart TD",
      "  A[Start] --> B{Decision}",
      "  B -->|Yes| C[Render]",
      "  B -->|No| D[Fallback]",
      "```",
    ].join("\n")
    const repeatedMermaid = Array.from({ length: 4 }, () => mermaidBlock).join("\n\n")

    const summary = getPromptSelectPerformanceSummary([
      createTextMessage({
        id: "assistant-1",
        role: "assistant",
        text: repeatedMermaid,
      }),
    ])

    expect(summary.mermaidSignalCount).toBe(4)
    expect(summary.shouldPreferNativeSelects).toBe(false)
  })

  test("prefers native selects for mermaid-heavy chats", () => {
    const mermaidBlock = [
      "```mermaid",
      "flowchart TD",
      "  A[Start] --> B{Decision}",
      "  B -->|Yes| C[Render]",
      "  B -->|No| D[Fallback]",
      "```",
    ].join("\n")
    const repeatedMermaid = Array.from(
      { length: PROMPT_SELECT_MERMAID_RENDER_THRESHOLD },
      () => mermaidBlock,
    ).join("\n\n")

    const summary = getPromptSelectPerformanceSummary([
      createTextMessage({
        id: "assistant-1",
        role: "assistant",
        text: repeatedMermaid,
      }),
    ])

    expect(summary.mermaidSignalCount).toBe(PROMPT_SELECT_MERMAID_RENDER_THRESHOLD)
    expect(summary.shouldPreferNativeSelects).toBe(true)
  })

  test("ignores heavy render history outside the recent analysis window", () => {
    const mermaidBlock = [
      "```mermaid",
      "flowchart TD",
      "  A[Start] --> B{Decision}",
      "  B -->|Yes| C[Render]",
      "  B -->|No| D[Fallback]",
      "```",
    ].join("\n")
    const messages = Array.from({ length: 30 }, (_, index) =>
      createTextMessage({
        id: `assistant-${index + 1}`,
        role: "assistant",
        text: index < 4 ? mermaidBlock : "Plain follow-up text with no diagrams or equations.",
      }),
    )

    const summary = getPromptSelectPerformanceSummary(messages)

    expect(summary.turnCount).toBe(30)
    expect(summary.analyzedTurnCount).toBe(PROMPT_SELECT_ANALYSIS_TURN_WINDOW)
    expect(summary.mermaidSignalCount).toBe(0)
    expect(summary.shouldPreferNativeSelects).toBe(false)
  })
})
