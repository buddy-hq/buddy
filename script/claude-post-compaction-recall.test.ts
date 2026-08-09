import { describe, expect, test } from "bun:test"
import { createClaudePostCompactionTranscriptBuilder } from "./claude-post-compaction-recall"

const SESSION_ID = "b29b5d6a-edcb-4101-9fbf-40078b741398"

describe("Claude post-compaction recall transcript", () => {
  test("preserves visible messages, images, and thinking while excluding tool noise", () => {
    const builder = createClaudePostCompactionTranscriptBuilder(SESSION_ID, "2026-08-09")

    builder.addRecord({
      message: {
        content: [
          { source: { media_type: "image/png", type: "base64" }, type: "image" },
          {
            text: "Design this with me\n<cu_window_hints>hidden UI state</cu_window_hints>",
            type: "text",
          },
        ],
        role: "user",
      },
      type: "user",
    })
    builder.addRecord({
      message: {
        content: [
          {
            signature: "thinking-signature-data",
            thinking: "I should inspect the flow.",
            type: "thinking",
          },
        ],
        role: "assistant",
      },
      type: "assistant",
    })
    builder.addRecord({
      message: {
        content: [{ id: "ordinary-tool", input: { command: "secret" }, type: "tool_use" }],
        role: "assistant",
      },
      type: "assistant",
    })
    builder.addRecord({
      message: {
        content: [
          { content: "secret tool output", tool_use_id: "ordinary-tool", type: "tool_result" },
        ],
        role: "user",
      },
      type: "user",
    })
    builder.addRecord({
      message: {
        content: [{ text: "Here is the grounded answer.", type: "text" }],
        role: "assistant",
      },
      type: "assistant",
    })

    const transcript = builder.finish()

    expect(transcript.markdown).toContain("I:\n[image/png attachment]\nU:\nDesign this with me")
    expect(transcript.markdown).toContain("T:\nI should inspect the flow.")
    expect(transcript.markdown).toContain("A:\nHere is the grounded answer.")
    expect(transcript.markdown).not.toContain("hidden UI state")
    expect(transcript.markdown).not.toContain("secret tool output")
    expect(transcript.markdown).not.toContain("thinking-signature-data")
    expect(transcript.markdown).not.toContain("\n\n")
    expect(transcript.stats).toEqual({
      assistantMessages: 1,
      entries: 4,
      imageAttachments: 1,
      questionAnswers: 0,
      questionDismissals: 0,
      questionPrompts: 0,
      redactedThinkingBlocks: 0,
      skippedTrailingRecord: false,
      thinkingBlocks: 1,
      userMessages: 1,
    })
  })

  test("preserves structured questions and extracts submitted answers without wrapper text", () => {
    const builder = createClaudePostCompactionTranscriptBuilder(SESSION_ID)

    builder.addRecord({
      message: {
        content: [
          {
            id: "question-tool",
            input: {
              questions: [
                {
                  header: "Placement",
                  multiSelect: false,
                  options: [
                    { description: "Keep it at the live end.", label: "Tail row" },
                  ],
                  question: "Where should the busy status appear?",
                },
              ],
            },
            name: "AskUserQuestion",
            type: "tool_use",
          },
        ],
        role: "assistant",
      },
      type: "assistant",
    })
    builder.addRecord({
      message: {
        content: [
          {
            content:
              'Your questions have been answered: "Where should the busy status appear?"="Tail row". You can now continue with these answers in mind.',
            tool_use_id: "question-tool",
            type: "tool_result",
          },
        ],
        role: "user",
      },
      type: "user",
    })

    const transcript = builder.finish()

    expect(transcript.markdown).toContain(
      "Q:\n[Placement] Where should the busy status appear?\n1. Tail row — Keep it at the live end.",
    )
    expect(transcript.markdown).toContain("R:\nTail row")
    expect(transcript.markdown).not.toContain("You can now continue")
    expect(transcript.stats.questionPrompts).toBe(1)
    expect(transcript.stats.questionAnswers).toBe(1)
  })

  test("records dismissed questions and unavailable redacted thinking compactly", () => {
    const builder = createClaudePostCompactionTranscriptBuilder(SESSION_ID)

    builder.addRecord({
      message: {
        content: [
          {
            id: "question-tool",
            input: {
              questions: [
                {
                  multiSelect: false,
                  options: [{ description: "Proceed now.", label: "Proceed" }],
                  question: "Continue?",
                },
              ],
            },
            name: "AskUserQuestion",
            type: "tool_use",
          },
          { data: "encrypted", type: "redacted_thinking" },
        ],
        role: "assistant",
      },
      type: "assistant",
    })
    builder.addRecord({
      message: {
        content: [
          {
            content: "The user doesn't want to proceed with this tool use.",
            is_error: true,
            tool_use_id: "question-tool",
            type: "tool_result",
          },
        ],
        role: "user",
      },
      type: "user",
    })

    const transcript = builder.finish(true)

    expect(transcript.markdown).toContain("T:\n[redacted by Claude]")
    expect(transcript.markdown).toContain("R:\n[dismissed]")
    expect(transcript.markdown).toContain("trailing-jsonl=skipped")
    expect(transcript.stats.questionDismissals).toBe(1)
    expect(transcript.stats.redactedThinkingBlocks).toBe(1)
  })
})
